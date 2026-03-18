import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi, type Brief } from '../../api/projects'
import { api } from '../../api/client'

interface ChatMessage { role: 'user' | 'assistant'; content: string }

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-widest text-muted pt-2 pb-1">{children}</h3>
}

export default function BriefTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const chatEndRef = useRef<HTMLDivElement>(null)

  const { data: brief, isLoading } = useQuery({
    queryKey: ['brief', projectId],
    queryFn: () => projectsApi.getBrief(projectId),
  })

  const [form, setForm] = useState<Partial<Brief>>({})
  const [saved, setSaved] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)

  // ── Chat with localStorage persistence ──────────────────────────────────────
  const CHAT_KEY = `brief-chat-${projectId}`
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try { return JSON.parse(localStorage.getItem(CHAT_KEY) || '[]') } catch { return [] }
  })
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  useEffect(() => {
    localStorage.setItem(CHAT_KEY, JSON.stringify(chatMessages))
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [chatMessages, CHAT_KEY])

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
    setForm((f) => ({ ...f, ...(r.data.data as Partial<Brief>) }))
    setShowTemplates(false)
  }

  const sendChat = (msg: string) => {
    if (!msg.trim() || chatLoading) return
    const userMsg = msg.trim()
    setChatInput('')
    const newHistory = [...chatMessages, { role: 'user' as const, content: userMsg }]
    setChatMessages(newHistory)
    setChatLoading(true)
    api.post(`/projects/${projectId}/brief/chat`, { message: userMsg, history: chatMessages })
      .then((r) => setChatMessages([...newHistory, { role: 'assistant', content: r.data.response }]))
      .finally(() => setChatLoading(false))
  }

  if (isLoading) return <div className="p-6 text-muted">Загрузка...</div>

  const current = { ...brief, ...form }
  const templates: { id: string; name: string; icon: string }[] = templatesData?.templates || []

  const field = (key: keyof Brief, label: string, multiline = false) => (
    <div key={key}>
      <label className="block text-xs font-medium text-muted mb-1.5">{label}</label>
      {multiline ? (
        <textarea rows={3} className="field resize-none"
          value={(current[key] as string) || ''}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
      ) : (
        <input className="field"
          value={(current[key] as string) || ''}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
      )}
    </div>
  )

  return (
    <div className="p-6 max-w-7xl">
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6 items-start">

        {/* ── Left: Brief form ─────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Section header + template picker */}
          <div className="flex items-center justify-between">
            <SectionTitle>О бизнесе</SectionTitle>
            <div className="relative">
              <button
                onClick={() => setShowTemplates((v) => !v)}
                className="text-xs px-3 py-1.5 border border-[var(--border)] rounded-xl text-muted hover:bg-surface-raised transition"
              >
                📋 Шаблон по нише
              </button>
              {showTemplates && templates.length > 0 && (
                <div className="absolute right-0 top-full mt-1 bg-surface border border-[var(--border)] rounded-xl shadow-card-lg z-20 w-56 py-1 overflow-hidden">
                  {templates.map((t) => (
                    <button key={t.id} onClick={() => applyTemplate(t.id)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-surface-raised flex items-center gap-2 transition">
                      <span>{t.icon}</span> {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {field('niche', 'Ниша / тематика')}
          {field('products', 'Продукты / услуги', true)}

          <div className="grid grid-cols-2 gap-3">
            {field('price_segment', 'Ценовой сегмент')}
            {field('geo', 'Гео работы бизнеса')}
          </div>

          <SectionTitle>Целевая аудитория</SectionTitle>
          {field('target_audience', 'Кто покупает', true)}
          {field('pains', 'Боли клиентов', true)}

          <SectionTitle>УТП</SectionTitle>
          {field('usp', 'Главные преимущества', true)}

          <SectionTitle>Реклама</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {field('campaign_goal', 'Цель кампании')}
            {field('monthly_budget', 'Месячный бюджет (₽)')}
          </div>
          {field('restrictions', 'Ограничения', true)}
          {field('excluded_geo', 'Исключить гео')}

          {/* Гео таргетинг */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Гео таргетинг (города)</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {((current.ad_geo as string[]) || []).map((city, i) => (
                <span key={i} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                      style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}>
                  {city}
                  <button type="button"
                    onClick={() => setForm((f) => ({ ...f, ad_geo: ((f.ad_geo || current.ad_geo || []) as string[]).filter((_, j) => j !== i) }))}
                    className="hover:text-red-400 font-bold leading-none ml-0.5">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input id="ad_geo_input" className="field flex-1" placeholder="Введите город и нажмите +"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const v = (e.target as HTMLInputElement).value.trim()
                    if (v) { setForm((f) => ({ ...f, ad_geo: [...((f.ad_geo || current.ad_geo || []) as string[]), v] }));(e.target as HTMLInputElement).value = '' }
                  }
                }} />
              <button type="button"
                className="border border-[var(--border)] px-3 py-2 rounded-xl text-sm hover:bg-surface-raised transition"
                onClick={() => {
                  const inp = document.getElementById('ad_geo_input') as HTMLInputElement
                  const v = inp?.value.trim()
                  if (v) { setForm((f) => ({ ...f, ad_geo: [...((f.ad_geo || current.ad_geo || []) as string[]), v] })); inp.value = '' }
                }}>+</button>
            </div>
          </div>

          {/* Конкуренты */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Конкуренты (URL)</label>
            <div className="space-y-1.5 mb-2">
              {((current.competitors_urls as string[]) || []).map((url, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="field flex-1 font-mono py-1.5" value={url}
                    onChange={(e) => setForm((f) => {
                      const arr = [...((f.competitors_urls || current.competitors_urls || []) as string[])]
                      arr[i] = e.target.value
                      return { ...f, competitors_urls: arr }
                    })} />
                  <button type="button"
                    onClick={() => setForm((f) => ({ ...f, competitors_urls: ((f.competitors_urls || current.competitors_urls || []) as string[]).filter((_, j) => j !== i) }))}
                    className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                </div>
              ))}
            </div>
            <button type="button"
              onClick={() => setForm((f) => ({ ...f, competitors_urls: [...((f.competitors_urls || current.competitors_urls || []) as string[]), ''] }))}
              className="text-sm text-accent hover:opacity-70 transition">
              + Добавить URL конкурента
            </button>
          </div>

          {/* Save */}
          <div className="pt-2 flex items-center gap-3">
            <button onClick={() => mutation.mutate(form)} disabled={mutation.isPending} className="btn-accent">
              {mutation.isPending ? 'Сохранение...' : 'Сохранить бриф'}
            </button>
            {saved && <span className="text-emerald-500 text-sm">✓ Сохранено</span>}
          </div>
        </div>

        {/* ── Right: AI chat (sticky, full-height) ──────────────────────────── */}
        <div className="xl:sticky xl:top-4">
          <div className="card-bordered overflow-hidden flex flex-col"
               style={{ height: 'calc(100vh - 10rem)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-surface-raised shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-base">🤖</span>
                <div>
                  <p className="text-sm font-semibold text-primary">ИИ-ассистент</p>
                  <p className="text-xs text-muted">Уточняющие вопросы по брифу</p>
                </div>
              </div>
              {chatMessages.length > 0 && (
                <button
                  onClick={() => { setChatMessages([]); setChatInput('') }}
                  className="text-xs text-muted hover:text-red-400 transition px-2 py-1 rounded-lg hover:bg-surface-raised"
                  title="Очистить историю"
                >
                  ✕ Очистить
                </button>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-surface-raised flex items-center justify-center text-2xl">🤖</div>
                  <p className="text-sm text-muted">
                    ИИ проанализирует бриф и задаст уточняющие вопросы для создания более точной стратегии.
                  </p>
                  <button
                    onClick={() => sendChat('Проанализируй мой бриф и задай уточняющие вопросы.')}
                    disabled={chatLoading}
                    className="btn-accent text-sm"
                  >
                    Начать анализ
                  </button>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={cx('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cx(
                    'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed',
                    msg.role === 'user'
                      ? 'text-white rounded-br-sm'
                      : 'bg-surface-raised text-primary rounded-bl-sm border border-[var(--border)]'
                  )}
                  style={msg.role === 'user' ? { background: 'var(--accent)' } : undefined}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-surface-raised border border-[var(--border)] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm text-muted flex items-center gap-1.5">
                    <span className="inline-flex gap-0.5">
                      {[0,1,2].map(n => <span key={n} className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: `${n * 0.15}s` }} />)}
                    </span>
                    Печатает...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            {chatMessages.length > 0 && (
              <div className="p-3 border-t border-[var(--border)] shrink-0">
                <div className="flex items-end gap-2">
                  <textarea
                    rows={2}
                    className="field flex-1 resize-none text-sm py-2"
                    placeholder="Ваш ответ..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(chatInput) }
                    }}
                    disabled={chatLoading}
                  />
                  <button
                    onClick={() => sendChat(chatInput)}
                    disabled={chatLoading || !chatInput.trim()}
                    className="btn-accent p-2.5 rounded-xl shrink-0"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                      <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />
                    </svg>
                  </button>
                </div>
                <p className="text-xs text-muted mt-1.5 px-0.5">Enter — отправить · Shift+Enter — перенос · История сохраняется</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
