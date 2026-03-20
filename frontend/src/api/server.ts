import { api } from './client'

export interface DiskUsage {
  path: string
  total_gb: number
  used_gb: number
  free_gb: number
  used_pct: number
}

export interface DockerOverview {
  images: { name: string; size: string; created: string; id: string }[]
  containers: { name: string; status: string; image: string; size: string }[]
  volumes: { name: string; driver: string }[]
  build_cache_size: string
  disk_usage_summary: string
}

export interface SystemInfo {
  hostname: string
  uptime: string
  load_avg: string
  memory_total_mb: number
  memory_used_mb: number
  memory_free_mb: number
  memory_used_pct: number
  disk: DiskUsage[]
  docker: DockerOverview | null
}

export interface CleanupResult {
  action: string
  reclaimed: string
  details: string
}

export const serverApi = {
  getInfo: () =>
    api.get<SystemInfo>('/server/info').then((r) => r.data),

  cleanupImages: () =>
    api.post<CleanupResult>('/server/cleanup/images').then((r) => r.data),
  cleanupContainers: () =>
    api.post<CleanupResult>('/server/cleanup/containers').then((r) => r.data),
  cleanupVolumes: () =>
    api.post<CleanupResult>('/server/cleanup/volumes').then((r) => r.data),
  cleanupBuildCache: () =>
    api.post<CleanupResult>('/server/cleanup/build-cache').then((r) => r.data),
  cleanupFull: () =>
    api.post<CleanupResult>('/server/cleanup/full').then((r) => r.data),

  restartService: (service: string) =>
    api.post<{ service: string; status: string; output: string }>(`/server/restart/${service}`).then((r) => r.data),
  getServiceLogs: (service: string, lines = 100) =>
    api.get<{ service: string; lines: number; logs: string }>(`/server/logs/${service}`, { params: { lines } }).then((r) => r.data),
}
