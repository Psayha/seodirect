import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ogApi, type OgPage } from '../../api/og'
import { seoApi } from '../../api/seo'

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

export default function OgTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [issuesOnly, setIssuesOnly] = useState(false)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null)
  const [editForms, setEditForms] = useState<Record<string, { rec_og_title: string; rec_og_description: string; twitter_card: string; twitter_title: string; twitter_description: string }>>({})
  const [previewPlatform, setPreviewPlatform] = useState<'telegram' | 'vk' | 'whatsapp'>('telegram')
  const [showHtmlExport, setShowHtmlExport] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['og-audit', projectId, issuesOnly],
    queryFn: () => ogApi.getAudit(projectId, { issues_only: issuesOnly, limit: 100 }),
  })

  const { data: taskStatus } = useQuery({
    queryKey: ['seo-task', taskId],
    queryFn: () => seoApi.getTaskStatus(projectId, taskId!),
    enabled: !!taskId,
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.status
      return s === 'running' || s === 'pending' ? 2000 : false
    },
  })

  const { data: htmlSnippets, refetch: refetchSnippets } = useQuery({
    queryKey: ['og-html-export', projectId],
    queryFn: () => ogApi.exportHtml(projectId),
    enabled: showHtmlExport,
  })

  const copySnippet = (url: string, html: string) => {
    navigator.clipboard.writeText(html)
    setCopiedUrl(url)
    setTimeout(() => setCopiedUrl(null), 2000)
  }

  const genMut = useMutation({
    mutationFn: () => ogApi.generate(projectId),
    onSuccess: (d: any) => setTaskId(d.task_id),
  })
  const saveMut = useMutation({
    mutationFn: ({ url, form }: { url: string; form: { rec_og_title: string; rec_og_description: string } }) =>
      ogApi.updateMeta(projectId, url, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['og-audit', projectId] }); setExpandedUrl(null) },
  })

  const stats = data?.stats
  const isRunning = taskStatus?.status === 'running' || taskStatus?.status === 'pending'
  const isDone = taskStatus?.status === 'success'

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold">OpenGraph теги</h3>
        <button onClick={() => genMut.mutate()} disabled={genMut.isPending || isRunning}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
          {genMut.isPending || isRunning ? '⏳ Генерация...' : '✨ Сгенерировать OG теги'}
        </button>
      </div>

      {taskId && (
        <div className={cx('rounded-lg p-3 mb-4 text-sm', isDone ? 'bg-green-50 border border-green-200 text-green-700' : isRunning ? 'bg-blue-50 border border-blue-200 text-blue-700' : 'bg-red-50 text-red-700')}>
          {isRunning && `⏳ Генерация: ${taskStatus?.progress ?? 0}%`}
          {isDone && `✅ Готово: ${(taskStatus?.result as any)?.pages_generated ?? 0} страниц`}
          {isDone && <button onClick={() => refetch()} className="ml-3 underline">Обновить</button>}
        </div>
      )}

      {/* Stats */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Всего страниц', value: stats.total, color: 'text-gray-700' },
            { label: 'Есть og:title', value: stats.has_og_title, color: 'text-green-600' },
            { label: 'Есть og:description', value: stats.has_og_description, color: 'text-green-600' },
            { label: 'Полностью OK', value: stats.fully_ok, color: stats.fully_ok === stats.total ? 'text-green-600' : 'text-orange-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={cx('text-xl font-bold', color)}>{value}</p>
            </div>
          ))}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer mb-3">
        <input type="checkbox" className="rounded" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} />
        Только страницы с проблемами
      </label>

      {isLoading ? <div className="text-gray-500">Загрузка...</div> :
        data?.crawl_status === 'not_done' ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📭</p>
            <p className="font-medium">Нет данных парсинга</p>
            <p className="text-sm mt-1">Запустите парсинг на вкладке «Парсинг»</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(data?.pages ?? []).map((page: OgPage) => {
              const isExpanded = expandedUrl === page.page_url
              const form = editForms[page.page_url] || { rec_og_title: page.rec_og_title || '', rec_og_description: page.rec_og_description || '', twitter_card: page.twitter_card || 'summary_large_image', twitter_title: page.twitter_title || '', twitter_description: page.twitter_description || '' }
              return (
                <div key={page.page_url} className={cx('border rounded-lg bg-white overflow-hidden',
                  page.has_rec ? 'border-green-200' : (page.missing_title || page.missing_description) ? 'border-red-200' : '')}>
                  <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 text-sm"
                    onClick={() => setExpandedUrl(isExpanded ? null : page.page_url)}>
                    <span className="text-gray-400 text-xs w-3">{isExpanded ? '▼' : '▶'}</span>
                    <span className="flex-1 font-mono text-xs truncate" title={page.page_url}>{page.page_url}</span>
                    <div className="flex gap-1 shrink-0">
                      {page.missing_title && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded">title</span>}
                      {page.missing_description && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded">desc</span>}
                      {page.missing_image && <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded">image</span>}
                      {page.has_rec && <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">✓</span>}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t p-3 bg-gray-50 space-y-3">
                      {/* Current OG */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-gray-500 font-medium mb-1">og:title</p>
                          <p className={cx(page.missing_title ? 'text-red-500 italic' : 'text-gray-700')}>{page.og_title || 'нет'}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 font-medium mb-1">og:description</p>
                          <p className={cx(page.missing_description ? 'text-red-500 italic' : 'text-gray-700')}>{page.og_description || 'нет'}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 font-medium mb-1">og:image</p>
                          <p className={cx(page.missing_image ? 'text-red-500 italic' : 'text-gray-700 truncate')}>{page.og_image || 'нет'}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 font-medium mb-1">og:type</p>
                          <p className="text-gray-700">{page.og_type || 'нет'}</p>
                        </div>
                      </div>

                      {/* OG Preview with platform switcher */}
                      {(page.og_title || form.rec_og_title) && (
                        <div>
                          <div className="flex gap-1 mb-2">
                            {(['telegram', 'vk', 'whatsapp'] as const).map((p) => (
                              <button key={p} onClick={() => setPreviewPlatform(p)}
                                className={cx('text-xs px-2.5 py-1 rounded-full border font-medium transition',
                                  previewPlatform === p ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 hover:bg-gray-50')}>
                                {p === 'telegram' ? '✈️ Telegram' : p === 'vk' ? '💙 VK' : '📱 WhatsApp'}
                              </button>
                            ))}
                          </div>

                          {/* Telegram */}
                          {previewPlatform === 'telegram' && (
                            <div className="border-l-4 border-blue-400 bg-[#eef3fb] rounded-r-lg overflow-hidden max-w-sm">
                              {page.og_image && <img src={page.og_image} alt="" className="w-full h-32 object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                              <div className="p-2">
                                <p className="text-xs text-blue-500 font-medium">{new URL(page.page_url).hostname}</p>
                                <p className="text-sm font-semibold text-gray-900 line-clamp-2">{form.rec_og_title || page.og_title}</p>
                                <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">{form.rec_og_description || page.og_description}</p>
                              </div>
                            </div>
                          )}

                          {/* VK */}
                          {previewPlatform === 'vk' && (
                            <div className="border rounded-lg overflow-hidden bg-white max-w-sm shadow-sm">
                              {page.og_image && <img src={page.og_image} alt="" className="w-full h-36 object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                              <div className="p-3 border-t">
                                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{new URL(page.page_url).hostname}</p>
                                <p className="text-sm font-bold text-gray-900 line-clamp-2">{form.rec_og_title || page.og_title}</p>
                                <p className="text-xs text-gray-500 line-clamp-3 mt-1">{form.rec_og_description || page.og_description}</p>
                              </div>
                            </div>
                          )}

                          {/* WhatsApp */}
                          {previewPlatform === 'whatsapp' && (
                            <div className="bg-[#dcf8c6] rounded-lg overflow-hidden max-w-sm p-0.5">
                              <div className="bg-white rounded-md overflow-hidden">
                                {page.og_image && <img src={page.og_image} alt="" className="w-full h-32 object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                                <div className="p-2 border-l-4 border-green-500">
                                  <p className="text-xs text-green-600 font-medium">{new URL(page.page_url).hostname}</p>
                                  <p className="text-sm font-semibold text-gray-900 line-clamp-2">{form.rec_og_title || page.og_title}</p>
                                  <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{form.rec_og_description || page.og_description}</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Edit recommended */}
                      <div className="space-y-2 pt-1">
                        <div>
                          <div className="flex justify-between mb-0.5">
                            <label className="text-xs text-gray-600">Рек. og:title</label>
                            <CharBadge len={form.rec_og_title.length} max={90} />
                          </div>
                          <input className="w-full border rounded px-2 py-1 text-sm bg-white"
                            placeholder="OG заголовок для соцсетей (60–90 симв.)"
                            value={form.rec_og_title}
                            onChange={(e) => setEditForms((f) => ({ ...f, [page.page_url]: { ...form, rec_og_title: e.target.value } }))} />
                        </div>
                        <div>
                          <div className="flex justify-between mb-0.5">
                            <label className="text-xs text-gray-600">Рек. og:description</label>
                            <CharBadge len={form.rec_og_description.length} max={200} />
                          </div>
                          <textarea rows={2} className="w-full border rounded px-2 py-1 text-sm bg-white"
                            placeholder="OG описание (150–200 симв.)"
                            value={form.rec_og_description}
                            onChange={(e) => setEditForms((f) => ({ ...f, [page.page_url]: { ...form, rec_og_description: e.target.value } }))} />
                        </div>

                        {/* Twitter Card */}
                        <div className="pt-1 border-t">
                          <p className="text-xs font-semibold text-gray-500 mb-1.5">Twitter Card</p>
                          <div className="flex gap-2 mb-1.5">
                            {(['summary', 'summary_large_image'] as const).map((v) => (
                              <button key={v} type="button"
                                onClick={() => setEditForms((f) => ({ ...f, [page.page_url]: { ...form, twitter_card: v } }))}
                                className={cx('text-xs px-2 py-1 rounded border', form.twitter_card === v ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600')}>
                                {v === 'summary' ? 'summary' : 'summary_large_image'}
                              </button>
                            ))}
                          </div>
                          <input className="w-full border rounded px-2 py-1 text-sm bg-white mb-1"
                            placeholder="twitter:title (авто из og:title)"
                            value={form.twitter_title}
                            onChange={(e) => setEditForms((f) => ({ ...f, [page.page_url]: { ...form, twitter_title: e.target.value } }))} />
                          <textarea rows={2} className="w-full border rounded px-2 py-1 text-sm bg-white"
                            placeholder="twitter:description (авто из og:description)"
                            value={form.twitter_description}
                            onChange={(e) => setEditForms((f) => ({ ...f, [page.page_url]: { ...form, twitter_description: e.target.value } }))} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => saveMut.mutate({ url: page.page_url, form })}
                          disabled={saveMut.isPending}
                          className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                          Сохранить
                        </button>
                        <button onClick={() => setExpandedUrl(null)} className="border px-3 py-1.5 rounded-lg text-sm hover:bg-white">Закрыть</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {(data?.pages ?? []).length === 0 && (
              <div className="text-center py-10 text-gray-400">Нет страниц с OG проблемами 🎉</div>
            )}
          </div>
        )
      }

      {/* HTML Export section */}
      <div className="mt-6 border-t pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-sm text-gray-700">Экспорт HTML-кода OG тегов</h4>
          <button
            onClick={() => { setShowHtmlExport((v) => !v); if (!showHtmlExport) refetchSnippets() }}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            {showHtmlExport ? 'Скрыть ▲' : 'Показать ▼'}
          </button>
        </div>
        {showHtmlExport && (
          <div className="space-y-2">
            {!htmlSnippets ? (
              <p className="text-sm text-gray-400">Загрузка...</p>
            ) : htmlSnippets.total === 0 ? (
              <p className="text-sm text-gray-400">Нет страниц с рекомендациями. Сначала сгенерируйте OG теги.</p>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-2">{htmlSnippets.total} страниц с рекомендациями</p>
                {htmlSnippets.snippets.map((s) => (
                  <div key={s.page_url} className="border rounded-lg bg-white overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
                      <span className="text-xs font-mono text-gray-600 truncate flex-1">{s.page_url}</span>
                      <button
                        onClick={() => copySnippet(s.page_url, s.html)}
                        className={cx('text-xs px-2.5 py-1 rounded ml-2 shrink-0 transition font-medium',
                          copiedUrl === s.page_url ? 'bg-green-100 text-green-700' : 'bg-primary-50 text-primary-600 hover:bg-primary-100')}
                      >
                        {copiedUrl === s.page_url ? '✅ Скопировано' : '📋 Скопировать'}
                      </button>
                    </div>
                    <pre className="text-xs text-gray-700 p-3 overflow-x-auto bg-gray-50 font-mono leading-relaxed">{s.html}</pre>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
