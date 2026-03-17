import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { settingsApi, type CrawlerSettings, type AISettings, type UserRecord, type SystemPromptFull } from '../api/settings'
import { useAuthStore } from '../store/auth'

type Tab = 'api-keys' | 'crawler' | 'ai' | 'users' | 'prompts'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

function ApiKeysTab() {
  const qc = useQueryClient()
  const { data: services = [], isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.get('/settings/api-keys').then((r) => r.data),
  })
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({})

  const saveMut = useMutation({
    mutationFn: ({ service, values }: { service: string; values: Record<string, string> }) =>
      api.put(`/settings/api-keys/${service}`, { values }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  })
  const testMut = useMutation({
    mutationFn: (service: string) => api.post(`/settings/api-keys/${service}/test`).then((r) => r.data),
    onSuccess: (data: any, service: string) => setTestResults((r) => ({ ...r, [service]: data })),
  })

  if (isLoading) return <div className="text-gray-500 py-4">Загрузка...</div>

  return (
    <div className="space-y-4">
      {(services as any[]).map((svc) => (
        <div key={svc.service} className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium">{svc.label}</h4>
            <div className="flex gap-2">
              <button onClick={() => {
                  const vals: Record<string, string> = {}
                  svc.keys.forEach((k: any) => { const v = editing[`${svc.service}.${k.key}`]; if (v) vals[k.key] = v })
                  if (Object.keys(vals).length) saveMut.mutate({ service: svc.service, values: vals })
                }}
                className="text-sm bg-primary-600 text-white px-3 py-1 rounded-lg hover:bg-primary-700">Сохранить</button>
              <button onClick={() => testMut.mutate(svc.service)} disabled={testMut.isPending}
                className="text-sm border px-3 py-1 rounded-lg hover:bg-gray-50 disabled:opacity-50">Проверить</button>
            </div>
          </div>
          {svc.keys.map((k: any) => (
            <div key={k.key} className="mb-2">
              <label className="block text-xs text-gray-500 mb-1">{k.key}</label>
              <div className="flex items-center gap-2">
                <input type="password"
                  className="flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder={k.masked || 'Не задан'}
                  value={editing[`${svc.service}.${k.key}`] || ''}
                  onChange={(e) => setEditing((ed) => ({ ...ed, [`${svc.service}.${k.key}`]: e.target.value }))} />
                {k.is_set && <span className="text-green-500 text-xs shrink-0">✓ задан</span>}
              </div>
            </div>
          ))}
          {testResults[svc.service] && (
            <p className={cx('text-sm mt-2', testResults[svc.service].ok ? 'text-green-600' : 'text-red-500')}>
              {testResults[svc.service].ok ? '✅' : '❌'} {testResults[svc.service].message}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function CrawlerTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['crawler-settings'], queryFn: () => settingsApi.getCrawler() })
  const [form, setForm] = useState<Partial<CrawlerSettings>>({})
  const [saved, setSaved] = useState(false)

  const saveMut = useMutation({
    mutationFn: (d: CrawlerSettings) => settingsApi.updateCrawler(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crawler-settings'] }); setSaved(true); setTimeout(() => setSaved(false), 2000) },
  })

  if (isLoading) return <div className="text-gray-500 py-4">Загрузка...</div>

  const cur = { ...data, ...form } as CrawlerSettings

  return (
    <div className="bg-white rounded-lg border p-4 space-y-4">
      <h4 className="font-medium text-sm text-gray-700 uppercase tracking-wide">Параметры парсера</h4>
      <div className="grid grid-cols-2 gap-4">
        {[
          { key: 'crawl_delay_ms', label: 'Задержка (мс)', type: 'number' },
          { key: 'crawl_timeout_seconds', label: 'Таймаут (сек)', type: 'number' },
          { key: 'crawl_max_pages', label: 'Макс. страниц', type: 'number' },
        ].map(({ key, label }) => (
          <div key={key}>
            <label className="block text-sm text-gray-600 mb-1">{label}</label>
            <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={(cur as any)[key] ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))} />
          </div>
        ))}
      </div>
      <div>
        <label className="block text-sm text-gray-600 mb-1">User-Agent</label>
        <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          value={cur.crawl_user_agent ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, crawl_user_agent: e.target.value }))} />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input type="checkbox" className="rounded"
          checked={cur.crawl_respect_robots ?? true}
          onChange={(e) => setForm((f) => ({ ...f, crawl_respect_robots: e.target.checked }))} />
        Соблюдать robots.txt
      </label>
      <div className="flex gap-3 pt-1">
        <button onClick={() => saveMut.mutate(cur)} disabled={saveMut.isPending}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
          {saveMut.isPending ? 'Сохранение...' : 'Сохранить'}
        </button>
        {saved && <span className="text-green-600 text-sm py-2">✅ Сохранено</span>}
      </div>
    </div>
  )
}

const AI_MODELS = ['claude-opus-4-6','claude-sonnet-4-6','claude-haiku-4-5-20251001','claude-sonnet-4-20250514']

function AITab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['ai-settings'], queryFn: () => settingsApi.getAI() })
  const [form, setForm] = useState<Partial<AISettings>>({})
  const [saved, setSaved] = useState(false)

  const saveMut = useMutation({
    mutationFn: (d: AISettings) => settingsApi.updateAI(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ai-settings'] }); setSaved(true); setTimeout(() => setSaved(false), 2000) },
  })

  if (isLoading) return <div className="text-gray-500 py-4">Загрузка...</div>

  const cur = { ...data, ...form } as AISettings

  return (
    <div className="bg-white rounded-lg border p-4 space-y-4">
      <h4 className="font-medium text-sm text-gray-700 uppercase tracking-wide">Параметры ИИ</h4>
      <div>
        <label className="block text-sm text-gray-600 mb-1">Модель Claude</label>
        <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          value={cur.ai_model ?? 'claude-sonnet-4-20250514'}
          onChange={(e) => setForm((f) => ({ ...f, ai_model: e.target.value }))}>
          {AI_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Макс. токенов</label>
          <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={cur.ai_max_tokens ?? 4000}
            onChange={(e) => setForm((f) => ({ ...f, ai_max_tokens: Number(e.target.value) }))} />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Язык</label>
          <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={cur.ai_language ?? 'Русский'}
            onChange={(e) => setForm((f) => ({ ...f, ai_language: e.target.value }))}>
            <option>Русский</option><option>English</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm text-gray-600 mb-1">
          Температура: <strong>{(cur.ai_temperature ?? 0.7).toFixed(1)}</strong>
        </label>
        <input type="range" min="0" max="1" step="0.1" className="w-full"
          value={cur.ai_temperature ?? 0.7}
          onChange={(e) => setForm((f) => ({ ...f, ai_temperature: Number(e.target.value) }))} />
        <div className="flex justify-between text-xs text-gray-400 mt-0.5">
          <span>0 — точно</span><span>1 — творчески</span>
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <button onClick={() => saveMut.mutate(cur)} disabled={saveMut.isPending}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
          {saveMut.isPending ? 'Сохранение...' : 'Сохранить'}
        </button>
        {saved && <span className="text-green-600 text-sm py-2">✅ Сохранено</span>}
      </div>
    </div>
  )
}

const ROLE_LABELS: Record<string, string> = {
  specialist: 'Специалист', admin: 'Администратор', viewer: 'Просмотр', super_admin: 'Супер-admin',
}

function UsersTab() {
  const qc = useQueryClient()
  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: () => settingsApi.listUsers() })
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ login: '', email: '', password: '', role: 'specialist' })
  const [resetId, setResetId] = useState<string | null>(null)
  const [resetPw, setResetPw] = useState('')
  const [createError, setCreateError] = useState('')

  const createMut = useMutation({
    mutationFn: () => settingsApi.createUser(createForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setShowCreate(false); setCreateForm({ login: '', email: '', password: '', role: 'specialist' }); setCreateError('') },
    onError: (e: any) => setCreateError(e.response?.data?.detail || 'Ошибка'),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => settingsApi.updateUser(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
  const resetPwMut = useMutation({
    mutationFn: () => settingsApi.resetPassword(resetId!, resetPw),
    onSuccess: () => { setResetId(null); setResetPw('') },
  })

  if (isLoading) return <div className="text-gray-500 py-4">Загрузка...</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-medium text-sm">Пользователи ({(users as UserRecord[]).length})</h4>
        <button onClick={() => setShowCreate(true)} className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700">+ Добавить</button>
      </div>
      {showCreate && (
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <h5 className="font-medium text-sm">Новый пользователь</h5>
          <div className="grid grid-cols-2 gap-3">
            {[
              { k: 'login', l: 'Логин', t: 'text' },
              { k: 'email', l: 'Email', t: 'email' },
              { k: 'password', l: 'Пароль', t: 'password' },
            ].map(({ k, l, t }) => (
              <div key={k}>
                <label className="block text-xs text-gray-500 mb-1">{l}</label>
                <input type={t} className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={(createForm as any)[k]}
                  onChange={(e) => setCreateForm((f) => ({ ...f, [k]: e.target.value }))} />
              </div>
            ))}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Роль</label>
              <select className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                value={createForm.role} onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}>
                {['specialist','admin','viewer'].map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
          </div>
          {createError && <p className="text-red-500 text-sm">{createError}</p>}
          <div className="flex gap-2">
            <button onClick={() => createMut.mutate()} disabled={createMut.isPending || !createForm.login || !createForm.password}
              className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
              {createMut.isPending ? 'Создание...' : 'Создать'}
            </button>
            <button onClick={() => { setShowCreate(false); setCreateError('') }} className="border px-4 py-2 rounded-lg text-sm">Отмена</button>
          </div>
        </div>
      )}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Логин','Email','Роль','Статус',''].map((h) => (
                <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {(users as UserRecord[]).map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium">{u.login}</td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">{u.email}</td>
                <td className="px-4 py-2.5">
                  <select className="border rounded px-2 py-0.5 text-xs"
                    value={u.role} onChange={(e) => updateMut.mutate({ id: u.id, data: { role: e.target.value } })}>
                    {['specialist','admin','viewer','super_admin'].map((r) => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2.5">
                  <span className={cx('text-xs px-2 py-0.5 rounded-full font-medium', u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                    {u.is_active ? 'активен' : 'отключён'}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setResetId(u.id)} className="text-xs text-gray-500 hover:text-gray-700 border px-2 py-0.5 rounded">🔑</button>
                    <button onClick={() => updateMut.mutate({ id: u.id, data: { is_active: !u.is_active } })}
                      className={cx('text-xs border px-2 py-0.5 rounded', u.is_active ? 'text-red-500 border-red-200 hover:bg-red-50' : 'text-green-600 border-green-200 hover:bg-green-50')}>
                      {u.is_active ? 'Откл.' : 'Вкл.'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {resetId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-72 space-y-4">
            <h3 className="font-semibold">Сброс пароля</h3>
            <input type="password" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Новый пароль" value={resetPw} onChange={(e) => setResetPw(e.target.value)} />
            <div className="flex gap-2">
              <button onClick={() => resetPwMut.mutate()} disabled={!resetPw || resetPwMut.isPending}
                className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm flex-1 disabled:opacity-50">
                {resetPwMut.isPending ? '...' : 'Сохранить'}
              </button>
              <button onClick={() => { setResetId(null); setResetPw('') }} className="border px-4 py-2 rounded-lg text-sm">✕</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PromptsTab() {
  const qc = useQueryClient()
  const { data: prompts = [], isLoading } = useQuery({ queryKey: ['prompts'], queryFn: () => settingsApi.listPrompts() })
  const [selected, setSelected] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [saved, setSaved] = useState(false)

  const { data: promptData, isLoading: promptLoading } = useQuery({
    queryKey: ['prompt', selected],
    queryFn: () => settingsApi.getPrompt(selected!),
    enabled: !!selected,
  })

  const saveMut = useMutation({
    mutationFn: () => settingsApi.updatePrompt(selected!, editText),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prompts'] }); setSaved(true); setTimeout(() => setSaved(false), 2000) },
  })

  if (isLoading) return <div className="text-gray-500 py-4">Загрузка...</div>

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Системные промпты управляют генерацией через ИИ. Редактируйте осторожно.</p>
      <div className="grid grid-cols-3 gap-4" style={{ minHeight: 400 }}>
        <div className="space-y-1">
          {(prompts as any[]).map((p) => (
            <button key={p.name}
              onClick={() => { setSelected(p.name); setEditText(''); setSaved(false) }}
              className={cx('w-full text-left px-3 py-2 rounded-lg text-sm transition',
                selected === p.name ? 'bg-primary-600 text-white' : 'bg-white border hover:bg-gray-50')}>
              <p className="font-medium truncate">{p.name}</p>
              <p className={cx('text-xs', selected === p.name ? 'text-primary-200' : 'text-gray-400')}>{p.module}</p>
            </button>
          ))}
          {prompts.length === 0 && <p className="text-gray-400 text-sm">Нет промптов</p>}
        </div>
        <div className="col-span-2">
          {selected && (promptLoading ? <div className="text-gray-500">Загрузка...</div> :
            promptData ? (
              <div className="space-y-2 h-full flex flex-col">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium text-gray-700">{promptData.name}</p>
                  {saved && <span className="text-green-600 text-sm">✅ Сохранено</span>}
                </div>
                <textarea rows={16}
                  className="flex-1 w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={editText || (promptData as SystemPromptFull).prompt_text}
                  onChange={(e) => setEditText(e.target.value)} />
                <button onClick={() => { if (!editText) setEditText((promptData as SystemPromptFull).prompt_text); saveMut.mutate() }}
                  disabled={saveMut.isPending}
                  className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50 self-start">
                  {saveMut.isPending ? 'Сохранение...' : 'Сохранить промпт'}
                </button>
              </div>
            ) : null
          )}
          {!selected && (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm border rounded-lg bg-white">
              Выберите промпт из списка слева
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState<Tab>('api-keys')

  const isSuperAdmin = user?.role === 'super_admin'
  const isAdmin = user?.role === 'admin' || isSuperAdmin

  const allTabs: { key: Tab; label: string; show: boolean }[] = [
    { key: 'api-keys', label: 'API ключи', show: true },
    { key: 'crawler', label: 'Парсер', show: true },
    { key: 'ai', label: 'ИИ параметры', show: true },
    { key: 'users', label: 'Пользователи', show: isAdmin },
    { key: 'prompts', label: 'Промпты', show: isSuperAdmin },
  ]
  const tabs = allTabs.filter((t) => t.show)

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Настройки</h2>
      <div className="flex gap-1 mb-6 border-b">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cx('px-4 py-2 text-sm font-medium border-b-2 transition -mb-px',
              tab === t.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-600 hover:text-gray-900')}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="max-w-2xl">
        {tab === 'api-keys' && <ApiKeysTab />}
        {tab === 'crawler' && <CrawlerTab />}
        {tab === 'ai' && <AITab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'prompts' && <PromptsTab />}
      </div>
    </div>
  )
}
