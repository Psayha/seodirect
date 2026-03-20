import { api } from './client'

export interface ProjectImage {
  id: string
  original_name: string
  url: string
  width: number | null
  height: number | null
  file_size: number
  mime_type: string
  created_at: string
  created_by: string | null
}

export const imagesApi = {
  list: (projectId: string): Promise<ProjectImage[]> =>
    api.get(`/projects/${projectId}/images`).then((r) => r.data),

  upload: (projectId: string, file: File): Promise<ProjectImage> => {
    const form = new FormData()
    form.append('file', file)
    return api
      .post(`/projects/${projectId}/images`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  delete: (projectId: string, imageId: string): Promise<void> =>
    api.delete(`/projects/${projectId}/images/${imageId}`).then(() => undefined),
}
