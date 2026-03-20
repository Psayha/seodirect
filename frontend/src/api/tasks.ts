import { api } from './client'

export interface TaskResult {
  id: string
  type: string
  status: 'pending' | 'running' | 'success' | 'failed'
  progress: number
  result: Record<string, unknown> | null
  error: string | null
  created_at: string | null
  finished_at: string | null
}

export const tasksApi = {
  get: (taskId: string): Promise<TaskResult> =>
    api.get(`/tasks/${taskId}`).then((r) => r.data),
}
