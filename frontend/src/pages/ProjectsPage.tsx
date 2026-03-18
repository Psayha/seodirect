import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { projectsApi, Project } from '../api/projects'
import { useAuthStore } from '../store/auth'

const STATUS: Record<string, { label: string; dot: string; badge: string }> = {
  active:    { label: 'Активный',  dot: 'bg-status-active',    badge: 'text-status-active bg-status-active/10' },
  paused:    { label: 'На паузе',  dot: 'bg-status-paused',    badge: 'text-status-paused bg-status-paused/10' },
  completed: { label: 'Завершён',  dot: 'bg-status-completed', badge: 'text-status-completed bg-status-completed/10' },
  archived:  { label: 'Архив',     dot: 'bg-status-archived',  badge: 'text-status-archived bg-status-archived/10' },
}

// ── Delete confirm modal ──────────────────────────────────────────────────────
function DeleteModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () => projectsApi.delete(project.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); onClose() },
  })
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-base mb-1 text-primary">Удалить проект?</h3>
        <p className="text-sm mb-5 text-muted">
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

// ── Project card ──────────────────────────────────────────────────────────────
function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const isAdmin = ['admin', 'super_admin'].includes(useAuthStore((s) => s.user?.role ?? ''))
  const [confirmDelete, setConfirmDelete] = useState(false)

  const st = STATUS[project.status] ?? { label: project.status, dot: 'bg-muted', badge: 'text-muted bg-muted/10' }

  const dupMut = useMutation({
    mutationFn: () => projectsApi.duplicate(project.id),
    onSuccess: (p) => { qc.invalidateQueries({ queryKey: ['projects'] }); navigate(`/projects/${p.id}`) },
  })

  return (
    <>
      <div className="card card-hover p-5 cursor-pointer flex flex-col gap-4" onClick={onClick}>
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm text-primary truncate">{project.name}</h3>
            <p className="text-xs mt-0.5 text-muted truncate">{project.client_name}</p>
          </div>
          <span className={`shrink-0 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${st.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
            {st.label}
          </span>
        </div>

        {/* URL */}
        <p className="text-xs text-muted truncate">
          {project.url}
        </p>

        {/* Footer */}
        <div
          className="flex items-center justify-between pt-3 border-t border-[var(--border)]"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-xs text-muted">
            {new Date(project.created_at).toLocaleDateString('ru-RU')}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); dupMut.mutate() }}
              disabled={dupMut.isPending}
              className="btn-ghost py-1 px-2.5 text-xs rounded-lg"
            >
              {dupMut.isPending ? '...' : 'Копия'}
            </button>
            {isAdmin && (
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
                className="btn py-1 px-2.5 text-xs rounded-lg text-red-400 hover:bg-red-500/10 transition"
              >
                Удалить
              </button>
            )}
          </div>
        </div>
      </div>

      {confirmDelete && <DeleteModal project={project} onClose={() => setConfirmDelete(false)} />}
    </>
  )
}

// ── Create modal ──────────────────────────────────────────────────────────────
function CreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', client_name: '', url: '', budget: '' })
  const [error, setError] = useState('')

  const mut = useMutation({
    mutationFn: (d: typeof form) =>
      projectsApi.create({ ...d, budget: d.budget ? Number(d.budget) : undefined }),
    onSuccess: (p) => { qc.invalidateQueries({ queryKey: ['projects'] }); navigate(`/projects/${p.id}`) },
    onError: (err: any) => setError(err.response?.data?.detail || 'Ошибка создания'),
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-5 text-primary">Новый проект</h2>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(form) }} className="space-y-4">
          {([
            ['Название проекта', 'name', 'text', 'Мой проект', true],
            ['Клиент / компания', 'client_name', 'text', 'ООО Ромашка', true],
            ['URL сайта', 'url', 'url', 'https://example.com', true],
          ] as const).map(([label, key, type, ph, req]) => (
            <div key={key}>
              <label className="block text-xs font-medium mb-1.5 text-muted">{label}</label>
              <input
                type={type}
                className="field"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                required={req}
                placeholder={ph}
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium mb-1.5 text-muted">
              Бюджет ₽/мес <span className="font-normal">(опционально)</span>
            </label>
            <input
              type="number"
              className="field"
              value={form.budget}
              onChange={(e) => setForm({ ...form, budget: e.target.value })}
              placeholder="50 000"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" className="btn-ghost flex-1 py-2.5 text-sm" onClick={onClose}>Отмена</button>
            <button type="submit" disabled={mut.isPending} className="btn-accent flex-1 py-2.5 text-sm">
              {mut.isPending ? 'Создание...' : 'Создать проект'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  })

  const filtered = search
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.client_name.toLowerCase().includes(search.toLowerCase())
      )
    : projects

  const count = projects.length
  const countLabel = count === 1 ? 'проект' : count < 5 ? 'проекта' : 'проектов'

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">Проекты</h1>
          <p className="text-sm mt-0.5 text-muted">{count} {countLabel}</p>
        </div>
        <button className="btn-accent px-5 py-2.5 text-sm shrink-0" onClick={() => setShowCreate(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Новый проект
        </button>
      </div>

      {/* Search */}
      {count > 0 && (
        <div className="relative mb-6">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            className="field pl-10 w-full sm:w-72"
            placeholder="Поиск по проекту или клиенту..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 rounded-2xl bg-surface animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className="text-muted">
              <path d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z M8 3v4 M16 3v4" />
            </svg>
          </div>
          <p className="text-base font-semibold mb-1 text-primary">
            {search ? 'Ничего не найдено' : 'Нет проектов'}
          </p>
          <p className="text-sm mb-5 text-muted">
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
