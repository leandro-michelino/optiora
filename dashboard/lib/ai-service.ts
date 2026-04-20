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

function normalizePrivateKeyPem(rawValue: string): string {
  return rawValue.replace(/\\n/g, '\n').trim();
}

function resolvePrivateKeyPem(): string {
  const inlineKey = process.env.OCI_PRIVATE_KEY?.trim();
  if (inlineKey) {
    return normalizePrivateKeyPem(inlineKey);
  }

  const configuredPath = process.env.OCI_PRIVATE_KEY_PATH?.trim();
  if (configuredPath) {
    const expandedPath = configuredPath.startsWith('~/')
      ? `${os.homedir()}${configuredPath.slice(1)}`
      : configuredPath;
    return fs.readFileSync(expandedPath, 'utf8').trim();
  }

  throw new Error('OCI_PRIVATE_KEY or OCI_PRIVATE_KEY_PATH is not configured');
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
  const endpoint = required('OCI_GENAI_ENDPOINT', process.env.OCI_GENAI_ENDPOINT);
  const model = required('OCI_GENAI_MODEL', process.env.OCI_GENAI_MODEL);
  required('OCI_REGION', process.env.OCI_REGION);
  const tenancyOcid = required('OCI_TENANCY_OCID', process.env.OCI_TENANCY_OCID);
  const userOcid = required('OCI_USER_OCID', process.env.OCI_USER_OCID);
  const fingerprint = required('OCI_FINGERPRINT', process.env.OCI_FINGERPRINT);
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
    compartmentId: required('OCI_COMPARTMENT_OCID', process.env.OCI_COMPARTMENT_OCID),
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
    return await callOCIGenAI(message, conversationHistory);
  } catch (error) {
    console.error('OCI GenAI error:', error);
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to get AI response');
  }
}
