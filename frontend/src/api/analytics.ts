import { api } from './client'

export interface MetrikaSummary {
  visits: number
  users: number
  bounce_rate: number
  avg_duration: number
  pageviews: number
  date_from: string
  date_to: string
}

export interface TrafficSource {
  source: string
  visits: number
  users: number
}

export interface DailyVisit {
  date: string
  visits: number
  users: number
}

export interface MetrikaCounter {
  id: number
  name: string
  site: string
  status: string
}

export interface AnalyticsDashboard {
  summary: MetrikaSummary
  sources: TrafficSource[]
  daily: DailyVisit[]
}

export const analyticsApi = {
  getCounters: (projectId: string) =>
    api.get<{ counters: MetrikaCounter[] }>(`/projects/${projectId}/analytics/counters`).then((r) => r.data),

  getCounter: (projectId: string) =>
    api.get<{ counter_id: number | null }>(`/projects/${projectId}/analytics/counter`).then((r) => r.data),

  setCounter: (projectId: string, counter_id: number) =>
    api.post(`/projects/${projectId}/analytics/counter`, { counter_id }).then((r) => r.data),

  getSummary: (projectId: string, params?: { date_from?: string; date_to?: string }) =>
    api.get<AnalyticsDashboard>(`/projects/${projectId}/analytics/summary`, { params }).then((r) => r.data),

  getGoals: (projectId: string) =>
    api.get<{ goals: Array<{ id: number; name: string; type: string }> }>(
      `/projects/${projectId}/analytics/goals`
    ).then((r) => r.data),

  getAnomalies: (projectId: string) =>
    api.get(`/projects/${projectId}/analytics/anomalies`).then((r) => r.data),

  getRoi: (projectId: string) =>
    api.get(`/projects/${projectId}/analytics/roi`).then((r) => r.data),
}
