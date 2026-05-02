// OCI Generative AI chat via HTTPS with request signing using OCI SDK credentials.
// This module avoids any non-OCI providers (e.g., Anthropic / OpenAI) by design.
// Query scope is cloud services + FinOps domain.
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';

interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
}

type SupportedLanguage = 'en' | 'pt' | 'es' | 'fr' | 'de' | 'it';

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
  service?: string;
  provider?: string;
  region?: string;
  cost_usd?: number;
}

interface ResourceInventoryResponseLite {
  items?: ResourceInventoryItemLite[];
}

interface ServiceHotspotItemLite {
  provider?: string;
  service?: string;
  monthly_cost_usd?: number;
  source?: string;
}

interface ServiceHotspotResponseLite {
  items?: ServiceHotspotItemLite[];
  total_monthly_cost_usd?: number;
  focus?: string | null;
}

interface ResourceIntelligenceItemLite {
  provider?: string;
  resource_type?: string;
  resource_id?: string;
  resource_name?: string;
  region?: string;
  owner_or_creator?: string | null;
  created_at?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  observed_total_cost_usd?: number;
  latest_monthly_cost_usd?: number;
  source?: string;
  match_score?: number;
}

interface ResourceIntelligenceResponseLite {
  matched_resource?: ResourceIntelligenceItemLite | null;
  alternatives?: ResourceIntelligenceItemLite[];
  notes?: string[];
}

interface VMUtilizationHotspotItemLite {
  resource_id?: string;
  resource_name?: string;
  provider?: string;
  region?: string;
  resource_type?: string;
  metric?: string;
  metric_value?: number;
  metric_source?: string;
  current_monthly_cost_usd?: number;
  resource_console_url?: string | null;
}

interface VMUtilizationHotspotResponseLite {
  metric_sources?: {
    cpu?: string;
    memory?: string;
    disk_io?: string;
    network_bandwidth?: string;
  };
  top_cpu?: VMUtilizationHotspotItemLite[];
  top_memory?: VMUtilizationHotspotItemLite[];
  top_disk_io?: VMUtilizationHotspotItemLite[];
  top_network_bandwidth?: VMUtilizationHotspotItemLite[];
  notes?: string[];
}

// GenAI scope validation (client-side)
const FINOPS_KEYWORDS = new Set([
  "cost", "budget", "spend", "billing", "invoice", "pricing", "rate",
  "gasto", "custos", "custo", "orcamento", "orçamento", "fatura",
  "costo", "coste", "presupuesto", "factura", "gastos",
  "cout", "depense", "dépense", "budgetaire", "budgétaire", "facturation",
  "kosten", "ausgaben", "budgetierung", "abrechnung",
  "costo", "spesa", "bilancio", "fattura", "spese",
  "savings", "optimization", "efficiency", "roi", "forecast", "trend",
  "economia", "economias", "otimizacao", "otimização", "eficiencia", "eficiência", "previsao", "previsão", "tendencia", "tendência",
  "ahorro", "ahorros", "optimizacion", "optimización", "eficiencia", "pronostico", "pronóstico", "tendencia", "tendencia",
  "economies", "optimisation", "efficacite", "efficacité", "prevision", "prévision", "tendance",
  "einsparung", "einsparungen", "optimierung", "effizienz", "prognose", "trend",
  "risparmio", "risparmi", "ottimizzazione", "efficienza", "previsione", "tendenza",
  "anomaly", "alert", "threshold", "scaling", "rightsizing",
  "anomalia", "anomalía", "anomalie", "warnung", "allerta", "limiar", "umbral", "seuil", "schwelle", "soglia",
  "vm", "virtual machine", "instance", "resource", "workload", "kubernetes", "pod", "node",
  "database", "rds", "aurora", "postgres", "mysql", "sql", "dynamodb", "cosmos", "spanner",
  "serverless", "lambda", "function", "functions", "cloud run", "fargate",
  "storage", "bucket", "blob", "disk", "volume", "object storage",
  "network", "load balancer", "egress", "bandwidth", "nat", "cdn",
  "cache", "redis", "memcached", "elasticache",
  "queue", "pubsub", "kafka", "event hub", "service bus", "sqs", "sns",
  "analytics", "bigquery", "redshift", "athena", "emr", "databricks",
  "ai", "ml", "gpu", "inference",
  "aws", "azure", "gcp", "oci", "ec2", "s3", "rds", "lambda",
  "compute", "storage", "database", "network",
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
        reason: `This assistant is restricted to cloud services and FinOps. Questions about "${phrase}" are not supported.`
      };
    }
  }
  
  // Check for cloud/FinOps keywords
  const keywordCount = Array.from(FINOPS_KEYWORDS).filter(k => queryLower.includes(k)).length;
  if (keywordCount >= 1) {
    return { valid: true, reason: "In scope" };
  }
  
  return {
    valid: false,
    reason: "Query appears outside cloud/FinOps scope. Ask about cloud services, architecture, operations, security, reliability, or cost optimization."
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

const LANGUAGE_TERMS: Array<{ lang: SupportedLanguage; terms: string[] }> = [
  {
    lang: 'pt',
    terms: ['qual', 'quanto', 'mais caro', 'custos', 'custo', 'gasto', 'otimizacao', 'otimização', 'previsao', 'previsão', 'nuvem'],
  },
  {
    lang: 'es',
    terms: ['cual', 'cuál', 'cuanto', 'cuánto', 'más caro', 'costos', 'gasto', 'optimización', 'optimizacion', 'pronóstico', 'nube'],
  },
  {
    lang: 'fr',
    terms: ['quel', 'combien', 'plus cher', 'cout', 'coût', 'depense', 'dépense', 'optimisation', 'prevision', 'prévision', 'nuage'],
  },
  {
    lang: 'de',
    terms: ['welche', 'welcher', 'wie viel', 'teuerste', 'kosten', 'ausgaben', 'optimierung', 'prognose', 'cloud'],
  },
  {
    lang: 'it',
    terms: ['quale', 'quanto', 'più costoso', 'piu costoso', 'costo', 'spesa', 'ottimizzazione', 'previsione', 'cloud'],
  },
];

function detectPreferredLanguage(message: string, history: ConversationEntry[] = []): SupportedLanguage {
  const sample = [message, ...history.slice(-2).map((h) => h.content)].join(' ').toLowerCase();
  let best: SupportedLanguage = 'en';
  let bestScore = 0;
  for (const candidate of LANGUAGE_TERMS) {
    let score = 0;
    for (const term of candidate.terms) {
      if (sample.includes(term)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = candidate.lang;
    }
  }
  return best;
}

function localizeScopeReason(reason: string, lang: SupportedLanguage): string {
  if (lang === 'en') return reason;
  const blockedPrefix = 'This assistant is restricted to cloud services and FinOps.';
  const genericScope = 'Query appears outside cloud/FinOps scope. Ask about cloud services, architecture, operations, security, reliability, or cost optimization.';

  const translations: Record<SupportedLanguage, { blocked: string; scope: string }> = {
    en: { blocked: blockedPrefix, scope: genericScope },
    pt: {
      blocked: 'Este assistente é restrito a serviços de nuvem e FinOps.',
      scope: 'A pergunta parece fora do escopo de nuvem/FinOps. Pergunte sobre serviços de nuvem, arquitetura, operações, segurança, confiabilidade ou otimização de custos.',
    },
    es: {
      blocked: 'Este asistente está restringido a servicios cloud y FinOps.',
      scope: 'La pregunta parece fuera del alcance cloud/FinOps. Pregunta sobre servicios cloud, arquitectura, operaciones, seguridad, confiabilidad u optimización de costos.',
    },
    fr: {
      blocked: 'Cet assistant est limité aux services cloud et à la FinOps.',
      scope: 'La question semble hors du périmètre cloud/FinOps. Posez une question sur les services cloud, l’architecture, les opérations, la sécurité, la fiabilité ou l’optimisation des coûts.',
    },
    de: {
      blocked: 'Dieser Assistent ist auf Cloud-Services und FinOps beschränkt.',
      scope: 'Die Frage scheint außerhalb des Cloud/FinOps-Bereichs zu liegen. Bitte fragen Sie zu Cloud-Services, Architektur, Betrieb, Sicherheit, Zuverlässigkeit oder Kostenoptimierung.',
    },
    it: {
      blocked: 'Questo assistente è limitato ai servizi cloud e al FinOps.',
      scope: 'La domanda sembra fuori dallo scope cloud/FinOps. Chiedi di servizi cloud, architettura, operazioni, sicurezza, affidabilità o ottimizzazione dei costi.',
    },
  };

  if (reason === genericScope) return translations[lang].scope;
  if (reason.startsWith(blockedPrefix)) {
    const quoted = reason.match(/"([^"]+)"/)?.[1];
    if (quoted) {
      const blockedSuffix: Record<SupportedLanguage, string> = {
        en: `Questions about "${quoted}" are not supported.`,
        pt: `Perguntas sobre "${quoted}" não são suportadas.`,
        es: `No se admiten preguntas sobre "${quoted}".`,
        fr: `Les questions sur "${quoted}" ne sont pas prises en charge.`,
        de: `Fragen zu "${quoted}" werden nicht unterstützt.`,
        it: `Le domande su "${quoted}" non sono supportate.`,
      };
      return `${translations[lang].blocked} ${blockedSuffix[lang]}`;
    }
    return translations[lang].blocked;
  }
  return reason;
}

const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  pt: 'Portuguese',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
};

async function localizeResponseText(text: string, lang: SupportedLanguage): Promise<string> {
  if (lang === 'en' || !sanitizeText(text)) return text;
  try {
    const translated = await callOCIGenAI(
      `Translate the following FinOps response to ${LANGUAGE_NAMES[lang]}.
Preserve all numbers, percentages, currency amounts, OCIDs, IDs, and URLs exactly.
Keep structure and line breaks. Do not add or remove recommendations.

Text:
${text}`,
      [],
      { mode: 'translation', targetLanguage: lang },
    );
    return sanitizeText(translated) || text;
  } catch (error) {
    console.warn('Multilanguage translation fallback failed:', error);
    return text;
  }
}

interface ResourceFocus {
  key: string;
  label: string;
  terms: string[];
}

const RESOURCE_FOCUS_CATALOG: ResourceFocus[] = [
  { key: 'database', label: 'database', terms: ['database', 'db', 'rds', 'aurora', 'postgres', 'mysql', 'sql', 'dynamodb', 'cosmos', 'spanner', 'redis'] },
  { key: 'serverless', label: 'serverless', terms: ['serverless', 'lambda', 'function', 'functions', 'function app', 'cloud function', 'cloud run', 'fargate'] },
  { key: 'storage', label: 'storage', terms: ['storage', 's3', 'bucket', 'blob', 'disk', 'volume', 'object storage', 'ebs', 'efs'] },
  { key: 'network', label: 'network', terms: ['network', 'load balancer', 'lb', 'egress', 'bandwidth', 'nat', 'gateway', 'cdn'] },
  { key: 'analytics', label: 'analytics', terms: ['analytics', 'bigquery', 'redshift', 'athena', 'emr', 'databricks', 'data warehouse'] },
  { key: 'cache', label: 'cache', terms: ['cache', 'redis', 'memcached', 'elasticache'] },
  { key: 'messaging', label: 'messaging', terms: ['queue', 'queues', 'pubsub', 'kafka', 'event hub', 'service bus', 'sqs', 'sns'] },
  { key: 'ai-ml', label: 'AI/ML', terms: ['ai', 'ml', 'machine learning', 'gpu', 'inference', 'training'] },
  { key: 'kubernetes', label: 'kubernetes', terms: ['kubernetes', 'k8s', 'cluster', 'namespace', 'pod', 'node'] },
  { key: 'compute', label: 'compute', terms: ['vm', 'virtual machine', 'instance', 'ec2', 'compute', 'server'] },
];

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function detectResourceFocus(message: string): ResourceFocus | null {
  const q = message.toLowerCase();
  for (const focus of RESOURCE_FOCUS_CATALOG) {
    if (includesAny(q, focus.terms)) {
      return focus;
    }
  }
  return null;
}

function matchesResourceFocus(
  item: {
    resource_name?: string;
    resource_id?: string;
    resource_type?: string;
    service?: string;
    reason?: string;
    action?: string;
  },
  focus: ResourceFocus
): boolean {
  const haystack = [
    sanitizeText(item.resource_name),
    sanitizeText(item.resource_id),
    sanitizeText(item.resource_type),
    sanitizeText(item.service),
    sanitizeText(item.reason),
    sanitizeText(item.action),
  ]
    .join(' ')
    .toLowerCase();
  return includesAny(haystack, focus.terms);
}

function isResourceHotspotQuestion(message: string): boolean {
  const q = message.toLowerCase();
  const expensiveIntent =
    q.includes('most costly') ||
    q.includes('most expensive') ||
    q.includes('top expensive') ||
    q.includes('highest cost') ||
    q.includes('what costs the most') ||
    q.includes('costs the most') ||
    q.includes('expensive') ||
    q.includes('mais caro') ||
    q.includes('mais cara') ||
    q.includes('más caro') ||
    q.includes('más cara') ||
    q.includes('mas caro') ||
    q.includes('mas cara');

  const resourceTarget =
    q.includes('resource') ||
    q.includes('service') ||
    q.includes('database') ||
    q.includes('db') ||
    q.includes('serverless') ||
    q.includes('storage') ||
    q.includes('network') ||
    q.includes('produto') ||
    q.includes('product') ||
    q.includes('produto de nuvem') ||
    q.includes('cloud product') ||
    q.includes('banco de dados');

  return (
    (expensiveIntent && resourceTarget) ||
    q.includes('costly resource') ||
    q.includes('which resource costs') ||
    q.includes('expensive resource') ||
    q.includes('most expensive service') ||
    q.includes('highest spend service') ||
    q.includes('most expensive database') ||
    q.includes('most expensive serverless') ||
    q.includes('most expensive storage') ||
    q.includes('most expensive network')
  );
}

function isDeterministicFinopsQuestion(message: string): boolean {
  const q = message.toLowerCase();
  return (
    q.includes('cost') ||
    q.includes('spend') ||
    q.includes('budget') ||
    q.includes('forecast') ||
    q.includes('waste') ||
    q.includes('savings') ||
    q.includes('roi') ||
    q.includes('efficiency') ||
    q.includes('optimization') ||
    q.includes('finops') ||
    q.includes('chargeback') ||
    q.includes('showback') ||
    q.includes('commitment') ||
    q.includes('roadmap') ||
    q.includes('executive')
  );
}

function isResourceLifecycleQuestion(message: string): boolean {
  const q = message.toLowerCase();
  return (
    q.includes('who created') ||
    q.includes('created by') ||
    q.includes('who owns') ||
    q.includes('owner of') ||
    q.includes('owner for') ||
    q.includes('how much since created') ||
    q.includes('cost since created') ||
    q.includes('costed since created') ||
    q.includes('since creation') ||
    q.includes('desde criado') ||
    q.includes('desde criacao') ||
    q.includes('desde criação') ||
    q.includes('quem criou') ||
    q.includes('quem e o dono') ||
    q.includes('quem é o dono') ||
    q.includes('quien creo') ||
    q.includes('quién creó') ||
    q.includes('quien lo creo') ||
    q.includes('quién lo creó') ||
    q.includes('cuanto costo desde') ||
    q.includes('cuánto costó desde')
  );
}

function isVMUtilizationQuestion(message: string): boolean {
  const q = message.toLowerCase();
  const hasVmTerm =
    q.includes('vm') ||
    q.includes('virtual machine') ||
    q.includes('instance') ||
    q.includes('compute');
  const hasMetricTerm =
    q.includes('cpu') ||
    q.includes('memory') ||
    q.includes('ram') ||
    q.includes('disk io') ||
    q.includes('disk') ||
    q.includes('network') ||
    q.includes('bandwidth');
  const hasHotspotIntent =
    q.includes('most') ||
    q.includes('highest') ||
    q.includes('top') ||
    q.includes('use more') ||
    q.includes('uses more') ||
    q.includes('mais usa') ||
    q.includes('mas usa') ||
    q.includes('mais consumo');
  return hasVmTerm && hasMetricTerm && hasHotspotIntent;
}

type VMMetricFocus = 'cpu' | 'memory' | 'disk_io' | 'network_bandwidth' | 'all';

function detectVMMetricFocus(message: string): VMMetricFocus {
  const q = message.toLowerCase();
  if (q.includes('cpu')) return 'cpu';
  if (q.includes('memory') || q.includes('ram')) return 'memory';
  if (q.includes('disk io') || q.includes('disk')) return 'disk_io';
  if (q.includes('network') || q.includes('bandwidth')) return 'network_bandwidth';
  return 'all';
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

function formatDateYmd(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'unknown';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().slice(0, 10);
}

function summarizeVMLabel(item: VMUtilizationHotspotItemLite): string {
  const name = sanitizeText(item.resource_name) || sanitizeText(item.resource_id) || 'unknown-vm';
  const provider = sanitizeText(item.provider).toUpperCase() || 'N/A';
  const region = sanitizeText(item.region) || 'global';
  return `${name} (${provider}, ${region})`;
}

async function buildResourceLifecycleReply(message: string): Promise<string | null> {
  const apiBase = resolveBackendApiBase();
  try {
    const res = await fetch(
      `${apiBase}/api/v1/analytics/resource-intelligence?cloud_provider=all&query=${encodeURIComponent(message)}`,
      { method: 'GET' },
    );
    if (!res.ok) return null;
    const payload = (await res.json()) as ResourceIntelligenceResponseLite;
    const top = payload?.matched_resource;
    if (!top) return null;

    const resourceLabel = summarizeResourceLabel({
      resource_name: top.resource_name,
      resource_id: top.resource_id,
      provider: top.provider,
      region: top.region,
      resource_type: top.resource_type,
    });
    const owner = sanitizeText(top.owner_or_creator) || 'not available in current metadata';
    const createdAt = formatDateYmd(top.created_at || top.first_seen_at);
    const lastSeen = formatDateYmd(top.last_seen_at);
    const observedCost = formatMoney(toSafeNumber(top.observed_total_cost_usd));
    const latestMonthly = formatMoney(toSafeNumber(top.latest_monthly_cost_usd));

    const lines: string[] = [];
    lines.push(`Resource intelligence match: ${resourceLabel}.`);
    lines.push(`Owner/creator (best effort): ${owner}.`);
    lines.push(`Created/first-seen: ${createdAt}. Last seen: ${lastSeen}.`);
    lines.push(`Observed cost since first-seen in this platform: ${observedCost}. Latest monthly cost: ${latestMonthly}.`);
    if (sanitizeText(top.resource_id)) {
      lines.push(`Resource ID: ${sanitizeText(top.resource_id)}`);
    }

    const alternatives = Array.isArray(payload?.alternatives) ? payload.alternatives.slice(0, 2) : [];
    if (alternatives.length > 0) {
      lines.push(
        `Close matches:\n${alternatives
          .map((item, idx) => {
            const label = summarizeResourceLabel({
              resource_name: item.resource_name,
              resource_id: item.resource_id,
              provider: item.provider,
              region: item.region,
              resource_type: item.resource_type,
            });
            return `${idx + 1}. ${label} — observed cost ${formatMoney(toSafeNumber(item.observed_total_cost_usd))}`;
          })
          .join('\n')}`
      );
    }

    lines.push(
      `Note: "since created" is calculated from available imported history and snapshots, not full cloud billing lifetime if older data is missing.`
    );
    return lines.join('\n\n');
  } catch (error) {
    console.warn('Resource lifecycle lookup failed:', error);
    return null;
  }
}

async function buildVMUtilizationReply(message: string): Promise<string | null> {
  const apiBase = resolveBackendApiBase();
  const focus = detectVMMetricFocus(message);
  try {
    const res = await fetch(
      `${apiBase}/api/v1/analytics/vm-utilization-hotspots?provider=all&limit=5`,
      { method: 'GET' },
    );
    if (!res.ok) return null;
    const payload = (await res.json()) as VMUtilizationHotspotResponseLite;

    const topCpu = Array.isArray(payload?.top_cpu) ? payload.top_cpu : [];
    const topMemory = Array.isArray(payload?.top_memory) ? payload.top_memory : [];
    const topDisk = Array.isArray(payload?.top_disk_io) ? payload.top_disk_io : [];
    const topNet = Array.isArray(payload?.top_network_bandwidth) ? payload.top_network_bandwidth : [];
    if (topCpu.length + topMemory.length + topDisk.length + topNet.length === 0) return null;

    const summarizeLine = (item: VMUtilizationHotspotItemLite, metricLabel: string, unit: string): string => {
      const metricValue = Number.isFinite(Number(item.metric_value))
        ? Number(item.metric_value).toFixed(1)
        : '0.0';
      return `${summarizeVMLabel(item)} — ${metricLabel}: ${metricValue}${unit}, monthly cost ${formatMoney(toSafeNumber(item.current_monthly_cost_usd))}`;
    };

    if (focus === 'cpu' && topCpu.length > 0) {
      return `Highest VM CPU utilization is ${summarizeLine(topCpu[0], 'CPU', '%')}.`;
    }
    if (focus === 'memory' && topMemory.length > 0) {
      return `Highest VM memory utilization is ${summarizeLine(topMemory[0], 'memory', '%')}.`;
    }
    if (focus === 'disk_io' && topDisk.length > 0) {
      const source = sanitizeText(payload.metric_sources?.disk_io);
      return `Highest VM disk I/O pressure is ${summarizeLine(topDisk[0], 'disk I/O index', '')}. Source: ${source || 'proxy_from_cost_profile'}.`;
    }
    if (focus === 'network_bandwidth' && topNet.length > 0) {
      const source = sanitizeText(payload.metric_sources?.network_bandwidth);
      return `Highest VM network bandwidth pressure is ${summarizeLine(topNet[0], 'network bandwidth index', '')}. Source: ${source || 'proxy_from_cost_profile'}.`;
    }

    const lines: string[] = [];
    if (topCpu.length > 0) lines.push(`Top CPU VM: ${summarizeLine(topCpu[0], 'CPU', '%')}.`);
    if (topMemory.length > 0) lines.push(`Top memory VM: ${summarizeLine(topMemory[0], 'memory', '%')}.`);
    if (topDisk.length > 0) lines.push(`Top disk I/O VM: ${summarizeLine(topDisk[0], 'disk I/O index', '')}.`);
    if (topNet.length > 0) lines.push(`Top network VM: ${summarizeLine(topNet[0], 'network bandwidth index', '')}.`);

    const diskSource = sanitizeText(payload.metric_sources?.disk_io);
    const netSource = sanitizeText(payload.metric_sources?.network_bandwidth);
    if (diskSource.includes('proxy') || netSource.includes('proxy')) {
      lines.push('Disk and network rankings are proxy-based unless native monitoring telemetry is connected.');
    }
    return lines.join('\n\n');
  } catch (error) {
    console.warn('VM utilization hotspot lookup failed:', error);
    return null;
  }
}

async function buildResourceHotspotReply(message: string): Promise<string | null> {
  const apiBase = resolveBackendApiBase();
  const focus = detectResourceFocus(message);
  const q = message.toLowerCase();
  const wantsServiceView = q.includes('service');

  // First choice: rightsizing feed gives actionable resource-level recommendations.
  try {
    const rightsizingRes = await fetch(
      `${apiBase}/api/v1/recommendations/rightsizing?provider=all&min_savings=0&limit=120`,
      { method: 'GET' },
    );
    if (rightsizingRes.ok) {
      const payload = (await rightsizingRes.json()) as RightsizingResponseLite;
      const recs = Array.isArray(payload?.recommendations) ? payload.recommendations : [];
      const sorted = recs
        .slice()
        .sort((a, b) => toSafeNumber(b.current_monthly_cost_usd) - toSafeNumber(a.current_monthly_cost_usd));
      const focused = focus ? sorted.filter((item) => matchesResourceFocus(item, focus)) : sorted;
      const candidates = focus ? focused : sorted;
      if (candidates.length > 0) {
        const top = candidates[0];
        const lines: string[] = [];
        if (focus) {
          lines.push(`Your highest-cost actionable ${focus.label} resource is ${summarizeResourceLabel(top)} at ${formatMoney(toSafeNumber(top.current_monthly_cost_usd))}/month.`);
        } else {
          lines.push(`Your highest-cost actionable resource is ${summarizeResourceLabel(top)} at ${formatMoney(toSafeNumber(top.current_monthly_cost_usd))}/month.`);
        }
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

        const next = candidates.slice(1, 4);
        if (next.length > 0) {
          const nextLines = next.map((item, idx) => {
            return `${idx + 2}. ${summarizeResourceLabel(item)} — cost ${formatMoney(toSafeNumber(item.current_monthly_cost_usd))}/month, savings ${formatMoney(toSafeNumber(item.monthly_savings_usd))}/month`;
          });
          lines.push(`Next highest-cost actionable ${focus ? `${focus.label} ` : ''}resources:\n${nextLines.join('\n')}`);
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
      `${apiBase}/api/v1/inventory/resources?provider=all&limit=500&offset=0`,
      { method: 'GET' },
    );
    if (inventoryRes.ok) {
      const payload = (await inventoryRes.json()) as ResourceInventoryResponseLite;
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const sorted = items
        .slice()
        .sort((a, b) => toSafeNumber(b.cost_usd) - toSafeNumber(a.cost_usd));
      const focused = focus ? sorted.filter((item) => matchesResourceFocus(item, focus)) : sorted;
      const candidates = focus ? focused : sorted;
      if (candidates.length > 0) {
        const top = candidates[0];
        const next = candidates.slice(1, 4);
        const lines: string[] = [];
        if (focus) {
          lines.push(`Your highest visible ${focus.label} cost resource is ${summarizeResourceLabel(top)} at ${formatMoney(toSafeNumber(top.cost_usd))}/month.`);
        } else {
          lines.push(`Your highest visible cost resource is ${summarizeResourceLabel(top)} at ${formatMoney(toSafeNumber(top.cost_usd))}/month.`);
        }
        if (sanitizeText(top.resource_id)) {
          lines.push(`Resource ID: ${sanitizeText(top.resource_id)}`);
        }
        if (next.length > 0) {
          lines.push(
            `Next highest ${focus ? `${focus.label} ` : ''}resources:\n${next.map((item, idx) => `${idx + 2}. ${summarizeResourceLabel(item)} — ${formatMoney(toSafeNumber(item.cost_usd))}/month`).join('\n')}`
          );
        }
        lines.push('Tip: run Rightsizing refresh to get concrete downsize/terminate actions for these resources.');
        return lines.join('\n\n');
      }
    }
  } catch (error) {
    console.warn('Inventory hotspot lookup failed:', error);
  }

  // Third choice: service-level hotspots for non-compute resources.
  if (focus || wantsServiceView) {
    try {
      const focusParam = focus ? `&focus=${encodeURIComponent(focus.key)}` : "";
      let serviceRes = await fetch(
        `${apiBase}/api/v1/analytics/service-hotspots?period=month&cloud_provider=all&limit=8${focusParam}`,
        { method: 'GET' },
      );
      if (serviceRes.ok) {
        let payload = (await serviceRes.json()) as ServiceHotspotResponseLite;
        let items = Array.isArray(payload?.items) ? payload.items : [];
        let usedGenericFallback = false;

        if (focus && items.length === 0) {
          serviceRes = await fetch(
            `${apiBase}/api/v1/analytics/service-hotspots?period=month&cloud_provider=all&limit=8`,
            { method: 'GET' },
          );
          if (serviceRes.ok) {
            payload = (await serviceRes.json()) as ServiceHotspotResponseLite;
            items = Array.isArray(payload?.items) ? payload.items : [];
            usedGenericFallback = items.length > 0;
          }
        }

        if (items.length > 0) {
          const top = items[0];
          const lines: string[] = [];
          const providerLabel = sanitizeText(top.provider).toUpperCase() || 'MULTI-CLOUD';
          const serviceLabel = sanitizeText(top.service) || 'unknown-service';
          if (focus && usedGenericFallback) {
            lines.push(`I could not find a clear ${focus.label} service match in current data. Highest-cost service overall is ${serviceLabel} on ${providerLabel} at ${formatMoney(toSafeNumber(top.monthly_cost_usd))}/month.`);
          } else {
            const focusLabel = focus ? `${focus.label} service` : 'service';
            lines.push(`Your highest-cost ${focusLabel} is ${serviceLabel} on ${providerLabel} at ${formatMoney(toSafeNumber(top.monthly_cost_usd))}/month.`);
          }

          const next = items.slice(1, 4);
          if (next.length > 0) {
            lines.push(
              `Next highest ${focus ? `${focus.label} ` : ''}services:\n${next
                .map((item, idx) => {
                  const p = sanitizeText(item.provider).toUpperCase() || 'N/A';
                  const s = sanitizeText(item.service) || 'unknown-service';
                  return `${idx + 2}. ${s} (${p}) — ${formatMoney(toSafeNumber(item.monthly_cost_usd))}/month`;
                })
                .join('\n')}`
            );
          }
          lines.push('Tip: use rightsizing and commitment analysis to convert top-service hotspots into concrete savings actions.');
          return lines.join('\n\n');
        }
      }
    } catch (error) {
      console.warn('Service hotspot lookup failed:', error);
    }
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

type GenAICallMode = 'assistant' | 'translation';

interface GenAICallOptions {
  mode?: GenAICallMode;
  targetLanguage?: SupportedLanguage;
}

async function callOCIGenAI(
  prompt: string,
  history: ConversationEntry[],
  options: GenAICallOptions = {},
): Promise<string> {
  const endpoint = required('OCI_GENAI_ENDPOINT', env('OCI_GENAI_ENDPOINT'));
  const model = required('OCI_GENAI_MODEL', env('OCI_GENAI_MODEL'));
  required('OCI_REGION', env('OCI_REGION'));
  const tenancyOcid = required('OCI_TENANCY_OCID', env('OCI_TENANCY_OCID'));
  const userOcid = required('OCI_USER_OCID', env('OCI_USER_OCID'));
  const fingerprint = required('OCI_FINGERPRINT', env('OCI_FINGERPRINT'));
  const keyPem = resolvePrivateKeyPem();
  const mode = options.mode ?? 'assistant';
  const targetLanguage: SupportedLanguage = options.targetLanguage ?? 'en';

  const host = new URL(endpoint).host;
  const path = `/20231130/actions/chat`; // OCI Generative AI Chat Inference path

  // System prompts by call mode.
  const assistantPrompt = `You are OptiOra Cloud & FinOps AI Assistant.

SCOPE: Answer ONLY questions about cloud services and cloud operations for AWS, Azure, GCP, and OCI, including:
- architecture, networking, compute, storage, databases, kubernetes, serverless, security, reliability, and troubleshooting
- cost optimization, forecasting, budgeting, and FinOps governance

REFUSE to answer about:
- politics, current events, personal advice
- legal, HR, medical, investment advice
- non-cloud topics

If customer data is available in context, use it. If not, clearly state assumptions and provide best-practice guidance.
Always answer in ${LANGUAGE_NAMES[targetLanguage]}.`;
  const translationPrompt = `You are a precise technical translator for cloud and FinOps content.
Translate exactly to ${LANGUAGE_NAMES[targetLanguage]}.
Preserve all numbers, percentages, currencies, OCIDs, IDs, and URLs exactly.
Do not add explanations.`;
  const systemPrompt = mode === 'translation' ? translationPrompt : assistantPrompt;

  const payload = {
    compartmentId: required('OCI_COMPARTMENT_OCID', env('OCI_COMPARTMENT_OCID')),
    modelId: model,
    messages: [
      { role: 'user', content: [{ type: 'text', text: systemPrompt }] },
      ...history.map(h => ({ role: h.role, content: [{ type: 'text', text: h.content }] })),
      { role: 'user', content: [{ type: 'text', text: prompt }] }
    ],
    maxTokens: 800,
    temperature: mode === 'translation' ? 0 : 0.2,
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
    const preferredLanguage = detectPreferredLanguage(message, conversationHistory);
    if (isResourceLifecycleQuestion(message)) {
      const lifecycleReply = await buildResourceLifecycleReply(message);
      if (lifecycleReply) {
        return await localizeResponseText(lifecycleReply, preferredLanguage);
      }
      // Continue to broader advisory flow if no lifecycle match is available.
    }
    if (isVMUtilizationQuestion(message)) {
      const vmReply = await buildVMUtilizationReply(message);
      if (vmReply) {
        return await localizeResponseText(vmReply, preferredLanguage);
      }
      // Continue to broader advisory flow if VM telemetry feed is unavailable.
    }
    if (isResourceHotspotQuestion(message)) {
      const hotspotReply = await buildResourceHotspotReply(message);
      if (hotspotReply) {
        return await localizeResponseText(hotspotReply, preferredLanguage);
      }
      // Continue to broader advisory flow if resource-level feeds are empty.
    }

    const validation = validateQueryScope(message);
    if (!validation.valid) {
      return localizeScopeReason(validation.reason, preferredLanguage);
    }
    if (!isDeterministicFinopsQuestion(message)) {
      const direct = await callOCIGenAI(message, conversationHistory, {
        mode: 'assistant',
        targetLanguage: preferredLanguage,
      });
      return await localizeResponseText(direct, preferredLanguage);
    }
    try {
      const result = await callBackendGenAIAnalyze(message);
      const narrative = sanitizeText(result?.narrative);
      if (narrative && !looksLikeSystemPrompt(narrative)) {
        return await localizeResponseText(narrative, preferredLanguage);
      }
    } catch (error) {
      console.warn('Backend GenAI analyze failed, using deterministic fallback:', error);
    }
    const fallback = await buildDeterministicFallbackReply(message);
    return await localizeResponseText(fallback, preferredLanguage);
  } catch (error) {
    console.error('OCI GenAI error:', error);
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to get AI response');
  }
}
