import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { utmApi } from '../../api/utm'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

export default function UtmTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', source: '', medium: '', campaign: '', content: '', term: '' })
  const [buildUrl, setBuildUrl] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [builtUrl, setBuiltUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['utm-templates', projectId],
    queryFn: () => utmApi.list(projectId),
  })

  const createMut = useMutation({
    mutationFn: () => utmApi.create(projectId, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['utm-templates', projectId] }); setShowForm(false); setForm({ name: '', source: '', medium: '', campaign: '', content: '', term: '' }) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => utmApi.delete(projectId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['utm-templates', projectId] }),
  })

  const buildMut = useMutation({
    mutationFn: () => utmApi.build(projectId, { base_url: buildUrl, template_id: selectedTemplate }),
    onSuccess: (d: any) => setBuiltUrl(d.url || d.built_url || ''),
  })

  const templates: any[] = data?.templates || []

  const copy = () => {
    if (builtUrl) { navigator.clipboard.writeText(builtUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">UTM-конструктор</h3>
        <button onClick={() => setShowForm(v => !v)}
          className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700">
          + Новый шаблон
        </button>
      </div>

      {showForm && (
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <h4 className="font-medium text-sm text-gray-700">Новый UTM-шаблон</h4>
          <div className="grid grid-cols-2 gap-3">
            {([
              { key: 'name', label: 'Название шаблона', placeholder: 'Яндекс Директ Search' },
              { key: 'source', label: 'utm_source', placeholder: 'yandex' },
              { key: 'medium', label: 'utm_medium', placeholder: 'cpc' },
              { key: 'campaign', label: 'utm_campaign', placeholder: '{campaign_id}' },
              { key: 'content', label: 'utm_content (опц.)', placeholder: '{ad_id}' },
              { key: 'term', label: 'utm_term (опц.)', placeholder: '{keyword}' },
            ] as const).map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-xs text-gray-500 mb-1">{label}</label>
                <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder={placeholder} />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.name || !form.source}
              className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
              {createMut.isPending ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button onClick={() => setShowForm(false)} className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Отмена</button>
          </div>
        </div>
      )}

      {isLoading ? <p className="text-gray-400 text-sm">Загрузка...</p> : templates.length === 0 ? (
        <div className="text-center py-10 text-gray-400 border-2 border-dashed rounded-xl">
          <p className="text-3xl mb-2">🔗</p>
          <p>Нет шаблонов. Создайте первый!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t: any) => (
            <div key={t.id} className="bg-white border rounded-lg px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-800">{t.name}</p>
                <p className="text-xs text-gray-400 font-mono truncate">
                  utm_source={t.source}&utm_medium={t.medium}&utm_campaign={t.campaign}
                  {t.content ? `&utm_content=${t.content}` : ''}
                  {t.term ? `&utm_term=${t.term}` : ''}
                </p>
              </div>
              <button onClick={() => deleteMut.mutate(t.id)} className="text-red-400 hover:text-red-600 text-xs shrink-0">Удалить</button>
            </div>
          ))}
        </div>
      )}

      {/* URL builder */}
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <h4 className="font-medium text-sm text-gray-700">Собрать UTM-ссылку</h4>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Базовый URL</label>
          <input value={buildUrl} onChange={e => setBuildUrl(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="https://example.com/landing" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Шаблон</label>
          <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">Выберите шаблон...</option>
            {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <button onClick={() => buildMut.mutate()} disabled={buildMut.isPending || !buildUrl || !selectedTemplate}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
          {buildMut.isPending ? '...' : 'Собрать ссылку'}
        </button>
        {builtUrl && (
          <div className="bg-gray-50 border rounded-lg p-3 flex items-center gap-2">
            <p className="text-xs font-mono text-gray-700 flex-1 break-all">{builtUrl}</p>
            <button onClick={copy}
              className={cx('text-xs px-2.5 py-1 rounded border shrink-0 transition', copied ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-gray-600 hover:bg-gray-50')}>
              {copied ? '✅ Скопировано' : '📋 Копировать'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
