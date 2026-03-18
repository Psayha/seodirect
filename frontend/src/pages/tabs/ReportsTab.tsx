import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import { portalApi } from '../../api/portal'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
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
    <div className="border rounded-lg bg-white p-4 mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Ссылка для клиента</h3>
        <button onClick={() => setShowForm(v => !v)}
          className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700">
          Создать ссылку
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 border rounded-lg p-3 mb-4 space-y-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Метка (например: «Ссылка для Иванова»)</label>
            <input value={formData.label} onChange={e => setFormData(f => ({ ...f, label: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Ссылка для клиента" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Срок действия (необязательно)</label>
            <input type="date" value={formData.expires_at} onChange={e => setFormData(f => ({ ...f, expires_at: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMut.mutate()} disabled={createMut.isPending}
              className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
              {createMut.isPending ? 'Создание...' : 'Создать'}
            </button>
            <button onClick={() => setShowForm(false)} className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Отмена</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400">Загрузка...</p>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">Нет активных клиентских ссылок</p>
      ) : (
        <div className="space-y-2">
          {tokens.map((t: any) => (
            <div key={t.id} className="flex items-center gap-3 border rounded-lg px-3 py-2 bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700">{t.label || 'Клиентская ссылка'}</p>
                <p className="text-xs text-gray-400 font-mono truncate">{window.location.origin}/portal/{t.token}</p>
                {t.expires_at && <p className="text-xs text-gray-400">До: {new Date(t.expires_at).toLocaleDateString('ru-RU')}</p>}
              </div>
              <button onClick={() => copyLink(t.token)}
                className={cx('text-xs px-2.5 py-1 rounded border shrink-0 transition',
                  copiedToken === t.token ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-gray-600 hover:bg-gray-50')}>
                {copiedToken === t.token ? '✅' : '📋 Копировать'}
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

export default function ReportsTab({ projectId }: { projectId: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const qc = useQueryClient()

  const generateNowMut = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/report/generate`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['history', projectId] }),
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })

  return (
    <div className="p-6 max-w-3xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Автоотчёты для клиентов</h2>
      <p className="text-sm text-gray-500 mb-4">
        Готовые отчёты на основе данных проекта: Директ, SEO аудит, медиаплан.
      </p>

      {/* Auto-report banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-800">Автоматические отчёты</p>
          <p className="text-xs text-blue-600 mt-0.5">Отчёты генерируются автоматически 1-го числа каждого месяца</p>
        </div>
        <button onClick={() => generateNowMut.mutate()} disabled={generateNowMut.isPending}
          className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 shrink-0">
          {generateNowMut.isPending ? '⏳...' : 'Сгенерировать сейчас'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* HTML Report */}
        <div className="bg-white border rounded-xl p-5">
          <div className="text-2xl mb-2">📊</div>
          <h3 className="font-semibold text-gray-900 mb-1">Сводный отчёт (HTML)</h3>
          <p className="text-sm text-gray-500 mb-4">
            Брендированный HTML-отчёт с ключевыми метриками. Отправьте клиенту напрямую.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPreviewUrl(`/api/projects/${projectId}/report/preview`)}
              className="flex-1 py-2 text-sm border rounded-lg hover:bg-gray-50 transition"
            >
              Просмотр
            </button>
            <a
              href={`/api/projects/${projectId}/report/html`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-center"
            >
              Скачать
            </a>
          </div>
        </div>

        {/* Strategy MD */}
        <div className="bg-white border rounded-xl p-5">
          <div className="text-2xl mb-2">📝</div>
          <h3 className="font-semibold text-gray-900 mb-1">SEO-стратегия (Markdown)</h3>
          <p className="text-sm text-gray-500 mb-4">
            Полная стратегия продвижения в текстовом формате для команды.
          </p>
          <a
            href={`/api/projects/${projectId}/export/strategy-md`}
            target="_blank"
            rel="noreferrer"
            className="block py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition text-center"
          >
            Скачать .md
          </a>
        </div>

        {/* Strategy HTML */}
        <div className="bg-white border rounded-xl p-5">
          <div className="text-2xl mb-2">🌐</div>
          <h3 className="font-semibold text-gray-900 mb-1">Стратегия (HTML)</h3>
          <p className="text-sm text-gray-500 mb-4">
            Красиво оформленная стратегия в HTML. Открывается в браузере.
          </p>
          <a
            href={`/api/projects/${projectId}/export/strategy-html`}
            target="_blank"
            rel="noreferrer"
            className="block py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition text-center"
          >
            Скачать .html
          </a>
        </div>

        {/* Copywriter brief */}
        <div className="bg-white border rounded-xl p-5">
          <div className="text-2xl mb-2">✍️</div>
          <h3 className="font-semibold text-gray-900 mb-1">Бриф для копирайтера (DOCX)</h3>
          <p className="text-sm text-gray-500 mb-4">
            Готовый бриф для внешнего копирайтера с описанием проекта и требований.
          </p>
          <a
            href={`/api/projects/${projectId}/export/copywriter-brief`}
            target="_blank"
            rel="noreferrer"
            className="block py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition text-center"
          >
            Скачать .docx
          </a>
        </div>
      </div>

      {/* Preview iframe */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-medium text-sm">Предпросмотр отчёта</span>
              <button onClick={() => setPreviewUrl(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <iframe src={previewUrl} className="flex-1 rounded-b-xl" title="Report preview" sandbox="allow-same-origin" />
          </div>
        </div>
      )}

      <ClientPortalSection projectId={projectId} />
    </div>
  )
}
