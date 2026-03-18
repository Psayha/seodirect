import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi, type Brief } from '../../api/projects'
import { api } from '../../api/client'

interface ChatMessage { role: 'user' | 'assistant'; content: string }

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

export default function BriefTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const { data: brief, isLoading } = useQuery({
    queryKey: ['brief', projectId],
    queryFn: () => projectsApi.getBrief(projectId),
  })
  const [form, setForm] = useState<Partial<Brief>>({})
  const [saved, setSaved] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  const { data: templatesData } = useQuery({
    queryKey: ['brief-templates'],
    queryFn: () => api.get('/briefs/templates').then((r) => r.data),
  })

  const mutation = useMutation({
    mutationFn: (data: Partial<Brief>) => projectsApi.updateBrief(projectId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brief', projectId] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const applyTemplate = async (templateId: string) => {
    const r = await api.get(`/briefs/templates/${templateId}`)
    const tData = r.data.data as Partial<Brief>
    setForm((f) => ({ ...f, ...tData }))
    setShowTemplates(false)
  }

  if (isLoading) return <div className="p-4 text-muted">Загрузка...</div>

  const current = { ...brief, ...form }
  const field = (key: keyof Brief, label: string, multiline = false) => (
    <div key={key}>
      <label className="block text-sm font-medium text-primary mb-1">{label}</label>
      {multiline ? (
        <textarea rows={3} className="field"
          value={(current[key] as string) || ''}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
      ) : (
        <input className="field"
          value={(current[key] as string) || ''}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
      )}
    </div>
  )

  const templates: { id: string; name: string; icon: string }[] = templatesData?.templates || []

  return (
    <div className="p-6 max-w-2xl space-y-4">
      {/* Templates */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-primary text-sm uppercase tracking-wide">О бизнесе</h3>
        <div className="relative">
          <button
            onClick={() => setShowTemplates((v) => !v)}
            className="text-xs px-3 py-1.5 border rounded-xl text-muted hover:bg-surface-raised transition"
          >
            📋 Шаблон по нише
          </button>
          {showTemplates && templates.length > 0 && (
            <div className="absolute right-0 top-full mt-1 bg-surface border rounded-xl shadow-lg z-20 w-56 py-1">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t.id)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-surface-raised flex items-center gap-2"
                >
                  <span>{t.icon}</span> {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {field('niche', 'Ниша / тематика')}
      {field('products', 'Продукты / услуги', true)}
      {field('price_segment', 'Ценовой сегмент')}
      {field('geo', 'Гео работы бизнеса')}
      <h3 className="font-semibold text-primary text-sm uppercase tracking-wide pt-2">Целевая аудитория</h3>
      {field('target_audience', 'Кто покупает', true)}
      {field('pains', 'Боли клиентов', true)}
      <h3 className="font-semibold text-primary text-sm uppercase tracking-wide pt-2">УТП</h3>
      {field('usp', 'Главные преимущества', true)}
      <h3 className="font-semibold text-primary text-sm uppercase tracking-wide pt-2">Реклама</h3>
      {field('campaign_goal', 'Цель кампании')}
      {field('monthly_budget', 'Месячный бюджет (₽)')}
      {field('restrictions', 'Ограничения', true)}
      {field('excluded_geo', 'Исключить гео (города/регионы)')}

      {/* Гео таргетинг — список городов */}
      <div>
        <label className="block text-sm font-medium text-primary mb-1">Гео таргетинг (список городов)</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {((current.ad_geo as string[]) || []).map((city, i) => (
            <span key={i} className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full">
              {city}
              <button type="button" onClick={() => setForm((f) => ({ ...f, ad_geo: ((f.ad_geo || current.ad_geo || []) as string[]).filter((_, j) => j !== i) }))}
                className="hover:text-red-500 font-bold leading-none">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input id="ad_geo_input" className="field flex-1"
            placeholder="Введите город и нажмите +"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const v = (e.target as HTMLInputElement).value.trim()
                if (v) { setForm((f) => ({ ...f, ad_geo: [...((f.ad_geo || current.ad_geo || []) as string[]), v] }));(e.target as HTMLInputElement).value = '' }
              }
            }} />
          <button type="button" className="border px-3 py-2 rounded-xl text-sm hover:bg-surface-raised"
            onClick={() => {
              const inp = document.getElementById('ad_geo_input') as HTMLInputElement
              const v = inp?.value.trim()
              if (v) { setForm((f) => ({ ...f, ad_geo: [...((f.ad_geo || current.ad_geo || []) as string[]), v] })); inp.value = '' }
            }}>+</button>
        </div>
      </div>

      {/* Конкуренты URL — динамический список */}
      <div>
        <label className="block text-sm font-medium text-primary mb-1">Конкуренты (URL)</label>
        <div className="space-y-1.5 mb-2">
          {((current.competitors_urls as string[]) || []).map((url, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="field flex-1 font-mono py-1.5"
                value={url}
                onChange={(e) => setForm((f) => {
                  const arr = [...((f.competitors_urls || current.competitors_urls || []) as string[])]
                  arr[i] = e.target.value
                  return { ...f, competitors_urls: arr }
                })} />
              <button type="button" onClick={() => setForm((f) => ({ ...f, competitors_urls: ((f.competitors_urls || current.competitors_urls || []) as string[]).filter((_, j) => j !== i) }))}
                className="text-red-400 hover:text-red-600 font-bold text-lg leading-none">×</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setForm((f) => ({ ...f, competitors_urls: [...((f.competitors_urls || current.competitors_urls || []) as string[]), ''] }))}
          className="text-sm text-accent hover:text-accent font-medium">+ Добавить URL конкурента</button>
      </div>

      <div className="pt-2 flex gap-3">
        <button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}
          className="btn-accent px-4 py-2 rounded-xl text-sm hover:bg-accent transition disabled:opacity-50">
          {mutation.isPending ? 'Сохранение...' : 'Сохранить бриф'}
        </button>
        {saved && <span className="text-green-600 text-sm py-2">✅ Сохранено</span>}
      </div>

      {/* AI clarifying questions chat */}
      <div className="mt-8 border-t pt-6">
        <h3 className="font-semibold text-primary text-sm uppercase tracking-wide mb-3">
          🤖 ИИ-ассистент — уточняющие вопросы
        </h3>
        <p className="text-xs text-muted mb-3">
          ИИ проанализирует бриф и задаст уточняющие вопросы. Это поможет создать более точную стратегию.
        </p>

        {/* Messages */}
        {chatMessages.length > 0 && (
          <div className="space-y-3 mb-3 max-h-80 overflow-y-auto bg-surface-raised rounded-xl p-3">
            {chatMessages.map((msg, i) => (
              <div key={i} className={cx('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cx(
                  'max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'bg-accent text-white'
                    : 'bg-surface border text-primary'
                )}>
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-surface border rounded-xl px-3 py-2 text-sm text-muted">
                  ✍️ Печатает...
                </div>
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <input
            className="field flex-1"
            placeholder={chatMessages.length === 0 ? 'Нажмите «Начать» или задайте вопрос...' : 'Ваш ответ...'}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && chatInput.trim()) {
                e.preventDefault()
                const userMsg = chatInput.trim()
                setChatInput('')
                setChatMessages((prev) => [...prev, { role: 'user', content: userMsg }])
                setChatLoading(true)
                api.post(`/projects/${projectId}/brief/chat`, {
                  message: userMsg,
                  history: chatMessages,
                }).then((r) => {
                  setChatMessages((prev) => [...prev, { role: 'assistant', content: r.data.response }])
                }).finally(() => setChatLoading(false))
              }
            }}
            disabled={chatLoading}
          />
          {chatMessages.length === 0 && (
            <button
              onClick={() => {
                const msg = 'Проанализируй мой бриф и задай уточняющие вопросы.'
                setChatMessages([{ role: 'user', content: msg }])
                setChatLoading(true)
                api.post(`/projects/${projectId}/brief/chat`, {
                  message: msg,
                  history: [],
                }).then((r) => {
                  setChatMessages((prev) => [...prev, { role: 'assistant', content: r.data.response }])
                }).finally(() => setChatLoading(false))
              }}
              disabled={chatLoading}
              className="btn-accent px-4 py-2 rounded-xl text-sm hover:bg-accent transition disabled:opacity-50 whitespace-nowrap"
            >
              Начать
            </button>
          )}
          {chatMessages.length > 0 && (
            <button
              onClick={() => {
                if (!chatInput.trim()) return
                const userMsg = chatInput.trim()
                setChatInput('')
                setChatMessages((prev) => [...prev, { role: 'user', content: userMsg }])
                setChatLoading(true)
                api.post(`/projects/${projectId}/brief/chat`, {
                  message: userMsg,
                  history: chatMessages,
                }).then((r) => {
                  setChatMessages((prev) => [...prev, { role: 'assistant', content: r.data.response }])
                }).finally(() => setChatLoading(false))
              }}
              disabled={chatLoading || !chatInput.trim()}
              className="btn-accent px-4 py-2 rounded-xl text-sm hover:bg-accent transition disabled:opacity-50"
            >
              →
            </button>
          )}
          {chatMessages.length > 0 && (
            <button
              onClick={() => { setChatMessages([]); setChatInput('') }}
              className="border px-3 py-2 rounded-xl text-sm text-muted hover:bg-surface-raised"
              title="Очистить чат"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
