// OCI Generative AI chat via HTTPS with request signing using OCI SDK credentials.
// This module avoids any non-OCI providers (e.g., Anthropic / OpenAI) by design.
// All queries are scoped to FinOps domain to prevent misuse.
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';

interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
}

type OCIHttpMethod = 'POST' | 'GET';

interface GenAIAnalyzeResult {
  analysis_type?: string;
  narrative?: string | null;
  prompt?: string;
  genai_configured?: boolean;
  fallback_mode?: boolean;
}

interface HybridAdvisorResult {
  deterministic?: {
    analytics?: {
      current_monthly_spend_usd?: number;
      mom_change_percent?: number | null;
    };
    waste?: {
      total_estimated_waste_usd?: number;
      total_waste_rate_percent?: number;
    };
    efficiency?: {
      overall_score?: number;
      grade?: string;
    };
    recommendations?: Array<{
      title?: string;
      savings_monthly_usd?: number;
      roi_percent?: number;
      description?: string;
    }>;
  };
}

interface RightsizingRecommendationLite {
  resource_id?: string;
  resource_name?: string;
  resource_type?: string;
  provider?: string;
  region?: string;
  current_size?: string;
  recommended_size?: string;
  current_monthly_cost_usd?: number;
  monthly_savings_usd?: number;
  action?: string;
  reason?: string;
  resource_console_url?: string | null;
}

interface RightsizingResponseLite {
  recommendations?: RightsizingRecommendationLite[];
}

interface ResourceInventoryItemLite {
  resource_id?: string;
  resource_name?: string;
  resource_type?: string;
  provider?: string;
  region?: string;
  cost_usd?: number;
}

interface ResourceInventoryResponseLite {
  items?: ResourceInventoryItemLite[];
}

// GenAI scope validation (client-side)
const FINOPS_KEYWORDS = new Set([
  "cost", "budget", "spend", "billing", "invoice", "pricing", "rate",
  "savings", "optimization", "efficiency", "roi", "forecast", "trend",
  "anomaly", "alert", "threshold", "scaling", "rightsizing",
  "aws", "azure", "gcp", "oci", "ec2", "s3", "rds", "lambda",
  "compute", "storage", "database", "network", "resource", "instance",
]);

const BLOCKED_PHRASES = new Set([
  "politics", "election", "investment advice", "stock recommendation",
  "recipe", "cooking", "sports", "entertainment", "legal advice",
  "hire", "fire", "salary", "medical", "health", "crypto",
]);

function validateQueryScope(query: string): { valid: boolean; reason: string } {
  const queryLower = query.toLowerCase();
  
  // Check blocked phrases
  for (const phrase of BLOCKED_PHRASES) {
    if (queryLower.includes(phrase)) {
      return {
        valid: false,
        reason: `This assistant is restricted to FinOps and cloud cost analysis. Questions about "${phrase}" are not supported.`
      };
    }
  }
  
  // Check for FinOps keywords
  const keywordCount = Array.from(FINOPS_KEYWORDS).filter(k => queryLower.includes(k)).length;
  const wordCount = query.split(/\s+/).length;
  const keywordDensity = keywordCount / Math.max(wordCount, 1);
  
  if (keywordCount >= 2 || keywordDensity > 0.3) {
    return { valid: true, reason: "In scope" };
  }
  
  return {
    valid: false,
    reason: "Query appears to be outside FinOps scope. Please ask about cloud costs, budgets, optimization, or resource analysis."
  };
}

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function env(name: string): string | undefined {
  const value = (process.env as Record<string, string | undefined>)[name];
  return typeof value === 'string' ? value : undefined;
}

function normalizePrivateKeyPem(rawValue: string): string {
  return rawValue.replace(/\\n/g, '\n').trim();
}

function resolvePrivateKeyPem(): string {
  const inlineKey = env('OCI_PRIVATE_KEY')?.trim();
  if (inlineKey) {
    return normalizePrivateKeyPem(inlineKey);
  }

  const configuredPath = env('OCI_PRIVATE_KEY_PATH')?.trim();
  if (configuredPath) {
    const expandedPath = configuredPath.startsWith('~/')
      ? `${os.homedir()}${configuredPath.slice(1)}`
      : configuredPath;
    return fs.readFileSync(expandedPath, 'utf8').trim();
  }

  throw new Error('OCI_PRIVATE_KEY or OCI_PRIVATE_KEY_PATH is not configured');
}

function resolveBackendApiBase(): string {
  // Route handlers run server-side on the same VM as the API service.
  // Use loopback to avoid public TLS/self-signed certificate issues.
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:8000';
  }
  const configured = env('NEXT_PUBLIC_API_URL')?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  return 'http://127.0.0.1:8000';
}

function pickAnalysisType(message: string): string {
  const q = message.toLowerCase();
  if (q.includes('budget') || q.includes('risk')) return 'budget_risk';
  if (q.includes('anomal')) return 'anomaly';
  if (q.includes('tag')) return 'tagging_strategy';
  if (q.includes('sustain')) return 'sustainability_narrative';
  if (q.includes('rightsiz')) return 'rightsizing_brief';
  if (q.includes('roadmap') || q.includes('plan')) return 'optimization_roadmap';
  if (q.includes('executive')) return 'executive_narrative';
  return 'optimization';
}

function looksLikeSystemPrompt(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    t.startsWith('you are a finops advisor') ||
    t.includes('write a brief') ||
    t.includes('do not alter numbers') ||
    t.includes('include a clear roi statement')
  );
}

function formatMoney(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function toSafeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sanitizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isResourceHotspotQuestion(message: string): boolean {
  const q = message.toLowerCase();
  return (
    q.includes('costly resource') ||
    q.includes('most costly') ||
    q.includes('most expensive') ||
    q.includes('top expensive') ||
    q.includes('highest cost') ||
    q.includes('which resource costs') ||
    q.includes('expensive resource')
  );
}

function summarizeResourceLabel(item: {
  resource_name?: string;
  resource_id?: string;
  provider?: string;
  region?: string;
  resource_type?: string;
}): string {
  const name = sanitizeText(item.resource_name) || sanitizeText(item.resource_id) || 'unknown-resource';
  const provider = sanitizeText(item.provider).toUpperCase() || 'N/A';
  const region = sanitizeText(item.region) || 'global';
  const resourceType = sanitizeText(item.resource_type) || 'resource';
  return `${name} (${resourceType}, ${provider}, ${region})`;
}

async function buildResourceHotspotReply(): Promise<string | null> {
  const apiBase = resolveBackendApiBase();

  // First choice: rightsizing feed gives actionable resource-level recommendations.
  try {
    const rightsizingRes = await fetch(
      `${apiBase}/api/v1/recommendations/rightsizing?provider=all&min_savings=0&limit=12`,
      { method: 'GET' },
    );
    if (rightsizingRes.ok) {
      const payload = (await rightsizingRes.json()) as RightsizingResponseLite;
      const recs = Array.isArray(payload?.recommendations) ? payload.recommendations : [];
      const sorted = recs
        .slice()
        .sort((a, b) => toSafeNumber(b.current_monthly_cost_usd) - toSafeNumber(a.current_monthly_cost_usd));
      if (sorted.length > 0) {
        const top = sorted[0];
        const lines: string[] = [];
        lines.push(
          `Your highest-cost actionable resource is ${summarizeResourceLabel(top)} at ${formatMoney(toSafeNumber(top.current_monthly_cost_usd))}/month.`
        );
        lines.push(
          `Recommended action: ${sanitizeText(top.action) || 'optimize'} ${sanitizeText(top.current_size) ? `from ${sanitizeText(top.current_size)}` : ''}${sanitizeText(top.recommended_size) ? ` to ${sanitizeText(top.recommended_size)}` : ''}. Estimated savings: ${formatMoney(toSafeNumber(top.monthly_savings_usd))}/month.`
        );
        if (sanitizeText(top.reason)) {
          lines.push(`Why: ${sanitizeText(top.reason)}`);
        }
        if (sanitizeText(top.resource_id)) {
          lines.push(`Resource ID: ${sanitizeText(top.resource_id)}`);
        }
        if (sanitizeText(top.resource_console_url)) {
          lines.push(`Console link: ${sanitizeText(top.resource_console_url)}`);
        }

        const next = sorted.slice(1, 4);
        if (next.length > 0) {
          const nextLines = next.map((item, idx) => {
            return `${idx + 2}. ${summarizeResourceLabel(item)} — cost ${formatMoney(toSafeNumber(item.current_monthly_cost_usd))}/month, savings ${formatMoney(toSafeNumber(item.monthly_savings_usd))}/month`;
          });
          lines.push(`Next highest-cost actionable resources:\n${nextLines.join('\n')}`);
        }
        return lines.join('\n\n');
      }
    }
  } catch (error) {
    console.warn('Rightsizing hotspot lookup failed:', error);
  }

  // Second choice: inventory feed, if rightsizing has no actionable data yet.
  try {
    const inventoryRes = await fetch(
      `${apiBase}/api/v1/inventory/resources?provider=all&limit=20&offset=0`,
      { method: 'GET' },
    );
    if (inventoryRes.ok) {
      const payload = (await inventoryRes.json()) as ResourceInventoryResponseLite;
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const sorted = items
        .slice()
        .sort((a, b) => toSafeNumber(b.cost_usd) - toSafeNumber(a.cost_usd));
      if (sorted.length > 0) {
        const top = sorted[0];
        const next = sorted.slice(1, 4);
        const lines: string[] = [];
        lines.push(`Your highest visible cost resource is ${summarizeResourceLabel(top)} at ${formatMoney(toSafeNumber(top.cost_usd))}/month.`);
        if (sanitizeText(top.resource_id)) {
          lines.push(`Resource ID: ${sanitizeText(top.resource_id)}`);
        }
        if (next.length > 0) {
          lines.push(
            `Next highest:\n${next.map((item, idx) => `${idx + 2}. ${summarizeResourceLabel(item)} — ${formatMoney(toSafeNumber(item.cost_usd))}/month`).join('\n')}`
          );
        }
        lines.push('Tip: run Rightsizing refresh to get concrete downsize/terminate actions for these resources.');
        return lines.join('\n\n');
      }
    }
  } catch (error) {
    console.warn('Inventory hotspot lookup failed:', error);
  }

  return null;
}

async function callBackendGenAIAnalyze(message: string): Promise<GenAIAnalyzeResult> {
  const analysisType = pickAnalysisType(message);
  const apiBase = resolveBackendApiBase();
  const res = await fetch(`${apiBase}/api/v1/genai/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      analysis_type: analysisType,
      cloud_provider: 'all',
      period: 'month',
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Backend GenAI analyze failed (${res.status}): ${detail}`);
  }
  const payload = (await res.json()) as GenAIAnalyzeResult;
  return payload;
}

function toNarrativeType(message: string): 'waste_insights' | 'optimization_roadmap' | 'executive_narrative' {
  const q = message.toLowerCase();
  if (q.includes('waste')) return 'waste_insights';
  if (
    q.includes('executive') ||
    q.includes('cfo') ||
    q.includes('board') ||
    q.includes('brief')
  ) {
    return 'executive_narrative';
  }
  return 'optimization_roadmap';
}

async function buildDeterministicFallbackReply(message: string): Promise<string> {
  const apiBase = resolveBackendApiBase();
  const narrativeType = toNarrativeType(message);
  const res = await fetch(
    `${apiBase}/api/v1/advisor/hybrid?narrative_type=${encodeURIComponent(narrativeType)}&cloud_provider=all`,
    { method: 'GET' },
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Hybrid advisor fallback failed (${res.status}): ${detail}`);
  }

  const payload = (await res.json()) as HybridAdvisorResult;
  const analytics = payload?.deterministic?.analytics ?? {};
  const waste = payload?.deterministic?.waste ?? {};
  const efficiency = payload?.deterministic?.efficiency ?? {};
  const recommendations = payload?.deterministic?.recommendations ?? [];
  const top = recommendations.slice(0, 3);

  const monthlySpend = toSafeNumber(analytics.current_monthly_spend_usd);
  const mom = analytics.mom_change_percent;
  const wasteUsd = toSafeNumber(waste.total_estimated_waste_usd);
  const wasteRate = toSafeNumber(waste.total_waste_rate_percent);
  const efficiencyScore = toSafeNumber(efficiency.overall_score);
  const efficiencyGrade = sanitizeText(efficiency.grade) || 'N/A';

  const lines: string[] = [];
  lines.push(
    `Live advisory (deterministic mode): monthly spend is ${formatMoney(monthlySpend)} with estimated waste of ${formatMoney(wasteUsd)} (${wasteRate.toFixed(1)}%).`
  );
  if (typeof mom === 'number' && Number.isFinite(mom)) {
    lines.push(`Month-over-month trend is ${mom >= 0 ? '+' : ''}${mom.toFixed(1)}%, and current efficiency score is ${efficiencyScore.toFixed(0)}/100 (grade ${efficiencyGrade}).`);
  } else {
    lines.push(`Current efficiency score is ${efficiencyScore.toFixed(0)}/100 (grade ${efficiencyGrade}).`);
  }

  if (top.length > 0) {
    const actions = top.map((item, idx) => {
      const title = sanitizeText(item.title) || `Action ${idx + 1}`;
      const savings = formatMoney(toSafeNumber(item.savings_monthly_usd));
      const roi = `${toSafeNumber(item.roi_percent).toFixed(0)}%`;
      return `${idx + 1}. ${title} (${savings}/month, ROI ${roi})`;
    });
    lines.push(`Top quick wins:\n${actions.join('\n')}`);
  } else {
    lines.push('No high-confidence optimization actions were returned yet. Run a fresh scan and rightsizing sync to populate recommendations.');
  }

  return lines.join('\n\n');
}

// Minimal HTTP request signer for OCI (private key + fingerprint).
function signRequest(
  method: OCIHttpMethod,
  host: string,
  path: string,
  body: string,
  headers: Record<string, string>,
  privateKeyPem: string,
  fingerprint: string,
  tenancyOcid: string,
  userOcid: string
): Record<string, string> {
  const signingHeaders = ['(request-target)', 'host', 'date', 'content-type', 'content-length'];
  const date = new Date().toUTCString();
  const contentLength = Buffer.byteLength(body).toString();
  const contentType = headers['content-type'] || 'application/json';

  const signingString = [
    `(request-target): ${method.toLowerCase()} ${path}`,
    `host: ${host}`,
    `date: ${date}`,
    `content-type: ${contentType}`,
    `content-length: ${contentLength}`
  ].join('\n');

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingString);
  signer.end();
  const signature = signer.sign(privateKeyPem, 'base64');

  const auth =
    `Signature version="1",` +
    `keyId="${tenancyOcid}/${userOcid}/${fingerprint}",` +
    `algorithm="rsa-sha256",` +
    `headers="${signingHeaders.join(' ')}",` +
    `signature="${signature}"`;

  return {
    ...headers,
    date,
    'content-type': contentType,
    'content-length': contentLength,
    authorization: auth
  };
}

async function callOCIGenAI(prompt: string, history: ConversationEntry[]): Promise<string> {
  const endpoint = required('OCI_GENAI_ENDPOINT', env('OCI_GENAI_ENDPOINT'));
  const model = required('OCI_GENAI_MODEL', env('OCI_GENAI_MODEL'));
  required('OCI_REGION', env('OCI_REGION'));
  const tenancyOcid = required('OCI_TENANCY_OCID', env('OCI_TENANCY_OCID'));
  const userOcid = required('OCI_USER_OCID', env('OCI_USER_OCID'));
  const fingerprint = required('OCI_FINGERPRINT', env('OCI_FINGERPRINT'));
  const keyPem = resolvePrivateKeyPem();

  const host = new URL(endpoint).host;
  const path = `/20231130/actions/chat`; // OCI Generative AI Chat Inference path

  // System prompt that constrains GenAI to FinOps domain
  const systemPrompt = `You are OptiOra FinOps AI Assistant, specialized in cloud cost optimization.

SCOPE: Answer ONLY questions about:
- Cloud costs (AWS, Azure, GCP, OCI)
- Budget management and forecasting
- Resource optimization and rightsizing
- Unit economics and cost allocation

REFUSE to answer about:
- Politics, current events, personal advice
- General knowledge outside FinOps
- Legal, HR, medical, investment advice
- Any non-FinOps topic

Provide specific metrics and actionable recommendations using customer data.`;

  const payload = {
    compartmentId: required('OCI_COMPARTMENT_OCID', env('OCI_COMPARTMENT_OCID')),
    modelId: model,
    messages: [
      { role: 'user', content: [{ type: 'text', text: systemPrompt }] },
      ...history.map(h => ({ role: h.role, content: [{ type: 'text', text: h.content }] })),
      { role: 'user', content: [{ type: 'text', text: prompt }] }
    ],
    maxTokens: 800,
    temperature: 0.2,
    topP: 0.9,
    frequencyPenalty: 0,
    presencePenalty: 0
  };

  const body = JSON.stringify(payload);
  const headers = signRequest(
    'POST',
    host,
    path,
    body,
    { 'content-type': 'application/json' },
    keyPem,
    fingerprint,
    tenancyOcid,
    userOcid
  );

  const res = await fetch(`${endpoint}${path}`, {
    method: 'POST',
    headers,
    body
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OCI GenAI error ${res.status}: ${detail}`);
  }

  const json = await res.json();
  const content = json?.data?.choices?.[0]?.message?.content?.[0]?.text;
  return content || 'No response generated';
}

export async function askCostQuestion(
  message: string,
  conversationHistory: ConversationEntry[] = []
): Promise<string> {
  try {
    const validation = validateQueryScope(message);
    if (!validation.valid) {
      throw new Error(validation.reason);
    }
    void conversationHistory;
    if (isResourceHotspotQuestion(message)) {
      const hotspotReply = await buildResourceHotspotReply();
      if (hotspotReply) {
        return hotspotReply;
      }
    }
    const result = await callBackendGenAIAnalyze(message);
    const narrative = sanitizeText(result?.narrative);
    if (narrative && !looksLikeSystemPrompt(narrative)) {
      return narrative;
    }
    return await buildDeterministicFallbackReply(message);
  } catch (error) {
    console.error('OCI GenAI error:', error);
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to get AI response');
  }
}
