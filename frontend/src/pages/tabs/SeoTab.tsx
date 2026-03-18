import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { seoApi, type SeoPage, type ChecklistItem } from '../../api/seo'
import { api } from '../../api/client'

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

function SchemaSection({ projectId, pageUrl }: { projectId: string; pageUrl: string }) {
  const [schemaType, setSchemaType] = useState('Organization')
  const [copied, setCopied] = useState(false)

  const { data: existing } = useQuery({
    queryKey: ['schema', projectId, pageUrl],
    queryFn: () => seoApi.getSchema(projectId, pageUrl),
    retry: false,
  })

  const genMut = useMutation({
    mutationFn: () => seoApi.generateSchema(projectId, pageUrl, schemaType),
    onSuccess: () => {
      // refetch via query invalidation
    },
  })

  const schemaJson = genMut.data?.json_ld || existing?.json_ld || ''
  const copy = () => { navigator.clipboard.writeText(schemaJson); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  const SCHEMA_TYPES = ['Organization', 'LocalBusiness', 'Product', 'Article', 'FAQPage']

  return (
    <div className="border-t pt-3 mt-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Schema.org</p>
      <div className="flex gap-2 items-center mb-2">
        <select value={schemaType} onChange={e => setSchemaType(e.target.value)}
          className="border rounded px-2 py-1 text-sm flex-1 max-w-xs">
          {SCHEMA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={() => genMut.mutate()} disabled={genMut.isPending}
          className="bg-primary-600 text-white px-3 py-1 rounded text-xs hover:bg-primary-700 disabled:opacity-50">
          {genMut.isPending ? '⏳...' : 'Сгенерировать'}
        </button>
      </div>
      {schemaJson && (
        <div className="relative">
          <pre className="bg-gray-900 text-green-300 text-xs rounded-lg p-3 overflow-auto max-h-48 font-mono">{schemaJson}</pre>
          <button onClick={copy}
            className={cx('absolute top-2 right-2 text-xs px-2 py-1 rounded transition',
              copied ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600')}>
            {copied ? '✅' : '📋'}
          </button>
        </div>
      )}
    </div>
  )
}

function FaqSection({ projectId, pageUrl }: { projectId: string; pageUrl: string }) {
  const [count, setCount] = useState(8)
  const [copied, setCopied] = useState(false)
  const [editedFaqs, setEditedFaqs] = useState<Array<{ question: string; answer: string }> | null>(null)

  const { data: existing } = useQuery({
    queryKey: ['faq', projectId, pageUrl],
    queryFn: () => seoApi.getFaq(projectId, pageUrl),
    retry: false,
  })

  const genMut = useMutation({
    mutationFn: () => seoApi.generateFaq(projectId, pageUrl, count),
    onSuccess: (d: any) => setEditedFaqs(d.faqs || []),
  })

  const faqs = editedFaqs || existing?.faqs || []

  const schemaJsonLd = faqs.length > 0 ? JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map((f: any) => ({
      "@type": "Question",
      "name": f.question,
      "acceptedAnswer": { "@type": "Answer", "text": f.answer }
    }))
  }, null, 2) : ''

  const copySchema = () => { navigator.clipboard.writeText(schemaJsonLd); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  return (
    <div className="border-t pt-3 mt-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">FAQ</p>
      <div className="flex gap-2 items-center mb-3">
        <label className="text-xs text-gray-600">Вопросов:</label>
        <input type="number" min={3} max={20} value={count} onChange={e => setCount(Number(e.target.value))}
          className="border rounded px-2 py-1 text-sm w-16" />
        <button onClick={() => genMut.mutate()} disabled={genMut.isPending}
          className="bg-primary-600 text-white px-3 py-1 rounded text-xs hover:bg-primary-700 disabled:opacity-50">
          {genMut.isPending ? '⏳ Генерация...' : 'Сгенерировать FAQ'}
        </button>
      </div>
      {faqs.length > 0 && (
        <div className="space-y-2 mb-3">
          {faqs.map((f: any, i: number) => (
            <div key={i} className="border rounded-lg p-2 bg-white">
              <p className="text-xs font-medium text-gray-800 mb-0.5">
                Q: <input className="border-none bg-transparent flex-1 w-full text-xs font-medium text-gray-800 focus:outline-none"
                  value={f.question}
                  onChange={e => setEditedFaqs(prev => (prev || faqs).map((x: any, j: number) => j === i ? { ...x, question: e.target.value } : x))} />
              </p>
              <textarea rows={2} className="w-full text-xs text-gray-600 border-none bg-transparent focus:outline-none resize-none"
                value={f.answer}
                onChange={e => setEditedFaqs(prev => (prev || faqs).map((x: any, j: number) => j === i ? { ...x, answer: e.target.value } : x))} />
            </div>
          ))}
        </div>
      )}
      {schemaJsonLd && (
        <div className="relative">
          <pre className="bg-gray-900 text-green-300 text-xs rounded-lg p-3 overflow-auto max-h-40 font-mono">{schemaJsonLd}</pre>
          <button onClick={copySchema}
            className={cx('absolute top-2 right-2 text-xs px-2 py-1 rounded transition',
              copied ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600')}>
            {copied ? '✅' : '📋'}
          </button>
        </div>
      )}
    </div>
  )
}

function MetaHistoryModal({ projectId, pageUrl, onClose }: { projectId: string; pageUrl: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['meta-history', projectId, pageUrl],
    queryFn: () => seoApi.getMetaHistory(projectId, pageUrl),
  })

  const events: any[] = data?.history || []

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h3 className="font-semibold">История изменений</h3>
            <p className="text-xs text-gray-500 mt-0.5 font-mono truncate">{pageUrl}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">
          {isLoading ? (
            <p className="text-gray-400 text-sm">Загрузка...</p>
          ) : events.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p className="text-3xl mb-2">📋</p>
              <p>История изменений пуста</p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((e: any, i: number) => (
                <div key={i} className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-700 bg-white border px-2 py-0.5 rounded">{e.field}</span>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      {e.user_login && <span>👤 {e.user_login}</span>}
                      <span>{new Date(e.changed_at).toLocaleString('ru-RU')}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-gray-400 mb-0.5">Было:</p>
                      <p className="text-red-600 bg-red-50 px-2 py-1 rounded">{e.old_value || <em className="text-gray-300">пусто</em>}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 mb-0.5">Стало:</p>
                      <p className="text-green-600 bg-green-50 px-2 py-1 rounded">{e.new_value || <em className="text-gray-300">пусто</em>}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ContentGapSection({ projectId }: { projectId: string }) {
  const [urls, setUrls] = useState(['', '', ''])
  const [results, setResults] = useState<any | null>(null)

  const analyzeMut = useMutation({
    mutationFn: () => seoApi.analyzeContentGap(projectId, urls.filter(u => u.trim())),
    onSuccess: (d: any) => setResults(d),
  })

  const PRIORITY_CONFIG = [
    { key: 'high', label: 'Высокий приоритет', icon: '🔴', color: 'border-red-200 bg-red-50' },
    { key: 'medium', label: 'Средний приоритет', icon: '🟡', color: 'border-yellow-200 bg-yellow-50' },
    { key: 'low', label: 'Низкий приоритет', icon: '🟢', color: 'border-green-200 bg-green-50' },
  ]

  const addToContentPlan = (item: any) => {
    return api.post(`/projects/${projectId}/content-plan`, {
      title: item.topic,
      target_keyword: item.keyword || null,
      notes: item.example_url || null,
      status: 'idea',
      priority: 0,
    })
  }

  return (
    <div className="border rounded-lg bg-white p-4 mt-6">
      <h3 className="font-semibold mb-3">Контентные пробелы</h3>
      <div className="space-y-2 mb-4">
        {urls.map((url, i) => (
          <div key={i}>
            <label className="block text-xs text-gray-500 mb-1">URL конкурента {i + 1}</label>
            <input value={url} onChange={e => setUrls(u => u.map((x, j) => j === i ? e.target.value : x))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder={`https://competitor${i + 1}.com`} />
          </div>
        ))}
        <div className="flex gap-2">
          <button onClick={() => analyzeMut.mutate()} disabled={analyzeMut.isPending || !urls.some(u => u.trim())}
            className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
            {analyzeMut.isPending ? '⏳ Анализ (30–60 сек)...' : 'Анализировать'}
          </button>
        </div>
      </div>

      {analyzeMut.isPending && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
          ⏳ Анализируем контент конкурентов... Это займёт 30–60 секунд.
        </div>
      )}

      {results && (
        <div className="space-y-4">
          {PRIORITY_CONFIG.map(({ key, label, icon, color }) => {
            const items: any[] = results[key] || []
            if (!items.length) return null
            return (
              <div key={key}>
                <h4 className="text-sm font-medium text-gray-700 mb-2">{icon} {label} ({items.length})</h4>
                <div className={cx('border rounded-lg divide-y', color)}>
                  {items.map((item: any, i: number) => (
                    <div key={i} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">{item.topic}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.content_type && <span className="text-xs bg-white border px-1.5 py-0.5 rounded text-gray-500">{item.content_type}</span>}
                          {item.example_url && (
                            <a href={item.example_url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline truncate max-w-xs">
                              {item.example_url}
                            </a>
                          )}
                        </div>
                      </div>
                      <button onClick={() => addToContentPlan(item)}
                        className="text-xs bg-primary-600 text-white px-2.5 py-1 rounded hover:bg-primary-700 shrink-0">
                        + Контент-план
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SeoPageRow({ page, projectId, onUpdate, onShowHistory }: { page: SeoPage; projectId: string; onUpdate: () => void; onShowHistory?: () => void }) {
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
            {onShowHistory && (
              <button onClick={onShowHistory} className="text-xs text-primary-600 hover:text-primary-700 ml-auto">
                История изменений
              </button>
            )}
          </div>

          <SchemaSection projectId={projectId} pageUrl={page.page_url} />
          <FaqSection projectId={projectId} pageUrl={page.page_url} />
        </div>
      )}
    </div>
  )
}

export default function SeoTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [view, setView] = useState<'checklist' | 'pages' | 'cluster' | 'content-gap'>('checklist')
  const [issuesOnly, setIssuesOnly] = useState(true)
  const [generateOg, setGenerateOg] = useState(false)
  const [generateTaskId, setGenerateTaskId] = useState<string | null>(null)
  const [clusters, setClusters] = useState<any[] | null>(null)
  const [clusterSource, setClusterSource] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [selectedPageUrls, setSelectedPageUrls] = useState<Set<string>>(new Set())
  const [historyPageUrl, setHistoryPageUrl] = useState<string | null>(null)

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
    mutationFn: () => seoApi.generateMeta(projectId, {
      generate_og: generateOg,
      only_missing: onlyMissing,
      only_issues: onlyIssues,
      page_urls: selectedPageUrls.size > 0 ? Array.from(selectedPageUrls) : undefined,
    }),
    onSuccess: (data: any) => setGenerateTaskId(data.task_id),
  })

  const isRunning = taskStatus?.status === 'running' || taskStatus?.status === 'pending'
  const isDone = taskStatus?.status === 'success'

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex gap-1 flex-wrap">
          {([
            ['checklist', '📋 Чеклист'],
            ['pages', '📄 Мета-теги'],
            ['cluster', '🔗 Кластеры'],
            ['content-gap', '🔎 Контент-пробелы'],
          ] as const).map(([v, label]) => (
            <button key={v} onClick={() => setView(v as any)}
              className={cx('px-4 py-2 text-sm rounded-lg transition',
                view === v ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Generate meta controls */}
      <div className="bg-gray-50 border rounded-lg p-3 mb-5 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" className="rounded" checked={generateOg} onChange={(e) => setGenerateOg(e.target.checked)} />
          + OG теги
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" className="rounded" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          Только без мета-тегов
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" className="rounded" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
          Только с проблемами
        </label>
        {selectedPageUrls.size > 0 && (
          <span className="text-xs text-primary-600 font-medium">Выбрано: {selectedPageUrls.size} стр.</span>
        )}
        <button onClick={() => genMetaMut.mutate()} disabled={genMetaMut.isPending || isRunning}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50 ml-auto">
          {genMetaMut.isPending || isRunning ? '⏳ Генерация...' : '✨ Сгенерировать мета-теги'}
        </button>
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
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" className="rounded" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} />
              Только страницы с проблемами
            </label>
            {pagesData && (
              <span className="text-sm text-gray-500">{pagesData.pages?.length ?? 0} из {pagesData.total ?? 0}</span>
            )}
            {selectedPageUrls.size > 0 && (
              <button onClick={() => setSelectedPageUrls(new Set())} className="text-xs text-primary-600 hover:text-primary-700">
                Снять выбор ({selectedPageUrls.size})
              </button>
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
                  <div key={page.page_url} className="flex items-start gap-2">
                    <input type="checkbox" className="mt-2.5 rounded"
                      checked={selectedPageUrls.has(page.page_url)}
                      onChange={() => setSelectedPageUrls(s => {
                        const n = new Set(s)
                        n.has(page.page_url) ? n.delete(page.page_url) : n.add(page.page_url)
                        return n
                      })} />
                    <div className="flex-1 min-w-0">
                      <SeoPageRow page={page} projectId={projectId}
                        onUpdate={() => qc.invalidateQueries({ queryKey: ['seo-pages', projectId] })}
                        onShowHistory={() => setHistoryPageUrl(page.page_url)} />
                    </div>
                  </div>
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

      {view === 'content-gap' && <ContentGapSection projectId={projectId} />}

      {historyPageUrl && (
        <MetaHistoryModal projectId={projectId} pageUrl={historyPageUrl} onClose={() => setHistoryPageUrl(null)} />
      )}
    </div>
  )
}
