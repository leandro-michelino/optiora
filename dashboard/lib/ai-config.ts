export type AIProvider = 'oci' | 'chatgpt'

const STORAGE_KEY = 'optiora_ai_provider'

export function getAIProvider(): AIProvider {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'oci' || stored === 'chatgpt') return stored
  }

  const envDefault = process.env.NEXT_PUBLIC_AI_PROVIDER?.toLowerCase()
  if (envDefault === 'chatgpt') return 'chatgpt'
  return 'oci'
}

export function setAIProvider(provider: AIProvider) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, provider)
  }
}

export function getOpenAIConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY || '',
    model: process.env.NEXT_PUBLIC_OPENAI_MODEL || 'gpt-4o-mini',
  }
}

export function getOCIConfig() {
  return {
    endpoint: process.env.OCI_GENAI_ENDPOINT || '',
    model: process.env.OCI_GENAI_MODEL || '',
  }
}