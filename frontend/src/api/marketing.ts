import { api } from './client'

export type SemanticMode = 'seo' | 'direct'

export interface SemanticProject {
  id: string
  project_id: string
  name: string
  mode: SemanticMode
  region: string | null
  region_id: number | null
  is_seasonal: boolean
  needs_brand_check: boolean
  pipeline_step: number
  created_at: string
  updated_at: string
}

export interface SemanticKeyword {
  id: string
  phrase: string
  frequency_base: number | null
  frequency_phrase: number | null
  frequency_exact: number | null
  frequency_order: number | null
  kw_type: 'ВЧ' | 'СЧ' | 'НЧ' | null
  intent: string | null
  source: string
  is_mask: boolean
  mask_selected: boolean
  is_branded: boolean
  is_competitor: boolean
  is_seasonal: boolean
  geo_dependent: boolean
  is_excluded: boolean
  cluster_name: string | null
  created_at: string
}

export interface SemanticCluster {
  id: string
  name: string
  intent: string | null
  priority: string | null
  campaign_type: string | null
  suggested_title: string | null
  suggested_description: string | null
  keyword_count: number
  created_at: string
  updated_at: string
}

export interface MinusWord {
  id: string
  word: string
  note: string | null
  added_at: string
}

export interface KeywordsListResponse {
  items: SemanticKeyword[]
  total: number
  page: number
  per_page: number
}

export interface KeywordsParams {
  page?: number
  per_page?: number
  kw_type?: string
  intent?: string
  source?: string
  only_masks?: boolean
  search?: string
}

export const marketingApi = {
  // ── Semantic Projects ───────────────────────────────────────────────────────

  list: (projectId: string): Promise<SemanticProject[]> =>
    api.get(`/projects/${projectId}/marketing/semantic`).then((r) => r.data),

  get: (projectId: string, semId: string): Promise<SemanticProject> =>
    api.get(`/projects/${projectId}/marketing/semantic/${semId}`).then((r) => r.data),

  create: (
    projectId: string,
    data: { name: string; mode: SemanticMode; region?: string | null; region_id?: number | null; is_seasonal?: boolean }
  ): Promise<SemanticProject> =>
    api.post(`/projects/${projectId}/marketing/semantic`, data).then((r) => r.data),

  delete: (projectId: string, semId: string): Promise<void> =>
    api.delete(`/projects/${projectId}/marketing/semantic/${semId}`).then(() => undefined),

  // ── Autopilot ──────────────────────────────────────────────────────────────

  autopilot: (
    projectId: string,
    semId: string,
    data: { min_freq_exact: number }
  ): Promise<{ task_id: string; status: string }> =>
    api.post(`/projects/${projectId}/marketing/semantic/${semId}/autopilot`, data).then((r) => r.data),

  // ── Masks ───────────────────────────────────────────────────────────────────

  expand: (
    projectId: string,
    semId: string,
    data: { min_freq_exact: number; use_brief: boolean }
  ): Promise<{ task_id: string; status: string }> =>
    api.post(`/projects/${projectId}/marketing/semantic/${semId}/expand`, data).then((r) => r.data),

  collectMasks: (projectId: string, semId: string, masks: string[]): Promise<SemanticKeyword[]> =>
    api
      .post(`/projects/${projectId}/marketing/semantic/${semId}/collect-masks`, { masks })
      .then((r) => r.data),

  updateMaskSelection: (
    projectId: string,
    semId: string,
    kwId: string,
    mask_selected: boolean
  ): Promise<SemanticKeyword> =>
    api
      .patch(
        `/projects/${projectId}/marketing/semantic/${semId}/keywords/${kwId}/mask-selection`,
        { mask_selected }
      )
      .then((r) => r.data),

  // ── Keywords ─────────────────────────────────────────────────────────────────

  getKeywords: (projectId: string, semId: string, params?: KeywordsParams): Promise<KeywordsListResponse> =>
    api
      .get(`/projects/${projectId}/marketing/semantic/${semId}/keywords`, { params })
      .then((r) => r.data),

  updateKeyword: (
    projectId: string,
    semId: string,
    kwId: string,
    data: {
      is_excluded?: boolean
      is_branded?: boolean
      is_competitor?: boolean
      is_seasonal?: boolean
      geo_dependent?: boolean
      intent?: string
    }
  ): Promise<SemanticKeyword> =>
    api
      .patch(`/projects/${projectId}/marketing/semantic/${semId}/keywords/${kwId}`, data)
      .then((r) => r.data),

  // ── Cleaning ──────────────────────────────────────────────────────────────────

  autoClean: (
    projectId: string,
    semId: string
  ): Promise<{
    excluded_zero_freq: number
    excluded_long_tail: number
    excluded_minus_words: number
    total_excluded: number
    total_kept: number
    snapshot_id: string
  }> => api.post(`/projects/${projectId}/marketing/semantic/${semId}/auto-clean`).then((r) => r.data),

  completeCleaning: (projectId: string, semId: string): Promise<SemanticProject> =>
    api.post(`/projects/${projectId}/marketing/semantic/${semId}/cleaning/complete`).then((r) => r.data),

  // ── Minus Words ───────────────────────────────────────────────────────────────

  getMinusWords: (projectId: string, semId: string): Promise<MinusWord[]> =>
    api.get(`/projects/${projectId}/marketing/semantic/${semId}/minus-words`).then((r) => r.data),

  addMinusWords: (projectId: string, semId: string, words: string[]): Promise<MinusWord[]> =>
    api
      .post(`/projects/${projectId}/marketing/semantic/${semId}/minus-words`, words.map((w) => ({ word: w })))
      .then((r) => r.data),

  deleteMinusWord: (projectId: string, semId: string, wordId: string): Promise<void> =>
    api
      .delete(`/projects/${projectId}/marketing/semantic/${semId}/minus-words/${wordId}`)
      .then(() => undefined),

  // ── Clustering ─────────────────────────────────────────────────────────────

  startCluster: (projectId: string, semId: string): Promise<{ task_id: string; status: string }> =>
    api.post(`/projects/${projectId}/marketing/semantic/${semId}/cluster`).then((r) => r.data),

  getClusters: (projectId: string, semId: string): Promise<SemanticCluster[]> =>
    api.get(`/projects/${projectId}/marketing/semantic/${semId}/clusters`).then((r) => r.data),

  updateCluster: (
    projectId: string,
    semId: string,
    clusterId: string,
    data: Partial<Pick<SemanticCluster, 'name' | 'intent' | 'priority' | 'campaign_type' | 'suggested_title' | 'suggested_description'>>
  ): Promise<SemanticCluster> =>
    api
      .patch(`/projects/${projectId}/marketing/semantic/${semId}/clusters/${clusterId}`, data)
      .then((r) => r.data),

  deleteCluster: (projectId: string, semId: string, clusterId: string): Promise<void> =>
    api
      .delete(`/projects/${projectId}/marketing/semantic/${semId}/clusters/${clusterId}`)
      .then(() => undefined),

  // ── Export ───────────────────────────────────────────────────────────────────

  exportUrl: (projectId: string, semId: string, fmt: 'xlsx' | 'csv' | 'txt'): string =>
    `/api/projects/${projectId}/marketing/semantic/${semId}/export?fmt=${fmt}`,

  exportBlob: (projectId: string, semId: string, fmt: 'xlsx' | 'csv' | 'txt'): Promise<{ blob: Blob; filename: string }> =>
    api
      .get(`/projects/${projectId}/marketing/semantic/${semId}/export`, {
        params: { fmt },
        responseType: 'blob',
      })
      .then((r) => {
        const disposition: string = r.headers['content-disposition'] ?? ''
        const match = disposition.match(/filename="([^"]+)"/)
        const filename = match ? match[1] : `semantic.${fmt}`
        return { blob: r.data as Blob, filename }
      }),
}
