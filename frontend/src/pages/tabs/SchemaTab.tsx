import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { seoApi, type SeoPage } from '../../api/seo'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

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
}

const ALL_SCHEMA_TYPES = [
  'Organization', 'LocalBusiness', 'Product', 'Article', 'FAQPage',
  'WebSite', 'BreadcrumbList', 'Person', 'WebPage', 'Service',
  'Event', 'Recipe', 'Review', 'HowTo', 'VideoObject', 'JobPosting',
]

function validateSchemaOrg(json: string): { valid: boolean; errors: string[]; warnings: string[] } {
  try {
    const data = JSON.parse(json)
    const errors: string[] = []
    const warnings: string[] = []
    if (!data['@context']) {
      errors.push('@context отсутствует')
    } else if (!String(data['@context']).includes('schema.org')) {
      errors.push('@context должен содержать "schema.org"')
    }
    if (!data['@type']) {
      errors.push('@type отсутствует')
    } else {
      const type = Array.isArray(data['@type']) ? data['@type'][0] : data['@type']
      const required = SCHEMA_REQUIRED_FIELDS[type] || []
      for (const field of required) {
        if (data[field] === undefined || data[field] === null || data[field] === '') {
          warnings.push(`Рекомендуемое поле "${field}" отсутствует для типа ${type}`)
        }
      }
      if (!SCHEMA_REQUIRED_FIELDS[type]) {
        warnings.push(`Тип "${type}" не входит в список часто проверяемых — проверьте документацию schema.org`)
      }
    }
    return { valid: errors.length === 0, errors, warnings }
  } catch {
    return { valid: false, errors: ['Невалидный JSON — ошибка разбора'], warnings: [] }
  }
}

export default function SchemaTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [pageUrl, setPageUrl] = useState('')
  const [schemaType, setSchemaType] = useState('Organization')
  const [copied, setCopied] = useState(false)
  const [validatorInput, setValidatorInput] = useState('')
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: string[]; warnings: string[] } | null>(null)

  const { data: pagesData } = useQuery({
    queryKey: ['seo-pages-all', projectId],
    queryFn: () => seoApi.getPages(projectId, { limit: 200 }),
  })
  const pages: SeoPage[] = pagesData?.pages || []

  const { data: existing } = useQuery({
    queryKey: ['schema', projectId, pageUrl],
    queryFn: () => seoApi.getSchema(projectId, pageUrl),
    enabled: !!pageUrl,
    retry: false,
  })

  const genMut = useMutation({
    mutationFn: () => seoApi.generateSchema(projectId, pageUrl, schemaType),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schema', projectId, pageUrl] }),
    onError: (err: any) => alert(err?.response?.data?.detail || 'Ошибка генерации'),
  })

  const resultJson = genMut.data?.schema_json || existing?.schema_json || ''
  const copy = () => { navigator.clipboard.writeText(resultJson); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  const copyToValidator = () => { setValidatorInput(resultJson); setValidationResult(null) }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Generator */}
      <div className="bg-white border rounded-lg p-5">
        <h3 className="font-semibold text-lg mb-1">Генератор Schema.org</h3>
        <p className="text-xs text-gray-500 mb-4">ИИ создаст JSON-LD разметку на основе данных страницы и брифа проекта</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Страница</label>
            <select value={pageUrl} onChange={e => setPageUrl(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">— выберите страницу —</option>
              {pages.map((p) => (
                <option key={p.page_url} value={p.page_url}>{p.page_url}</option>
              ))}
            </select>
            {pages.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">Нет страниц — сначала запустите парсинг</p>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Тип Schema</label>
            <select value={schemaType} onChange={e => setSchemaType(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              {ALL_SCHEMA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <button onClick={() => genMut.mutate()} disabled={genMut.isPending || !pageUrl}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
          {genMut.isPending ? '⏳ Генерация...' : '✨ Сгенерировать JSON-LD'}
        </button>

        {resultJson && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-600">Результат:</p>
              <div className="flex gap-2">
                <button onClick={copyToValidator}
                  className="text-xs text-primary-600 hover:text-primary-700 border border-primary-200 rounded px-2 py-1">
                  → Проверить в валидаторе
                </button>
                <button onClick={copy}
                  className={cx('text-xs px-2 py-1 rounded transition border',
                    copied ? 'bg-green-600 text-white border-green-600' : 'text-gray-600 border-gray-300 hover:bg-gray-50')}>
                  {copied ? '✅ Скопировано' : '📋 Копировать'}
                </button>
              </div>
            </div>
            <pre className="bg-gray-900 text-green-300 text-xs rounded-lg p-4 overflow-auto max-h-72 font-mono">{resultJson}</pre>
            <p className="text-xs text-gray-400 mt-2">
              Вставьте этот код в секцию <code className="bg-gray-100 px-1 rounded">&lt;head&gt;</code> вашей страницы внутри тега{' '}
              <code className="bg-gray-100 px-1 rounded">&lt;script type="application/ld+json"&gt;</code>
            </p>
          </div>
        )}
      </div>

      {/* Validator */}
      <div className="bg-white border rounded-lg p-5">
        <h3 className="font-semibold text-lg mb-1">Валидатор Schema.org</h3>
        <p className="text-xs text-gray-500 mb-4">
          Вставьте JSON-LD разметку для проверки — аналог{' '}
          <span className="font-medium">validator.schema.org</span>, но прямо в системе
        </p>
        <textarea
          rows={12}
          className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 mb-3"
          placeholder={'{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "Моя компания",\n  "url": "https://example.com"\n}'}
          value={validatorInput}
          onChange={e => { setValidatorInput(e.target.value); setValidationResult(null) }}
        />
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setValidationResult(validateSchemaOrg(validatorInput))}
            disabled={!validatorInput.trim()}
            className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
            Проверить
          </button>
          <button
            onClick={() => { setValidatorInput(''); setValidationResult(null) }}
            className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
            Очистить
          </button>
        </div>

        {validationResult && (
          <div className="space-y-3">
            <div className={cx('flex items-center gap-2 px-4 py-3 rounded-lg font-medium',
              validationResult.valid ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200')}>
              {validationResult.valid ? '✅ Разметка валидна' : '❌ Обнаружены ошибки'}
            </div>
            {validationResult.errors.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Ошибки ({validationResult.errors.length})</p>
                {validationResult.errors.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2">
                    <span className="shrink-0">✗</span><span>{e}</span>
                  </div>
                ))}
              </div>
            )}
            {validationResult.warnings.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-yellow-600 uppercase tracking-wide">Предупреждения ({validationResult.warnings.length})</p>
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
      <div className="bg-gray-50 border rounded-lg p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Справочник типов и обязательных полей</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {Object.entries(SCHEMA_REQUIRED_FIELDS).map(([type, fields]) => (
            <div key={type} className="bg-white border rounded px-3 py-2 flex items-center gap-2">
              <span className="font-medium text-gray-800">{type}</span>
              <span className="text-gray-400">{fields.join(', ')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
