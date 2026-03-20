import { api } from './client'

export interface CrawlerSettings {
  crawl_delay_ms: number
  crawl_timeout_seconds: number
  crawl_max_pages: number
  crawl_user_agent: string
  crawl_respect_robots: boolean
}

export interface AISettings {
  ai_model: string
  ai_max_tokens: number
  ai_temperature: number
  ai_language: string
}

export interface LLMTaskConfig {
  id: string
  label: string
  group: string
  group_label: string
  description: string
  default_model: string
  default_temperature: number
  default_max_tokens: number
  model: string | null
  temperature: number | null
  max_tokens: number | null
}

export interface LLMTasksResponse {
  tasks: LLMTaskConfig[]
  groups: Record<string, string>
}

export interface UserRecord {
  id: string
  login: string
  email: string
  role: string
  is_active: boolean
}

export interface SystemPrompt {
  id: string
  name: string
  module: string
  updated_at: string | null
}

export interface SystemPromptFull extends SystemPrompt {
  prompt_text: string
}

export const settingsApi = {
  // Crawler
  getCrawler: () =>
    api.get<CrawlerSettings>('/settings/crawler').then((r) => r.data),
  updateCrawler: (data: CrawlerSettings) =>
    api.put('/settings/crawler', data).then((r) => r.data),

  // AI
  getAI: () =>
    api.get<AISettings>('/settings/ai').then((r) => r.data),
  updateAI: (data: AISettings) =>
    api.put('/settings/ai', data).then((r) => r.data),

  // Per-task LLM settings
  getLLMTasks: () =>
    api.get<LLMTasksResponse>('/settings/ai/tasks').then((r) => r.data),
  updateLLMTask: (taskId: string, data: { model?: string | null; temperature?: number | null; max_tokens?: number | null }) =>
    api.put(`/settings/ai/tasks/${taskId}`, data).then((r) => r.data),
  resetLLMTask: (taskId: string) =>
    api.delete(`/settings/ai/tasks/${taskId}`).then((r) => r.data),

  // Users
  listUsers: () =>
    api.get<UserRecord[]>('/users/').then((r) => r.data),
  createUser: (data: { login: string; email: string; password: string; role: string }) =>
    api.post<UserRecord>('/users/', data).then((r) => r.data),
  updateUser: (id: string, data: { role?: string; is_active?: boolean; email?: string }) =>
    api.patch<UserRecord>(`/users/${id}`, data).then((r) => r.data),
  resetPassword: (id: string, password: string) =>
    api.post(`/users/${id}/reset-password`, { password }),

  // Prompts
  listPrompts: () =>
    api.get<SystemPrompt[]>('/settings/prompts').then((r) => r.data),
  getPrompt: (name: string) =>
    api.get<SystemPromptFull>(`/settings/prompts/${name}`).then((r) => r.data),
  updatePrompt: (name: string, prompt_text: string) =>
    api.put(`/settings/prompts/${name}`, { prompt_text }).then((r) => r.data),
  createPrompt: (data: { name: string; module: string; prompt_text: string }) =>
    api.post('/settings/prompts', data).then((r) => r.data),
  deletePrompt: (name: string) =>
    api.delete(`/settings/prompts/${name}`).then((r) => r.data),

  // API Keys
  deleteApiKey: (service: string, keyName: string) =>
    api.delete(`/settings/api-keys/${service}/${keyName}`).then((r) => r.data),
}
