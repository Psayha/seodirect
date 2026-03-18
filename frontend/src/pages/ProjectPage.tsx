import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi, Brief } from '../api/projects'
import { api } from '../api/client'
import { directApi, type Campaign, type AdGroup, type Keyword, type Ad, type NegativeKeyword } from '../api/direct'
import { seoApi, type SeoPage, type ChecklistItem } from '../api/seo'
import { ogApi, type OgPage, type OgStats } from '../api/og'
import { mediaplanApi, type MediaPlanRow } from '../api/mediaplan'
import { analyticsApi, type TrafficSource, type DailyVisit } from '../api/analytics'

type Tab = 'overview' | 'brief' | 'crawl' | 'direct' | 'seo' | 'og' | 'mediaplan' | 'analytics' | 'topvisor' | 'content-plan' | 'reports' | 'history' | 'export'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

function CharBadge({ len, max }: { len: number; max: number }) {
  const ok = len <= max
  return (
    <span className={cx('text-xs font-mono px-1.5 py-0.5 rounded', ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>
      {len}/{max}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    active: 'bg-green-100 text-green-700',
    paused: 'bg-yellow-100 text-yellow-700',
    ready: 'bg-blue-100 text-blue-700',
    review: 'bg-purple-100 text-purple-700',
    low_frequency: 'bg-red-100 text-red-600',
  }
  return (
    <span className={cx('text-xs px-2 py-0.5 rounded-full font-medium', colors[status] || 'bg-gray-100 text-gray-600')}>
      {status}
    </span>
  )
}

function TempBadge({ temp }: { temp: string | null }) {
  if (!temp) return null
  const map: Record<string, [string, string]> = {
    hot: ['bg-red-100 text-red-700', '🔥 горячие'],
    warm: ['bg-orange-100 text-orange-700', '☀️ тёплые'],
    cold: ['bg-blue-100 text-blue-700', '❄️ холодные'],
  }
  const [cls, label] = map[temp] || ['bg-gray-100 text-gray-600', temp]
  return <span className={cx('text-xs px-2 py-0.5 rounded-full font-medium', cls)}>{label}</span>
}

// ─── Brief Tab ────────────────────────────────────────────────────────────────

interface ChatMessage { role: 'user' | 'assistant'; content: string }

function BriefTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const { data: brief, isLoading } = useQuery({
    queryKey: ['brief', projectId],
    queryFn: () => projectsApi.getBrief(projectId),
  })
  const [form, setForm] = useState<Partial<Brief>>({})
  const [saved, setSaved] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  const { data: templatesData } = useQuery({
    queryKey: ['brief-templates'],
    queryFn: () => api.get('/briefs/templates').then((r) => r.data),
  })

  const mutation = useMutation({
    mutationFn: (data: Partial<Brief>) => projectsApi.updateBrief(projectId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brief', projectId] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const applyTemplate = async (templateId: string) => {
    const r = await api.get(`/briefs/templates/${templateId}`)
    const tData = r.data.data as Partial<Brief>
    setForm((f) => ({ ...f, ...tData }))
    setShowTemplates(false)
  }

  if (isLoading) return <div className="p-4 text-gray-500">Загрузка...</div>

  const current = { ...brief, ...form }
  const field = (key: keyof Brief, label: string, multiline = false) => (
    <div key={key}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {multiline ? (
        <textarea rows={3} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          value={(current[key] as string) || ''}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
      ) : (
        <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          value={(current[key] as string) || ''}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
      )}
    </div>
  )

  const templates: { id: string; name: string; icon: string }[] = templatesData?.templates || []

  return (
    <div className="p-6 max-w-2xl space-y-4">
      {/* Templates */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">О бизнесе</h3>
        <div className="relative">
          <button
            onClick={() => setShowTemplates((v) => !v)}
            className="text-xs px-3 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-50 transition"
          >
            📋 Шаблон по нише
          </button>
          {showTemplates && templates.length > 0 && (
            <div className="absolute right-0 top-full mt-1 bg-white border rounded-xl shadow-lg z-20 w-56 py-1">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t.id)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  <span>{t.icon}</span> {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
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
      {field('excluded_geo', 'Исключить гео (города/регионы)')}

      {/* Гео таргетинг — список городов */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Гео таргетинг (список городов)</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {((current.ad_geo as string[]) || []).map((city, i) => (
            <span key={i} className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full">
              {city}
              <button type="button" onClick={() => setForm((f) => ({ ...f, ad_geo: ((f.ad_geo || current.ad_geo || []) as string[]).filter((_, j) => j !== i) }))}
                className="hover:text-red-500 font-bold leading-none">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input id="ad_geo_input" className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Введите город и нажмите +"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const v = (e.target as HTMLInputElement).value.trim()
                if (v) { setForm((f) => ({ ...f, ad_geo: [...((f.ad_geo || current.ad_geo || []) as string[]), v] }));(e.target as HTMLInputElement).value = '' }
              }
            }} />
          <button type="button" className="border px-3 py-2 rounded-lg text-sm hover:bg-gray-50"
            onClick={() => {
              const inp = document.getElementById('ad_geo_input') as HTMLInputElement
              const v = inp?.value.trim()
              if (v) { setForm((f) => ({ ...f, ad_geo: [...((f.ad_geo || current.ad_geo || []) as string[]), v] })); inp.value = '' }
            }}>+</button>
        </div>
      </div>

      {/* Конкуренты URL — динамический список */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Конкуренты (URL)</label>
        <div className="space-y-1.5 mb-2">
          {((current.competitors_urls as string[]) || []).map((url, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="flex-1 border rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                value={url}
                onChange={(e) => setForm((f) => {
                  const arr = [...((f.competitors_urls || current.competitors_urls || []) as string[])]
                  arr[i] = e.target.value
                  return { ...f, competitors_urls: arr }
                })} />
              <button type="button" onClick={() => setForm((f) => ({ ...f, competitors_urls: ((f.competitors_urls || current.competitors_urls || []) as string[]).filter((_, j) => j !== i) }))}
                className="text-red-400 hover:text-red-600 font-bold text-lg leading-none">×</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setForm((f) => ({ ...f, competitors_urls: [...((f.competitors_urls || current.competitors_urls || []) as string[]), ''] }))}
          className="text-sm text-primary-600 hover:text-primary-700 font-medium">+ Добавить URL конкурента</button>
      </div>

      <div className="pt-2 flex gap-3">
        <button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 transition disabled:opacity-50">
          {mutation.isPending ? 'Сохранение...' : 'Сохранить бриф'}
        </button>
        {saved && <span className="text-green-600 text-sm py-2">✅ Сохранено</span>}
      </div>

      {/* AI clarifying questions chat */}
      <div className="mt-8 border-t pt-6">
        <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">
          🤖 ИИ-ассистент — уточняющие вопросы
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          ИИ проанализирует бриф и задаст уточняющие вопросы. Это поможет создать более точную стратегию.
        </p>

        {/* Messages */}
        {chatMessages.length > 0 && (
          <div className="space-y-3 mb-3 max-h-80 overflow-y-auto bg-gray-50 rounded-xl p-3">
            {chatMessages.map((msg, i) => (
              <div key={i} className={cx('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cx(
                  'max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white border text-gray-800'
                )}>
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-white border rounded-xl px-3 py-2 text-sm text-gray-400">
                  ✍️ Печатает...
                </div>
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder={chatMessages.length === 0 ? 'Нажмите «Начать» или задайте вопрос...' : 'Ваш ответ...'}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && chatInput.trim()) {
                e.preventDefault()
                const userMsg = chatInput.trim()
                setChatInput('')
                setChatMessages((prev) => [...prev, { role: 'user', content: userMsg }])
                setChatLoading(true)
                api.post(`/projects/${projectId}/brief/chat`, {
                  message: userMsg,
                  history: chatMessages,
                }).then((r) => {
                  setChatMessages((prev) => [...prev, { role: 'assistant', content: r.data.response }])
                }).finally(() => setChatLoading(false))
              }
            }}
            disabled={chatLoading}
          />
          {chatMessages.length === 0 && (
            <button
              onClick={() => {
                const msg = 'Проанализируй мой бриф и задай уточняющие вопросы.'
                setChatMessages([{ role: 'user', content: msg }])
                setChatLoading(true)
                api.post(`/projects/${projectId}/brief/chat`, {
                  message: msg,
                  history: [],
                }).then((r) => {
                  setChatMessages((prev) => [...prev, { role: 'assistant', content: r.data.response }])
                }).finally(() => setChatLoading(false))
              }}
              disabled={chatLoading}
              className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 transition disabled:opacity-50 whitespace-nowrap"
            >
              Начать
            </button>
          )}
          {chatMessages.length > 0 && (
            <button
              onClick={() => {
                if (!chatInput.trim()) return
                const userMsg = chatInput.trim()
                setChatInput('')
                setChatMessages((prev) => [...prev, { role: 'user', content: userMsg }])
                setChatLoading(true)
                api.post(`/projects/${projectId}/brief/chat`, {
                  message: userMsg,
                  history: chatMessages,
                }).then((r) => {
                  setChatMessages((prev) => [...prev, { role: 'assistant', content: r.data.response }])
                }).finally(() => setChatLoading(false))
              }}
              disabled={chatLoading || !chatInput.trim()}
              className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 transition disabled:opacity-50"
            >
              →
            </button>
          )}
          {chatMessages.length > 0 && (
            <button
              onClick={() => { setChatMessages([]); setChatInput('') }}
              className="border px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50"
              title="Очистить чат"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Crawl Tab ────────────────────────────────────────────────────────────────

type AuditIssue = 'no_title' | 'no_description' | 'no_h1' | 'noindex' | 'slow' | 'no_alt' | 'orphan' | 'dup_title' | 'dup_description'

function UrlTreeNode({ node, depth = 0 }: { node: Record<string, any>; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2)
  const entries = Object.entries(node)
  if (!entries.length) return null
  return (
    <ul className={depth === 0 ? '' : 'ml-4 border-l border-gray-200 pl-2'}>
      {entries.map(([key, val]) => (
        <li key={key} className="py-0.5">
          <div
            className="flex items-center gap-1 cursor-pointer hover:text-primary-600 text-sm"
            onClick={() => setExpanded((v) => !v)}
          >
            <span className="text-gray-400 text-xs w-3">{Object.keys(val.children || {}).length > 0 ? (expanded ? '▾' : '▸') : '·'}</span>
            <span className="font-medium text-gray-700">{key}</span>
            {(val.pages || []).map((p: any) => (
              <a key={p.url} href={p.url} target="_blank" rel="noreferrer"
                className="text-xs text-blue-500 hover:underline truncate max-w-xs"
                onClick={(e) => e.stopPropagation()}>
                {p.title || p.url}
              </a>
            ))}
            {(val.pages || []).length > 0 && (
              <span className={`text-xs px-1 rounded ${val.pages[0].status_code === 200 ? 'text-green-500' : 'text-red-500'}`}>
                {val.pages[0].status_code}
              </span>
            )}
          </div>
          {expanded && val.children && Object.keys(val.children).length > 0 && (
            <UrlTreeNode node={val.children} depth={depth + 1} />
          )}
        </li>
      ))}
    </ul>
  )
}

function CrawlTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [activeIssue, setActiveIssue] = useState<AuditIssue | null>(null)
  const [auditPage, setAuditPage] = useState(0)
  const [showTree, setShowTree] = useState(false)
  const PAGE_SIZE = 20

  const { data: status } = useQuery({
    queryKey: ['crawl-status', projectId],
    queryFn: () => api.get(`/projects/${projectId}/crawl/status`).then((r) => r.data),
    refetchInterval: (q) => (q.state.data as any)?.status === 'running' ? 2000 : false,
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

  const { data: treeData } = useQuery({
    queryKey: ['crawl-tree', projectId],
    queryFn: () => api.get(`/projects/${projectId}/crawl/tree`).then((r) => r.data),
    enabled: status?.status === 'done' && showTree,
  })

  // SEO pages list for issue drill-down
  const issueParam = activeIssue ? 'true' : 'false'
  const { data: seoPages } = useQuery({
    queryKey: ['crawl-seo-pages', projectId, activeIssue, auditPage],
    queryFn: () =>
      api.get(`/projects/${projectId}/seo/pages`, {
        params: { issues_only: true, limit: PAGE_SIZE, offset: auditPage * PAGE_SIZE },
      }).then((r) => r.data),
    enabled: !!activeIssue && status?.status === 'done',
  })

  const ISSUE_LABELS: Record<AuditIssue, string> = {
    no_title: 'Без title',
    no_description: 'Без description',
    no_h1: 'Без H1',
    noindex: 'noindex',
    slow: 'Медленных (>3с)',
    no_alt: 'Картинок без alt',
    orphan: 'Orphan pages',
    dup_title: 'Дубли title',
    dup_description: 'Дубли description',
  }

  const auditItems = report ? [
    { key: 'pages_total' as const, label: 'Всего страниц', value: report.pages_total, bad: false, issue: null },
    { key: 'no_title' as const, label: 'Без title', value: report.no_title, bad: report.no_title > 0, issue: 'no_title' as AuditIssue },
    { key: 'no_description' as const, label: 'Без description', value: report.no_description, bad: report.no_description > 0, issue: 'no_description' as AuditIssue },
    { key: 'no_h1' as const, label: 'Без H1', value: report.no_h1, bad: report.no_h1 > 0, issue: 'no_h1' as AuditIssue },
    { key: 'noindex_pages' as const, label: 'noindex страниц', value: report.noindex_pages, bad: report.noindex_pages > 0, issue: 'noindex' as AuditIssue },
    { key: 'slow_pages' as const, label: 'Медленных (>3с)', value: report.slow_pages, bad: report.slow_pages > 0, issue: 'slow' as AuditIssue },
    { key: 'images_without_alt' as const, label: 'Картинок без alt', value: report.images_without_alt, bad: report.images_without_alt > 0, issue: 'no_alt' as AuditIssue },
    { key: 'orphan_pages' as const, label: 'Orphan pages', value: report.orphan_pages ?? 0, bad: (report.orphan_pages ?? 0) > 0, issue: 'orphan' as AuditIssue },
    { key: 'dup_title' as const, label: 'Дубли title', value: report.dup_title ?? 0, bad: (report.dup_title ?? 0) > 0, issue: 'dup_title' as AuditIssue },
    { key: 'dup_description' as const, label: 'Дубли description', value: report.dup_description ?? 0, bad: (report.dup_description ?? 0) > 0, issue: 'dup_description' as AuditIssue },
  ] : []

  const issues = auditItems.filter((i) => i.bad)
  const score = report
    ? Math.max(0, 100 - issues.length * 12 - (report.slow_pages > 5 ? 10 : 0))
    : null

  const scoreColor = score === null ? 'text-gray-400' : score >= 80 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600'

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <h3 className="font-semibold text-lg">Технический SEO аудит</h3>
        <button onClick={() => startMutation.mutate()}
          disabled={startMutation.isPending || status?.status === 'running'}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 transition disabled:opacity-50">
          {status?.status === 'running' ? '⏳ Парсинг...' : 'Запустить сканирование'}
        </button>
        {score !== null && (
          <div className="ml-auto text-center">
            <p className={cx('text-3xl font-bold', scoreColor)}>{score}</p>
            <p className="text-xs text-gray-400">SEO-score</p>
          </div>
        )}
      </div>

      {status && status.status !== 'not_started' && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span>Статус: <strong>{status.status}</strong></span>
            <span>{status.pages_done} / {status.pages_total} страниц</span>
          </div>
          {status.status === 'running' && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-primary-600 h-2 rounded-full transition-all"
                style={{ width: `${status.pages_total ? Math.round((status.pages_done / status.pages_total) * 100) : 0}%` }} />
            </div>
          )}
          {status.error && <p className="text-red-500 text-sm mt-2">{status.error}</p>}
        </div>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 text-sm">
            {auditItems.map((item) => (
              <div
                key={item.key}
                onClick={() => item.issue && item.bad ? setActiveIssue(item.issue === activeIssue ? null : item.issue) : null}
                className={cx(
                  'bg-white rounded-xl p-3 border transition',
                  item.bad ? 'border-red-200 cursor-pointer hover:border-red-400' : 'border-gray-200',
                  activeIssue === item.issue ? 'ring-2 ring-red-400' : ''
                )}
              >
                <p className="text-gray-500 text-xs">{item.label}</p>
                <p className={cx('text-xl font-bold mt-1', item.bad ? 'text-red-600' : 'text-gray-900')}>{item.value}</p>
                {item.issue && item.bad && <p className="text-xs text-red-400 mt-0.5">нажмите для деталей</p>}
              </div>
            ))}
          </div>

          {/* Issues summary */}
          {issues.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">
              ✅ Технических проблем не обнаружено
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <p className="text-sm font-medium text-red-700 mb-2">⚠️ Найдено проблем: {issues.length}</p>
              <ul className="text-sm text-red-600 space-y-0.5">
                {issues.map((i) => (
                  <li key={i.key}>• {i.label}: <strong>{i.value}</strong> страниц</li>
                ))}
              </ul>
            </div>
          )}

          {/* Drill-down table */}
          {activeIssue && (
            <div className="bg-white rounded-xl border mt-4 overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  Страницы с проблемой: {ISSUE_LABELS[activeIssue]}
                </span>
                <button onClick={() => setActiveIssue(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
              </div>
              {seoPages?.pages?.length ? (
                <>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="px-4 py-2 text-left text-gray-500">URL</th>
                        <th className="px-4 py-2 text-left text-gray-500 w-48">Title</th>
                        <th className="px-4 py-2 text-left text-gray-500 w-24">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seoPages.pages.map((p: any) => (
                        <tr key={p.page_url} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <a href={p.page_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate block max-w-xs">
                              {p.page_url}
                            </a>
                          </td>
                          <td className="px-4 py-2 text-gray-600 truncate max-w-xs">{p.current_title || '—'}</td>
                          <td className="px-4 py-2">
                            {p.has_title_issue && <span className="text-red-500 mr-1">T</span>}
                            {p.has_desc_issue && <span className="text-orange-500 mr-1">D</span>}
                            {p.has_og_issue && <span className="text-yellow-600">OG</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-4 py-2 border-t flex gap-2 text-xs">
                    <button disabled={auditPage === 0} onClick={() => setAuditPage((p) => p - 1)}
                      className="px-2 py-1 border rounded disabled:opacity-40">← Назад</button>
                    <button disabled={seoPages.pages.length < PAGE_SIZE} onClick={() => setAuditPage((p) => p + 1)}
                      className="px-2 py-1 border rounded disabled:opacity-40">Далее →</button>
                    <span className="text-gray-400 py-1">Стр. {auditPage + 1}</span>
                  </div>
                </>
              ) : (
                <p className="px-4 py-4 text-sm text-gray-400">Нет данных (запустите сканирование)</p>
              )}
            </div>
          )}

          {/* URL Tree */}
          <div className="mt-6">
            <button
              onClick={() => setShowTree((v) => !v)}
              className="text-sm text-primary-600 hover:underline flex items-center gap-1"
            >
              <span>{showTree ? '▾' : '▸'}</span>
              Структура сайта (дерево URL)
              {treeData && <span className="text-gray-400 text-xs ml-1">({treeData.total} страниц)</span>}
            </button>
            {showTree && (
              <div className="mt-3 bg-white rounded-xl border p-4 overflow-auto max-h-96 text-xs">
                {treeData ? (
                  <UrlTreeNode node={treeData.tree} />
                ) : (
                  <p className="text-gray-400">Загрузка...</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Direct: Ad Card ─────────────────────────────────────────────────────────

function AdCard({ ad, onUpdate }: { ad: Ad; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    headline1: ad.headline1 || '',
    headline2: ad.headline2 || '',
    headline3: ad.headline3 || '',
    text: ad.text || '',
    display_url: ad.display_url || '',
    utm: ad.utm || '',
    status: ad.status,
  })
  const saveMutation = useMutation({
    mutationFn: () => directApi.updateAd(ad.id, form),
    onSuccess: () => { setEditing(false); onUpdate() },
  })

  if (!editing) {
    return (
      <div className={cx('border rounded-lg p-3 bg-white text-sm', !ad.valid && 'border-red-200')}>
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs text-gray-500">Вариант {ad.variant}</span>
          <div className="flex gap-2 items-center">
            <StatusBadge status={ad.status} />
            {!ad.valid && <span className="text-xs text-red-500">⚠️ лимит</span>}
            <button onClick={() => setEditing(true)} className="text-xs text-primary-600 hover:underline">✏️</button>
          </div>
        </div>
        <p className="font-medium text-gray-800 leading-snug">{ad.headline1}{ad.headline2 ? ` | ${ad.headline2}` : ''}{ad.headline3 ? ` | ${ad.headline3}` : ''}</p>
        <p className="text-gray-600 mt-1 text-xs">{ad.text}</p>
        {ad.display_url && <p className="text-gray-400 text-xs mt-1">🔗 {ad.display_url}</p>}
        <div className="flex gap-2 mt-2 flex-wrap">
          <CharBadge len={ad.headline1_len} max={56} />
          <CharBadge len={ad.headline2_len} max={30} />
          {ad.headline3 && <CharBadge len={ad.headline3_len} max={30} />}
          <CharBadge len={ad.text_len} max={81} />
        </div>
      </div>
    )
  }

  return (
    <div className="border border-primary-200 rounded-lg p-3 bg-blue-50 text-sm space-y-2">
      {[
        { key: 'headline1', label: 'Заголовок 1', max: 56 },
        { key: 'headline2', label: 'Заголовок 2', max: 30 },
        { key: 'headline3', label: 'Заголовок 3 (опц.)', max: 30 },
      ].map(({ key, label, max }) => (
        <div key={key}>
          <div className="flex justify-between mb-0.5">
            <label className="text-xs text-gray-600">{label}</label>
            <CharBadge len={(form as any)[key].length} max={max} />
          </div>
          <input className="w-full border rounded px-2 py-1 text-sm bg-white"
            value={(form as any)[key]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
        </div>
      ))}
      <div>
        <div className="flex justify-between mb-0.5">
          <label className="text-xs text-gray-600">Текст объявления</label>
          <CharBadge len={form.text.length} max={81} />
        </div>
        <textarea rows={2} className="w-full border rounded px-2 py-1 text-sm bg-white"
          value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} />
      </div>
      <input className="w-full border rounded px-2 py-1 text-sm bg-white" placeholder="Отображаемый URL"
        value={form.display_url} onChange={(e) => setForm((f) => ({ ...f, display_url: e.target.value }))} />
      <input className="w-full border rounded px-2 py-1 text-sm bg-white" placeholder="UTM-метки"
        value={form.utm} onChange={(e) => setForm((f) => ({ ...f, utm: e.target.value }))} />
      <div className="flex gap-2 items-center">
        <select className="border rounded px-2 py-1 text-sm bg-white"
          value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
          <option value="draft">draft</option>
          <option value="ready">ready</option>
          <option value="review">review</option>
        </select>
        <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
          className="bg-primary-600 text-white px-3 py-1 rounded text-sm hover:bg-primary-700 disabled:opacity-50">
          {saveMutation.isPending ? '...' : 'Сохранить'}
        </button>
        <button onClick={() => setEditing(false)} className="border px-3 py-1 rounded text-sm hover:bg-white">Отмена</button>
      </div>
    </div>
  )
}

// ─── Direct: Group Content ────────────────────────────────────────────────────

function GroupContent({ group }: { group: AdGroup }) {
  const qc = useQueryClient()
  const [subtab, setSubtab] = useState<'keywords' | 'ads'>('keywords')
  const [newKw, setNewKw] = useState('')
  const [newKwTemp, setNewKwTemp] = useState('warm')

  const { data: keywords = [] } = useQuery({
    queryKey: ['keywords', group.id],
    queryFn: () => directApi.getKeywords(group.id),
  })
  const { data: ads = [] } = useQuery({
    queryKey: ['ads', group.id],
    queryFn: () => directApi.getAds(group.id),
  })

  const genKwMut = useMutation({
    mutationFn: () => directApi.generateKeywords(group.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['keywords', group.id] }),
  })
  const checkFreqMut = useMutation({
    mutationFn: () => directApi.checkFrequencies(group.id),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['keywords', group.id] }), 5000),
  })
  const addKwMut = useMutation({
    mutationFn: () => directApi.addKeyword(group.id, newKw.trim(), newKwTemp),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['keywords', group.id] }); setNewKw('') },
  })
  const delKwMut = useMutation({
    mutationFn: (id: string) => directApi.deleteKeyword(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['keywords', group.id] }),
  })
  const genAdsMut = useMutation({
    mutationFn: () => directApi.generateAds(group.id, 2),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ads', group.id] }),
  })

  return (
    <div className="mt-2 ml-6 border-l-2 border-gray-100 pl-4">
      <div className="flex gap-1 mb-3">
        {(['keywords', 'ads'] as const).map((t) => (
          <button key={t} onClick={() => setSubtab(t)}
            className={cx('px-3 py-1 text-sm rounded-md transition',
              subtab === t ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
            {t === 'keywords' ? `Ключи (${(keywords as Keyword[]).length})` : `Объявления (${(ads as Ad[]).length})`}
          </button>
        ))}
      </div>

      {subtab === 'keywords' && (
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => genKwMut.mutate()} disabled={genKwMut.isPending}
              className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
              {genKwMut.isPending ? '⏳...' : '✨ Сгенерировать ключи'}
            </button>
            <button onClick={() => checkFreqMut.mutate()} disabled={checkFreqMut.isPending}
              className="border border-gray-300 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
              {checkFreqMut.isPending ? '⏳...' : '📊 Проверить частоты'}
            </button>
          </div>
          {genKwMut.isSuccess && <p className="text-xs text-green-600">✅ Добавлено: {(genKwMut.data as any)?.keywords_created}</p>}
          {checkFreqMut.isSuccess && <p className="text-xs text-blue-600">⏳ Задача запущена, частоты обновятся через ~30с</p>}
          <div className="space-y-1">
            {(keywords as Keyword[]).map((kw) => (
              <div key={kw.id} className="flex items-center gap-2 py-1.5 px-2 bg-white border rounded text-sm hover:bg-gray-50">
                <TempBadge temp={kw.temperature} />
                <span className="flex-1 font-mono text-xs">{kw.phrase}</span>
                {kw.frequency !== null && (
                  <span className="text-xs text-gray-500 tabular-nums w-16 text-right">{kw.frequency.toLocaleString()}</span>
                )}
                <StatusBadge status={kw.status} />
                <button onClick={() => delKwMut.mutate(kw.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
              </div>
            ))}
            {(keywords as Keyword[]).length === 0 && (
              <p className="text-sm text-gray-400 py-2 text-center">Нет ключей — нажмите «Сгенерировать»</p>
            )}
          </div>
          <div className="flex gap-2">
            <input className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Добавить ключ вручную..."
              value={newKw}
              onKeyDown={(e) => e.key === 'Enter' && newKw.trim() && addKwMut.mutate()}
              onChange={(e) => setNewKw(e.target.value)} />
            <select className="border rounded-lg px-2 py-1.5 text-sm"
              value={newKwTemp} onChange={(e) => setNewKwTemp(e.target.value)}>
              <option value="hot">🔥</option>
              <option value="warm">☀️</option>
              <option value="cold">❄️</option>
            </select>
            <button onClick={() => newKw.trim() && addKwMut.mutate()} disabled={!newKw.trim() || addKwMut.isPending}
              className="bg-gray-700 text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-50">+</button>
          </div>
        </div>
      )}

      {subtab === 'ads' && (
        <div className="space-y-2">
          <button onClick={() => genAdsMut.mutate()} disabled={genAdsMut.isPending}
            className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
            {genAdsMut.isPending ? '⏳ Генерация...' : '✨ Сгенерировать 2 варианта'}
          </button>
          {(ads as Ad[]).map((ad) => (
            <AdCard key={ad.id} ad={ad} onUpdate={() => qc.invalidateQueries({ queryKey: ['ads', group.id] })} />
          ))}
          {(ads as Ad[]).length === 0 && (
            <p className="text-sm text-gray-400 py-2 text-center">Нет объявлений — нажмите «Сгенерировать»</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Direct: Campaign Block ───────────────────────────────────────────────────

function CampaignBlock({ campaign, projectId }: { campaign: Campaign; projectId: string }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    name: campaign.name,
    type: campaign.type || '',
    budget_monthly: campaign.budget_monthly?.toString() || '',
  })
  const [sitelinks, setSitelinks] = useState<Array<{ title: string; url: string }>>(campaign.sitelinks || [])
  const [editingSitelinks, setEditingSitelinks] = useState(false)

  const { data: groups = [] } = useQuery({
    queryKey: ['groups', campaign.id],
    queryFn: () => directApi.getGroups(campaign.id),
    enabled: expanded,
  })

  const createGroupMut = useMutation({
    mutationFn: () => directApi.createGroup(campaign.id, newGroupName.trim() || 'Новая группа'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups', campaign.id] }); setNewGroupName(''); setAddingGroup(false) },
  })
  const updateMut = useMutation({
    mutationFn: () => directApi.updateCampaign(campaign.id, {
      name: editForm.name,
      type: editForm.type || undefined,
      budget_monthly: editForm.budget_monthly ? Number(editForm.budget_monthly) : undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns', projectId] }); setEditing(false) },
  })
  const saveSitelinksMut = useMutation({
    mutationFn: () => directApi.updateCampaign(campaign.id, { sitelinks }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns', projectId] }); setEditingSitelinks(false) },
  })
  const deleteMut = useMutation({
    mutationFn: () => directApi.deleteCampaign(campaign.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns', projectId] }),
  })

  const toggleGroup = (id: string) =>
    setExpandedGroups((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className="border rounded-lg bg-white">
      <div className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50 select-none"
        onClick={() => !editing && setExpanded((v) => !v)}>
        <span className="text-gray-400 text-xs w-3">{expanded ? '▼' : '▶'}</span>
        {editing ? (
          <div className="flex gap-2 flex-1 items-center" onClick={(e) => e.stopPropagation()}>
            <input className="border rounded px-2 py-1 text-sm flex-1 min-w-0"
              value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            <input className="border rounded px-2 py-1 text-sm w-28" placeholder="Тип (search)"
              value={editForm.type} onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value }))} />
            <input type="number" className="border rounded px-2 py-1 text-sm w-24" placeholder="Бюджет ₽"
              value={editForm.budget_monthly} onChange={(e) => setEditForm((f) => ({ ...f, budget_monthly: e.target.value }))} />
            <button onClick={() => updateMut.mutate()} disabled={updateMut.isPending}
              className="bg-primary-600 text-white px-2 py-1 rounded text-xs hover:bg-primary-700 disabled:opacity-50">💾</button>
            <button onClick={() => setEditing(false)} className="border px-2 py-1 rounded text-xs">✕</button>
          </div>
        ) : (
          <>
            <span className="font-medium text-sm flex-1 min-w-0 truncate">{campaign.name}</span>
            {campaign.type && <span className="text-xs text-gray-500 shrink-0">{campaign.type}</span>}
            {campaign.budget_monthly && (
              <span className="text-xs text-gray-500 shrink-0">{Number(campaign.budget_monthly).toLocaleString()} ₽/мес</span>
            )}
            <StatusBadge status={campaign.status} />
            <button onClick={(e) => { e.stopPropagation(); setEditing(true) }}
              className="text-gray-400 hover:text-gray-700 text-xs shrink-0 ml-1">✏️</button>
            <button onClick={(e) => { e.stopPropagation(); if (confirm(`Удалить кампанию "${campaign.name}"?`)) deleteMut.mutate() }}
              className="text-red-400 hover:text-red-600 text-xs shrink-0">🗑</button>
          </>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t bg-gray-50 pt-3 space-y-2">
          {/* Sitelinks editor */}
          <div className="border rounded-lg bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Быстрые ссылки (до 4)</span>
              {!editingSitelinks ? (
                <button onClick={() => setEditingSitelinks(true)} className="text-xs text-primary-600 hover:text-primary-700">✏️ Редактировать</button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => saveSitelinksMut.mutate()} disabled={saveSitelinksMut.isPending}
                    className="text-xs bg-primary-600 text-white px-2 py-1 rounded hover:bg-primary-700 disabled:opacity-50">
                    {saveSitelinksMut.isPending ? '...' : '💾 Сохранить'}
                  </button>
                  <button onClick={() => { setSitelinks(campaign.sitelinks || []); setEditingSitelinks(false) }} className="text-xs border px-2 py-1 rounded">✕</button>
                </div>
              )}
            </div>
            {editingSitelinks ? (
              <div className="space-y-2">
                {sitelinks.map((sl, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input className="border rounded px-2 py-1 text-xs w-32 shrink-0" placeholder="Заголовок"
                      value={sl.title}
                      onChange={(e) => setSitelinks((s) => s.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                    <input className="border rounded px-2 py-1 text-xs flex-1 font-mono" placeholder="https://..."
                      value={sl.url}
                      onChange={(e) => setSitelinks((s) => s.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
                    <button onClick={() => setSitelinks((s) => s.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-sm font-bold">×</button>
                  </div>
                ))}
                {sitelinks.length < 4 && (
                  <button onClick={() => setSitelinks((s) => [...s, { title: '', url: '' }])}
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium">+ Добавить ссылку</button>
                )}
              </div>
            ) : sitelinks.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Нет быстрых ссылок</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sitelinks.map((sl, i) => (
                  <a key={i} href={sl.url} target="_blank" rel="noreferrer"
                    className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition">
                    {sl.title || sl.url}
                  </a>
                ))}
              </div>
            )}
          </div>

          {(groups as AdGroup[]).map((g) => (
            <div key={g.id} className="border rounded-lg bg-white">
              <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 select-none"
                onClick={() => toggleGroup(g.id)}>
                <span className="text-gray-400 text-xs w-3">{expandedGroups.has(g.id) ? '▼' : '▶'}</span>
                <span className="text-sm font-medium flex-1">{g.name}</span>
                <StatusBadge status={g.status} />
              </div>
              {expandedGroups.has(g.id) && (
                <div className="px-3 pb-3 border-t bg-gray-50">
                  <GroupContent group={g} />
                </div>
              )}
            </div>
          ))}

          {(groups as AdGroup[]).length === 0 && !addingGroup && (
            <p className="text-sm text-gray-400">Нет групп объявлений</p>
          )}

          {addingGroup ? (
            <div className="flex gap-2">
              <input autoFocus className="flex-1 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Название группы..."
                value={newGroupName}
                onKeyDown={(e) => e.key === 'Enter' && createGroupMut.mutate()}
                onChange={(e) => setNewGroupName(e.target.value)} />
              <button onClick={() => createGroupMut.mutate()} disabled={createGroupMut.isPending}
                className="bg-primary-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50">Создать</button>
              <button onClick={() => setAddingGroup(false)} className="border px-3 py-1.5 rounded text-sm">✕</button>
            </div>
          ) : (
            <button onClick={() => setAddingGroup(true)}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium">+ Добавить группу</button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Direct Tab ───────────────────────────────────────────────────────────────

function DirectTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [strategyOpen, setStrategyOpen] = useState(true)
  const [editingStrategy, setEditingStrategy] = useState(false)
  const [strategyText, setStrategyText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [addingCampaign, setAddingCampaign] = useState(false)
  const [newCampaignName, setNewCampaignName] = useState('')
  const [negInput, setNegInput] = useState('')

  const { data: strategyData, refetch: refetchStrategy } = useQuery({
    queryKey: ['direct-strategy', projectId],
    queryFn: () => directApi.getStrategy(projectId),
    refetchInterval: isGenerating ? 3000 : false,
  })

  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns', projectId],
    queryFn: () => directApi.getCampaigns(projectId),
  })

  const { data: negKws = [] } = useQuery({
    queryKey: ['neg-kws', projectId],
    queryFn: () => directApi.getNegativeKeywords(projectId),
  })

  const genStrategyMut = useMutation({
    mutationFn: () => directApi.generateStrategy(projectId),
    onSuccess: () => {
      setIsGenerating(true)
      const interval = setInterval(() => {
        refetchStrategy().then((r: any) => {
          if (r.data?.strategy_text) { setIsGenerating(false); clearInterval(interval) }
        })
      }, 4000)
      setTimeout(() => { setIsGenerating(false); clearInterval(interval) }, 120000)
    },
  })
  const updateStrategyMut = useMutation({
    mutationFn: () => directApi.updateStrategy(projectId, strategyText),
    onSuccess: () => { setEditingStrategy(false); qc.invalidateQueries({ queryKey: ['direct-strategy', projectId] }) },
  })
  const createCampaignMut = useMutation({
    mutationFn: () => directApi.createCampaign(projectId, { name: newCampaignName.trim() || 'Новая кампания' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns', projectId] }); setNewCampaignName(''); setAddingCampaign(false) },
  })
  const genNegMut = useMutation({
    mutationFn: () => directApi.generateNegativeKeywords(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['neg-kws', projectId] }),
  })
  const addNegMut = useMutation({
    mutationFn: () => directApi.addNegativeKeyword(projectId, negInput.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['neg-kws', projectId] }); setNegInput('') },
  })
  const delNegMut = useMutation({
    mutationFn: (id: string) => directApi.deleteNegativeKeyword(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['neg-kws', projectId] }),
  })

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Strategy */}
      <div className="border rounded-lg bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b cursor-pointer hover:bg-gray-50"
          onClick={() => setStrategyOpen((v) => !v)}>
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-xs w-3">{strategyOpen ? '▼' : '▶'}</span>
            <h3 className="font-semibold">Стратегия</h3>
            {isGenerating && <span className="text-xs text-blue-500 animate-pulse">⏳ генерируется...</span>}
          </div>
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            {strategyData?.strategy_text && !editingStrategy && (
              <button onClick={() => { setStrategyText(strategyData.strategy_text || ''); setEditingStrategy(true) }}
                className="text-sm border px-3 py-1 rounded-lg hover:bg-gray-50">✏️ Редактировать</button>
            )}
            <button onClick={() => genStrategyMut.mutate()} disabled={genStrategyMut.isPending || isGenerating}
              className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
              {genStrategyMut.isPending || isGenerating ? '⏳ Генерация...' : '✨ Сгенерировать'}
            </button>
          </div>
        </div>
        {strategyOpen && (
          <div className="p-4">
            {editingStrategy ? (
              <div className="space-y-2">
                <textarea rows={14} className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={strategyText} onChange={(e) => setStrategyText(e.target.value)} />
                <div className="flex gap-2">
                  <button onClick={() => updateStrategyMut.mutate()} disabled={updateStrategyMut.isPending}
                    className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                    {updateStrategyMut.isPending ? 'Сохранение...' : 'Сохранить'}
                  </button>
                  <button onClick={() => setEditingStrategy(false)} className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Отмена</button>
                </div>
              </div>
            ) : strategyData?.strategy_text ? (
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{strategyData.strategy_text}</pre>
            ) : (
              <p className="text-gray-400 text-sm py-4 text-center">
                Стратегия не сгенерирована. Нажмите «Сгенерировать» — ИИ составит структуру кампаний на основе брифа и данных сайта.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Campaigns */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Кампании ({(campaigns as Campaign[]).length})</h3>
          <button onClick={() => setAddingCampaign(true)}
            className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700">
            + Кампания
          </button>
        </div>
        {addingCampaign && (
          <div className="flex gap-2 mb-3">
            <input autoFocus className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Название кампании..."
              value={newCampaignName}
              onKeyDown={(e) => e.key === 'Enter' && createCampaignMut.mutate()}
              onChange={(e) => setNewCampaignName(e.target.value)} />
            <button onClick={() => createCampaignMut.mutate()} disabled={createCampaignMut.isPending}
              className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">Создать</button>
            <button onClick={() => setAddingCampaign(false)} className="border px-4 py-2 rounded-lg text-sm">✕</button>
          </div>
        )}
        <div className="space-y-2">
          {(campaigns as Campaign[]).map((c) => <CampaignBlock key={c.id} campaign={c} projectId={projectId} />)}
          {(campaigns as Campaign[]).length === 0 && (
            <div className="text-center py-10 text-gray-400 border-2 border-dashed rounded-lg">
              <p>Нет кампаний. Сгенерируйте стратегию — она создаст структуру автоматически, или добавьте кампанию вручную.</p>
            </div>
          )}
        </div>
      </div>

      {/* Negative keywords */}
      <div className="border rounded-lg bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Минус-слова ({(negKws as NegativeKeyword[]).length})</h3>
          <button onClick={() => genNegMut.mutate()} disabled={genNegMut.isPending}
            className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
            {genNegMut.isPending ? '⏳...' : '✨ Сгенерировать'}
          </button>
        </div>
        <div className="flex gap-2 mb-3">
          <input className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Добавить минус-слово..."
            value={negInput}
            onKeyDown={(e) => e.key === 'Enter' && negInput.trim() && addNegMut.mutate()}
            onChange={(e) => setNegInput(e.target.value)} />
          <button onClick={() => negInput.trim() && addNegMut.mutate()} disabled={!negInput.trim() || addNegMut.isPending}
            className="bg-gray-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">+</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(negKws as NegativeKeyword[]).map((nk) => (
            <span key={nk.id} className="inline-flex items-center gap-1 bg-red-50 border border-red-200 text-red-700 text-xs px-2 py-1 rounded-full">
              -{nk.phrase}
              <button onClick={() => delNegMut.mutate(nk.id)} className="hover:text-red-900 ml-0.5">✕</button>
            </span>
          ))}
          {(negKws as NegativeKeyword[]).length === 0 && <p className="text-sm text-gray-400">Нет минус-слов</p>}
        </div>
      </div>
    </div>
  )
}

// ─── SEO Tab ──────────────────────────────────────────────────────────────────

function ChecklistSection({ items }: { items: ChecklistItem[] }) {
  const byCategory: Record<string, ChecklistItem[]> = {}
  for (const item of items) {
    if (!byCategory[item.category]) byCategory[item.category] = []
    byCategory[item.category].push(item)
  }
  return (
    <div className="space-y-4">
      {Object.entries(byCategory).map(([cat, catItems]) => (
        <div key={cat}>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{cat}</h4>
          <div className="space-y-1">
            {catItems.map((item) => (
              <div key={item.name} className="flex items-center gap-3 py-2 px-3 bg-white rounded-lg border text-sm">
                <span>{item.status === 'ok' ? '✅' : item.status === 'warn' ? '⚠️' : '❌'}</span>
                <span className="flex-1">{item.name}</span>
                <span className={cx('font-semibold tabular-nums',
                  item.status === 'ok' ? 'text-green-600' : item.status === 'warn' ? 'text-yellow-600' : 'text-red-600')}>
                  {item.count > 0 ? item.count.toLocaleString() : '—'}
                </span>
                {item.count > 0 && <span className="text-gray-400 text-xs w-8 text-right">{item.pct}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function SeoPageRow({ page, projectId, onUpdate }: { page: SeoPage; projectId: string; onUpdate: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [form, setForm] = useState({
    rec_title: page.rec_title || '',
    rec_description: page.rec_description || '',
    rec_og_title: page.rec_og_title || '',
    rec_og_description: page.rec_og_description || '',
  })
  const saveMut = useMutation({
    mutationFn: () => seoApi.updateMeta(projectId, page.page_url, form),
    onSuccess: () => { setExpanded(false); onUpdate() },
  })

  const hasIssue = page.has_title_issue || page.has_desc_issue || page.has_og_issue
  const hasRec = page.rec_title || page.rec_description

  return (
    <div className={cx('border rounded-lg bg-white overflow-hidden',
      hasRec ? 'border-green-200' : hasIssue ? 'border-red-200' : '')}>
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 text-sm"
        onClick={() => setExpanded((v) => !v)}>
        <span className="text-gray-400 text-xs w-3">{expanded ? '▼' : '▶'}</span>
        <span className="flex-1 font-mono text-xs truncate" title={page.page_url}>{page.page_url}</span>
        <div className="flex gap-1 shrink-0">
          {page.has_title_issue && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded">title</span>}
          {page.has_desc_issue && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded">desc</span>}
          {page.has_og_issue && <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded">og</span>}
          {hasRec && <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">✓ рек.</span>}
        </div>
      </div>
      {expanded && (
        <div className="border-t p-3 space-y-3 bg-gray-50">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-gray-500 mb-1 font-medium">Текущий title</p>
              <p className={cx(page.has_title_issue ? 'text-red-600' : 'text-gray-700')}>
                {page.current_title || <em className="text-gray-400">нет</em>}
              </p>
              {page.current_title && <div className="mt-1"><CharBadge len={page.current_title.length} max={70} /></div>}
            </div>
            <div>
              <p className="text-gray-500 mb-1 font-medium">Текущий description</p>
              <p className={cx(page.has_desc_issue ? 'text-red-600' : 'text-gray-700', 'line-clamp-3')}>
                {page.current_description || <em className="text-gray-400">нет</em>}
              </p>
              {page.current_description && <div className="mt-1"><CharBadge len={page.current_description.length} max={160} /></div>}
            </div>
          </div>
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-medium text-gray-600">Рекомендации (редактируемы)</p>
            {[
              { key: 'rec_title', label: 'Рек. title', max: 70, placeholder: 'Рекомендуемый title (50–70 симв.)' },
              { key: 'rec_description', label: 'Рек. description', max: 160, placeholder: 'Рекомендуемый description (120–160 симв.)' },
              { key: 'rec_og_title', label: 'Рек. og:title', max: 90, placeholder: 'OG title для соцсетей (60–90 симв.)' },
              { key: 'rec_og_description', label: 'Рек. og:description', max: 200, placeholder: 'OG description (150–200 симв.)' },
            ].map(({ key, label, max, placeholder }) => (
              <div key={key}>
                <div className="flex justify-between mb-0.5">
                  <label className="text-xs text-gray-600">{label}</label>
                  <CharBadge len={(form as any)[key].length} max={max} />
                </div>
                {key.includes('description') ? (
                  <textarea rows={2} className="w-full border rounded px-2 py-1 text-sm bg-white"
                    placeholder={placeholder}
                    value={(form as any)[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
                ) : (
                  <input className="w-full border rounded px-2 py-1 text-sm bg-white"
                    placeholder={placeholder}
                    value={(form as any)[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
              className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
              {saveMut.isPending ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button onClick={() => setExpanded(false)} className="border px-3 py-1.5 rounded-lg text-sm hover:bg-white">Закрыть</button>
          </div>
        </div>
      )}
    </div>
  )
}

function SeoTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [view, setView] = useState<'checklist' | 'pages' | 'cluster'>('checklist')
  const [issuesOnly, setIssuesOnly] = useState(true)
  const [generateOg, setGenerateOg] = useState(false)
  const [generateTaskId, setGenerateTaskId] = useState<string | null>(null)
  const [clusters, setClusters] = useState<any[] | null>(null)
  const [clusterSource, setClusterSource] = useState('')

  const clusterMut = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/seo/cluster`).then((r) => r.data),
    onSuccess: (data: any) => { setClusters(data.clusters); setClusterSource(data.source) },
  })

  const { data: checklist, isLoading: clLoading } = useQuery({
    queryKey: ['seo-checklist', projectId],
    queryFn: () => seoApi.getChecklist(projectId),
  })
  const { data: pagesData, isLoading: pagesLoading, refetch: refetchPages } = useQuery({
    queryKey: ['seo-pages', projectId, issuesOnly],
    queryFn: () => seoApi.getPages(projectId, { issues_only: issuesOnly, limit: 100 }),
    enabled: view === 'pages',
  })
  const { data: taskStatus } = useQuery({
    queryKey: ['seo-task', generateTaskId],
    queryFn: () => seoApi.getTaskStatus(projectId, generateTaskId!),
    enabled: !!generateTaskId,
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.status
      return s === 'running' || s === 'pending' ? 2000 : false
    },
  })

  const genMetaMut = useMutation({
    mutationFn: () => seoApi.generateMeta(projectId, generateOg),
    onSuccess: (data: any) => setGenerateTaskId(data.task_id),
  })

  const isRunning = taskStatus?.status === 'running' || taskStatus?.status === 'pending'
  const isDone = taskStatus?.status === 'success'

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1">
          {([
            ['checklist', '📋 Чеклист'],
            ['pages', '📄 Мета-теги'],
            ['cluster', '🔗 Кластеры'],
          ] as const).map(([v, label]) => (
            <button key={v} onClick={() => setView(v as any)}
              className={cx('px-4 py-2 text-sm rounded-lg transition',
                view === v ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" className="rounded" checked={generateOg} onChange={(e) => setGenerateOg(e.target.checked)} />
            + OG теги
          </label>
          <button onClick={() => genMetaMut.mutate()} disabled={genMetaMut.isPending || isRunning}
            className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
            {genMetaMut.isPending || isRunning ? '⏳ Генерация...' : '✨ Сгенерировать мета-теги'}
          </button>
        </div>
      </div>

      {generateTaskId && (
        <div className={cx('rounded-lg p-3 mb-4 text-sm flex items-center gap-3',
          isDone ? 'bg-green-50 border border-green-200 text-green-700'
          : isRunning ? 'bg-blue-50 border border-blue-200 text-blue-700'
          : 'bg-red-50 border border-red-200 text-red-700')}>
          {isRunning && <span>⏳ Генерация мета-тегов: {taskStatus?.progress ?? 0}%</span>}
          {isDone && <span>✅ Готово: {(taskStatus?.result as any)?.pages_generated ?? 0} страниц обработано</span>}
          {taskStatus?.status === 'failed' && <span>❌ Ошибка: {taskStatus.error}</span>}
          {isDone && (
            <button onClick={() => { refetchPages(); qc.invalidateQueries({ queryKey: ['seo-pages'] }) }}
              className="ml-auto text-sm underline">Обновить</button>
          )}
        </div>
      )}

      {view === 'checklist' && (
        clLoading ? <div className="text-gray-500 py-4">Загрузка...</div> :
        checklist?.status === 'no_crawl' ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-lg font-medium mb-1">Нет данных парсинга</p>
            <p className="text-sm">Запустите парсинг сайта на вкладке «Парсинг»</p>
          </div>
        ) : checklist ? (
          <>
            <div className="flex items-center gap-6 mb-6 p-4 bg-white border rounded-lg">
              <div className="text-center">
                <div className={cx('text-4xl font-bold',
                  (checklist.score || 0) >= 80 ? 'text-green-600' : (checklist.score || 0) >= 50 ? 'text-yellow-600' : 'text-red-600')}>
                  {checklist.score}%
                </div>
                <p className="text-xs text-gray-500 mt-1">SEO-оценка</p>
              </div>
              <div className="w-px h-12 bg-gray-200" />
              <div>
                <p className="text-lg font-semibold">{checklist.pages_total?.toLocaleString()}</p>
                <p className="text-xs text-gray-500">страниц проанализировано</p>
              </div>
              {checklist.crawl_date && (
                <p className="text-xs text-gray-400 ml-auto">
                  Данные от {new Date(checklist.crawl_date).toLocaleDateString('ru-RU')}
                </p>
              )}
            </div>
            <ChecklistSection items={checklist.items || []} />
          </>
        ) : null
      )}

      {view === 'pages' && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" className="rounded" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} />
              Только страницы с проблемами
            </label>
            {pagesData && (
              <span className="text-sm text-gray-500">{pagesData.pages?.length ?? 0} из {pagesData.total ?? 0}</span>
            )}
          </div>
          {pagesLoading ? <div className="text-gray-500">Загрузка...</div> :
            pagesData?.crawl_status === 'not_done' ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">📭</p>
                <p className="font-medium">Нет данных парсинга</p>
                <p className="text-sm mt-1">Запустите парсинг на вкладке «Парсинг»</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(pagesData?.pages ?? []).map((page: SeoPage) => (
                  <SeoPageRow key={page.page_url} page={page} projectId={projectId}
                    onUpdate={() => qc.invalidateQueries({ queryKey: ['seo-pages', projectId] })} />
                ))}
                {(pagesData?.pages ?? []).length === 0 && (
                  <div className="text-center py-10 text-gray-400">
                    <p>Нет страниц с проблемами 🎉</p>
                  </div>
                )}
              </div>
            )
          }
        </div>
      )}

      {view === 'cluster' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600">
              Кластеризация объединяет ключевые фразы по смыслу.
              {clusterSource && <span className="ml-2 text-xs text-gray-400">(источник: {clusterSource})</span>}
            </p>
            <button onClick={() => clusterMut.mutate()} disabled={clusterMut.isPending}
              className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
              {clusterMut.isPending ? '⏳ Кластеризация...' : '🔗 Запустить кластеризацию'}
            </button>
          </div>
          {clusterMut.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-3">
              ❌ Ошибка: {(clusterMut.error as any)?.response?.data?.detail || 'Не удалось выполнить кластеризацию'}
            </div>
          )}
          {!clusters && !clusterMut.isPending && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">🔗</p>
              <p className="font-medium">Нажмите «Запустить кластеризацию»</p>
              <p className="text-sm mt-1">Ключевые фразы из вкладки Директ будут сгруппированы по смыслу</p>
            </div>
          )}
          {clusters && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-2">Найдено кластеров: <strong>{clusters.length}</strong></p>
              {clusters.map((cl: any, i: number) => (
                <ClusterCard key={i} cluster={cl} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ClusterCard({ cluster }: { cluster: any }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition"
        onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center gap-3">
          <span className="font-medium text-sm">{cluster.name}</span>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{cluster.keywords?.length ?? 0} фраз</span>
          {cluster.total_volume > 0 && (
            <span className="text-xs text-blue-600">~{cluster.total_volume.toLocaleString()} показов</span>
          )}
        </div>
        <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            {(cluster.keywords || []).map((kw: string, j: number) => (
              <span key={j} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">{kw}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Export Tab ───────────────────────────────────────────────────────────────

function ExportTab({ projectId }: { projectId: string }) {
  const { data: validation } = useQuery({
    queryKey: ['export-validate', projectId],
    queryFn: () => api.get(`/projects/${projectId}/export/validate`).then((r) => r.data),
  })
  return (
    <div className="p-6 max-w-xl">
      <h3 className="font-semibold mb-4">Экспорт</h3>
      {validation && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4 text-sm space-y-1.5">
          {[
            ['Кампаний', validation.campaigns_count],
            ['Групп', validation.groups_count],
            ['Объявлений', validation.ads_count],
            ['Ключевых фраз', validation.keywords_count],
            ['Минус-слов', validation.negative_keywords_count],
          ].map(([label, val]) => (
            <p key={label as string}><span className="text-gray-500">{label}:</span> <strong>{val}</strong></p>
          ))}
          {(validation.warnings || []).map((w: string, i: number) => (
            <p key={i} className="text-yellow-600 text-xs">⚠️ {w}</p>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Яндекс Директ</p>
      <div className="space-y-2 mb-5">
        <button onClick={() => window.open(`/api/projects/${projectId}/export/direct-xls`, '_blank')}
          className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm hover:bg-green-700 transition font-medium">
          📥 XLS для Директ Коммандера
        </button>
      </div>

      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Стратегия</p>
      <div className="space-y-2 mb-5">
        <button onClick={() => window.open(`/api/projects/${projectId}/export/strategy-html`, '_blank')}
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm hover:bg-blue-700 transition font-medium">
          🖨 Стратегия HTML (для печати / PDF)
        </button>
        <button onClick={() => window.open(`/api/projects/${projectId}/export/strategy-md`, '_blank')}
          className="w-full bg-gray-500 text-white py-2.5 rounded-lg text-sm hover:bg-gray-600 transition font-medium">
          📄 Стратегия Markdown
        </button>
      </div>

      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Копирайтеру</p>
      <div className="space-y-2">
        <button onClick={() => window.open(`/api/projects/${projectId}/export/copywriter-brief`, '_blank')}
          className="w-full bg-purple-600 text-white py-2.5 rounded-lg text-sm hover:bg-purple-700 transition font-medium">
          📝 ТЗ копирайтеру (DOCX)
        </button>
      </div>
    </div>
  )
}

// ─── MediaPlan Tab ────────────────────────────────────────────────────────────

function MediaPlanTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['mediaplan', projectId],
    queryFn: () => mediaplanApi.get(projectId),
  })
  const [rows, setRows] = useState<MediaPlanRow[] | null>(null)
  const [saved, setSaved] = useState(false)
  const [ctr, setCtr] = useState<number>(3)
  const [cr, setCr] = useState<number>(2)
  const [autoForecast, setAutoForecast] = useState(false)

  const saveMut = useMutation({
    mutationFn: () => mediaplanApi.update(projectId, rows!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mediaplan', projectId] }); setSaved(true); setTimeout(() => setSaved(false), 2000); setRows(null) },
  })
  const resetMut = useMutation({
    mutationFn: () => mediaplanApi.reset(projectId, new Date().getFullYear()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mediaplan', projectId] }); setRows(null) },
  })

  if (isLoading) return <div className="p-6 text-gray-500">Загрузка...</div>

  const display = rows ?? (data?.rows || [])
  const totalBudget = display.reduce((s, r) => s + (r.budget || 0), 0)
  const totalClicks = display.reduce((s, r) => s + (r.forecast_clicks || 0), 0)
  const totalLeads = display.reduce((s, r) => s + (r.forecast_leads || 0), 0)
  const totalCPA = totalLeads > 0 ? Math.round(totalBudget / totalLeads) : 0

  const recomputeForecasts = (updatedRows: MediaPlanRow[]) => {
    if (!autoForecast || !(data?.total_frequency > 0)) return updatedRows
    const newTotal = updatedRows.reduce((s, r) => s + (r.budget || 0), 0)
    if (newTotal === 0) return updatedRows
    return updatedRows.map((r) => {
      const clicks = Math.round(((r.budget || 0) / newTotal) * data.total_frequency * ctr / 100)
      return { ...r, forecast_clicks: clicks, forecast_leads: Math.round(clicks * cr / 100) }
    })
  }

  const updateRow = (i: number, field: keyof MediaPlanRow, value: number | null) => {
    const base = rows ?? data?.rows ?? []
    let updated = [...base].map((r, idx) => idx === i ? { ...r, [field]: value } : r)
    if (autoForecast && field === 'budget') updated = recomputeForecasts(updated as MediaPlanRow[])
    setRows(updated as MediaPlanRow[])
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Медиаплан</h3>
        <div className="flex gap-2 items-center">
          {saved && <span className="text-green-600 text-sm">✅ Сохранено</span>}
          {data?.total_frequency > 0 && (
            <span className="text-xs text-gray-500">Суммарная частота ключей: {data.total_frequency.toLocaleString()}</span>
          )}
          <button onClick={() => resetMut.mutate()} disabled={resetMut.isPending}
            className="border px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
            ↺ Сброс
          </button>
          {rows && (
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
              className="bg-primary-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
              {saveMut.isPending ? 'Сохранение...' : 'Сохранить'}
            </button>
          )}
        </div>
      </div>

      {/* Auto-forecast controls */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" className="rounded" checked={autoForecast}
              onChange={(e) => {
                setAutoForecast(e.target.checked)
                if (e.target.checked) {
                  const base = rows ?? data?.rows ?? []
                  setRows(recomputeForecasts([...base] as MediaPlanRow[]))
                }
              }} />
            <span className="text-sm font-medium text-blue-800">Авто-прогноз кликов и заявок</span>
          </label>
          {autoForecast && (
            <>
              <label className="flex items-center gap-1.5 text-sm text-blue-700">
                CTR%:
                <input type="number" min={0.1} max={100} step={0.1}
                  className="w-16 border border-blue-200 rounded px-2 py-0.5 text-sm bg-white"
                  value={ctr}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 1
                    setCtr(v)
                    const base = rows ?? data?.rows ?? []
                    const newTotal = base.reduce((s, r) => s + (r.budget || 0), 0)
                    if (newTotal > 0 && data?.total_frequency > 0) {
                      setRows(base.map((r) => {
                        const clicks = Math.round(((r.budget || 0) / newTotal) * data.total_frequency * v / 100)
                        return { ...r, forecast_clicks: clicks, forecast_leads: Math.round(clicks * cr / 100) }
                      }) as MediaPlanRow[])
                    }
                  }} />
              </label>
              <label className="flex items-center gap-1.5 text-sm text-blue-700">
                CR%:
                <input type="number" min={0.1} max={100} step={0.1}
                  className="w-16 border border-blue-200 rounded px-2 py-0.5 text-sm bg-white"
                  value={cr}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 1
                    setCr(v)
                    const base = rows ?? data?.rows ?? []
                    setRows(base.map((r) => ({
                      ...r,
                      forecast_leads: r.forecast_clicks ? Math.round(r.forecast_clicks * v / 100) : null,
                    })) as MediaPlanRow[])
                  }} />
              </label>
              <span className="text-xs text-blue-500">
                Прогноз пересчитывается при изменении бюджета по строке
              </span>
            </>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Бюджет всего', value: totalBudget.toLocaleString() + ' ₽', color: 'text-primary-600' },
          { label: 'Прогноз кликов', value: totalClicks > 0 ? totalClicks.toLocaleString() : '—', color: 'text-green-600' },
          { label: 'Прогноз заявок', value: totalLeads > 0 ? totalLeads.toLocaleString() : '—', color: 'text-blue-600' },
          { label: 'Средний CPA', value: totalCPA > 0 ? totalCPA.toLocaleString() + ' ₽' : '—', color: 'text-orange-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white border rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className={cx('text-lg font-bold', color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Месяц', '% бюджета', 'Бюджет (₽)', 'Прогноз кликов', 'Прогноз заявок', 'CPC (₽)', 'CPA (₽)'].map((h) => (
                <th key={h} className="text-left px-3 py-2 text-xs text-gray-500 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {display.map((row, i) => {
              const cpc = row.budget && row.forecast_clicks ? Math.round(row.budget / row.forecast_clicks) : null
              const cpa = row.budget && row.forecast_leads ? Math.round(row.budget / row.forecast_leads) : null
              return (
                <tr key={row.month} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-700">{row.month_name}</td>
                  <td className="px-3 py-2 text-gray-500 tabular-nums">{row.pct}%</td>
                  <td className="px-3 py-2">
                    <input type="number" className="w-24 border rounded px-2 py-0.5 text-sm tabular-nums"
                      value={row.budget || ''}
                      onChange={(e) => updateRow(i, 'budget', e.target.value ? Number(e.target.value) : null)} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" className="w-24 border rounded px-2 py-0.5 text-sm tabular-nums"
                      placeholder="—"
                      value={row.forecast_clicks || ''}
                      onChange={(e) => updateRow(i, 'forecast_clicks', e.target.value ? Number(e.target.value) : null)} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" className="w-20 border rounded px-2 py-0.5 text-sm tabular-nums"
                      placeholder="—"
                      value={row.forecast_leads || ''}
                      onChange={(e) => updateRow(i, 'forecast_leads', e.target.value ? Number(e.target.value) : null)} />
                  </td>
                  <td className="px-3 py-2 text-gray-500 tabular-nums">{cpc ? cpc.toLocaleString() : '—'}</td>
                  <td className="px-3 py-2 text-gray-500 tabular-nums">{cpa ? cpa.toLocaleString() : '—'}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t font-semibold">
            <tr>
              <td className="px-3 py-2 text-gray-700">Итого</td>
              <td className="px-3 py-2 text-gray-500">100%</td>
              <td className="px-3 py-2 tabular-nums">{totalBudget.toLocaleString()} ₽</td>
              <td className="px-3 py-2 tabular-nums text-green-600">{totalClicks > 0 ? totalClicks.toLocaleString() : '—'}</td>
              <td className="px-3 py-2 tabular-nums text-blue-600">{totalLeads > 0 ? totalLeads.toLocaleString() : '—'}</td>
              <td className="px-3 py-2 text-gray-400">—</td>
              <td className="px-3 py-2 tabular-nums text-orange-600">{totalCPA > 0 ? totalCPA.toLocaleString() + ' ₽' : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-2">Заполните «Бюджет» — % пересчитается автоматически. Включите авто-прогноз и задайте CTR% / CR% для автоматического расчёта кликов и заявок.</p>
    </div>
  )
}

// ─── OG Tab ───────────────────────────────────────────────────────────────────

function OgTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [issuesOnly, setIssuesOnly] = useState(false)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null)
  const [editForms, setEditForms] = useState<Record<string, { rec_og_title: string; rec_og_description: string }>>({})
  const [previewPlatform, setPreviewPlatform] = useState<'telegram' | 'vk' | 'whatsapp'>('telegram')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['og-audit', projectId, issuesOnly],
    queryFn: () => ogApi.getAudit(projectId, { issues_only: issuesOnly, limit: 100 }),
  })

  const { data: taskStatus } = useQuery({
    queryKey: ['seo-task', taskId],
    queryFn: () => seoApi.getTaskStatus(projectId, taskId!),
    enabled: !!taskId,
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.status
      return s === 'running' || s === 'pending' ? 2000 : false
    },
  })

  const genMut = useMutation({
    mutationFn: () => ogApi.generate(projectId),
    onSuccess: (d: any) => setTaskId(d.task_id),
  })
  const saveMut = useMutation({
    mutationFn: ({ url, form }: { url: string; form: { rec_og_title: string; rec_og_description: string } }) =>
      ogApi.updateMeta(projectId, url, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['og-audit', projectId] }); setExpandedUrl(null) },
  })

  const stats = data?.stats
  const isRunning = taskStatus?.status === 'running' || taskStatus?.status === 'pending'
  const isDone = taskStatus?.status === 'success'

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold">OpenGraph теги</h3>
        <button onClick={() => genMut.mutate()} disabled={genMut.isPending || isRunning}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
          {genMut.isPending || isRunning ? '⏳ Генерация...' : '✨ Сгенерировать OG теги'}
        </button>
      </div>

      {taskId && (
        <div className={cx('rounded-lg p-3 mb-4 text-sm', isDone ? 'bg-green-50 border border-green-200 text-green-700' : isRunning ? 'bg-blue-50 border border-blue-200 text-blue-700' : 'bg-red-50 text-red-700')}>
          {isRunning && `⏳ Генерация: ${taskStatus?.progress ?? 0}%`}
          {isDone && `✅ Готово: ${(taskStatus?.result as any)?.pages_generated ?? 0} страниц`}
          {isDone && <button onClick={() => refetch()} className="ml-3 underline">Обновить</button>}
        </div>
      )}

      {/* Stats */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Всего страниц', value: stats.total, color: 'text-gray-700' },
            { label: 'Есть og:title', value: stats.has_og_title, color: 'text-green-600' },
            { label: 'Есть og:description', value: stats.has_og_description, color: 'text-green-600' },
            { label: 'Полностью OK', value: stats.fully_ok, color: stats.fully_ok === stats.total ? 'text-green-600' : 'text-orange-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={cx('text-xl font-bold', color)}>{value}</p>
            </div>
          ))}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer mb-3">
        <input type="checkbox" className="rounded" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} />
        Только страницы с проблемами
      </label>

      {isLoading ? <div className="text-gray-500">Загрузка...</div> :
        data?.crawl_status === 'not_done' ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📭</p>
            <p className="font-medium">Нет данных парсинга</p>
            <p className="text-sm mt-1">Запустите парсинг на вкладке «Парсинг»</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(data?.pages ?? []).map((page: OgPage) => {
              const isExpanded = expandedUrl === page.page_url
              const form = editForms[page.page_url] || { rec_og_title: page.rec_og_title || '', rec_og_description: page.rec_og_description || '' }
              return (
                <div key={page.page_url} className={cx('border rounded-lg bg-white overflow-hidden',
                  page.has_rec ? 'border-green-200' : (page.missing_title || page.missing_description) ? 'border-red-200' : '')}>
                  <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 text-sm"
                    onClick={() => setExpandedUrl(isExpanded ? null : page.page_url)}>
                    <span className="text-gray-400 text-xs w-3">{isExpanded ? '▼' : '▶'}</span>
                    <span className="flex-1 font-mono text-xs truncate" title={page.page_url}>{page.page_url}</span>
                    <div className="flex gap-1 shrink-0">
                      {page.missing_title && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded">title</span>}
                      {page.missing_description && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded">desc</span>}
                      {page.missing_image && <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded">image</span>}
                      {page.has_rec && <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">✓</span>}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t p-3 bg-gray-50 space-y-3">
                      {/* Current OG */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-gray-500 font-medium mb-1">og:title</p>
                          <p className={cx(page.missing_title ? 'text-red-500 italic' : 'text-gray-700')}>{page.og_title || 'нет'}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 font-medium mb-1">og:description</p>
                          <p className={cx(page.missing_description ? 'text-red-500 italic' : 'text-gray-700')}>{page.og_description || 'нет'}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 font-medium mb-1">og:image</p>
                          <p className={cx(page.missing_image ? 'text-red-500 italic' : 'text-gray-700 truncate')}>{page.og_image || 'нет'}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 font-medium mb-1">og:type</p>
                          <p className="text-gray-700">{page.og_type || 'нет'}</p>
                        </div>
                      </div>

                      {/* OG Preview with platform switcher */}
                      {(page.og_title || form.rec_og_title) && (
                        <div>
                          <div className="flex gap-1 mb-2">
                            {(['telegram', 'vk', 'whatsapp'] as const).map((p) => (
                              <button key={p} onClick={() => setPreviewPlatform(p)}
                                className={cx('text-xs px-2.5 py-1 rounded-full border font-medium transition',
                                  previewPlatform === p ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 hover:bg-gray-50')}>
                                {p === 'telegram' ? '✈️ Telegram' : p === 'vk' ? '💙 VK' : '📱 WhatsApp'}
                              </button>
                            ))}
                          </div>

                          {/* Telegram */}
                          {previewPlatform === 'telegram' && (
                            <div className="border-l-4 border-blue-400 bg-[#eef3fb] rounded-r-lg overflow-hidden max-w-sm">
                              {page.og_image && <img src={page.og_image} alt="" className="w-full h-32 object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                              <div className="p-2">
                                <p className="text-xs text-blue-500 font-medium">{new URL(page.page_url).hostname}</p>
                                <p className="text-sm font-semibold text-gray-900 line-clamp-2">{form.rec_og_title || page.og_title}</p>
                                <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">{form.rec_og_description || page.og_description}</p>
                              </div>
                            </div>
                          )}

                          {/* VK */}
                          {previewPlatform === 'vk' && (
                            <div className="border rounded-lg overflow-hidden bg-white max-w-sm shadow-sm">
                              {page.og_image && <img src={page.og_image} alt="" className="w-full h-36 object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                              <div className="p-3 border-t">
                                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{new URL(page.page_url).hostname}</p>
                                <p className="text-sm font-bold text-gray-900 line-clamp-2">{form.rec_og_title || page.og_title}</p>
                                <p className="text-xs text-gray-500 line-clamp-3 mt-1">{form.rec_og_description || page.og_description}</p>
                              </div>
                            </div>
                          )}

                          {/* WhatsApp */}
                          {previewPlatform === 'whatsapp' && (
                            <div className="bg-[#dcf8c6] rounded-lg overflow-hidden max-w-sm p-0.5">
                              <div className="bg-white rounded-md overflow-hidden">
                                {page.og_image && <img src={page.og_image} alt="" className="w-full h-32 object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                                <div className="p-2 border-l-4 border-green-500">
                                  <p className="text-xs text-green-600 font-medium">{new URL(page.page_url).hostname}</p>
                                  <p className="text-sm font-semibold text-gray-900 line-clamp-2">{form.rec_og_title || page.og_title}</p>
                                  <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{form.rec_og_description || page.og_description}</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Edit recommended */}
                      <div className="space-y-2 pt-1">
                        <div>
                          <div className="flex justify-between mb-0.5">
                            <label className="text-xs text-gray-600">Рек. og:title</label>
                            <CharBadge len={form.rec_og_title.length} max={90} />
                          </div>
                          <input className="w-full border rounded px-2 py-1 text-sm bg-white"
                            placeholder="OG заголовок для соцсетей (60–90 симв.)"
                            value={form.rec_og_title}
                            onChange={(e) => setEditForms((f) => ({ ...f, [page.page_url]: { ...form, rec_og_title: e.target.value } }))} />
                        </div>
                        <div>
                          <div className="flex justify-between mb-0.5">
                            <label className="text-xs text-gray-600">Рек. og:description</label>
                            <CharBadge len={form.rec_og_description.length} max={200} />
                          </div>
                          <textarea rows={2} className="w-full border rounded px-2 py-1 text-sm bg-white"
                            placeholder="OG описание (150–200 симв.)"
                            value={form.rec_og_description}
                            onChange={(e) => setEditForms((f) => ({ ...f, [page.page_url]: { ...form, rec_og_description: e.target.value } }))} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => saveMut.mutate({ url: page.page_url, form })}
                          disabled={saveMut.isPending}
                          className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                          Сохранить
                        </button>
                        <button onClick={() => setExpandedUrl(null)} className="border px-3 py-1.5 rounded-lg text-sm hover:bg-white">Закрыть</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {(data?.pages ?? []).length === 0 && (
              <div className="text-center py-10 text-gray-400">Нет страниц с OG проблемами 🎉</div>
            )}
          </div>
        )
      }
    </div>
  )
}

// ─── History Tab ──────────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  project_created: '🆕 Проект создан',
  project_updated: '✏️ Проект обновлён',
  brief_updated: '📝 Бриф обновлён',
  crawl_started: '🕷️ Парсинг запущен',
  crawl_completed: '✅ Парсинг завершён',
  strategy_generated: '🤖 Стратегия сгенерирована',
  strategy_updated: '✏️ Стратегия обновлена',
  campaign_created: '📁 Кампания создана',
  campaign_updated: '✏️ Кампания обновлена',
  campaign_deleted: '🗑 Кампания удалена',
  group_created: '📂 Группа создана',
  keywords_generated: '🔑 Ключи сгенерированы',
  ads_generated: '📣 Объявления сгенерированы',
  negative_kw_generated: '❌ Минус-слова сгенерированы',
  seo_meta_generated: '🔍 Мета-теги сгенерированы',
  export_downloaded: '📥 Экспорт скачан',
  mediaplan_updated: '📊 Медиаплан обновлён',
}

function HistoryTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['history', projectId],
    queryFn: () => api.get(`/projects/${projectId}/history`).then((r) => r.data),
    refetchInterval: 30000,
  })

  if (isLoading) return <div className="p-6 text-gray-500">Загрузка...</div>

  const events: any[] = data?.events ?? []

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">История действий</h3>
        <span className="text-sm text-gray-500">{data?.total ?? 0} событий</span>
      </div>
      {events.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p>История пока пуста. Действия появятся здесь по мере работы с проектом.</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />
          <div className="space-y-1">
            {events.map((e: any, i: number) => (
              <div key={e.id} className="flex gap-4 relative pl-10">
                <div className="absolute left-2.5 top-2 w-3 h-3 rounded-full bg-white border-2 border-primary-400" />
                <div className="flex-1 bg-white border rounded-lg px-3 py-2 text-sm hover:border-gray-300 transition">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{EVENT_LABELS[e.event_type] || e.event_type}</span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {new Date(e.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-gray-500 text-xs mt-0.5">{e.description}</p>
                  {e.user_login && <p className="text-xs text-gray-400 mt-0.5">👤 {e.user_login}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────

function AnalyticsTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]
  })
  const [dateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [selectedCounter, setSelectedCounter] = useState<number | null>(null)
  const [tvProjectId, setTvProjectId] = useState<number | null>(null)
  const [tvProjects, setTvProjects] = useState<any[] | null>(null)
  const [positions, setPositions] = useState<any[] | null>(null)
  const [posRegion, setPosRegion] = useState(0)

  const tvLinkQuery = useQuery({
    queryKey: ['topvisor-link', projectId],
    queryFn: () => api.get(`/projects/${projectId}/topvisor/link`).then((r) => r.data),
    onSuccess: (d: any) => { if (d?.topvisor_project_id) setTvProjectId(d.topvisor_project_id) },
  } as any)

  const tvProjectsMut = useMutation({
    mutationFn: () => api.get(`/projects/${projectId}/topvisor/projects`).then((r) => r.data),
    onSuccess: (d: any) => setTvProjects(d.projects || []),
  })

  const tvLinkMut = useMutation({
    mutationFn: (id: number | null) => api.post(`/projects/${projectId}/topvisor/link`, { topvisor_project_id: id }).then((r) => r.data),
    onSuccess: (d: any) => { setTvProjectId(d.topvisor_project_id); qc.invalidateQueries({ queryKey: ['topvisor-link', projectId] }) },
  })

  const tvPositionsMut = useMutation({
    mutationFn: () => api.get(`/projects/${projectId}/topvisor/positions`, {
      params: { date_from: dateFrom, date_to: dateTo, region_index: posRegion },
    }).then((r) => r.data),
    onSuccess: (d: any) => setPositions(d.keywords || []),
  })

  const { data: counterData } = useQuery({
    queryKey: ['analytics-counter', projectId],
    queryFn: () => analyticsApi.getCounter(projectId),
    onSuccess: (d: any) => { if (d?.counter_id && !selectedCounter) setSelectedCounter(d.counter_id) },
  } as any)

  const { data: countersData } = useQuery({
    queryKey: ['analytics-counters', projectId],
    queryFn: () => analyticsApi.getCounters(projectId),
  })

  const activeCounter = selectedCounter ?? counterData?.counter_id

  const { data: dashData, isLoading: dashLoading, error: dashError } = useQuery({
    queryKey: ['analytics-summary', projectId, activeCounter, dateFrom],
    queryFn: () => analyticsApi.getSummary(projectId, { date_from: dateFrom, date_to: dateTo }),
    enabled: !!activeCounter,
    retry: false,
  })

  const setCounterMut = useMutation({
    mutationFn: (id: number) => analyticsApi.setCounter(projectId, id),
    onSuccess: (_, id) => { setSelectedCounter(id); qc.invalidateQueries({ queryKey: ['analytics-counter', projectId] }) },
  })

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60), s = seconds % 60
    return m > 0 ? `${m}м ${s}с` : `${s}с`
  }

  const noCounter = !activeCounter
  const hasError = !!dashError

  return (
    <div className="p-6 max-w-4xl">
      {/* Counter selector */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Счётчик Метрики:</label>
          {countersData?.counters?.length ? (
            <select className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={activeCounter || ''}
              onChange={(e) => { const id = Number(e.target.value); setCounterMut.mutate(id) }}>
              <option value="">Выберите счётчик</option>
              {countersData.counters.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name || c.site} (#{c.id})</option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-gray-400">
              {countersData ? 'Нет доступных счётчиков' : 'Загрузка...'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-gray-500">От:</label>
          <input type="date" className="border rounded px-2 py-1 text-sm" value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)} />
          <label className="text-xs text-gray-500">до: {dateTo}</label>
        </div>
      </div>

      {noCounter && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📊</p>
          <p className="font-medium mb-1">Выберите счётчик Метрики</p>
          <p className="text-sm">Убедитесь, что OAuth токен Метрики настроен в Настройках → API ключи</p>
        </div>
      )}

      {hasError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          ❌ Ошибка загрузки данных. Проверьте OAuth токен Метрики в настройках.
        </div>
      )}

      {dashLoading && <div className="text-gray-500 py-4">Загрузка данных...</div>}

      {dashData && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Визиты', value: dashData.summary.visits.toLocaleString(), icon: '👁' },
              { label: 'Пользователи', value: dashData.summary.users.toLocaleString(), icon: '👤' },
              { label: 'Отказы', value: dashData.summary.bounce_rate + '%', icon: '↩️' },
              { label: 'Время на сайте', value: formatDuration(dashData.summary.avg_duration), icon: '⏱' },
            ].map(({ label, value, icon }) => (
              <div key={label} className="bg-white border rounded-lg p-4">
                <p className="text-2xl mb-1">{icon}</p>
                <p className="text-xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Traffic sources */}
          {dashData.sources.length > 0 && (
            <div className="bg-white border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-3">Источники трафика</h4>
              <div className="space-y-2">
                {dashData.sources.map((s: TrafficSource) => {
                  const maxVisits = Math.max(...dashData.sources.map((x: TrafficSource) => x.visits))
                  const pct = maxVisits > 0 ? Math.round((s.visits / maxVisits) * 100) : 0
                  return (
                    <div key={s.source} className="flex items-center gap-3 text-sm">
                      <span className="w-32 text-gray-600 text-xs truncate">{s.source}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className="bg-primary-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-16 text-right tabular-nums text-gray-700 font-medium">{s.visits.toLocaleString()}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Daily chart (simple bars) */}
          {dashData.daily.length > 0 && (
            <div className="bg-white border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-3">Визиты по дням</h4>
              <div className="flex items-end gap-1 h-32">
                {dashData.daily.map((d: DailyVisit) => {
                  const maxV = Math.max(...dashData.daily.map((x: DailyVisit) => x.visits))
                  const h = maxV > 0 ? Math.max(4, Math.round((d.visits / maxV) * 100)) : 4
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">
                        {d.date}: {d.visits}
                      </div>
                      <div className="w-full bg-primary-500 rounded-t hover:bg-primary-600 transition cursor-default"
                        style={{ height: `${h}%` }} />
                    </div>
                  )
                })}
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>{dashData.daily[0]?.date}</span>
                <span>{dashData.daily[dashData.daily.length - 1]?.date}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Topvisor Positions ─────────────────────────────────────────────── */}
      <div className="mt-8 border-t pt-6">
        <h4 className="font-semibold text-sm text-gray-700 uppercase tracking-wide mb-4">📈 Позиции Topvisor</h4>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Проект:</span>
            {tvProjectId ? (
              <span className="text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5">
                #{tvProjectId}
              </span>
            ) : (
              <span className="text-sm text-gray-400">не привязан</span>
            )}
            <button onClick={() => tvProjectsMut.mutate()} disabled={tvProjectsMut.isPending}
              className="text-xs text-primary-600 hover:underline">
              {tvProjectsMut.isPending ? '...' : 'выбрать'}
            </button>
            {tvProjectId && (
              <button onClick={() => tvLinkMut.mutate(null)}
                className="text-xs text-red-500 hover:underline">отвязать</button>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs text-gray-500">Регион:</label>
            <input type="number" min={0} value={posRegion}
              onChange={(e) => setPosRegion(Number(e.target.value))}
              className="border rounded px-2 py-1 text-sm w-16" />
            <button onClick={() => tvPositionsMut.mutate()} disabled={tvPositionsMut.isPending || !tvProjectId}
              className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-primary-700 disabled:opacity-50">
              {tvPositionsMut.isPending ? '⏳ Загрузка...' : 'Загрузить позиции'}
            </button>
          </div>
        </div>

        {tvProjects && (
          <div className="bg-white border rounded-lg p-3 mb-4">
            <p className="text-xs text-gray-500 mb-2">Выберите проект Topvisor:</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {tvProjects.length === 0 && <p className="text-sm text-gray-400">Нет проектов</p>}
              {tvProjects.map((p: any) => (
                <button key={p.id} onClick={() => { tvLinkMut.mutate(p.id); setTvProjects(null) }}
                  className={cx('w-full text-left text-sm px-3 py-1.5 rounded hover:bg-primary-50 transition',
                    tvProjectId === p.id ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700')}>
                  {p.name || p.site} <span className="text-xs text-gray-400">#{p.id}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {tvPositionsMut.isError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-3">
            ❌ {(tvPositionsMut.error as any)?.response?.data?.detail || 'Ошибка загрузки позиций'}
          </div>
        )}

        {!tvProjectId && !tvProjectsMut.isPending && (
          <div className="text-center py-10 text-gray-400 bg-gray-50 rounded-lg">
            <p className="text-3xl mb-2">📈</p>
            <p className="text-sm font-medium">Привяжите Topvisor-проект</p>
            <p className="text-xs mt-1">Нажмите «выбрать» выше. API ключ настраивается в Настройках → API ключи</p>
          </div>
        )}

        {positions && (
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Ключевая фраза</th>
                  <th className="px-4 py-2 text-center font-medium text-gray-600 w-24">Позиция</th>
                  <th className="px-4 py-2 text-center font-medium text-gray-600 w-24">Динамика</th>
                  <th className="px-4 py-2 text-center font-medium text-gray-600 w-24">Частота</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {positions.map((kw: any, i: number) => {
                  const pos = kw.position ?? kw.pos
                  const diff = kw.diff ?? kw.dynamics
                  const vol = kw.volume ?? kw.frequency
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-800">{kw.phrase || kw.name}</td>
                      <td className="px-4 py-2 text-center">
                        {pos != null ? (
                          <span className={cx('font-mono font-medium',
                            pos <= 3 ? 'text-green-600' : pos <= 10 ? 'text-yellow-600' : 'text-gray-500')}>
                            {pos}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {diff != null && diff !== 0 ? (
                          <span className={cx('text-xs font-medium', diff > 0 ? 'text-green-600' : 'text-red-500')}>
                            {diff > 0 ? '▲' : '▼'} {Math.abs(diff)}
                          </span>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2 text-center text-gray-500 text-xs">{vol?.toLocaleString() ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {positions.length === 0 && (
              <div className="text-center py-8 text-gray-400">Нет данных за выбранный период</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Topvisor / Competitor Tab ────────────────────────────────────────────────

function TopvisorTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [linking, setLinking] = useState(false)
  const [selectedTvId, setSelectedTvId] = useState<number | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [snapshotDate, setSnapshotDate] = useState('')
  const [showSnapshots, setShowSnapshots] = useState(false)

  const { data: linkData } = useQuery({
    queryKey: ['topvisor-link', projectId],
    queryFn: () => api.get(`/projects/${projectId}/topvisor/link`).then((r) => r.data),
  })

  const { data: tvProjects, isLoading: tvLoading, refetch: fetchTvProjects } = useQuery({
    queryKey: ['topvisor-projects', projectId],
    queryFn: () => api.get(`/projects/${projectId}/topvisor/projects`).then((r) => r.data),
    enabled: false,
  })

  const { data: positions, isLoading: posLoading, refetch: fetchPositions, isError: posError } = useQuery({
    queryKey: ['topvisor-positions', projectId, dateFrom, dateTo],
    queryFn: () =>
      api.get(`/projects/${projectId}/topvisor/positions`, { params: { date_from: dateFrom, date_to: dateTo } }).then((r) => r.data),
    enabled: false,
  })

  const { data: snapshots, isLoading: snapLoading, refetch: fetchSnapshots, isError: snapError } = useQuery({
    queryKey: ['topvisor-snapshots', projectId, snapshotDate],
    queryFn: () =>
      api.get(`/projects/${projectId}/topvisor/snapshots`, { params: { date: snapshotDate } }).then((r) => r.data),
    enabled: false,
  })

  const linkMutation = useMutation({
    mutationFn: (tvId: number | null) => api.post(`/projects/${projectId}/topvisor/link`, { topvisor_project_id: tvId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['topvisor-link', projectId] })
      setLinking(false)
    },
  })

  const linked = linkData?.topvisor_project_id
  const kws: any[] = positions?.keywords || []
  const snapKws: any[] = snapshots?.keywords || []

  return (
    <div className="p-6 max-w-4xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Конкурентный анализ / Позиции (Topvisor)</h2>

      {/* Link project */}
      <div className="bg-white rounded-xl border p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Привязанный Topvisor-проект</p>
            <p className="text-sm text-gray-500 mt-0.5">{linked ? `ID: ${linked}` : 'Не привязан'}</p>
          </div>
          <button
            onClick={() => { setLinking(true); fetchTvProjects() }}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {linked ? 'Изменить' : 'Привязать'}
          </button>
        </div>

        {linking && (
          <div className="mt-3">
            {tvLoading ? (
              <p className="text-sm text-gray-400">Загрузка проектов из Topvisor...</p>
            ) : tvProjects?.projects?.length ? (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {tvProjects.projects.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedTvId(p.id)}
                    className={cx(
                      'w-full text-left px-3 py-2 rounded-lg text-sm border transition',
                      selectedTvId === p.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    {p.name || p.site || `Project #${p.id}`}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-red-500">Нет доступных проектов. Проверьте Topvisor API key в Настройках.</p>
            )}
            {selectedTvId && (
              <button
                onClick={() => linkMutation.mutate(selectedTvId)}
                className="mt-2 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Сохранить привязку
              </button>
            )}
          </div>
        )}
      </div>

      {/* Positions */}
      {linked && (
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Дата от</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="border rounded px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Дата до</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="border rounded px-2 py-1 text-sm" />
            </div>
            <div className="pt-5">
              <button
                onClick={() => fetchPositions()}
                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                Получить позиции
              </button>
            </div>
          </div>

          {posLoading && <p className="text-sm text-gray-400">Загрузка позиций...</p>}
          {posError && <p className="text-sm text-red-500">Ошибка. Проверьте привязку и API ключ.</p>}
          {kws.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2 text-left text-gray-600 font-medium">Ключевое слово</th>
                    <th className="px-3 py-2 text-center text-gray-600 font-medium w-20">Позиция</th>
                    <th className="px-3 py-2 text-center text-gray-600 font-medium w-20">Динамика</th>
                  </tr>
                </thead>
                <tbody>
                  {kws.map((kw: any, i: number) => {
                    const pos = kw.position ?? kw.pos ?? '—'
                    const diff = kw.diff ?? kw.change ?? null
                    return (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">{kw.name || kw.keyword || '—'}</td>
                        <td className="px-3 py-2 text-center font-mono tabular-nums">
                          {pos === 0 || pos === null ? '100+' : pos}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {diff != null && diff !== 0 ? (
                            <span className={cx('font-mono text-xs', diff > 0 ? 'text-green-600' : 'text-red-500')}>
                              {diff > 0 ? `+${diff}` : diff}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Snapshots: competitor analysis */}
      {linked && (
        <div className="bg-white rounded-xl border p-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">📸 Снимки выдачи (конкуренты)</h3>
              <p className="text-xs text-gray-500 mt-0.5">Какие сайты видны по вашим ключам в поиске</p>
            </div>
            <button
              onClick={() => setShowSnapshots((v) => !v)}
              className="text-xs text-primary-600 hover:underline"
            >
              {showSnapshots ? 'Скрыть' : 'Показать'}
            </button>
          </div>
          {showSnapshots && (
            <>
              <div className="flex items-center gap-3 mb-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Дата снимка</label>
                  <input type="date" value={snapshotDate} onChange={(e) => setSnapshotDate(e.target.value)}
                    className="border rounded px-2 py-1 text-sm" />
                </div>
                <div className="pt-5">
                  <button
                    onClick={() => fetchSnapshots()}
                    className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    Загрузить снимки
                  </button>
                </div>
              </div>
              {snapLoading && <p className="text-sm text-gray-400">Загрузка...</p>}
              {snapError && <p className="text-sm text-red-500">Ошибка загрузки снимков</p>}
              {snapKws.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-left text-gray-600 font-medium">Ключевое слово</th>
                        <th className="px-3 py-2 text-center text-gray-600 font-medium w-16">Поз.</th>
                        <th className="px-3 py-2 text-left text-gray-600 font-medium">URL конкурента</th>
                        <th className="px-3 py-2 text-left text-gray-600 font-medium w-48">Заголовок</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapKws.map((kw: any, i: number) => (
                        <tr key={i} className="border-t hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-800">{kw.name || kw.keyword || '—'}</td>
                          <td className="px-3 py-2 text-center font-mono">
                            <span className={cx('font-medium', kw.position <= 3 ? 'text-green-600' : kw.position <= 10 ? 'text-yellow-600' : 'text-gray-500')}>
                              {kw.position ?? '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {kw.url ? (
                              <a href={kw.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs truncate block max-w-xs">
                                {kw.url}
                              </a>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600 truncate max-w-xs">{kw.snippet_title || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!snapLoading && snapKws.length === 0 && snapshots && (
                <p className="text-sm text-gray-400">Нет данных для выбранной даты</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Content Plan Tab ─────────────────────────────────────────────────────────

const ARTICLE_STATUSES = [
  { value: 'idea', label: 'Идея', color: 'bg-gray-100 text-gray-600' },
  { value: 'in_progress', label: 'В работе', color: 'bg-blue-100 text-blue-700' },
  { value: 'review', label: 'Ревью', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'published', label: 'Опубликовано', color: 'bg-green-100 text-green-700' },
  { value: 'archived', label: 'Архив', color: 'bg-gray-100 text-gray-400' },
]
const INTENTS = [
  { value: 'informational', label: 'Информационный' },
  { value: 'commercial', label: 'Коммерческий' },
  { value: 'transactional', label: 'Транзакционный' },
  { value: 'navigational', label: 'Навигационный' },
]

interface Article {
  id: string
  title: string
  target_keyword: string | null
  cluster: string | null
  intent: string | null
  status: string
  priority: number
  due_date: string | null
  assigned_to: string | null
  notes: string | null
  url: string | null
  word_count_target: number | null
}

type ArticleForm = Omit<Article, 'id'>

const emptyArticle: ArticleForm = {
  title: '',
  target_keyword: null,
  cluster: null,
  intent: null,
  status: 'idea',
  priority: 0,
  due_date: null,
  assigned_to: null,
  notes: null,
  url: null,
  word_count_target: null,
}

function ContentPlanTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<ArticleForm>(emptyArticle)
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['content-plan', projectId],
    queryFn: () => api.get(`/projects/${projectId}/content-plan`).then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (body: ArticleForm) => api.post(`/projects/${projectId}/content-plan`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['content-plan', projectId] }); setShowForm(false); setForm(emptyArticle) },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: ArticleForm & { id: string }) =>
      api.patch(`/projects/${projectId}/content-plan/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['content-plan', projectId] }); setEditId(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${projectId}/content-plan/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-plan', projectId] }),
  })

  const articles: Article[] = data?.articles || []
  const filtered = filterStatus === 'all' ? articles : articles.filter((a) => a.status === filterStatus)

  const f = (key: keyof ArticleForm, val: any) => setForm((p) => ({ ...p, [key]: val || null }))

  const ArticleFormFields = () => (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Заголовок статьи *</label>
        <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Как выбрать..." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Ключевое слово</label>
          <input value={form.target_keyword || ''} onChange={(e) => f('target_keyword', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Кластер</label>
          <input value={form.cluster || ''} onChange={(e) => f('cluster', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Статус</label>
          <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm">
            {ARTICLE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Интент</label>
          <select value={form.intent || ''} onChange={(e) => f('intent', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">—</option>
            {INTENTS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Приоритет</label>
          <input type="number" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: Number(e.target.value) }))}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Дедлайн</label>
          <input type="date" value={form.due_date || ''} onChange={(e) => f('due_date', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Исполнитель</label>
          <input value={form.assigned_to || ''} onChange={(e) => f('assigned_to', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">URL (после публикации)</label>
          <input value={form.url || ''} onChange={(e) => f('url', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Объём (слов)</label>
          <input type="number" value={form.word_count_target || ''} onChange={(e) => f('word_count_target', Number(e.target.value))}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Заметки</label>
        <textarea value={form.notes || ''} onChange={(e) => f('notes', e.target.value)}
          rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" />
      </div>
    </div>
  )

  const statusBadge = (s: string) => {
    const st = ARTICLE_STATUSES.find((x) => x.value === s)
    return <span className={cx('px-2 py-0.5 rounded-full text-xs font-medium', st?.color || 'bg-gray-100 text-gray-600')}>{st?.label || s}</span>
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Контент-план блога</h2>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm(emptyArticle) }}
          className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700">
          + Добавить статью
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {['all', ...ARTICLE_STATUSES.map((s) => s.value)].map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={cx('px-3 py-1 text-xs rounded-full border transition',
              filterStatus === s ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-300 text-gray-600 hover:border-gray-400')}>
            {s === 'all' ? 'Все' : ARTICLE_STATUSES.find((x) => x.value === s)?.label || s}
          </button>
        ))}
      </div>

      {/* Create/Edit modal */}
      {(showForm || editId) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold mb-4">{editId ? 'Редактировать статью' : 'Новая статья'}</h3>
            <ArticleFormFields />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => editId ? updateMutation.mutate({ id: editId, ...form }) : createMutation.mutate(form)}
                disabled={!form.title || createMutation.isPending || updateMutation.isPending}
                className="flex-1 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {createMutation.isPending || updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button onClick={() => { setShowForm(false); setEditId(null) }}
                className="flex-1 py-2 border text-sm rounded-lg hover:bg-gray-50">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-gray-400 text-sm">Загрузка...</p>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left font-medium text-gray-600">Статья</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-28">Статус</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-32">Ключевое слово</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-24">Дедлайн</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-28">Исполнитель</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 w-20">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{a.title}</p>
                    {a.cluster && <p className="text-xs text-gray-400">{a.cluster}</p>}
                  </td>
                  <td className="px-4 py-3">{statusBadge(a.status)}</td>
                  <td className="px-4 py-3 text-gray-600">{a.target_keyword || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{a.due_date || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{a.assigned_to || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { setEditId(a.id); setForm({ ...a }); setShowForm(false) }}
                      className="text-primary-600 hover:text-primary-800 text-xs mr-2">Изм.</button>
                    <button onClick={() => deleteMutation.mutate(a.id)}
                      className="text-red-500 hover:text-red-700 text-xs">Удал.</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Нет статей</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Reports Tab ───────────────────────────────────────────────────────────────

function ReportsTab({ projectId }: { projectId: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  return (
    <div className="p-6 max-w-3xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Автоотчёты для клиентов</h2>
      <p className="text-sm text-gray-500 mb-6">
        Готовые отчёты на основе данных проекта: Директ, SEO аудит, медиаплан.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* HTML Report */}
        <div className="bg-white border rounded-xl p-5">
          <div className="text-2xl mb-2">📊</div>
          <h3 className="font-semibold text-gray-900 mb-1">Сводный отчёт (HTML)</h3>
          <p className="text-sm text-gray-500 mb-4">
            Брендированный HTML-отчёт с ключевыми метриками. Отправьте клиенту напрямую.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPreviewUrl(`/api/projects/${projectId}/report/preview`)}
              className="flex-1 py-2 text-sm border rounded-lg hover:bg-gray-50 transition"
            >
              Просмотр
            </button>
            <a
              href={`/api/projects/${projectId}/report/html`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-center"
            >
              Скачать
            </a>
          </div>
        </div>

        {/* Strategy MD */}
        <div className="bg-white border rounded-xl p-5">
          <div className="text-2xl mb-2">📝</div>
          <h3 className="font-semibold text-gray-900 mb-1">SEO-стратегия (Markdown)</h3>
          <p className="text-sm text-gray-500 mb-4">
            Полная стратегия продвижения в текстовом формате для команды.
          </p>
          <a
            href={`/api/projects/${projectId}/export/strategy-md`}
            target="_blank"
            rel="noreferrer"
            className="block py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition text-center"
          >
            Скачать .md
          </a>
        </div>

        {/* Strategy HTML */}
        <div className="bg-white border rounded-xl p-5">
          <div className="text-2xl mb-2">🌐</div>
          <h3 className="font-semibold text-gray-900 mb-1">Стратегия (HTML)</h3>
          <p className="text-sm text-gray-500 mb-4">
            Красиво оформленная стратегия в HTML. Открывается в браузере.
          </p>
          <a
            href={`/api/projects/${projectId}/export/strategy-html`}
            target="_blank"
            rel="noreferrer"
            className="block py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition text-center"
          >
            Скачать .html
          </a>
        </div>

        {/* Copywriter brief */}
        <div className="bg-white border rounded-xl p-5">
          <div className="text-2xl mb-2">✍️</div>
          <h3 className="font-semibold text-gray-900 mb-1">Бриф для копирайтера (DOCX)</h3>
          <p className="text-sm text-gray-500 mb-4">
            Готовый бриф для внешнего копирайтера с описанием проекта и требований.
          </p>
          <a
            href={`/api/projects/${projectId}/export/copywriter-brief`}
            target="_blank"
            rel="noreferrer"
            className="block py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition text-center"
          >
            Скачать .docx
          </a>
        </div>
      </div>

      {/* Preview iframe */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-medium text-sm">Предпросмотр отчёта</span>
              <button onClick={() => setPreviewUrl(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <iframe src={previewUrl} className="flex-1 rounded-b-xl" title="Report preview" />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

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
        {tab === 'overview' && (
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
        )}
        {tab === 'brief' && <BriefTab projectId={id!} />}
        {tab === 'crawl' && <CrawlTab projectId={id!} />}
        {tab === 'direct' && <DirectTab projectId={id!} />}
        {tab === 'seo' && <SeoTab projectId={id!} />}
        {tab === 'og' && <OgTab projectId={id!} />}
        {tab === 'mediaplan' && <MediaPlanTab projectId={id!} />}
        {tab === 'analytics' && <AnalyticsTab projectId={id!} />}
        {tab === 'topvisor' && <TopvisorTab projectId={id!} />}
        {tab === 'content-plan' && <ContentPlanTab projectId={id!} />}
        {tab === 'reports' && <ReportsTab projectId={id!} />}
        {tab === 'history' && <HistoryTab projectId={id!} />}
        {tab === 'export' && <ExportTab projectId={id!} />}
      </div>
    </div>
  )
}
