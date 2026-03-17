import { api } from './client'

export interface SeoPage {
  page_url: string
  current_title: string | null
  current_description: string | null
  current_og_title: string | null
  current_og_description: string | null
  current_og_image: string | null
  rec_title: string | null
  rec_description: string | null
  rec_og_title: string | null
  rec_og_description: string | null
  meta_id: string | null
  manually_edited: boolean
  generated_at: string | null
  has_title_issue: boolean
  has_desc_issue: boolean
  has_og_issue: boolean
}

export interface ChecklistItem {
  category: string
  name: string
  count: number
  total: number
  pct: string
  status: 'ok' | 'warn' | 'error'
  description: string
}

export interface SeoChecklist {
  status: string
  pages_total: number
  score: number
  items: ChecklistItem[]
  crawl_date: string | null
}

export const seoApi = {
  getPages: (projectId: string, params?: { issues_only?: boolean; limit?: number; offset?: number }) =>
    api.get<{ pages: SeoPage[]; total: number; crawl_status: string }>(
      `/projects/${projectId}/seo/pages`,
      { params }
    ).then((r) => r.data),

  updateMeta: (projectId: string, pageUrl: string, data: {
    rec_title?: string
    rec_description?: string
    rec_og_title?: string
    rec_og_description?: string
  }) =>
    api.patch(`/projects/${projectId}/seo/meta`, data, { params: { page_url: pageUrl } }).then((r) => r.data),

  generateMeta: (projectId: string, generate_og: boolean = false) =>
    api.post<{ task_id: string }>(`/projects/${projectId}/seo/generate-meta`, null, { params: { generate_og } }).then((r) => r.data),

  getTaskStatus: (projectId: string, taskId: string) =>
    api.get<{ status: string; progress: number; result: Record<string, unknown> | null; error: string | null }>(
      `/projects/${projectId}/seo/task/${taskId}`
    ).then((r) => r.data),

  getChecklist: (projectId: string) =>
    api.get<SeoChecklist>(`/projects/${projectId}/seo/checklist`).then((r) => r.data),
}
