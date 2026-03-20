import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { projectsApi, Project } from '../api/projects'
import { useAuthStore } from '../store/auth'

/* Status config — dot color + text color + bg */
const STATUS: Record<string, { label: string; dot: string; color: string; bg: string }> = {
  active:    { label: 'Активный',  dot: '#10b981', color: '#34d399', bg: 'rgba(16,185,129,0.10)' },
  paused:    { label: 'На паузе',  dot: '#f59e0b', color: '#fbbf24', bg: 'rgba(245,158,11,0.10)' },
  completed: { label: 'Завершён',  dot: '#60a5fa', color: '#60a5fa', bg: 'rgba(96,165,250,0.10)' },
  archived:  { label: 'Архив',     dot: '#6b7280', color: '#9ca3af', bg: 'rgba(107,114,128,0.10)' },
}

/* ── Delete confirm modal ──────────────────────────────────────────────────── */
function DeleteModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () => projectsApi.delete(project.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); onClose() },
  })
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div className="card p-6 w-full max-w-sm animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-base mb-1" style={{ color: 'var(--text)' }}>
          Удалить проект?
        </h3>
        <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>
          «{project.name}» будет перемещён в корзину. Его можно восстановить позже.
        </p>
        {mut.isError && (
          <p className="text-sm mb-3" style={{ color: '#f87171' }}>Ошибка удаления</p>
        )}
        <div className="flex gap-2">
          <button className="btn-ghost flex-1 py-2.5 text-sm" onClick={onClose}>Отмена</button>
          <button
            className="btn-danger flex-1 py-2.5 text-sm"
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
          >
            {mut.isPending ? 'Удаление...' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Project card ──────────────────────────────────────────────────────────── */
function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const isAdmin = ['admin', 'super_admin'].includes(useAuthStore((s) => s.user?.role ?? ''))
  const [confirmDelete, setConfirmDelete] = useState(false)

  const st = STATUS[project.status] ?? STATUS.archived

  const dupMut = useMutation({
    mutationFn: () => projectsApi.duplicate(project.id),
    onSuccess: (p) => { qc.invalidateQueries({ queryKey: ['projects'] }); navigate(`/projects/${p.id}`) },
  })

  return (
    <>
      <div
        className="card card-hover cursor-pointer flex flex-col overflow-hidden"
        onClick={onClick}
        style={{ padding: 0 }}
      >
        {/* Status accent stripe at top — the "unexpected detail" */}
        <div
          className="h-0.5 w-full shrink-0"
          style={{ background: `linear-gradient(90deg, ${st.dot}60 0%, transparent 70%)` }}
        />

        <div className="p-5 flex flex-col gap-4 flex-1">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3
                className="font-semibold text-sm truncate"
                style={{ color: 'var(--text)', letterSpacing: '-0.01em' }}
              >
                {project.name}
              </h3>
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
                {project.client_name}
              </p>
            </div>
            {/* Status pill */}
            <span
              className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
              style={{ background: st.bg, color: st.color }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />
              {st.label}
            </span>
          </div>

          {/* URL */}
          {project.url && (
            <p
              className="text-xs truncate font-mono"
              style={{ color: 'var(--subtle)', fontSize: 11 }}
            >
              {project.url}
            </p>
          )}

          {/* Footer */}
          <div
            className="flex items-center justify-between pt-3 mt-auto"
            style={{ borderTop: '1px solid var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="font-data text-xs" style={{ color: 'var(--muted)' }}>
              {new Date(project.created_at).toLocaleDateString('ru-RU')}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); dupMut.mutate() }}
                disabled={dupMut.isPending}
                className="text-xs px-2.5 py-1 rounded-lg transition-all duration-150"
                style={{ color: 'var(--muted)', background: 'transparent' }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLElement
                  el.style.color = 'var(--text)'
                  el.style.background = 'var(--surface-raised)'
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLElement
                  el.style.color = 'var(--muted)'
                  el.style.background = 'transparent'
                }}
              >
                {dupMut.isPending ? '...' : 'Копия'}
              </button>
              {isAdmin && (
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
                  className="text-xs px-2.5 py-1 rounded-lg transition-all duration-150"
                  style={{ color: 'var(--muted)', background: 'transparent' }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement
                    el.style.color = '#f87171'
                    el.style.background = 'rgba(239,68,68,0.08)'
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement
                    el.style.color = 'var(--muted)'
                    el.style.background = 'transparent'
                  }}
                >
                  Удалить
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <DeleteModal project={project} onClose={() => setConfirmDelete(false)} />
      )}
    </>
  )
}

/* ── Create project modal ──────────────────────────────────────────────────── */
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

  const FIELDS = [
    { label: 'Название проекта', key: 'name'        as const, type: 'text',   ph: 'Мой проект',        req: true },
    { label: 'Клиент / компания', key: 'client_name' as const, type: 'text',   ph: 'ООО Ромашка',       req: true },
    { label: 'URL сайта',         key: 'url'         as const, type: 'url',    ph: 'https://example.com', req: true },
  ] as const

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div className="card p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Modal header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold" style={{ color: 'var(--text)', letterSpacing: '-0.02em' }}>
            Новый проект
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-150"
            style={{ color: 'var(--muted)', background: 'var(--surface-raised)' }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(form) }} className="space-y-4">
          {FIELDS.map(({ label, key, type, ph, req }) => (
            <div key={key}>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
                {label}
              </label>
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
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
              Бюджет ₽/мес{' '}
              <span style={{ color: 'var(--subtle)', fontWeight: 400 }}>(опционально)</span>
            </label>
            <input
              type="number"
              className="field font-data"
              value={form.budget}
              onChange={(e) => setForm({ ...form, budget: e.target.value })}
              placeholder="50 000"
            />
          </div>

          {error && <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" className="btn-ghost flex-1 py-2.5 text-sm" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" disabled={mut.isPending} className="btn-accent flex-1 py-2.5 text-sm">
              {mut.isPending ? 'Создание...' : 'Создать проект'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
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

  /* Group by status for stats */
  const activeCount = projects.filter((p) => p.status === 'active').length

  return (
    <div className="p-6">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 animate-fade-up">
        <div>
          <h1 className="page-title">Проекты</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            {projects.length > 0
              ? `${projects.length} проект${projects.length === 1 ? '' : projects.length < 5 ? 'а' : 'ов'} · ${activeCount} активных`
              : 'Нет проектов'}
          </p>
        </div>
        <button
          className="btn-accent px-5 py-2.5 text-sm shrink-0 animate-fade-up stagger-1"
          onClick={() => setShowCreate(true)}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Новый проект
        </button>
      </div>

      {/* ── Search bar ───────────────────────────────────────────────────── */}
      {projects.length > 0 && (
        <div className="relative mb-6 animate-fade-up stagger-2">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2} strokeLinecap="round"
            style={{ color: 'var(--muted)' }}
          >
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            className="field pl-10 w-full sm:w-80"
            placeholder="Поиск по проекту или клиенту..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1,2,3,4,5,6].map((i) => (
            <div key={i} className="skeleton" style={{ height: 180, animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        /* ── Designed empty state ── */
        <div className="flex flex-col items-center py-20 text-center animate-fade-up">
          <div
            className="w-16 h-16 rounded-3xl flex items-center justify-center mb-5 text-2xl"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            {search ? '🔍' : '📁'}
          </div>
          <p
            className="text-lg font-semibold mb-2"
            style={{ color: 'var(--text)', letterSpacing: '-0.02em' }}
          >
            {search ? 'Ничего не найдено' : 'Нет проектов'}
          </p>
          <p className="text-sm mb-6 max-w-xs" style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
            {search
              ? `По запросу «${search}» ничего не найдено. Попробуйте другой запрос.`
              : 'Создайте первый проект и начните автоматизировать поисковый маркетинг.'}
          </p>
          {!search && (
            <button className="btn-accent px-6 py-2.5 text-sm" onClick={() => setShowCreate(true)}>
              Создать проект
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((p, i) => (
            <div
              key={p.id}
              className="animate-fade-up"
              style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }}
            >
              <ProjectCard project={p} onClick={() => navigate(`/projects/${p.id}`)} />
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
