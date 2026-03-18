import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { projectsApi, TrashProject } from '../api/projects'

function TrashCard({ project }: { project: TrashProject }) {
  const qc = useQueryClient()
  const restoreMut = useMutation({
    mutationFn: () => projectsApi.restore(project.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trash'] }),
  })

  const deletedDate = new Date(project.deleted_at)

  return (
    <div className="card p-5 flex items-center gap-4" style={{ background: 'var(--bg-surface)' }}>
      {/* Icon */}
      <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center" style={{ background: 'var(--bg-surface2)' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" style={{ color: 'var(--text-muted)' }}>
          <path d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z M8 3v4 M16 3v4" />
        </svg>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{project.name}</p>
        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{project.client_name}</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Удалён {deletedDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Action */}
      <button
        onClick={() => restoreMut.mutate()}
        disabled={restoreMut.isPending}
        className="btn-ghost shrink-0 py-2 px-3.5 text-sm"
      >
        {restoreMut.isPending ? (
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        ) : (
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M3 12a9 9 0 109-9M3 3v9h9"/></svg>
            Восстановить
          </span>
        )}
      </button>
    </div>
  )
}

export default function TrashPage() {
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['trash'],
    queryFn: projectsApi.listTrash,
  })

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Корзина</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Удалённые проекты — данные сохранены, их можно восстановить в любой момент.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => (
            <div key={i} className="card h-20 animate-pulse" style={{ background: 'var(--bg-surface2)' }} />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'var(--bg-surface)' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" style={{ color: 'var(--text-muted)' }}>
              <path d="M3 6h18 M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6 M10 11v6 M14 11v6 M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
            </svg>
          </div>
          <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Корзина пуста</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Удалённые проекты появятся здесь</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <TrashCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  )
}
