import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { projectsApi, Project } from '../api/projects'
import { useAuthStore } from '../store/auth'

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    paused: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-blue-100 text-blue-700',
    archived: 'bg-gray-100 text-gray-600',
  }
  const dupMut = useMutation({
    mutationFn: () => projectsApi.duplicate(project.id),
    onSuccess: (newProject) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      navigate(`/projects/${newProject.id}`)
    },
  })
  const deleteMut = useMutation({
    mutationFn: () => projectsApi.delete(project.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setConfirmDelete(false)
    },
  })

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition">
        <div className="cursor-pointer" onClick={onClick}>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">{project.name}</h3>
              <p className="text-sm text-gray-500 mt-0.5">{project.client_name}</p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[project.status] || 'bg-gray-100 text-gray-600'}`}>
              {project.status}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-3 truncate">{project.url}</p>
          <p className="text-xs text-gray-400 mt-1">
            {new Date(project.created_at).toLocaleDateString('ru-RU')}
          </p>
        </div>
        <div className="mt-3 flex justify-between items-center">
          {isAdmin ? (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
              className="text-xs text-red-400 hover:text-red-600 transition"
              title="Удалить проект"
            >
              🗑 Удалить
            </button>
          ) : <span />}
          <button
            onClick={(e) => { e.stopPropagation(); dupMut.mutate() }}
            disabled={dupMut.isPending}
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50 transition disabled:opacity-50"
          >
            {dupMut.isPending ? '...' : 'Дублировать'}
          </button>
        </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setConfirmDelete(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-2">Удалить проект?</h3>
            <p className="text-sm text-gray-500 mb-4">
              «{project.name}» будет перемещён в корзину. Восстановить можно через раздел Корзина.
            </p>
            {deleteMut.isError && (
              <p className="text-red-500 text-sm mb-3">Ошибка удаления</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50 transition"
              >
                Отмена
              </button>
              <button
                onClick={() => deleteMut.mutate()}
                disabled={deleteMut.isPending}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm hover:bg-red-700 transition disabled:opacity-50"
              >
                {deleteMut.isPending ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', client_name: '', url: '', budget: '' })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      projectsApi.create({ ...data, budget: data.budget ? Number(data.budget) : undefined }),
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      navigate(`/projects/${project.id}`)
    },
    onError: (err: any) => setError(err.response?.data?.detail || 'Ошибка создания проекта'),
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-semibold mb-4">Новый проект</h2>
        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(form) }}
          className="space-y-3"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Название проекта</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Клиент / компания</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={form.client_name}
              onChange={(e) => setForm({ ...form, client_name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL сайта</label>
            <input
              type="url"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Бюджет ₽/мес (опционально)</label>
            <input
              type="number"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={form.budget}
              onChange={(e) => setForm({ ...form, budget: e.target.value })}
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50 transition"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 bg-primary-600 text-white py-2 rounded-lg text-sm hover:bg-primary-700 transition disabled:opacity-50"
            >
              {mutation.isPending ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ProjectsPage() {
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Проекты</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 transition"
        >
          + Новый проект
        </button>
      </div>

      {isLoading ? (
        <div className="text-gray-500 text-sm">Загрузка...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📁</p>
          <p>Нет проектов. Создайте первый!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} onClick={() => navigate(`/projects/${p.id}`)} />
          ))}
        </div>
      )}

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
