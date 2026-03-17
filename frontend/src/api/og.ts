import { api } from './client'

export interface OgPage {
  page_url: string
  og_title: string | null
  og_description: string | null
  og_image: string | null
  og_type: string | null
  rec_og_title: string | null
  rec_og_description: string | null
  meta_id: string | null
  missing_title: boolean
  missing_description: boolean
  missing_image: boolean
  has_rec: boolean
}

export interface OgStats {
  total: number
  has_og_title: number
  has_og_description: number
  has_og_image: number
  fully_ok: number
}

export const ogApi = {
  getAudit: (projectId: string, params?: { issues_only?: boolean; limit?: number; offset?: number }) =>
    api.get<{ pages: OgPage[]; total: number; stats: OgStats; crawl_status: string }>(
      `/projects/${projectId}/og/audit`,
      { params }
    ).then((r) => r.data),

  generate: (projectId: string) =>
    api.post<{ task_id: string }>(`/projects/${projectId}/og/generate`).then((r) => r.data),

  exportHtml: (projectId: string) =>
    api.get<{ snippets: Array<{ page_url: string; html: string }>; total: number }>(
      `/projects/${projectId}/og/export-html`
    ).then((r) => r.data),

  // Reuse SEO meta update for OG
  updateMeta: (projectId: string, pageUrl: string, data: { rec_og_title?: string; rec_og_description?: string }) =>
    api.patch(`/projects/${projectId}/seo/meta`, data, { params: { page_url: pageUrl } }).then((r) => r.data),
}
