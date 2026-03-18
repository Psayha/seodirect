import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { directApi, type Campaign, type AdGroup, type Keyword, type Ad, type NegativeKeyword } from '../../api/direct'

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

function WordstatSparkline({ phrase }: { phrase: string }) {
  const { data, isFetching } = useQuery({
    queryKey: ['wordstat-dynamics', phrase],
    queryFn: () => directApi.getKeywordDynamics(phrase),
    staleTime: 5 * 60 * 1000,
  })
  if (isFetching) return <span className="text-xs text-gray-400">⏳</span>
  const items = data?.dynamics?.slice(-12) ?? []
  if (!items.length) return <span className="text-xs text-gray-400 italic">нет данных</span>
  const max = Math.max(...items.map((d: any) => d.count), 1)
  return (
    <div className="flex items-end gap-0.5 h-8">
      {items.map((d: any, i: number) => (
        <div key={i} title={`${d.year_month}: ${d.count.toLocaleString()}`}
          className="w-2 bg-primary-400 hover:bg-primary-600 rounded-sm transition-all cursor-default"
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
              <div key={kw.id} className="bg-white border rounded text-sm">
                <div className="flex items-center gap-2 py-1.5 px-2 hover:bg-gray-50">
                  <TempBadge temp={kw.temperature} />
                  <span className="flex-1 font-mono text-xs">{kw.phrase}</span>
                  {kw.frequency !== null && (
                    <span className="text-xs text-gray-500 tabular-nums w-16 text-right">{kw.frequency.toLocaleString()}</span>
                  )}
                  <StatusBadge status={kw.status} />
                  <button
                    title="Сезонность (Wordstat)"
                    onClick={() => setDynamicsKw(dynamicsKw === kw.phrase ? null : kw.phrase)}
                    className={cx('text-xs px-1.5 py-0.5 rounded transition', dynamicsKw === kw.phrase ? 'bg-primary-100 text-primary-700' : 'text-gray-400 hover:text-primary-600')}>
                    📈
                  </button>
                  <button onClick={() => delKwMut.mutate(kw.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                </div>
                {dynamicsKw === kw.phrase && (
                  <div className="px-3 pb-2 border-t bg-gray-50">
                    <p className="text-xs text-gray-500 mb-1">Сезонность за 12 мес. (Wordstat)</p>
                    <WordstatSparkline phrase={kw.phrase} />
                  </div>
                )}
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
  })
  const updateMut = useMutation({
    mutationFn: () => directApi.updateCampaign(campaign.id, {
      name: editForm.name,
      type: editForm.type || undefined,
      budget_monthly: editForm.budget_monthly ? Number(editForm.budget_monthly) : undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns', projectId] }); setEditing(false) },
  })
  const saveSitelinksMut = useMutation({
    mutationFn: () => directApi.updateCampaign(campaign.id, { sitelinks }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns', projectId] }); setEditingSitelinks(false) },
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
          <div className="border rounded-lg bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Быстрые ссылки (до 4)</span>
              {!editingSitelinks ? (
                <button onClick={() => setEditingSitelinks(true)} className="text-xs text-primary-600 hover:text-primary-700">✏️ Редактировать</button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => saveSitelinksMut.mutate()} disabled={saveSitelinksMut.isPending}
                    className="text-xs bg-primary-600 text-white px-2 py-1 rounded hover:bg-primary-700 disabled:opacity-50">
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
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium">+ Добавить ссылку</button>
                )}
              </div>
            ) : sitelinks.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Нет быстрых ссылок</p>
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
    <div className="border rounded-lg bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">N-граммы</h3>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {[2, 3].map(v => (
              <button key={v} onClick={() => setN(v)}
                className={cx('px-3 py-1.5 text-sm rounded-lg transition',
                  n === v ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                {v}-грамм
              </button>
            ))}
          </div>
          <button onClick={() => refetch()} disabled={isFetching}
            className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
            {isFetching ? '⏳ Анализ...' : 'Анализировать N-граммы'}
          </button>
        </div>
      </div>
      {ngrams.length > 0 && (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2 text-left text-xs text-gray-500">N-грамм</th>
                <th className="px-3 py-2 text-right text-xs text-gray-500 w-32">Вхождений</th>
                <th className="px-3 py-2 text-left text-xs text-gray-500">Примеры ключей</th>
              </tr>
            </thead>
            <tbody>
              {ngrams.map((ng: any, i: number) => (
                <>
                  <tr key={i} className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelected(selected === ng.ngram ? null : ng.ngram)}>
                    <td className="px-3 py-2 font-mono font-medium text-gray-800">{ng.ngram}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{ng.count}</td>
                    <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-xs">
                      {(ng.examples || []).slice(0, 3).join(', ')}
                    </td>
                  </tr>
                  {selected === ng.ngram && ng.keywords && (
                    <tr key={`${i}-detail`}>
                      <td colSpan={3} className="px-3 py-2 bg-blue-50">
                        <p className="text-xs font-medium text-blue-700 mb-1">Все ключи с этим N-граммом:</p>
                        <div className="flex flex-wrap gap-1">
                          {ng.keywords.map((kw: string, j: number) => (
                            <span key={j} className="text-xs bg-white border border-blue-200 text-blue-700 px-2 py-0.5 rounded">{kw}</span>
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
        <p className="text-sm text-gray-400 py-4 text-center">Нет данных. Добавьте ключевые фразы и повторите анализ.</p>
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
    if (!count) return 'bg-gray-50 text-gray-300'
    const opacity = count >= 50 ? 'opacity-100' : count >= 20 ? 'opacity-70' : count >= 5 ? 'opacity-40' : 'opacity-20'
    if (temp === 'hot') return `bg-red-500 text-white ${opacity}`
    if (temp === 'warm') return `bg-orange-400 text-white ${opacity}`
    if (temp === 'cold') return `bg-blue-500 text-white ${opacity}`
    return `bg-gray-400 text-white ${opacity}`
  }

  return (
    <div className="border rounded-lg bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Тепловая карта ключей</h3>
        <button onClick={() => refetch()} disabled={isFetching}
          className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
          {isFetching ? '⏳ Загрузка...' : 'Обновить'}
        </button>
      </div>

      {Object.keys(heatmap).length > 0 && (
        <>
          <div className="overflow-auto mb-4">
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 bg-gray-50 border">Темп. / Частота</th>
                  {FREQ_RANGES.map((r, i) => (
                    <th key={i} className="px-3 py-2 text-center text-gray-500 bg-gray-50 border w-24">{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TEMPS.map(temp => (
                  <tr key={temp}>
                    <td className="px-3 py-2 font-medium text-gray-700 bg-gray-50 border">{TEMP_LABELS[temp]}</td>
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
                    <span className="text-gray-400">({pct}%)</span>
                  </div>
                )
              })}
              <div className="flex items-center gap-2 ml-auto text-gray-500">
                <span>Всего: <strong>{summary.total || 0}</strong></span>
              </div>
            </div>
          )}
        </>
      )}
      {!isFetching && !data && (
        <p className="text-sm text-gray-400 py-4 text-center">Нажмите «Обновить» для загрузки тепловой карты</p>
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
  })

  const groups: any[] = data?.groups || []

  if (isLoading) return <div className="p-4 text-gray-400 text-sm">Загрузка A/B статистики...</div>

  return (
    <div className="border rounded-lg bg-white p-4">
      <h3 className="font-semibold mb-3">A/B сравнение объявлений</h3>
      {groups.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-2xl mb-2">🧪</p>
          <p className="text-sm">Нет групп с несколькими вариантами объявлений</p>
        </div>
      ) : groups.map((group: any, gi: number) => (
        <div key={gi} className="mb-6">
          <p className="text-sm font-medium text-gray-600 mb-2">Группа: {group.group_name}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(group.ads || []).map((ad: any) => (
              <div key={ad.id} className={cx('border rounded-lg p-3 text-sm', ad.is_winner ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white')}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">Вариант {ad.variant}</span>
                  <div className="flex items-center gap-2">
                    {ad.is_winner && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">🏆 Победитель</span>}
                    <StatusBadge status={ad.status} />
                  </div>
                </div>
                <p className="font-medium text-gray-800 leading-snug text-xs">
                  {ad.headline1}{ad.headline2 ? ` | ${ad.headline2}` : ''}{ad.headline3 ? ` | ${ad.headline3}` : ''}
                </p>
                <p className="text-gray-500 text-xs mt-1 line-clamp-2">{ad.text}</p>
                {!ad.is_winner && (
                  <button onClick={() => winnerMut.mutate(ad.id)} disabled={winnerMut.isPending}
                    className="mt-2 text-xs bg-primary-600 text-white px-2.5 py-1 rounded hover:bg-primary-700 disabled:opacity-50">
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
  })

  const toggleAll = () => {
    if (!results) return
    if (selected.size === results.length) setSelected(new Set())
    else setSelected(new Set(results.map((_: any, i: number) => i)))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold">Анализ поисковых запросов</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">
          {!results ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Вставьте список поисковых запросов (по одному на строке)</label>
              <textarea rows={8} value={queries} onChange={e => setQueries(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="купить диван недорого&#10;диван купить цена&#10;детский диван со скидкой..." />
              <button onClick={() => analyzeMut.mutate()} disabled={analyzeMut.isPending || !queries.trim()}
                className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                {analyzeMut.isPending ? '⏳ Анализ...' : 'Анализировать'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">Найдено {results.length} рекомендаций</p>
                <button onClick={toggleAll} className="text-xs text-primary-600 hover:text-primary-700">
                  {selected.size === results.length ? 'Снять все' : 'Выбрать все'}
                </button>
              </div>
              {results.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Минус-слов не найдено</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="px-3 py-2 w-8"></th>
                      <th className="px-3 py-2 text-left text-xs text-gray-500">Минус-слово</th>
                      <th className="px-3 py-2 text-left text-xs text-gray-500">Причина</th>
                      <th className="px-3 py-2 text-left text-xs text-gray-500">Уровень</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r: any, i: number) => (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={selected.has(i)}
                            onChange={() => setSelected(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })} />
                        </td>
                        <td className="px-3 py-2 font-mono font-medium text-gray-800">-{r.phrase}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{r.reason}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{r.block || 'general'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={() => addNegMut.mutate()} disabled={addNegMut.isPending || selected.size === 0}
                  className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                  {addNegMut.isPending ? 'Добавление...' : `Добавить выбранные (${selected.size})`}
                </button>
                <button onClick={() => setResults(null)} className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Назад</button>
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
    <div className="bg-white border rounded-lg overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition"
        onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center gap-3">
          <span className="font-medium text-sm">{cluster.name}</span>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{cluster.keywords?.length ?? 0} фраз</span>
          {cluster.total_volume > 0 && (
            <span className="text-xs text-blue-600">~{cluster.total_volume.toLocaleString()} показов</span>
          )}
        </div>
        <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
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
  })

  return (
    <div className="border rounded-lg bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Автокластеризация (локальная)</h3>
        <button onClick={() => clusterMut.mutate()} disabled={clusterMut.isPending}
          className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
          {clusterMut.isPending ? '⏳ Кластеризация...' : 'Автокластеризация (локальная)'}
        </button>
      </div>
      {clusterMut.isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-3">
          ❌ Ошибка кластеризации
        </div>
      )}
      {clusters && clusters.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">Найдено кластеров: <strong>{clusters.length}</strong></p>
          {clusters.map((cl: any, i: number) => (
            <ClusterCard key={i} cluster={cl} />
          ))}
        </div>
      )}
      {clusters && clusters.length === 0 && (
        <p className="text-sm text-gray-400 py-4 text-center">Нет кластеров. Добавьте ключевые фразы.</p>
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
  const [directSubSection, setDirectSubSection] = useState<'campaigns' | 'ngrams' | 'heatmap' | 'ab' | 'cluster'>('campaigns')

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

      {/* Sub-section navigation */}
      <div className="flex gap-1 flex-wrap">
        {([
          ['campaigns', 'Кампании'],
          ['ngrams', 'N-граммы'],
          ['heatmap', 'Тепловая карта'],
          ['ab', 'A/B сравнение'],
          ['cluster', 'Автокластеризация'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setDirectSubSection(key)}
            className={cx('px-3 py-1.5 text-sm rounded-lg transition',
              directSubSection === key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
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

          {/* Negative keywords */}
          <div className="border rounded-lg bg-white p-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Минус-слова ({(negKws as NegativeKeyword[]).length})</h3>
              <div className="flex gap-2">
                <button onClick={() => setShowSearchQueriesModal(true)}
                  className="border border-gray-300 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 text-gray-600">
                  📥 Загрузить запросы
                </button>
                <button onClick={() => genNegMut.mutate()} disabled={genNegMut.isPending}
                  className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                  {genNegMut.isPending ? '⏳...' : '✨ Сгенерировать'}
                </button>
              </div>
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
      )}

      {directSubSection === 'ngrams' && <NgramsSection projectId={projectId} />}
      {directSubSection === 'heatmap' && <HeatmapSection projectId={projectId} />}
      {directSubSection === 'ab' && <AbSection projectId={projectId} />}
      {directSubSection === 'cluster' && <LocalClusterSection projectId={projectId} />}

      {showSearchQueriesModal && (
        <SearchQueriesModal projectId={projectId} onClose={() => setShowSearchQueriesModal(false)} />
      )}
    </div>
  )
}
