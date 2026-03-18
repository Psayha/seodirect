import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { analyticsApi, type TrafficSource, type DailyVisit } from '../../api/analytics'
import { api } from '../../api/client'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

function AnomalyBanner({ projectId }: { projectId: string }) {
  const { data } = useQuery({
    queryKey: ['anomalies', projectId],
    queryFn: () => analyticsApi.getAnomalies(projectId),
    refetchInterval: 30 * 60 * 1000,
    retry: false,
  })

  const anomalies: any[] = data?.anomalies || []

  if (!data) return null

  if (anomalies.length === 0) {
    return (
      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4 text-sm text-green-700">
        ✅ Трафик в норме
      </div>
    )
  }

  const levelColors: Record<string, string> = {
    error: 'bg-red-50 border-red-200 text-red-800',
    warn: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  }
  const levelIcons: Record<string, string> = { error: '🔴', warn: '🟡', info: '🔵' }

  return (
    <div className="space-y-2 mb-4">
      {anomalies.map((a: any, i: number) => (
        <div key={i} className={cx('flex items-start gap-3 border rounded-lg px-4 py-3 text-sm', levelColors[a.level] || levelColors.info)}>
          <span>{levelIcons[a.level] || '🔵'}</span>
          <div className="flex-1">
            <p className="font-medium">{a.message}</p>
            {a.current != null && a.previous != null && (
              <p className="text-xs mt-0.5 opacity-80">
                Текущий: {a.current} | Предыдущий: {a.previous}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function RoiSection({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['roi', projectId],
    queryFn: () => analyticsApi.getRoi(projectId),
  })

  const rows: any[] = data?.rows || []

  return (
    <div className="border rounded-lg bg-white p-4 mt-6">
      <h3 className="font-semibold mb-3">ROI Калькулятор</h3>
      {isLoading ? (
        <p className="text-sm text-gray-400">Загрузка...</p>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-2xl mb-2">📊</p>
          <p className="text-sm">Нет данных для расчёта ROI. Заполните медиаплан.</p>
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                {['Месяц', 'Бюджет', 'Прогноз лидов', 'Прогноз CPA', 'Факт лидов', 'Факт CPA', 'ROI%'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any, i: number) => {
                const roiOk = r.actual_leads != null && r.forecast_leads != null && r.actual_leads >= r.forecast_leads
                return (
                  <tr key={i} className={cx('border-b', roiOk ? 'bg-green-50' : r.actual_leads != null ? 'bg-red-50' : '')}>
                    <td className="px-3 py-2 font-medium text-gray-700">{r.month_name}</td>
                    <td className="px-3 py-2 tabular-nums">{r.budget?.toLocaleString() ?? '—'} ₽</td>
                    <td className="px-3 py-2 tabular-nums text-blue-600">{r.forecast_leads?.toLocaleString() ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{r.forecast_cpa?.toLocaleString() ?? '—'} ₽</td>
                    <td className="px-3 py-2 tabular-nums font-medium">
                      {r.actual_leads != null ? (
                        <span className={roiOk ? 'text-green-600' : 'text-red-600'}>{r.actual_leads.toLocaleString()}</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.actual_cpa != null ? r.actual_cpa.toLocaleString() + ' ₽' : '—'}</td>
                    <td className="px-3 py-2 tabular-nums font-medium">
                      {r.roi_pct != null ? (
                        <span className={r.roi_pct >= 0 ? 'text-green-600' : 'text-red-600'}>{r.roi_pct}%</span>
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
  )
}

export default function AnalyticsTab({ projectId }: { projectId: string }) {
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
      {/* Anomaly banner */}
      <AnomalyBanner projectId={projectId} />

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

      {/* Topvisor Positions */}
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

      <RoiSection projectId={projectId} />
    </div>
  )
}
