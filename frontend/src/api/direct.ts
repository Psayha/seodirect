import { api } from './client'

export interface Campaign {
  id: string
  project_id: string
  name: string
  type: string | null
  priority: number
  status: string
  geo: Record<string, unknown> | null
  budget_monthly: number | null
  sitelinks: Array<{ title: string; url: string }> | null
  strategy_text: string | null
  created_at: string
}

export interface AdGroup {
  id: string
  campaign_id: string
  name: string
  status: string
}

export interface Keyword {
  id: string
  ad_group_id: string
  phrase: string
  frequency: number | null
  frequency_updated_at: string | null
  temperature: 'hot' | 'warm' | 'cold' | null
  status: string
  match_type: string
}

export interface Ad {
  id: string
  ad_group_id: string
  headline1: string | null
  headline1_len: number
  headline2: string | null
  headline2_len: number
  headline3: string | null
  headline3_len: number
  text: string | null
  text_len: number
  display_url: string | null
  utm: string | null
  status: string
  variant: number
  valid: boolean
}

export interface NegativeKeyword {
  id: string
  phrase: string
  block: string | null
  campaign_id: string | null
}

export const directApi = {
  // Strategy
  getStrategy: (projectId: string) =>
    api.get<{ strategy_text: string | null; campaign_id?: string }>(`/projects/${projectId}/direct/strategy`).then((r) => r.data),
  generateStrategy: (projectId: string) =>
    api.post<{ task_id: string }>(`/projects/${projectId}/direct/strategy/generate`).then((r) => r.data),
  updateStrategy: (projectId: string, strategy_text: string) =>
    api.put(`/projects/${projectId}/direct/strategy`, { strategy_text }).then((r) => r.data),

  // Campaigns
  getCampaigns: (projectId: string) =>
    api.get<Campaign[]>(`/projects/${projectId}/direct/campaigns`).then((r) => r.data),
  createCampaign: (projectId: string, data: { name: string; type?: string; budget_monthly?: number }) =>
    api.post<Campaign>(`/projects/${projectId}/direct/campaigns`, data).then((r) => r.data),
  updateCampaign: (campaignId: string, data: Partial<Campaign>) =>
    api.patch<Campaign>(`/direct/campaigns/${campaignId}`, data).then((r) => r.data),
  deleteCampaign: (campaignId: string) =>
    api.delete(`/direct/campaigns/${campaignId}`),

  // Groups
  getGroups: (campaignId: string) =>
    api.get<AdGroup[]>(`/direct/campaigns/${campaignId}/groups`).then((r) => r.data),
  createGroup: (campaignId: string, name: string) =>
    api.post<AdGroup>(`/direct/campaigns/${campaignId}/groups`, { name }).then((r) => r.data),

  // Keywords
  getKeywords: (groupId: string) =>
    api.get<Keyword[]>(`/direct/groups/${groupId}/keywords`).then((r) => r.data),
  generateKeywords: (groupId: string) =>
    api.post<{ keywords_created: number }>(`/direct/groups/${groupId}/keywords/generate`).then((r) => r.data),
  checkFrequencies: (groupId: string) =>
    api.post<{ task_id: string }>(`/direct/groups/${groupId}/keywords/check-frequency`).then((r) => r.data),
  addKeyword: (adGroupId: string, phrase: string, temperature: string = 'warm') =>
    api.post<Keyword>('/direct/keywords', { ad_group_id: adGroupId, phrase, temperature }).then((r) => r.data),
  deleteKeyword: (keywordId: string) =>
    api.delete(`/direct/keywords/${keywordId}`),

  // Ads
  getAds: (groupId: string) =>
    api.get<Ad[]>(`/direct/groups/${groupId}/ads`).then((r) => r.data),
  generateAds: (groupId: string, variants: number = 2) =>
    api.post<{ ads_created: number; ads: Ad[] }>(`/direct/groups/${groupId}/ads/generate?variants=${variants}`).then((r) => r.data),
  updateAd: (adId: string, data: Partial<Ad>) =>
    api.patch<Ad>(`/direct/ads/${adId}`, data).then((r) => r.data),

  // Negative keywords
  getNegativeKeywords: (projectId: string) =>
    api.get<NegativeKeyword[]>(`/projects/${projectId}/direct/negative-keywords`).then((r) => r.data),
  generateNegativeKeywords: (projectId: string) =>
    api.post<{ created: number }>(`/projects/${projectId}/direct/negative-keywords/generate`).then((r) => r.data),
  addNegativeKeyword: (projectId: string, phrase: string, block: string = 'general') =>
    api.post<NegativeKeyword>(`/projects/${projectId}/direct/negative-keywords`, { phrase, block }).then((r) => r.data),
  deleteNegativeKeyword: (nkId: string) =>
    api.delete(`/direct/negative-keywords/${nkId}`),

  // N-gram analysis
  getNgrams: (projectId: string, n: number = 2) =>
    api.get(`/projects/${projectId}/direct/ngrams`, { params: { n } }).then((r) => r.data),

  // Heatmap
  getHeatmap: (projectId: string) =>
    api.get(`/projects/${projectId}/direct/heatmap`).then((r) => r.data),

  // A/B testing
  getAbStats: (projectId: string) =>
    api.get(`/projects/${projectId}/direct/ab-stats`).then((r) => r.data),
  markAdWinner: (adId: string) =>
    api.post(`/direct/ads/${adId}/mark-winner`).then((r) => r.data),

  // Search queries analysis
  analyzeSearchQueries: (projectId: string, queries: string[]) =>
    api.post(`/projects/${projectId}/direct/analyze-queries`, { queries }).then((r) => r.data),

  // Local clustering
  clusterLocal: (projectId: string, adGroupId?: string) =>
    api.post(`/projects/${projectId}/direct/cluster-local`, { ad_group_id: adGroupId }).then((r) => r.data),
}
