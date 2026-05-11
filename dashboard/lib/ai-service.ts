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
  evidence_source?: string;
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
  evidence_source?: string;
  source?: string;
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

interface RagGuidanceDocLite {
  id?: string;
  topic?: string;
  provider?: string;
  guidance?: string;
  source?: string;
  score?: number;
}

interface RagGuidanceResponseLite {
  rag?: {
    retrieved_count?: number;
    retrieved_docs?: RagGuidanceDocLite[];
    rag_brief?: string;
  };
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

type ResourceIdentityLite = {
  provider?: string;
  resource_id?: string;
  resource_name?: string;
  resource_type?: string;
  evidence_source?: string;
  source?: string;
  current_size?: string;
  recommended_size?: string;
};

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

let lastProviderRefreshAttemptMs = 0;
const PROVIDER_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

async function postJsonSafe(url: string, body: Record<string, unknown> = {}): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchPostJsonSafe<T>(url: string, body: Record<string, unknown> = {}, timeoutMs = 8000): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function triggerLiveProviderMetricsRefresh(reason: string): Promise<boolean> {
  const now = Date.now();
  if (now - lastProviderRefreshAttemptMs < PROVIDER_REFRESH_COOLDOWN_MS) {
    return false;
  }
  lastProviderRefreshAttemptMs = now;

  const apiBase = resolveBackendApiBase();
  const [schedulerRun, scanStart] = await Promise.all([
    postJsonSafe(`${apiBase}/api/v1/scanning/scheduler/run-now`),
    postJsonSafe(`${apiBase}/api/v1/scanning/start`, {
      providers: ['aws', 'azure', 'gcp', 'oci'],
      target_accounts: [],
      reason,
    }),
  ]);

  // Give provider connectors a short head start before retrying the query path.
  if (schedulerRun || scanStart) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return true;
  }
  return false;
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
  void message;
  void history;
  return 'en';
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

const QUERY_TOKEN_STOPWORDS = new Set([
  'what', 'which', 'who', 'how', 'much', 'is', 'are', 'the', 'a', 'an', 'of', 'for', 'in', 'on', 'to',
  'do', 'does', 'did', 'we', 'our', 'your', 'and', 'or', 'with', 'without', 'many', 'one', 'any',
  'most', 'highest', 'expensive', 'cost', 'costs', 'costly', 'spend', 'spending',
  'qual', 'quais', 'que', 'mais', 'maior', 'custo', 'custos', 'gasto', 'gastos',
  'cuál', 'cual', 'más', 'caro', 'cara', 'coste', 'costos',
  'resource', 'resources', 'service', 'services', 'cloud', 'produto', 'product',
  'tenho', 'have', 'i', 'my', 'me', 'you',
]);

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

function isAggregateLikeResource(item: ResourceIdentityLite): boolean {
  const resourceId = sanitizeText(item.resource_id).toLowerCase();
  const resourceName = sanitizeText(item.resource_name).toLowerCase();
  const resourceType = sanitizeText(item.resource_type).toLowerCase();
  const source = [sanitizeText(item.evidence_source), sanitizeText(item.source)].join(' ').toLowerCase();

  return (
    resourceId.startsWith('oci-acct-') ||
    resourceId.startsWith('aws-acct-') ||
    resourceId.startsWith('azure-acct-') ||
    resourceId.startsWith('gcp-acct-') ||
    resourceName.startsWith('oci-acct-') ||
    resourceName.startsWith('aws-acct-') ||
    resourceName.startsWith('azure-acct-') ||
    resourceName.startsWith('gcp-acct-') ||
    resourceId.startsWith('ocid1.tenancy.') ||
    resourceName.startsWith('ocid1.tenancy.') ||
    resourceId.startsWith('account:') ||
    resourceId.startsWith('imported:') ||
    resourceId.includes('-service-') ||
    resourceType.includes('aggregate') ||
    resourceType.includes('segment') ||
    resourceType.includes('account rollup') ||
    resourceType.includes('service snapshot') ||
    source.includes('cost_trend_analysis') ||
    source.includes('service_cost_snapshot') ||
    source.includes('imported_costs')
  );
}

function providerDisplayName(provider: string): string {
  const normalized = provider.toLowerCase();
  if (normalized === 'aws') return 'AWS';
  if (normalized === 'azure') return 'Azure';
  if (normalized === 'gcp') return 'GCP';
  if (normalized === 'oci') return 'OCI';
  return sanitizeText(provider).toUpperCase() || 'N/A';
}

function detectRequestedProvider(message: string): string | null {
  const q = message.toLowerCase();
  if (q.includes('aws') || q.includes('amazon') || q.includes('ec2')) return 'aws';
  if (q.includes('azure') || q.includes('microsoft')) return 'azure';
  if (q.includes('gcp') || q.includes('google cloud') || q.includes('google')) return 'gcp';
  if (q.includes('oci') || q.includes('oracle cloud') || q.includes('oracle')) return 'oci';
  return null;
}

function matchesRequestedProvider(item: { provider?: string }, provider: string | null): boolean {
  if (!provider) return true;
  return sanitizeText(item.provider).toLowerCase() === provider;
}

function isRealProviderResourceId(provider: string, resourceId: string): boolean {
  if (!resourceId) return false;
  if (provider === 'aws') {
    return (
      resourceId.startsWith('arn:aws:') ||
      resourceId.startsWith('i-') ||
      resourceId.startsWith('vol-') ||
      resourceId.startsWith('snap-') ||
      resourceId.startsWith('sg-') ||
      resourceId.startsWith('subnet-') ||
      resourceId.startsWith('vpc-') ||
      resourceId.startsWith('ami-') ||
      resourceId.startsWith('db-') ||
      resourceId.startsWith('cluster-')
    );
  }
  if (provider === 'azure') {
    return resourceId.startsWith('/subscriptions/') && resourceId.includes('/providers/');
  }
  if (provider === 'gcp') {
    return (
      resourceId.startsWith('projects/') ||
      resourceId.startsWith('//') ||
      resourceId.includes('googleapis.com/projects/')
    );
  }
  if (provider === 'oci') {
    return resourceId.startsWith('ocid1.') && !resourceId.startsWith('ocid1.tenancy.');
  }
  return false;
}

function isProviderBackedRightsizingCandidate(item: RightsizingRecommendationLite): boolean {
  const provider = sanitizeText(item.provider).toLowerCase();
  const resourceId = sanitizeText(item.resource_id).toLowerCase();
  const evidenceSource = sanitizeText(item.evidence_source).toLowerCase();

  const providerEvidence = new Set([
    'aws_cost_explorer',
    'aws_cloudwatch',
    'azure_advisor',
    'azure_monitor',
    'gcp_cloud_monitoring',
    'oci_compute_inventory',
    'oci_storage_inventory',
    'live_provider_recommendations',
  ]);

  return providerEvidence.has(evidenceSource) &&
    isRealProviderResourceId(provider, resourceId) &&
    !isAggregateLikeResource(item);
}

function isVmLikeResource(item: ResourceIdentityLite): boolean {
  const provider = sanitizeText(item.provider).toLowerCase();
  const resourceId = sanitizeText(item.resource_id).toLowerCase();
  const resourceType = sanitizeText(item.resource_type).toLowerCase();
  const text = [
    resourceType,
    resourceId,
    sanitizeText(item.current_size),
    sanitizeText(item.recommended_size),
  ].join(' ').toLowerCase();

  if (provider === 'oci') {
    return resourceId.startsWith('ocid1.instance.') || resourceType.includes('compute instance');
  }
  if (provider === 'aws') {
    return (
      resourceId.startsWith('i-') ||
      (resourceId.includes(':ec2:') && resourceId.includes(':instance/')) ||
      resourceType.includes('ec2 instance')
    );
  }
  if (provider === 'azure') {
    return resourceId.includes('/microsoft.compute/virtualmachines/') || resourceType.includes('virtual machine');
  }
  if (provider === 'gcp') {
    return (
      resourceId.includes('/instances/') ||
      (resourceId.includes('compute.googleapis.com') && resourceId.includes('/instances/')) ||
      resourceType.includes('gce instance') ||
      resourceType.includes('compute instance')
    );
  }

  return (
    text.includes('virtual machine') ||
    text.includes('ec2 instance') ||
    text.includes('gce instance') ||
    text.includes('compute instance')
  );
}

function isProviderBackedVmRightsizingCandidate(item: RightsizingRecommendationLite): boolean {
  return isProviderBackedRightsizingCandidate(item) && isVmLikeResource(item);
}

function isProviderBackedInventoryItem(item: ResourceIdentityLite): boolean {
  const provider = sanitizeText(item.provider).toLowerCase();
  const resourceId = sanitizeText(item.resource_id).toLowerCase();
  return isRealProviderResourceId(provider, resourceId) && !isAggregateLikeResource(item);
}

function isProviderBackedVmInventoryItem(item: ResourceIdentityLite): boolean {
  return isProviderBackedInventoryItem(item) && isVmLikeResource(item);
}

function isProviderBackedResourceIntelligenceItem(item: ResourceIntelligenceItemLite): boolean {
  const provider = sanitizeText(item.provider).toLowerCase();
  const resourceId = sanitizeText(item.resource_id).toLowerCase();
  return isRealProviderResourceId(provider, resourceId) && !isAggregateLikeResource(item);
}

function isProviderBackedVmResourceIntelligenceItem(item: ResourceIntelligenceItemLite): boolean {
  return isProviderBackedResourceIntelligenceItem(item) && isVmLikeResource(item);
}

function isRightsizingQuestion(message: string): boolean {
  const q = message.toLowerCase();
  return (
    q.includes('rightsize') ||
    q.includes('rightsizing') ||
    q.includes('right sizing') ||
    q.includes('overprovisioned') ||
    q.includes('over-provisioned') ||
    q.includes('over provisioned') ||
    q.includes('over sized') ||
    q.includes('oversized') ||
    q.includes('underutilized') ||
    q.includes('under-utilized') ||
    q.includes('under utilized') ||
    q.includes('downsize')
  );
}

function isVmScopedQuestion(message: string): boolean {
  const q = message.toLowerCase();
  return (
    q.includes('vm') ||
    q.includes('virtual machine') ||
    q.includes('instance') ||
    q.includes('compute') ||
    q.includes('ec2')
  );
}

function extractQueryTokens(message: string): string[] {
  const raw = String(message || '').toLowerCase().match(/[a-z0-9][a-z0-9._+/-]{1,}/g) || [];
  return raw.filter((token) => token.length >= 3 && !QUERY_TOKEN_STOPWORDS.has(token));
}

function matchesQueryTokens(
  item: {
    resource_name?: string;
    resource_id?: string;
    resource_type?: string;
    service?: string;
    reason?: string;
    action?: string;
    provider?: string;
  },
  tokens: string[],
): boolean {
  if (tokens.length === 0) return false;
  const haystack = [
    sanitizeText(item.resource_name),
    sanitizeText(item.resource_id),
    sanitizeText(item.resource_type),
    sanitizeText(item.service),
    sanitizeText(item.reason),
    sanitizeText(item.action),
    sanitizeText(item.provider),
  ]
    .join(' ')
    .toLowerCase();
  return tokens.some((token) => haystack.includes(token));
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
    q.includes('largest') ||
    q.includes('biggest') ||
    q.includes('top expensive') ||
    q.includes('highest cost') ||
    q.includes('highest usage') ||
    q.includes('what costs the most') ||
    q.includes('costs the most') ||
    q.includes('expensive') ||
    q.includes('mais caro') ||
    q.includes('mais cara') ||
    q.includes('más caro') ||
    q.includes('más cara') ||
    q.includes('mas caro') ||
    q.includes('mas cara') ||
    q.includes('maior custo') ||
    q.includes('maior gasto') ||
    q.includes('highest spend') ||
    q.includes('mais alto') ||
    q.includes('más alto') ||
    q.includes('mayor');

  const resourceTarget =
    q.includes('vm') ||
    q.includes('virtual machine') ||
    q.includes('instance') ||
    q.includes('compute') ||
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
    q.includes('largest database') ||
    q.includes('biggest database') ||
    q.includes('most expensive database') ||
    q.includes('most expensive serverless') ||
    q.includes('most expensive storage') ||
    q.includes('most expensive network')
  );
}

function isResourceCountQuestion(message: string): boolean {
  const q = message.toLowerCase();
  const countIntent =
    q.includes('how many') ||
    q.includes('number of') ||
    q.includes('count of') ||
    q.includes('total of') ||
    q.includes('quantos') ||
    q.includes('quantas') ||
    q.includes('numero de') ||
    q.includes('número de') ||
    q.includes('cuantos') ||
    q.includes('cuantas') ||
    q.includes('cuántos') ||
    q.includes('cuántas') ||
    q.includes('cantidad de') ||
    q.includes('combien') ||
    q.includes('wieviele') ||
    q.includes('wie viele') ||
    q.includes('quanti') ||
    q.includes('quante');

  const resourceIntent =
    q.includes('resource') ||
    q.includes('resources') ||
    q.includes('service') ||
    q.includes('services') ||
    q.includes('database') ||
    q.includes('db') ||
    q.includes('vm') ||
    q.includes('instance') ||
    q.includes('serverless') ||
    q.includes('storage') ||
    q.includes('network') ||
    q.includes('cloud product') ||
    q.includes('produto de nuvem') ||
    q.includes('banco de dados') ||
    detectResourceFocus(message) !== null;

  return countIntent && resourceIntent;
}

function isVMCostHotspotQuestion(message: string): boolean {
  const q = message.toLowerCase();
  const hasVmTerm =
    q.includes('vm') ||
    q.includes('virtual machine') ||
    q.includes('instance') ||
    q.includes('compute');
  const hasCostTerm =
    q.includes('cost') ||
    q.includes('costs') ||
    q.includes('custo') ||
    q.includes('custos') ||
    q.includes('gasto') ||
    q.includes('gastos');
  const hasRankingTerm =
    q.includes('highest') ||
    q.includes('most') ||
    q.includes('top') ||
    q.includes('maior') ||
    q.includes('mais caro') ||
    q.includes('mais cara') ||
    q.includes('más caro') ||
    q.includes('más cara');
  return hasVmTerm && hasCostTerm && hasRankingTerm;
}

function isDeterministicFinopsQuestion(message: string): boolean {
  const q = message.toLowerCase();
  return (
    q.includes('cost') ||
    q.includes('costs') ||
    q.includes('spend') ||
    q.includes('spending') ||
    q.includes('budget') ||
    q.includes('forecast') ||
    q.includes('waste') ||
    q.includes('savings') ||
    q.includes('roi') ||
    q.includes('efficiency') ||
    q.includes('optimization') ||
    q.includes('rightsize') ||
    q.includes('rightsizing') ||
    q.includes('right sizing') ||
    q.includes('overprovisioned') ||
    q.includes('over-provisioned') ||
    q.includes('over provisioned') ||
    q.includes('oversized') ||
    q.includes('over sized') ||
    q.includes('underutilized') ||
    q.includes('under-utilized') ||
    q.includes('under utilized') ||
    q.includes('downsize') ||
    q.includes('finops') ||
    q.includes('chargeback') ||
    q.includes('showback') ||
    q.includes('commitment') ||
    q.includes('roadmap') ||
    q.includes('executive') ||
    q.includes('custo') ||
    q.includes('custos') ||
    q.includes('gasto') ||
    q.includes('gastos') ||
    q.includes('orcamento') ||
    q.includes('orçamento') ||
    q.includes('presupuesto') ||
    q.includes('costos') ||
    q.includes('gasto')
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

function detectRequestedTopLimit(message: string, fallback = 1, max = 10): number {
  const q = message.toLowerCase();
  const topMatch = q.match(/\btop\s+(\d{1,2})\b/);
  if (topMatch) {
    const parsed = Number(topMatch[1]);
    if (Number.isFinite(parsed) && parsed >= 1) return Math.min(max, Math.max(1, parsed));
  }
  const firstNumber = q.match(/\b(\d{1,2})\b/);
  if (firstNumber) {
    const parsed = Number(firstNumber[1]);
    if (Number.isFinite(parsed) && parsed >= 1 && q.includes('cpu')) return Math.min(max, Math.max(1, parsed));
  }
  return Math.min(max, Math.max(1, fallback));
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

async function buildResourceLifecycleReply(message: string, allowRefresh = true): Promise<string | null> {
  const apiBase = resolveBackendApiBase();
  const wantsVmScope = isVmScopedQuestion(message);
  try {
    const res = await fetch(
      `${apiBase}/api/v1/analytics/resource-intelligence?cloud_provider=all&query=${encodeURIComponent(message)}`,
      { method: 'GET' },
    );
    if (!res.ok) return null;
    const payload = (await res.json()) as ResourceIntelligenceResponseLite;
    const rawCandidates = [
      ...(payload?.matched_resource ? [payload.matched_resource] : []),
      ...(Array.isArray(payload?.alternatives) ? payload.alternatives : []),
    ];
    const seen = new Set<string>();
    const candidates = rawCandidates
      .filter(wantsVmScope ? isProviderBackedVmResourceIntelligenceItem : isProviderBackedResourceIntelligenceItem)
      .filter((item) => {
        const key = [
          sanitizeText(item.provider).toLowerCase(),
          sanitizeText(item.resource_id).toLowerCase(),
          sanitizeText(item.resource_name).toLowerCase(),
        ].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const top = candidates[0];
    if (!top) {
      if (allowRefresh) {
        const refreshed = await triggerLiveProviderMetricsRefresh('resource_lifecycle_query');
        if (refreshed) {
          return buildResourceLifecycleReply(message, false);
        }
      }
      if (rawCandidates.length > 0) {
        const scopeLabel = wantsVmScope ? 'VM' : 'cloud resource';
        const rejectionLabel = wantsVmScope
          ? 'account, tenancy, service, imported, storage, or non-VM records'
          : 'account, tenancy, service, imported, or aggregate records';
        return `I found lifecycle matches, but they were ${rejectionLabel} rather than a real ${scopeLabel}.

I will not report those as actionable cloud resources. Please retry with provider + region + resource ID/name, for example: "OCI instance ocid1... in af-johannesburg-1" or "AWS EC2 i-... in us-east-1".`;
      }
      return null;
    }

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

    const alternatives = candidates.slice(1, 3);
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
    if (allowRefresh) {
      const refreshed = await triggerLiveProviderMetricsRefresh('resource_lifecycle_query');
      if (refreshed) {
        return buildResourceLifecycleReply(message, false);
      }
    }
    return null;
  }
}

async function buildVMUtilizationReply(message: string, allowRefresh = true): Promise<string | null> {
  const apiBase = resolveBackendApiBase();
  const focus = detectVMMetricFocus(message);
  const requestedLimit = detectRequestedTopLimit(message, focus === 'all' ? 3 : 1, 10);
  try {
    const res = await fetch(
      `${apiBase}/api/v1/analytics/vm-utilization-hotspots?provider=all&limit=${requestedLimit}`,
      { method: 'GET' },
    );
    if (!res.ok) return null;
    const payload = (await res.json()) as VMUtilizationHotspotResponseLite;

    const realProviderVmMetric = (item: VMUtilizationHotspotItemLite): boolean => {
      const provider = sanitizeText(item.provider).toLowerCase();
      const resourceId = sanitizeText(item.resource_id).toLowerCase();
      return isRealProviderResourceId(provider, resourceId) && isVmLikeResource(item) && !isAggregateLikeResource(item);
    };
    const topCpu = (Array.isArray(payload?.top_cpu) ? payload.top_cpu : []).filter(realProviderVmMetric);
    const topMemory = (Array.isArray(payload?.top_memory) ? payload.top_memory : []).filter(realProviderVmMetric);
    const topDisk = (Array.isArray(payload?.top_disk_io) ? payload.top_disk_io : []).filter(realProviderVmMetric);
    const topNet = (Array.isArray(payload?.top_network_bandwidth) ? payload.top_network_bandwidth : []).filter(realProviderVmMetric);
    if (topCpu.length + topMemory.length + topDisk.length + topNet.length === 0) {
      if (allowRefresh) {
        const refreshed = await triggerLiveProviderMetricsRefresh('vm_utilization_query');
        if (refreshed) {
          return buildVMUtilizationReply(message, false);
        }
      }
      return null;
    }

    const summarizeLine = (item: VMUtilizationHotspotItemLite, metricLabel: string, unit: string): string => {
      const metricValue = Number.isFinite(Number(item.metric_value))
        ? Number(item.metric_value).toFixed(1)
        : '0.0';
      return `${summarizeVMLabel(item)} — ${metricLabel}: ${metricValue}${unit}, monthly cost ${formatMoney(toSafeNumber(item.current_monthly_cost_usd))}`;
    };

    if (focus === 'cpu' && topCpu.length > 0) {
      const source = sanitizeText(payload.metric_sources?.cpu) || 'unknown';
      const metricLabel = source.includes('proxy') ? 'CPU pressure proxy index' : 'CPU';
      const metricUnit = source.includes('proxy') ? '' : '%';
      if (requestedLimit > 1) {
        return `Top ${requestedLimit} VM CPU consumers across connected providers (source=${source}):\n${topCpu
          .slice(0, requestedLimit)
          .map((item, idx) => `${idx + 1}. ${summarizeLine(item, metricLabel, metricUnit)}`)
          .join('\n')}`;
      }
      return `Highest VM CPU utilization across connected providers is ${summarizeLine(topCpu[0], metricLabel, metricUnit)} (source=${source}).`;
    }
    if (focus === 'memory' && topMemory.length > 0) {
      const source = sanitizeText(payload.metric_sources?.memory) || 'unknown';
      if (requestedLimit > 1) {
        return `Top ${requestedLimit} VM memory consumers across connected providers (source=${source}):\n${topMemory
          .slice(0, requestedLimit)
          .map((item, idx) => `${idx + 1}. ${summarizeLine(item, 'memory', '%')}`)
          .join('\n')}`;
      }
      return `Highest VM memory utilization across connected providers is ${summarizeLine(topMemory[0], 'memory', '%')} (source=${source}).`;
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
    if (allowRefresh) {
      const refreshed = await triggerLiveProviderMetricsRefresh('vm_utilization_query');
      if (refreshed) {
        return buildVMUtilizationReply(message, false);
      }
    }
    return null;
  }
}

async function buildProviderRightsizingReply(message: string, allowRefresh = true): Promise<string | null> {
  const apiBase = resolveBackendApiBase();
  const requestedProvider = detectRequestedProvider(message);
  const providerParam = requestedProvider || 'all';
  const providerLabel = requestedProvider ? providerDisplayName(requestedProvider) : 'connected providers';
  const wantsVmScope = isVmScopedQuestion(message) || isVMCostHotspotQuestion(message) || isVMUtilizationQuestion(message);

  try {
    const rightsizingRes = await fetch(
      `${apiBase}/api/v1/recommendations/rightsizing?provider=${encodeURIComponent(providerParam)}&min_savings=0&limit=120`,
      { method: 'GET' },
    );
    if (!rightsizingRes.ok) return null;

    const payload = (await rightsizingRes.json()) as RightsizingResponseLite;
    const candidates = (Array.isArray(payload?.recommendations) ? payload.recommendations : [])
      .filter((item) => matchesRequestedProvider(item, requestedProvider))
      .filter(wantsVmScope ? isProviderBackedVmRightsizingCandidate : isProviderBackedRightsizingCandidate)
      .sort((a, b) => {
        const savingsDiff = toSafeNumber(b.monthly_savings_usd) - toSafeNumber(a.monthly_savings_usd);
        if (savingsDiff !== 0) return savingsDiff;
        return toSafeNumber(b.current_monthly_cost_usd) - toSafeNumber(a.current_monthly_cost_usd);
      });

    if (candidates.length > 0) {
      const lines: string[] = [];
      lines.push(`Yes. This is wired to the live rightsizing feed across ${providerLabel}.`);
      lines.push('Over-provisioning is evaluated at the cloud resource level, not as generic tenancy, account, segment, or service aggregates.');
      lines.push(
        `Top ${wantsVmScope ? 'VM ' : ''}rightsizing candidates:\n${candidates
          .slice(0, 5)
          .map((item, idx) => {
            const action = sanitizeText(item.action) || 'optimize';
            const currentSize = sanitizeText(item.current_size);
            const recommendedSize = sanitizeText(item.recommended_size);
            const provider = providerDisplayName(sanitizeText(item.provider));
            const shapeChange = currentSize || recommendedSize
              ? `, ${currentSize || 'current shape'} -> ${recommendedSize || 'recommended shape'}`
              : '';
            return `${idx + 1}. ${summarizeResourceLabel(item)}: ${provider} ${action}${shapeChange}, save ${formatMoney(toSafeNumber(item.monthly_savings_usd))}/month. Resource ID: ${sanitizeText(item.resource_id)}`;
          })
          .join('\n')}`
      );
      lines.push('Evidence sources include provider-backed rightsizing and utilization feeds. Tenancy, account, segment, service snapshot, and imported aggregate rows are excluded from this answer.');
      return lines.join('\n\n');
    }
  } catch (error) {
    console.warn('Provider rightsizing lookup failed:', error);
  }

  if (allowRefresh) {
    const refreshed = await triggerLiveProviderMetricsRefresh('provider_rightsizing_query');
    if (refreshed) {
      return buildProviderRightsizingReply(message, false);
    }
  }

  return `I checked the live rightsizing feed across ${providerLabel}, but it did not return any real ${wantsVmScope ? 'VM ' : ''}resource candidates right now.

I excluded tenancy, account, segment, service-level, and imported aggregate rows from this answer. Refresh provider inventory, utilization, and rightsizing data, then retry.`;
}

async function buildResourceHotspotReply(message: string, allowRefresh = true): Promise<string | null> {
  const apiBase = resolveBackendApiBase();
  const focus = detectResourceFocus(message);
  const queryTokens = extractQueryTokens(message);
  const q = message.toLowerCase();
  const wantsServiceView = q.includes('service');
  const wantsVmScope = isVmScopedQuestion(message) || isVMCostHotspotQuestion(message) || isVMUtilizationQuestion(message);
  const requestedProvider = detectRequestedProvider(message);
  const providerParam = requestedProvider || 'all';

  // First choice: rightsizing feed gives actionable resource-level recommendations.
  try {
    const rightsizingRes = await fetch(
      `${apiBase}/api/v1/recommendations/rightsizing?provider=${encodeURIComponent(providerParam)}&min_savings=0&limit=120`,
      { method: 'GET' },
    );
    if (rightsizingRes.ok) {
      const payload = (await rightsizingRes.json()) as RightsizingResponseLite;
      const recs = (Array.isArray(payload?.recommendations) ? payload.recommendations : [])
        .filter((item) => matchesRequestedProvider(item, requestedProvider))
        .filter(wantsVmScope ? isProviderBackedVmRightsizingCandidate : isProviderBackedRightsizingCandidate);
      const sorted = recs
        .slice()
        .sort((a, b) => toSafeNumber(b.current_monthly_cost_usd) - toSafeNumber(a.current_monthly_cost_usd));
      const tokenMatched = queryTokens.length > 0
        ? sorted.filter((item) => matchesQueryTokens(item, queryTokens))
        : [];
      const focused = focus ? sorted.filter((item) => matchesResourceFocus(item, focus)) : sorted;
      const candidates = tokenMatched.length > 0 ? tokenMatched : (focus ? focused : sorted);
      if (candidates.length > 0) {
        const top = candidates[0];
        const lines: string[] = [];
        if (focus) {
          lines.push(`Your highest-cost actionable ${focus.label} resource is ${summarizeResourceLabel(top)} at ${formatMoney(toSafeNumber(top.current_monthly_cost_usd))}/month.`);
        } else if (wantsVmScope) {
          lines.push(`Your highest-cost actionable VM resource is ${summarizeResourceLabel(top)} at ${formatMoney(toSafeNumber(top.current_monthly_cost_usd))}/month.`);
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
        lines.push('Evidence comes from provider-backed rightsizing or utilization feeds. Tenancy, account, segment, service snapshot, and imported aggregate rows are excluded.');
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
      const items = (Array.isArray(payload?.items) ? payload.items : [])
        .filter((item) => matchesRequestedProvider(item, requestedProvider))
        .filter(wantsVmScope ? isProviderBackedVmInventoryItem : isProviderBackedInventoryItem);
      const sorted = items
        .slice()
        .sort((a, b) => toSafeNumber(b.cost_usd) - toSafeNumber(a.cost_usd));
      const tokenMatched = queryTokens.length > 0
        ? sorted.filter((item) => matchesQueryTokens(item, queryTokens))
        : [];
      const focused = focus ? sorted.filter((item) => matchesResourceFocus(item, focus)) : sorted;
      const candidates = tokenMatched.length > 0 ? tokenMatched : (focus ? focused : sorted);
      if (candidates.length > 0) {
        const top = candidates[0];
        const next = candidates.slice(1, 4);
        const lines: string[] = [];
        if (focus) {
          lines.push(`Your highest visible ${focus.label} cost resource is ${summarizeResourceLabel(top)} at ${formatMoney(toSafeNumber(top.cost_usd))}/month.`);
        } else if (wantsVmScope) {
          lines.push(`Your highest visible VM cost resource is ${summarizeResourceLabel(top)} at ${formatMoney(toSafeNumber(top.cost_usd))}/month.`);
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

  if (wantsVmScope) {
    if (allowRefresh) {
      const refreshed = await triggerLiveProviderMetricsRefresh('vm_resource_hotspot_query');
      if (refreshed) {
        const retry = await buildResourceHotspotReply(message, false);
        if (retry) return retry;
      }
    }
    return `I checked provider-backed rightsizing and inventory feeds, but I could not find a real VM resource for this question.

I excluded boot/block volumes, account or tenancy records, service snapshots, and imported aggregates so the answer does not confuse storage or rollups with virtual machines. Please retry with provider + VM resource ID/name, for example: "OCI instance ocid1... in af-johannesburg-1", "AWS EC2 i-... in us-east-1", "Azure VM /subscriptions/.../virtualMachines/...", or "GCP instance projects/.../instances/...".`;
  }

  // Third choice: service-level hotspots for non-compute resources.
  if (focus || wantsServiceView || queryTokens.length > 0) {
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

        if ((focus || queryTokens.length > 0) && items.length === 0) {
          serviceRes = await fetch(
            `${apiBase}/api/v1/analytics/service-hotspots?period=month&cloud_provider=all&limit=30`,
            { method: 'GET' },
          );
          if (serviceRes.ok) {
            payload = (await serviceRes.json()) as ServiceHotspotResponseLite;
            items = Array.isArray(payload?.items) ? payload.items : [];
            usedGenericFallback = items.length > 0;
          }
        }

        if (queryTokens.length > 0 && items.length > 0) {
          const tokenMatches = items.filter((item) =>
            matchesQueryTokens(
              {
                service: item.service,
                provider: item.provider,
              },
              queryTokens,
            ),
          );
          if (tokenMatches.length > 0) {
            items = tokenMatches;
            usedGenericFallback = false;
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

  if (queryTokens.length > 0) {
    if (allowRefresh) {
      const refreshed = await triggerLiveProviderMetricsRefresh('resource_hotspot_query');
      if (refreshed) {
        const retry = await buildResourceHotspotReply(message, false);
        if (retry) return retry;
      }
    }
    return `I attempted a live provider metrics refresh, but still could not find matched spend data for the requested cloud product/service (${queryTokens.join(', ')}).\n\nTry next:\n1. Confirm the exact provider service label in billing exports.\n2. Ask for top services by provider so we can map naming.\n3. Verify the provider account/region is connected and has recent cost data.`;
  }

  return null;
}

async function buildResourceCountReply(message: string, allowRefresh = true): Promise<string | null> {
  const apiBase = resolveBackendApiBase();
  const focus = detectResourceFocus(message);
  const queryTokens = extractQueryTokens(message);

  try {
    const inventoryRes = await fetch(
      `${apiBase}/api/v1/inventory/resources?provider=all&limit=1000&offset=0`,
      { method: 'GET' },
    );
    if (inventoryRes.ok) {
      const payload = (await inventoryRes.json()) as ResourceInventoryResponseLite & {
        total_resources?: number;
        total_cost_usd?: number;
      };
      const allItems = (Array.isArray(payload?.items) ? payload.items : [])
        .filter((item) => !isAggregateLikeResource(item));
      const tokenMatched = queryTokens.length > 0
        ? allItems.filter((item) => matchesQueryTokens(item, queryTokens))
        : [];
      const focused = focus ? allItems.filter((item) => matchesResourceFocus(item, focus)) : allItems;
      const matched = tokenMatched.length > 0 ? tokenMatched : focused;

      if (matched.length > 0) {
        const label = focus ? `${focus.label} resources` : 'resources';
        const combinedMonthly = matched.reduce((sum, item) => sum + toSafeNumber(item.cost_usd), 0);
        const lines: string[] = [];
        lines.push(`I currently track ${matched.length} ${label} in your latest inventory snapshot.`);
        lines.push(`Combined monthly cost across these ${label}: ${formatMoney(combinedMonthly)}.`);

        const top = matched
          .slice()
          .sort((a, b) => toSafeNumber(b.cost_usd) - toSafeNumber(a.cost_usd))
          .slice(0, 3);
        if (top.length > 0) {
          lines.push(
            `Top ${focus ? `${focus.label} ` : ''}items by cost:\n${top
              .map((item, idx) => `${idx + 1}. ${summarizeResourceLabel(item)} — ${formatMoney(toSafeNumber(item.cost_usd))}/month`)
              .join('\n')}`
          );
        }
        return lines.join('\n\n');
      }

      if (!focus && Number.isFinite(Number(payload?.total_resources))) {
        const totalResources = toSafeNumber(payload?.total_resources);
        const totalCost = toSafeNumber(payload?.total_cost_usd);
        return `I currently track ${totalResources.toFixed(0)} resources in inventory with total monthly cost ${formatMoney(totalCost)}.`;
      }
    }
  } catch (error) {
    console.warn('Resource count via inventory failed:', error);
  }

  if (focus || queryTokens.length > 0) {
    try {
      const focusParam = focus ? `&focus=${encodeURIComponent(focus.key)}` : '';
      const serviceRes = await fetch(
        `${apiBase}/api/v1/analytics/service-hotspots?period=month&cloud_provider=all&limit=100${focusParam}`,
        { method: 'GET' },
      );
      if (serviceRes.ok) {
        const payload = (await serviceRes.json()) as ServiceHotspotResponseLite;
        let items = Array.isArray(payload?.items) ? payload.items : [];

        if (queryTokens.length > 0 && items.length > 0) {
          const tokenMatches = items.filter((item) =>
            matchesQueryTokens(
              {
                service: item.service,
                provider: item.provider,
              },
              queryTokens,
            ),
          );
          if (tokenMatches.length > 0) {
            items = tokenMatches;
          }
        }

        if (items.length > 0) {
          const providers = new Set(
            items
              .map((item) => sanitizeText(item.provider).toLowerCase())
              .filter(Boolean),
          );
          const totalMonthly = toSafeNumber(payload?.total_monthly_cost_usd) || items.reduce((sum, item) => {
            return sum + toSafeNumber(item.monthly_cost_usd);
          }, 0);
          const lines: string[] = [];
          if (focus) {
            lines.push(
              `From billing telemetry, I track ${items.length} ${focus.label}-related cloud services across ${providers.size || 1} provider(s).`
            );
          } else {
            lines.push(
              `From billing telemetry, I track ${items.length} matched cloud services across ${providers.size || 1} provider(s).`
            );
          }
          lines.push(`Combined monthly spend for this group: ${formatMoney(totalMonthly)}.`);
          lines.push(
            `Top services:\n${items
              .slice(0, 3)
              .map((item, idx) => {
                const provider = sanitizeText(item.provider).toUpperCase() || 'N/A';
                const service = sanitizeText(item.service) || 'unknown-service';
                return `${idx + 1}. ${service} (${provider}) — ${formatMoney(toSafeNumber(item.monthly_cost_usd))}/month`;
              })
              .join('\n')}`
          );
          lines.push('Note: this is service-level cost telemetry, not exact instance count from every cloud inventory API.');
          return lines.join('\n\n');
        }
      }
    } catch (error) {
      console.warn('Resource count via service hotspots failed:', error);
    }

    if (allowRefresh) {
      const refreshed = await triggerLiveProviderMetricsRefresh('resource_count_query');
      if (refreshed) {
        const retry = await buildResourceCountReply(message, false);
        if (retry) return retry;
      }
    }
    return `I triggered a live provider metrics refresh, but I still couldn't map that product/service in current telemetry (${queryTokens.join(', ') || (focus?.label ?? 'requested focus')}).\n\nNext best action:\n1. Confirm the exact provider service name used in billing.\n2. Ensure this account/region has recent cost export data.\n3. Retry with provider + service (example: "AWS RDS in us-east-1").`;
  }

  return null;
}

async function buildVMCostHotspotReply(allowRefresh = true): Promise<string | null> {
  const apiBase = resolveBackendApiBase();

  try {
    const rightsizingRes = await fetch(
      `${apiBase}/api/v1/recommendations/rightsizing?provider=all&min_savings=0&limit=120`,
      { method: 'GET' },
    );
    if (rightsizingRes.ok) {
      const payload = (await rightsizingRes.json()) as RightsizingResponseLite;
      const recs = (Array.isArray(payload?.recommendations) ? payload.recommendations : [])
        .filter(isProviderBackedVmRightsizingCandidate);
      const sorted = recs
        .slice()
        .sort((a, b) => toSafeNumber(b.current_monthly_cost_usd) - toSafeNumber(a.current_monthly_cost_usd));
      const vmCandidates = sorted;
      if (vmCandidates.length > 0) {
        const top = vmCandidates[0];
        const lines: string[] = [];
        lines.push(`Your highest-cost VM is ${summarizeResourceLabel(top)} at ${formatMoney(toSafeNumber(top.current_monthly_cost_usd))}/month.`);
        lines.push(
          `Recommended action: ${sanitizeText(top.action) || 'optimize'} ${sanitizeText(top.current_size) ? `from ${sanitizeText(top.current_size)}` : ''}${sanitizeText(top.recommended_size) ? ` to ${sanitizeText(top.recommended_size)}` : ''}. Estimated savings: ${formatMoney(toSafeNumber(top.monthly_savings_usd))}/month.`
        );
        if (sanitizeText(top.reason)) lines.push(`Why: ${sanitizeText(top.reason)}`);
        if (sanitizeText(top.resource_id)) lines.push(`Resource ID: ${sanitizeText(top.resource_id)}`);
        if (sanitizeText(top.resource_console_url)) lines.push(`Console link: ${sanitizeText(top.resource_console_url)}`);
        return lines.join('\n\n');
      }
    }
  } catch (error) {
    console.warn('VM cost hotspot via rightsizing failed:', error);
  }

  try {
    const inventoryRes = await fetch(
      `${apiBase}/api/v1/inventory/resources?provider=all&limit=500&offset=0`,
      { method: 'GET' },
    );
    if (inventoryRes.ok) {
      const payload = (await inventoryRes.json()) as ResourceInventoryResponseLite;
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const vmItems = items.filter((item) => {
        return isProviderBackedVmInventoryItem(item);
      });
      vmItems.sort((a, b) => toSafeNumber(b.cost_usd) - toSafeNumber(a.cost_usd));
      if (vmItems.length > 0) {
        const top = vmItems[0];
        return `Your highest visible VM cost resource is ${summarizeResourceLabel(top)} at ${formatMoney(toSafeNumber(top.cost_usd))}/month.`;
      }
    }
  } catch (error) {
    console.warn('VM cost hotspot via inventory failed:', error);
  }

  if (allowRefresh) {
    const refreshed = await triggerLiveProviderMetricsRefresh('vm_cost_hotspot_query');
    if (refreshed) {
      return buildVMCostHotspotReply(false);
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

async function fetchJsonSafe<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildTopLines<T>(
  items: T[],
  mapper: (item: T, idx: number) => string,
  max = 5,
): string[] {
  return items.slice(0, max).map((item, idx) => mapper(item, idx));
}

async function buildRAGContext(message: string, allowRefresh = true): Promise<string> {
  const apiBase = resolveBackendApiBase();
  const focus = detectResourceFocus(message);
  const focusParam = focus ? `&focus=${encodeURIComponent(focus.key)}` : '';
  const analysisType = pickAnalysisType(message);
  const wantsVmScope = isVmScopedQuestion(message) || isVMCostHotspotQuestion(message) || isVMUtilizationQuestion(message);

  const [hybrid, serviceHotspots, inventory, rightsizing, ragGuidance] = await Promise.all([
    fetchJsonSafe<HybridAdvisorResult>(
      `${apiBase}/api/v1/advisor/hybrid?narrative_type=optimization_roadmap&cloud_provider=all`,
    ),
    fetchJsonSafe<ServiceHotspotResponseLite>(
      `${apiBase}/api/v1/analytics/service-hotspots?period=month&cloud_provider=all&limit=8${focusParam}`,
    ),
    fetchJsonSafe<ResourceInventoryResponseLite & { total_resources?: number; total_cost_usd?: number }>(
      `${apiBase}/api/v1/inventory/resources?provider=all&limit=200&offset=0`,
    ),
    fetchJsonSafe<RightsizingResponseLite>(
      `${apiBase}/api/v1/recommendations/rightsizing?provider=all&min_savings=0&limit=20`,
    ),
    fetchPostJsonSafe<RagGuidanceResponseLite>(
      `${apiBase}/api/v1/genai/rag-guidance`,
      {
        analysis_type: analysisType,
        cloud_provider: 'all',
        top_k: 4,
        context: {
          user_question: message,
          resource_focus: focus?.key || '',
        },
      },
    ),
  ]);

  const lines: string[] = [];

  const monthlySpend = toSafeNumber(hybrid?.deterministic?.analytics?.current_monthly_spend_usd);
  const wasteUsd = toSafeNumber(hybrid?.deterministic?.waste?.total_estimated_waste_usd);
  const efficiency = toSafeNumber(hybrid?.deterministic?.efficiency?.overall_score);
  if (monthlySpend > 0 || wasteUsd > 0 || efficiency > 0) {
    lines.push(
      `Deterministic baseline: monthly spend ${formatMoney(monthlySpend)}, estimated waste ${formatMoney(wasteUsd)}, efficiency score ${efficiency.toFixed(0)}/100.`,
    );
  }

  const hotspotItems = Array.isArray(serviceHotspots?.items) ? serviceHotspots.items : [];
  if (!wantsVmScope && hotspotItems.length > 0) {
    lines.push('Top services by monthly spend:');
    lines.push(
      ...buildTopLines(hotspotItems, (item, idx) => {
        const provider = sanitizeText(item.provider).toUpperCase() || 'N/A';
        const service = sanitizeText(item.service) || 'unknown-service';
        return `${idx + 1}. ${service} (${provider}) ${formatMoney(toSafeNumber(item.monthly_cost_usd))}/month`;
      }, 5),
    );
  }

  const inventoryItems = (Array.isArray(inventory?.items) ? inventory.items : [])
    .filter(wantsVmScope ? isProviderBackedVmInventoryItem : isProviderBackedInventoryItem);
  if (inventoryItems.length > 0) {
    const totalResources = inventoryItems.length;
    const totalCost = inventoryItems.reduce((sum, item) => sum + toSafeNumber(item.cost_usd), 0);
    lines.push(`${wantsVmScope ? 'VM resource' : 'Resource'} inventory snapshot: ${totalResources.toFixed(0)} resources, total ${formatMoney(totalCost)}/month.`);
    const topInventory = inventoryItems
      .slice()
      .sort((a, b) => toSafeNumber(b.cost_usd) - toSafeNumber(a.cost_usd));
    lines.push(`Most expensive ${wantsVmScope ? 'VM inventory items' : 'inventory items'}:`);
    lines.push(
      ...buildTopLines(topInventory, (item, idx) => {
        return `${idx + 1}. ${summarizeResourceLabel(item)} ${formatMoney(toSafeNumber(item.cost_usd))}/month`;
      }, 5),
    );
  }

  const rightsizingItems = (Array.isArray(rightsizing?.recommendations) ? rightsizing.recommendations : [])
    .filter(wantsVmScope ? isProviderBackedVmRightsizingCandidate : isProviderBackedRightsizingCandidate);
  if (rightsizingItems.length > 0) {
    const topRightsizing = rightsizingItems
      .slice()
      .sort((a, b) => toSafeNumber(b.monthly_savings_usd) - toSafeNumber(a.monthly_savings_usd));
    lines.push(`Top ${wantsVmScope ? 'VM ' : ''}rightsizing opportunities:`);
    lines.push(
      ...buildTopLines(topRightsizing, (item, idx) => {
        const name = sanitizeText(item.resource_name) || sanitizeText(item.resource_id) || 'unknown-resource';
        const action = sanitizeText(item.action) || 'optimize';
        return `${idx + 1}. ${name}: ${action}, save ${formatMoney(toSafeNumber(item.monthly_savings_usd))}/month`;
      }, 5),
    );
  }

  const ragDocs = Array.isArray(ragGuidance?.rag?.retrieved_docs) ? ragGuidance.rag.retrieved_docs : [];
  if (ragDocs.length > 0) {
    lines.push('Retrieved FinOps guidance catalog snippets:');
    lines.push(
      ...buildTopLines(ragDocs, (doc, idx) => {
        const id = sanitizeText(doc.id) || `rag-${idx + 1}`;
        const topic = sanitizeText(doc.topic) || 'FinOps guidance';
        const guidance = sanitizeText(doc.guidance);
        const source = sanitizeText(doc.source);
        return `${idx + 1}. [${id}] ${topic}: ${guidance}${source ? ` (source: ${source})` : ''}`;
      }, 4),
    );
  } else if (sanitizeText(ragGuidance?.rag?.rag_brief)) {
    lines.push('Retrieved FinOps guidance catalog snippets:');
    lines.push(sanitizeText(ragGuidance?.rag?.rag_brief));
  }

  if (lines.length === 0) {
    if (allowRefresh) {
      const refreshed = await triggerLiveProviderMetricsRefresh('rag_context_query');
      if (refreshed) {
        return buildRAGContext(message, false);
      }
    }
    return 'No internal telemetry context available right now. Ask user to refresh scans/imports before providing specific resource claims.';
  }

  return lines.join('\n');
}

async function buildHumanRAGAnswer(
  message: string,
  conversationHistory: ConversationEntry[],
  targetLanguage: SupportedLanguage,
): Promise<string> {
  const context = await buildRAGContext(message);
  const prompt = `User question:
${message}

Retrieved cloud telemetry context:
${context}

Instructions:
1) Answer like an experienced FinOps specialist with a natural, human tone.
2) Ground claims in the retrieved context above. Do not invent metrics/resources.
3) If context is insufficient, say exactly what is missing and ask one clarifying follow-up.
4) Keep numbers, currency amounts, IDs, and links exact.
5) End with 2-3 practical next steps.
6) Keep answer concise and executive-friendly.
7) Always answer in English for now, even if the question or prior conversation uses another language.`;
  return callOCIGenAI(prompt, conversationHistory, {
    mode: 'assistant',
    targetLanguage,
  });
}

async function humanizeDeterministicReply(
  question: string,
  deterministicReply: string,
  targetLanguage: SupportedLanguage,
): Promise<string> {
  if (!sanitizeText(deterministicReply)) return deterministicReply;
  const prompt = `User question:
${question}

Deterministic factual answer (authoritative):
${deterministicReply}

Rewrite this as a natural, human FinOps advisor response.
Keep all numbers and factual claims exactly the same.
Do not remove important details; improve readability and flow.`;
  return callOCIGenAI(prompt, [], {
    mode: 'assistant',
    targetLanguage,
  });
}

function localHumanizedFallbackReply(deterministicReply: string): string {
  const text = sanitizeText(deterministicReply);
  if (!text) {
    return "I couldn't retrieve enough telemetry yet to answer confidently. Please refresh scans/imports and I’ll retry with concrete numbers.";
  }
  if (text.startsWith('I could not find matched tracked resources')) {
    return `I checked your latest telemetry, but I still can't find a direct match for that service/product in current cost and inventory feeds.

This usually means the service is not yet labeled consistently in billing exports or recent scans.

Next best step:
1. Refresh provider scans/imports.
2. Ask for top services by provider so we can identify the exact service label.
3. Retry with provider + exact service name.`;
  }
  return `Here’s what I found from your latest telemetry:

${text}`;
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
  const signingHeaders = ['(request-target)', 'host', 'date', 'content-type', 'content-length', 'x-content-sha256'];
  const date = new Date().toUTCString();
  const contentLength = Buffer.byteLength(body).toString();
  const contentType = headers['content-type'] || 'application/json';
  const contentSha256 = crypto.createHash('sha256').update(body).digest('base64');

  const signingString = [
    `(request-target): ${method.toLowerCase()} ${path}`,
    `host: ${host}`,
    `date: ${date}`,
    `content-type: ${contentType}`,
    `content-length: ${contentLength}`,
    `x-content-sha256: ${contentSha256}`
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
    'x-content-sha256': contentSha256,
    authorization: auth
  };
}

type GenAICallMode = 'assistant' | 'translation';

interface GenAICallOptions {
  mode?: GenAICallMode;
  targetLanguage?: SupportedLanguage;
}

function extractOCIChatText(payload: unknown): string {
  const data = payload as Record<string, any>;
  const choice =
    data?.chatResponse?.choices?.[0] ??
    data?.data?.chatResponse?.choices?.[0] ??
    data?.data?.choices?.[0] ??
    data?.choices?.[0];
  const content = choice?.message?.content;
  if (Array.isArray(content)) {
    const text = content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim();
    if (text) return text;
  }
  if (typeof content === 'string' && content.trim()) return content.trim();
  if (typeof choice?.text === 'string' && choice.text.trim()) return choice.text.trim();
  if (typeof data?.chatResponse?.text === 'string' && data.chatResponse.text.trim()) {
    return data.chatResponse.text.trim();
  }
  if (typeof data?.data?.chatResponse?.text === 'string' && data.data.chatResponse.text.trim()) {
    return data.data.chatResponse.text.trim();
  }
  return '';
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
  const compartmentId = required(
    'OCI_GENAI_COMPARTMENT_ID or OCI_COMPARTMENT_OCID',
    env('OCI_GENAI_COMPARTMENT_ID') || env('OCI_COMPARTMENT_OCID'),
  );

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
    compartmentId,
    servingMode: { modelId: model, servingType: 'ON_DEMAND' },
    chatRequest: {
      apiFormat: 'GENERIC',
      messages: [
        { role: 'USER', content: [{ type: 'TEXT', text: systemPrompt }] },
        ...history.map(h => ({
          role: h.role === 'assistant' ? 'ASSISTANT' : 'USER',
          content: [{ type: 'TEXT', text: h.content }],
        })),
        { role: 'USER', content: [{ type: 'TEXT', text: prompt }] }
      ],
      maxTokens: 800,
      temperature: mode === 'translation' ? 0 : 0.2,
      topP: 0.9,
      frequencyPenalty: 0,
      presencePenalty: 0
    }
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
    body,
    signal: AbortSignal.timeout(35_000),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OCI GenAI error ${res.status}: ${detail}`);
  }

  const json = await res.json();
  return extractOCIChatText(json) || 'No response generated';
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
        const fallback = localHumanizedFallbackReply(lifecycleReply);
        return await localizeResponseText(fallback, preferredLanguage);
      }
      const lifecycleUnavailable = `I attempted to refresh live provider telemetry, but I still could not find lifecycle metadata for the requested resource.

Please retry with provider + region + resource ID/name (for example: "OCI instance ocid1... in af-johannesburg-1").`;
      return await localizeResponseText(lifecycleUnavailable, preferredLanguage);
    }
    if (isVMUtilizationQuestion(message)) {
      const vmReply = await buildVMUtilizationReply(message);
      if (vmReply) {
        const fallback = localHumanizedFallbackReply(vmReply);
        return await localizeResponseText(fallback, preferredLanguage);
      }
      const vmUnavailable = `I attempted to fetch live VM utilization metrics, but CPU/memory/disk/network telemetry is still unavailable for this scope.

This usually means monitoring metrics are not yet ingested for the target account/region.

Please retry with provider + region, or connect monitoring telemetry for VM performance metrics.`;
      return await localizeResponseText(vmUnavailable, preferredLanguage);
    }
    if (isResourceCountQuestion(message)) {
      const resourceCountReply = await buildResourceCountReply(message);
      if (resourceCountReply) {
        const fallback = localHumanizedFallbackReply(resourceCountReply);
        return await localizeResponseText(fallback, preferredLanguage);
      }
      // Continue to broader advisory flow if inventory/service feeds are unavailable.
    }
    if (isRightsizingQuestion(message)) {
      const rightsizingReply = await buildProviderRightsizingReply(message);
      if (rightsizingReply) {
        const fallback = localHumanizedFallbackReply(rightsizingReply);
        return await localizeResponseText(fallback, preferredLanguage);
      }
    }
    if (isVMCostHotspotQuestion(message)) {
      const vmCostReply = await buildVMCostHotspotReply();
      if (vmCostReply) {
        const fallback = localHumanizedFallbackReply(vmCostReply);
        return await localizeResponseText(fallback, preferredLanguage);
      }
      const vmCostUnavailable = `I attempted a live provider metrics refresh, but VM cost hotspot data is still unavailable for the requested scope.

Please verify provider account connectivity and recent billing ingestion, then retry.`;
      return await localizeResponseText(vmCostUnavailable, preferredLanguage);
    }
    if (isResourceHotspotQuestion(message)) {
      const hotspotReply = await buildResourceHotspotReply(message);
      if (hotspotReply) {
        const fallback = localHumanizedFallbackReply(hotspotReply);
        return await localizeResponseText(fallback, preferredLanguage);
      }
      // Continue to broader advisory flow if resource-level feeds are empty.
    }

    const validation = validateQueryScope(message);
    if (!validation.valid) {
      return localizeScopeReason(validation.reason, preferredLanguage);
    }
    try {
      const ragAnswer = await buildHumanRAGAnswer(message, conversationHistory, preferredLanguage);
      const clean = sanitizeText(ragAnswer);
      if (clean) {
        return clean;
      }
    } catch (error) {
      console.warn('RAG answer generation failed, falling back to legacy flow:', error);
    }
    if (!isDeterministicFinopsQuestion(message)) {
      try {
        const direct = await callOCIGenAI(message, conversationHistory, {
          mode: 'assistant',
          targetLanguage: preferredLanguage,
        });
        return await localizeResponseText(direct, preferredLanguage);
      } catch (error) {
        console.warn('Direct cloud assistant call failed, using deterministic fallback:', error);
        const fallback = await buildDeterministicFallbackReply(message);
        return await localizeResponseText(fallback, preferredLanguage);
      }
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
