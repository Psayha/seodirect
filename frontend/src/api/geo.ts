import { api } from './client'

export interface GeoKeyword {
  id: string
  keyword: string
  source: 'semantic' | 'topvisor' | 'manual'
}

export interface GeoScanCellResult {
  mentioned: boolean
  position: 'first' | 'middle' | 'end' | null
  sentiment: 'positive' | 'neutral' | 'negative' | null
  snippet: string | null
  competitor_domains: string[]
  scanned_at: string
}

export interface GeoMatrixRow {
  keyword_id: string
  keyword: string
  source: string
  results: Record<string, GeoScanCellResult>  // model → result
}

export interface GeoResultsResponse {
  ai_visibility_score: number | null
  rows: GeoMatrixRow[]
  top_competitors: { domain: string; count: number }[]
}

export interface AiReadinessAudit {
  id: string
  ai_readiness_score: number
  blocked_bots: string[]
  cloudflare_detected: boolean
  has_llms_txt: boolean
  llms_txt_content: string | null
  has_about_page: boolean
  has_author_page: boolean
  pages_freshness: Record<string, { last_updated: string | null; age_days: number | null; status: string }>
  audit_json: Record<string, unknown>
  created_at: string
}

export interface GeoModel {
  id: string
  name: string
  is_default: boolean
}

export const geoApi = {
  // Keywords
  listKeywords: (projectId: string): Promise<GeoKeyword[]> =>
    api.get(`/projects/${projectId}/geo/keywords`).then((r) => r.data),

  addKeywords: (projectId: string, keywords: { keyword: string; source?: string }[]): Promise<GeoKeyword[]> =>
    api.post(`/projects/${projectId}/geo/keywords`, keywords).then((r) => r.data),

  deleteKeyword: (projectId: string, kwId: string): Promise<void> =>
    api.delete(`/projects/${projectId}/geo/keywords/${kwId}`).then(() => undefined),

  // Models
  listModels: (): Promise<GeoModel[]> =>
    api.get('/geo/models').then((r) => r.data),

  // Scan
  startScan: (
    projectId: string,
    kwIds: string[],
    models: string[]
  ): Promise<{ task_id: string; status: string }> =>
    api.post(`/projects/${projectId}/geo/scan`, { keyword_ids: kwIds, models }).then((r) => r.data),

  getResults: (projectId: string): Promise<GeoResultsResponse> =>
    api.get(`/projects/${projectId}/geo/results`).then((r) => r.data),

  // Audit
  runAudit: (projectId: string): Promise<{ task_id: string; status: string }> =>
    api.post(`/projects/${projectId}/geo/audit/run`).then((r) => r.data),

  getAudit: (projectId: string): Promise<AiReadinessAudit | null> =>
    api.get(`/projects/${projectId}/geo/audit`).then((r) => r.data),

  getLlmsTxt: (projectId: string): Promise<{ content: string; filename: string }> =>
    api.get(`/projects/${projectId}/geo/audit/llms-txt`).then((r) => r.data),
}
