import { useQuery } from '@tanstack/react-query'
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

/* ── Info row ─────────────────────────────────────────────────────────────── */
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="flex items-start gap-3 py-3"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <span className="text-xs shrink-0 mt-0.5" style={{ color: 'var(--muted)', width: 100 }}>
        {label}
      </span>
      <span className="text-sm font-medium min-w-0 break-all" style={{ color: 'var(--text)' }}>
        {children}
      </span>
    </div>
  )
}

/* ── Action chip — clickable navigation shortcut ─────────────────────────── */
function ActionChip({
  icon, label, desc, hue, onClick,
}: {
  icon: string
  label: string
  desc: string
  hue: string  // CSS color for icon bg
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 p-3.5 rounded-2xl text-left w-full
                 transition-all duration-200 cursor-pointer"
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--border)',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.background = 'var(--surface-overlay)'
        el.style.borderColor = 'var(--border-raised)'
        el.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.background = 'var(--surface-raised)'
        el.style.borderColor = 'var(--border)'
        el.style.transform = 'translateY(0)'
      }}
    >
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0"
        style={{ background: hue }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text)' }}>
          {label}
        </p>
        <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--muted)' }}>
          {desc}
        </p>
      </div>
      {/* Arrow — visible on hover */}
      <svg
        className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        width="14" height="14" viewBox="0 0 16 16" fill="none"
        style={{ color: 'var(--muted)' }}
      >
        <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  )
}

/* ── SEO score ring ───────────────────────────────────────────────────────── */
function ScoreRing({ score }: { score: number }) {
  const r = 38
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score >= 80 ? '#34d399' : score >= 50 ? '#fbbf24' : '#f87171'

  return (
    <div className="relative flex items-center justify-center w-24 h-24">
      <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
        {/* Track */}
        <circle cx="48" cy="48" r={r} fill="none"
                stroke="var(--surface-raised)" strokeWidth="6"/>
        {/* Progress */}
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={color} strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.34,1.2,0.64,1)' }}
        />
      </svg>
      <div className="absolute text-center">
        <span className="text-2xl font-bold font-data" style={{ color, lineHeight: 1 }}>{score}</span>
        <span className="block text-xs" style={{ color: 'var(--muted)' }}>/100</span>
      </div>
    </div>
  )
}

/* ── Main component ───────────────────────────────────────────────────────── */
export default function OverviewTab({
  projectId,
  onTabChange,
}: {
  projectId: string
  onTabChange?: (tab: string) => void
}) {
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

  const issues = crawlReport ? ([
    crawlReport.no_title > 0          && { label: `Без title`,       count: crawlReport.no_title },
    crawlReport.no_description > 0    && { label: `Без description`, count: crawlReport.no_description },
    crawlReport.no_h1 > 0             && { label: `Без H1`,          count: crawlReport.no_h1 },
    crawlReport.images_without_alt > 0 && { label: `Без alt`,        count: crawlReport.images_without_alt },
    crawlReport.errors_4xx > 0        && { label: `4xx ошибки`,      count: crawlReport.errors_4xx },
  ] as const).filter(Boolean) as { label: string; count: number }[] : []

  const score = crawlReport
    ? Math.max(0, Math.min(100, 100 - issues.length * 14 - (crawlReport.slow_pages > 5 ? 8 : 0)))
    : null

  return (
    <div className="p-5 animate-fade-up">
      {/* ── BENTO GRID ──────────────────────────────────────────────────────
          Layout defined in CSS:
          Mobile:  1 col — info → score → actions → brief
          Tablet:  2 col — [info | score] / [actions | brief]
          Desktop: 3 col — [info info score] / [actions actions brief]
         ─────────────────────────────────────────────────────────────────── */}
      <div className="bento-grid">

        {/* ── HERO CARD: Project info ────────────────────────────────────── */}
        <div className="bento-info card p-0 overflow-hidden animate-fade-up stagger-1">
          {/* Card header */}
          <div
            className="px-5 py-4 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              Общая информация
            </h3>
            <span className={cx('badge', STATUS_BADGE[project.status] || 'badge-gray')}>
              {STATUS_LABEL[project.status] || project.status}
            </span>
          </div>

          {/* Info rows */}
          <div className="px-5">
            <InfoRow label="Клиент">{project.client_name}</InfoRow>
            <InfoRow label="Сайт">
              <a
                href={project.url}
                target="_blank"
                rel="noreferrer"
                className="transition-colors duration-150"
                style={{ color: 'var(--accent-text)' }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.textDecoration = 'underline' }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.textDecoration = 'none' }}
              >
                {project.url}
              </a>
            </InfoRow>
            {project.budget && (
              <InfoRow label="Бюджет">
                <span className="font-data">{Number(project.budget).toLocaleString('ru-RU')} ₽/мес</span>
              </InfoRow>
            )}
            {project.notes && (
              <InfoRow label="Заметки">
                <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{project.notes}</span>
              </InfoRow>
            )}
            <InfoRow label="Создан">
              <span className="font-data text-xs">
                {new Date(project.created_at).toLocaleDateString('ru-RU', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </span>
            </InfoRow>
          </div>

          {/* Crawl summary strip (if crawl done) */}
          {crawlDone && crawlReport && (
            <div
              className="mx-5 my-4 rounded-xl px-4 py-3 flex items-center justify-between gap-3"
              style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
            >
              <div>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Просканировано страниц</p>
                <p className="text-xl font-bold font-data mt-0.5" style={{ color: 'var(--text)' }}>
                  {crawlReport.pages_total}
                </p>
              </div>
              <button
                onClick={() => onTabChange?.('crawl')}
                className="btn-subtle text-xs px-3 py-1.5 rounded-xl"
              >
                Детали →
              </button>
            </div>
          )}
        </div>

        {/* ── SEO SCORE CARD ────────────────────────────────────────────── */}
        <div className="bento-score card p-0 overflow-hidden animate-fade-up stagger-2">
          <div
            className="px-5 py-4"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              SEO здоровье
            </h3>
          </div>

          {crawlDone && crawlReport && score !== null ? (
            <div className="p-5">
              {/* Score ring — the "unexpected memorable detail" */}
              <div className="flex flex-col items-center py-2 mb-4">
                <ScoreRing score={score} />
                <p
                  className="text-xs mt-2 font-medium"
                  style={{
                    color: score >= 80 ? '#34d399' : score >= 50 ? '#fbbf24' : '#f87171',
                  }}
                >
                  {score >= 80 ? 'Отличный результат' : score >= 50 ? 'Есть проблемы' : 'Требует внимания'}
                </p>
              </div>

              {/* Issues list */}
              {issues.length === 0 ? (
                <div
                  className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
                  style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399' }}
                >
                  <span>✓</span>
                  <span>Технических проблем нет</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {issues.map((issue, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs"
                      style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)' }}
                    >
                      <span style={{ color: '#f87171' }}>{issue.label}</span>
                      <span className="font-data font-semibold" style={{ color: '#f87171' }}>{issue.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Empty state — designed, not just grey */
            <div className="p-5 flex flex-col items-center text-center py-8">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 text-2xl"
                style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
              >
                🔍
              </div>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
                Аудит не запускался
              </p>
              <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
                Запустите технический аудит, чтобы увидеть SEO оценку
              </p>
              <button
                onClick={() => onTabChange?.('crawl')}
                className="btn-accent text-xs px-4 py-2"
              >
                Запустить аудит
              </button>
            </div>
          )}
        </div>

        {/* ── QUICK ACTIONS ─────────────────────────────────────────────── */}
        <div className="bento-actions card p-0 overflow-hidden animate-fade-up stagger-3">
          <div
            className="px-5 py-4"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              Быстрые действия
            </h3>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <ActionChip
              icon="📋"
              label="Заполнить бриф"
              desc={briefFilled ? 'Обновить данные' : 'Ниша, ЦА, бюджет, конкуренты'}
              hue={briefFilled ? 'rgba(52,211,153,0.12)' : 'rgba(251,191,36,0.12)'}
              onClick={() => onTabChange?.('brief')}
            />
            <ActionChip
              icon="🔍"
              label={crawlDone ? 'Переобход сайта' : 'Запустить аудит'}
              desc={crawlDone ? `${crawlReport?.pages_total ?? '?'} стр. просканировано` : 'Технический SEO аудит'}
              hue={crawlDone ? 'rgba(96,165,250,0.12)' : 'rgba(124,106,245,0.12)'}
              onClick={() => onTabChange?.('crawl')}
            />
            <ActionChip
              icon="🎯"
              label="Яндекс Директ"
              desc="Стратегия, кампании, объявления"
              hue="rgba(124,106,245,0.14)"
              onClick={() => onTabChange?.('direct')}
            />
            <ActionChip
              icon="📊"
              label="SEO мета-теги"
              desc="title, description, OG-теги"
              hue="rgba(167,139,250,0.12)"
              onClick={() => onTabChange?.('seo')}
            />
            <ActionChip
              icon="📈"
              label="Аналитика"
              desc="Метрика, ROI, аномалии"
              hue="rgba(52,211,153,0.11)"
              onClick={() => onTabChange?.('analytics')}
            />
            <ActionChip
              icon="📅"
              label="Медиаплан"
              desc="Бюджет, клики, лиды по месяцам"
              hue="rgba(251,191,36,0.11)"
              onClick={() => onTabChange?.('mediaplan')}
            />
          </div>
        </div>

        {/* ── BRIEF SNAPSHOT ────────────────────────────────────────────── */}
        <div className="bento-brief card p-0 overflow-hidden animate-fade-up stagger-4">
          <div
            className="px-5 py-4 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              Бриф
            </h3>
            {briefFilled && (
              <button
                onClick={() => onTabChange?.('brief')}
                className="text-xs transition-colors duration-150"
                style={{ color: 'var(--accent-text)' }}
              >
                Редактировать →
              </button>
            )}
          </div>

          {briefFilled ? (
            <div className="p-5 space-y-3">
              {brief?.niche && (
                <div>
                  <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>Ниша</p>
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{brief.niche}</p>
                </div>
              )}
              {brief?.geo && (
                <div>
                  <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>Гео</p>
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{brief.geo}</p>
                </div>
              )}
              {brief?.usp && (
                <div>
                  <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>УТП</p>
                  <p className="text-sm" style={{ color: 'var(--text)', lineHeight: 1.5 }}
                     dangerouslySetInnerHTML={undefined}>
                    {brief.usp.slice(0, 120)}{brief.usp.length > 120 ? '…' : ''}
                  </p>
                </div>
              )}
              {brief?.monthly_budget && (
                <div
                  className="flex items-center justify-between px-4 py-3 rounded-xl"
                  style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
                >
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>Бюджет/мес</span>
                  <span className="text-sm font-bold font-data" style={{ color: 'var(--accent-text)' }}>
                    {Number(brief.monthly_budget).toLocaleString('ru-RU')} ₽
                  </span>
                </div>
              )}
            </div>
          ) : (
            /* Empty brief state */
            <div className="p-5 flex flex-col items-center text-center py-8">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 text-2xl"
                style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
              >
                📋
              </div>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
                Бриф не заполнен
              </p>
              <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
                Добавьте информацию о проекте для точной генерации
              </p>
              <button
                onClick={() => onTabChange?.('brief')}
                className="btn-ghost text-xs px-4 py-2"
              >
                Заполнить бриф
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
