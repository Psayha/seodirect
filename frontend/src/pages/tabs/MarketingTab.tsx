import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { marketingApi, SemanticMode, SemanticProject, SemanticKeyword } from '../../api/marketing'
import { tasksApi, TaskResult } from '../../api/tasks'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

// ─── Legend / Glossary ───────────────────────────────────────────────────────

function Legend({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-page border border-[var(--border)] rounded-2xl shadow-xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary">Справочник: семантическое ядро</h2>
          <button onClick={onClose} className="text-muted hover:text-primary text-xl leading-none">&times;</button>
        </div>

        {/* Частотности */}
        <section>
          <h3 className="text-sm font-semibold text-primary mb-2">Частотности Wordstat</h3>
          <div className="text-xs text-muted space-y-2">
            <div className="grid grid-cols-[60px_1fr] gap-x-3 items-start">
              <span className="font-mono font-bold text-primary">WS</span>
              <span>
                <b>Базовая частота.</b> Сколько раз в месяц искали <i>любые запросы</i>, содержащие эти слова
                в любых формах. Например, для «каркасный дом» сюда попадёт и «купить каркасный дом», и «проект каркасного дома».
                Всегда самое большое число.
              </span>
            </div>
            <div className="grid grid-cols-[60px_1fr] gap-x-3 items-start">
              <span className="font-mono font-bold text-primary">«WS»</span>
              <span>
                <b>Фразовая частота.</b> Только запросы из <i>этих слов</i> (в любых формах), без дополнительных.
                «каркасного дома» — да, «купить каркасный дом» — нет.
              </span>
            </div>
            <div className="grid grid-cols-[60px_1fr] gap-x-3 items-start">
              <span className="font-mono font-bold text-primary">«!WS»</span>
              <span>
                <b>Точная частота.</b> Только <i>точная форма</i> слов, без дополнений.
                «каркасный дом» — да, «каркасного дома» — нет.
                <b> Главный показатель реального спроса.</b>
              </span>
            </div>
            <div className="grid grid-cols-[60px_1fr] gap-x-3 items-start">
              <span className="font-mono font-bold text-primary">[WS]</span>
              <span>
                <b>Порядок слов.</b> Только в точном порядке. «каркасный дом» — да, «дом каркасный» — нет.
              </span>
            </div>
          </div>
        </section>

        {/* Типы */}
        <section>
          <h3 className="text-sm font-semibold text-primary mb-2">Типы ключей (по точной частоте «!WS»)</h3>
          <div className="text-xs space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 w-8 text-center">ВЧ</span>
              <span className="text-muted"><b>Высокочастотный</b> — «!WS» ≥ 1 000. Популярный, высокая конкуренция, дорогой клик</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 w-8 text-center">СЧ</span>
              <span className="text-muted"><b>Среднечастотный</b> — «!WS» 100–999. Баланс спроса и конкуренции</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 w-8 text-center">НЧ</span>
              <span className="text-muted"><b>Низкочастотный</b> — «!WS» 1–99. Мало ищут, но дешёвый и точный трафик</span>
            </div>
          </div>
        </section>

        {/* Флаги */}
        <section>
          <h3 className="text-sm font-semibold text-primary mb-2">Флаги ключей</h3>
          <div className="text-xs text-muted space-y-1">
            <p><b>Б</b> — <b>Бренд.</b> Содержит название бренда (вашего или общего)</p>
            <p><b>К</b> — <b>Конкурент.</b> Содержит бренд конкурента</p>
            <p><b>С</b> — <b>Сезонный.</b> Спрос зависит от времени года</p>
            <p><b>Г</b> — <b>Гео.</b> Привязан к региону («в Москве», «СПб»)</p>
          </div>
        </section>

        {/* Интенты */}
        <section>
          <h3 className="text-sm font-semibold text-primary mb-2">Интенты (намерение пользователя)</h3>
          <div className="text-xs text-muted space-y-1">
            <p><b>Коммерческий</b> — хочет купить/заказать. «купить каркасный дом», «каркасный дом цена»</p>
            <p><b>Информационный</b> — хочет узнать. «плюсы каркасного дома», «как утеплить»</p>
            <p><b>Навигационный</b> — ищет конкретный сайт. «пестово каркасные дома официальный»</p>
            <p><b>Общий</b> — неясное намерение. «каркасный дом»</p>
          </div>
        </section>

        {/* Шаги */}
        <section>
          <h3 className="text-sm font-semibold text-primary mb-2">Шаги сбора семантики</h3>
          <div className="text-xs text-muted space-y-1.5">
            <p><b>1. Проект</b> — выбираете режим (SEO или Директ) и регион</p>
            <p><b>2. Маски</b> — вводите базовые фразы вашей ниши (1–2 слова). Wordstat показывает частотность</p>
            <p><b>3. Расширение</b> — Wordstat собирает вложенные и похожие запросы по каждой маске, затем ИИ дорасширяет до 300+ ключей. Частоты собираются автоматически</p>
            <p><b>4. Очистка</b> — убираете мусор: нулевые запросы, слишком длинные, с минус-словами. Расставляете флаги и интенты</p>
            <p><b>5. Кластеры</b> — ИИ группирует ключи по смыслу. Для Директа предлагает тип кампании и заголовок</p>
            <p><b>6. Экспорт</b> — скачиваете результат в Excel, CSV или TXT</p>
          </div>
        </section>

        <div className="text-center pt-2">
          <button onClick={onClose} className="btn-primary px-6 py-1.5 text-sm">Понятно</button>
        </div>
      </div>
    </div>
  )
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
                    ? 'bg-surface border-accent text-accent'
                    : 'bg-surface border-[var(--border)] text-muted'
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
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="SEO-семантика"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Регион (необязательно)</label>
            <input
              className="field"
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
  const [initialized, setInitialized] = useState(false)

  const { data: masks, isLoading: masksLoading } = useQuery({
    queryKey: ['sem-keywords', projectId, sp.id, 'masks'],
    queryFn: () => marketingApi.getKeywords(projectId, sp.id, { only_masks: true, per_page: 200 }),
  })

  // Pre-fill textarea with existing masks so user can add more
  useEffect(() => {
    if (!initialized && masks?.items?.length) {
      setMasksText(masks.items.map((m) => m.phrase).join('\n'))
      setInitialized(true)
    }
  }, [masks, initialized])

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
    onError: (e: any) => {
      const detail = e?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : e?.message || 'Ошибка')
    },
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
          className="field w-full h-24 resize-none font-mono text-sm"
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
                              kw.kw_type === 'ВЧ' && 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
                              kw.kw_type === 'СЧ' && 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
                              kw.kw_type === 'НЧ' && 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
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

  const { data: taskLive } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => tasksApi.get(taskId!),
    enabled: !!taskId,
    refetchInterval: 2000,
  })

  // Handle task completion via useQuery data
  useEffect(() => {
    if (!taskLive || !taskId) return
    if (taskLive.status === 'success' || taskLive.status === 'failed') {
      setTaskResult(taskLive)
      setTaskId(null)
      if (taskLive.status === 'success') {
        qc.invalidateQueries({ queryKey: ['sem-keywords', projectId, sp.id] })
        qc.invalidateQueries({ queryKey: ['sem-project', projectId, sp.id] })
        qc.invalidateQueries({ queryKey: ['sem-projects', projectId] })
      }
    }
  }, [taskLive?.status])

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
            className="field w-full"
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
              {progress < 15
                ? `Сбор подсказок Wordstat... ${progress}%`
                : progress < 50
                ? `Генерация ключей (Claude)... ${progress}%`
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
              {taskResult?.result && (() => {
                const r = taskResult.result as any;
                const parts = [`сохранено: ${r.saved}`];
                if (r.from_wordstat) parts.push(`из Wordstat: ${r.from_wordstat}`);
                if (r.from_claude) parts.push(`от Claude: ${r.from_claude}`);
                return ` (${parts.join(', ')})`;
              })()}
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

// ─── Step 4: Cleaning ─────────────────────────────────────────────────────────

const INTENTS = ['коммерческий', 'информационный', 'навигационный', 'общий']

function CleaningStep({
  projectId,
  sp,
  onStepAdvance,
}: {
  projectId: string
  sp: SemanticProject
  onStepAdvance: () => void
}) {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterExcluded, setFilterExcluded] = useState<'all' | 'active' | 'excluded'>('active')
  const [filterType, setFilterType] = useState('')
  const [autoCleanResult, setAutoCleanResult] = useState<null | {
    total_excluded: number; total_kept: number
    excluded_zero_freq: number; excluded_long_tail: number; excluded_minus_words: number
  }>(null)
  const [minusInput, setMinusInput] = useState('')

  const perPage = 50
  const params = {
    page,
    per_page: perPage,
    search: search || undefined,
    kw_type: filterType || undefined,
    ...(filterExcluded === 'excluded' ? {} : {}),
  }

  // We need to show excluded too — re-query with include_excluded
  // But our current API filters out excluded by default.
  // Use a workaround: pass source filter = exclude excluded when filterExcluded = 'active'
  // Actually the existing endpoint always filters is_excluded=False. We need a separate param.
  // For now show only active (not excluded) for cleanliness; excluded filter will show all.
  const { data: kwData, isLoading: kwLoading } = useQuery({
    queryKey: ['sem-kw-clean', projectId, sp.id, page, search, filterType, filterExcluded],
    queryFn: () =>
      marketingApi.getKeywords(projectId, sp.id, {
        ...params,
        only_masks: false,
      }),
    keepPreviousData: true,
  } as any)

  const { data: minusWords, isLoading: minusLoading } = useQuery({
    queryKey: ['minus-words', projectId, sp.id],
    queryFn: () => marketingApi.getMinusWords(projectId, sp.id),
  })

  const updateKwMut = useMutation({
    mutationFn: ({ kwId, data }: { kwId: string; data: Parameters<typeof marketingApi.updateKeyword>[3] }) =>
      marketingApi.updateKeyword(projectId, sp.id, kwId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sem-kw-clean', projectId, sp.id] }),
  })

  const autoCleanMut = useMutation({
    mutationFn: () => marketingApi.autoClean(projectId, sp.id),
    onSuccess: (d) => {
      setAutoCleanResult(d)
      qc.invalidateQueries({ queryKey: ['sem-kw-clean', projectId, sp.id] })
      qc.invalidateQueries({ queryKey: ['sem-projects', projectId] })
    },
  })

  const addMinusMut = useMutation({
    mutationFn: (words: string[]) => marketingApi.addMinusWords(projectId, sp.id, words),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['minus-words', projectId, sp.id] })
      setMinusInput('')
    },
  })

  const deleteMinusMut = useMutation({
    mutationFn: (wordId: string) => marketingApi.deleteMinusWord(projectId, sp.id, wordId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['minus-words', projectId, sp.id] }),
  })

  const completeMut = useMutation({
    mutationFn: () => marketingApi.completeCleaning(projectId, sp.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sem-projects', projectId] })
      onStepAdvance()
    },
  })

  const keywords = (kwData as any)?.items ?? []
  const total = (kwData as any)?.total ?? 0
  const totalPages = Math.ceil(total / perPage)

  const handleAddMinus = () => {
    const words = minusInput.split(/[\n,\s]+/).map((w) => w.trim()).filter(Boolean)
    if (words.length) addMinusMut.mutate(words)
  }

  return (
    <div className="space-y-5">
      {/* ── Top bar: filters + auto-clean ───────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="field text-sm w-52"
          placeholder="Поиск по фразе..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
        <select
          className="field text-sm w-28"
          value={filterType}
          onChange={(e) => { setFilterType(e.target.value); setPage(1) }}
        >
          <option value="">Все типы</option>
          <option value="ВЧ">ВЧ</option>
          <option value="СЧ">СЧ</option>
          <option value="НЧ">НЧ</option>
        </select>

        <div className="flex-1" />

        <button
          onClick={() => autoCleanMut.mutate()}
          disabled={autoCleanMut.isPending}
          className="btn-ghost px-3 py-1.5 text-sm border border-[var(--border)] rounded-xl hover:bg-surface-raised"
        >
          {autoCleanMut.isPending ? (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              Очистка...
            </span>
          ) : '⚡ Авто-очистка'}
        </button>
      </div>

      {/* ── Auto-clean result banner ─────────────────────────────────────── */}
      {autoCleanResult && (
        <div className="bg-[var(--accent-subtle)] border border-accent/20 rounded-xl px-4 py-3 text-sm space-y-1">
          <p className="font-medium text-accent">
            Авто-очистка: исключено {autoCleanResult.total_excluded}, оставлено {autoCleanResult.total_kept}
          </p>
          <div className="flex gap-4 text-xs text-muted">
            {autoCleanResult.excluded_zero_freq > 0 && <span>нулевая freq: {autoCleanResult.excluded_zero_freq}</span>}
            {autoCleanResult.excluded_long_tail > 0 && <span>длинный хвост: {autoCleanResult.excluded_long_tail}</span>}
            {autoCleanResult.excluded_minus_words > 0 && <span>минус-слова: {autoCleanResult.excluded_minus_words}</span>}
          </div>
          <button onClick={() => setAutoCleanResult(null)} className="text-[10px] text-muted underline">Скрыть</button>
        </div>
      )}

      {/* ── Keywords table ───────────────────────────────────────────────── */}
      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        {kwLoading ? (
          <div className="p-6 text-center text-sm text-muted">Загрузка...</div>
        ) : keywords.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted">Ключевых слов нет</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-raised text-xs text-muted border-b border-[var(--border)]">
                  <th className="px-3 py-2 text-left">Фраза</th>
                  <th className="px-3 py-2 text-right w-16">WS</th>
                  <th className="px-3 py-2 text-right w-16">«!WS»</th>
                  <th className="px-3 py-2 text-center w-12">Тип</th>
                  <th className="px-3 py-2 text-center w-20">Интент</th>
                  <th className="px-3 py-2 text-center w-40">Флаги</th>
                  <th className="px-3 py-2 text-center w-20">Исключить</th>
                </tr>
              </thead>
              <tbody>
                {keywords.map((kw: import('../../api/marketing').SemanticKeyword) => (
                  <tr
                    key={kw.id}
                    className={cx(
                      'border-t border-[var(--border)] transition',
                      kw.is_excluded && 'opacity-40 bg-surface-raised'
                    )}
                  >
                    <td className="px-3 py-1.5 font-mono text-xs text-primary max-w-xs truncate">
                      {kw.phrase}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted text-xs">
                      {kw.frequency_base?.toLocaleString('ru') ?? '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-xs font-medium">
                      {kw.frequency_exact?.toLocaleString('ru') ?? '—'}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {kw.kw_type && (
                        <span className={cx(
                          'text-[9px] font-bold px-1 rounded',
                          kw.kw_type === 'ВЧ' && 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
                          kw.kw_type === 'СЧ' && 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
                          kw.kw_type === 'НЧ' && 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
                        )}>
                          {kw.kw_type}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <select
                        className="text-[10px] bg-transparent border border-[var(--border)] rounded px-1 py-0.5 text-muted"
                        value={kw.intent || ''}
                        onChange={(e) =>
                          updateKwMut.mutate({ kwId: kw.id, data: { intent: e.target.value || undefined } })
                        }
                      >
                        <option value="">—</option>
                        {INTENTS.map((i) => <option key={i} value={i}>{i.slice(0, 3)}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        <button
                          title="Брендовый"
                          onClick={() => updateKwMut.mutate({ kwId: kw.id, data: { is_branded: !kw.is_branded } })}
                          className={cx('text-[9px] px-1 py-0.5 rounded border transition', kw.is_branded ? 'bg-purple-100 text-purple-700 border-purple-300' : 'border-[var(--border)] text-muted/50')}
                        >
                          Б
                        </button>
                        <button
                          title="Конкурент"
                          onClick={() => updateKwMut.mutate({ kwId: kw.id, data: { is_competitor: !kw.is_competitor } })}
                          className={cx('text-[9px] px-1 py-0.5 rounded border transition', kw.is_competitor ? 'bg-orange-100 text-orange-700 border-orange-300' : 'border-[var(--border)] text-muted/50')}
                        >
                          К
                        </button>
                        <button
                          title="Сезонный"
                          onClick={() => updateKwMut.mutate({ kwId: kw.id, data: { is_seasonal: !kw.is_seasonal } })}
                          className={cx('text-[9px] px-1 py-0.5 rounded border transition', kw.is_seasonal ? 'bg-blue-100 text-blue-700 border-blue-300' : 'border-[var(--border)] text-muted/50')}
                        >
                          С
                        </button>
                        <button
                          title="Гео-зависимый"
                          onClick={() => updateKwMut.mutate({ kwId: kw.id, data: { geo_dependent: !kw.geo_dependent } })}
                          className={cx('text-[9px] px-1 py-0.5 rounded border transition', kw.geo_dependent ? 'bg-teal-100 text-teal-700 border-teal-300' : 'border-[var(--border)] text-muted/50')}
                        >
                          Г
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={kw.is_excluded}
                        onChange={(e) =>
                          updateKwMut.mutate({ kwId: kw.id, data: { is_excluded: e.target.checked } })
                        }
                        className="rounded"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ───────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{total.toLocaleString('ru')} ключей</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 rounded border border-[var(--border)] disabled:opacity-40"
            >
              ←
            </button>
            <span className="px-2 py-1">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 py-1 rounded border border-[var(--border)] disabled:opacity-40"
            >
              →
            </button>
          </div>
        </div>
      )}

      {/* ── Minus words ──────────────────────────────────────────────────── */}
      <div className="border border-[var(--border)] rounded-xl p-4 space-y-3">
        <h4 className="text-sm font-medium text-primary">Минус-слова</h4>
        <div className="flex gap-2">
          <textarea
            className="field flex-1 h-16 resize-none text-sm font-mono"
            placeholder={'бесплатно\nсвоими руками\nвидео'}
            value={minusInput}
            onChange={(e) => setMinusInput(e.target.value)}
          />
          <button
            onClick={handleAddMinus}
            disabled={!minusInput.trim() || addMinusMut.isPending}
            className="btn-primary px-3 text-sm self-start mt-0"
          >
            Добавить
          </button>
        </div>
        {!minusLoading && (minusWords?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {minusWords!.map((mw) => (
              <span
                key={mw.id}
                className="flex items-center gap-1 bg-surface-raised border border-[var(--border)] text-xs px-2 py-0.5 rounded-full"
              >
                {mw.word}
                <button
                  onClick={() => deleteMinusMut.mutate(mw.id)}
                  className="text-muted hover:text-red-500 transition text-[10px] leading-none"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted">
          После добавления нажмите «Авто-очистка» чтобы применить минус-слова к ключам
        </p>
      </div>

      {/* ── Complete button ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          {total.toLocaleString('ru')} активных ключей
        </p>
        <button
          onClick={() => completeMut.mutate()}
          disabled={completeMut.isPending || total === 0}
          className="btn-primary px-5 py-2 text-sm"
        >
          {completeMut.isPending ? 'Сохранение...' : 'Завершить очистку — Далее →'}
        </button>
      </div>
    </div>
  )
}

// ─── Locked step placeholder ──────────────────────────────────────────────────

// ─── Step 5: Cluster ─────────────────────────────────────────────────────────

const INTENT_COLOR: Record<string, string> = {
  'коммерческий': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  'информационный': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  'навигационный': 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
  'общий': 'bg-surface-raised text-muted',
}
const PRIORITY_COLOR: Record<string, string> = {
  'высокий': 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  'средний': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
  'низкий': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
}
const INTENTS_CLUSTER = ['коммерческий', 'информационный', 'навигационный', 'общий']
const PRIORITIES = ['высокий', 'средний', 'низкий']

function ClusterCard({
  cluster,
  mode,
  onUpdate,
  onDelete,
}: {
  cluster: import('../../api/marketing').SemanticCluster
  mode: string
  onUpdate: (id: string, data: any) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(cluster.name)
  const [intent, setIntent] = useState(cluster.intent ?? '')
  const [priority, setPriority] = useState(cluster.priority ?? '')
  const [campaignType, setCampaignType] = useState(cluster.campaign_type ?? '')
  const [title, setTitle] = useState(cluster.suggested_title ?? '')

  const save = () => {
    onUpdate(cluster.id, {
      name,
      intent: intent || null,
      priority: priority || null,
      campaign_type: campaignType || null,
      suggested_title: title || null,
    })
    setEditing(false)
  }

  return (
    <div className="border border-[var(--border)] rounded-xl p-4 space-y-2 hover:border-accent/40 transition">
      {editing ? (
        <div className="space-y-2">
          <input
            className="field w-full text-sm font-medium"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название кластера"
          />
          <div className="grid grid-cols-2 gap-2">
            <select className="field text-xs" value={intent} onChange={(e) => setIntent(e.target.value)}>
              <option value="">Интент</option>
              {INTENTS_CLUSTER.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
            <select className="field text-xs" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">Приоритет</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {mode === 'direct' && (
            <div className="grid grid-cols-2 gap-2">
              <select className="field text-xs" value={campaignType} onChange={(e) => setCampaignType(e.target.value)}>
                <option value="">Тип кампании</option>
                <option value="search">Поиск</option>
                <option value="rsa">RSA</option>
              </select>
              <input
                className="field text-xs"
                maxLength={35}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Заголовок объявления (35 симв.)"
              />
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={save} className="btn-primary px-3 py-1 text-xs">Сохранить</button>
            <button onClick={() => setEditing(false)} className="btn-ghost px-3 py-1 text-xs">Отмена</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-primary leading-snug">{cluster.name}</p>
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => setEditing(true)}
                className="text-muted hover:text-accent transition p-0.5"
                title="Редактировать"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M11 2l3 3L5 14H2v-3L11 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                onClick={() => onDelete(cluster.id)}
                className="text-muted hover:text-red-500 transition p-0.5"
                title="Удалить"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M3 4h10M6 4V2h4v2M5 4l.5 9h5L11 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-muted tabular-nums">
              {cluster.keyword_count} ключ{cluster.keyword_count === 1 ? '' : cluster.keyword_count < 5 ? 'а' : 'ей'}
            </span>
            {cluster.intent && (
              <span className={cx('text-[10px] font-medium px-1.5 py-0.5 rounded', INTENT_COLOR[cluster.intent] ?? 'bg-gray-100 text-gray-600')}>
                {cluster.intent}
              </span>
            )}
            {cluster.priority && (
              <span className={cx('text-[10px] font-medium px-1.5 py-0.5 rounded', PRIORITY_COLOR[cluster.priority] ?? 'bg-gray-100 text-gray-600')}>
                {cluster.priority}
              </span>
            )}
            {cluster.campaign_type && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                {cluster.campaign_type === 'search' ? 'Поиск' : 'RSA'}
              </span>
            )}
          </div>
          {cluster.suggested_title && (
            <p className="text-xs text-muted font-mono border-l-2 border-accent/30 pl-2 italic">
              «{cluster.suggested_title}»
            </p>
          )}
        </>
      )}
    </div>
  )
}

function ClusterStep({
  projectId,
  sp,
  onStepAdvance,
}: {
  projectId: string
  sp: import('../../api/marketing').SemanticProject
  onStepAdvance: () => void
}) {
  const qc = useQueryClient()
  const [taskId, setTaskId] = useState<string | null>(null)
  const [taskResult, setTaskResult] = useState<TaskResult | null>(null)
  const [taskError, setTaskError] = useState('')

  const startMut = useMutation({
    mutationFn: () => marketingApi.startCluster(projectId, sp.id),
    onSuccess: (d) => { setTaskId(d.task_id); setTaskError('') },
    onError: (e: any) => setTaskError(e?.response?.data?.detail || 'Ошибка запуска'),
  })

  const { data: taskLive } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => tasksApi.get(taskId!),
    enabled: !!taskId,
    refetchInterval: 2000,
  })

  useEffect(() => {
    if (!taskLive || !taskId) return
    if (taskLive.status === 'success' || taskLive.status === 'failed') {
      setTaskResult(taskLive)
      setTaskId(null)
      if (taskLive.status === 'success') {
        qc.invalidateQueries({ queryKey: ['clusters', projectId, sp.id] })
        qc.invalidateQueries({ queryKey: ['sem-projects', projectId] })
      }
    }
  }, [taskLive?.status])

  const { data: clusters, isLoading: clustersLoading } = useQuery({
    queryKey: ['clusters', projectId, sp.id],
    queryFn: () => marketingApi.getClusters(projectId, sp.id),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      marketingApi.updateCluster(projectId, sp.id, id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clusters', projectId, sp.id] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => marketingApi.deleteCluster(projectId, sp.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clusters', projectId, sp.id] }),
  })

  const progress = taskLive?.progress ?? 0
  const isRunning = !!taskId
  const hasClusters = (clusters?.length ?? 0) > 0 && sp.pipeline_step >= 4

  const totalKw = clusters?.reduce((s, c) => s + c.keyword_count, 0) ?? 0

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Claude сгруппирует очищенные ключи в смысловые кластеры
        {sp.mode === 'direct' ? ', подберёт тип кампании и заголовок объявления' : ''}.
      </p>

      {/* Run / re-run button */}
      {!isRunning && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setTaskResult(null); startMut.mutate() }}
            disabled={startMut.isPending}
            className="btn-primary px-5 py-2 text-sm"
          >
            {startMut.isPending
              ? 'Запуск...'
              : hasClusters
              ? '↺ Перекластеризовать'
              : 'Запустить кластеризацию'}
          </button>
          {taskError && <p className="text-xs text-red-500">{taskError}</p>}
          {hasClusters && (
            <span className="text-xs text-muted">
              {clusters!.length} кластеров, {totalKw.toLocaleString('ru')} ключей
            </span>
          )}
        </div>
      )}

      {/* Progress bar */}
      {isRunning && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-accent">
            <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            <span>
              {progress < 80 ? `Кластеризация... ${progress}%` : `Сохранение... ${progress}%`}
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
          <button className="ml-3 underline text-xs" onClick={() => setTaskResult(null)}>Повторить</button>
        </div>
      )}

      {/* Cluster grid */}
      {!isRunning && hasClusters && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {clusters!.map((c) => (
              <ClusterCard
                key={c.id}
                cluster={c}
                mode={sp.mode}
                onUpdate={(id, data) => updateMut.mutate({ id, data })}
                onDelete={(id) => deleteMut.mutate(id)}
              />
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted">
              {clusters!.length} кластеров · {totalKw.toLocaleString('ru')} ключей
            </p>
            <button onClick={onStepAdvance} className="btn-primary px-5 py-2 text-sm">
              Далее — Экспорт →
            </button>
          </div>
        </div>
      )}

      {!isRunning && clustersLoading && (
        <div className="text-sm text-muted">Загрузка...</div>
      )}
    </div>
  )
}

// ─── Step 6: Export ──────────────────────────────────────────────────────────

function ExportStep({
  projectId,
  sp,
}: {
  projectId: string
  sp: import('../../api/marketing').SemanticProject
}) {
  const [downloading, setDownloading] = useState<string | null>(null)
  const [error, setError] = useState('')

  const { data: clusters } = useQuery({
    queryKey: ['clusters', projectId, sp.id],
    queryFn: () => marketingApi.getClusters(projectId, sp.id),
  })
  const { data: kwData } = useQuery({
    queryKey: ['sem-kw-export-stats', projectId, sp.id],
    queryFn: () => marketingApi.getKeywords(projectId, sp.id, { per_page: 1 }),
  })

  const totalKw = kwData?.total ?? 0
  const totalClusters = clusters?.length ?? 0

  const byType = (clusters ?? []).reduce<Record<string, number>>((acc, c) => {
    const key = c.intent ?? 'общий'
    acc[key] = (acc[key] ?? 0) + c.keyword_count
    return acc
  }, {})

  const download = async (fmt: 'xlsx' | 'csv' | 'txt') => {
    setDownloading(fmt)
    setError('')
    try {
      const { blob, filename } = await marketingApi.exportBlob(projectId, sp.id, fmt)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка скачивания')
    } finally {
      setDownloading(null)
    }
  }

  const FORMATS: { fmt: 'xlsx' | 'csv' | 'txt'; label: string; desc: string; icon: string }[] = [
    {
      fmt: 'xlsx',
      label: 'XLSX',
      desc: sp.mode === 'direct'
        ? '3 листа: ядро · кластеры · кампании Директ'
        : '2 листа: ядро · кластеры',
      icon: '📊',
    },
    {
      fmt: 'csv',
      label: 'CSV',
      desc: 'Разделитель «;», кодировка UTF-8 с BOM (открывается в Excel)',
      icon: '📋',
    },
    {
      fmt: 'txt',
      label: 'TXT',
      desc: 'Только фразы, по одной на строку (для Wordstat или Директа)',
      icon: '📄',
    },
  ]

  return (
    <div className="space-y-6">
      {/* ── Stats summary ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Ключей', value: totalKw.toLocaleString('ru') },
          { label: 'Кластеров', value: totalClusters.toLocaleString('ru') },
          { label: 'Режим', value: sp.mode === 'seo' ? 'SEO' : 'Директ' },
          { label: 'Регион', value: sp.region || 'Все' },
        ].map((s) => (
          <div key={s.label} className="bg-surface-raised rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-accent">{s.value}</p>
            <p className="text-xs text-muted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Breakdown by intent ──────────────────────────────────────────── */}
      {Object.keys(byType).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([intent, count]) => (
            <span
              key={intent}
              className={cx(
                'text-xs px-2 py-1 rounded-full',
                INTENT_COLOR[intent] ?? 'bg-gray-100 text-gray-600'
              )}
            >
              {intent}: {count}
            </span>
          ))}
        </div>
      )}

      {/* ── Download buttons ─────────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-primary">Скачать семантическое ядро</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {FORMATS.map(({ fmt, label, desc, icon }) => (
            <button
              key={fmt}
              onClick={() => download(fmt)}
              disabled={!!downloading || totalKw === 0}
              className={cx(
                'flex flex-col items-start gap-1 p-4 rounded-xl border text-left transition',
                'border-[var(--border)] hover:border-accent/50 hover:bg-[var(--accent-subtle)]',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <div className="flex items-center gap-2 w-full">
                <span className="text-lg">{icon}</span>
                <span className="font-semibold text-sm text-primary">{label}</span>
                {downloading === fmt && (
                  <span className="ml-auto w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                )}
              </div>
              <p className="text-[11px] text-muted leading-snug">{desc}</p>
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        {totalKw === 0 && (
          <p className="text-xs text-muted">Нет активных ключей для экспорта</p>
        )}
      </div>

      {/* ── Completion ───────────────────────────────────────────────────── */}
      <div className="border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 rounded-xl p-4 space-y-1">
        <p className="text-sm font-medium text-green-700 dark:text-green-400">
          Семантическое ядро готово
        </p>
        <p className="text-xs text-green-600 dark:text-green-500">
          {sp.mode === 'seo'
            ? 'Используйте кластеры как основу для структуры сайта и контент-плана.'
            : 'Кластеры готовы к загрузке в Яндекс Директ Командер через XLSX.'}
        </p>
      </div>
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

// ─── Autopilot or Manual Choice ──────────────────────────────────────────────

const AUTOPILOT_STAGES: Record<string, string> = {
  masks: 'Генерация масок из бриф...',
  wordstat_masks: 'Сбор частотности масок...',
  expand: 'Расширение семантики (ИИ)...',
  wordstat_kw: 'Сбор частотности ключей...',
  wordstat_expand: 'Сбор частотности ключей...',
  clean: 'Авто-очистка...',
  cluster: 'Кластеризация (ИИ)...',
  done: 'Готово!',
}

function AutopilotOrManual({
  projectId,
  sp,
  onManual,
  onAutopilotDone,
}: {
  projectId: string
  sp: SemanticProject
  onManual: () => void
  onAutopilotDone: () => void
}) {
  const qc = useQueryClient()
  const [taskId, setTaskId] = useState<string | null>(null)
  const [taskResult, setTaskResult] = useState<TaskResult | null>(null)
  const [taskError, setTaskError] = useState('')
  const [minFreq, setMinFreq] = useState(0)

  // Restore running task on mount (survives page reload / tab switch)
  useEffect(() => {
    if (taskId || taskResult) return
    tasksApi.active(projectId, 'semantic_autopilot').then((t) => {
      if (t?.id) setTaskId(t.id)
    }).catch(() => {})
  }, [projectId])

  const autopilotMut = useMutation({
    mutationFn: () => marketingApi.autopilot(projectId, sp.id, { min_freq_exact: minFreq }),
    onSuccess: (d) => { setTaskId(d.task_id); setTaskError('') },
    onError: (e: any) => setTaskError(e?.response?.data?.detail || 'Ошибка запуска'),
  })

  const { data: taskLive } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => tasksApi.get(taskId!),
    enabled: !!taskId,
    refetchInterval: 2000,
  })

  useEffect(() => {
    if (!taskLive || !taskId) return
    if (taskLive.status === 'success' || taskLive.status === 'failed') {
      setTaskResult(taskLive)
      setTaskId(null)
      if (taskLive.status === 'success') {
        onAutopilotDone()
      }
    }
  }, [taskLive?.status])

  const progress = taskLive?.progress ?? 0
  const stageName = AUTOPILOT_STAGES[(taskLive?.result as any)?.stage] || ''
  const isRunning = !!taskId

  // If autopilot already completed (pipeline_step >= 4), show result
  if (sp.pipeline_step >= 4 && !isRunning && !taskResult) {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-base">Проект готов</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-surface-raised rounded-xl p-3 space-y-1">
            <p className="text-xs text-muted">Режим</p>
            <p className="font-medium">{sp.mode === 'seo' ? 'SEO' : 'Яндекс Директ'}</p>
          </div>
          {sp.region && (
            <div className="bg-surface-raised rounded-xl p-3 space-y-1">
              <p className="text-xs text-muted">Регион</p>
              <p className="font-medium">{sp.region}</p>
            </div>
          )}
        </div>
        <p className="text-sm text-muted">Семантическое ядро собрано. Перейдите к очистке для модерации или к экспорту.</p>
        <div className="flex gap-2">
          <button onClick={onManual} className="btn-ghost px-4 py-1.5 text-sm border border-[var(--border)] rounded-xl">
            Ручной режим (маски)
          </button>
        </div>
      </div>
    )
  }

  // Running state
  if (isRunning) {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-base">Автопилот работает</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-accent">
            <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            <span>{stageName || `Обработка... ${progress}%`}</span>
          </div>
          <div className="w-full bg-[var(--border)] rounded-full h-2.5 overflow-hidden">
            <div className="bg-accent h-2.5 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-muted">{progress}% — задача выполняется на сервере, можно переключаться</p>
        </div>
      </div>
    )
  }

  // Error state
  if (taskResult?.status === 'failed') {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-base">Автопилот</h3>
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-sm text-red-700 dark:text-red-400">
          {taskResult.error || 'Неизвестная ошибка'}
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setTaskResult(null); autopilotMut.mutate() }} className="btn-primary px-4 py-1.5 text-sm">
            Повторить
          </button>
          <button onClick={onManual} className="btn-ghost px-4 py-1.5 text-sm border border-[var(--border)] rounded-xl">
            Ручной режим
          </button>
        </div>
      </div>
    )
  }

  // Initial choice
  return (
    <div className="space-y-5">
      <h3 className="font-semibold text-base">Шаг 1 — Как собрать семантику?</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Autopilot card */}
        <div className="border-2 border-accent/30 rounded-2xl p-5 space-y-3 bg-[var(--accent-subtle)]">
          <div className="flex items-center gap-2">
            <span className="text-lg">&#9889;</span>
            <h4 className="font-semibold text-primary">Автопилот</h4>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            ИИ автоматически сгенерирует маски из бриф, расширит семантику, соберёт частотность, очистит от мусора и сгруппирует в кластеры. Вам останется только проверить результат.
          </p>
          <p className="text-[11px] text-muted">Требуется: заполненный бриф + API-ключ OpenRouter</p>

          <div>
            <label className="block text-[11px] text-muted mb-1">Мин. точная частотность (0 = не фильтровать)</label>
            <input
              type="number" min={0} className="field w-24 text-sm"
              value={minFreq} onChange={(e) => setMinFreq(Number(e.target.value))}
            />
          </div>

          <button
            onClick={() => autopilotMut.mutate()}
            disabled={autopilotMut.isPending}
            className="btn-primary px-5 py-2 text-sm w-full"
          >
            {autopilotMut.isPending ? 'Запуск...' : 'Запустить автопилот'}
          </button>
          {taskError && <p className="text-xs text-red-500">{taskError}</p>}
        </div>

        {/* Manual card */}
        <div className="border border-[var(--border)] rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">&#9997;</span>
            <h4 className="font-semibold text-primary">Ручной режим</h4>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Вы сами вводите маски, контролируете каждый шаг: какие маски расширять, какие ключи оставить, как кластеризовать.
          </p>
          <p className="text-[11px] text-muted">Для опытных специалистов или нестандартных ниш</p>

          <div className="grid grid-cols-2 gap-2 text-xs text-muted mt-2">
            <div className="bg-surface-raised rounded-lg p-2">
              <p className="font-medium text-primary">{sp.name}</p>
              <p>{sp.mode === 'seo' ? 'SEO' : 'Директ'}{sp.region ? ` · ${sp.region}` : ''}</p>
            </div>
            <div className="bg-surface-raised rounded-lg p-2">
              <p className="font-medium text-primary">{sp.is_seasonal ? 'Сезонный' : 'Не сезонный'}</p>
            </div>
          </div>

          <button
            onClick={onManual}
            className="btn-ghost px-5 py-2 text-sm w-full border border-[var(--border)] rounded-xl hover:bg-surface-raised"
          >
            Начать вручную
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MarketingTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [activeMode, setActiveMode] = useState<SemanticMode>('seo')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [activeStep, setActiveStep] = useState(1)
  const [showLegend, setShowLegend] = useState(false)

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
    mutationFn: () => {
      if (!window.confirm('Удалить семантический проект и все ключевые слова? Это действие нельзя отменить.')) {
        return Promise.reject(new Error('cancelled'))
      }
      return marketingApi.delete(projectId, sp!.id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sem-projects', projectId] })
      setActiveStep(1)
    },
    onError: (e: any) => {
      if (e?.message === 'cancelled') return
      alert(e?.response?.data?.detail || 'Ошибка удаления')
    },
  })

  // Sync activeStep with pipeline_step when sp changes
  const pipelineStep = sp?.pipeline_step ?? 0

  return (
    <div className="p-6 space-y-6">
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
          <div className="flex gap-1 flex-wrap items-center">
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
            <div className="flex-1" />
            <button
              onClick={() => setShowLegend(true)}
              className="px-3 py-1 text-xs rounded-full border border-[var(--border)] text-muted hover:text-primary transition"
              title="Справочник терминов"
            >
              ? Справочник
            </button>
          </div>

          <div className="bg-surface border border-[var(--border)] rounded-2xl p-5">
            {activeStep === 1 && (
              <AutopilotOrManual
                projectId={projectId}
                sp={sp}
                onManual={() => setActiveStep(2)}
                onAutopilotDone={() => {
                  qc.invalidateQueries({ queryKey: ['sem-projects', projectId] })
                  qc.invalidateQueries({ queryKey: ['sem-keywords', projectId, sp.id] })
                  qc.invalidateQueries({ queryKey: ['clusters', projectId, sp.id] })
                  setActiveStep(4) // go to Cleaning for moderation
                }}
              />
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
              <>
                <h3 className="font-semibold text-base mb-4">Шаг 4 — Очистка</h3>
                <CleaningStep
                  projectId={projectId}
                  sp={sp}
                  onStepAdvance={() => setActiveStep(5)}
                />
              </>
            )}

            {activeStep === 5 && (
              <>
                <h3 className="font-semibold text-base mb-4">Шаг 5 — Кластеризация</h3>
                <ClusterStep
                  projectId={projectId}
                  sp={sp}
                  onStepAdvance={() => setActiveStep(6)}
                />
              </>
            )}

            {activeStep === 6 && (
              <>
                <h3 className="font-semibold text-base mb-4">Шаг 6 — Экспорт</h3>
                <ExportStep projectId={projectId} sp={sp} />
              </>
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

      {/* ── Legend modal ────────────────────────────────────────────────────── */}
      {showLegend && <Legend onClose={() => setShowLegend(false)} />}
    </div>
  )
}
