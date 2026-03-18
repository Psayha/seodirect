import { api } from './client'

export const portalApi = {
  listTokens: (projectId: string) => api.get(`/projects/${projectId}/portal/tokens`).then(r => r.data),
  createToken: (projectId: string, data: any) => api.post(`/projects/${projectId}/portal/tokens`, data).then(r => r.data),
  revokeToken: (projectId: string, tokenId: string) => api.delete(`/projects/${projectId}/portal/tokens/${tokenId}`).then(r => r.data),
}
