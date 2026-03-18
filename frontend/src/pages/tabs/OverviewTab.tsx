import { useQuery } from '@tanstack/react-query'
import { projectsApi } from '../../api/projects'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

export default function OverviewTab({ projectId }: { projectId: string }) {
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
    enabled: !!projectId,
  })

  if (!project) return null

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    paused: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-blue-100 text-blue-700',
    archived: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="p-6 max-w-xl">
      <div className="bg-white rounded-lg border p-4 space-y-2 text-sm">
        <p><span className="text-gray-500">Клиент:</span> <strong>{project.client_name}</strong></p>
        <p><span className="text-gray-500">Сайт:</span>{' '}
          <a href={project.url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">{project.url}</a>
        </p>
        <p><span className="text-gray-500">Статус:</span>{' '}
          <span className={cx('px-2 py-0.5 rounded-full text-xs font-medium', statusColors[project.status] || 'bg-gray-100 text-gray-600')}>
            {project.status}
          </span>
        </p>
        {project.budget && (
          <p><span className="text-gray-500">Бюджет:</span> <strong>{Number(project.budget).toLocaleString()} ₽/мес</strong></p>
        )}
        {project.notes && <p><span className="text-gray-500">Заметки:</span> {project.notes}</p>}
        <p><span className="text-gray-500">Создан:</span> {new Date(project.created_at).toLocaleDateString('ru-RU')}</p>
      </div>
    </div>
  )
}
