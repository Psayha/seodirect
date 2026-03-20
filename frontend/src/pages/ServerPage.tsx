import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { serverApi, type SystemInfo, type CleanupResult } from '../api/server'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

function Spinner() {
  return (
    <div className="flex items-center gap-2 py-6 text-muted text-sm">
      <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin inline-block" />
      Загрузка...
    </div>
  )
}

function ProgressBar({ pct, warn = 80, danger = 90 }: { pct: number; warn?: number; danger?: number }) {
  const color = pct >= danger ? 'bg-red-500' : pct >= warn ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="w-full h-2.5 rounded-full bg-surface-raised overflow-hidden">
      <div className={cx('h-full rounded-full transition-all duration-500', color)} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

/* ── Disk / Memory Cards ───────────────────────────────────────────────────── */
function StatsCards({ info }: { info: SystemInfo }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* Memory */}
      <div className="card-bordered p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted">RAM</h4>
          <span className="text-sm font-mono text-primary">{info.memory_used_pct}%</span>
        </div>
        <ProgressBar pct={info.memory_used_pct} />
        <p className="text-xs text-muted">
          {info.memory_used_mb} MB / {info.memory_total_mb} MB
          <span className="ml-2 text-emerald-600">{info.memory_free_mb} MB свободно</span>
        </p>
      </div>

      {/* Disks */}
      {info.disk.map((d) => (
        <div key={d.path} className="card-bordered p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-muted">
              {d.path === '/' ? 'Диск /' : d.path}
            </h4>
            <span className="text-sm font-mono text-primary">{d.used_pct}%</span>
          </div>
          <ProgressBar pct={d.used_pct} />
          <p className="text-xs text-muted">
            {d.used_gb} GB / {d.total_gb} GB
            <span className="ml-2 text-emerald-600">{d.free_gb} GB свободно</span>
          </p>
        </div>
      ))}

      {/* System */}
      <div className="card-bordered p-5 space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-muted">Система</h4>
        <p className="text-sm text-primary font-medium">{info.hostname}</p>
        <p className="text-xs text-muted">{info.uptime}</p>
        <p className="text-xs text-muted">Load: {info.load_avg}</p>
      </div>
    </div>
  )
}

/* ── Docker Section ────────────────────────────────────────────────────────── */
function DockerSection({ info }: { info: SystemInfo }) {
  const docker = info.docker
  if (!docker) return <p className="text-muted text-sm">Docker недоступен</p>

  return (
    <div className="space-y-4">
      {/* Docker disk usage summary */}
      {docker.disk_usage_summary && (
        <div className="card-bordered overflow-hidden">
          <div className="px-5 py-3.5 bg-surface-raised border-b border-[var(--border)]">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-muted">Docker Disk Usage</h4>
          </div>
          <pre className="p-5 text-xs font-mono text-primary overflow-x-auto whitespace-pre">{docker.disk_usage_summary}</pre>
        </div>
      )}

      {/* Containers */}
      <div className="card-bordered overflow-hidden">
        <div className="px-5 py-3.5 bg-surface-raised border-b border-[var(--border)]">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted">
            Контейнеры ({docker.containers.length})
          </h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {['Имя', 'Статус', 'Образ', 'Размер'].map((h) => (
                  <th key={h} className="table-head">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {docker.containers.map((c) => (
                <tr key={c.name} className="table-row">
                  <td className="table-cell font-medium font-mono text-xs">{c.name}</td>
                  <td className="table-cell">
                    <span className={cx(
                      'badge',
                      c.status.toLowerCase().includes('up') ? 'badge-green' : 'badge-gray'
                    )}>
                      {c.status}
                    </span>
                  </td>
                  <td className="table-cell text-muted text-xs font-mono">{c.image}</td>
                  <td className="table-cell text-muted text-xs">{c.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Images */}
      <div className="card-bordered overflow-hidden">
        <div className="px-5 py-3.5 bg-surface-raised border-b border-[var(--border)]">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted">
            Образы ({docker.images.length})
          </h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {['Образ', 'Размер', 'Создан', 'ID'].map((h) => (
                  <th key={h} className="table-head">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {docker.images.map((img, i) => (
                <tr key={i} className="table-row">
                  <td className="table-cell font-mono text-xs">{img.name}</td>
                  <td className="table-cell text-muted text-xs">{img.size}</td>
                  <td className="table-cell text-muted text-xs">{img.created}</td>
                  <td className="table-cell text-muted text-xs font-mono">{img.id.slice(0, 12)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Volumes */}
      <div className="card-bordered overflow-hidden">
        <div className="px-5 py-3.5 bg-surface-raised border-b border-[var(--border)]">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted">
            Тома ({docker.volumes.length})
          </h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {['Имя', 'Драйвер'].map((h) => (
                  <th key={h} className="table-head">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {docker.volumes.map((v) => (
                <tr key={v.name} className="table-row">
                  <td className="table-cell font-mono text-xs">{v.name}</td>
                  <td className="table-cell text-muted text-xs">{v.driver}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ── Cleanup Section ───────────────────────────────────────────────────────── */
function CleanupSection() {
  const qc = useQueryClient()
  const [lastResult, setLastResult] = useState<CleanupResult | null>(null)
  const [confirmFull, setConfirmFull] = useState(false)

  const onSuccess = (data: CleanupResult) => {
    setLastResult(data)
    qc.invalidateQueries({ queryKey: ['server-info'] })
  }

  const imagesMut = useMutation({ mutationFn: serverApi.cleanupImages, onSuccess })
  const containersMut = useMutation({ mutationFn: serverApi.cleanupContainers, onSuccess })
  const volumesMut = useMutation({ mutationFn: serverApi.cleanupVolumes, onSuccess })
  const cacheMut = useMutation({ mutationFn: serverApi.cleanupBuildCache, onSuccess })
  const fullMut = useMutation({ mutationFn: serverApi.cleanupFull, onSuccess })

  const anyPending = imagesMut.isPending || containersMut.isPending || volumesMut.isPending || cacheMut.isPending || fullMut.isPending

  const actions = [
    { label: 'Неиспользуемые образы', desc: 'Удалить все dangling и unreferenced образы', mut: imagesMut, danger: false },
    { label: 'Остановленные контейнеры', desc: 'Удалить все остановленные контейнеры', mut: containersMut, danger: false },
    { label: 'Неиспользуемые тома', desc: 'Удалить тома, не привязанные к контейнерам', mut: volumesMut, danger: false },
    { label: 'Кэш сборки', desc: 'Очистить Docker builder cache', mut: cacheMut, danger: false },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {actions.map((a) => (
          <div key={a.label} className="card-bordered p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-primary">{a.label}</p>
              <p className="text-xs text-muted mt-0.5">{a.desc}</p>
            </div>
            <button
              onClick={() => a.mut.mutate()}
              disabled={anyPending}
              className="btn-accent py-2 px-4 text-sm shrink-0"
            >
              {a.mut.isPending ? 'Очистка...' : 'Очистить'}
            </button>
          </div>
        ))}
      </div>

      {/* Full cleanup */}
      <div className="card-bordered overflow-hidden border-red-500/30">
        <div className="px-5 py-3.5 bg-red-500/5 border-b border-red-500/20">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-red-500">
            Полная очистка системы
          </h4>
        </div>
        <div className="p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-primary">docker system prune -af --volumes</p>
            <p className="text-xs text-muted mt-0.5">
              Удалит ВСЕ неиспользуемые образы, контейнеры, тома и кэш сборки. Будьте осторожны.
            </p>
          </div>
          {!confirmFull ? (
            <button
              onClick={() => setConfirmFull(true)}
              disabled={anyPending}
              className="btn py-2 px-4 text-sm shrink-0 text-red-500 border border-red-500/30 hover:bg-red-500/10 transition rounded-xl"
            >
              Полная очистка
            </button>
          ) : (
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => { fullMut.mutate(); setConfirmFull(false) }}
                disabled={anyPending}
                className="btn-danger py-2 px-4 text-sm"
              >
                {fullMut.isPending ? 'Очистка...' : 'Подтвердить'}
              </button>
              <button onClick={() => setConfirmFull(false)} className="btn-ghost py-2 px-3 text-sm">
                Отмена
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Result */}
      {lastResult && (
        <div className="card-bordered overflow-hidden">
          <div className="px-5 py-3.5 bg-surface-raised border-b border-[var(--border)]">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-widest text-muted">
                Результат: {lastResult.action}
              </h4>
              <span className="text-sm font-medium text-emerald-600">{lastResult.reclaimed}</span>
            </div>
          </div>
          <pre className="p-5 text-xs font-mono text-muted overflow-x-auto whitespace-pre max-h-48 overflow-y-auto">
            {lastResult.details}
          </pre>
        </div>
      )}
    </div>
  )
}

/* ── Services Section ──────────────────────────────────────────────────────── */
function ServicesSection() {
  const [selectedService, setSelectedService] = useState<string | null>(null)
  const [logLines, setLogLines] = useState(100)

  const restartMut = useMutation({
    mutationFn: (service: string) => serverApi.restartService(service),
  })

  const logsMut = useMutation({
    mutationFn: (service: string) => serverApi.getServiceLogs(service, logLines),
  })

  const services = ['backend', 'frontend', 'celery', 'celery-beat', 'nginx', 'redis', 'postgres']

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {services.map((s) => (
          <div key={s} className="card-bordered p-4 text-center space-y-3">
            <p className="text-sm font-medium text-primary font-mono">{s}</p>
            <div className="flex gap-1.5 justify-center">
              <button
                onClick={() => { setSelectedService(s); logsMut.mutate(s) }}
                className="btn-ghost py-1 px-2.5 text-xs rounded-lg"
              >
                Логи
              </button>
              <button
                onClick={() => {
                  if (confirm(`Перезапустить ${s}?`)) restartMut.mutate(s)
                }}
                disabled={restartMut.isPending}
                className="btn py-1 px-2.5 text-xs rounded-lg border border-amber-500/30 text-amber-600 hover:bg-amber-500/10 transition"
              >
                {restartMut.isPending && restartMut.variables === s ? '...' : 'Restart'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {restartMut.isSuccess && (
        <div className="card-bordered p-4 border-emerald-500/30 bg-emerald-500/5">
          <p className="text-sm text-emerald-600">
            Сервис <strong>{restartMut.data?.service}</strong> перезапущен
          </p>
        </div>
      )}

      {/* Logs viewer */}
      {selectedService && (
        <div className="card-bordered overflow-hidden">
          <div className="px-5 py-3.5 bg-surface-raised border-b border-[var(--border)] flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-muted">
              Логи: {selectedService}
            </h4>
            <div className="flex items-center gap-3">
              <select
                className="field py-1 px-2 text-xs rounded-lg"
                value={logLines}
                onChange={(e) => setLogLines(Number(e.target.value))}
              >
                {[50, 100, 200, 500].map((n) => (
                  <option key={n} value={n}>{n} строк</option>
                ))}
              </select>
              <button
                onClick={() => logsMut.mutate(selectedService)}
                disabled={logsMut.isPending}
                className="btn-ghost py-1 px-3 text-xs"
              >
                {logsMut.isPending ? 'Загрузка...' : 'Обновить'}
              </button>
              <button onClick={() => setSelectedService(null)} className="btn-ghost py-1 px-2 text-xs">
                Закрыть
              </button>
            </div>
          </div>
          {logsMut.isPending ? (
            <div className="p-5"><Spinner /></div>
          ) : logsMut.data ? (
            <pre className="p-5 text-xs font-mono text-muted overflow-x-auto whitespace-pre max-h-96 overflow-y-auto">
              {logsMut.data.logs || 'Логи пусты'}
            </pre>
          ) : null}
        </div>
      )}
    </div>
  )
}

/* ── Main Page ─────────────────────────────────────────────────────────────── */
type Tab = 'overview' | 'cleanup' | 'services'

export default function ServerPage() {
  const [tab, setTab] = useState<Tab>('overview')
  const { data: info, isLoading, error } = useQuery({
    queryKey: ['server-info'],
    queryFn: serverApi.getInfo,
    refetchInterval: 30000,
  })

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Обзор' },
    { key: 'cleanup', label: 'Очистка' },
    { key: 'services', label: 'Сервисы' },
  ]

  return (
    <div className="p-6">
      <h2 className="page-title mb-5">Управление сервером</h2>

      <div className="tab-bar mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cx('tab-item', tab === t.key ? 'active' : '')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <Spinner />}
      {error && (
        <div className="card-bordered p-5 border-red-500/30">
          <p className="text-red-500 text-sm">Ошибка загрузки: {(error as any)?.message || 'Неизвестная ошибка'}</p>
        </div>
      )}

      {info && (
        <div className="max-w-6xl">
          {tab === 'overview' && (
            <div className="space-y-6">
              <StatsCards info={info} />
              <DockerSection info={info} />
            </div>
          )}
          {tab === 'cleanup' && <CleanupSection />}
          {tab === 'services' && <ServicesSection />}
        </div>
      )}
    </div>
  )
}
