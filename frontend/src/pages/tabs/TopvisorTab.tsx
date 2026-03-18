import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

export default function TopvisorTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [linking, setLinking] = useState(false)
  const [selectedTvId, setSelectedTvId] = useState<number | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [snapshotDate, setSnapshotDate] = useState('')
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [showCompetitors, setShowCompetitors] = useState(false)
  const [showCluster, setShowCluster] = useState(false)
  const [clusterPolling, setClusterPolling] = useState(false)

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

  const { data: summary, isLoading: sumLoading, refetch: fetchSummary, isError: sumError } = useQuery({
    queryKey: ['topvisor-summary', projectId, dateFrom, dateTo],
    queryFn: () =>
      api.get(`/projects/${projectId}/topvisor/summary`, { params: { date_from: dateFrom, date_to: dateTo } }).then((r) => r.data),
    enabled: false,
  })

  const { data: snapshots, isLoading: snapLoading, refetch: fetchSnapshots, isError: snapError } = useQuery({
    queryKey: ['topvisor-snapshots', projectId, snapshotDate],
    queryFn: () =>
      api.get(`/projects/${projectId}/topvisor/snapshots`, { params: { date: snapshotDate } }).then((r) => r.data),
    enabled: false,
  })

  const { data: competitors, isLoading: compLoading, refetch: fetchCompetitors, isError: compError } = useQuery({
    queryKey: ['topvisor-competitors', projectId, dateFrom, dateTo],
    queryFn: () =>
      api.get(`/projects/${projectId}/topvisor/competitors`, { params: { date_from: dateFrom, date_to: dateTo } }).then((r) => r.data),
    enabled: false,
  })

  const { data: clusterStatus, refetch: fetchClusterStatus } = useQuery({
    queryKey: ['topvisor-cluster-status', projectId],
    queryFn: () => api.get(`/projects/${projectId}/topvisor/cluster/status`).then((r) => r.data),
    enabled: false,
    refetchInterval: clusterPolling ? 3000 : false,
  })

  const { data: clusterKeywords, isLoading: clusterKwLoading, refetch: fetchClusterKeywords } = useQuery({
    queryKey: ['topvisor-cluster-keywords', projectId],
    queryFn: () => api.get(`/projects/${projectId}/topvisor/cluster/keywords`).then((r) => r.data),
    enabled: false,
  })

  const linkMutation = useMutation({
    mutationFn: (tvId: number | null) => api.post(`/projects/${projectId}/topvisor/link`, { topvisor_project_id: tvId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['topvisor-link', projectId] })
      setLinking(false)
    },
    onError: (err: any) => alert(err?.response?.data?.detail || 'Ошибка операции'),
  })

  const checkMutation = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/topvisor/check-positions`),
    onSuccess: () => alert('Проверка позиций запущена в Topvisor'),
    onError: (err: any) => alert(err?.response?.data?.detail || 'Ошибка запуска проверки'),
  })

  const clusterStartMutation = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/topvisor/cluster/start`),
    onSuccess: () => {
      setClusterPolling(true)
      fetchClusterStatus()
    },
    onError: (err: any) => alert(err?.response?.data?.detail || 'Ошибка запуска кластеризации'),
  })

  if (clusterPolling && clusterStatus?.done) {
    setClusterPolling(false)
    fetchClusterKeywords()
  }

  const linked = linkData?.topvisor_project_id
  const kws: any[] = positions?.keywords || []
  const snapKws: any[] = snapshots?.keywords || []
  const compList: any[] = competitors?.competitors || []
  const clusterGroups: any[] = clusterKeywords?.clusters || []
  const sumData = summary?.summary || {}

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Позиции и конкуренты (Topvisor)</h2>

      {/* ── Link project ── */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Привязанный Topvisor-проект</p>
            <p className="text-sm text-gray-500 mt-0.5">{linked ? `ID: ${linked}` : 'Не привязан'}</p>
          </div>
          <div className="flex gap-2">
            {linked && (
              <button
                onClick={() => checkMutation.mutate()}
                disabled={checkMutation.isPending}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {checkMutation.isPending ? 'Запуск...' : '▶ Проверить позиции'}
              </button>
            )}
            <button
              onClick={() => { setLinking(true); fetchTvProjects() }}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {linked ? 'Изменить' : 'Привязать'}
            </button>
          </div>
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

      {linked && (
        <>
          {/* ── Date range (shared) ── */}
          <div className="bg-white rounded-xl border p-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Период данных</p>
            <div className="flex flex-wrap items-end gap-3">
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
              <button
                onClick={() => { fetchPositions(); fetchSummary() }}
                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                Загрузить позиции и сводку
              </button>
            </div>
          </div>

          {/* ── Summary cards ── */}
          <div className="bg-white rounded-xl border p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Сводка позиций</h3>
            {sumLoading && <p className="text-sm text-gray-400">Загрузка...</p>}
            {sumError && <p className="text-sm text-red-500">Ошибка загрузки сводки</p>}
            {Object.keys(sumData).length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {sumData.avg != null && (
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">Средняя позиция</p>
                    <p className="text-2xl font-bold text-gray-900">{Number(sumData.avg).toFixed(1)}</p>
                  </div>
                )}
                {sumData.visibility != null && (
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">Видимость</p>
                    <p className="text-2xl font-bold text-blue-700">{Number(sumData.visibility).toFixed(1)}%</p>
                  </div>
                )}
                {sumData.tops != null && typeof sumData.tops === 'object' && (
                  <>
                    {sumData.tops['3'] != null && (
                      <div className="bg-green-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500 mb-1">ТОП-3</p>
                        <p className="text-2xl font-bold text-green-700">{sumData.tops['3']}</p>
                      </div>
                    )}
                    {sumData.tops['10'] != null && (
                      <div className="bg-yellow-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500 mb-1">ТОП-10</p>
                        <p className="text-2xl font-bold text-yellow-700">{sumData.tops['10']}</p>
                      </div>
                    )}
                  </>
                )}
                {sumData.count != null && (
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">Запросов</p>
                    <p className="text-2xl font-bold text-gray-900">{sumData.count}</p>
                  </div>
                )}
              </div>
            ) : !sumLoading && (
              <p className="text-sm text-gray-400">Нажмите «Загрузить позиции и сводку» выше</p>
            )}
          </div>

          {/* ── Positions table ── */}
          <div className="bg-white rounded-xl border p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">История позиций</h3>
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
            {!posLoading && kws.length === 0 && positions && (
              <p className="text-sm text-gray-400">Нет данных за выбранный период</p>
            )}
          </div>

          {/* ── Competitors ── */}
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Конкуренты в выдаче</h3>
                <p className="text-xs text-gray-500 mt-0.5">Топ-домены по всем ключам проекта</p>
              </div>
              <button
                onClick={() => { setShowCompetitors((v) => !v); if (!showCompetitors) fetchCompetitors() }}
                className="text-xs text-primary-600 hover:underline"
              >
                {showCompetitors ? 'Скрыть' : 'Показать'}
              </button>
            </div>
            {showCompetitors && (
              <>
                {compLoading && <p className="text-sm text-gray-400">Загрузка конкурентов...</p>}
                {compError && <p className="text-sm text-red-500">Ошибка загрузки конкурентов</p>}
                {compList.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-3 py-2 text-left text-gray-600 font-medium">Домен</th>
                          <th className="px-3 py-2 text-center text-gray-600 font-medium w-24">Средняя поз.</th>
                          <th className="px-3 py-2 text-center text-gray-600 font-medium w-24">Запросов</th>
                          <th className="px-3 py-2 text-center text-gray-600 font-medium w-20">ТОП-3</th>
                          <th className="px-3 py-2 text-center text-gray-600 font-medium w-20">ТОП-10</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compList.map((c: any, i: number) => (
                          <tr key={i} className="border-t hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-800">{c.domain || c.name || '—'}</td>
                            <td className="px-3 py-2 text-center font-mono">{c.avg != null ? Number(c.avg).toFixed(1) : '—'}</td>
                            <td className="px-3 py-2 text-center">{c.count ?? c.keywords_count ?? '—'}</td>
                            <td className="px-3 py-2 text-center text-green-600 font-medium">{c.top3 ?? c.tops?.['3'] ?? '—'}</td>
                            <td className="px-3 py-2 text-center text-yellow-600 font-medium">{c.top10 ?? c.tops?.['10'] ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {!compLoading && compList.length === 0 && competitors && (
                  <p className="text-sm text-gray-400">Нет данных. Убедитесь, что в Topvisor есть снимки выдачи за выбранный период.</p>
                )}
              </>
            )}
          </div>

          {/* ── Snapshots ── */}
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Снимки выдачи (по ключу)</h3>
                <p className="text-xs text-gray-500 mt-0.5">Какие URL видны по каждому запросу</p>
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
                      Загрузить
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
                          <th className="px-3 py-2 text-left text-gray-600 font-medium">URL</th>
                          <th className="px-3 py-2 text-left text-gray-600 font-medium w-48">Заголовок</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapKws.map((kw: any, i: number) => (
                          <tr key={i} className="border-t hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-800">{kw.name || kw.keyword || '—'}</td>
                            <td className="px-3 py-2 text-center font-mono">
                              <span className={cx('font-medium',
                                kw.position <= 3 ? 'text-green-600' : kw.position <= 10 ? 'text-yellow-600' : 'text-gray-500'
                              )}>
                                {kw.position ?? '—'}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              {kw.url ? (
                                <a href={kw.url} target="_blank" rel="noreferrer"
                                  className="text-blue-600 hover:underline text-xs truncate block max-w-xs">
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

          {/* ── Clustering ── */}
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Кластеризация ключей</h3>
                <p className="text-xs text-gray-500 mt-0.5">Кластеризация по ТОП-10 Topvisor (платно)</p>
              </div>
              <button
                onClick={() => { setShowCluster((v) => !v); if (!showCluster) fetchClusterStatus() }}
                className="text-xs text-primary-600 hover:underline"
              >
                {showCluster ? 'Скрыть' : 'Показать'}
              </button>
            </div>
            {showCluster && (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <button
                    onClick={() => clusterStartMutation.mutate()}
                    disabled={clusterStartMutation.isPending || clusterPolling}
                    className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    {clusterStartMutation.isPending ? 'Запуск...' : 'Запустить кластеризацию'}
                  </button>
                  {clusterStatus && !clusterStatus.done && (
                    <button
                      onClick={() => fetchClusterStatus()}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Обновить статус
                    </button>
                  )}
                  {clusterStatus?.done && (
                    <button
                      onClick={() => fetchClusterKeywords()}
                      className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Загрузить результаты
                    </button>
                  )}
                </div>

                {clusterStatus && (
                  <div className="mb-3">
                    {clusterStatus.done ? (
                      <p className="text-sm text-green-600 font-medium">Кластеризация завершена</p>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span>Выполнение кластеризации...</span>
                          <span>{clusterStatus.percent ?? 0}%</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-600 transition-all"
                            style={{ width: `${clusterStatus.percent ?? 0}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {clusterKwLoading && <p className="text-sm text-gray-400">Загрузка кластеров...</p>}
                {clusterGroups.length > 0 && (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {clusterGroups.map((g: any) => (
                      <div key={g.group_id} className="border rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-600 mb-1">
                          Группа {g.group_id} · {g.keywords?.length ?? 0} запросов
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {(g.keywords || []).slice(0, 20).map((kw: string, i: number) => (
                            <span key={i} className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded">
                              {kw}
                            </span>
                          ))}
                          {(g.keywords?.length ?? 0) > 20 && (
                            <span className="text-xs text-gray-400">+{g.keywords.length - 20} ещё</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
