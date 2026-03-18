import { api } from './client'

export const utmApi = {
  list: (projectId: string) => api.get(`/projects/${projectId}/utm-templates`).then(r => r.data),
  create: (projectId: string, data: any) => api.post(`/projects/${projectId}/utm-templates`, data).then(r => r.data),
  delete: (projectId: string, templateId: string) => api.delete(`/projects/${projectId}/utm-templates/${templateId}`).then(r => r.data),
  build: (projectId: string, data: any) => api.post(`/projects/${projectId}/utm-templates/build`, data).then(r => r.data),
}
