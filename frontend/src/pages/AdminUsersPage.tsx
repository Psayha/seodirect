import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'

type UserRole = 'super_admin' | 'admin' | 'specialist' | 'viewer'

interface User {
  id: string
  login: string
  email: string
  role: UserRole
  is_active: boolean
}

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'super_admin', label: 'Суперадмин' },
  { value: 'admin', label: 'Админ' },
  { value: 'specialist', label: 'Специалист' },
  { value: 'viewer', label: 'Просмотр' },
]

const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  specialist: 'bg-green-100 text-green-700',
  viewer: 'bg-gray-100 text-gray-600',
}

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

interface Project {
  id: string
  name: string
  client_name: string
  status: string
  specialist_id: string | null
}

export default function AdminUsersPage() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [resetId, setResetId] = useState<string | null>(null)
  const [projectsUserId, setProjectsUserId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [form, setForm] = useState({ login: '', email: '', password: '', role: 'specialist' as UserRole })
  const [editForm, setEditForm] = useState<{ role: UserRole; is_active: boolean; email: string }>({ role: 'specialist', is_active: true, email: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get('/users/').then((r) => r.data as User[]),
  })

  const { data: allProjects } = useQuery({
    queryKey: ['all-projects-admin'],
    queryFn: () => api.get('/users/all-projects').then((r) => r.data as Project[]),
    enabled: !!projectsUserId,
  })

  const assignMutation = useMutation({
    mutationFn: ({ userId, projectId }: { userId: string; projectId: string }) =>
      api.post(`/users/${userId}/projects/${projectId}/assign`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-projects-admin'] }),
  })

  const unassignMutation = useMutation({
    mutationFn: ({ userId, projectId }: { userId: string; projectId: string }) =>
      api.delete(`/users/${userId}/projects/${projectId}/assign`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-projects-admin'] }),
  })

  const createMutation = useMutation({
    mutationFn: (body: typeof form) => api.post('/users/', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setShowCreate(false)
      setForm({ login: '', email: '', password: '', role: 'specialist' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: UserRole; is_active?: boolean; email?: string }) =>
      api.patch(`/users/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setEditId(null)
    },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.post(`/users/${id}/reset-password`, { password }),
    onSuccess: () => {
      setResetId(null)
      setNewPassword('')
    },
  })

  const users = data ?? []

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Управление пользователями</h1>
          <p className="text-sm text-gray-500 mt-0.5">Роли: суперадмин → админ → специалист → просмотр</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition"
        >
          + Добавить пользователя
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="font-semibold text-gray-900 mb-4">Новый пользователь</h2>
            <div className="space-y-3">
              {(['login', 'email', 'password'] as const).map((f) => (
                <div key={f}>
                  <label className="block text-sm text-gray-600 mb-1 capitalize">{f === 'login' ? 'Логин' : f === 'email' ? 'Email' : 'Пароль'}</label>
                  <input
                    type={f === 'password' ? 'password' : 'text'}
                    value={form[f]}
                    onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Роль</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>
            {createMutation.isError && (
              <p className="text-red-500 text-sm mt-2">{(createMutation.error as any)?.response?.data?.detail || 'Ошибка'}</p>
            )}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending}
                className="flex-1 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Создание...' : 'Создать'}
              </button>
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2 border text-sm rounded-lg hover:bg-gray-50">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="font-semibold text-gray-900 mb-4">Редактировать пользователя</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Роль</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="is_active" className="text-sm text-gray-700">Активен</label>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => updateMutation.mutate({ id: editId, ...editForm })}
                disabled={updateMutation.isPending}
                className="flex-1 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button onClick={() => setEditId(null)} className="flex-1 py-2 border text-sm rounded-lg hover:bg-gray-50">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project assignment modal */}
      {projectsUserId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">
                Проекты — {users.find((u) => u.id === projectsUserId)?.login}
              </h2>
              <button onClick={() => setProjectsUserId(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="overflow-y-auto flex-1">
              {!allProjects ? (
                <p className="text-gray-400 text-sm">Загрузка...</p>
              ) : allProjects.length === 0 ? (
                <p className="text-gray-400 text-sm">Нет проектов</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-2 text-left text-gray-600 font-medium">Проект</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-medium">Клиент</th>
                      <th className="px-3 py-2 text-center text-gray-600 font-medium w-28">Назначен</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allProjects.map((p) => {
                      const isAssigned = p.specialist_id === projectsUserId
                      return (
                        <tr key={p.id} className="border-t hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-800">{p.name}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{p.client_name}</td>
                          <td className="px-3 py-2 text-center">
                            {isAssigned ? (
                              <button
                                onClick={() => unassignMutation.mutate({ userId: projectsUserId, projectId: p.id })}
                                className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full hover:bg-red-100 hover:text-red-600 transition"
                              >
                                ✓ Назначен
                              </button>
                            ) : (
                              <button
                                onClick={() => assignMutation.mutate({ userId: projectsUserId, projectId: p.id })}
                                className="text-xs border px-2 py-0.5 rounded-full text-gray-500 hover:border-primary-400 hover:text-primary-600 transition"
                              >
                                Назначить
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="mt-4 pt-3 border-t">
              <button onClick={() => setProjectsUserId(null)} className="w-full py-2 border text-sm rounded-lg hover:bg-gray-50">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="font-semibold text-gray-900 mb-4">Сброс пароля</h2>
            <input
              type="password"
              placeholder="Новый пароль"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => resetPasswordMutation.mutate({ id: resetId, password: newPassword })}
                disabled={!newPassword || resetPasswordMutation.isPending}
                className="flex-1 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                Сбросить
              </button>
              <button onClick={() => setResetId(null)} className="flex-1 py-2 border text-sm rounded-lg hover:bg-gray-50">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users table */}
      {isLoading ? (
        <div className="text-gray-400 text-sm p-4">Загрузка...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left font-medium text-gray-600">Логин</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Роль</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Статус</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.login}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={cx('px-2 py-0.5 rounded-full text-xs font-medium', ROLE_COLORS[u.role])}>
                      {ROLES.find((r) => r.value === u.role)?.label || u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cx('px-2 py-0.5 rounded-full text-xs font-medium', u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>
                      {u.is_active ? 'Активен' : 'Заблокирован'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        setEditId(u.id)
                        setEditForm({ role: u.role, is_active: u.is_active, email: u.email })
                      }}
                      className="text-primary-600 hover:text-primary-800 text-xs mr-3"
                    >
                      Изменить
                    </button>
                    <button
                      onClick={() => setResetId(u.id)}
                      className="text-orange-500 hover:text-orange-700 text-xs mr-3"
                    >
                      Пароль
                    </button>
                    <button
                      onClick={() => setProjectsUserId(u.id)}
                      className="text-gray-500 hover:text-gray-700 text-xs"
                    >
                      Проекты
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Нет пользователей</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
