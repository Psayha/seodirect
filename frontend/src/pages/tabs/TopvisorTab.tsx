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
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
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
