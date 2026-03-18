import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { seoApi, type SeoPage } from '../../api/seo'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

// ─── Schema types grouped by category ───────────────────────────────────────

const SCHEMA_GROUPS: { label: string; types: string[] }[] = [
  { label: 'Бизнес', types: ['Organization', 'LocalBusiness', 'Service'] },
  { label: 'Контент', types: ['Article', 'WebPage', 'WebSite', 'FAQPage', 'HowTo', 'Recipe', 'VideoObject'] },
  { label: 'Товары и отзывы', types: ['Product', 'Review'] },
  { label: 'Люди и события', types: ['Person', 'Event', 'JobPosting'] },
  { label: 'Навигация', types: ['BreadcrumbList'] },
]

const ALL_SCHEMA_TYPES = SCHEMA_GROUPS.flatMap(g => g.types)

// ─── Validator ───────────────────────────────────────────────────────────────

const SCHEMA_REQUIRED_FIELDS: Record<string, string[]> = {
  Organization: ['name'],
  LocalBusiness: ['name', 'address'],
  Product: ['name'],
  Article: ['headline', 'author'],
  FAQPage: ['mainEntity'],
  BreadcrumbList: ['itemListElement'],
  WebSite: ['name', 'url'],
  Person: ['name'],
  WebPage: ['name'],
  Service: ['name'],
  Event: ['name', 'startDate'],
  Recipe: ['name', 'recipeIngredient'],
  Review: ['itemReviewed', 'reviewRating'],
  VideoObject: ['name', 'description', 'thumbnailUrl'],
  JobPosting: ['title', 'datePosted', 'hiringOrganization'],
  HowTo: ['name', 'step'],
}

function validateSchemaOrg(json: string): { valid: boolean; errors: string[]; warnings: string[] } {
  try {
    const data = JSON.parse(json)
    const errors: string[] = []
    const warnings: string[] = []

    // Support @graph
    const items: any[] = data['@graph'] ? data['@graph'] : [data]

    if (!data['@context']) {
      errors.push('@context отсутствует')
    } else if (!String(data['@context']).includes('schema.org')) {
      errors.push('@context должен содержать "schema.org"')
    }

    for (const item of items) {
      if (!item['@type']) {
        errors.push('@type отсутствует' + (data['@graph'] ? ' (в одном из элементов @graph)' : ''))
      } else {
        const type = Array.isArray(item['@type']) ? item['@type'][0] : item['@type']
        const required = SCHEMA_REQUIRED_FIELDS[type] || []
        for (const field of required) {
          if (item[field] === undefined || item[field] === null || item[field] === '') {
            warnings.push(`[${type}] рекомендуемое поле "${field}" отсутствует`)
          }
        }
        if (!SCHEMA_REQUIRED_FIELDS[type]) {
          warnings.push(`Тип "${type}" — нет в справочнике, проверьте schema.org`)
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings }
  } catch {
    return { valid: false, errors: ['Невалидный JSON — ошибка разбора'], warnings: [] }
  }
}

// ─── Type Selector ───────────────────────────────────────────────────────────

function TypeSelector({
  selected,
  onChange,
}: {
  selected: Set<string>
  onChange: (s: Set<string>) => void
}) {
  const toggle = (t: string) => {
    const next = new Set(selected)
    next.has(t) ? next.delete(t) : next.add(t)
    onChange(next)
  }
  const toggleGroup = (types: string[]) => {
    const allSelected = types.every(t => selected.has(t))
    const next = new Set(selected)
    if (allSelected) types.forEach(t => next.delete(t))
    else types.forEach(t => next.add(t))
    onChange(next)
  }

  return (
    <div className="space-y-3">
      {SCHEMA_GROUPS.map(group => {
        const allOn = group.types.every(t => selected.has(t))
        const someOn = group.types.some(t => selected.has(t))
        return (
          <div key={group.label}>
            <button
              onClick={() => toggleGroup(group.types)}
              className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wide mb-1.5 hover:text-primary">
              <span className={cx('w-3 h-3 rounded border flex items-center justify-center shrink-0 transition',
                allOn ? 'bg-accent border-accent' : someOn ? 'bg-accent-subtle border-accent' : 'border-[var(--border)]')}>
                {(allOn || someOn) && <span className="text-white text-[8px] leading-none">{'✓'}</span>}
              </span>
              {group.label}
            </button>
            <div className="flex flex-wrap gap-2 pl-5">
              {group.types.map(t => (
                <label key={t}
                  className={cx('flex items-center gap-1.5 text-sm px-3 py-1 rounded-full border cursor-pointer transition select-none',
                    selected.has(t)
                      ? 'bg-accent text-white border-accent'
                      : 'bg-surface text-muted border-[var(--border)] hover:border-accent hover:text-accent')}>
                  <input type="checkbox" className="sr-only" checked={selected.has(t)} onChange={() => toggle(t)} />
                  {t}
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function SchemaTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [pageUrl, setPageUrl] = useState('')
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(['Organization']))
  const [generatedJson, setGeneratedJson] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [copied, setCopied] = useState(false)
  const [validatorInput, setValidatorInput] = useState('')
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: string[]; warnings: string[] } | null>(null)

  const { data: pagesData } = useQuery({
    queryKey: ['seo-pages-all', projectId],
    queryFn: () => seoApi.getPages(projectId, { limit: 200 }),
  })
  const pages: SeoPage[] = pagesData?.pages || []

  const handleGenerate = async () => {
    if (!pageUrl || selectedTypes.size === 0) return
    setGenerating(true)
    setGenError('')
    setGeneratedJson('')
    try {
      const types = Array.from(selectedTypes)
      // Generate all types in parallel
      const results = await Promise.all(
        types.map(t => seoApi.generateSchema(projectId, pageUrl, t))
      )
      const schemas = results.map(r => r.schema_json).filter(Boolean)
      if (schemas.length === 0) {
        setGenError('Не удалось сгенерировать разметку')
        return
      }
      if (schemas.length === 1) {
        setGeneratedJson(schemas[0])
      } else {
        // Combine multiple schemas into @graph
        const parsed = schemas.map(s => {
          try { return JSON.parse(s) } catch { return null }
        }).filter(Boolean)
        const combined = JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': parsed.map(p => {
            const { '@context': _, ...rest } = p
            return rest
          }),
        }, null, 2)
        setGeneratedJson(combined)
      }
    } catch (e: any) {
      setGenError(e?.response?.data?.detail || 'Ошибка генерации')
    } finally {
      setGenerating(false)
    }
  }

  const copy = () => { navigator.clipboard.writeText(generatedJson); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  const copyToValidator = () => { setValidatorInput(generatedJson); setValidationResult(null) }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Generator */}
      <div className="bg-surface border rounded-xl p-5">
        <h3 className="font-semibold text-lg mb-1">Генератор Schema.org</h3>
        <p className="text-xs text-muted mb-4">
          Выберите страницу и один или несколько типов схемы — ИИ сгенерирует JSON-LD на основе данных страницы и брифа.
          При нескольких типах результат объединяется через <code className="bg-surface-raised px-1 rounded">@graph</code>.
        </p>

        <div className="mb-4">
          <label className="block text-xs text-muted mb-1">Страница</label>
          <select value={pageUrl} onChange={e => setPageUrl(e.target.value)}
            className="field">
            <option value="">— выберите страницу —</option>
            {pages.map(p => (
              <option key={p.page_url} value={p.page_url}>{p.page_url}</option>
            ))}
          </select>
          {pages.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">Нет страниц — сначала запустите парсинг</p>
          )}
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs text-muted">Типы Schema ({selectedTypes.size} выбрано)</label>
            <div className="flex gap-2">
              <button onClick={() => setSelectedTypes(new Set(ALL_SCHEMA_TYPES))}
                className="text-xs text-accent hover:text-accent">Все</button>
              <span className="text-muted">|</span>
              <button onClick={() => setSelectedTypes(new Set())}
                className="text-xs text-muted hover:text-primary">Сбросить</button>
            </div>
          </div>
          <div className="border rounded-xl p-3 bg-surface-raised">
            <TypeSelector selected={selectedTypes} onChange={setSelectedTypes} />
          </div>
        </div>

        {genError && (
          <p className="text-sm text-red-600 mb-3">❌ {genError}</p>
        )}

        <button onClick={handleGenerate} disabled={generating || !pageUrl || selectedTypes.size === 0}
          className="btn-accent px-4 py-2 rounded-xl text-sm hover:bg-accent disabled:opacity-50">
          {generating
            ? `⏳ Генерация ${selectedTypes.size > 1 ? `(${selectedTypes.size} типов)` : ''}...`
            : `✨ Сгенерировать JSON-LD${selectedTypes.size > 1 ? ` (${selectedTypes.size} типа)` : ''}`}
        </button>

        {generatedJson && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted">
                Результат{selectedTypes.size > 1 ? ` — @graph с ${selectedTypes.size} схемами` : ''}:
              </p>
              <div className="flex gap-2">
                <button onClick={copyToValidator}
                  className="text-xs text-accent hover:text-accent border border-primary-200 rounded px-2 py-1">
                  → Проверить в валидаторе
                </button>
                <button onClick={copy}
                  className={cx('text-xs px-2 py-1 rounded transition border',
                    copied ? 'bg-green-600 text-white border-green-600' : 'text-muted border-[var(--border)] hover:bg-surface-raised')}>
                  {copied ? '✅ Скопировано' : '📋 Копировать'}
                </button>
              </div>
            </div>
            <pre className="bg-gray-900 text-green-300 text-xs rounded-xl p-4 overflow-auto max-h-80 font-mono">{generatedJson}</pre>
            <p className="text-xs text-muted mt-2">
              Вставьте в <code className="bg-surface-raised px-1 rounded">&lt;head&gt;</code> внутри тега{' '}
              <code className="bg-surface-raised px-1 rounded">&lt;script type="application/ld+json"&gt;</code>
            </p>
          </div>
        )}
      </div>

      {/* Validator */}
      <div className="bg-surface border rounded-xl p-5">
        <h3 className="font-semibold text-lg mb-1">Валидатор Schema.org</h3>
        <p className="text-xs text-muted mb-4">
          Вставьте JSON-LD (включая <code className="bg-surface-raised px-1 rounded">@graph</code>) для проверки
        </p>
        <textarea
          rows={12}
          className="field font-mono"
          placeholder={'{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "Моя компания",\n  "url": "https://example.com"\n}'}
          value={validatorInput}
          onChange={e => { setValidatorInput(e.target.value); setValidationResult(null) }}
        />
        <div className="flex gap-2 mb-4">
          <button onClick={() => setValidationResult(validateSchemaOrg(validatorInput))}
            disabled={!validatorInput.trim()}
            className="btn-accent px-4 py-2 rounded-xl text-sm hover:bg-accent disabled:opacity-50">
            Проверить
          </button>
          <button onClick={() => { setValidatorInput(''); setValidationResult(null) }}
            className="border px-4 py-2 rounded-xl text-sm hover:bg-surface-raised">
            Очистить
          </button>
        </div>

        {validationResult && (
          <div className="space-y-3">
            <div className={cx('flex items-center gap-2 px-4 py-3 rounded-xl font-medium',
              validationResult.valid ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200')}>
              {validationResult.valid ? '✅ Разметка валидна' : '❌ Обнаружены ошибки'}
            </div>
            {validationResult.errors.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Ошибки</p>
                {validationResult.errors.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2">
                    <span className="shrink-0">✗</span><span>{e}</span>
                  </div>
                ))}
              </div>
            )}
            {validationResult.warnings.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-yellow-600 uppercase tracking-wide">Предупреждения</p>
                {validationResult.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-yellow-700 bg-yellow-50 border border-yellow-100 rounded px-3 py-2">
                    <span className="shrink-0">⚠</span><span>{w}</span>
                  </div>
                ))}
              </div>
            )}
            {validationResult.valid && validationResult.warnings.length === 0 && (
              <p className="text-sm text-green-600">Все обязательные и рекомендуемые поля присутствуют.</p>
            )}
          </div>
        )}
      </div>

      {/* Reference */}
      <div className="bg-surface-raised border rounded-xl p-5">
        <h4 className="text-sm font-semibold text-primary mb-3">Справочник типов и обязательных полей</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {Object.entries(SCHEMA_REQUIRED_FIELDS).map(([type, fields]) => (
            <div key={type} className="bg-surface border rounded px-3 py-2 flex items-center gap-2">
              <span className="font-medium text-primary shrink-0">{type}</span>
              <span className="text-muted truncate">{fields.join(', ')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
