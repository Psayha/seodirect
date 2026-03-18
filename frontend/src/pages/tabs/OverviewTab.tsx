import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { projectsApi } from '../../api/projects'
import { api } from '../../api/client'

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
    <div className="flex items-start gap-3 py-3 border-b border-[var(--border)] last:border-0">
      <span className="text-sm text-muted w-28 shrink-0">{label}</span>
      <span className="text-sm text-primary font-medium min-w-0 break-all">{children}</span>
    </div>
  )
}

function QuickCard({
  icon, label, desc, color, onClick,
}: { icon: string; label: string; desc: string; color: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="card-bordered p-4 text-left hover:shadow-card-md transition-shadow flex items-start gap-3 w-full"
    >
      <div className={cx('w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0', color)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-primary">{label}</p>
        <p className="text-xs text-muted mt-0.5">{desc}</p>
      </div>
    </button>
  )
}

export default function OverviewTab({ projectId, onTabChange }: { projectId: string; onTabChange?: (tab: string) => void }) {
  const navigate = useNavigate()

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
    enabled: !!projectId,
  })
  const { data: crawlStatus } = useQuery({
    queryKey: ['crawl-status', projectId],
    queryFn: () => api.get(`/projects/${projectId}/crawl/status`).then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: crawlReport } = useQuery({
    queryKey: ['crawl-report', projectId],
    queryFn: () => api.get(`/projects/${projectId}/crawl/report`).then((r) => r.data),
    enabled: crawlStatus?.status === 'done',
  })
  const { data: brief } = useQuery({
    queryKey: ['brief', projectId],
    queryFn: () => projectsApi.getBrief(projectId),
    enabled: !!projectId,
  })

  if (!project) return null

  const briefFilled = !!(brief?.niche || brief?.products || brief?.usp)
  const crawlDone   = crawlStatus?.status === 'done'
  const issues      = crawlReport ? [
    crawlReport.no_title > 0    && `Без title: ${crawlReport.no_title}`,
    crawlReport.no_description > 0 && `Без description: ${crawlReport.no_description}`,
    crawlReport.no_h1 > 0       && `Без H1: ${crawlReport.no_h1}`,
    crawlReport.images_without_alt > 0 && `Без alt: ${crawlReport.images_without_alt}`,
  ].filter(Boolean) : []

  const score = crawlReport
    ? Math.max(0, 100 - issues.length * 12 - (crawlReport.slow_pages > 5 ? 10 : 0))
    : null

  return (
    <div className="p-6 max-w-7xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Left: Project info ─────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="card-bordered p-0 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[var(--border)] bg-surface-raised">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">Общая информация</h3>
            </div>
            <div className="px-5 py-1">
              <InfoRow label="Клиент">{project.client_name}</InfoRow>
              <InfoRow label="Сайт">
                <a href={project.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  {project.url}
                </a>
              </InfoRow>
              <InfoRow label="Статус">
                <span className={cx('badge', STATUS_BADGE[project.status] || 'badge-gray')}>
                  {STATUS_LABEL[project.status] || project.status}
                </span>
              </InfoRow>
              {project.budget && (
                <InfoRow label="Бюджет">{Number(project.budget).toLocaleString('ru-RU')} ₽/мес</InfoRow>
              )}
              {project.notes && (
                <InfoRow label="Заметки"><span className="text-muted font-normal">{project.notes}</span></InfoRow>
              )}
              <InfoRow label="Создан">
                {new Date(project.created_at).toLocaleDateString('ru-RU', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </InfoRow>
            </div>
          </div>

          {/* SEO score card if crawl done */}
          {crawlDone && crawlReport && (
            <div className="card-bordered p-0 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[var(--border)] bg-surface-raised flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">SEO аудит</h3>
                <span className={cx(
                  'text-lg font-bold',
                  score !== null ? (score >= 80 ? 'text-emerald-500' : score >= 50 ? 'text-amber-500' : 'text-red-500') : 'text-muted'
                )}>
                  {score ?? '—'} <span className="text-xs font-normal text-muted">/ 100</span>
                </span>
              </div>
              <div className="px-5 py-3">
                {issues.length === 0 ? (
                  <p className="text-sm text-emerald-500">✅ Технических проблем не обнаружено</p>
                ) : (
                  <ul className="space-y-1">
                    {issues.map((issue, i) => (
                      <li key={i} className="text-sm text-red-500 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                        {issue}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted mt-2">
                  Просканировано {crawlReport.pages_total} страниц
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Quick actions ───────────────────────────────────────────── */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">Быстрые действия</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <QuickCard
              icon="📋"
              label="Заполнить бриф"
              desc={briefFilled ? 'Бриф заполнен — обновить данные' : 'Укажите нишу, ЦА, бюджет и конкурентов'}
              color={briefFilled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}
              onClick={() => onTabChange?.('brief')}
            />
            <QuickCard
              icon="🔍"
              label={crawlDone ? 'Переобход сайта' : 'Запустить аудит'}
              desc={crawlDone
                ? `Последнее: ${crawlReport?.pages_total ?? '?'} страниц`
                : 'Технический SEO аудит сайта'}
              color={crawlDone ? 'bg-blue-500/10 text-blue-500' : 'bg-surface-raised text-muted'}
              onClick={() => onTabChange?.('crawl')}
            />
            <QuickCard
              icon="🎯"
              label="Яндекс Директ"
              desc="Стратегия, кампании, ключи и объявления"
              color="bg-accent-subtle text-accent"
              onClick={() => onTabChange?.('direct')}
            />
            <QuickCard
              icon="📊"
              label="SEO мета-теги"
              desc="Генерация title, description, OG-тегов"
              color="bg-purple-500/10 text-purple-500"
              onClick={() => onTabChange?.('seo')}
            />
            <QuickCard
              icon="📈"
              label="Аналитика"
              desc="Метрика, ROI-калькулятор, аномалии трафика"
              color="bg-emerald-500/10 text-emerald-500"
              onClick={() => onTabChange?.('analytics')}
            />
            <QuickCard
              icon="📅"
              label="Медиаплан"
              desc="Бюджет по месяцам, прогноз кликов и лидов"
              color="bg-amber-500/10 text-amber-500"
              onClick={() => onTabChange?.('mediaplan')}
            />
          </div>

          {/* Brief snapshot */}
          {briefFilled && (
            <div className="card-bordered p-0 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[var(--border)] bg-surface-raised">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">Бриф — снапшот</h3>
              </div>
              <div className="px-5 py-3 space-y-2">
                {brief?.niche && (
                  <div>
                    <span className="text-xs text-muted">Ниша: </span>
                    <span className="text-sm text-primary">{brief.niche}</span>
                  </div>
                )}
                {brief?.geo && (
                  <div>
                    <span className="text-xs text-muted">Гео: </span>
                    <span className="text-sm text-primary">{brief.geo}</span>
                  </div>
                )}
                {brief?.usp && (
                  <div>
                    <span className="text-xs text-muted">УТП: </span>
                    <span className="text-sm text-primary line-clamp-2">{brief.usp}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
