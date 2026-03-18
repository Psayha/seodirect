import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { projectsApi } from '../api/projects'

import OverviewTab from './tabs/OverviewTab'
import BriefTab from './tabs/BriefTab'
import CrawlTab from './tabs/CrawlTab'
import DirectTab from './tabs/DirectTab'
import SeoTab from './tabs/SeoTab'
import OgTab from './tabs/OgTab'
import MediaplanTab from './tabs/MediaplanTab'
import AnalyticsTab from './tabs/AnalyticsTab'
import TopvisorTab from './tabs/TopvisorTab'
import ContentPlanTab from './tabs/ContentPlanTab'
import ReportsTab from './tabs/ReportsTab'
import HistoryTab from './tabs/HistoryTab'
import ExportTab from './tabs/ExportTab'
import UtmTab from './tabs/UtmTab'

type Tab = 'overview' | 'brief' | 'crawl' | 'direct' | 'seo' | 'og' | 'mediaplan' | 'analytics' | 'topvisor' | 'content-plan' | 'reports' | 'history' | 'export' | 'utm'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id!),
    enabled: !!id,
  })

  if (isLoading) return <div className="p-6 text-gray-500">Загрузка...</div>
  if (!project) return <div className="p-6 text-red-500">Проект не найден</div>

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Обзор' },
    { key: 'brief', label: 'Бриф' },
    { key: 'crawl', label: '🔧 Аудит' },
    { key: 'direct', label: '📢 Директ' },
    { key: 'seo', label: '🔍 SEO' },
    { key: 'og', label: 'OpenGraph' },
    { key: 'mediaplan', label: '📅 Медиаплан' },
    { key: 'analytics', label: '📊 Аналитика' },
    { key: 'topvisor', label: '📈 Позиции' },
    { key: 'content-plan', label: '✍️ Контент' },
    { key: 'reports', label: '📋 Отчёты' },
    { key: 'history', label: 'История' },
    { key: 'export', label: 'Экспорт' },
    { key: 'utm', label: '🔗 UTM' },
  ]

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    paused: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-blue-100 text-blue-700',
    archived: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="min-h-full flex flex-col">
      <div className="bg-white border-b px-6 py-4">
        <button onClick={() => navigate('/projects')} className="text-sm text-gray-500 hover:text-gray-700 mb-2">← Проекты</button>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">{project.name}</h2>
          <span className={cx('text-xs px-2 py-0.5 rounded-full font-medium', statusColors[project.status] || 'bg-gray-100 text-gray-600')}>
            {project.status}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-0.5">
          {project.client_name} ·{' '}
          <a href={project.url} target="_blank" rel="noreferrer" className="hover:underline text-primary-600">{project.url}</a>
        </p>
      </div>

      <div className="bg-white border-b px-6">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cx('px-4 py-3 text-sm font-medium border-b-2 transition',
                tab === t.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-600 hover:text-gray-900')}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 bg-gray-50">
        {tab === 'overview' && <OverviewTab projectId={id!} />}
        {tab === 'brief' && <BriefTab projectId={id!} />}
        {tab === 'crawl' && <CrawlTab projectId={id!} />}
        {tab === 'direct' && <DirectTab projectId={id!} />}
        {tab === 'seo' && <SeoTab projectId={id!} />}
        {tab === 'og' && <OgTab projectId={id!} />}
        {tab === 'mediaplan' && <MediaplanTab projectId={id!} />}
        {tab === 'analytics' && <AnalyticsTab projectId={id!} />}
        {tab === 'topvisor' && <TopvisorTab projectId={id!} />}
        {tab === 'content-plan' && <ContentPlanTab projectId={id!} />}
        {tab === 'reports' && <ReportsTab projectId={id!} />}
        {tab === 'history' && <HistoryTab projectId={id!} />}
        {tab === 'export' && <ExportTab projectId={id!} />}
        {tab === 'utm' && <UtmTab projectId={id!} />}
      </div>
    </div>
  )
}
