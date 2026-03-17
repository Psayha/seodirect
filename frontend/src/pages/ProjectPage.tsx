import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi, Brief } from '../api/projects'
import { api } from '../api/client'

type Tab = 'overview' | 'brief' | 'crawl' | 'direct' | 'export'

function BriefTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const { data: brief, isLoading } = useQuery({
    queryKey: ['brief', projectId],
    queryFn: () => projectsApi.getBrief(projectId),
  })
  const [form, setForm] = useState<Partial<Brief>>({})
  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: (data: Partial<Brief>) => projectsApi.updateBrief(projectId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['brief', projectId] }); setSaved(true); setTimeout(() => setSaved(false), 2000) },
  })

  if (isLoading) return <div className="p-4 text-gray-500">Загрузка...</div>

  const current = { ...brief, ...form }

  const field = (key: keyof Brief, label: string, multiline = false) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {multiline ? (
        <textarea
          rows={3}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          value={(current[key] as string) || ''}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        />
      ) : (
        <input
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          value={(current[key] as string) || ''}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        />
      )}
    </div>
  )

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">О бизнесе</h3>
      {field('niche', 'Ниша / тематика')}
      {field('products', 'Продукты / услуги', true)}
      {field('price_segment', 'Ценовой сегмент')}
      {field('geo', 'Гео работы бизнеса')}

      <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide pt-2">Целевая аудитория</h3>
      {field('target_audience', 'Кто покупает', true)}
      {field('pains', 'Боли клиентов', true)}

      <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide pt-2">УТП</h3>
      {field('usp', 'Главные преимущества', true)}

      <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide pt-2">Реклама</h3>
      {field('campaign_goal', 'Цель кампании')}
      {field('monthly_budget', 'Месячный бюджет (₽)')}
      {field('restrictions', 'Ограничения', true)}

      <div className="pt-2 flex gap-3">
        <button
          onClick={() => mutation.mutate(form)}
          disabled={mutation.isPending}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 transition disabled:opacity-50"
        >
          {mutation.isPending ? 'Сохранение...' : 'Сохранить бриф'}
        </button>
        {saved && <span className="text-green-600 text-sm py-2">✅ Сохранено</span>}
      </div>
    </div>
  )
}

function CrawlTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const { data: status } = useQuery({
    queryKey: ['crawl-status', projectId],
    queryFn: () => api.get(`/projects/${projectId}/crawl/status`).then((r) => r.data),
    refetchInterval: (q) => {
      const d = q.state.data as any
      return d?.status === 'running' ? 2000 : false
    },
  })

  const startMutation = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/crawl/start`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crawl-status', projectId] }),
  })

  const { data: report } = useQuery({
    queryKey: ['crawl-report', projectId],
    queryFn: () => api.get(`/projects/${projectId}/crawl/report`).then((r) => r.data),
    enabled: status?.status === 'done',
  })

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <h3 className="font-semibold">Парсинг сайта</h3>
        <button
          onClick={() => startMutation.mutate()}
          disabled={startMutation.isPending || status?.status === 'running'}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 transition disabled:opacity-50"
        >
          {status?.status === 'running' ? '⏳ Парсинг...' : 'Запустить парсинг'}
        </button>
      </div>

      {status && status.status !== 'not_started' && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span>Статус: <strong>{status.status}</strong></span>
            <span>{status.pages_done} / {status.pages_total} страниц</span>
          </div>
          {status.status === 'running' && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-primary-600 h-2 rounded-full transition-all"
                style={{ width: `${status.pages_total ? Math.round((status.pages_done / status.pages_total) * 100) : 0}%` }}
              />
            </div>
          )}
          {status.error && <p className="text-red-500 text-sm mt-2">{status.error}</p>}
        </div>
      )}

      {report && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-gray-700">Отчёт</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              { label: 'Всего страниц', value: report.pages_total },
              { label: 'Без title', value: report.no_title, bad: report.no_title > 0 },
              { label: 'Без description', value: report.no_description, bad: report.no_description > 0 },
              { label: 'Без H1', value: report.no_h1, bad: report.no_h1 > 0 },
              { label: 'noindex страниц', value: report.noindex_pages, bad: report.noindex_pages > 0 },
              { label: 'Медленных (>3с)', value: report.slow_pages, bad: report.slow_pages > 0 },
              { label: 'Картинок без alt', value: report.images_without_alt, bad: report.images_without_alt > 0 },
            ].map((item) => (
              <div key={item.label} className={`bg-white rounded-lg p-3 border ${item.bad ? 'border-red-200' : 'border-gray-200'}`}>
                <p className="text-gray-500">{item.label}</p>
                <p className={`text-lg font-semibold ${item.bad ? 'text-red-600' : 'text-gray-900'}`}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DirectTab({ projectId }: { projectId: string }) {
  const { data: strategy } = useQuery({
    queryKey: ['direct-strategy', projectId],
    queryFn: () => api.get(`/projects/${projectId}/direct/strategy`).then((r) => r.data),
  })
  const { data: campaigns } = useQuery({
    queryKey: ['campaigns', projectId],
    queryFn: () => api.get(`/projects/${projectId}/direct/campaigns`).then((r) => r.data),
  })

  const generateMutation = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/direct/strategy/generate`).then((r) => r.data),
  })

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <h3 className="font-semibold">Яндекс Директ</h3>
        <button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 transition disabled:opacity-50"
        >
          {generateMutation.isPending ? '⏳ Генерация...' : '✨ Сгенерировать стратегию'}
        </button>
      </div>

      {generateMutation.isSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-sm text-green-700">
          Задача запущена. Обновите страницу через 30–60 секунд.
        </div>
      )}

      {strategy?.strategy_text && (
        <div className="bg-white border rounded-lg p-4 mb-6">
          <h4 className="font-medium text-sm text-gray-700 mb-2">Стратегия</h4>
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{strategy.strategy_text}</pre>
        </div>
      )}

      {campaigns && campaigns.length > 0 && (
        <div>
          <h4 className="font-medium text-sm text-gray-700 mb-2">Кампании ({campaigns.length})</h4>
          <div className="space-y-2">
            {campaigns.map((c: any) => (
              <div key={c.id} className="bg-white border rounded-lg p-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-gray-500">{c.status}</span>
                </div>
                {c.budget_monthly && <p className="text-gray-500 mt-1">Бюджет: {c.budget_monthly} ₽/мес</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ExportTab({ projectId }: { projectId: string }) {
  const { data: validation } = useQuery({
    queryKey: ['export-validate', projectId],
    queryFn: () => api.get(`/projects/${projectId}/export/validate`).then((r) => r.data),
  })

  const downloadXls = () => {
    window.open(`/api/projects/${projectId}/export/direct-xls`, '_blank')
  }
  const downloadMd = () => {
    window.open(`/api/projects/${projectId}/export/strategy-md`, '_blank')
  }

  return (
    <div className="p-6 max-w-xl">
      <h3 className="font-semibold mb-4">Экспорт</h3>
      {validation && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4 text-sm space-y-1">
          <p>Кампаний: <strong>{validation.campaigns_count}</strong></p>
          <p>Групп: <strong>{validation.groups_count}</strong></p>
          <p>Объявлений: <strong>{validation.ads_count}</strong></p>
          <p>Ключевых фраз: <strong>{validation.keywords_count}</strong></p>
          <p>Минус-слов: <strong>{validation.negative_keywords_count}</strong></p>
          {validation.warnings.map((w: string, i: number) => (
            <p key={i} className="text-yellow-600">⚠️ {w}</p>
          ))}
        </div>
      )}
      <div className="space-y-3">
        <button
          onClick={downloadXls}
          className="w-full bg-green-600 text-white py-2 rounded-lg text-sm hover:bg-green-700 transition"
        >
          📥 Скачать XLS для Директ Коммандера
        </button>
        <button
          onClick={downloadMd}
          className="w-full bg-gray-600 text-white py-2 rounded-lg text-sm hover:bg-gray-700 transition"
        >
          📄 Скачать стратегию (Markdown)
        </button>
      </div>
    </div>
  )
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
  if (!project) return <div className="p-6 text-gray-500">Проект не найден</div>

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Обзор' },
    { key: 'brief', label: 'Бриф' },
    { key: 'crawl', label: 'Парсинг' },
    { key: 'direct', label: 'Директ' },
    { key: 'export', label: 'Экспорт' },
  ]

  return (
    <div className="min-h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <button onClick={() => navigate('/projects')} className="text-sm text-gray-500 hover:text-gray-700 mb-2">
          ← Проекты
        </button>
        <h2 className="text-xl font-semibold">{project.name}</h2>
        <p className="text-sm text-gray-500">{project.client_name} · {project.url}</p>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b px-6">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                tab === t.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        {tab === 'overview' && (
          <div className="p-6 max-w-xl">
            <div className="bg-white rounded-lg border p-4 space-y-2 text-sm">
              <p><span className="text-gray-500">Клиент:</span> {project.client_name}</p>
              <p><span className="text-gray-500">Сайт:</span> <a href={project.url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">{project.url}</a></p>
              <p><span className="text-gray-500">Статус:</span> {project.status}</p>
              {project.budget && <p><span className="text-gray-500">Бюджет:</span> {project.budget} ₽/мес</p>}
              <p><span className="text-gray-500">Создан:</span> {new Date(project.created_at).toLocaleDateString('ru-RU')}</p>
            </div>
          </div>
        )}
        {tab === 'brief' && <BriefTab projectId={id!} />}
        {tab === 'crawl' && <CrawlTab projectId={id!} />}
        {tab === 'direct' && <DirectTab projectId={id!} />}
        {tab === 'export' && <ExportTab projectId={id!} />}
      </div>
    </div>
  )
}
