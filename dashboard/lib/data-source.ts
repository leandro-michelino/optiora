import {
  ApiHealth,
  DataSourceState,
  ImportedCostSummaryResponse,
  ProviderDiagnostic,
} from './types'

export interface DataSourceBannerState {
  state: DataSourceState
  label: string
  title: string
  description: string
}

function formatProviderList(diagnostics: ProviderDiagnostic[]): string {
  const configured = diagnostics
    .filter((item) => item.configured)
    .map((item) => item.provider.toUpperCase())
  if (configured.length === 0) {
    return 'none'
  }
  return configured.join(', ')
}

function importedCsvDescription(importedSummary: ImportedCostSummaryResponse): string {
  const filename = importedSummary.source_filename || 'uploaded CSV'
  const rows = importedSummary.rows_imported.toLocaleString('en-US')
  const importedAt = importedSummary.last_imported_at
    ? new Date(importedSummary.last_imported_at).toLocaleString()
    : 'recently'
  return `${filename} is available as an optional manual billing source for this workspace with ${rows} imported row(s), last updated ${importedAt}.`
}

export function buildCostDataSourceStatus({
  health,
  importedSummary,
  diagnostics,
  primaryLoaded,
  pageName,
}: {
  health: ApiHealth | null
  importedSummary: ImportedCostSummaryResponse | null
  diagnostics: ProviderDiagnostic[]
  primaryLoaded: boolean
  pageName: string
}): DataSourceBannerState {
  const healthOk = health?.status === 'healthy'
  const configuredProviders = diagnostics.filter((item) => item.configured)

  if (primaryLoaded && configuredProviders.length > 0) {
    return {
      state: 'live',
      label: 'Live backend',
      title: `${pageName} is using live backend data`,
      description: `Runtime provider access is configured for ${formatProviderList(diagnostics)}. Live provider APIs are preferred when available.`,
    }
  }

  if (primaryLoaded && importedSummary?.has_data) {
    return {
      state: 'imported',
      label: 'Imported CSV',
      title: `${pageName} is using imported billing data`,
      description: `${importedCsvDescription(importedSummary)} Live provider APIs are preferred when configured.`,
    }
  }

  if (primaryLoaded || healthOk) {
    return {
      state: 'partial',
      label: 'Partial data',
      title: `${pageName} has limited runtime data`,
      description:
        configuredProviders.length === 0
          ? 'No live provider runtime is configured yet. Connect cloud providers on the backend host for the preferred data path, or upload a CSV as an optional manual fallback.'
          : `Some backend signals are available, but ${pageName.toLowerCase()} cannot confirm a full live dataset right now.`,
    }
  }

  return {
    state: 'fallback',
    label: 'Backend unavailable',
    title: `${pageName} cannot verify backend data right now`,
    description: 'The API health check is unavailable, so this page should be treated as unverified until the backend recovers.',
  }
}

export function buildLiveDataSourceStatus({
  health,
  diagnostics,
  primaryLoaded,
  pageName,
}: {
  health: ApiHealth | null
  diagnostics: ProviderDiagnostic[]
  primaryLoaded: boolean
  pageName: string
}): DataSourceBannerState {
  const healthOk = health?.status === 'healthy'
  const configuredProviders = diagnostics.filter((item) => item.configured)

  if (primaryLoaded && configuredProviders.length > 0) {
    return {
      state: 'live',
      label: 'Live backend',
      title: `${pageName} is using live backend data`,
      description: `Configured runtime providers: ${formatProviderList(diagnostics)}.`,
    }
  }

  if (primaryLoaded || healthOk) {
    return {
      state: 'partial',
      label: 'Partial data',
      title: `${pageName} is reachable, but live provider data is limited`,
      description:
        configuredProviders.length === 0
          ? 'No runtime provider secrets are configured yet, so empty results may reflect missing backend connectivity rather than true zero activity.'
          : `The page loaded, but ${pageName.toLowerCase()} still has limited live backend coverage.`,
    }
  }

  return {
    state: 'fallback',
    label: 'Backend unavailable',
    title: `${pageName} cannot confirm live backend data`,
    description: 'The backend health check is unavailable, so the page state should be treated as unverified.',
  }
}
