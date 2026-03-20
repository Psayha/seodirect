import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { marketingApi, SemanticMode, SemanticProject, SemanticKeyword } from '../../api/marketing'
import { tasksApi, TaskResult } from '../../api/tasks'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Проект', desc: 'Создание' },
  { label: 'Маски', desc: 'Сбор статистики' },
  { label: 'Расширение', desc: 'Семантика' },
  { label: 'Очистка', desc: 'Фильтрация' },
  { label: 'Кластеры', desc: 'Группировка' },
  { label: 'Экспорт', desc: 'Скачать' },
]

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-0 mb-6 overflow-x-auto pb-1">
      {STEPS.map((s, i) => {
        const done = i < step
        const active = i === step
        return (
          <div key={i} className="flex items-center flex-shrink-0">
            <div className="flex flex-col items-center">
              <div
                className={cx(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition',
                  done
                    ? 'bg-accent border-accent text-white'
                    : active
                    ? 'bg-white border-accent text-accent'
                    : 'bg-white border-[var(--border)] text-muted'
                )}
              >
                {done ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={cx(
                  'mt-1 text-[10px] whitespace-nowrap',
                  active ? 'text-accent font-medium' : done ? 'text-primary' : 'text-muted'
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cx(
                  'h-0.5 w-8 mx-1 mt-[-10px] transition',
                  i < step ? 'bg-accent' : 'bg-[var(--border)]'
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

function CreateModal({
  mode,
  onClose,
  onCreated,
  projectId,
}: {
  mode: SemanticMode
  onClose: () => void
  onCreated: (sp: SemanticProject) => void
  projectId: string
}) {
  const [name, setName] = useState(mode === 'seo' ? 'SEO-семантика' : 'Семантика Директ')
  const [region, setRegion] = useState('')
  const [isSeasonal, setIsSeasonal] = useState(false)
  const [err, setErr] = useState('')

  const mut = useMutation({
    mutationFn: () =>
      marketingApi.create(projectId, {
        name: name.trim(),
        mode,
        region: region.trim() || null,
        is_seasonal: isSeasonal,
      }),
    onSuccess: (sp) => onCreated(sp),
    onError: (e: any) => setErr(e?.response?.data?.detail || 'Ошибка создания'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="font-semibold text-base">
          Новый семантический проект — {mode === 'seo' ? 'SEO' : 'Яндекс Директ'}
        </h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">Название проекта</label>
            <input
              className="input w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="SEO-семантика"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Регион (необязательно)</label>
            <input
              className="input w-full"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Москва"
            />
            <p className="text-[11px] text-muted mt-1">
              Используется для фильтрации частотности в Wordstat
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isSeasonal}
              onChange={(e) => setIsSeasonal(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-primary">Сезонный бизнес</span>
            <span className="text-xs text-muted">(не удалять нулевые ключи при очистке)</span>
          </label>
        </div>

        {err && <p className="text-xs text-red-500">{err}</p>}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-ghost px-4 py-1.5 text-sm">
            Отмена
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={!name.trim() || mut.isPending}
            className="btn-primary px-4 py-1.5 text-sm"
          >
            {mut.isPending ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Step 2: Masks ────────────────────────────────────────────────────────────

function MasksStep({
  projectId,
  sp,
  onStepAdvance,
}: {
  projectId: string
  sp: SemanticProject
  onStepAdvance: () => void
}) {
  const qc = useQueryClient()
  const [masksText, setMasksText] = useState('')
  const [error, setError] = useState('')

  const { data: masks, isLoading: masksLoading } = useQuery({
    queryKey: ['sem-keywords', projectId, sp.id, 'masks'],
    queryFn: () => marketingApi.getKeywords(projectId, sp.id, { only_masks: true, per_page: 200 }),
  })

  const collectMut = useMutation({
    mutationFn: () => {
      const phrases = masksText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      if (!phrases.length) throw new Error('Введите маски')
      return marketingApi.collectMasks(projectId, sp.id, phrases)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sem-keywords', projectId, sp.id] })
      qc.invalidateQueries({ queryKey: ['sem-project', projectId, sp.id] })
      setError('')
    },
    onError: (e: any) => setError(e?.response?.data?.detail || e?.message || 'Ошибка'),
  })

  const toggleMut = useMutation({
    mutationFn: ({ kwId, selected }: { kwId: string; selected: boolean }) =>
      marketingApi.updateMaskSelection(projectId, sp.id, kwId, selected),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sem-keywords', projectId, sp.id, 'masks'] }),
  })

  const maskRows: SemanticKeyword[] = masks?.items || []
  const anySelected = maskRows.some((m) => m.mask_selected)

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-primary mb-1">Маски для сбора</label>
        <p className="text-xs text-muted mb-2">
          Введите 1–2 слова, описывающих вашу нишу. Например:{' '}
          <code className="bg-surface-raised px-1 rounded">купить диван, мягкая мебель</code>
        </p>
        <textarea
          className="input w-full h-24 resize-none font-mono text-sm"
          placeholder={'купить диван\nмягкая мебель\nдиван в гостиную'}
          value={masksText}
          onChange={(e) => setMasksText(e.target.value)}
        />
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={() => collectMut.mutate()}
            disabled={!masksText.trim() || collectMut.isPending}
            className="btn-primary px-4 py-1.5 text-sm"
          >
            {collectMut.isPending ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Запрашиваем Wordstat...
              </span>
            ) : (
              'Собрать статистику'
            )}
          </button>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>

      {/* Results table */}
      {masksLoading && (
        <div className="text-sm text-muted">Загрузка...</div>
      )}
      {!masksLoading && maskRows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-primary">
              Результаты ({maskRows.length} масок)
            </h4>
            <span className="text-xs text-muted">
              Снимите галочки с нерелевантных
            </span>
          </div>

          <div className="border border-[var(--border)] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-raised text-xs text-muted">
                  <th className="px-3 py-2 text-left w-8"></th>
                  <th className="px-3 py-2 text-left">Маска</th>
                  <th className="px-3 py-2 text-right">WS</th>
                  <th className="px-3 py-2 text-right">«WS»</th>
                  <th className="px-3 py-2 text-right">«!WS»</th>
                  <th className="px-3 py-2 text-right">[WS]</th>
                  <th className="px-3 py-2 text-center">Тип</th>
                </tr>
              </thead>
              <tbody>
                {maskRows.map((kw) => {
                  const zeroExact = (kw.frequency_exact ?? 0) === 0
                  return (
                    <tr
                      key={kw.id}
                      className={cx(
                        'border-t border-[var(--border)] transition',
                        !kw.mask_selected && 'opacity-50',
                        zeroExact && kw.mask_selected && 'bg-red-50 dark:bg-red-950/20'
                      )}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={kw.mask_selected}
                          onChange={(e) =>
                            toggleMut.mutate({ kwId: kw.id, selected: e.target.checked })
                          }
                          className="rounded"
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-primary">
                        {kw.phrase}
                        {zeroExact && kw.mask_selected && (
                          <span className="ml-2 text-[10px] text-red-500 font-normal">
                            точная = 0
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">
                        {kw.frequency_base?.toLocaleString('ru') ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">
                        {kw.frequency_phrase?.toLocaleString('ru') ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {kw.frequency_exact?.toLocaleString('ru') ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">
                        {kw.frequency_order?.toLocaleString('ru') ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {kw.kw_type && (
                          <span
                            className={cx(
                              'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                              kw.kw_type === 'ВЧ' && 'bg-red-100 text-red-600',
                              kw.kw_type === 'СЧ' && 'bg-yellow-100 text-yellow-700',
                              kw.kw_type === 'НЧ' && 'bg-green-100 text-green-700'
                            )}
                          >
                            {kw.kw_type}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">
              Выбрано: {maskRows.filter((m) => m.mask_selected).length} из {maskRows.length}
            </p>
            <button
              onClick={onStepAdvance}
              disabled={!anySelected}
              className="btn-primary px-4 py-1.5 text-sm"
            >
              Далее — Расширение семантики →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TaskPoller ────────────────────────────────────────────────────────────────

function useTaskPoller(taskId: string | null, onDone: (t: TaskResult) => void) {
  const interval = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!taskId) return
    const poll = async () => {
      try {
        const t = await tasksApi.get(taskId)
        if (t.status === 'success' || t.status === 'failed') {
          if (interval.current) clearInterval(interval.current)
          onDone(t)
        }
      } catch { /* ignore */ }
    }
    poll()
    interval.current = setInterval(poll, 2000)
    return () => { if (interval.current) clearInterval(interval.current) }
  }, [taskId])
}

// ─── Step 3: Expand ────────────────────────────────────────────────────────────

function ExpandStep({
  projectId,
  sp,
  onStepAdvance,
}: {
  projectId: string
  sp: SemanticProject
  onStepAdvance: () => void
}) {
  const qc = useQueryClient()
  const [minFreq, setMinFreq] = useState(0)
  const [useBrief, setUseBrief] = useState(true)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [taskResult, setTaskResult] = useState<TaskResult | null>(null)
  const [taskError, setTaskError] = useState('')

  const expandMut = useMutation({
    mutationFn: () =>
      marketingApi.expand(projectId, sp.id, { min_freq_exact: minFreq, use_brief: useBrief }),
    onSuccess: (d) => { setTaskId(d.task_id); setTaskError('') },
    onError: (e: any) => setTaskError(e?.response?.data?.detail || 'Ошибка запуска'),
  })

  useTaskPoller(taskId, (t) => {
    setTaskResult(t)
    setTaskId(null)
    if (t.status === 'success') {
      qc.invalidateQueries({ queryKey: ['sem-keywords', projectId, sp.id] })
      qc.invalidateQueries({ queryKey: ['sem-project', projectId, sp.id] })
      qc.invalidateQueries({ queryKey: ['sem-projects', projectId] })
    }
  })

  const { data: taskLive } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => tasksApi.get(taskId!),
    enabled: !!taskId,
    refetchInterval: 2000,
  })

  const progress = taskLive?.progress ?? 0
  const isRunning = !!taskId || taskLive?.status === 'running'

  const { data: kwData } = useQuery({
    queryKey: ['sem-keywords', projectId, sp.id],
    queryFn: () => marketingApi.getKeywords(projectId, sp.id, { per_page: 1 }),
  })
  const totalKw = kwData?.total ?? 0
  const hasResults = sp.pipeline_step >= 2 && totalKw > 0

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Claude сгенерирует {sp.mode === 'seo' ? 'информационные и коммерческие' : 'коммерческие'} запросы
        для каждой выбранной маски, затем Wordstat соберёт частотность.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-muted mb-1">Мин. точная частотность</label>
          <input
            type="number"
            min={0}
            className="input w-full"
            value={minFreq}
            onChange={(e) => setMinFreq(Number(e.target.value))}
            placeholder="0 — не фильтровать"
          />
          <p className="text-[11px] text-muted mt-1">Ключи с точной freq ниже будут отброшены</p>
        </div>
        <div className="flex flex-col justify-center">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useBrief}
              onChange={(e) => setUseBrief(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-primary">Использовать бриф</span>
          </label>
          <p className="text-[11px] text-muted mt-1 ml-6">Claude учтёт нишу, продукты и УТП из бриф</p>
        </div>
      </div>

      {/* Run button or progress bar */}
      {!isRunning && !taskResult && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => expandMut.mutate()}
            disabled={expandMut.isPending}
            className="btn-primary px-5 py-2 text-sm"
          >
            {expandMut.isPending ? 'Запуск...' : 'Запустить расширение'}
          </button>
          {taskError && <p className="text-xs text-red-500">{taskError}</p>}
        </div>
      )}

      {isRunning && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-accent">
            <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            <span>
              {progress < 50
                ? `Генерация ключей... ${progress}%`
                : progress < 85
                ? `Сбор частотности... ${progress}%`
                : `Сохранение... ${progress}%`}
            </span>
          </div>
          <div className="w-full bg-[var(--border)] rounded-full h-2 overflow-hidden">
            <div
              className="bg-accent h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {taskResult?.status === 'failed' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          Ошибка: {taskResult.error || 'Неизвестная ошибка'}
          <button
            className="ml-3 underline text-red-600 text-xs"
            onClick={() => { setTaskResult(null); setTaskError('') }}
          >
            Повторить
          </button>
        </div>
      )}

      {/* Results or re-run */}
      {hasResults && !isRunning && (
        <div className="bg-[var(--accent-subtle)] border border-accent/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-accent">
              <path d="M3 8l3.5 3.5L13 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-sm font-medium text-accent">
              Расширение выполнено — {totalKw.toLocaleString('ru')} ключей
              {taskResult?.result && ` (сохранено: ${(taskResult.result as any).saved})`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setTaskResult(null) }}
              className="text-xs text-muted hover:text-primary underline"
            >
              Переработать
            </button>
            <button
              onClick={onStepAdvance}
              className="btn-primary px-4 py-1.5 text-sm"
            >
              Далее — Очистка →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Locked step placeholder ──────────────────────────────────────────────────

function LockedStep({ label, requiredStep }: { label: string; requiredStep: number }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-muted gap-2">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="opacity-30">
        <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs">Завершите шаг {requiredStep} чтобы продолжить</p>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MarketingTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [activeMode, setActiveMode] = useState<SemanticMode>('seo')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [activeStep, setActiveStep] = useState(1)

  const { data: semProjects, isLoading } = useQuery({
    queryKey: ['sem-projects', projectId],
    queryFn: () => marketingApi.list(projectId),
  })

  const sp = semProjects?.find((p) => p.mode === activeMode)

  const handleCreated = (created: SemanticProject) => {
    qc.invalidateQueries({ queryKey: ['sem-projects', projectId] })
    setShowCreateModal(false)
    setActiveStep(1)
  }

  const handleDeleteSp = useMutation({
    mutationFn: () => marketingApi.delete(projectId, sp!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sem-projects', projectId] }),
  })

  // Sync activeStep with pipeline_step when sp changes
  const pipelineStep = sp?.pipeline_step ?? 0

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* ── Mode tabs ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-surface-raised rounded-xl p-1">
          {(['seo', 'direct'] as SemanticMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => { setActiveMode(mode); setActiveStep(1) }}
              className={cx(
                'px-4 py-1.5 rounded-lg text-sm font-medium transition',
                activeMode === mode
                  ? 'bg-white shadow-sm text-accent'
                  : 'text-muted hover:text-primary'
              )}
            >
              {mode === 'seo' ? 'SEO-продвижение' : 'Яндекс Директ'}
            </button>
          ))}
        </div>

        {sp && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="font-medium text-primary">{sp.name}</span>
            {sp.region && <span>· {sp.region}</span>}
            {sp.is_seasonal && <span className="badge badge-blue">Сезонный</span>}
            <button
              onClick={() => handleDeleteSp.mutate()}
              className="text-muted hover:text-red-500 transition ml-2"
              title="Удалить"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M3 4h10M6 4V2h4v2M5 4l.5 9h5L11 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="text-sm text-muted flex items-center gap-2">
          <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          Загрузка...
        </div>
      )}

      {/* ── No project yet ─────────────────────────────────────────────────── */}
      {!isLoading && !sp && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="text-center text-muted space-y-1">
            <p className="text-base font-medium text-primary">
              Семантическое ядро — {activeMode === 'seo' ? 'SEO' : 'Яндекс Директ'}
            </p>
            <p className="text-sm">
              Создайте проект чтобы начать сбор ключевых слов
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary px-5 py-2 text-sm"
          >
            + Новый проект
          </button>
        </div>
      )}

      {/* ── Project exists: stepper + content ──────────────────────────────── */}
      {!isLoading && sp && (
        <>
          <Stepper step={Math.max(pipelineStep, activeStep - 1)} />

          {/* Step navigation pills */}
          <div className="flex gap-1 flex-wrap">
            {STEPS.map((s, i) => {
              // current step and all previous are unlocked; next step is accessible to navigate to
              const unlocked = i <= pipelineStep + 1
              return (
                <button
                  key={i}
                  onClick={() => unlocked && setActiveStep(i + 1)}
                  disabled={!unlocked}
                  className={cx(
                    'px-3 py-1 text-xs rounded-full border transition',
                    activeStep === i + 1
                      ? 'border-accent bg-[var(--accent-subtle)] text-accent font-medium'
                      : unlocked
                      ? 'border-[var(--border)] text-muted hover:text-primary'
                      : 'border-[var(--border)] text-muted/40 cursor-not-allowed'
                  )}
                >
                  {i + 1}. {s.label}
                </button>
              )
            })}
          </div>

          <div className="bg-surface border border-[var(--border)] rounded-2xl p-5">
            {activeStep === 1 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-base">Шаг 1 — Проект создан</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-surface-raised rounded-xl p-3 space-y-1">
                    <p className="text-xs text-muted">Название</p>
                    <p className="font-medium">{sp.name}</p>
                  </div>
                  <div className="bg-surface-raised rounded-xl p-3 space-y-1">
                    <p className="text-xs text-muted">Режим</p>
                    <p className="font-medium">{sp.mode === 'seo' ? 'SEO-продвижение' : 'Яндекс Директ'}</p>
                  </div>
                  {sp.region && (
                    <div className="bg-surface-raised rounded-xl p-3 space-y-1">
                      <p className="text-xs text-muted">Регион</p>
                      <p className="font-medium">{sp.region}</p>
                    </div>
                  )}
                  <div className="bg-surface-raised rounded-xl p-3 space-y-1">
                    <p className="text-xs text-muted">Сезонный</p>
                    <p className="font-medium">{sp.is_seasonal ? 'Да' : 'Нет'}</p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveStep(2)}
                  className="btn-primary px-4 py-1.5 text-sm mt-2"
                >
                  Перейти к сбору масок →
                </button>
              </div>
            )}

            {activeStep === 2 && (
              <>
                <h3 className="font-semibold text-base mb-4">Шаг 2 — Маски и статистика</h3>
                <MasksStep
                  projectId={projectId}
                  sp={sp}
                  onStepAdvance={() => setActiveStep(3)}
                />
              </>
            )}

            {activeStep === 3 && (
              <>
                <h3 className="font-semibold text-base mb-4">Шаг 3 — Расширение семантики</h3>
                <ExpandStep
                  projectId={projectId}
                  sp={sp}
                  onStepAdvance={() => setActiveStep(4)}
                />
              </>
            )}

            {activeStep === 4 && (
              <LockedStep label="Шаг 4 — Очистка" requiredStep={3} />
            )}

            {activeStep === 5 && (
              <LockedStep label="Шаг 5 — Кластеризация" requiredStep={4} />
            )}

            {activeStep === 6 && (
              <LockedStep label="Шаг 6 — Экспорт" requiredStep={5} />
            )}
          </div>
        </>
      )}

      {/* ── Create modal ───────────────────────────────────────────────────── */}
      {showCreateModal && (
        <CreateModal
          mode={activeMode}
          projectId={projectId}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}
