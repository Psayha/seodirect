import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import { crawlApi } from '../../api/crawl'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

type AuditIssue = 'no_title' | 'no_description' | 'no_h1' | 'multi_h1' | 'noindex' | 'slow' | 'no_alt' | 'orphan' | 'dup_title' | 'dup_description'

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

function LinkingSection({ projectId }: { projectId: string }) {
  const [filter, setFilter] = useState<'all' | 'orphan' | 'hub' | 'isolated'>('all')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['crawl-linking', projectId],
    queryFn: () => crawlApi.getLinking(projectId),
    enabled: false,
  })

  const pages: any[] = data?.pages || []
  const stats = data?.stats || {}
  const filtered = filter === 'all' ? pages : pages.filter((p: any) => p.type === filter)

  const typeColor = (type: string) => {
    if (type === 'orphan') return 'text-red-600 bg-red-50'
    if (type === 'hub') return 'text-green-600 bg-green-50'
    if (type === 'isolated') return 'text-orange-600 bg-orange-50'
    return 'text-gray-600 bg-gray-50'
  }

  const typeLabel = (type: string) => {
    if (type === 'orphan') return 'Сирота'
    if (type === 'hub') return 'Хаб'
    if (type === 'isolated') return 'Изолированная'
    return 'Нормальная'
  }

  return (
    <div className="border rounded-lg bg-white p-4 mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Перелинковка</h3>
        <button onClick={() => refetch()} disabled={isLoading}
          className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
          {isLoading ? '⏳ Загрузка...' : 'Проанализировать'}
        </button>
      </div>

      {stats.total > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-4 text-sm">
          {[
            { label: 'Всего страниц', value: stats.total, color: 'text-gray-700' },
            { label: 'Сирот', value: stats.orphans || 0, color: 'text-red-600' },
            { label: 'Хабов', value: stats.hubs || 0, color: 'text-green-600' },
            { label: 'Изолированных', value: stats.isolated || 0, color: 'text-orange-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={cx('text-xl font-bold', color)}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {pages.length > 0 && (
        <>
          <div className="flex gap-1 mb-3">
            {(['all', 'orphan', 'hub', 'isolated'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={cx('px-3 py-1 text-xs rounded-full border transition',
                  filter === f ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-300 text-gray-600 hover:border-gray-400')}>
                {f === 'all' ? 'Все' : typeLabel(f)}
              </button>
            ))}
          </div>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-3 py-2 text-left text-gray-500">URL</th>
                  <th className="px-3 py-2 text-left text-gray-500 w-48">Title</th>
                  <th className="px-3 py-2 text-center text-gray-500 w-16">Вход</th>
                  <th className="px-3 py-2 text-center text-gray-500 w-16">Исход</th>
                  <th className="px-3 py-2 text-center text-gray-500 w-24">Тип</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((p: any, i: number) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <a href={p.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate block max-w-xs">{p.url}</a>
                    </td>
                    <td className="px-3 py-2 text-gray-600 truncate max-w-xs">{p.title || '—'}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{p.incoming}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{p.outgoing}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={cx('px-1.5 py-0.5 rounded text-xs font-medium', typeColor(p.type))}>{typeLabel(p.type)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function RedirectsSection({ projectId }: { projectId: string }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['crawl-redirects', projectId],
    queryFn: () => crawlApi.getRedirects(projectId),
    enabled: false,
  })

  const redirects: any[] = data?.redirects || []
  const stats = data?.stats || {}

  const severityColor = (hops: number, is_loop: boolean) => {
    if (is_loop) return 'text-red-700 bg-red-100'
    if (hops >= 3) return 'text-red-600 bg-red-50'
    if (hops === 2) return 'text-yellow-600 bg-yellow-50'
    return 'text-green-600 bg-green-50'
  }

  return (
    <div className="border rounded-lg bg-white p-4 mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Редиректы</h3>
        <button onClick={() => refetch()} disabled={isLoading}
          className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
          {isLoading ? '⏳ Загрузка...' : 'Проанализировать'}
        </button>
      </div>

      {stats.total > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-4 text-sm">
          {[
            { label: 'Всего редиректов', value: stats.total || 0, color: 'text-gray-700' },
            { label: 'Нормальных (1 хоп)', value: stats.normal || 0, color: 'text-green-600' },
            { label: 'Предупреждений (2)', value: stats.warnings || 0, color: 'text-yellow-600' },
            { label: 'Ошибок (3+)', value: stats.errors || 0, color: 'text-red-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={cx('text-xl font-bold', color)}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {stats.loops > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-sm text-red-700">
          ⚠️ Обнаружено петель редиректов: <strong>{stats.loops}</strong>
        </div>
      )}

      {redirects.length > 0 && (
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2 text-left text-gray-500">Исходный URL</th>
                <th className="px-3 py-2 text-left text-gray-500">Финальный URL</th>
                <th className="px-3 py-2 text-center text-gray-500 w-16">Хопов</th>
                <th className="px-3 py-2 text-center text-gray-500 w-24">Статус</th>
              </tr>
            </thead>
            <tbody>
              {redirects.map((r: any, i: number) => (
                <tr key={i} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2 truncate max-w-xs">
                    <a href={r.source} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{r.source}</a>
                  </td>
                  <td className="px-3 py-2 truncate max-w-xs">
                    <a href={r.final} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{r.final}</a>
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{r.hops}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={cx('px-1.5 py-0.5 rounded text-xs font-medium', severityColor(r.hops, r.is_loop))}>
                      {r.is_loop ? 'Петля' : r.hops >= 3 ? 'Ошибка' : r.hops === 2 ? 'Предупреждение' : 'OK'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RobotsAuditSection({ projectId }: { projectId: string }) {
  const [showRobots, setShowRobots] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['crawl-robots', projectId],
    queryFn: () => crawlApi.getRobotsAudit(projectId),
    enabled: false,
  })

  const audit: any = data || {}

  return (
    <div className="border rounded-lg bg-white p-4 mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Robots.txt & Sitemap</h3>
        <button onClick={() => refetch()} disabled={isLoading}
          className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
          {isLoading ? '⏳ Загрузка...' : 'Проверить'}
        </button>
      </div>

      {data && (
        <div className="space-y-4">
          {audit.robots_txt && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-700">robots.txt</h4>
                <button onClick={() => setShowRobots(v => !v)} className="text-xs text-primary-600 hover:text-primary-700">
                  {showRobots ? 'Скрыть ▲' : 'Показать ▼'}
                </button>
              </div>
              {showRobots && (
                <pre className="bg-gray-50 border rounded-lg p-3 text-xs font-mono overflow-auto max-h-48">{audit.robots_txt}</pre>
              )}
            </div>
          )}

          {(audit.disallow_rules || []).length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Правила Disallow ({audit.disallow_rules.length})</h4>
              <div className="flex flex-wrap gap-1">
                {audit.disallow_rules.slice(0, 30).map((r: string, i: number) => (
                  <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">{r}</span>
                ))}
              </div>
            </div>
          )}

          {(audit.blocked_important || []).length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-medium text-red-700 mb-1">⚠️ Важные страницы заблокированы robots.txt:</p>
              <div className="space-y-0.5">
                {audit.blocked_important.map((url: string, i: number) => (
                  <p key={i} className="text-xs font-mono text-red-600">{url}</p>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">URL в sitemap</p>
              <p className="text-xl font-bold text-gray-800">{audit.sitemap_urls ?? '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Проиндексировано</p>
              <p className="text-xl font-bold text-gray-800">{audit.crawled_urls ?? '—'}</p>
            </div>
          </div>

          {(audit.sitemap_not_crawled || []).length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">В sitemap, но не в краулере ({audit.sitemap_not_crawled.length})</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {audit.sitemap_not_crawled.map((url: string, i: number) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer"
                    className="block text-xs text-blue-600 hover:underline font-mono truncate">{url}</a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CwvSection({ projectId }: { projectId: string }) {
  const [urlsText, setUrlsText] = useState('')
  const [strategy, setStrategy] = useState<'mobile' | 'desktop'>('mobile')
  const [results, setResults] = useState<any[] | null>(null)

  const checkMut = useMutation({
    mutationFn: () => crawlApi.checkCwv(projectId, urlsText.split('\n').map(u => u.trim()).filter(Boolean), strategy),
    onSuccess: (d: any) => setResults(d.results || []),
  })

  const metricColor = (metric: string, value: number) => {
    if (metric === 'lcp') return value <= 2500 ? 'text-green-600' : value <= 4000 ? 'text-yellow-600' : 'text-red-600'
    if (metric === 'cls') return value <= 0.1 ? 'text-green-600' : value <= 0.25 ? 'text-yellow-600' : 'text-red-600'
    if (metric === 'fid') return value <= 100 ? 'text-green-600' : value <= 300 ? 'text-yellow-600' : 'text-red-600'
    return value >= 90 ? 'text-green-600' : value >= 50 ? 'text-yellow-600' : 'text-red-600'
  }

  return (
    <div className="border rounded-lg bg-white p-4 mt-6">
      <h3 className="font-semibold mb-3">Core Web Vitals</h3>
      <div className="space-y-3 mb-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">URL для проверки (по одному на строке)</label>
          <textarea rows={4} value={urlsText} onChange={e => setUrlsText(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="https://example.com/&#10;https://example.com/about/" />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-1">
            {(['mobile', 'desktop'] as const).map(s => (
              <button key={s} onClick={() => setStrategy(s)}
                className={cx('px-3 py-1.5 text-sm rounded-lg transition',
                  strategy === s ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                {s === 'mobile' ? '📱 Mobile' : '🖥 Desktop'}
              </button>
            ))}
          </div>
          <button onClick={() => checkMut.mutate()} disabled={checkMut.isPending || !urlsText.trim()}
            className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
            {checkMut.isPending ? '⏳ Проверка...' : 'Проверить'}
          </button>
        </div>
      </div>

      {results && results.length > 0 && (
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2 text-left text-gray-500">URL</th>
                <th className="px-3 py-2 text-center text-gray-500 w-20">Score</th>
                <th className="px-3 py-2 text-center text-gray-500 w-20">LCP</th>
                <th className="px-3 py-2 text-center text-gray-500 w-16">CLS</th>
                <th className="px-3 py-2 text-center text-gray-500 w-16">FID</th>
                <th className="px-3 py-2 text-center text-gray-500 w-16">FCP</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r: any, i: number) => (
                <tr key={i} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2 truncate max-w-xs">
                    <a href={r.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{r.url}</a>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={cx('font-bold', metricColor('score', r.performance || 0))}>{r.performance ?? '—'}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={cx(metricColor('lcp', r.lcp || 9999))}>{r.lcp ? (r.lcp / 1000).toFixed(2) + 'с' : '—'}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={cx(metricColor('cls', r.cls || 99))}>{r.cls?.toFixed(3) ?? '—'}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={cx(metricColor('fid', r.fid || 9999))}>{r.fid ? r.fid + 'мс' : '—'}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={cx(metricColor('fcp', r.fcp || 9999))}>{r.fcp ? (r.fcp / 1000).toFixed(2) + 'с' : '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function CrawlTab({ projectId }: { projectId: string }) {
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
    multi_h1: 'Несколько H1',
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
    { key: 'multi_h1' as const, label: 'Несколько H1', value: report.multi_h1 ?? 0, bad: (report.multi_h1 ?? 0) > 0, issue: 'multi_h1' as AuditIssue },
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

          <LinkingSection projectId={projectId} />
          <RedirectsSection projectId={projectId} />
          <RobotsAuditSection projectId={projectId} />
          <CwvSection projectId={projectId} />
        </>
      )}
    </div>
  )
}
