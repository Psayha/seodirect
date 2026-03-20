import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { settingsApi, type CrawlerSettings, type AISettings, type UserRecord, type SystemPromptFull } from '../api/settings'
import { useAuthStore } from '../store/auth'

type Tab = 'api-keys' | 'crawler' | 'ai' | 'users' | 'prompts' | 'white-label'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

function Spinner() {
  return (
    <div className="flex items-center gap-2 py-6 text-muted text-sm">
      <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin inline-block" />
      Загрузка...
    </div>
  )
}

function SaveFeedback({ ok }: { ok: boolean }) {
  return (
    <span className={cx('text-sm', ok ? 'text-emerald-600' : 'text-red-500')}>
      {ok ? '✓ Сохранено' : '✗ Ошибка'}
    </span>
  )
}

// ── Card wrapper with optional section title ───────────────────────────────
function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="card-bordered overflow-hidden">
      {title && (
        <div className="px-5 py-3.5 bg-surface-raised border-b border-[var(--border)]">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted">{title}</h4>
        </div>
      )}
      <div className="p-5 space-y-4">{children}</div>
    </div>
  )
}

// ── Field label ────────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-muted mb-1.5">{children}</label>
}

// ── API Keys ────────────────────────────────────────────────────────────────
function ApiKeysTab() {
  const qc = useQueryClient()
  const { data: services = [], isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.get('/settings/api-keys').then((r) => r.data),
  })
  const [editing, setEditing]     = useState<Record<string, string>>({})
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
  const deleteMut = useMutation({
    mutationFn: ({ service, keyName }: { service: string; keyName: string }) =>
      settingsApi.deleteApiKey(service, keyName),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  })

  if (isLoading) return <Spinner />

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {(services as any[]).map((svc) => (
        <div key={svc.service} className="card-bordered overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 bg-surface-raised border-b border-[var(--border)]">
            <h4 className="text-sm font-semibold text-primary">{svc.label}</h4>
            <div className="flex gap-2">
              <button
                onClick={() => testMut.mutate(svc.service)}
                disabled={testMut.isPending}
                className="btn-ghost py-1.5 px-3 text-xs"
              >
                Проверить
              </button>
              <button
                onClick={() => {
                  const vals: Record<string, string> = {}
                  svc.keys.forEach((k: any) => {
                    const v = editing[`${svc.service}.${k.key}`]
                    if (v) vals[k.key] = v
                  })
                  if (Object.keys(vals).length) saveMut.mutate({ service: svc.service, values: vals })
                }}
                className="btn-accent py-1.5 px-3 text-xs"
              >
                Сохранить
              </button>
            </div>
          </div>
          <div className="p-5 space-y-3">
            {svc.keys.map((k: any) => (
              <div key={k.key}>
                <Label>{k.key}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    className="field flex-1"
                    placeholder={k.masked || 'Не задан'}
                    value={editing[`${svc.service}.${k.key}`] || ''}
                    onChange={(e) => setEditing((ed) => ({ ...ed, [`${svc.service}.${k.key}`]: e.target.value }))}
                  />
                  {k.is_set && (
                    <>
                      <span className="text-emerald-600 text-xs shrink-0 font-medium">✓ задан</span>
                      <button
                        onClick={() => {
                          if (confirm(`Удалить ключ ${k.key}?`))
                            deleteMut.mutate({ service: svc.service, keyName: k.key })
                        }}
                        className="btn-danger py-1 px-2 text-xs rounded-lg"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {testResults[svc.service] && (
              <p className={cx('text-sm mt-1', testResults[svc.service].ok ? 'text-emerald-600' : 'text-red-500')}>
                {testResults[svc.service].ok ? '✅' : '❌'} {testResults[svc.service].message}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Crawler ─────────────────────────────────────────────────────────────────
function CrawlerTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['crawler-settings'], queryFn: () => settingsApi.getCrawler() })
  const [form, setForm] = useState<Partial<CrawlerSettings>>({})
  const [saved, setSaved] = useState(false)

  const saveMut = useMutation({
    mutationFn: (d: CrawlerSettings) => settingsApi.updateCrawler(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crawler-settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  if (isLoading) return <Spinner />

  const cur = { ...data, ...form } as CrawlerSettings

  return (
    <Section title="Параметры парсера">
      <div className="grid grid-cols-2 gap-4">
        {[
          { key: 'crawl_delay_ms',        label: 'Задержка (мс)', type: 'number' },
          { key: 'crawl_timeout_seconds', label: 'Таймаут (сек)', type: 'number' },
          { key: 'crawl_max_pages',       label: 'Макс. страниц', type: 'number' },
        ].map(({ key, label }) => (
          <div key={key}>
            <Label>{label}</Label>
            <input type="number" className="field"
              value={(cur as any)[key] ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))} />
          </div>
        ))}
      </div>
      <div>
        <Label>User-Agent</Label>
        <input className="field"
          value={cur.crawl_user_agent ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, crawl_user_agent: e.target.value }))} />
      </div>
      <label className="flex items-center gap-2.5 text-sm text-primary cursor-pointer">
        <input type="checkbox" className="rounded"
          checked={cur.crawl_respect_robots ?? true}
          onChange={(e) => setForm((f) => ({ ...f, crawl_respect_robots: e.target.checked }))} />
        Соблюдать robots.txt
      </label>
      <div className="flex items-center gap-3 pt-1">
        <button onClick={() => saveMut.mutate(cur)} disabled={saveMut.isPending} className="btn-accent">
          {saveMut.isPending ? 'Сохранение...' : 'Сохранить'}
        </button>
        {saved && <SaveFeedback ok />}
      </div>
    </Section>
  )
}

// ── AI ───────────────────────────────────────────────────────────────────────
function AITab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['ai-settings'], queryFn: () => settingsApi.getAI() })
  const [form, setForm] = useState<Partial<AISettings>>({})
  const [saved, setSaved] = useState(false)

  const { data: modelsData, isLoading: modelsLoading, isError: modelsError,
          refetch: refetchModels, isFetching: modelsFetching } = useQuery({
    queryKey: ['ai-models'],
    queryFn: () => api.get('/settings/ai/models').then((r) => r.data as { provider: string; models: { id: string; name: string }[] }),
    retry: false,
  })

  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['llm-tasks'],
    queryFn: () => settingsApi.getLLMTasks(),
  })

  const saveMut = useMutation({
    mutationFn: (d: AISettings) => settingsApi.updateAI(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  const taskMut = useMutation({
    mutationFn: ({ taskId, data: d }: { taskId: string; data: any }) =>
      settingsApi.updateLLMTask(taskId, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['llm-tasks'] }),
  })

  const resetMut = useMutation({
    mutationFn: (taskId: string) => settingsApi.resetLLMTask(taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['llm-tasks'] }),
  })

  const [editingTask, setEditingTask] = useState<string | null>(null)
  const [taskForm, setTaskForm] = useState<{ model?: string; temperature?: number; max_tokens?: number }>({})

  if (isLoading) return <Spinner />

  const cur = { ...data, ...form } as AISettings
  const models = modelsData?.models ?? []

  // Group tasks by group
  const tasks = tasksData?.tasks ?? []
  const groups = tasksData?.groups ?? {}
  const groupedTasks: Record<string, typeof tasks> = {}
  for (const t of tasks) {
    if (!groupedTasks[t.group]) groupedTasks[t.group] = []
    groupedTasks[t.group].push(t)
  }

  return (
    <div className="space-y-6">
      {/* Global defaults */}
      <Section title="Глобальные параметры ИИ (по умолчанию)">
        <p className="text-xs text-muted -mt-1">
          Эти настройки используются, если для конкретной задачи не задано своё значение.
        </p>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label>Модель по умолчанию (OpenRouter)</Label>
            <button
              onClick={() => refetchModels()}
              disabled={modelsFetching}
              className="text-xs text-accent hover:opacity-70 disabled:opacity-40 flex items-center gap-1 transition"
            >
              {modelsFetching ? 'Загрузка...' : '--- Обновить список'}
            </button>
          </div>
          {modelsLoading || modelsFetching ? (
            <div className="field text-muted bg-surface-raised">Загрузка моделей...</div>
          ) : modelsError || models.length === 0 ? (
            <div className="space-y-1.5">
              <input className="field"
                value={cur.ai_model ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, ai_model: e.target.value }))}
                placeholder="anthropic/claude-sonnet-4-6" />
              <p className="text-xs text-amber-600">Введите ID модели вручную или нажмите «Обновить»</p>
            </div>
          ) : (
            <select className="field"
              value={cur.ai_model ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, ai_model: e.target.value }))}>
              {cur.ai_model && !models.find((m) => m.id === cur.ai_model) && (
                <option value={cur.ai_model}>{cur.ai_model} (текущая)</option>
              )}
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name !== m.id ? `${m.name} -- ${m.id}` : m.id}</option>
              ))}
            </select>
          )}
          <p className="text-xs text-muted mt-1">
            Формат: <code className="bg-surface-raised px-1 rounded">provider/model-name</code>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Макс. токенов</Label>
            <input type="number" className="field"
              value={cur.ai_max_tokens ?? 4000}
              onChange={(e) => setForm((f) => ({ ...f, ai_max_tokens: Number(e.target.value) }))} />
          </div>
          <div>
            <Label>Язык</Label>
            <select className="field"
              value={cur.ai_language ?? 'Русский'}
              onChange={(e) => setForm((f) => ({ ...f, ai_language: e.target.value }))}>
              <option>Русский</option>
              <option>English</option>
            </select>
          </div>
        </div>

        <div>
          <Label>Температура: <strong className="text-primary">{(cur.ai_temperature ?? 0.7).toFixed(1)}</strong></Label>
          <input type="range" min="0" max="1" step="0.1" className="w-full accent-accent"
            value={cur.ai_temperature ?? 0.7}
            onChange={(e) => setForm((f) => ({ ...f, ai_temperature: Number(e.target.value) }))} />
          <div className="flex justify-between text-xs text-muted mt-0.5">
            <span>0 -- точно</span><span>1 -- творчески</span>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button onClick={() => saveMut.mutate(cur)} disabled={saveMut.isPending} className="btn-accent">
            {saveMut.isPending ? 'Сохранение...' : 'Сохранить глобальные'}
          </button>
          {saved && <SaveFeedback ok />}
        </div>
      </Section>

      {/* Per-task LLM settings */}
      <Section title="Настройки ИИ по задачам">
        <p className="text-xs text-muted -mt-1">
          Выберите модель, температуру и лимит токенов для каждой задачи. Для экономии можно использовать дешёвые модели на простых задачах, а умные — на сложных.
        </p>

        {tasksLoading ? <Spinner /> : (
          <div className="space-y-6">
            {Object.entries(groupedTasks).map(([groupId, groupTasks]) => (
              <div key={groupId}>
                <h5 className="text-xs font-semibold uppercase tracking-widest text-accent mb-3 border-b border-[var(--border)] pb-2">
                  {groups[groupId] || groupId}
                </h5>
                <div className="space-y-2">
                  {groupTasks.map((t) => {
                    const isEditing = editingTask === t.id
                    const hasOverride = t.model !== null || t.temperature !== null || t.max_tokens !== null
                    const displayModel = t.model || cur.ai_model || t.default_model
                    const displayTemp = t.temperature ?? cur.ai_temperature ?? t.default_temperature
                    const displayTokens = t.max_tokens ?? cur.ai_max_tokens ?? t.default_max_tokens

                    return (
                      <div key={t.id} className="card-bordered overflow-hidden">
                        <div
                          className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-surface-raised/50 transition"
                          onClick={() => {
                            if (isEditing) {
                              setEditingTask(null)
                            } else {
                              setEditingTask(t.id)
                              setTaskForm({
                                model: t.model || '',
                                temperature: t.temperature ?? t.default_temperature,
                                max_tokens: t.max_tokens ?? t.default_max_tokens,
                              })
                            }
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-primary">{t.label}</span>
                              {hasOverride && (
                                <span className="badge badge-purple text-[10px] py-0 px-1.5">настроено</span>
                              )}
                            </div>
                            <p className="text-xs text-muted truncate mt-0.5">{t.description}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-4">
                            <span className="text-xs text-muted font-mono">{displayModel.split('/').pop()}</span>
                            <span className="text-xs text-muted">t={displayTemp.toFixed(1)}</span>
                            <span className="text-xs text-muted">{displayTokens}tk</span>
                            <span className="text-muted text-xs">{isEditing ? '---' : '+'}</span>
                          </div>
                        </div>

                        {isEditing && (
                          <div className="px-4 pb-4 pt-2 border-t border-[var(--border)] bg-surface-raised/30 space-y-3">
                            <div>
                              <Label>Модель (пусто = глобальная)</Label>
                              {models.length > 0 ? (
                                <select className="field"
                                  value={taskForm.model || ''}
                                  onChange={(e) => setTaskForm((f) => ({ ...f, model: e.target.value }))}>
                                  <option value="">-- Глобальная ({cur.ai_model || 'не задана'}) --</option>
                                  {taskForm.model && !models.find((m) => m.id === taskForm.model) && taskForm.model !== '' && (
                                    <option value={taskForm.model}>{taskForm.model} (текущая)</option>
                                  )}
                                  {models.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.name !== m.id ? `${m.name} -- ${m.id}` : m.id}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input className="field"
                                  value={taskForm.model || ''}
                                  onChange={(e) => setTaskForm((f) => ({ ...f, model: e.target.value }))}
                                  placeholder={`Глобальная: ${cur.ai_model || t.default_model}`} />
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label>Температура: <strong className="text-primary">{(taskForm.temperature ?? t.default_temperature).toFixed(1)}</strong></Label>
                                <input type="range" min="0" max="1" step="0.1" className="w-full accent-accent"
                                  value={taskForm.temperature ?? t.default_temperature}
                                  onChange={(e) => setTaskForm((f) => ({ ...f, temperature: Number(e.target.value) }))} />
                                <div className="flex justify-between text-xs text-muted mt-0.5">
                                  <span>0 -- точно</span><span>1 -- творчески</span>
                                </div>
                              </div>
                              <div>
                                <Label>Макс. токенов</Label>
                                <input type="number" className="field"
                                  value={taskForm.max_tokens ?? t.default_max_tokens}
                                  onChange={(e) => setTaskForm((f) => ({ ...f, max_tokens: Number(e.target.value) }))} />
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={() => {
                                  const payload: any = {}
                                  if (taskForm.model) payload.model = taskForm.model
                                  if (taskForm.temperature !== undefined) payload.temperature = taskForm.temperature
                                  if (taskForm.max_tokens !== undefined) payload.max_tokens = taskForm.max_tokens
                                  taskMut.mutate({ taskId: t.id, data: payload })
                                  setEditingTask(null)
                                }}
                                disabled={taskMut.isPending}
                                className="btn-accent py-1.5 px-3 text-xs"
                              >
                                Сохранить
                              </button>
                              {hasOverride && (
                                <button
                                  onClick={() => {
                                    resetMut.mutate(t.id)
                                    setEditingTask(null)
                                  }}
                                  disabled={resetMut.isPending}
                                  className="btn-ghost py-1.5 px-3 text-xs text-amber-600"
                                >
                                  Сбросить к глобальным
                                </button>
                              )}
                              <button
                                onClick={() => setEditingTask(null)}
                                className="btn-ghost py-1.5 px-3 text-xs"
                              >
                                Отмена
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

// ── White Label ──────────────────────────────────────────────────────────────
function WhiteLabelTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['white-label-settings'],
    queryFn: () => api.get('/settings/white-label').then((r) => r.data),
  })
  const [form, setForm] = useState<{ white_label_agency_name?: string; white_label_logo_url?: string; white_label_primary_color?: string }>({})
  const [saved, setSaved] = useState(false)

  const saveMut = useMutation({
    mutationFn: (d: any) => api.put('/settings/white-label', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['white-label-settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  if (isLoading) return <Spinner />

  const cur = { ...data, ...form }

  return (
    <Section title="White Label — брендинг PDF">
      <p className="text-sm text-muted -mt-1">Используется при экспорте HTML/PDF стратегии для клиента.</p>
      <div>
        <Label>Название агентства</Label>
        <input className="field"
          value={cur.white_label_agency_name ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, white_label_agency_name: e.target.value }))} />
      </div>
      <div>
        <Label>URL логотипа</Label>
        <input placeholder="https://agency.ru/logo.png" className="field"
          value={cur.white_label_logo_url ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, white_label_logo_url: e.target.value }))} />
        {cur.white_label_logo_url && (
          <img src={cur.white_label_logo_url} alt="logo preview"
               className="mt-2 h-10 object-contain border border-[var(--border)] rounded-lg" />
        )}
      </div>
      <div>
        <Label>Цвет бренда (hex)</Label>
        <div className="flex items-center gap-2">
          <input type="color"
            value={cur.white_label_primary_color ?? '#1e40af'}
            onChange={(e) => setForm((f) => ({ ...f, white_label_primary_color: e.target.value }))}
            className="w-10 h-10 rounded-lg border border-[var(--border)] cursor-pointer p-0.5" />
          <input className="field flex-1"
            value={cur.white_label_primary_color ?? '#1e40af'}
            onChange={(e) => setForm((f) => ({ ...f, white_label_primary_color: e.target.value }))} />
        </div>
      </div>
      <div className="flex items-center gap-3 pt-1">
        <button onClick={() => saveMut.mutate(cur)} disabled={saveMut.isPending} className="btn-accent">
          {saveMut.isPending ? 'Сохранение...' : 'Сохранить'}
        </button>
        {saved && <SaveFeedback ok />}
      </div>
    </Section>
  )
}

// ── Users ────────────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  specialist: 'Специалист', admin: 'Администратор', viewer: 'Просмотр', super_admin: 'Супер-admin',
}

function UsersTab() {
  const qc = useQueryClient()
  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: () => settingsApi.listUsers() })
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ login: '', email: '', password: '', role: 'specialist' })
  const [resetId, setResetId]       = useState<string | null>(null)
  const [resetPw, setResetPw]       = useState('')
  const [createError, setCreateError] = useState('')

  const createMut = useMutation({
    mutationFn: () => settingsApi.createUser(createForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setShowCreate(false)
      setCreateForm({ login: '', email: '', password: '', role: 'specialist' })
      setCreateError('')
    },
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

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted">
          {(users as UserRecord[]).length} пользователей
        </p>
        <button onClick={() => setShowCreate(true)} className="btn-accent py-2 px-4 text-sm">
          + Добавить
        </button>
      </div>

      {showCreate && (
        <div className="card-bordered overflow-hidden">
          <div className="px-5 py-3.5 bg-surface-raised border-b border-[var(--border)]">
            <h5 className="text-sm font-semibold text-primary">Новый пользователь</h5>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { k: 'login',    l: 'Логин',  t: 'text' },
                { k: 'email',    l: 'Email',  t: 'email' },
                { k: 'password', l: 'Пароль', t: 'password' },
              ].map(({ k, l, t }) => (
                <div key={k}>
                  <Label>{l}</Label>
                  <input type={t} className="field"
                    value={(createForm as any)[k]}
                    onChange={(e) => setCreateForm((f) => ({ ...f, [k]: e.target.value }))} />
                </div>
              ))}
              <div>
                <Label>Роль</Label>
                <select className="field"
                  value={createForm.role}
                  onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}>
                  {['specialist','admin','viewer'].map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
            </div>
            {createError && <p className="text-red-500 text-sm">{createError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending || !createForm.login || !createForm.password}
                className="btn-accent"
              >
                {createMut.isPending ? 'Создание...' : 'Создать'}
              </button>
              <button onClick={() => { setShowCreate(false); setCreateError('') }} className="btn-ghost">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card-bordered overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {['Логин','Email','Роль','Статус',''].map((h) => (
                <th key={h} className="table-head">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {(users as UserRecord[]).map((u) => (
              <tr key={u.id} className="table-row">
                <td className="table-cell font-medium">{u.login}</td>
                <td className="table-cell text-muted text-xs">{u.email}</td>
                <td className="table-cell">
                  <select
                    className="field py-1 px-2 text-xs rounded-lg"
                    value={u.role}
                    onChange={(e) => updateMut.mutate({ id: u.id, data: { role: e.target.value } })}
                  >
                    {['specialist','admin','viewer','super_admin'].map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                    ))}
                  </select>
                </td>
                <td className="table-cell">
                  <span className={cx('badge', u.is_active ? 'badge-green' : 'badge-gray')}>
                    {u.is_active ? 'активен' : 'отключён'}
                  </span>
                </td>
                <td className="table-cell">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setResetId(u.id)}
                      className="btn-ghost py-1 px-2.5 text-xs rounded-lg">
                      🔑
                    </button>
                    <button
                      onClick={() => updateMut.mutate({ id: u.id, data: { is_active: !u.is_active } })}
                      className={cx(
                        'btn py-1 px-2.5 text-xs rounded-lg border transition',
                        u.is_active
                          ? 'text-red-500 border-red-500/30 hover:bg-red-500/10'
                          : 'text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10'
                      )}
                    >
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-80 space-y-4 shadow-card-lg">
            <h3 className="font-semibold text-primary">Сброс пароля</h3>
            <input type="password" className="field"
              placeholder="Новый пароль" value={resetPw}
              onChange={(e) => setResetPw(e.target.value)} />
            <div className="flex gap-2">
              <button
                onClick={() => resetPwMut.mutate()}
                disabled={!resetPw || resetPwMut.isPending}
                className="btn-accent flex-1"
              >
                {resetPwMut.isPending ? '...' : 'Сохранить'}
              </button>
              <button onClick={() => { setResetId(null); setResetPw('') }} className="btn-ghost px-4">
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Prompts ──────────────────────────────────────────────────────────────────
function PromptsTab() {
  const qc = useQueryClient()
  const { data: prompts = [], isLoading } = useQuery({ queryKey: ['prompts'], queryFn: () => settingsApi.listPrompts() })
  const [selected, setSelected]       = useState<string | null>(null)
  const [editText, setEditText]       = useState('')
  const [saved, setSaved]             = useState(false)
  const [showCreate, setShowCreate]   = useState(false)
  const [createForm, setCreateForm]   = useState({ name: '', module: 'custom', prompt_text: '' })
  const [createError, setCreateError] = useState('')

  const { data: promptData, isLoading: promptLoading } = useQuery({
    queryKey: ['prompt', selected],
    queryFn: () => settingsApi.getPrompt(selected!),
    enabled: !!selected,
  })

  const saveMut = useMutation({
    mutationFn: () => settingsApi.updatePrompt(selected!, editText),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prompts'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })
  const createMut = useMutation({
    mutationFn: () => settingsApi.createPrompt(createForm),
    onSuccess: (p: any) => {
      qc.invalidateQueries({ queryKey: ['prompts'] })
      setShowCreate(false)
      setCreateForm({ name: '', module: 'custom', prompt_text: '' })
      setCreateError('')
      setSelected(p.name)
    },
    onError: (e: any) => setCreateError(e.response?.data?.detail || 'Ошибка'),
  })
  const deleteMut = useMutation({
    mutationFn: (name: string) => settingsApi.deletePrompt(name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prompts'] }); setSelected(null); setEditText('') },
  })

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Системные промпты для генерации ИИ. Редактируйте осторожно.</p>
        <button onClick={() => setShowCreate(true)} className="btn-accent py-2 px-4 text-sm shrink-0">
          + Добавить
        </button>
      </div>

      {showCreate && (
        <div className="card-bordered overflow-hidden">
          <div className="px-5 py-3.5 bg-surface-raised border-b border-[var(--border)]">
            <h5 className="text-sm font-semibold text-primary">Новый промпт</h5>
          </div>
          <div className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Название (уникальное)</Label>
                <input className="field"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="my_custom_prompt" />
              </div>
              <div>
                <Label>Модуль</Label>
                <input className="field"
                  value={createForm.module}
                  onChange={(e) => setCreateForm((f) => ({ ...f, module: e.target.value }))}
                  placeholder="direct / seo / custom" />
              </div>
            </div>
            <div>
              <Label>Текст промпта</Label>
              <textarea rows={8} className="field font-mono"
                value={createForm.prompt_text}
                onChange={(e) => setCreateForm((f) => ({ ...f, prompt_text: e.target.value }))}
                placeholder="Вы — эксперт по..." />
            </div>
            {createError && <p className="text-red-500 text-sm">{createError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending || !createForm.name || !createForm.prompt_text}
                className="btn-accent"
              >
                {createMut.isPending ? 'Создание...' : 'Создать'}
              </button>
              <button onClick={() => { setShowCreate(false); setCreateError('') }} className="btn-ghost">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4" style={{ minHeight: 400 }}>
        {/* List */}
        <div className="space-y-1">
          {(prompts as any[]).map((p) => (
            <div key={p.name} className="flex items-center gap-1.5">
              <button
                onClick={() => { setSelected(p.name); setEditText(''); setSaved(false) }}
                className={cx(
                  'flex-1 text-left px-3 py-2.5 rounded-xl text-sm transition',
                  selected === p.name
                    ? 'text-white font-medium'
                    : 'card-bordered hover:shadow-card-md'
                )}
                style={selected === p.name
                  ? { background: 'var(--accent)' }
                  : undefined}
              >
                <p className="font-medium truncate">{p.name}</p>
                <p className={cx('text-xs mt-0.5', selected === p.name ? 'text-white/60' : 'text-muted')}>
                  {p.module}
                </p>
              </button>
              <button
                onClick={() => { if (confirm(`Удалить промпт "${p.name}"?`)) deleteMut.mutate(p.name) }}
                className="btn-danger py-1 px-2 text-xs rounded-lg shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
          {prompts.length === 0 && <p className="text-muted text-sm py-4">Нет промптов</p>}
        </div>

        {/* Editor */}
        <div className="col-span-2">
          {selected && (promptLoading ? <Spinner /> :
            promptData ? (
              <div className="space-y-3 h-full flex flex-col">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-semibold text-primary">
                    {promptData.name}
                    <span className="ml-2 text-xs font-normal text-muted">{promptData.module}</span>
                  </p>
                  {saved && <SaveFeedback ok />}
                </div>
                <textarea
                  rows={16}
                  className="field flex-1 font-mono text-xs"
                  value={editText || (promptData as SystemPromptFull).prompt_text}
                  onChange={(e) => setEditText(e.target.value)}
                />
                <button
                  onClick={() => { if (!editText) setEditText((promptData as SystemPromptFull).prompt_text); saveMut.mutate() }}
                  disabled={saveMut.isPending}
                  className="btn-accent self-start"
                >
                  {saveMut.isPending ? 'Сохранение...' : 'Сохранить промпт'}
                </button>
              </div>
            ) : null
          )}
          {!selected && (
            <div className="h-full flex items-center justify-center text-muted text-sm card-bordered rounded-2xl">
              Выберите промпт из списка слева
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const user       = useAuthStore((s) => s.user)
  const [tab, setTab] = useState<Tab>('api-keys')

  const isSuperAdmin = user?.role === 'super_admin'
  const isAdmin      = user?.role === 'admin' || isSuperAdmin

  const allTabs: { key: Tab; label: string; show: boolean }[] = [
    { key: 'api-keys',    label: 'API ключи',     show: true },
    { key: 'crawler',     label: 'Парсер',         show: true },
    { key: 'ai',          label: 'ИИ параметры',   show: true },
    { key: 'white-label', label: 'White Label',    show: isAdmin },
    { key: 'users',       label: 'Пользователи',   show: isAdmin },
    { key: 'prompts',     label: 'Промпты',        show: isSuperAdmin },
  ]
  const tabs = allTabs.filter((t) => t.show)

  return (
    <div className="p-6">
      <h2 className="page-title mb-5">Настройки</h2>

      <div className="tab-bar mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cx('tab-item', tab === t.key ? 'active' : '')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={cx(
        tab === 'api-keys' || tab === 'users' || tab === 'prompts' || tab === 'ai' ? 'max-w-5xl' : 'max-w-2xl'
      )}>
        {tab === 'api-keys'    && <ApiKeysTab />}
        {tab === 'crawler'     && <CrawlerTab />}
        {tab === 'ai'          && <AITab />}
        {tab === 'white-label' && <WhiteLabelTab />}
        {tab === 'users'       && <UsersTab />}
        {tab === 'prompts'     && <PromptsTab />}
      </div>
    </div>
  )
}
