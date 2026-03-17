import { api } from './client'

export async function login(login: string, password: string, remember_me = false) {
  const r = await api.post('/auth/login', { login, password, remember_me })
  return r.data as { access_token: string; refresh_token: string }
}

export async function getMe() {
  const r = await api.get('/auth/me')
  return r.data as { id: string; login: string; email: string; role: string }
}
