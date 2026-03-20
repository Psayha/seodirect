import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { geoApi, type GeoKeyword, type GeoModel, type GeoMatrixRow } from '../../api/geo'
import { tasksApi } from '../../api/tasks'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const r = size / 2 - 10
  const circ = 2 * Math.PI * r
  const fill = (score / 100) * circ
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={8} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={8}
        strokeDasharray={`${fill} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
        className="rotate-90" style={{ rotate: '90deg', transformOrigin: 'center', fill: color, fontSize: size * 0.22, fontWeight: 700 }}
        transform={`rotate(90, ${size / 2}, ${size / 2})`}
      >
        {score}
      </text>
    </svg>
  )
}

// ── Task poller ───────────────────────────────────────────────────────────────

function useTaskPoller(taskId: string | null, onDone: () => void) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { data: taskStatus } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => tasksApi.get(taskId!),
    enabled: !!taskId,
    refetchInterval: taskId ? 2000 : false,
  })

  useEffect(() => {
    if (!taskId) return
    if (taskStatus?.status === 'success' || taskStatus?.status === 'failed') {
      onDone()
    }
  }, [taskStatus, taskId, onDone])

  return taskStatus
}

// ── AI Readiness Audit view ───────────────────────────────────────────────────

function AuditView({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [taskId, setTaskId] = useState<string | null>(null)
  const [llmsTxt, setLlmsTxt] = useState<string | null>(null)
  const [showLlms, setShowLlms] = useState(false)

  const { data: audit, isLoading } = useQuery({
    queryKey: ['geo-audit', projectId],
    queryFn: () => geoApi.getAudit(projectId),
  })

  const taskStatus = useTaskPoller(taskId, () => {
    qc.invalidateQueries({ queryKey: ['geo-audit', projectId] })
    setTaskId(null)
  })

  const runMut = useMutation({
    mutationFn: () => geoApi.runAudit(projectId),
    onSuccess: (d) => setTaskId(d.task_id),
  })

  const loadLlmsTxt = async () => {
    const r = await geoApi.getLlmsTxt(projectId)
    setLlmsTxt(r.content)
    setShowLlms(true)
  }

  const isRunning = taskId && (taskStatus?.status === 'pending' || taskStatus?.status === 'running')
  const progress = taskStatus?.progress ?? 0

  const CheckRow = ({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) => (
    <div className="flex items-start gap-3 py-2.5 border-b border-[var(--border)] last:border-0">
      <span className={cx('text-base mt-0.5', ok ? 'text-emerald-500' : 'text-red-400')}>
        {ok ? '✓' : '✗'}
      </span>
      <div className="flex-1 min-w-0">
        <p className={cx('text-sm font-medium', ok ? 'text-primary' : 'text-red-400')}>{label}</p>
        {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header + run button */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-primary">AI-готовность сайта</h3>
          <p className="text-xs text-muted mt-0.5">Насколько сайт доступен и оптимизирован для нейросетей</p>
        </div>
        <button
          onClick={() => runMut.mutate()}
          disabled={!!isRunning || runMut.isPending}
          className="btn-accent disabled:opacity-50"
        >
          {isRunning ? `⏳ Аудит... ${progress}%` : '▶ Запустить аудит'}
        </button>
      </div>

      {isRunning && (
        <div className="h-1.5 bg-surface-raised rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      )}

      {isLoading && <div className="text-muted text-sm">Загрузка...</div>}

      {!audit && !isLoading && (
        <div className="card-bordered p-6 text-center text-muted text-sm">
          Аудит ещё не запускался. Нажмите «Запустить аудит».
        </div>
      )}

      {audit && (
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 items-start">
          {/* Score */}
          <div className="flex flex-col items-center gap-2 card-bordered p-5">
            <ScoreRing score={audit.ai_readiness_score} />
            <p className="text-xs text-muted text-center">AI Readiness Score</p>
            <p className="text-xs text-muted">{new Date(audit.created_at).toLocaleDateString('ru')}</p>
          </div>

          {/* Checks */}
          <div className="space-y-4">
            {/* AI bots */}
            <div className="card-bordered p-4">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Доступность для AI-краулеров</p>
              {audit.blocked_bots.length > 0 ? (
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 mb-3">
                  <p className="text-sm font-semibold text-red-400 mb-1">
                    ⛔ Заблокированы AI-боты: {audit.blocked_bots.join(', ')}
                  </p>
                  <p className="text-xs text-muted">Удалите или ограничьте правила Disallow в robots.txt для этих агентов</p>
                </div>
              ) : (
                <CheckRow ok label="robots.txt не блокирует AI-краулеров" />
              )}
              {audit.cloudflare_detected && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
                  <p className="text-sm text-amber-400">⚠️ Обнаружен Cloudflare — проверьте настройки Bot Fight Mode, он может блокировать AI-ботов</p>
                </div>
              )}
            </div>

            {/* llms.txt */}
            <div className="card-bordered p-4">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">llms.txt</p>
              <CheckRow
                ok={audit.has_llms_txt}
                label={audit.has_llms_txt ? 'Файл llms.txt найден' : 'Файл llms.txt отсутствует'}
                hint={!audit.has_llms_txt ? 'llms.txt помогает AI-краулерам понять структуру сайта (аналог sitemap.xml для LLM)' : undefined}
              />
              {!audit.has_llms_txt && (
                <button onClick={loadLlmsTxt} className="text-xs text-accent hover:opacity-70 transition mt-2">
                  ✨ Сгенерировать llms.txt
                </button>
              )}
              {audit.has_llms_txt && audit.llms_txt_content && (
                <button onClick={() => setShowLlms(v => !v)} className="text-xs text-accent hover:opacity-70 transition mt-2">
                  {showLlms ? 'Скрыть' : 'Показать содержимое'}
                </button>
              )}
            </div>

            {/* E-E-A-T */}
            <div className="card-bordered p-4">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">E-E-A-T сигналы</p>
              <CheckRow
                ok={audit.has_about_page}
                label="Страница «О компании»"
                hint={!audit.has_about_page ? 'Страницы с информацией о компании повышают доверие нейросетей' : undefined}
              />
              <CheckRow
                ok={audit.has_author_page}
                label="Страница авторов / команды"
                hint={!audit.has_author_page ? 'Страницы с авторами на 41% увеличивают вероятность AI-цитирования' : undefined}
              />
            </div>

            {/* Freshness */}
            <div className="card-bordered p-4">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Свежесть контента</p>
              {(() => {
                const f = audit.pages_freshness?.main
                if (!f) return <p className="text-xs text-muted">Нет данных</p>
                const statusColor = f.status === 'green' ? 'text-emerald-500' : f.status === 'yellow' ? 'text-amber-500' : 'text-red-400'
                const icon = f.status === 'green' ? '🟢' : f.status === 'yellow' ? '🟡' : '🔴'
                return (
                  <div className="flex items-center gap-2">
                    <span>{icon}</span>
                    <span className={cx('text-sm font-medium', statusColor)}>
                      {f.last_updated
                        ? `Обновлено ${f.age_days} дн. назад (${f.last_updated})`
                        : 'Дата обновления не определена'}
                    </span>
                  </div>
                )
              })()}
              <p className="text-xs text-muted mt-1">Контент &lt;30 дней цитируется нейросетями в 3× чаще</p>
            </div>
          </div>
        </div>
      )}

      {/* llms.txt preview modal */}
      {showLlms && llmsTxt && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-[var(--border)] rounded-2xl max-w-2xl w-full flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div>
                <p className="font-semibold text-primary">llms.txt</p>
                <p className="text-xs text-muted mt-0.5">Разместите этот файл по адресу /llms.txt на вашем сайте</p>
              </div>
              <button onClick={() => setShowLlms(false)} className="text-muted hover:text-primary text-xl">✕</button>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-primary bg-surface-raised m-4 rounded-xl whitespace-pre-wrap">
              {llmsTxt}
            </pre>
            <div className="p-4 border-t border-[var(--border)] flex gap-2 justify-end">
              <button
                onClick={() => navigator.clipboard.writeText(llmsTxt)}
                className="btn-accent text-sm"
              >
                Скопировать
              </button>
              <button onClick={() => setShowLlms(false)} className="border border-[var(--border)] px-4 py-2 rounded-xl text-sm hover:bg-surface-raised transition">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Visibility matrix view ────────────────────────────────────────────────────

function VisibilityView({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [taskId, setTaskId] = useState<string | null>(null)
  const [newKw, setNewKw] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())

  const { data: keywords = [], isLoading: kwLoading } = useQuery({
    queryKey: ['geo-keywords', projectId],
    queryFn: () => geoApi.listKeywords(projectId),
  })
  const { data: models = [] } = useQuery({
    queryKey: ['geo-models'],
    queryFn: () => geoApi.listModels(),
  })
  const { data: results } = useQuery({
    queryKey: ['geo-results', projectId],
    queryFn: () => geoApi.getResults(projectId),
  })

  // Init selected models with defaults
  useState(() => {
    const defaults = models.filter(m => m.is_default).map(m => m.id)
    if (defaults.length) setSelectedModels(new Set(defaults))
  })

  const taskStatus = useTaskPoller(taskId, () => {
    qc.invalidateQueries({ queryKey: ['geo-results', projectId] })
    setTaskId(null)
  })

  const addKwMut = useMutation({
    mutationFn: (phrase: string) => geoApi.addKeywords(projectId, [{ keyword: phrase }]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['geo-keywords', projectId] })
      setNewKw('')
    },
  })

  const deleteKwMut = useMutation({
    mutationFn: (kwId: string) => geoApi.deleteKeyword(projectId, kwId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['geo-keywords', projectId] }),
  })

  const scanMut = useMutation({
    mutationFn: () =>
      geoApi.startScan(
        projectId,
        Array.from(selectedIds.size ? selectedIds : keywords.map(k => k.id)),
        Array.from(selectedModels.size ? selectedModels : models.filter(m => m.is_default).map(m => m.id))
      ),
    onSuccess: (d) => setTaskId(d.task_id),
  })

  const isRunning = taskId && (taskStatus?.status === 'pending' || taskStatus?.status === 'running')
  const progress = taskStatus?.progress ?? 0

  const activeModels = results?.rows.length
    ? [...new Set(results.rows.flatMap(r => Object.keys(r.results)))]
    : Array.from(selectedModels)

  const CellBadge = ({ row, modelId }: { row: GeoMatrixRow; modelId: string }) => {
    const cell = row.results[modelId]
    if (!cell) return <td className="px-3 py-2 text-center"><span className="text-muted text-xs">—</span></td>
    const mentioned = cell.mentioned
    const sentimentDot = cell.sentiment === 'positive' ? '🟢' : cell.sentiment === 'negative' ? '🔴' : '🟡'
    return (
      <td className="px-3 py-2 text-center" title={cell.snippet || undefined}>
        {mentioned ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-emerald-500 text-sm font-semibold">✓</span>
            <span className="text-[10px] text-muted">{sentimentDot} {cell.position || ''}</span>
          </div>
        ) : (
          <span className="text-red-400 text-sm">✗</span>
        )}
      </td>
    )
  }

  return (
    <div className="space-y-5">
      {/* Score + controls */}
      <div className="flex items-center gap-6 flex-wrap">
        {results?.ai_visibility_score !== null && results?.ai_visibility_score !== undefined && (
          <div className="flex items-center gap-3 card-bordered px-5 py-3">
            <ScoreRing score={results.ai_visibility_score} size={80} />
            <div>
              <p className="text-xs text-muted">AI Visibility Score</p>
              <p className="text-xs text-muted mt-0.5">% запросов с присутствием</p>
            </div>
          </div>
        )}
        <div className="flex-1 flex items-end gap-2 flex-wrap">
          {/* Model selector */}
          {models.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {models.map(m => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModels(prev => {
                    const n = new Set(prev)
                    n.has(m.id) ? n.delete(m.id) : n.add(m.id)
                    return n
                  })}
                  className={cx(
                    'text-xs px-2.5 py-1 rounded-full border transition',
                    selectedModels.has(m.id)
                      ? 'border-accent text-accent bg-[var(--accent-subtle)]'
                      : 'border-[var(--border)] text-muted hover:border-accent/50'
                  )}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => scanMut.mutate()}
            disabled={!!isRunning || scanMut.isPending || keywords.length === 0}
            className="btn-accent ml-auto disabled:opacity-50 shrink-0"
          >
            {isRunning ? `⏳ Проверяем... ${progress}%` : '▶ Запустить проверку'}
          </button>
        </div>
      </div>

      {isRunning && (
        <div className="h-1.5 bg-surface-raised rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Add keyword */}
      <div className="flex gap-2">
        <input
          className="field flex-1"
          placeholder="Добавить запрос для проверки..."
          value={newKw}
          onChange={e => setNewKw(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && newKw.trim()) addKwMut.mutate(newKw.trim()) }}
        />
        <button
          onClick={() => newKw.trim() && addKwMut.mutate(newKw.trim())}
          disabled={addKwMut.isPending || !newKw.trim()}
          className="btn-accent disabled:opacity-50"
        >
          + Добавить
        </button>
      </div>

      {kwLoading && <p className="text-muted text-sm">Загрузка...</p>}

      {keywords.length === 0 && !kwLoading && (
        <div className="card-bordered p-6 text-center text-muted text-sm">
          Добавьте запросы для проверки в нейровыдаче
        </div>
      )}

      {keywords.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="px-3 py-2 text-left font-medium text-muted text-xs w-6">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === keywords.length && keywords.length > 0}
                    onChange={e => setSelectedIds(e.target.checked ? new Set(keywords.map(k => k.id)) : new Set())}
                    className="rounded"
                  />
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted text-xs">Запрос</th>
                {activeModels.map(m => (
                  <th key={m} className="px-3 py-2 text-center font-medium text-muted text-xs whitespace-nowrap">
                    {models.find(mo => mo.id === m)?.name ?? m.split('/').pop()}
                  </th>
                ))}
                <th className="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {keywords.map(kw => {
                const row = results?.rows.find(r => r.keyword_id === kw.id)
                return (
                  <tr key={kw.id} className="border-b border-[var(--border)] hover:bg-surface-raised transition">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(kw.id)}
                        onChange={e => setSelectedIds(prev => {
                          const n = new Set(prev)
                          e.target.checked ? n.add(kw.id) : n.delete(kw.id)
                          return n
                        })}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-primary">{kw.keyword}</span>
                        <span className="text-[10px] text-muted border border-[var(--border)] px-1.5 py-0.5 rounded-full">{kw.source}</span>
                      </div>
                    </td>
                    {activeModels.map(m => row
                      ? <CellBadge key={m} row={row} modelId={m} />
                      : <td key={m} className="px-3 py-2 text-center"><span className="text-muted text-xs">—</span></td>
                    )}
                    <td className="px-3 py-2">
                      <button
                        onClick={() => deleteKwMut.mutate(kw.id)}
                        className="text-muted hover:text-red-400 transition text-base leading-none"
                        title="Удалить"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Competitors view ──────────────────────────────────────────────────────────

function CompetitorsView({ projectId }: { projectId: string }) {
  const { data: results } = useQuery({
    queryKey: ['geo-results', projectId],
    queryFn: () => geoApi.getResults(projectId),
  })

  const competitors = results?.top_competitors ?? []

  if (competitors.length === 0) {
    return (
      <div className="card-bordered p-6 text-center text-muted text-sm">
        Данные о конкурентах появятся после запуска проверки нейровыдачи
      </div>
    )
  }

  const maxCount = competitors[0]?.count ?? 1

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-primary">Конкуренты в нейровыдаче</h3>
        <p className="text-xs text-muted mt-0.5">Домены, которые нейросети цитируют по вашим запросам</p>
      </div>
      <div className="space-y-2">
        {competitors.map(({ domain, count }, i) => (
          <div key={domain} className="flex items-center gap-3 card-bordered px-4 py-3">
            <span className="text-xs text-muted w-5 text-right font-mono">{i + 1}</span>
            <span className="flex-1 text-sm text-primary font-medium">{domain}</span>
            <div className="flex items-center gap-2 w-48">
              <div className="flex-1 h-1.5 bg-surface-raised rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full"
                  style={{ width: `${(count / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted w-16 text-right">{count} упом.</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">
        Изучите структуру страниц-победителей, чтобы понять, что нравится нейросетям в вашей нише.
      </p>
    </div>
  )
}

// ── Main GeoTab ───────────────────────────────────────────────────────────────

type GeoView = 'audit' | 'visibility' | 'competitors'

const VIEWS: { key: GeoView; label: string; emoji: string }[] = [
  { key: 'audit',       label: 'AI-аудит',     emoji: '🔍' },
  { key: 'visibility',  label: 'Нейровыдача',  emoji: '🤖' },
  { key: 'competitors', label: 'Конкуренты',   emoji: '📊' },
]

export default function GeoTab({ projectId }: { projectId: string }) {
  const [view, setView] = useState<GeoView>('audit')

  return (
    <div className="p-6">
      {/* Sub-nav */}
      <div className="flex gap-1 mb-6 flex-wrap">
        {VIEWS.map(v => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={cx(
              'px-4 py-2 rounded-xl text-sm font-medium transition flex items-center gap-1.5',
              view === v.key
                ? 'bg-accent text-white'
                : 'bg-surface-raised text-muted hover:text-primary'
            )}
          >
            <span>{v.emoji}</span> {v.label}
          </button>
        ))}
      </div>

      {view === 'audit'       && <AuditView       projectId={projectId} />}
      {view === 'visibility'  && <VisibilityView  projectId={projectId} />}
      {view === 'competitors' && <CompetitorsView projectId={projectId} />}
    </div>
  )
}
