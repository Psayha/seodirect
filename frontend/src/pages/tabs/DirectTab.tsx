import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { directApi, type Campaign, type AdGroup, type Keyword, type Ad, type NegativeKeyword, type ReadinessCheckCategory, type ReadinessCheckItem } from '../../api/direct'
import { imagesApi, type ProjectImage } from '../../api/images'

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
    draft: 'bg-surface-raised text-muted',
    active: 'bg-green-100 text-green-700',
    paused: 'bg-yellow-100 text-yellow-700',
    ready: 'bg-blue-100 text-blue-700',
    review: 'bg-purple-100 text-purple-700',
    low_frequency: 'bg-red-100 text-red-600',
  }
  return (
    <span className={cx('text-xs px-2 py-0.5 rounded-full font-medium', colors[status] || 'bg-surface-raised text-muted')}>
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
  const [cls, label] = map[temp] || ['bg-surface-raised text-muted', temp]
  return <span className={cx('text-xs px-2 py-0.5 rounded-full font-medium', cls)}>{label}</span>
}

function WordstatSparkline({ phrase }: { phrase: string }) {
  const { data, isFetching } = useQuery({
    queryKey: ['wordstat-dynamics', phrase],
    queryFn: () => directApi.getKeywordDynamics(phrase),
    staleTime: 5 * 60 * 1000,
  })
  if (isFetching) return <span className="text-xs text-muted">⏳</span>
  type DynamicsItem = { year_month: string; count: number }
  const items: DynamicsItem[] = data?.dynamics?.slice(-12) ?? []
  if (!items.length) return <span className="text-xs text-muted italic">нет данных</span>
  const max = Math.max(...items.map((d) => d.count), 1)
  return (
    <div className="flex items-end gap-0.5 h-8">
      {items.map((d, i: number) => (
        <div key={i} title={`${d.year_month}: ${d.count.toLocaleString()}`}
          className="w-2 bg-accent hover:bg-accent rounded-sm transition-all cursor-default"
          style={{ height: `${Math.max(2, Math.round((d.count / max) * 32))}px` }} />
      ))}
    </div>
  )
}

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
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })

  if (!editing) {
    return (
      <div className={cx('border rounded-xl p-3 bg-surface text-sm', !ad.valid && 'border-red-200')}>
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs text-muted">Вариант {ad.variant}</span>
          <div className="flex gap-2 items-center">
            <StatusBadge status={ad.status} />
            {!ad.valid && <span className="text-xs text-red-500">⚠️ лимит</span>}
            <button onClick={() => setEditing(true)} className="text-xs text-accent hover:underline">✏️</button>
          </div>
        </div>
        <p className="font-medium text-primary leading-snug">{ad.headline1}{ad.headline2 ? ` | ${ad.headline2}` : ''}{ad.headline3 ? ` | ${ad.headline3}` : ''}</p>
        <p className="text-muted mt-1 text-xs">{ad.text}</p>
        {ad.display_url && <p className="text-muted text-xs mt-1">🔗 {ad.display_url}</p>}
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
    <div className="border border-primary-200 rounded-xl p-3 bg-blue-50 text-sm space-y-2">
      {[
        { key: 'headline1', label: 'Заголовок 1', max: 56 },
        { key: 'headline2', label: 'Заголовок 2', max: 30 },
        { key: 'headline3', label: 'Заголовок 3 (опц.)', max: 30 },
      ].map(({ key, label, max }) => (
        <div key={key}>
          <div className="flex justify-between mb-0.5">
            <label className="text-xs text-muted">{label}</label>
            <CharBadge len={(form as any)[key].length} max={max} />
          </div>
          <input className="w-full border rounded px-2 py-1 text-sm bg-surface"
            value={(form as any)[key]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
        </div>
      ))}
      <div>
        <div className="flex justify-between mb-0.5">
          <label className="text-xs text-muted">Текст объявления</label>
          <CharBadge len={form.text.length} max={81} />
        </div>
        <textarea rows={2} className="w-full border rounded px-2 py-1 text-sm bg-surface"
          value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} />
      </div>
      <input className="w-full border rounded px-2 py-1 text-sm bg-surface" placeholder="Отображаемый URL"
        value={form.display_url} onChange={(e) => setForm((f) => ({ ...f, display_url: e.target.value }))} />
      <input className="w-full border rounded px-2 py-1 text-sm bg-surface" placeholder="UTM-метки"
        value={form.utm} onChange={(e) => setForm((f) => ({ ...f, utm: e.target.value }))} />
      <div className="flex gap-2 items-center">
        <select className="border rounded px-2 py-1 text-sm bg-surface"
          value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
          <option value="draft">draft</option>
          <option value="ready">ready</option>
          <option value="review">review</option>
        </select>
        <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
          className="bg-accent text-white px-3 py-1 rounded text-sm hover:bg-accent disabled:opacity-50">
          {saveMutation.isPending ? '...' : 'Сохранить'}
        </button>
        <button onClick={() => setEditing(false)} className="border px-3 py-1 rounded text-sm hover:bg-surface">Отмена</button>
      </div>
    </div>
  )
}

function GroupContent({ group }: { group: AdGroup }) {
  const qc = useQueryClient()
  const [subtab, setSubtab] = useState<'keywords' | 'ads'>('keywords')
  const [newKw, setNewKw] = useState('')
  const [newKwTemp, setNewKwTemp] = useState('warm')
  const [dynamicsKw, setDynamicsKw] = useState<string | null>(null)

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
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })
  const checkFreqMut = useMutation({
    mutationFn: () => directApi.checkFrequencies(group.id),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['keywords', group.id] }), 5000),
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })
  const addKwMut = useMutation({
    mutationFn: () => directApi.addKeyword(group.id, newKw.trim(), newKwTemp),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['keywords', group.id] }); setNewKw('') },
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })
  const delKwMut = useMutation({
    mutationFn: (id: string) => directApi.deleteKeyword(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['keywords', group.id] }),
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })
  const genAdsMut = useMutation({
    mutationFn: () => directApi.generateAds(group.id, 2),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ads', group.id] }),
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })

  return (
    <div className="mt-2 ml-6 border-l-2 border-[var(--border)] pl-4">
      <div className="flex gap-1 mb-3">
        {(['keywords', 'ads'] as const).map((t) => (
          <button key={t} onClick={() => setSubtab(t)}
            className={cx('px-3 py-1 text-sm rounded-md transition',
              subtab === t ? 'bg-accent text-white' : 'bg-surface-raised text-muted hover:bg-surface-raised')}>
            {t === 'keywords' ? `Ключи (${(keywords as Keyword[]).length})` : `Объявления (${(ads as Ad[]).length})`}
          </button>
        ))}
      </div>

      {subtab === 'keywords' && (
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => genKwMut.mutate()} disabled={genKwMut.isPending}
              className="btn-accent px-3 py-1.5 rounded-xl text-sm hover:bg-accent disabled:opacity-50">
              {genKwMut.isPending ? '⏳...' : '✨ Сгенерировать ключи'}
            </button>
            <button onClick={() => checkFreqMut.mutate()} disabled={checkFreqMut.isPending}
              className="border border-[var(--border)] px-3 py-1.5 rounded-xl text-sm hover:bg-surface-raised disabled:opacity-50">
              {checkFreqMut.isPending ? '⏳...' : '📊 Проверить частоты'}
            </button>
          </div>
          {genKwMut.isSuccess && <p className="text-xs text-green-600">✅ Добавлено: {(genKwMut.data as any)?.keywords_created}</p>}
          {checkFreqMut.isSuccess && <p className="text-xs text-blue-600">⏳ Задача запущена, частоты обновятся через ~30с</p>}
          <div className="space-y-1">
            {(keywords as Keyword[]).map((kw) => (
              <div key={kw.id} className="bg-surface border rounded text-sm">
                <div className="flex items-center gap-2 py-1.5 px-2 hover:bg-surface-raised">
                  <TempBadge temp={kw.temperature} />
                  <span className="flex-1 font-mono text-xs">{kw.phrase}</span>
                  {kw.frequency !== null && (
                    <span className="text-xs text-muted tabular-nums w-16 text-right">{kw.frequency.toLocaleString()}</span>
                  )}
                  <StatusBadge status={kw.status} />
                  <button
                    title="Сезонность (Wordstat)"
                    onClick={() => setDynamicsKw(dynamicsKw === kw.phrase ? null : kw.phrase)}
                    className={cx('text-xs px-1.5 py-0.5 rounded transition', dynamicsKw === kw.phrase ? 'bg-accent-subtle text-accent' : 'text-muted hover:text-accent')}>
                    📈
                  </button>
                  <button onClick={() => delKwMut.mutate(kw.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                </div>
                {dynamicsKw === kw.phrase && (
                  <div className="px-3 pb-2 border-t bg-surface-raised">
                    <p className="text-xs text-muted mb-1">Сезонность за 12 мес. (Wordstat)</p>
                    <WordstatSparkline phrase={kw.phrase} />
                  </div>
                )}
              </div>
            ))}
            {(keywords as Keyword[]).length === 0 && (
              <p className="text-sm text-muted py-2 text-center">Нет ключей — нажмите «Сгенерировать»</p>
            )}
          </div>
          <div className="flex gap-2">
            <input className="field flex-1 py-1.5"
              placeholder="Добавить ключ вручную..."
              value={newKw}
              onKeyDown={(e) => e.key === 'Enter' && newKw.trim() && addKwMut.mutate()}
              onChange={(e) => setNewKw(e.target.value)} />
            <select className="border rounded-xl px-2 py-1.5 text-sm"
              value={newKwTemp} onChange={(e) => setNewKwTemp(e.target.value)}>
              <option value="hot">🔥</option>
              <option value="warm">☀️</option>
              <option value="cold">❄️</option>
            </select>
            <button onClick={() => newKw.trim() && addKwMut.mutate()} disabled={!newKw.trim() || addKwMut.isPending}
              className="bg-surface-raised text-primary px-4 py-1.5 rounded-xl text-sm disabled:opacity-50">+</button>
          </div>
        </div>
      )}

      {subtab === 'ads' && (
        <div className="space-y-2">
          <button onClick={() => genAdsMut.mutate()} disabled={genAdsMut.isPending}
            className="btn-accent px-3 py-1.5 rounded-xl text-sm hover:bg-accent disabled:opacity-50">
            {genAdsMut.isPending ? '⏳ Генерация...' : '✨ Сгенерировать 2 варианта'}
          </button>
          {(ads as Ad[]).map((ad) => (
            <AdCard key={ad.id} ad={ad} onUpdate={() => qc.invalidateQueries({ queryKey: ['ads', group.id] })} />
          ))}
          {(ads as Ad[]).length === 0 && (
            <p className="text-sm text-muted py-2 text-center">Нет объявлений — нажмите «Сгенерировать»</p>
          )}
        </div>
      )}
    </div>
  )
}

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
  const [sitelinks, setSitelinks] = useState<Array<{ title: string; url: string }>>(campaign.sitelinks || [])
  const [editingSitelinks, setEditingSitelinks] = useState(false)

  const { data: groups = [] } = useQuery({
    queryKey: ['groups', campaign.id],
    queryFn: () => directApi.getGroups(campaign.id),
    enabled: expanded,
  })

  const createGroupMut = useMutation({
    mutationFn: () => directApi.createGroup(campaign.id, newGroupName.trim() || 'Новая группа'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups', campaign.id] }); setNewGroupName(''); setAddingGroup(false) },
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })
  const updateMut = useMutation({
    mutationFn: () => directApi.updateCampaign(campaign.id, {
      name: editForm.name,
      type: editForm.type || undefined,
      budget_monthly: editForm.budget_monthly ? Number(editForm.budget_monthly) : undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns', projectId] }); setEditing(false) },
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })
  const saveSitelinksMut = useMutation({
    mutationFn: () => directApi.updateCampaign(campaign.id, { sitelinks }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns', projectId] }); setEditingSitelinks(false) },
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })
  const deleteMut = useMutation({
    mutationFn: () => directApi.deleteCampaign(campaign.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns', projectId] }),
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })

  const toggleGroup = (id: string) =>
    setExpandedGroups((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className="border border-[var(--border)] rounded-xl bg-surface">
      <div className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-surface-raised select-none"
        onClick={() => !editing && setExpanded((v) => !v)}>
        <span className="text-muted text-xs w-3">{expanded ? '▼' : '▶'}</span>
        {editing ? (
          <div className="flex gap-2 flex-1 items-center" onClick={(e) => e.stopPropagation()}>
            <input className="border rounded px-2 py-1 text-sm flex-1 min-w-0"
              value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            <input className="border rounded px-2 py-1 text-sm w-28" placeholder="Тип (search)"
              value={editForm.type} onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value }))} />
            <input type="number" className="border rounded px-2 py-1 text-sm w-24" placeholder="Бюджет ₽"
              value={editForm.budget_monthly} onChange={(e) => setEditForm((f) => ({ ...f, budget_monthly: e.target.value }))} />
            <button onClick={() => updateMut.mutate()} disabled={updateMut.isPending}
              className="bg-accent text-white px-2 py-1 rounded text-xs hover:bg-accent disabled:opacity-50">💾</button>
            <button onClick={() => setEditing(false)} className="border px-2 py-1 rounded text-xs">✕</button>
          </div>
        ) : (
          <>
            <span className="font-medium text-sm flex-1 min-w-0 truncate">{campaign.name}</span>
            {campaign.type && <span className="text-xs text-muted shrink-0">{campaign.type}</span>}
            {campaign.budget_monthly && (
              <span className="text-xs text-muted shrink-0">{Number(campaign.budget_monthly).toLocaleString()} ₽/мес</span>
            )}
            <StatusBadge status={campaign.status} />
            <button onClick={(e) => { e.stopPropagation(); setEditing(true) }}
              className="text-muted hover:text-primary text-xs shrink-0 ml-1">✏️</button>
            <button onClick={(e) => { e.stopPropagation(); if (confirm(`Удалить кампанию "${campaign.name}"?`)) deleteMut.mutate() }}
              className="text-red-400 hover:text-red-600 text-xs shrink-0">🗑</button>
          </>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t bg-surface-raised pt-3 space-y-2">
          <div className="border border-[var(--border)] rounded-xl bg-surface p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted uppercase tracking-wide">Быстрые ссылки (до 4)</span>
              {!editingSitelinks ? (
                <button onClick={() => setEditingSitelinks(true)} className="text-xs text-accent hover:text-accent">✏️ Редактировать</button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => saveSitelinksMut.mutate()} disabled={saveSitelinksMut.isPending}
                    className="text-xs bg-accent text-white px-2 py-1 rounded hover:bg-accent disabled:opacity-50">
                    {saveSitelinksMut.isPending ? '...' : '💾 Сохранить'}
                  </button>
                  <button onClick={() => { setSitelinks(campaign.sitelinks || []); setEditingSitelinks(false) }} className="text-xs border px-2 py-1 rounded">✕</button>
                </div>
              )}
            </div>
            {editingSitelinks ? (
              <div className="space-y-2">
                {sitelinks.map((sl, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input className="border rounded px-2 py-1 text-xs w-32 shrink-0" placeholder="Заголовок"
                      value={sl.title}
                      onChange={(e) => setSitelinks((s) => s.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                    <input className="border rounded px-2 py-1 text-xs flex-1 font-mono" placeholder="https://..."
                      value={sl.url}
                      onChange={(e) => setSitelinks((s) => s.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
                    <button onClick={() => setSitelinks((s) => s.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-sm font-bold">×</button>
                  </div>
                ))}
                {sitelinks.length < 4 && (
                  <button onClick={() => setSitelinks((s) => [...s, { title: '', url: '' }])}
                    className="text-xs text-accent hover:text-accent font-medium">+ Добавить ссылку</button>
                )}
              </div>
            ) : sitelinks.length === 0 ? (
              <p className="text-xs text-muted italic">Нет быстрых ссылок</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sitelinks.map((sl, i) => (
                  <a key={i} href={sl.url} target="_blank" rel="noreferrer"
                    className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition">
                    {sl.title || sl.url}
                  </a>
                ))}
              </div>
            )}
          </div>

          {(groups as AdGroup[]).map((g) => (
            <div key={g.id} className="border border-[var(--border)] rounded-xl bg-surface">
              <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-surface-raised select-none"
                onClick={() => toggleGroup(g.id)}>
                <span className="text-muted text-xs w-3">{expandedGroups.has(g.id) ? '▼' : '▶'}</span>
                <span className="text-sm font-medium flex-1">{g.name}</span>
                <StatusBadge status={g.status} />
              </div>
              {expandedGroups.has(g.id) && (
                <div className="px-3 pb-3 border-t bg-surface-raised">
                  <GroupContent group={g} />
                </div>
              )}
            </div>
          ))}

          {(groups as AdGroup[]).length === 0 && !addingGroup && (
            <p className="text-sm text-muted">Нет групп объявлений</p>
          )}

          {addingGroup ? (
            <div className="flex gap-2">
              <input autoFocus className="flex-1 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 "
                placeholder="Название группы..."
                value={newGroupName}
                onKeyDown={(e) => e.key === 'Enter' && createGroupMut.mutate()}
                onChange={(e) => setNewGroupName(e.target.value)} />
              <button onClick={() => createGroupMut.mutate()} disabled={createGroupMut.isPending}
                className="bg-accent text-white px-3 py-1.5 rounded text-sm disabled:opacity-50">Создать</button>
              <button onClick={() => setAddingGroup(false)} className="border px-3 py-1.5 rounded text-sm">✕</button>
            </div>
          ) : (
            <button onClick={() => setAddingGroup(true)}
              className="text-sm text-accent hover:text-accent font-medium">+ Добавить группу</button>
          )}
        </div>
      )}
    </div>
  )
}


// ─── Чеклист запуска ────────────────────────────────────────────────────────
function ReadinessCheckSection({ projectId }: { projectId: string }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["readiness-check", projectId],
    queryFn: () => directApi.readinessCheck(projectId),
    staleTime: 30_000,
  })

  if (isLoading) return (
    <div className="p-6 text-sm text-muted animate-pulse">Проверяем...</div>
  )

  const score = data?.score ?? 0
  const scoreColor = score >= 80 ? "#34d399" : score >= 50 ? "#fbbf24" : "#f87171"

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base" style={{ color: "var(--text)", letterSpacing: "-0.01em" }}>
            Чеклист запуска
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            Автоматическая проверка готовности кампаний по стандартам специалиста
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Score badge */}
          <div className="text-center px-4 py-2 rounded-2xl" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
            <div className="text-2xl font-bold font-data" style={{ color: scoreColor, lineHeight: 1 }}>{score}%</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{data?.passed}/{data?.total} проверок</div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-ghost text-sm px-4 py-2"
          >
            {isFetching ? "Проверка..." : "↻ Обновить"}
          </button>
        </div>
      </div>

      {/* Stats row */}
      {data && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Кампаний", value: data.campaigns_count },
            { label: "Групп", value: data.groups_count },
            { label: "Объявлений", value: data.ads_count },
          ].map((s) => (
            <div key={s.label} className="card px-4 py-3 text-center">
              <div className="text-xl font-bold font-data" style={{ color: "var(--text)" }}>{s.value}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Categories */}
      {data?.categories.map((cat: ReadinessCheckCategory) => {
        const catPassed = cat.items.filter((i: ReadinessCheckItem) => i.pass).length
        const catTotal  = cat.items.length
        return (
          <div key={cat.name} className="card p-0 overflow-hidden">
            {/* Category header */}
            <div
              className="flex items-center justify-between px-5 py-3"
              style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-raised)" }}
            >
              <h4 className="text-sm font-semibold" style={{ color: "var(--text)" }}>{cat.name}</h4>
              <span className="text-xs font-data font-medium" style={{ color: catPassed === catTotal ? "#34d399" : "var(--muted)" }}>
                {catPassed}/{catTotal}
              </span>
            </div>
            {/* Items */}
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {cat.items.map((item: ReadinessCheckItem, idx: number) => (
                <div key={idx} className="px-5 py-3">
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold"
                      style={{
                        background: item.pass ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.12)",
                        color: item.pass ? "#34d399" : "#f87171",
                      }}
                    >
                      {item.pass ? "✓" : "✕"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm" style={{ color: "var(--text)" }}>{item.label}</p>
                      <p className="text-xs mt-0.5" style={{ color: item.pass ? "var(--muted)" : "#f87171" }}>
                        {item.detail}
                      </p>
                      {/* Sub-issues list */}
                      {!item.pass && item.issues && item.issues.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {item.issues.map((issue: string, i: number) => (
                            <li key={i} className="text-xs truncate" style={{ color: "var(--muted)" }}>• {issue}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── AI анализ офферов ───────────────────────────────────────────────────────
function OfferAnalysisSection({ projectId }: { projectId: string }) {
  const [triggered, setTriggered] = useState(false)
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["offer-analysis", projectId],
    queryFn: () => directApi.analyzeOffers(projectId),
    enabled: triggered,
    staleTime: 5 * 60_000,
  })

  type OfferAd = {
    id: string; overall_score: number
    headline1_score: number; headline2_score: number; text_score: number
    verdict: string; issues: string[]
    best_rewrite: { h1: string; h2: string; text: string }
  }

  const scoreColor = (n: number) =>
    n >= 8 ? "#34d399" : n >= 6 ? "#fbbf24" : "#f87171"

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-base" style={{ color: "var(--text)", letterSpacing: "-0.01em" }}>AI-анализ офферов</h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            Claude оценит каждый заголовок и текст по 10-балльной шкале и перепишет слабые места
          </p>
        </div>
        <button
          onClick={() => { setTriggered(true); refetch() }}
          disabled={isFetching}
          className="btn-accent text-sm px-5 py-2.5 shrink-0"
        >
          {isFetching ? "⏳ Анализируем..." : triggered && data ? "↻ Повторить" : "✨ Запустить анализ"}
        </button>
      </div>

      {!triggered && !data && (
        <div className="card p-8 flex flex-col items-center text-center" style={{ border: "1px dashed var(--border)" }}>
          <div className="text-3xl mb-3">🎯</div>
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--text)" }}>Анализ не запущен</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Claude проверит каждое объявление по критериям специалиста по Директу</p>
        </div>
      )}

      {isFetching && (
        <div className="card p-8 flex flex-col items-center text-center">
          <div className="text-3xl mb-3 animate-spin">⚙️</div>
          <p className="text-sm" style={{ color: "var(--muted)" }}>Claude анализирует объявления...</p>
        </div>
      )}

      {data && !isFetching && (
        <>
          {/* Summary card */}
          {data.summary && (
            <div className="card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Общая оценка</h4>
                <span className="text-2xl font-bold font-data" style={{ color: scoreColor(data.summary.avg_score) }}>
                  {data.summary.avg_score?.toFixed(1)}/10
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl p-3" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.15)" }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: "#f87171" }}>Главная проблема</p>
                  <p className="text-xs" style={{ color: "var(--text)" }}>{data.summary.top_issue}</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.15)" }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: "#34d399" }}>Быстрый выигрыш</p>
                  <p className="text-xs" style={{ color: "var(--text)" }}>{data.summary.quick_win}</p>
                </div>
              </div>
            </div>
          )}

          {/* Per-ad results */}
          {(data.ads as OfferAd[])?.map((ad: OfferAd) => (
            <div key={ad.id} className="card p-0 overflow-hidden">
              {/* Ad header */}
              <div className="flex items-center justify-between px-5 py-3"
                   style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-raised)" }}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Объявление</span>
                  <span className="text-xs truncate" style={{ color: "var(--text)" }}>{ad.id.slice(0, 8)}…</span>
                </div>
                <span className="text-lg font-bold font-data shrink-0" style={{ color: scoreColor(ad.overall_score) }}>
                  {ad.overall_score}/10
                </span>
              </div>

              <div className="p-5 space-y-4">
                {/* Score breakdown */}
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["Заголовок 1", ad.headline1_score],
                    ["Заголовок 2", ad.headline2_score],
                    ["Текст", ad.text_score],
                  ] as [string, number][]).map(([label, score]) => (
                    <div key={label} className="rounded-xl px-3 py-2 text-center"
                         style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
                      <div className="text-base font-bold font-data" style={{ color: scoreColor(score) }}>{score}</div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* Verdict */}
                <p className="text-sm italic" style={{ color: "var(--muted)" }}>"{ad.verdict}"</p>

                {/* Issues */}
                {ad.issues?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: "#f87171" }}>Проблемы</p>
                    <ul className="space-y-1">
                      {ad.issues.map((issue: string, i: number) => (
                        <li key={i} className="text-xs flex gap-2" style={{ color: "var(--text)" }}>
                          <span style={{ color: "#f87171" }}>✕</span>{issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Best rewrite */}
                {ad.best_rewrite && (
                  <div className="rounded-xl p-4 space-y-2"
                       style={{ background: "rgba(124,106,245,0.08)", border: "1px solid rgba(124,106,245,0.2)" }}>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--accent-text)" }}>Рекомендуемый вариант</p>
                    {([
                      ["Заголовок 1", ad.best_rewrite.h1, 56],
                      ["Заголовок 2", ad.best_rewrite.h2, 30],
                      ["Текст",       ad.best_rewrite.text, 81],
                    ] as [string, string, number][]).map(([label, val, max]) => (
                      <div key={label}>
                        <span className="text-xs" style={{ color: "var(--muted)" }}>{label}: </span>
                        <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{val}</span>
                        <span className="text-xs ml-1 font-data" style={{ color: val?.length > max * 0.85 ? "#34d399" : "var(--muted)" }}>
                          ({val?.length}/{max})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}


function NgramsSection({ projectId }: { projectId: string }) {
  const [n, setN] = useState(2)
  const [selected, setSelected] = useState<string | null>(null)

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['ngrams', projectId, n],
    queryFn: () => directApi.getNgrams(projectId, n),
    enabled: false,
  })

  const ngrams: any[] = data?.ngrams || []

  return (
    <div className="border border-[var(--border)] rounded-xl bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">N-граммы</h3>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {[2, 3].map(v => (
              <button key={v} onClick={() => setN(v)}
                className={cx('px-3 py-1.5 text-sm rounded-xl transition',
                  n === v ? 'bg-accent text-white' : 'bg-surface-raised text-muted hover:bg-surface-raised')}>
                {v}-грамм
              </button>
            ))}
          </div>
          <button onClick={() => refetch()} disabled={isFetching}
            className="btn-accent px-3 py-1.5 rounded-xl text-sm hover:bg-accent disabled:opacity-50">
            {isFetching ? '⏳ Анализ...' : 'Анализировать N-граммы'}
          </button>
        </div>
      </div>
      {ngrams.length > 0 && (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-raised border-b">
                <th className="px-3 py-2 text-left text-xs text-muted">N-грамм</th>
                <th className="px-3 py-2 text-right text-xs text-muted w-32">Вхождений</th>
                <th className="px-3 py-2 text-left text-xs text-muted">Примеры ключей</th>
              </tr>
            </thead>
            <tbody>
              {ngrams.map((ng: any, i: number) => (
                <>
                  <tr key={i} className="border-b hover:bg-surface-raised cursor-pointer"
                    onClick={() => setSelected(selected === ng.ngram ? null : ng.ngram)}>
                    <td className="px-3 py-2 font-mono font-medium text-primary">{ng.ngram}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{ng.count}</td>
                    <td className="px-3 py-2 text-xs text-muted truncate max-w-xs">
                      {(ng.examples || []).slice(0, 3).join(', ')}
                    </td>
                  </tr>
                  {selected === ng.ngram && ng.keywords && (
                    <tr key={`${i}-detail`}>
                      <td colSpan={3} className="px-3 py-2 bg-blue-50">
                        <p className="text-xs font-medium text-blue-700 mb-1">Все ключи с этим N-граммом:</p>
                        <div className="flex flex-wrap gap-1">
                          {ng.keywords.map((kw: string, j: number) => (
                            <span key={j} className="text-xs bg-surface border border-blue-200 text-blue-700 px-2 py-0.5 rounded">{kw}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!isFetching && ngrams.length === 0 && data && (
        <p className="text-sm text-muted py-4 text-center">Нет данных. Добавьте ключевые фразы и повторите анализ.</p>
      )}
    </div>
  )
}

function HeatmapSection({ projectId }: { projectId: string }) {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['heatmap', projectId],
    queryFn: () => directApi.getHeatmap(projectId),
    enabled: false,
  })

  const TEMPS = ['hot', 'warm', 'cold', 'none'] as const
  const TEMP_LABELS: Record<string, string> = { hot: '🔥 Горячие', warm: '☀️ Тёплые', cold: '❄️ Холодные', none: 'Без темп.' }
  const FREQ_RANGES = ['0', '1–100', '101–1000', '1001–10000', '10000+'] as const
  const RANGE_KEYS = ['0', '1_100', '101_1000', '1001_10000', '10000+']

  const heatmap: any = data?.heatmap || {}
  const summary: any = data?.summary || {}

  const getCellColor = (temp: string, count: number) => {
    if (!count) return 'bg-surface-raised text-muted'
    const opacity = count >= 50 ? 'opacity-100' : count >= 20 ? 'opacity-70' : count >= 5 ? 'opacity-40' : 'opacity-20'
    if (temp === 'hot') return `bg-red-500 text-white ${opacity}`
    if (temp === 'warm') return `bg-orange-400 text-white ${opacity}`
    if (temp === 'cold') return `bg-blue-500 text-white ${opacity}`
    return `bg-surface-raised text-muted ${opacity}`
  }

  return (
    <div className="border border-[var(--border)] rounded-xl bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Тепловая карта ключей</h3>
        <button onClick={() => refetch()} disabled={isFetching}
          className="btn-accent px-3 py-1.5 rounded-xl text-sm hover:bg-accent disabled:opacity-50">
          {isFetching ? '⏳ Загрузка...' : 'Обновить'}
        </button>
      </div>

      {Object.keys(heatmap).length > 0 && (
        <>
          <div className="overflow-auto mb-4">
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-muted bg-surface-raised border">Темп. / Частота</th>
                  {FREQ_RANGES.map((r, i) => (
                    <th key={i} className="px-3 py-2 text-center text-muted bg-surface-raised border w-24">{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TEMPS.map(temp => (
                  <tr key={temp}>
                    <td className="px-3 py-2 font-medium text-primary bg-surface-raised border">{TEMP_LABELS[temp]}</td>
                    {RANGE_KEYS.map((rk, i) => {
                      const count = heatmap[temp]?.[rk] ?? 0
                      return (
                        <td key={i} className={cx('px-3 py-2 text-center border font-mono font-bold', getCellColor(temp, count))}>
                          {count || '—'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {Object.keys(summary).length > 0 && (
            <div className="flex gap-4 text-sm">
              {TEMPS.filter(t => t !== 'none').map(temp => {
                const count = summary[temp] || 0
                const total = summary.total || 1
                const pct = Math.round((count / total) * 100)
                return (
                  <div key={temp} className="flex items-center gap-2">
                    <span>{TEMP_LABELS[temp]}</span>
                    <span className="font-medium">{count}</span>
                    <span className="text-muted">({pct}%)</span>
                  </div>
                )
              })}
              <div className="flex items-center gap-2 ml-auto text-muted">
                <span>Всего: <strong>{summary.total || 0}</strong></span>
              </div>
            </div>
          )}
        </>
      )}
      {!isFetching && !data && (
        <p className="text-sm text-muted py-4 text-center">Нажмите «Обновить» для загрузки тепловой карты</p>
      )}
    </div>
  )
}

function AbSection({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['ab-stats', projectId],
    queryFn: () => directApi.getAbStats(projectId),
  })

  const winnerMut = useMutation({
    mutationFn: (adId: string) => directApi.markAdWinner(adId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ab-stats', projectId] }),
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })

  const groups: any[] = data?.groups || []

  if (isLoading) return <div className="p-4 text-muted text-sm">Загрузка A/B статистики...</div>

  return (
    <div className="border border-[var(--border)] rounded-xl bg-surface p-4">
      <h3 className="font-semibold mb-3">A/B сравнение объявлений</h3>
      {groups.length === 0 ? (
        <div className="text-center py-8 text-muted">
          <p className="text-2xl mb-2">🧪</p>
          <p className="text-sm">Нет групп с несколькими вариантами объявлений</p>
        </div>
      ) : groups.map((group: any, gi: number) => (
        <div key={gi} className="mb-6">
          <p className="text-sm font-medium text-muted mb-2">Группа: {group.group_name}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(group.ads || []).map((ad: any) => (
              <div key={ad.id} className={cx('border rounded-xl p-3 text-sm', ad.is_winner ? 'border-green-400 bg-green-50' : 'border-[var(--border)] bg-surface')}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted">Вариант {ad.variant}</span>
                  <div className="flex items-center gap-2">
                    {ad.is_winner && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">🏆 Победитель</span>}
                    <StatusBadge status={ad.status} />
                  </div>
                </div>
                <p className="font-medium text-primary leading-snug text-xs">
                  {ad.headline1}{ad.headline2 ? ` | ${ad.headline2}` : ''}{ad.headline3 ? ` | ${ad.headline3}` : ''}
                </p>
                <p className="text-muted text-xs mt-1 line-clamp-2">{ad.text}</p>
                {!ad.is_winner && (
                  <button onClick={() => winnerMut.mutate(ad.id)} disabled={winnerMut.isPending}
                    className="mt-2 text-xs bg-accent text-white px-2.5 py-1 rounded hover:bg-accent disabled:opacity-50">
                    Назначить победителем
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function SearchQueriesModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [queries, setQueries] = useState('')
  const [results, setResults] = useState<any[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const analyzeMut = useMutation({
    mutationFn: () => directApi.analyzeSearchQueries(projectId, queries.split('\n').map(q => q.trim()).filter(Boolean)),
    onSuccess: (d: any) => { setResults(d.suggestions || []); setSelected(new Set()) },
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })

  const addNegMut = useMutation({
    mutationFn: async () => {
      const toAdd = (results || []).filter((_: any, i: number) => selected.has(i))
      for (const item of toAdd) {
        await directApi.addNegativeKeyword(projectId, item.phrase, item.block || 'general')
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['neg-kws', projectId] })
      onClose()
    },
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })

  const toggleAll = () => {
    if (!results) return
    if (selected.size === results.length) setSelected(new Set())
    else setSelected(new Set(results.map((_: any, i: number) => i)))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold">Анализ поисковых запросов</h3>
          <button onClick={onClose} className="text-muted hover:text-muted text-xl leading-none">×</button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">
          {!results ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-primary">Вставьте список поисковых запросов (по одному на строке)</label>
              <textarea rows={8} value={queries} onChange={e => setQueries(e.target.value)}
                className="field font-mono"
                placeholder="купить диван недорого&#10;диван купить цена&#10;детский диван со скидкой..." />
              <button onClick={() => analyzeMut.mutate()} disabled={analyzeMut.isPending || !queries.trim()}
                className="btn-accent px-4 py-2 rounded-xl text-sm hover:bg-accent disabled:opacity-50">
                {analyzeMut.isPending ? '⏳ Анализ...' : 'Анализировать'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted">Найдено {results.length} рекомендаций</p>
                <button onClick={toggleAll} className="text-xs text-accent hover:text-accent">
                  {selected.size === results.length ? 'Снять все' : 'Выбрать все'}
                </button>
              </div>
              {results.length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">Минус-слов не найдено</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-raised border-b">
                      <th className="px-3 py-2 w-8"></th>
                      <th className="px-3 py-2 text-left text-xs text-muted">Минус-слово</th>
                      <th className="px-3 py-2 text-left text-xs text-muted">Причина</th>
                      <th className="px-3 py-2 text-left text-xs text-muted">Уровень</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r: any, i: number) => (
                      <tr key={i} className="border-b hover:bg-surface-raised">
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={selected.has(i)}
                            onChange={() => setSelected(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })} />
                        </td>
                        <td className="px-3 py-2 font-mono font-medium text-primary">-{r.phrase}</td>
                        <td className="px-3 py-2 text-xs text-muted">{r.reason}</td>
                        <td className="px-3 py-2 text-xs text-muted">{r.block || 'general'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={() => addNegMut.mutate()} disabled={addNegMut.isPending || selected.size === 0}
                  className="btn-accent px-4 py-2 rounded-xl text-sm hover:bg-accent disabled:opacity-50">
                  {addNegMut.isPending ? 'Добавление...' : `Добавить выбранные (${selected.size})`}
                </button>
                <button onClick={() => setResults(null)} className="border px-4 py-2 rounded-xl text-sm hover:bg-surface-raised">Назад</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ClusterCard({ cluster }: { cluster: any }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-surface border rounded-xl overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-raised transition"
        onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center gap-3">
          <span className="font-medium text-sm">{cluster.name}</span>
          <span className="text-xs bg-surface-raised text-muted px-2 py-0.5 rounded-full">{cluster.keywords?.length ?? 0} фраз</span>
          {cluster.total_volume > 0 && (
            <span className="text-xs text-blue-600">~{cluster.total_volume.toLocaleString()} показов</span>
          )}
        </div>
        <span className="text-muted text-sm">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            {(cluster.keywords || []).map((kw: string, j: number) => (
              <span key={j} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">{kw}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function LocalClusterSection({ projectId }: { projectId: string }) {
  const [clusters, setClusters] = useState<any[] | null>(null)

  const clusterMut = useMutation({
    mutationFn: () => directApi.clusterLocal(projectId),
    onSuccess: (d: any) => setClusters(d.clusters || []),
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })

  return (
    <div className="border border-[var(--border)] rounded-xl bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Автокластеризация (локальная)</h3>
        <button onClick={() => clusterMut.mutate()} disabled={clusterMut.isPending}
          className="btn-accent px-3 py-1.5 rounded-xl text-sm hover:bg-accent disabled:opacity-50">
          {clusterMut.isPending ? '⏳ Кластеризация...' : 'Автокластеризация (локальная)'}
        </button>
      </div>
      {clusterMut.isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 mb-3">
          ❌ Ошибка кластеризации
        </div>
      )}
      {clusters && clusters.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted">Найдено кластеров: <strong>{clusters.length}</strong></p>
          {clusters.map((cl: any, i: number) => (
            <ClusterCard key={i} cluster={cl} />
          ))}
        </div>
      )}
      {clusters && clusters.length === 0 && (
        <p className="text-sm text-muted py-4 text-center">Нет кластеров. Добавьте ключевые фразы.</p>
      )}
    </div>
  )
}

/* ── Image Library ─────────────────────────────────────────────────────────── */
function ImageLibrarySection({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const { data: images = [], isLoading } = useQuery<ProjectImage[]>({
    queryKey: ['project-images', projectId],
    queryFn: () => imagesApi.list(projectId),
  })

  const deleteMut = useMutation({
    mutationFn: (imageId: string) => imagesApi.delete(projectId, imageId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-images', projectId] }),
  })

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadError('')
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        await imagesApi.upload(projectId, file)
      }
      qc.invalidateQueries({ queryKey: ['project-images', projectId] })
    } catch (e: any) {
      setUploadError(e?.response?.data?.detail || 'Ошибка загрузки')
    } finally {
      setUploading(false)
    }
  }

  function copyUrl(url: string, id: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h3 className="font-semibold text-base" style={{ color: 'var(--text)' }}>
          Библиотека изображений
        </h3>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          Загружайте изображения для колонки «Изображение» при импорте кампаний через Commander.
          Форматы: JPEG, PNG, WEBP. Максимум 10 МБ, минимум 450×450 px.
        </p>
      </div>

      {/* Drop zone */}
      <div
        className="relative rounded-2xl border-2 border-dashed flex flex-col items-center justify-center py-10 gap-3 transition-all duration-200 cursor-pointer"
        style={{
          borderColor: dragOver ? 'var(--accent)' : 'var(--border)',
          background: dragOver ? 'var(--accent-subtle)' : 'var(--surface)',
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => document.getElementById('img-file-input')?.click()}
      >
        <input
          id="img-file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
          style={{ color: dragOver ? 'var(--accent)' : 'var(--muted)' }}>
          <rect x="3" y="3" width="18" height="18" rx="3"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <path d="M21 15l-5-5L5 21"/>
        </svg>
        <div className="text-center">
          <p className="text-sm font-medium" style={{ color: uploading ? 'var(--accent-text)' : 'var(--text)' }}>
            {uploading ? 'Загрузка...' : 'Перетащите изображения или нажмите для выбора'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            JPEG · PNG · WEBP · до 10 МБ · мин. 450×450 px
          </p>
        </div>
        {uploading && (
          <span
            className="w-4 h-4 rounded-full border-2 animate-spin"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
        )}
      </div>

      {uploadError && (
        <p className="text-sm px-4 py-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171' }}>
          {uploadError}
        </p>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[1,2,3,4].map((i) => (
            <div key={i} className="skeleton rounded-2xl" style={{ aspectRatio: '1', animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      ) : images.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center" style={{ color: 'var(--muted)' }}>
          <p className="text-sm">Изображения ещё не загружены</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {images.map((img: ProjectImage) => (
            <div
              key={img.id}
              className="card overflow-hidden flex flex-col animate-fade-up"
              style={{ padding: 0 }}
            >
              {/* Thumbnail */}
              <div
                className="relative bg-surface-raised flex items-center justify-center overflow-hidden"
                style={{ aspectRatio: '1' }}
              >
                <img
                  src={img.url}
                  alt={img.original_name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {img.width && img.height && (
                  <span
                    className="absolute bottom-1.5 right-1.5 text-xs px-1.5 py-0.5 rounded-lg font-mono"
                    style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10 }}
                  >
                    {img.width}×{img.height}
                  </span>
                )}
              </div>

              {/* Meta + actions */}
              <div className="p-3 flex flex-col gap-2 flex-1">
                <p
                  className="text-xs truncate font-medium"
                  style={{ color: 'var(--text)' }}
                  title={img.original_name}
                >
                  {img.original_name}
                </p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  {formatSize(img.file_size)}
                </p>
                <div className="flex gap-1.5 mt-auto">
                  <button
                    onClick={() => copyUrl(img.url, img.id)}
                    className="flex-1 text-xs py-1.5 rounded-lg font-medium transition-all duration-150"
                    style={{
                      background: copied === img.id ? 'rgba(16,185,129,0.12)' : 'var(--accent-subtle)',
                      color: copied === img.id ? '#34d399' : 'var(--accent-text)',
                    }}
                  >
                    {copied === img.id ? '✓ Скопировано' : 'Копировать URL'}
                  </button>
                  <button
                    onClick={() => { if (confirm('Удалить изображение?')) deleteMut.mutate(img.id) }}
                    className="px-2 py-1.5 rounded-lg transition-all duration-150"
                    style={{ color: 'var(--muted)', background: 'var(--surface-raised)' }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.color = '#f87171'
                      ;(e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.color = 'var(--muted)'
                      ;(e.currentTarget as HTMLElement).style.background = 'var(--surface-raised)'
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Commander tip */}
      {images.length > 0 && (
        <div
          className="rounded-2xl p-4 text-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="font-medium mb-1" style={{ color: 'var(--text)' }}>Как использовать в Commander</p>
          <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
            Скопируйте URL изображения и вставьте его в столбец <span className="font-mono px-1 rounded" style={{ background: 'var(--surface-raised)' }}>Изображение</span> в Excel-файле кампании.
            Commander скачает изображение с этого URL во время импорта и прикрепит к объявлению.
          </p>
        </div>
      )}
    </div>
  )
}

export default function DirectTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [strategyOpen, setStrategyOpen] = useState(true)
  const [editingStrategy, setEditingStrategy] = useState(false)
  const [strategyText, setStrategyText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [addingCampaign, setAddingCampaign] = useState(false)
  const [newCampaignName, setNewCampaignName] = useState('')
  const [negInput, setNegInput] = useState('')
  const [showSearchQueriesModal, setShowSearchQueriesModal] = useState(false)
  const [directSubSection, setDirectSubSection] = useState<'campaigns' | 'ngrams' | 'heatmap' | 'ab' | 'cluster' | 'checklist' | 'offers' | 'images'>('campaigns')

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
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })
  const updateStrategyMut = useMutation({
    mutationFn: () => directApi.updateStrategy(projectId, strategyText),
    onSuccess: () => { setEditingStrategy(false); qc.invalidateQueries({ queryKey: ['direct-strategy', projectId] }) },
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })
  const createCampaignMut = useMutation({
    mutationFn: () => directApi.createCampaign(projectId, { name: newCampaignName.trim() || 'Новая кампания' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns', projectId] }); setNewCampaignName(''); setAddingCampaign(false) },
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })
  const genNegMut = useMutation({
    mutationFn: () => directApi.generateNegativeKeywords(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['neg-kws', projectId] }),
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })
  const addNegMut = useMutation({
    mutationFn: () => directApi.addNegativeKeyword(projectId, negInput.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['neg-kws', projectId] }); setNegInput('') },
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })
  const delNegMut = useMutation({
    mutationFn: (id: string) => directApi.deleteNegativeKeyword(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['neg-kws', projectId] }),
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Ошибка операции')
    },
  })

  return (
    <div className="p-6 space-y-6">
      {/* Strategy */}
      <div className="border border-[var(--border)] rounded-xl bg-surface overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b cursor-pointer hover:bg-surface-raised"
          onClick={() => setStrategyOpen((v) => !v)}>
          <div className="flex items-center gap-3">
            <span className="text-muted text-xs w-3">{strategyOpen ? '▼' : '▶'}</span>
            <h3 className="font-semibold">Стратегия</h3>
            {isGenerating && <span className="text-xs text-blue-500 animate-pulse">⏳ генерируется...</span>}
          </div>
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            {strategyData?.strategy_text && !editingStrategy && (
              <button onClick={() => { setStrategyText(strategyData.strategy_text || ''); setEditingStrategy(true) }}
                className="text-sm border px-3 py-1 rounded-xl hover:bg-surface-raised">✏️ Редактировать</button>
            )}
            <button onClick={() => genStrategyMut.mutate()} disabled={genStrategyMut.isPending || isGenerating}
              className="btn-accent px-3 py-1.5 rounded-xl text-sm hover:bg-accent disabled:opacity-50">
              {genStrategyMut.isPending || isGenerating ? '⏳ Генерация...' : '✨ Сгенерировать'}
            </button>
          </div>
        </div>
        {strategyOpen && (
          <div className="p-4">
            {editingStrategy ? (
              <div className="space-y-2">
                <textarea rows={14} className="field font-mono"
                  value={strategyText} onChange={(e) => setStrategyText(e.target.value)} />
                <div className="flex gap-2">
                  <button onClick={() => updateStrategyMut.mutate()} disabled={updateStrategyMut.isPending}
                    className="btn-accent px-4 py-2 rounded-xl text-sm hover:bg-accent disabled:opacity-50">
                    {updateStrategyMut.isPending ? 'Сохранение...' : 'Сохранить'}
                  </button>
                  <button onClick={() => setEditingStrategy(false)} className="border px-4 py-2 rounded-xl text-sm hover:bg-surface-raised">Отмена</button>
                </div>
              </div>
            ) : strategyData?.strategy_text ? (
              <pre className="text-sm text-primary whitespace-pre-wrap font-sans leading-relaxed">{strategyData.strategy_text}</pre>
            ) : (
              <p className="text-muted text-sm py-4 text-center">
                Стратегия не сгенерирована. Нажмите «Сгенерировать» — ИИ составит структуру кампаний на основе брифа и данных сайта.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Sub-section navigation */}
      <div className="flex gap-1 flex-wrap">
        {([
          ['campaigns', 'Кампании'],
          ['ngrams', 'N-граммы'],
          ['heatmap', 'Тепловая карта'],
          ['ab', 'A/B сравнение'],
          ['cluster', 'Автокластеризация'],
          ['checklist', '✅ Чеклист запуска'],
          ['offers', '🎯 Оценка офферов'],
          ['images', '🖼 Изображения'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setDirectSubSection(key)}
            className={cx('px-3 py-1.5 text-sm rounded-xl transition',
              directSubSection === key ? 'bg-accent text-white' : 'bg-surface-raised text-muted hover:bg-surface-raised')}>
            {label}
          </button>
        ))}
      </div>

      {/* Campaigns */}
      {directSubSection === 'campaigns' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Кампании ({(campaigns as Campaign[]).length})</h3>
            <button onClick={() => setAddingCampaign(true)}
              className="bg-accent text-white px-3 py-1.5 rounded-xl text-sm hover:bg-accent">
              + Кампания
            </button>
          </div>
          {addingCampaign && (
            <div className="flex gap-2 mb-3">
              <input autoFocus className="field flex-1"
                placeholder="Название кампании..."
                value={newCampaignName}
                onKeyDown={(e) => e.key === 'Enter' && createCampaignMut.mutate()}
                onChange={(e) => setNewCampaignName(e.target.value)} />
              <button onClick={() => createCampaignMut.mutate()} disabled={createCampaignMut.isPending}
                className="bg-accent text-white px-4 py-2 rounded-xl text-sm disabled:opacity-50">Создать</button>
              <button onClick={() => setAddingCampaign(false)} className="border px-4 py-2 rounded-xl text-sm">✕</button>
            </div>
          )}
          <div className="space-y-2">
            {(campaigns as Campaign[]).map((c) => <CampaignBlock key={c.id} campaign={c} projectId={projectId} />)}
            {(campaigns as Campaign[]).length === 0 && (
              <div className="text-center py-10 text-muted border-2 border-dashed rounded-xl">
                <p>Нет кампаний. Сгенерируйте стратегию — она создаст структуру автоматически, или добавьте кампанию вручную.</p>
              </div>
            )}
          </div>

          {/* Negative keywords */}
          <div className="border border-[var(--border)] rounded-xl bg-surface p-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Минус-слова ({(negKws as NegativeKeyword[]).length})</h3>
              <div className="flex gap-2">
                <button onClick={() => setShowSearchQueriesModal(true)}
                  className="border border-[var(--border)] px-3 py-1.5 rounded-xl text-sm hover:bg-surface-raised text-muted">
                  📥 Загрузить запросы
                </button>
                <button onClick={() => genNegMut.mutate()} disabled={genNegMut.isPending}
                  className="btn-accent px-3 py-1.5 rounded-xl text-sm hover:bg-accent disabled:opacity-50">
                  {genNegMut.isPending ? '⏳...' : '✨ Сгенерировать'}
                </button>
              </div>
            </div>
            <div className="flex gap-2 mb-3">
              <input className="field flex-1"
                placeholder="Добавить минус-слово..."
                value={negInput}
                onKeyDown={(e) => e.key === 'Enter' && negInput.trim() && addNegMut.mutate()}
                onChange={(e) => setNegInput(e.target.value)} />
              <button onClick={() => negInput.trim() && addNegMut.mutate()} disabled={!negInput.trim() || addNegMut.isPending}
                className="bg-surface-raised text-primary px-4 py-2 rounded-xl text-sm disabled:opacity-50">+</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(negKws as NegativeKeyword[]).map((nk) => (
                <span key={nk.id} className="inline-flex items-center gap-1 bg-red-50 border border-red-200 text-red-700 text-xs px-2 py-1 rounded-full">
                  -{nk.phrase}
                  <button onClick={() => delNegMut.mutate(nk.id)} className="hover:text-red-900 ml-0.5">✕</button>
                </span>
              ))}
              {(negKws as NegativeKeyword[]).length === 0 && <p className="text-sm text-muted">Нет минус-слов</p>}
            </div>
          </div>
        </div>
      )}

      {directSubSection === 'ngrams' && <NgramsSection projectId={projectId} />}
      {directSubSection === 'heatmap' && <HeatmapSection projectId={projectId} />}
      {directSubSection === 'ab' && <AbSection projectId={projectId} />}
      {directSubSection === 'cluster' && <LocalClusterSection projectId={projectId} />}
      {directSubSection === 'checklist' && <ReadinessCheckSection projectId={projectId} />}
      {directSubSection === 'offers' && <OfferAnalysisSection projectId={projectId} />}
      {directSubSection === 'images' && <ImageLibrarySection projectId={projectId} />}

      {showSearchQueriesModal && (
        <SearchQueriesModal projectId={projectId} onClose={() => setShowSearchQueriesModal(false)} />
      )}
    </div>
  )
}
