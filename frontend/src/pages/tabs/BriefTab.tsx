import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { projectsApi, type Brief } from '../../api/projects'
import { api } from '../../api/client'

interface ChatMessage { role: 'user' | 'assistant'; content: string }

interface ImprovedBrief {
  niche?: string
  products?: string
  price_segment?: string
  geo?: string
  target_audience?: string
  pains?: string
  usp?: string
  campaign_goal?: string
  restrictions?: string
  keyword_modifiers?: string[]
}

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-widest text-muted pt-2 pb-1">{children}</h3>
}

const BRIEF_FIELDS_WEIGHT: { key: keyof Brief; weight: number }[] = [
  { key: 'niche', weight: 10 },
  { key: 'products', weight: 15 },
  { key: 'target_audience', weight: 15 },
  { key: 'pains', weight: 10 },
  { key: 'usp', weight: 15 },
  { key: 'campaign_goal', weight: 10 },
  { key: 'monthly_budget', weight: 10 },
  { key: 'geo', weight: 5 },
  { key: 'price_segment', weight: 5 },
  { key: 'keyword_modifiers', weight: 5 },
]

function calcCompleteness(brief: Partial<Brief>): number {
  let score = 0
  for (const { key, weight } of BRIEF_FIELDS_WEIGHT) {
    const v = brief[key]
    const filled = Array.isArray(v) ? (v as string[]).length > 0 : Boolean(v)
    if (filled) score += weight
  }
  return Math.min(score, 100)
}

function CompletenessBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-400'
  const label = pct >= 80 ? 'Отличный бриф' : pct >= 50 ? 'Можно улучшить' : 'Заполните подробнее'
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted">Заполненность брифа</span>
        <span className={cx('text-xs font-semibold', pct >= 80 ? 'text-emerald-500' : pct >= 50 ? 'text-amber-500' : 'text-red-400')}>
          {pct}% — {label}
        </span>
      </div>
      <div className="h-1.5 bg-surface-raised rounded-full overflow-hidden">
        <div className={cx('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const FIELD_LABELS: Partial<Record<keyof ImprovedBrief, string>> = {
  niche: 'Ниша',
  products: 'Продукты / услуги',
  price_segment: 'Ценовой сегмент',
  geo: 'Гео',
  target_audience: 'Целевая аудитория',
  pains: 'Боли клиентов',
  usp: 'УТП',
  campaign_goal: 'Цель кампании',
  restrictions: 'Ограничения',
  keyword_modifiers: 'Коммерческие модификаторы',
}

export default function BriefTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const chatEndRef = useRef<HTMLDivElement>(null)
  const isFirstMount = useRef(true)
  const prevMessagesLen = useRef(0)

  const { data: brief, isLoading } = useQuery({
    queryKey: ['brief', projectId],
    queryFn: () => projectsApi.getBrief(projectId),
  })

  const [form, setForm] = useState<Partial<Brief>>({})
  const [saved, setSaved] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)

  // Improve brief state
  const [improveOpen, setImproveOpen] = useState(false)
  const [improved, setImproved] = useState<ImprovedBrief | null>(null)
  const [improving, setImproving] = useState(false)
  const [improveError, setImproveError] = useState('')

  // ── Chat with localStorage persistence ──────────────────────────────────────
  const CHAT_KEY = `brief-chat-${projectId}`
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try { return JSON.parse(localStorage.getItem(CHAT_KEY) || '[]') } catch { return [] }
  })
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  // Save to localStorage on message change; scroll only when new messages arrive
  useEffect(() => {
    localStorage.setItem(CHAT_KEY, JSON.stringify(chatMessages))
    if (!isFirstMount.current && chatMessages.length > prevMessagesLen.current) {
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
    prevMessagesLen.current = chatMessages.length
    isFirstMount.current = false
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
    // Pass current (possibly unsaved) form state so AI sees latest edits
    api.post(`/projects/${projectId}/brief/chat`, {
      message: userMsg,
      history: chatMessages,
      brief_snapshot: { ...brief, ...form },
    })
      .then((r) => setChatMessages([...newHistory, { role: 'assistant', content: r.data.response }]))
      .finally(() => setChatLoading(false))
  }

  const startImprove = async () => {
    setImproving(true)
    setImproveError('')
    setImproved(null)
    try {
      const r = await api.post(`/projects/${projectId}/brief/improve`)
      setImproved(r.data.improved)
      setImproveOpen(true)
    } catch (e: any) {
      setImproveError(e?.response?.data?.detail || 'Ошибка при анализе брифа')
    } finally {
      setImproving(false)
    }
  }

  const applyImproved = () => {
    if (!improved) return
    const patch: Partial<Brief> = {}
    for (const key of Object.keys(improved) as (keyof ImprovedBrief)[]) {
      const v = improved[key]
      if (v !== undefined && v !== null) {
        (patch as any)[key] = v
      }
    }
    setForm((f) => ({ ...f, ...patch }))
    setImproveOpen(false)
    setImproved(null)
  }

  if (isLoading) return <div className="p-6 text-muted">Загрузка...</div>

  const current = { ...brief, ...form }
  const completeness = calcCompleteness(current)
  const templates: { id: string; name: string; icon: string }[] = templatesData?.templates || []

  // Context-aware quick-action chips based on what's missing in the brief
  const quickChips = (() => {
    const chips: { label: string; prompt: string }[] = []
    if (!current.niche) chips.push({ label: '🏷 Определить нишу', prompt: 'Помоги определить нишу и основные направления бизнеса для этого сайта.' })
    if (!current.usp) chips.push({ label: '💡 Сформулировать УТП', prompt: 'Предложи варианты УТП (уникального торгового предложения) на основе заполненного брифа.' })
    if (!current.target_audience) chips.push({ label: '👥 Описать ЦА', prompt: 'Опиши портрет целевой аудитории для этого бизнеса.' })
    if (!current.pains) chips.push({ label: '😟 Выявить боли', prompt: 'Какие основные боли и потребности у целевой аудитории этого бизнеса?' })
    if (!current.campaign_goal) chips.push({ label: '🎯 Цель кампании', prompt: 'Что должна достичь рекламная кампания? Предложи формулировку цели.' })
    chips.push({ label: '🔍 Проанализировать бриф', prompt: 'Проанализируй бриф и скажи, чего не хватает для полноценной стратегии Яндекс Директ.' })
    chips.push({ label: '🔑 Идеи для ключевых слов', prompt: 'Предложи список базовых масок ключевых слов для Яндекс Директ на основе брифа.' })
    return chips.slice(0, 5)
  })()

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
      {/* Improve modal */}
      {improveOpen && improved && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-[var(--border)] rounded-2xl shadow-card-lg max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div>
                <p className="font-semibold text-primary">Предложения ИИ по улучшению</p>
                <p className="text-xs text-muted mt-0.5">Проверьте изменения и примените нужные</p>
              </div>
              <button onClick={() => setImproveOpen(false)} className="text-muted hover:text-primary text-xl leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-3">
              {(Object.keys(improved) as (keyof ImprovedBrief)[]).map((key) => {
                const val = improved[key]
                const oldVal = (current as any)[key]
                const label = FIELD_LABELS[key] || key
                const isArr = Array.isArray(val)
                const displayNew = isArr ? (val as string[]).join(', ') : String(val || '')
                const displayOld = Array.isArray(oldVal) ? (oldVal as string[]).join(', ') : String(oldVal || '')
                const changed = displayNew !== displayOld
                return (
                  <div key={key} className={cx('rounded-xl p-3 border', changed ? 'border-accent/40 bg-[var(--accent-subtle)]' : 'border-[var(--border)] opacity-60')}>
                    <p className="text-xs font-semibold text-muted mb-1">{label}</p>
                    {changed && displayOld && (
                      <p className="text-xs text-red-400 line-through mb-0.5">{displayOld}</p>
                    )}
                    <p className="text-sm text-primary">{displayNew || '—'}</p>
                    {!changed && <p className="text-xs text-muted mt-1">без изменений</p>}
                  </div>
                )
              })}
            </div>
            <div className="p-4 border-t border-[var(--border)] flex gap-3 justify-end">
              <button onClick={() => setImproveOpen(false)} className="border border-[var(--border)] px-4 py-2 rounded-xl text-sm hover:bg-surface-raised transition">Отмена</button>
              <button onClick={applyImproved} className="btn-accent">Применить все изменения</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6 items-start">

        {/* ── Left: Brief form ─────────────────────────────────────────────── */}
        <div className="space-y-4">
          <CompletenessBar pct={completeness} />

          {/* Section header + template picker + improve button */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <SectionTitle>О бизнесе</SectionTitle>
            <div className="flex items-center gap-2">
              <button
                onClick={startImprove}
                disabled={improving}
                className="text-xs px-3 py-1.5 border border-accent/50 rounded-xl text-accent hover:bg-[var(--accent-subtle)] transition disabled:opacity-50"
              >
                {improving ? '⏳ Анализирую...' : '✨ Улучшить бриф'}
              </button>
              {improveError && <span className="text-xs text-red-400">{improveError}</span>}
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

          {/* Коммерческие модификаторы (горячие ключи) */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Коммерческие модификаторы ключей</label>
            <p className="text-xs text-muted mb-2">Слова, которые добавляются к базовым ключам для поиска горячего спроса: купить, оптом, цена и т.д.</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {((current.keyword_modifiers as string[]) || []).map((mod, i) => (
                <span key={i} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                  {mod}
                  <button type="button"
                    onClick={() => setForm((f) => ({ ...f, keyword_modifiers: ((f.keyword_modifiers || current.keyword_modifiers || []) as string[]).filter((_, j) => j !== i) }))}
                    className="hover:text-red-400 font-bold leading-none ml-0.5">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input id="mod_input" className="field flex-1" placeholder="Введите модификатор и нажмите +"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const v = (e.target as HTMLInputElement).value.trim()
                    if (v) {
                      setForm((f) => ({ ...f, keyword_modifiers: [...((f.keyword_modifiers || current.keyword_modifiers || []) as string[]), v] }))
                      ;(e.target as HTMLInputElement).value = ''
                    }
                  }
                }} />
              <button type="button"
                className="border border-[var(--border)] px-3 py-2 rounded-xl text-sm hover:bg-surface-raised transition"
                onClick={() => {
                  const inp = document.getElementById('mod_input') as HTMLInputElement
                  const v = inp?.value.trim()
                  if (v) { setForm((f) => ({ ...f, keyword_modifiers: [...((f.keyword_modifiers || current.keyword_modifiers || []) as string[]), v] })); inp.value = '' }
                }}>+</button>
            </div>
          </div>

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
                  <p className="text-xs text-muted">Помогает заполнить бриф</p>
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
                <div className="flex flex-col items-center justify-center h-full gap-4 px-2">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-2xl bg-surface-raised flex items-center justify-center text-2xl mx-auto mb-2">🤖</div>
                    <p className="text-sm text-muted">
                      ИИ видит текущее состояние брифа и поможет его улучшить.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center w-full">
                    {quickChips.map((chip) => (
                      <button
                        key={chip.prompt}
                        onClick={() => sendChat(chip.prompt)}
                        disabled={chatLoading}
                        className="text-xs px-3 py-1.5 border border-[var(--border)] rounded-full text-primary hover:bg-surface-raised hover:border-accent/50 transition disabled:opacity-50 whitespace-nowrap"
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={cx('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cx(
                    'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'text-white rounded-br-sm'
                      : 'bg-surface-raised text-primary rounded-bl-sm border border-[var(--border)]'
                  )}
                  style={msg.role === 'user' ? { background: 'var(--accent)' } : undefined}>
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-strong:text-primary prose-headings:text-primary">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
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

            {/* Input — always visible */}
            <div className="p-3 border-t border-[var(--border)] shrink-0">
              {chatMessages.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {quickChips.slice(0, 3).map((chip) => (
                    <button
                      key={chip.prompt}
                      onClick={() => sendChat(chip.prompt)}
                      disabled={chatLoading}
                      className="text-xs px-2.5 py-1 border border-[var(--border)] rounded-full text-muted hover:text-primary hover:border-accent/50 transition disabled:opacity-50 whitespace-nowrap"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  rows={2}
                  className="field flex-1 resize-none text-sm py-2"
                  placeholder="Ваш вопрос или ответ..."
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
              <p className="text-xs text-muted mt-1.5 px-0.5">Enter — отправить · Shift+Enter — перенос</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
