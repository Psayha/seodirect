import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { mediaplanApi, type MediaPlanRow } from '../../api/mediaplan'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

export default function MediaplanTab({ projectId }: { projectId: string }) {
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
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })
  const resetMut = useMutation({
    mutationFn: () => mediaplanApi.reset(projectId, new Date().getFullYear()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mediaplan', projectId] }); setRows(null) },
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })

  if (isLoading) return <div className="p-6 text-muted">Загрузка...</div>

  const display = rows ?? (data?.rows || [])
  const totalBudget = display.reduce((s, r) => s + (r.budget || 0), 0)
  const totalClicks = display.reduce((s, r) => s + (r.forecast_clicks || 0), 0)
  const totalLeads = display.reduce((s, r) => s + (r.forecast_leads || 0), 0)
  const totalCPA = totalLeads > 0 ? Math.round(totalBudget / totalLeads) : 0

  const recomputeForecasts = (updatedRows: MediaPlanRow[]) => {
    const totalFreq = data?.total_frequency ?? 0
    if (!autoForecast || totalFreq <= 0) return updatedRows
    const newTotal = updatedRows.reduce((s, r) => s + (r.budget || 0), 0)
    if (newTotal === 0) return updatedRows
    return updatedRows.map((r) => {
      const clicks = Math.round(((r.budget || 0) / newTotal) * totalFreq * ctr / 100)
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
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg text-primary">Медиаплан</h3>
        <div className="flex gap-2 items-center">
          {saved && <span className="text-green-600 text-sm">✅ Сохранено</span>}
          {(data?.total_frequency ?? 0) > 0 && (
            <span className="text-xs text-muted">Суммарная частота ключей: {data!.total_frequency.toLocaleString()}</span>
          )}
          <a href={`/api/projects/${projectId}/export/mediaplan-xlsx`}
            className="border px-3 py-1.5 rounded-xl text-sm hover:bg-surface-raised flex items-center gap-1">
            📥 XLSX
          </a>
          <button onClick={() => resetMut.mutate()} disabled={resetMut.isPending}
            className="border px-3 py-1.5 rounded-xl text-sm hover:bg-surface-raised disabled:opacity-50">
            ↺ Сброс
          </button>
          {rows && (
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
              className="btn-accent px-4 py-1.5 rounded-xl text-sm hover:bg-accent disabled:opacity-50">
              {saveMut.isPending ? 'Сохранение...' : 'Сохранить'}
            </button>
          )}
        </div>
      </div>

      {/* Auto-forecast controls */}
      <div className="bg-surface-raised border border-[var(--border)] rounded-xl p-3.5 mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" className="rounded accent-accent" checked={autoForecast}
              onChange={(e) => {
                setAutoForecast(e.target.checked)
                if (e.target.checked) {
                  const base = rows ?? data?.rows ?? []
                  setRows(recomputeForecasts([...base] as MediaPlanRow[]))
                }
              }} />
            <span className="text-sm font-medium text-primary">Авто-прогноз кликов и заявок</span>
          </label>
          {autoForecast && (
            <>
              <label className="flex items-center gap-1.5 text-sm text-muted">
                CTR%:
                <input type="number" min={0.1} max={100} step={0.1}
                  className="w-16 bg-surface border border-[var(--border)] text-primary rounded-lg px-2 py-1 text-sm"
                  value={ctr}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 1
                    setCtr(v)
                    const base = rows ?? data?.rows ?? []
                    const newTotal = base.reduce((s, r) => s + (r.budget || 0), 0)
                    const totalFreq2 = data?.total_frequency ?? 0
                    if (newTotal > 0 && totalFreq2 > 0) {
                      setRows(base.map((r) => {
                        const clicks = Math.round(((r.budget || 0) / newTotal) * totalFreq2 * v / 100)
                        return { ...r, forecast_clicks: clicks, forecast_leads: Math.round(clicks * cr / 100) }
                      }) as MediaPlanRow[])
                    }
                  }} />
              </label>
              <label className="flex items-center gap-1.5 text-sm text-muted">
                CR%:
                <input type="number" min={0.1} max={100} step={0.1}
                  className="w-16 bg-surface border border-[var(--border)] text-primary rounded-lg px-2 py-1 text-sm"
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
              <span className="text-xs text-muted">
                Прогноз пересчитывается при изменении бюджета
              </span>
            </>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Бюджет всего', value: totalBudget.toLocaleString() + ' ₽', color: 'text-accent' },
          { label: 'Прогноз кликов', value: totalClicks > 0 ? totalClicks.toLocaleString() : '—', color: 'text-emerald-500' },
          { label: 'Прогноз заявок', value: totalLeads > 0 ? totalLeads.toLocaleString() : '—', color: 'text-blue-400' },
          { label: 'Средний CPA', value: totalCPA > 0 ? totalCPA.toLocaleString() + ' ₽' : '—', color: 'text-amber-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-surface border border-[var(--border)] rounded-2xl p-4">
            <p className="text-xs text-muted mb-1.5">{label}</p>
            <p className={cx('text-2xl font-bold tabular-nums', color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-surface border border-[var(--border)] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised border-b border-[var(--border)]">
            <tr>
              {['Месяц', '% бюджета', 'Бюджет (₽)', 'Прогноз кликов', 'Прогноз заявок', 'CPC (₽)', 'CPA (₽)'].map((h) => (
                <th key={h} className="text-left px-3 py-2.5 text-xs text-muted font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {display.map((row, i) => {
              const cpc = row.budget && row.forecast_clicks ? Math.round(row.budget / row.forecast_clicks) : null
              const cpa = row.budget && row.forecast_leads ? Math.round(row.budget / row.forecast_leads) : null
              return (
                <tr key={row.month} className="hover:bg-surface-raised transition">
                  <td className="px-3 py-2.5 font-medium text-primary">{row.month_name}</td>
                  <td className="px-3 py-2.5 text-muted tabular-nums">{row.pct}%</td>
                  <td className="px-3 py-2.5">
                    <input type="number"
                      className="w-28 bg-surface border border-[var(--border)] text-primary rounded-lg px-2 py-1 text-sm tabular-nums outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
                      value={row.budget || ''}
                      onChange={(e) => updateRow(i, 'budget', e.target.value ? Number(e.target.value) : null)} />
                  </td>
                  <td className="px-3 py-2.5">
                    <input type="number"
                      className="w-28 bg-surface border border-[var(--border)] text-primary rounded-lg px-2 py-1 text-sm tabular-nums outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition placeholder:text-muted"
                      placeholder="—"
                      value={row.forecast_clicks || ''}
                      onChange={(e) => updateRow(i, 'forecast_clicks', e.target.value ? Number(e.target.value) : null)} />
                  </td>
                  <td className="px-3 py-2.5">
                    <input type="number"
                      className="w-24 bg-surface border border-[var(--border)] text-primary rounded-lg px-2 py-1 text-sm tabular-nums outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition placeholder:text-muted"
                      placeholder="—"
                      value={row.forecast_leads || ''}
                      onChange={(e) => updateRow(i, 'forecast_leads', e.target.value ? Number(e.target.value) : null)} />
                  </td>
                  <td className="px-3 py-2.5 text-muted tabular-nums">{cpc ? cpc.toLocaleString() : '—'}</td>
                  <td className="px-3 py-2.5 text-muted tabular-nums">{cpa ? cpa.toLocaleString() : '—'}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-surface-raised border-t border-[var(--border)] font-semibold">
            <tr>
              <td className="px-3 py-2.5 text-primary">Итого</td>
              <td className="px-3 py-2.5 text-muted">100%</td>
              <td className="px-3 py-2.5 tabular-nums text-primary">{totalBudget.toLocaleString()} ₽</td>
              <td className="px-3 py-2.5 tabular-nums text-emerald-500">{totalClicks > 0 ? totalClicks.toLocaleString() : '—'}</td>
              <td className="px-3 py-2.5 tabular-nums text-blue-400">{totalLeads > 0 ? totalLeads.toLocaleString() : '—'}</td>
              <td className="px-3 py-2.5 text-muted">—</td>
              <td className="px-3 py-2.5 tabular-nums text-amber-500">{totalCPA > 0 ? totalCPA.toLocaleString() + ' ₽' : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted mt-2">Заполните «Бюджет» — % пересчитается автоматически. Включите авто-прогноз и задайте CTR% / CR% для автоматического расчёта кликов и заявок.</p>
    </div>
  )
}
