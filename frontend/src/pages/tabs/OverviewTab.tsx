import { useQuery } from '@tanstack/react-query'
import { projectsApi } from '../../api/projects'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

const STATUS_BADGE: Record<string, string> = {
  active:    'badge-green',
  paused:    'badge-yellow',
  completed: 'badge-blue',
  archived:  'badge-gray',
}

const STATUS_LABEL: Record<string, string> = {
  active:    'Активен',
  paused:    'Приостановлен',
  completed: 'Завершён',
  archived:  'Архив',
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-3 border-b border-[var(--border)] last:border-0">
      <span className="text-sm text-muted w-28 flex-shrink-0">{label}</span>
      <span className="text-sm text-primary font-medium">{children}</span>
    </div>
  )
}

export default function OverviewTab({ projectId }: { projectId: string }) {
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
    enabled: !!projectId,
  })

  if (!project) return null

  return (
    <div className="p-6 max-w-2xl">
      <div className="card-bordered p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)] bg-surface-raised">
          <h3 className="text-sm font-semibold text-primary">Общая информация</h3>
        </div>
        <div className="px-5 py-1">
          <InfoRow label="Клиент">
            {project.client_name}
          </InfoRow>
          <InfoRow label="Сайт">
            <a
              href={project.url}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {project.url}
            </a>
          </InfoRow>
          <InfoRow label="Статус">
            <span className={cx('badge', STATUS_BADGE[project.status] || 'badge-gray')}>
              {STATUS_LABEL[project.status] || project.status}
            </span>
          </InfoRow>
          {project.budget && (
            <InfoRow label="Бюджет">
              {Number(project.budget).toLocaleString('ru-RU')} ₽/мес
            </InfoRow>
          )}
          {project.notes && (
            <InfoRow label="Заметки">
              <span className="text-muted font-normal">{project.notes}</span>
            </InfoRow>
          )}
          <InfoRow label="Создан">
            {new Date(project.created_at).toLocaleDateString('ru-RU', {
              day: 'numeric', month: 'long', year: 'numeric'
            })}
          </InfoRow>
        </div>
      </div>
    </div>
  )
}
