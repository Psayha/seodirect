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

type Tab = 'overview' | 'brief' | 'crawl' | 'direct' | 'seo' | 'og' | 'schema' | 'mediaplan' | 'analytics' | 'topvisor' | 'content-plan' | 'reports' | 'history' | 'export' | 'utm' | 'marketing' | 'geo'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

function TabFallback() {
  return (
    <div className="p-8 flex items-center gap-2 text-muted text-sm">
      <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin inline-block" />
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

interface TabItem { key: Tab; label: string }
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
    <div className="p-8 flex items-center gap-2 text-muted text-sm">
      <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin inline-block" />
      Загрузка проекта...
    </div>
  )
  if (!project) return <div className="p-8 text-red-500 text-sm">Проект не найден</div>

  return (
    <div className="min-h-full flex flex-col">
      {/* ── Header ── */}
      <div className="bg-surface border-b border-[var(--border)] px-6 pt-5 pb-0">
        <button
          onClick={() => navigate('/projects')}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-primary transition mb-3"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="opacity-70">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Проекты
        </button>

        <div className="flex items-start gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg font-semibold text-primary truncate">{project.name}</h2>
              <span className={cx('badge', STATUS_BADGE[project.status] || 'badge-gray')}>
                {STATUS_LABEL[project.status] || project.status}
              </span>
            </div>
            <p className="text-sm text-muted mt-0.5">
              {project.client_name}
              {project.url && (
                <>
                  {' · '}
                  <a
                    href={project.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline"
                  >
                    {project.url}
                  </a>
                </>
              )}
            </p>
          </div>
        </div>

        {/* ── Two-level nav ── */}
        {(() => {
          const activeGroup = TAB_GROUPS.find(g => g.tabs.some(t => t.key === tab))
          return (
            <div>
              {/* Row 1: group pills */}
              <div className="flex gap-1 pb-2">
                {TAB_GROUPS.map((group) => {
                  const isActive = group.tabs.some(t => t.key === tab)
                  return (
                    <button
                      key={group.label}
                      onClick={() => setTab(group.tabs[0].key)}
                      className={cx(
                        'px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-lg transition select-none',
                        isActive
                          ? 'bg-[var(--accent-subtle)] text-accent'
                          : 'text-muted hover:text-primary hover:bg-surface-raised'
                      )}
                    >
                      {group.label}
                    </button>
                  )
                })}
              </div>
              {/* Row 2: sub-tabs of active group */}
              <div className="flex gap-0.5 overflow-x-auto scrollbar-none">
                {activeGroup?.tabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={cx(
                      'flex-shrink-0 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition whitespace-nowrap',
                      tab === t.key
                        ? 'border-accent text-accent bg-[var(--accent-subtle)]'
                        : 'border-transparent text-muted hover:text-primary hover:bg-surface-raised'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })()}
      </div>

      {/* ── Content ── */}
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
            {tab === 'marketing'   && <MarketingTab    projectId={id!} />}
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  )
}
