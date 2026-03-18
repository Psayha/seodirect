import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { projectsApi, Project } from '../api/projects'
import { useAuthStore } from '../store/auth'

const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
  active:    { label: 'Активный',   color: 'text-green-400 bg-green-400/10',  dot: 'bg-green-400' },
  paused:    { label: 'На паузе',   color: 'text-yellow-400 bg-yellow-400/10', dot: 'bg-yellow-400' },
  completed: { label: 'Завершён',   color: 'text-blue-400 bg-blue-400/10',    dot: 'bg-blue-400' },
  archived:  { label: 'Архив',      color: 'text-gray-400 bg-gray-400/10',    dot: 'bg-gray-400' },
}

function DeleteConfirm({ project, onClose }: { project: Project; onClose: () => void }) {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () => projectsApi.delete(project.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); onClose() },
  })
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-sm" style={{ background: 'var(--bg-surface)' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-base mb-1" style={{ color: 'var(--text-primary)' }}>Удалить проект?</h3>
        <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
          «{project.name}» будет перемещён в корзину. Его можно восстановить позже.
        </p>
        {mut.isError && <p className="text-red-400 text-sm mb-3">Ошибка удаления</p>}
        <div className="flex gap-2">
          <button className="btn-ghost flex-1 py-2.5 text-sm" onClick={onClose}>Отмена</button>
          <button className="btn-danger flex-1 py-2.5 text-sm" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? 'Удаление...' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'

  const st = statusConfig[project.status] ?? { label: project.status, color: 'text-gray-400 bg-gray-400/10', dot: 'bg-gray-400' }

  const dupMut = useMutation({
    mutationFn: () => projectsApi.duplicate(project.id),
    onSuccess: (p) => { qc.invalidateQueries({ queryKey: ['projects'] }); navigate(`/projects/${p.id}`) },
  })

  return (
    <>
      <div
        className="card p-5 cursor-pointer group flex flex-col gap-4"
        style={{ background: 'var(--bg-surface)' }}
        onClick={onClick}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
              {project.name}
            </h3>
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
              {project.client_name}
            </p>
          </div>
          <span className={`shrink-0 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${st.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
            {st.label}
          </span>
        </div>

        {/* URL */}
        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
          🔗 {project.url}
        </p>

        {/* Footer */}
        <div
          className="flex items-center justify-between pt-3"
          style={{ borderTop: '1px solid var(--border)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {new Date(project.created_at).toLocaleDateString('ru-RU')}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); dupMut.mutate() }}
              disabled={dupMut.isPending}
              className="btn-ghost py-1 px-2.5 text-xs rounded-lg"
              title="Дублировать"
            >
              {dupMut.isPending ? '...' : 'Копия'}
            </button>
            {isAdmin && (
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
                className="btn py-1 px-2.5 text-xs rounded-lg text-red-400 hover:bg-red-500/10 transition"
                title="Удалить"
              >
                Удалить
              </button>
            )}
          </div>
        </div>
      </div>

      {confirmDelete && (
        <DeleteConfirm project={project} onClose={() => setConfirmDelete(false)} />
      )}
    </>
  )
}

function CreateModal({ onClose }: { onClose: () => void }) {
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-md" style={{ background: 'var(--bg-surface)' }} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-5" style={{ color: 'var(--text-primary)' }}>Новый проект</h2>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form) }} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Название проекта</label>
            <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Мой проект" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Клиент / компания</label>
            <input className="field" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} required placeholder="ООО Ромашка" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>URL сайта</label>
            <input type="url" className="field" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} required placeholder="https://example.com" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Бюджет ₽/мес <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(опционально)</span></label>
            <input type="number" className="field" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="50000" />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" className="btn-ghost flex-1 py-2.5 text-sm" onClick={onClose}>Отмена</button>
            <button type="submit" disabled={mutation.isPending} className="btn-accent flex-1 py-2.5 text-sm">
              {mutation.isPending ? 'Создание...' : 'Создать проект'}
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
  const [search, setSearch] = useState('')

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  })

  const filtered = projects.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.client_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Проекты</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {projects.length} {projects.length === 1 ? 'проект' : projects.length < 5 ? 'проекта' : 'проектов'}
          </p>
        </div>
        <button className="btn-accent px-5 py-2.5 text-sm shrink-0" onClick={() => setShowCreate(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          Новый проект
        </button>
      </div>

      {/* Search */}
      {projects.length > 0 && (
        <div className="relative mb-6">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" style={{ color: 'var(--text-muted)' }}>
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            className="field pl-10 w-full sm:w-80"
            placeholder="Поиск проекта или клиента..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1,2,3,4].map((i) => (
            <div key={i} className="card h-44 animate-pulse" style={{ background: 'var(--bg-surface2)' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'var(--bg-surface)' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" style={{ color: 'var(--text-muted)' }}>
              <path d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z M8 3v4 M16 3v4" />
            </svg>
          </div>
          <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            {search ? 'Ничего не найдено' : 'Нет проектов'}
          </p>
          <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
            {search ? 'Попробуйте другой запрос' : 'Создайте первый проект, чтобы начать работу'}
          </p>
          {!search && (
            <button className="btn-accent px-5 py-2.5 text-sm" onClick={() => setShowCreate(true)}>
              Создать проект
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} onClick={() => navigate(`/projects/${p.id}`)} />
          ))}
        </div>
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
