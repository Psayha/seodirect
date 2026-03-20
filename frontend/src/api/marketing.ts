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
}
