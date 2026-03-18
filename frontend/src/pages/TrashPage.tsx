import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { projectsApi, TrashProject } from '../api/projects'

function TrashCard({ project }: { project: TrashProject }) {
  const qc = useQueryClient()
  const restoreMut = useMutation({
    mutationFn: () => projectsApi.restore(project.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trash'] }),
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <h3 className="font-semibold text-gray-900 truncate">{project.name}</h3>
        <p className="text-sm text-gray-500 mt-0.5">{project.client_name}</p>
        <p className="text-xs text-gray-400 mt-1 truncate">{project.url}</p>
        <p className="text-xs text-gray-400 mt-1">
          Удалён: {new Date(project.deleted_at).toLocaleString('ru-RU')}
        </p>
      </div>
      <button
        onClick={() => restoreMut.mutate()}
        disabled={restoreMut.isPending}
        className="shrink-0 text-sm border border-primary-300 text-primary-600 hover:bg-primary-50 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
      >
        {restoreMut.isPending ? '...' : '↩ Восстановить'}
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
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-1">Корзина</h2>
      <p className="text-sm text-gray-500 mb-6">Удалённые проекты. Восстановите нужный или оставьте — они не влияют на работу.</p>

      {isLoading ? (
        <div className="text-gray-500 text-sm">Загрузка...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🗑</p>
          <p>Корзина пуста</p>
        </div>
      ) : (
        <div className="space-y-3 max-w-2xl">
          {projects.map((p) => (
            <TrashCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  )
}
