import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import { portalApi } from '../../api/portal'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

async function downloadFile(url: string, filename: string) {
  const resp = await api.get(url, { responseType: 'blob' })
  const blob = new Blob([resp.data])
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

function ClientPortalSection({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ label: '', expires_at: '' })
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['portal-tokens', projectId],
    queryFn: () => portalApi.listTokens(projectId),
  })

  const createMut = useMutation({
    mutationFn: () => portalApi.createToken(projectId, { label: formData.label, expires_at: formData.expires_at || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['portal-tokens', projectId] }); setShowForm(false); setFormData({ label: '', expires_at: '' }) },
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })

  const revokeMut = useMutation({
    mutationFn: (tokenId: string) => portalApi.revokeToken(projectId, tokenId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-tokens', projectId] }),
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/portal/${token}`
    navigator.clipboard.writeText(url)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  const tokens: any[] = data?.tokens || []

  return (
    <div className="border border-[var(--border)] rounded-xl bg-surface p-4 mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Ссылка для клиента</h3>
        <button onClick={() => setShowForm(v => !v)}
          className="bg-accent text-white px-3 py-1.5 rounded-xl text-sm hover:bg-accent">
          Создать ссылку
        </button>
      </div>

      {showForm && (
        <div className="bg-surface-raised border rounded-xl p-3 mb-4 space-y-2">
          <div>
            <label className="block text-xs text-muted mb-1">Метка (например: «Ссылка для Иванова»)</label>
            <input value={formData.label} onChange={e => setFormData(f => ({ ...f, label: e.target.value }))}
              className="field"
              placeholder="Ссылка для клиента" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Срок действия (необязательно)</label>
            <input type="date" value={formData.expires_at} onChange={e => setFormData(f => ({ ...f, expires_at: e.target.value }))}
              className="field" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMut.mutate()} disabled={createMut.isPending}
              className="btn-accent px-4 py-2 rounded-xl text-sm hover:bg-accent disabled:opacity-50">
              {createMut.isPending ? 'Создание...' : 'Создать'}
            </button>
            <button onClick={() => setShowForm(false)} className="border px-4 py-2 rounded-xl text-sm hover:bg-surface-raised">Отмена</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted">Загрузка...</p>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-muted py-4 text-center">Нет активных клиентских ссылок</p>
      ) : (
        <div className="space-y-2">
          {tokens.map((t: any) => (
            <div key={t.id} className="flex items-center gap-3 border rounded-xl px-3 py-2 bg-surface-raised">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary">{t.label || 'Клиентская ссылка'}</p>
                <p className="text-xs text-muted font-mono truncate">{window.location.origin}/portal/{t.token}</p>
                {t.expires_at && <p className="text-xs text-muted">До: {new Date(t.expires_at).toLocaleDateString('ru-RU')}</p>}
              </div>
              <button onClick={() => copyLink(t.token)}
                className={cx('text-xs px-2.5 py-1 rounded border shrink-0 transition',
                  copiedToken === t.token ? 'bg-green-100 text-green-700 border-green-300' : 'bg-surface text-muted hover:bg-surface-raised')}>
                {copiedToken === t.token ? 'Скопировано' : 'Копировать'}
              </button>
              <button onClick={() => { if (confirm('Отозвать ссылку?')) revokeMut.mutate(t.id) }}
                className="text-xs text-red-500 hover:text-red-700 shrink-0">Отозвать</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DownloadButton({ url, filename, label, accent }: { url: string; filename: string; label: string; accent?: boolean }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleClick = async () => {
    setLoading(true)
    setError('')
    try {
      await downloadFile(url, filename)
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      if (detail) {
        setError(typeof detail === 'string' ? detail : JSON.stringify(detail))
      } else {
        setError('Не удалось скачать файл')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className={cx(
          'block w-full py-2 text-sm rounded-xl transition text-center disabled:opacity-50',
          accent ? 'bg-accent text-white hover:opacity-90' : 'btn-ghost'
        )}
      >
        {loading ? 'Загрузка...' : label}
      </button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

export default function ReportsTab({ projectId }: { projectId: string }) {
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const qc = useQueryClient()

  const loadPreview = async () => {
    setPreviewLoading(true)
    try {
      const resp = await api.get(`/projects/${projectId}/report/preview`, { responseType: 'text' })
      setPreviewHtml(typeof resp.data === 'string' ? resp.data : String(resp.data))
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Не удалось загрузить отчёт')
    } finally {
      setPreviewLoading(false)
    }
  }

  const generateNowMut = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/report/generate`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['history', projectId] }),
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-primary mb-2">Автоотчёты для клиентов</h2>
      <p className="text-sm text-muted mb-4">
        Готовые отчёты на основе данных проекта: Директ, SEO аудит, медиаплан.
      </p>

      {/* Auto-report banner */}
      <div className="bg-[var(--accent-subtle)] border border-accent/30 rounded-xl p-4 mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Автоматические отчёты</p>
          <p className="text-xs text-muted mt-0.5">Отчёты генерируются автоматически 1-го числа каждого месяца</p>
        </div>
        <button onClick={() => generateNowMut.mutate()} disabled={generateNowMut.isPending}
          className="bg-accent text-white px-3 py-1.5 rounded-xl text-sm hover:opacity-90 disabled:opacity-50 shrink-0">
          {generateNowMut.isPending ? '...' : 'Сгенерировать сейчас'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* HTML Report */}
        <div className="bg-surface border rounded-xl p-5">
          <div className="text-2xl mb-2">📊</div>
          <h3 className="font-semibold text-primary mb-1">Сводный отчёт (HTML)</h3>
          <p className="text-sm text-muted mb-4">
            Брендированный HTML-отчёт с ключевыми метриками. Отправьте клиенту напрямую.
          </p>
          <div className="flex gap-2">
            <button
              onClick={loadPreview}
              disabled={previewLoading}
              className="flex-1 py-2 text-sm border rounded-xl hover:bg-surface-raised transition"
            >
              {previewLoading ? '...' : 'Просмотр'}
            </button>
            <div className="flex-1">
              <DownloadButton
                url={`/projects/${projectId}/report/html`}
                filename="report.html"
                label="Скачать"
                accent
              />
            </div>
          </div>
        </div>

        {/* Strategy MD */}
        <div className="bg-surface border rounded-xl p-5">
          <div className="text-2xl mb-2">📝</div>
          <h3 className="font-semibold text-primary mb-1">SEO-стратегия (Markdown)</h3>
          <p className="text-sm text-muted mb-4">
            Полная стратегия продвижения в текстовом формате для команды.
          </p>
          <DownloadButton
            url={`/projects/${projectId}/export/strategy-md`}
            filename="strategy.md"
            label="Скачать .md"
          />
        </div>

        {/* Strategy HTML */}
        <div className="bg-surface border rounded-xl p-5">
          <div className="text-2xl mb-2">🌐</div>
          <h3 className="font-semibold text-primary mb-1">Стратегия (HTML)</h3>
          <p className="text-sm text-muted mb-4">
            Красиво оформленная стратегия в HTML. Открывается в браузере.
          </p>
          <DownloadButton
            url={`/projects/${projectId}/export/strategy-html`}
            filename="strategy.html"
            label="Скачать .html"
          />
        </div>

        {/* Copywriter brief */}
        <div className="bg-surface border rounded-xl p-5">
          <div className="text-2xl mb-2">✍️</div>
          <h3 className="font-semibold text-primary mb-1">Бриф для копирайтера (DOCX)</h3>
          <p className="text-sm text-muted mb-4">
            Готовый бриф для внешнего копирайтера с описанием проекта и требований.
          </p>
          <DownloadButton
            url={`/projects/${projectId}/export/copywriter-brief`}
            filename="brief_copywriter.docx"
            label="Скачать .docx"
          />
        </div>
      </div>

      {/* Preview modal */}
      {previewHtml && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-medium text-sm">Предпросмотр отчёта</span>
              <button onClick={() => setPreviewHtml(null)} className="text-muted hover:text-primary text-xl leading-none">&times;</button>
            </div>
            <iframe srcDoc={previewHtml} className="flex-1 rounded-b-xl" title="Report preview" sandbox="allow-same-origin" />
          </div>
        </div>
      )}

      <ClientPortalSection projectId={projectId} />
    </div>
  )
}
