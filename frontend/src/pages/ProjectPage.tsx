import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi, Brief } from '../api/projects'
import { api } from '../api/client'
import { directApi, type Campaign, type AdGroup, type Keyword, type Ad, type NegativeKeyword } from '../api/direct'
import { seoApi, type SeoPage, type ChecklistItem } from '../api/seo'

type Tab = 'overview' | 'brief' | 'crawl' | 'direct' | 'seo' | 'export'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

function CharBadge({ len, max }: { len: number; max: number }) {
  const ok = len <= max
  return (
    <span className={cx('text-xs font-mono px-1.5 py-0.5 rounded', ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>
      {len}/{max}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    active: 'bg-green-100 text-green-700',
    paused: 'bg-yellow-100 text-yellow-700',
    ready: 'bg-blue-100 text-blue-700',
    review: 'bg-purple-100 text-purple-700',
    low_frequency: 'bg-red-100 text-red-600',
  }
  return (
    <span className={cx('text-xs px-2 py-0.5 rounded-full font-medium', colors[status] || 'bg-gray-100 text-gray-600')}>
      {status}
    </span>
  )
}

function TempBadge({ temp }: { temp: string | null }) {
  if (!temp) return null
  const map: Record<string, [string, string]> = {
    hot: ['bg-red-100 text-red-700', '🔥 горячие'],
    warm: ['bg-orange-100 text-orange-700', '☀️ тёплые'],
    cold: ['bg-blue-100 text-blue-700', '❄️ холодные'],
  }
  const [cls, label] = map[temp] || ['bg-gray-100 text-gray-600', temp]
  return <span className={cx('text-xs px-2 py-0.5 rounded-full font-medium', cls)}>{label}</span>
}

// ─── Brief Tab ────────────────────────────────────────────────────────────────

function BriefTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const { data: brief, isLoading } = useQuery({
    queryKey: ['brief', projectId],
    queryFn: () => projectsApi.getBrief(projectId),
  })
  const [form, setForm] = useState<Partial<Brief>>({})
  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: (data: Partial<Brief>) => projectsApi.updateBrief(projectId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brief', projectId] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  if (isLoading) return <div className="p-4 text-gray-500">Загрузка...</div>

  const current = { ...brief, ...form }
  const field = (key: keyof Brief, label: string, multiline = false) => (
    <div key={key}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {multiline ? (
        <textarea rows={3} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          value={(current[key] as string) || ''}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
      ) : (
        <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          value={(current[key] as string) || ''}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
      )}
    </div>
  )

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">О бизнесе</h3>
      {field('niche', 'Ниша / тематика')}
      {field('products', 'Продукты / услуги', true)}
      {field('price_segment', 'Ценовой сегмент')}
      {field('geo', 'Гео работы бизнеса')}
      <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide pt-2">Целевая аудитория</h3>
      {field('target_audience', 'Кто покупает', true)}
      {field('pains', 'Боли клиентов', true)}
      <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide pt-2">УТП</h3>
      {field('usp', 'Главные преимущества', true)}
      <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide pt-2">Реклама</h3>
      {field('campaign_goal', 'Цель кампании')}
      {field('monthly_budget', 'Месячный бюджет (₽)')}
      {field('restrictions', 'Ограничения', true)}
      <div className="pt-2 flex gap-3">
        <button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 transition disabled:opacity-50">
          {mutation.isPending ? 'Сохранение...' : 'Сохранить бриф'}
        </button>
        {saved && <span className="text-green-600 text-sm py-2">✅ Сохранено</span>}
      </div>
    </div>
  )
}

// ─── Crawl Tab ────────────────────────────────────────────────────────────────

function CrawlTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const { data: status } = useQuery({
    queryKey: ['crawl-status', projectId],
    queryFn: () => api.get(`/projects/${projectId}/crawl/status`).then((r) => r.data),
    refetchInterval: (q) => (q.state.data as any)?.status === 'running' ? 2000 : false,
  })
  const startMutation = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/crawl/start`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crawl-status', projectId] }),
  })
  const { data: report } = useQuery({
    queryKey: ['crawl-report', projectId],
    queryFn: () => api.get(`/projects/${projectId}/crawl/report`).then((r) => r.data),
    enabled: status?.status === 'done',
  })

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <h3 className="font-semibold">Парсинг сайта</h3>
        <button onClick={() => startMutation.mutate()}
          disabled={startMutation.isPending || status?.status === 'running'}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 transition disabled:opacity-50">
          {status?.status === 'running' ? '⏳ Парсинг...' : 'Запустить парсинг'}
        </button>
      </div>
      {status && status.status !== 'not_started' && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span>Статус: <strong>{status.status}</strong></span>
            <span>{status.pages_done} / {status.pages_total} страниц</span>
          </div>
          {status.status === 'running' && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-primary-600 h-2 rounded-full transition-all"
                style={{ width: `${status.pages_total ? Math.round((status.pages_done / status.pages_total) * 100) : 0}%` }} />
            </div>
          )}
          {status.error && <p className="text-red-500 text-sm mt-2">{status.error}</p>}
        </div>
      )}
      {report && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-gray-700 mb-3">Отчёт</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              { label: 'Всего страниц', value: report.pages_total },
              { label: 'Без title', value: report.no_title, bad: report.no_title > 0 },
              { label: 'Без description', value: report.no_description, bad: report.no_description > 0 },
              { label: 'Без H1', value: report.no_h1, bad: report.no_h1 > 0 },
              { label: 'noindex страниц', value: report.noindex_pages, bad: report.noindex_pages > 0 },
              { label: 'Медленных (>3с)', value: report.slow_pages, bad: report.slow_pages > 0 },
              { label: 'Картинок без alt', value: report.images_without_alt, bad: report.images_without_alt > 0 },
            ].map((item) => (
              <div key={item.label} className={cx('bg-white rounded-lg p-3 border', (item as any).bad ? 'border-red-200' : 'border-gray-200')}>
                <p className="text-gray-500">{item.label}</p>
                <p className={cx('text-lg font-semibold', (item as any).bad ? 'text-red-600' : 'text-gray-900')}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Direct: Ad Card ─────────────────────────────────────────────────────────

function AdCard({ ad, onUpdate }: { ad: Ad; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    headline1: ad.headline1 || '',
    headline2: ad.headline2 || '',
    headline3: ad.headline3 || '',
    text: ad.text || '',
    display_url: ad.display_url || '',
    utm: ad.utm || '',
    status: ad.status,
  })
  const saveMutation = useMutation({
    mutationFn: () => directApi.updateAd(ad.id, form),
    onSuccess: () => { setEditing(false); onUpdate() },
  })

  if (!editing) {
    return (
      <div className={cx('border rounded-lg p-3 bg-white text-sm', !ad.valid && 'border-red-200')}>
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs text-gray-500">Вариант {ad.variant}</span>
          <div className="flex gap-2 items-center">
            <StatusBadge status={ad.status} />
            {!ad.valid && <span className="text-xs text-red-500">⚠️ лимит</span>}
            <button onClick={() => setEditing(true)} className="text-xs text-primary-600 hover:underline">✏️</button>
          </div>
        </div>
        <p className="font-medium text-gray-800 leading-snug">{ad.headline1}{ad.headline2 ? ` | ${ad.headline2}` : ''}{ad.headline3 ? ` | ${ad.headline3}` : ''}</p>
        <p className="text-gray-600 mt-1 text-xs">{ad.text}</p>
        {ad.display_url && <p className="text-gray-400 text-xs mt-1">🔗 {ad.display_url}</p>}
        <div className="flex gap-2 mt-2 flex-wrap">
          <CharBadge len={ad.headline1_len} max={56} />
          <CharBadge len={ad.headline2_len} max={30} />
          {ad.headline3 && <CharBadge len={ad.headline3_len} max={30} />}
          <CharBadge len={ad.text_len} max={81} />
        </div>
      </div>
    )
  }

  return (
    <div className="border border-primary-200 rounded-lg p-3 bg-blue-50 text-sm space-y-2">
      {[
        { key: 'headline1', label: 'Заголовок 1', max: 56 },
        { key: 'headline2', label: 'Заголовок 2', max: 30 },
        { key: 'headline3', label: 'Заголовок 3 (опц.)', max: 30 },
      ].map(({ key, label, max }) => (
        <div key={key}>
          <div className="flex justify-between mb-0.5">
            <label className="text-xs text-gray-600">{label}</label>
            <CharBadge len={(form as any)[key].length} max={max} />
          </div>
          <input className="w-full border rounded px-2 py-1 text-sm bg-white"
            value={(form as any)[key]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
        </div>
      ))}
      <div>
        <div className="flex justify-between mb-0.5">
          <label className="text-xs text-gray-600">Текст объявления</label>
          <CharBadge len={form.text.length} max={81} />
        </div>
        <textarea rows={2} className="w-full border rounded px-2 py-1 text-sm bg-white"
          value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} />
      </div>
      <input className="w-full border rounded px-2 py-1 text-sm bg-white" placeholder="Отображаемый URL"
        value={form.display_url} onChange={(e) => setForm((f) => ({ ...f, display_url: e.target.value }))} />
      <input className="w-full border rounded px-2 py-1 text-sm bg-white" placeholder="UTM-метки"
        value={form.utm} onChange={(e) => setForm((f) => ({ ...f, utm: e.target.value }))} />
      <div className="flex gap-2 items-center">
        <select className="border rounded px-2 py-1 text-sm bg-white"
          value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
          <option value="draft">draft</option>
          <option value="ready">ready</option>
          <option value="review">review</option>
        </select>
        <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
          className="bg-primary-600 text-white px-3 py-1 rounded text-sm hover:bg-primary-700 disabled:opacity-50">
          {saveMutation.isPending ? '...' : 'Сохранить'}
        </button>
        <button onClick={() => setEditing(false)} className="border px-3 py-1 rounded text-sm hover:bg-white">Отмена</button>
      </div>
    </div>
  )
}

// ─── Direct: Group Content ────────────────────────────────────────────────────

function GroupContent({ group }: { group: AdGroup }) {
  const qc = useQueryClient()
  const [subtab, setSubtab] = useState<'keywords' | 'ads'>('keywords')
  const [newKw, setNewKw] = useState('')
  const [newKwTemp, setNewKwTemp] = useState('warm')

  const { data: keywords = [] } = useQuery({
    queryKey: ['keywords', group.id],
    queryFn: () => directApi.getKeywords(group.id),
  })
  const { data: ads = [] } = useQuery({
    queryKey: ['ads', group.id],
    queryFn: () => directApi.getAds(group.id),
  })

  const genKwMut = useMutation({
    mutationFn: () => directApi.generateKeywords(group.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['keywords', group.id] }),
  })
  const checkFreqMut = useMutation({
    mutationFn: () => directApi.checkFrequencies(group.id),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['keywords', group.id] }), 5000),
  })
  const addKwMut = useMutation({
    mutationFn: () => directApi.addKeyword(group.id, newKw.trim(), newKwTemp),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['keywords', group.id] }); setNewKw('') },
  })
  const delKwMut = useMutation({
    mutationFn: (id: string) => directApi.deleteKeyword(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['keywords', group.id] }),
  })
  const genAdsMut = useMutation({
    mutationFn: () => directApi.generateAds(group.id, 2),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ads', group.id] }),
  })

  return (
    <div className="mt-2 ml-6 border-l-2 border-gray-100 pl-4">
      <div className="flex gap-1 mb-3">
        {(['keywords', 'ads'] as const).map((t) => (
          <button key={t} onClick={() => setSubtab(t)}
            className={cx('px-3 py-1 text-sm rounded-md transition',
              subtab === t ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
            {t === 'keywords' ? `Ключи (${(keywords as Keyword[]).length})` : `Объявления (${(ads as Ad[]).length})`}
          </button>
        ))}
      </div>

      {subtab === 'keywords' && (
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => genKwMut.mutate()} disabled={genKwMut.isPending}
              className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
              {genKwMut.isPending ? '⏳...' : '✨ Сгенерировать ключи'}
            </button>
            <button onClick={() => checkFreqMut.mutate()} disabled={checkFreqMut.isPending}
              className="border border-gray-300 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
              {checkFreqMut.isPending ? '⏳...' : '📊 Проверить частоты'}
            </button>
          </div>
          {genKwMut.isSuccess && <p className="text-xs text-green-600">✅ Добавлено: {(genKwMut.data as any)?.keywords_created}</p>}
          {checkFreqMut.isSuccess && <p className="text-xs text-blue-600">⏳ Задача запущена, частоты обновятся через ~30с</p>}
          <div className="space-y-1">
            {(keywords as Keyword[]).map((kw) => (
              <div key={kw.id} className="flex items-center gap-2 py-1.5 px-2 bg-white border rounded text-sm hover:bg-gray-50">
                <TempBadge temp={kw.temperature} />
                <span className="flex-1 font-mono text-xs">{kw.phrase}</span>
                {kw.frequency !== null && (
                  <span className="text-xs text-gray-500 tabular-nums w-16 text-right">{kw.frequency.toLocaleString()}</span>
                )}
                <StatusBadge status={kw.status} />
                <button onClick={() => delKwMut.mutate(kw.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
              </div>
            ))}
            {(keywords as Keyword[]).length === 0 && (
              <p className="text-sm text-gray-400 py-2 text-center">Нет ключей — нажмите «Сгенерировать»</p>
            )}
          </div>
          <div className="flex gap-2">
            <input className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Добавить ключ вручную..."
              value={newKw}
              onKeyDown={(e) => e.key === 'Enter' && newKw.trim() && addKwMut.mutate()}
              onChange={(e) => setNewKw(e.target.value)} />
            <select className="border rounded-lg px-2 py-1.5 text-sm"
              value={newKwTemp} onChange={(e) => setNewKwTemp(e.target.value)}>
              <option value="hot">🔥</option>
              <option value="warm">☀️</option>
              <option value="cold">❄️</option>
            </select>
            <button onClick={() => newKw.trim() && addKwMut.mutate()} disabled={!newKw.trim() || addKwMut.isPending}
              className="bg-gray-700 text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-50">+</button>
          </div>
        </div>
      )}

      {subtab === 'ads' && (
        <div className="space-y-2">
          <button onClick={() => genAdsMut.mutate()} disabled={genAdsMut.isPending}
            className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
            {genAdsMut.isPending ? '⏳ Генерация...' : '✨ Сгенерировать 2 варианта'}
          </button>
          {(ads as Ad[]).map((ad) => (
            <AdCard key={ad.id} ad={ad} onUpdate={() => qc.invalidateQueries({ queryKey: ['ads', group.id] })} />
          ))}
          {(ads as Ad[]).length === 0 && (
            <p className="text-sm text-gray-400 py-2 text-center">Нет объявлений — нажмите «Сгенерировать»</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Direct: Campaign Block ───────────────────────────────────────────────────

function CampaignBlock({ campaign, projectId }: { campaign: Campaign; projectId: string }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    name: campaign.name,
    type: campaign.type || '',
    budget_monthly: campaign.budget_monthly?.toString() || '',
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['groups', campaign.id],
    queryFn: () => directApi.getGroups(campaign.id),
    enabled: expanded,
  })

  const createGroupMut = useMutation({
    mutationFn: () => directApi.createGroup(campaign.id, newGroupName.trim() || 'Новая группа'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups', campaign.id] }); setNewGroupName(''); setAddingGroup(false) },
  })
  const updateMut = useMutation({
    mutationFn: () => directApi.updateCampaign(campaign.id, {
      name: editForm.name,
      type: editForm.type || undefined,
      budget_monthly: editForm.budget_monthly ? Number(editForm.budget_monthly) : undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns', projectId] }); setEditing(false) },
  })
  const deleteMut = useMutation({
    mutationFn: () => directApi.deleteCampaign(campaign.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns', projectId] }),
  })

  const toggleGroup = (id: string) =>
    setExpandedGroups((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className="border rounded-lg bg-white">
      <div className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50 select-none"
        onClick={() => !editing && setExpanded((v) => !v)}>
        <span className="text-gray-400 text-xs w-3">{expanded ? '▼' : '▶'}</span>
        {editing ? (
          <div className="flex gap-2 flex-1 items-center" onClick={(e) => e.stopPropagation()}>
            <input className="border rounded px-2 py-1 text-sm flex-1 min-w-0"
              value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            <input className="border rounded px-2 py-1 text-sm w-28" placeholder="Тип (search)"
              value={editForm.type} onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value }))} />
            <input type="number" className="border rounded px-2 py-1 text-sm w-24" placeholder="Бюджет ₽"
              value={editForm.budget_monthly} onChange={(e) => setEditForm((f) => ({ ...f, budget_monthly: e.target.value }))} />
            <button onClick={() => updateMut.mutate()} disabled={updateMut.isPending}
              className="bg-primary-600 text-white px-2 py-1 rounded text-xs hover:bg-primary-700 disabled:opacity-50">💾</button>
            <button onClick={() => setEditing(false)} className="border px-2 py-1 rounded text-xs">✕</button>
          </div>
        ) : (
          <>
            <span className="font-medium text-sm flex-1 min-w-0 truncate">{campaign.name}</span>
            {campaign.type && <span className="text-xs text-gray-500 shrink-0">{campaign.type}</span>}
            {campaign.budget_monthly && (
              <span className="text-xs text-gray-500 shrink-0">{Number(campaign.budget_monthly).toLocaleString()} ₽/мес</span>
            )}
            <StatusBadge status={campaign.status} />
            <button onClick={(e) => { e.stopPropagation(); setEditing(true) }}
              className="text-gray-400 hover:text-gray-700 text-xs shrink-0 ml-1">✏️</button>
            <button onClick={(e) => { e.stopPropagation(); if (confirm(`Удалить кампанию "${campaign.name}"?`)) deleteMut.mutate() }}
              className="text-red-400 hover:text-red-600 text-xs shrink-0">🗑</button>
          </>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t bg-gray-50 pt-3 space-y-2">
          {(groups as AdGroup[]).map((g) => (
            <div key={g.id} className="border rounded-lg bg-white">
              <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 select-none"
                onClick={() => toggleGroup(g.id)}>
                <span className="text-gray-400 text-xs w-3">{expandedGroups.has(g.id) ? '▼' : '▶'}</span>
                <span className="text-sm font-medium flex-1">{g.name}</span>
                <StatusBadge status={g.status} />
              </div>
              {expandedGroups.has(g.id) && (
                <div className="px-3 pb-3 border-t bg-gray-50">
                  <GroupContent group={g} />
                </div>
              )}
            </div>
          ))}

          {(groups as AdGroup[]).length === 0 && !addingGroup && (
            <p className="text-sm text-gray-400">Нет групп объявлений</p>
          )}

          {addingGroup ? (
            <div className="flex gap-2">
              <input autoFocus className="flex-1 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Название группы..."
                value={newGroupName}
                onKeyDown={(e) => e.key === 'Enter' && createGroupMut.mutate()}
                onChange={(e) => setNewGroupName(e.target.value)} />
              <button onClick={() => createGroupMut.mutate()} disabled={createGroupMut.isPending}
                className="bg-primary-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50">Создать</button>
              <button onClick={() => setAddingGroup(false)} className="border px-3 py-1.5 rounded text-sm">✕</button>
            </div>
          ) : (
            <button onClick={() => setAddingGroup(true)}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium">+ Добавить группу</button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Direct Tab ───────────────────────────────────────────────────────────────

function DirectTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [strategyOpen, setStrategyOpen] = useState(true)
  const [editingStrategy, setEditingStrategy] = useState(false)
  const [strategyText, setStrategyText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [addingCampaign, setAddingCampaign] = useState(false)
  const [newCampaignName, setNewCampaignName] = useState('')
  const [negInput, setNegInput] = useState('')

  const { data: strategyData, refetch: refetchStrategy } = useQuery({
    queryKey: ['direct-strategy', projectId],
    queryFn: () => directApi.getStrategy(projectId),
    refetchInterval: isGenerating ? 3000 : false,
  })

  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns', projectId],
    queryFn: () => directApi.getCampaigns(projectId),
  })

  const { data: negKws = [] } = useQuery({
    queryKey: ['neg-kws', projectId],
    queryFn: () => directApi.getNegativeKeywords(projectId),
  })

  const genStrategyMut = useMutation({
    mutationFn: () => directApi.generateStrategy(projectId),
    onSuccess: () => {
      setIsGenerating(true)
      const interval = setInterval(() => {
        refetchStrategy().then((r: any) => {
          if (r.data?.strategy_text) { setIsGenerating(false); clearInterval(interval) }
        })
      }, 4000)
      setTimeout(() => { setIsGenerating(false); clearInterval(interval) }, 120000)
    },
  })
  const updateStrategyMut = useMutation({
    mutationFn: () => directApi.updateStrategy(projectId, strategyText),
    onSuccess: () => { setEditingStrategy(false); qc.invalidateQueries({ queryKey: ['direct-strategy', projectId] }) },
  })
  const createCampaignMut = useMutation({
    mutationFn: () => directApi.createCampaign(projectId, { name: newCampaignName.trim() || 'Новая кампания' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns', projectId] }); setNewCampaignName(''); setAddingCampaign(false) },
  })
  const genNegMut = useMutation({
    mutationFn: () => directApi.generateNegativeKeywords(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['neg-kws', projectId] }),
  })
  const addNegMut = useMutation({
    mutationFn: () => directApi.addNegativeKeyword(projectId, negInput.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['neg-kws', projectId] }); setNegInput('') },
  })
  const delNegMut = useMutation({
    mutationFn: (id: string) => directApi.deleteNegativeKeyword(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['neg-kws', projectId] }),
  })

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Strategy */}
      <div className="border rounded-lg bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b cursor-pointer hover:bg-gray-50"
          onClick={() => setStrategyOpen((v) => !v)}>
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-xs w-3">{strategyOpen ? '▼' : '▶'}</span>
            <h3 className="font-semibold">Стратегия</h3>
            {isGenerating && <span className="text-xs text-blue-500 animate-pulse">⏳ генерируется...</span>}
          </div>
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            {strategyData?.strategy_text && !editingStrategy && (
              <button onClick={() => { setStrategyText(strategyData.strategy_text || ''); setEditingStrategy(true) }}
                className="text-sm border px-3 py-1 rounded-lg hover:bg-gray-50">✏️ Редактировать</button>
            )}
            <button onClick={() => genStrategyMut.mutate()} disabled={genStrategyMut.isPending || isGenerating}
              className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
              {genStrategyMut.isPending || isGenerating ? '⏳ Генерация...' : '✨ Сгенерировать'}
            </button>
          </div>
        </div>
        {strategyOpen && (
          <div className="p-4">
            {editingStrategy ? (
              <div className="space-y-2">
                <textarea rows={14} className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={strategyText} onChange={(e) => setStrategyText(e.target.value)} />
                <div className="flex gap-2">
                  <button onClick={() => updateStrategyMut.mutate()} disabled={updateStrategyMut.isPending}
                    className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                    {updateStrategyMut.isPending ? 'Сохранение...' : 'Сохранить'}
                  </button>
                  <button onClick={() => setEditingStrategy(false)} className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Отмена</button>
                </div>
              </div>
            ) : strategyData?.strategy_text ? (
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{strategyData.strategy_text}</pre>
            ) : (
              <p className="text-gray-400 text-sm py-4 text-center">
                Стратегия не сгенерирована. Нажмите «Сгенерировать» — ИИ составит структуру кампаний на основе брифа и данных сайта.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Campaigns */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Кампании ({(campaigns as Campaign[]).length})</h3>
          <button onClick={() => setAddingCampaign(true)}
            className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700">
            + Кампания
          </button>
        </div>
        {addingCampaign && (
          <div className="flex gap-2 mb-3">
            <input autoFocus className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Название кампании..."
              value={newCampaignName}
              onKeyDown={(e) => e.key === 'Enter' && createCampaignMut.mutate()}
              onChange={(e) => setNewCampaignName(e.target.value)} />
            <button onClick={() => createCampaignMut.mutate()} disabled={createCampaignMut.isPending}
              className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">Создать</button>
            <button onClick={() => setAddingCampaign(false)} className="border px-4 py-2 rounded-lg text-sm">✕</button>
          </div>
        )}
        <div className="space-y-2">
          {(campaigns as Campaign[]).map((c) => <CampaignBlock key={c.id} campaign={c} projectId={projectId} />)}
          {(campaigns as Campaign[]).length === 0 && (
            <div className="text-center py-10 text-gray-400 border-2 border-dashed rounded-lg">
              <p>Нет кампаний. Сгенерируйте стратегию — она создаст структуру автоматически, или добавьте кампанию вручную.</p>
            </div>
          )}
        </div>
      </div>

      {/* Negative keywords */}
      <div className="border rounded-lg bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Минус-слова ({(negKws as NegativeKeyword[]).length})</h3>
          <button onClick={() => genNegMut.mutate()} disabled={genNegMut.isPending}
            className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
            {genNegMut.isPending ? '⏳...' : '✨ Сгенерировать'}
          </button>
        </div>
        <div className="flex gap-2 mb-3">
          <input className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Добавить минус-слово..."
            value={negInput}
            onKeyDown={(e) => e.key === 'Enter' && negInput.trim() && addNegMut.mutate()}
            onChange={(e) => setNegInput(e.target.value)} />
          <button onClick={() => negInput.trim() && addNegMut.mutate()} disabled={!negInput.trim() || addNegMut.isPending}
            className="bg-gray-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">+</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(negKws as NegativeKeyword[]).map((nk) => (
            <span key={nk.id} className="inline-flex items-center gap-1 bg-red-50 border border-red-200 text-red-700 text-xs px-2 py-1 rounded-full">
              -{nk.phrase}
              <button onClick={() => delNegMut.mutate(nk.id)} className="hover:text-red-900 ml-0.5">✕</button>
            </span>
          ))}
          {(negKws as NegativeKeyword[]).length === 0 && <p className="text-sm text-gray-400">Нет минус-слов</p>}
        </div>
      </div>
    </div>
  )
}

// ─── SEO Tab ──────────────────────────────────────────────────────────────────

function ChecklistSection({ items }: { items: ChecklistItem[] }) {
  const byCategory: Record<string, ChecklistItem[]> = {}
  for (const item of items) {
    if (!byCategory[item.category]) byCategory[item.category] = []
    byCategory[item.category].push(item)
  }
  return (
    <div className="space-y-4">
      {Object.entries(byCategory).map(([cat, catItems]) => (
        <div key={cat}>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{cat}</h4>
          <div className="space-y-1">
            {catItems.map((item) => (
              <div key={item.name} className="flex items-center gap-3 py-2 px-3 bg-white rounded-lg border text-sm">
                <span>{item.status === 'ok' ? '✅' : item.status === 'warn' ? '⚠️' : '❌'}</span>
                <span className="flex-1">{item.name}</span>
                <span className={cx('font-semibold tabular-nums',
                  item.status === 'ok' ? 'text-green-600' : item.status === 'warn' ? 'text-yellow-600' : 'text-red-600')}>
                  {item.count > 0 ? item.count.toLocaleString() : '—'}
                </span>
                {item.count > 0 && <span className="text-gray-400 text-xs w-8 text-right">{item.pct}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function SeoPageRow({ page, projectId, onUpdate }: { page: SeoPage; projectId: string; onUpdate: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [form, setForm] = useState({
    rec_title: page.rec_title || '',
    rec_description: page.rec_description || '',
    rec_og_title: page.rec_og_title || '',
    rec_og_description: page.rec_og_description || '',
  })
  const saveMut = useMutation({
    mutationFn: () => seoApi.updateMeta(projectId, page.page_url, form),
    onSuccess: () => { setExpanded(false); onUpdate() },
  })

  const hasIssue = page.has_title_issue || page.has_desc_issue || page.has_og_issue
  const hasRec = page.rec_title || page.rec_description

  return (
    <div className={cx('border rounded-lg bg-white overflow-hidden',
      hasRec ? 'border-green-200' : hasIssue ? 'border-red-200' : '')}>
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 text-sm"
        onClick={() => setExpanded((v) => !v)}>
        <span className="text-gray-400 text-xs w-3">{expanded ? '▼' : '▶'}</span>
        <span className="flex-1 font-mono text-xs truncate" title={page.page_url}>{page.page_url}</span>
        <div className="flex gap-1 shrink-0">
          {page.has_title_issue && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded">title</span>}
          {page.has_desc_issue && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded">desc</span>}
          {page.has_og_issue && <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded">og</span>}
          {hasRec && <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">✓ рек.</span>}
        </div>
      </div>
      {expanded && (
        <div className="border-t p-3 space-y-3 bg-gray-50">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-gray-500 mb-1 font-medium">Текущий title</p>
              <p className={cx(page.has_title_issue ? 'text-red-600' : 'text-gray-700')}>
                {page.current_title || <em className="text-gray-400">нет</em>}
              </p>
              {page.current_title && <div className="mt-1"><CharBadge len={page.current_title.length} max={70} /></div>}
            </div>
            <div>
              <p className="text-gray-500 mb-1 font-medium">Текущий description</p>
              <p className={cx(page.has_desc_issue ? 'text-red-600' : 'text-gray-700', 'line-clamp-3')}>
                {page.current_description || <em className="text-gray-400">нет</em>}
              </p>
              {page.current_description && <div className="mt-1"><CharBadge len={page.current_description.length} max={160} /></div>}
            </div>
          </div>
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-medium text-gray-600">Рекомендации (редактируемы)</p>
            {[
              { key: 'rec_title', label: 'Рек. title', max: 70, placeholder: 'Рекомендуемый title (50–70 симв.)' },
              { key: 'rec_description', label: 'Рек. description', max: 160, placeholder: 'Рекомендуемый description (120–160 симв.)' },
              { key: 'rec_og_title', label: 'Рек. og:title', max: 90, placeholder: 'OG title для соцсетей (60–90 симв.)' },
              { key: 'rec_og_description', label: 'Рек. og:description', max: 200, placeholder: 'OG description (150–200 симв.)' },
            ].map(({ key, label, max, placeholder }) => (
              <div key={key}>
                <div className="flex justify-between mb-0.5">
                  <label className="text-xs text-gray-600">{label}</label>
                  <CharBadge len={(form as any)[key].length} max={max} />
                </div>
                {key.includes('description') ? (
                  <textarea rows={2} className="w-full border rounded px-2 py-1 text-sm bg-white"
                    placeholder={placeholder}
                    value={(form as any)[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
                ) : (
                  <input className="w-full border rounded px-2 py-1 text-sm bg-white"
                    placeholder={placeholder}
                    value={(form as any)[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
              className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
              {saveMut.isPending ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button onClick={() => setExpanded(false)} className="border px-3 py-1.5 rounded-lg text-sm hover:bg-white">Закрыть</button>
          </div>
        </div>
      )}
    </div>
  )
}

function SeoTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [view, setView] = useState<'checklist' | 'pages'>('checklist')
  const [issuesOnly, setIssuesOnly] = useState(true)
  const [generateOg, setGenerateOg] = useState(false)
  const [generateTaskId, setGenerateTaskId] = useState<string | null>(null)

  const { data: checklist, isLoading: clLoading } = useQuery({
    queryKey: ['seo-checklist', projectId],
    queryFn: () => seoApi.getChecklist(projectId),
  })
  const { data: pagesData, isLoading: pagesLoading, refetch: refetchPages } = useQuery({
    queryKey: ['seo-pages', projectId, issuesOnly],
    queryFn: () => seoApi.getPages(projectId, { issues_only: issuesOnly, limit: 100 }),
    enabled: view === 'pages',
  })
  const { data: taskStatus } = useQuery({
    queryKey: ['seo-task', generateTaskId],
    queryFn: () => seoApi.getTaskStatus(projectId, generateTaskId!),
    enabled: !!generateTaskId,
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.status
      return s === 'running' || s === 'pending' ? 2000 : false
    },
  })

  const genMetaMut = useMutation({
    mutationFn: () => seoApi.generateMeta(projectId, generateOg),
    onSuccess: (data: any) => setGenerateTaskId(data.task_id),
  })

  const isRunning = taskStatus?.status === 'running' || taskStatus?.status === 'pending'
  const isDone = taskStatus?.status === 'success'

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1">
          {(['checklist', 'pages'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={cx('px-4 py-2 text-sm rounded-lg transition',
                view === v ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              {v === 'checklist' ? '📋 Чеклист' : '📄 Мета-теги'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" className="rounded" checked={generateOg} onChange={(e) => setGenerateOg(e.target.checked)} />
            + OG теги
          </label>
          <button onClick={() => genMetaMut.mutate()} disabled={genMetaMut.isPending || isRunning}
            className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
            {genMetaMut.isPending || isRunning ? '⏳ Генерация...' : '✨ Сгенерировать мета-теги'}
          </button>
        </div>
      </div>

      {generateTaskId && (
        <div className={cx('rounded-lg p-3 mb-4 text-sm flex items-center gap-3',
          isDone ? 'bg-green-50 border border-green-200 text-green-700'
          : isRunning ? 'bg-blue-50 border border-blue-200 text-blue-700'
          : 'bg-red-50 border border-red-200 text-red-700')}>
          {isRunning && <span>⏳ Генерация мета-тегов: {taskStatus?.progress ?? 0}%</span>}
          {isDone && <span>✅ Готово: {(taskStatus?.result as any)?.pages_generated ?? 0} страниц обработано</span>}
          {taskStatus?.status === 'failed' && <span>❌ Ошибка: {taskStatus.error}</span>}
          {isDone && (
            <button onClick={() => { refetchPages(); qc.invalidateQueries({ queryKey: ['seo-pages'] }) }}
              className="ml-auto text-sm underline">Обновить</button>
          )}
        </div>
      )}

      {view === 'checklist' && (
        clLoading ? <div className="text-gray-500 py-4">Загрузка...</div> :
        checklist?.status === 'no_crawl' ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-lg font-medium mb-1">Нет данных парсинга</p>
            <p className="text-sm">Запустите парсинг сайта на вкладке «Парсинг»</p>
          </div>
        ) : checklist ? (
          <>
            <div className="flex items-center gap-6 mb-6 p-4 bg-white border rounded-lg">
              <div className="text-center">
                <div className={cx('text-4xl font-bold',
                  (checklist.score || 0) >= 80 ? 'text-green-600' : (checklist.score || 0) >= 50 ? 'text-yellow-600' : 'text-red-600')}>
                  {checklist.score}%
                </div>
                <p className="text-xs text-gray-500 mt-1">SEO-оценка</p>
              </div>
              <div className="w-px h-12 bg-gray-200" />
              <div>
                <p className="text-lg font-semibold">{checklist.pages_total?.toLocaleString()}</p>
                <p className="text-xs text-gray-500">страниц проанализировано</p>
              </div>
              {checklist.crawl_date && (
                <p className="text-xs text-gray-400 ml-auto">
                  Данные от {new Date(checklist.crawl_date).toLocaleDateString('ru-RU')}
                </p>
              )}
            </div>
            <ChecklistSection items={checklist.items || []} />
          </>
        ) : null
      )}

      {view === 'pages' && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" className="rounded" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} />
              Только страницы с проблемами
            </label>
            {pagesData && (
              <span className="text-sm text-gray-500">{pagesData.pages?.length ?? 0} из {pagesData.total ?? 0}</span>
            )}
          </div>
          {pagesLoading ? <div className="text-gray-500">Загрузка...</div> :
            pagesData?.crawl_status === 'not_done' ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">📭</p>
                <p className="font-medium">Нет данных парсинга</p>
                <p className="text-sm mt-1">Запустите парсинг на вкладке «Парсинг»</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(pagesData?.pages ?? []).map((page: SeoPage) => (
                  <SeoPageRow key={page.page_url} page={page} projectId={projectId}
                    onUpdate={() => qc.invalidateQueries({ queryKey: ['seo-pages', projectId] })} />
                ))}
                {(pagesData?.pages ?? []).length === 0 && (
                  <div className="text-center py-10 text-gray-400">
                    <p>Нет страниц с проблемами 🎉</p>
                  </div>
                )}
              </div>
            )
          }
        </div>
      )}
    </div>
  )
}

// ─── Export Tab ───────────────────────────────────────────────────────────────

function ExportTab({ projectId }: { projectId: string }) {
  const { data: validation } = useQuery({
    queryKey: ['export-validate', projectId],
    queryFn: () => api.get(`/projects/${projectId}/export/validate`).then((r) => r.data),
  })
  return (
    <div className="p-6 max-w-xl">
      <h3 className="font-semibold mb-4">Экспорт</h3>
      {validation && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4 text-sm space-y-1.5">
          {[
            ['Кампаний', validation.campaigns_count],
            ['Групп', validation.groups_count],
            ['Объявлений', validation.ads_count],
            ['Ключевых фраз', validation.keywords_count],
            ['Минус-слов', validation.negative_keywords_count],
          ].map(([label, val]) => (
            <p key={label as string}><span className="text-gray-500">{label}:</span> <strong>{val}</strong></p>
          ))}
          {(validation.warnings || []).map((w: string, i: number) => (
            <p key={i} className="text-yellow-600 text-xs">⚠️ {w}</p>
          ))}
        </div>
      )}
      <div className="space-y-3">
        <button onClick={() => window.open(`/api/projects/${projectId}/export/direct-xls`, '_blank')}
          className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm hover:bg-green-700 transition font-medium">
          📥 Скачать XLS для Директ Коммандера
        </button>
        <button onClick={() => window.open(`/api/projects/${projectId}/export/strategy-md`, '_blank')}
          className="w-full bg-gray-600 text-white py-2.5 rounded-lg text-sm hover:bg-gray-700 transition font-medium">
          📄 Скачать стратегию (Markdown)
        </button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id!),
    enabled: !!id,
  })

  if (isLoading) return <div className="p-6 text-gray-500">Загрузка...</div>
  if (!project) return <div className="p-6 text-red-500">Проект не найден</div>

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Обзор' },
    { key: 'brief', label: 'Бриф' },
    { key: 'crawl', label: 'Парсинг' },
    { key: 'direct', label: '📢 Директ' },
    { key: 'seo', label: '🔍 SEO' },
    { key: 'export', label: 'Экспорт' },
  ]

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    paused: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-blue-100 text-blue-700',
    archived: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="min-h-full flex flex-col">
      <div className="bg-white border-b px-6 py-4">
        <button onClick={() => navigate('/projects')} className="text-sm text-gray-500 hover:text-gray-700 mb-2">← Проекты</button>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">{project.name}</h2>
          <span className={cx('text-xs px-2 py-0.5 rounded-full font-medium', statusColors[project.status] || 'bg-gray-100 text-gray-600')}>
            {project.status}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-0.5">
          {project.client_name} ·{' '}
          <a href={project.url} target="_blank" rel="noreferrer" className="hover:underline text-primary-600">{project.url}</a>
        </p>
      </div>

      <div className="bg-white border-b px-6">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cx('px-4 py-3 text-sm font-medium border-b-2 transition',
                tab === t.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-600 hover:text-gray-900')}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 bg-gray-50">
        {tab === 'overview' && (
          <div className="p-6 max-w-xl">
            <div className="bg-white rounded-lg border p-4 space-y-2 text-sm">
              <p><span className="text-gray-500">Клиент:</span> <strong>{project.client_name}</strong></p>
              <p><span className="text-gray-500">Сайт:</span>{' '}
                <a href={project.url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">{project.url}</a>
              </p>
              <p><span className="text-gray-500">Статус:</span>{' '}
                <span className={cx('px-2 py-0.5 rounded-full text-xs font-medium', statusColors[project.status] || 'bg-gray-100 text-gray-600')}>
                  {project.status}
                </span>
              </p>
              {project.budget && (
                <p><span className="text-gray-500">Бюджет:</span> <strong>{Number(project.budget).toLocaleString()} ₽/мес</strong></p>
              )}
              {project.notes && <p><span className="text-gray-500">Заметки:</span> {project.notes}</p>}
              <p><span className="text-gray-500">Создан:</span> {new Date(project.created_at).toLocaleDateString('ru-RU')}</p>
            </div>
          </div>
        )}
        {tab === 'brief' && <BriefTab projectId={id!} />}
        {tab === 'crawl' && <CrawlTab projectId={id!} />}
        {tab === 'direct' && <DirectTab projectId={id!} />}
        {tab === 'seo' && <SeoTab projectId={id!} />}
        {tab === 'export' && <ExportTab projectId={id!} />}
      </div>
    </div>
  )
}
