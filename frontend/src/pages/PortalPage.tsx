import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useState } from 'react'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

type PortalTab = 'positions' | 'analytics' | 'mediaplan' | 'report'

export default function PortalPage() {
  const { token } = useParams<{ token: string }>()
  const [tab, setTab] = useState<PortalTab>('positions')

  const { data: project, isLoading, isError } = useQuery({
    queryKey: ['portal-project', token],
    queryFn: () => api.get(`/portal/${token}`).then(r => r.data),
    retry: false,
  })

  const { data: positions } = useQuery({
    queryKey: ['portal-positions', token],
    queryFn: () => api.get(`/portal/${token}/positions`).then(r => r.data),
    enabled: tab === 'positions' && !!project,
  })

  const { data: analytics } = useQuery({
    queryKey: ['portal-analytics', token],
    queryFn: () => api.get(`/portal/${token}/analytics`).then(r => r.data),
    enabled: tab === 'analytics' && !!project,
  })

  const { data: mediaplan } = useQuery({
    queryKey: ['portal-mediaplan', token],
    queryFn: () => api.get(`/portal/${token}/mediaplan`).then(r => r.data),
    enabled: tab === 'mediaplan' && !!project,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-raised">
        <div className="text-muted">Загрузка...</div>
      </div>
    )
  }

  if (isError || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-raised">
        <div className="text-center">
          <p className="text-4xl mb-3">🔒</p>
          <h2 className="text-xl font-semibold text-primary mb-2">Страница недоступна</h2>
          <p className="text-sm text-muted">Ссылка недействительна или истёк срок действия</p>
        </div>
      </div>
    )
  }

  const tabs: { key: PortalTab; label: string }[] = [
    { key: 'positions', label: 'Позиции' },
    { key: 'analytics', label: 'Аналитика' },
    { key: 'mediaplan', label: 'Медиаплан' },
    { key: 'report', label: 'Отчёт' },
  ]

  return (
    <div className="min-h-screen bg-surface-raised">
      {/* Header */}
      <div className="bg-surface border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-primary">{project.project_name}</h1>
              <p className="text-sm text-muted mt-1">{project.client_name}</p>
            </div>
            <div className="text-right text-xs text-muted">
              <p>Обновлено</p>
              <p className="font-medium text-muted">
                {project.updated_at ? new Date(project.updated_at).toLocaleDateString('ru-RU') : '—'}
              </p>
            </div>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex gap-1">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cx(
                  'px-5 py-3 text-sm font-medium border-b-2 transition',
                  tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted hover:text-primary'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Positions */}
        {tab === 'positions' && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Позиции в поиске</h2>
            {!positions ? (
              <p className="text-muted text-sm">Загрузка...</p>
            ) : (positions.keywords || []).length === 0 ? (
              <div className="text-center py-16 text-muted">
                <p className="text-4xl mb-2">📈</p>
                <p>Нет данных по позициям</p>
              </div>
            ) : (
              <div className="bg-surface border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface-raised border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-muted">Ключевая фраза</th>
                      <th className="px-4 py-3 text-center font-medium text-muted w-24">Позиция</th>
                      <th className="px-4 py-3 text-center font-medium text-muted w-24">Динамика</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(positions.keywords || []).map((kw: any, i: number) => {
                      const pos = kw.position ?? kw.pos
                      const diff = kw.diff ?? kw.dynamics
                      return (
                        <tr key={i} className="hover:bg-surface-raised">
                          <td className="px-4 py-2.5 text-primary">{kw.phrase || kw.name}</td>
                          <td className="px-4 py-2.5 text-center">
                            {pos != null ? (
                              <span className={cx('font-mono font-bold text-base',
                                pos <= 3 ? 'text-green-600' : pos <= 10 ? 'text-yellow-600' : 'text-muted')}>
                                {pos}
                              </span>
                            ) : <span className="text-muted">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {diff != null && diff !== 0 ? (
                              <span className={cx('text-xs font-medium', diff > 0 ? 'text-green-600' : 'text-red-500')}>
                                {diff > 0 ? '▲' : '▼'} {Math.abs(diff)}
                              </span>
                            ) : <span className="text-muted text-xs">—</span>}
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

        {/* Analytics */}
        {tab === 'analytics' && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Аналитика трафика</h2>
            {!analytics ? (
              <p className="text-muted text-sm">Загрузка...</p>
            ) : analytics.summary ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Визиты', value: analytics.summary.visits?.toLocaleString() ?? '—', icon: '👁' },
                    { label: 'Пользователи', value: analytics.summary.users?.toLocaleString() ?? '—', icon: '👤' },
                    { label: 'Отказы', value: analytics.summary.bounce_rate ? analytics.summary.bounce_rate + '%' : '—', icon: '↩️' },
                    { label: 'Время на сайте', value: analytics.summary.avg_duration ? Math.floor(analytics.summary.avg_duration / 60) + 'м ' + (analytics.summary.avg_duration % 60) + 'с' : '—', icon: '⏱' },
                  ].map(({ label, value, icon }) => (
                    <div key={label} className="bg-surface border rounded-xl p-4 text-center">
                      <p className="text-2xl mb-1">{icon}</p>
                      <p className="text-xl font-bold text-primary">{value}</p>
                      <p className="text-xs text-muted mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-muted">
                <p className="text-4xl mb-2">📊</p>
                <p>Нет данных аналитики</p>
              </div>
            )}
          </div>
        )}

        {/* Mediaplan */}
        {tab === 'mediaplan' && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Медиаплан</h2>
            {!mediaplan ? (
              <p className="text-muted text-sm">Загрузка...</p>
            ) : (mediaplan.rows || []).length === 0 ? (
              <div className="text-center py-16 text-muted">
                <p className="text-4xl mb-2">📅</p>
                <p>Нет данных медиаплана</p>
              </div>
            ) : (
              <div className="bg-surface border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface-raised border-b">
                    <tr>
                      {['Месяц', 'Бюджет (₽)', 'Прогноз кликов', 'Прогноз заявок', 'CPA (₽)'].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-medium text-muted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(mediaplan.rows || []).map((row: any) => (
                      <tr key={row.month} className="hover:bg-surface-raised">
                        <td className="px-4 py-2.5 font-medium text-primary">{row.month_name}</td>
                        <td className="px-4 py-2.5 tabular-nums">{row.budget?.toLocaleString() ?? '—'}</td>
                        <td className="px-4 py-2.5 tabular-nums text-green-600">{row.forecast_clicks?.toLocaleString() ?? '—'}</td>
                        <td className="px-4 py-2.5 tabular-nums text-blue-600">{row.forecast_leads?.toLocaleString() ?? '—'}</td>
                        <td className="px-4 py-2.5 tabular-nums text-orange-600">{row.cpa?.toLocaleString() ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Report */}
        {tab === 'report' && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Отчёт</h2>
            <div className="bg-surface border rounded-xl overflow-hidden" style={{ height: '70vh' }}>
              <iframe
                src={`/api/portal/${token}/report`}
                className="w-full h-full"
                title="Клиентский отчёт"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        )}
      </div>

      <footer className="text-center py-6 text-xs text-muted border-t bg-surface mt-8">
        SEODirect — Аналитика и управление продвижением
      </footer>
    </div>
  )
}
