import { api } from './client'

export interface Project {
  id: string
  name: string
  client_name: string
  url: string
  status: string
  specialist_id: string | null
  budget: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Brief {
  id: string
  project_id: string
  niche: string | null
  products: string | null
  price_segment: string | null
  geo: string | null
  target_audience: string | null
  pains: string | null
  usp: string | null
  competitors_urls: string[]
  campaign_goal: string | null
  ad_geo: string[]
  excluded_geo: string | null
  monthly_budget: string | null
  restrictions: string | null
}

export const projectsApi = {
  list: () => api.get<Project[]>('/projects/').then((r) => r.data),
  get: (id: string) => api.get<Project>(`/projects/${id}`).then((r) => r.data),
  create: (data: Partial<Project>) => api.post<Project>('/projects/', data).then((r) => r.data),
  update: (id: string, data: Partial<Project>) => api.patch<Project>(`/projects/${id}`, data).then((r) => r.data),
  duplicate: (id: string) => api.post<Project>(`/projects/${id}/duplicate`).then((r) => r.data),
  getBrief: (id: string) => api.get<Brief>(`/projects/${id}/brief`).then((r) => r.data),
  updateBrief: (id: string, data: Partial<Brief>) => api.put<Brief>(`/projects/${id}/brief`, data).then((r) => r.data),
}
