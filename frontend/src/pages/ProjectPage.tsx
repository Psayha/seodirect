import { lazy, Suspense, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { projectsApi } from '../api/projects'
import ErrorBoundary from '../components/ErrorBoundary'

const OverviewTab    = lazy(() => import('./tabs/OverviewTab'))
const BriefTab       = lazy(() => import('./tabs/BriefTab'))
const CrawlTab       = lazy(() => import('./tabs/CrawlTab'))
const DirectTab      = lazy(() => import('./tabs/DirectTab'))
const SeoTab         = lazy(() => import('./tabs/SeoTab'))
const OgTab          = lazy(() => import('./tabs/OgTab'))
const SchemaTab      = lazy(() => import('./tabs/SchemaTab'))
const MediaplanTab   = lazy(() => import('./tabs/MediaplanTab'))
const AnalyticsTab   = lazy(() => import('./tabs/AnalyticsTab'))
const TopvisorTab    = lazy(() => import('./tabs/TopvisorTab'))
const ContentPlanTab = lazy(() => import('./tabs/ContentPlanTab'))
const ReportsTab     = lazy(() => import('./tabs/ReportsTab'))
const HistoryTab     = lazy(() => import('./tabs/HistoryTab'))
const ExportTab      = lazy(() => import('./tabs/ExportTab'))
const UtmTab         = lazy(() => import('./tabs/UtmTab'))
const GeoTab         = lazy(() => import('./tabs/GeoTab'))
const MarketingTab   = lazy(() => import('./tabs/MarketingTab'))

type Tab = 'overview' | 'brief' | 'crawl' | 'direct' | 'seo' | 'og' | 'schema'
         | 'mediaplan' | 'analytics' | 'topvisor' | 'content-plan'
         | 'reports' | 'history' | 'export' | 'utm' | 'marketing' | 'geo'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

function TabFallback() {
  return (
    <div className="p-8 flex items-center gap-2.5 text-sm" style={{ color: 'var(--muted)' }}>
      <span
        className="w-4 h-4 rounded-full border-2 animate-spin inline-block"
        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
      />
      Загрузка...
    </div>
  )
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

interface TabItem  { key: Tab; label: string }
interface TabGroup { label: string; tabs: TabItem[] }

const TAB_GROUPS: TabGroup[] = [
  {
    label: 'Проект',
    tabs: [
      { key: 'overview', label: 'Обзор' },
      { key: 'brief',    label: 'Бриф' },
    ],
  },
  {
    label: 'Аудит',
    tabs: [
      { key: 'crawl',     label: 'Технический аудит' },
      { key: 'analytics', label: 'Аналитика' },
      { key: 'topvisor',  label: 'Позиции' },
      { key: 'geo',       label: 'Нейровыдача' },
    ],
  },
  {
    label: 'Маркетинг',
    tabs: [
      { key: 'marketing', label: 'Семантика' },
      { key: 'direct',    label: 'Директ' },
      { key: 'mediaplan', label: 'Медиаплан' },
      { key: 'utm',       label: 'UTM' },
    ],
  },
  {
    label: 'SEO',
    tabs: [
      { key: 'seo',          label: 'Мета-теги' },
      { key: 'og',           label: 'OpenGraph' },
      { key: 'schema',       label: 'Schema.org' },
      { key: 'content-plan', label: 'Контент-план' },
    ],
  },
  {
    label: 'Управление',
    tabs: [
      { key: 'reports', label: 'Отчёты' },
      { key: 'export',  label: 'Экспорт' },
      { key: 'history', label: 'История' },
    ],
  },
]

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id!),
    enabled: !!id,
  })

  if (isLoading) return (
    <div className="p-8 flex items-center gap-2.5 text-sm" style={{ color: 'var(--muted)' }}>
      <span
        className="w-4 h-4 rounded-full border-2 animate-spin inline-block"
        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
      />
      Загрузка проекта...
    </div>
  )
  if (!project) return (
    <div className="p-8 text-sm" style={{ color: '#f87171' }}>Проект не найден</div>
  )

  const activeGroup = TAB_GROUPS.find((g) => g.tabs.some((t) => t.key === tab))

  return (
    <div className="min-h-full flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="px-6 pt-5 pb-0 shrink-0"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
      >
        {/* Breadcrumb */}
        <button
          onClick={() => navigate('/projects')}
          className="flex items-center gap-1.5 mb-4 transition-all duration-150 hover:gap-2"
          style={{ color: 'var(--muted)', fontSize: 12 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-text)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6"
                  strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Проекты
        </button>

        {/* Project title row */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap mb-1">
              <h2
                className="text-lg font-semibold truncate"
                style={{ color: 'var(--text)', letterSpacing: '-0.02em' }}
              >
                {project.name}
              </h2>
              <span className={cx('badge', STATUS_BADGE[project.status] || 'badge-gray')}>
                {STATUS_LABEL[project.status] || project.status}
              </span>
            </div>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {project.client_name}
              {project.url && (
                <>
                  <span className="mx-1.5" style={{ color: 'var(--subtle)' }}>·</span>
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
                </>
              )}
            </p>
          </div>
        </div>

        {/* ── Two-level navigation ─────────────────────────────────────────── */}
        {/* Row 1 — group pills */}
        <div className="flex gap-1 flex-wrap pb-2.5">
          {TAB_GROUPS.map((group) => {
            const isActive = group.tabs.some((t) => t.key === tab)
            return (
              <button
                key={group.label}
                onClick={() => setTab(group.tabs[0].key)}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl transition-all duration-150"
                style={{
                  letterSpacing: '0.03em',
                  textTransform: 'uppercase',
                  background: isActive ? 'var(--accent-subtle)' : 'transparent',
                  color: isActive ? 'var(--accent-text)' : 'var(--muted)',
                  border: `1px solid ${isActive ? 'rgba(124,106,245,0.2)' : 'transparent'}`,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.color = 'var(--text)'
                    ;(e.currentTarget as HTMLElement).style.background = 'var(--surface-raised)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.color = 'var(--muted)'
                    ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                  }
                }}
              >
                {group.label}
              </button>
            )
          })}
        </div>

        {/* Row 2 — sub-tabs of active group */}
        <div className="flex gap-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {activeGroup?.tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-shrink-0 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap
                         border-b-2 transition-all duration-150"
              style={{
                borderBottomColor: tab === t.key ? 'var(--accent)' : 'transparent',
                color: tab === t.key ? 'var(--accent-text)' : 'var(--muted)',
                background: tab === t.key ? 'var(--accent-subtle)' : 'transparent',
                borderRadius: '10px 10px 0 0',
                marginBottom: '-1px',
              }}
              onMouseEnter={(e) => {
                if (tab !== t.key) {
                  (e.currentTarget as HTMLElement).style.color = 'var(--text)'
                  ;(e.currentTarget as HTMLElement).style.background = 'var(--surface-raised)'
                }
              }}
              onMouseLeave={(e) => {
                if (tab !== t.key) {
                  (e.currentTarget as HTMLElement).style.color = 'var(--muted)'
                  ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                }
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ────────────────────────────────────────────────────── */}
      <div className="flex-1 bg-page">
        <ErrorBoundary label={tab}>
          <Suspense fallback={<TabFallback />}>
            {tab === 'overview'     && <OverviewTab    projectId={id!} onTabChange={(t) => setTab(t as Tab)} />}
            {tab === 'brief'        && <BriefTab        projectId={id!} />}
            {tab === 'crawl'        && <CrawlTab        projectId={id!} />}
            {tab === 'direct'       && <DirectTab       projectId={id!} />}
            {tab === 'seo'          && <SeoTab          projectId={id!} />}
            {tab === 'og'           && <OgTab           projectId={id!} />}
            {tab === 'schema'       && <SchemaTab       projectId={id!} />}
            {tab === 'mediaplan'    && <MediaplanTab    projectId={id!} />}
            {tab === 'analytics'    && <AnalyticsTab    projectId={id!} />}
            {tab === 'topvisor'     && <TopvisorTab     projectId={id!} />}
            {tab === 'content-plan' && <ContentPlanTab  projectId={id!} />}
            {tab === 'reports'      && <ReportsTab      projectId={id!} />}
            {tab === 'history'      && <HistoryTab      projectId={id!} />}
            {tab === 'export'       && <ExportTab       projectId={id!} />}
            {tab === 'utm'          && <UtmTab          projectId={id!} />}
            {tab === 'geo'          && <GeoTab           projectId={id!} />}
            {tab === 'marketing'    && <MarketingTab    projectId={id!} />}
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  )
}
