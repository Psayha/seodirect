import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { projectsApi, TrashProject } from '../api/projects'

function TrashCard({ project }: { project: TrashProject }) {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () => projectsApi.restore(project.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trash'] }),
  })

  return (
    <div className="card p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-surface-raised shrink-0 flex items-center justify-center">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" className="text-muted">
          <path d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z M8 3v4 M16 3v4" />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-primary truncate">{project.name}</p>
        <p className="text-xs mt-0.5 text-muted truncate">{project.client_name}</p>
        <p className="text-xs mt-1 text-muted">
          Удалён {new Date(project.deleted_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <button
        onClick={() => mut.mutate()}
        disabled={mut.isPending}
        className="btn-ghost shrink-0 py-2 px-3.5 text-sm"
      >
        {mut.isPending ? (
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        ) : (
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 12a9 9 0 109-9M3 3v9h9"/>
            </svg>
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
        <h1 className="text-2xl font-bold text-primary">Корзина</h1>
        <p className="text-sm mt-1 text-muted">
          Удалённые проекты — данные сохранены, их можно восстановить в любой момент.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-2xl bg-surface animate-pulse" />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className="text-muted">
              <path d="M3 6h18 M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6 M10 11v6 M14 11v6 M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
            </svg>
          </div>
          <p className="text-base font-semibold mb-1 text-primary">Корзина пуста</p>
          <p className="text-sm text-muted">Удалённые проекты появятся здесь</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => <TrashCard key={p.id} project={p} />)}
        </div>
      )}
    </div>
  )
}
