import { api } from './client'

export const crawlApi = {
  getLinking: (projectId: string) =>
    api.get(`/projects/${projectId}/crawl/linking`).then(r => r.data),

  getRedirects: (projectId: string) =>
    api.get(`/projects/${projectId}/crawl/redirects`).then(r => r.data),

  getRobotsAudit: (projectId: string) =>
    api.get(`/projects/${projectId}/crawl/robots-audit`).then(r => r.data),

  checkCwv: (projectId: string, urls: string[], strategy: string) =>
    api.post(`/projects/${projectId}/crawl/cwv`, { urls, strategy }).then(r => r.data),

  aiAnalysis: (projectId: string) =>
    api.post(`/projects/${projectId}/crawl/ai-analysis`).then(r => r.data),
}
