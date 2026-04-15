// OCI Generative AI chat via HTTPS with request signing using OCI SDK credentials.
// This module avoids any non-OCI providers (e.g., Anthropic / OpenAI) by design.
import crypto from 'crypto';

interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
}

type OCIHttpMethod = 'POST' | 'GET';

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
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
  const region = required('OCI_REGION', process.env.OCI_REGION);
  const tenancyOcid = required('OCI_TENANCY_OCID', process.env.OCI_TENANCY_OCID);
  const userOcid = required('OCI_USER_OCID', process.env.OCI_USER_OCID);
  const fingerprint = required('OCI_FINGERPRINT', process.env.OCI_FINGERPRINT);
  const keyPem = required('OCI_PRIVATE_KEY', process.env.OCI_PRIVATE_KEY);

  const host = new URL(endpoint).host;
  const path = `/20231130/actions/chat`; // OCI Generative AI Chat Inference path

  const payload = {
    compartmentId: required('OCI_COMPARTMENT_OCID', process.env.OCI_COMPARTMENT_OCID),
    modelId: model,
    messages: [
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
    return await callOCIGenAI(message, conversationHistory);
  } catch (error) {
    console.error('OCI GenAI error:', error);
    throw new Error('Failed to get AI response');
  }
}
