import { api } from './client'

export interface MediaPlanRow {
  month: number
  month_name: string
  year: number
  pct: number
  budget: number
  forecast_clicks: number | null
  forecast_leads: number | null
  cpa: number | null
  cpc?: number | null
}

export interface MediaPlan {
  plan_id: string
  rows: MediaPlanRow[]
  total_budget: number
  total_clicks: number
  total_leads: number
  total_frequency: number
  updated_at: string | null
}

export const mediaplanApi = {
  get: (projectId: string) =>
    api.get<MediaPlan>(`/projects/${projectId}/direct/mediaplan`).then((r) => r.data),

  update: (projectId: string, rows: MediaPlanRow[]) =>
    api.put(`/projects/${projectId}/direct/mediaplan`, { rows }).then((r) => r.data),

  reset: (projectId: string, year?: number) =>
    api.post(`/projects/${projectId}/direct/mediaplan/reset`, null, { params: { year } }).then((r) => r.data),
}
