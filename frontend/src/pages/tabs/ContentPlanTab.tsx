import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

const ARTICLE_STATUSES = [
  { value: 'idea', label: 'Идея', color: 'bg-gray-100 text-gray-600' },
  { value: 'in_progress', label: 'В работе', color: 'bg-blue-100 text-blue-700' },
  { value: 'review', label: 'Ревью', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'published', label: 'Опубликовано', color: 'bg-green-100 text-green-700' },
  { value: 'archived', label: 'Архив', color: 'bg-gray-100 text-gray-400' },
]
const INTENTS = [
  { value: 'informational', label: 'Информационный' },
  { value: 'commercial', label: 'Коммерческий' },
  { value: 'transactional', label: 'Транзакционный' },
  { value: 'navigational', label: 'Навигационный' },
]

interface Article {
  id: string
  title: string
  target_keyword: string | null
  cluster: string | null
  intent: string | null
  status: string
  priority: number
  due_date: string | null
  assigned_to: string | null
  notes: string | null
  url: string | null
  word_count_target: number | null
}

type ArticleForm = Omit<Article, 'id'>

const emptyArticle: ArticleForm = {
  title: '',
  target_keyword: null,
  cluster: null,
  intent: null,
  status: 'idea',
  priority: 0,
  due_date: null,
  assigned_to: null,
  notes: null,
  url: null,
  word_count_target: null,
}

export default function ContentPlanTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<ArticleForm>(emptyArticle)
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['content-plan', projectId],
    queryFn: () => api.get(`/projects/${projectId}/content-plan`).then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (body: ArticleForm) => api.post(`/projects/${projectId}/content-plan`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['content-plan', projectId] }); setShowForm(false); setForm(emptyArticle) },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: ArticleForm & { id: string }) =>
      api.patch(`/projects/${projectId}/content-plan/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['content-plan', projectId] }); setEditId(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${projectId}/content-plan/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-plan', projectId] }),
  })

  const articles: Article[] = data?.articles || []
  const filtered = filterStatus === 'all' ? articles : articles.filter((a) => a.status === filterStatus)

  const f = (key: keyof ArticleForm, val: any) => setForm((p) => ({ ...p, [key]: val || null }))

  const ArticleFormFields = () => (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Заголовок статьи *</label>
        <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Как выбрать..." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Ключевое слово</label>
          <input value={form.target_keyword || ''} onChange={(e) => f('target_keyword', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Кластер</label>
          <input value={form.cluster || ''} onChange={(e) => f('cluster', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Статус</label>
          <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm">
            {ARTICLE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Интент</label>
          <select value={form.intent || ''} onChange={(e) => f('intent', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">—</option>
            {INTENTS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Приоритет</label>
          <input type="number" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: Number(e.target.value) }))}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Дедлайн</label>
          <input type="date" value={form.due_date || ''} onChange={(e) => f('due_date', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Исполнитель</label>
          <input value={form.assigned_to || ''} onChange={(e) => f('assigned_to', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">URL (после публикации)</label>
          <input value={form.url || ''} onChange={(e) => f('url', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Объём (слов)</label>
          <input type="number" value={form.word_count_target || ''} onChange={(e) => f('word_count_target', Number(e.target.value))}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Заметки</label>
        <textarea value={form.notes || ''} onChange={(e) => f('notes', e.target.value)}
          rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" />
      </div>
    </div>
  )

  const statusBadge = (s: string) => {
    const st = ARTICLE_STATUSES.find((x) => x.value === s)
    return <span className={cx('px-2 py-0.5 rounded-full text-xs font-medium', st?.color || 'bg-gray-100 text-gray-600')}>{st?.label || s}</span>
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Контент-план блога</h2>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm(emptyArticle) }}
          className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700">
          + Добавить статью
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {['all', ...ARTICLE_STATUSES.map((s) => s.value)].map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={cx('px-3 py-1 text-xs rounded-full border transition',
              filterStatus === s ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-300 text-gray-600 hover:border-gray-400')}>
            {s === 'all' ? 'Все' : ARTICLE_STATUSES.find((x) => x.value === s)?.label || s}
          </button>
        ))}
      </div>

      {/* Create/Edit modal */}
      {(showForm || editId) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold mb-4">{editId ? 'Редактировать статью' : 'Новая статья'}</h3>
            <ArticleFormFields />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => editId ? updateMutation.mutate({ id: editId, ...form }) : createMutation.mutate(form)}
                disabled={!form.title || createMutation.isPending || updateMutation.isPending}
                className="flex-1 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {createMutation.isPending || updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button onClick={() => { setShowForm(false); setEditId(null) }}
                className="flex-1 py-2 border text-sm rounded-lg hover:bg-gray-50">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-gray-400 text-sm">Загрузка...</p>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left font-medium text-gray-600">Статья</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-28">Статус</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-32">Ключевое слово</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-24">Дедлайн</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-28">Исполнитель</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 w-20">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{a.title}</p>
                    {a.cluster && <p className="text-xs text-gray-400">{a.cluster}</p>}
                  </td>
                  <td className="px-4 py-3">{statusBadge(a.status)}</td>
                  <td className="px-4 py-3 text-gray-600">{a.target_keyword || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{a.due_date || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{a.assigned_to || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { setEditId(a.id); setForm({ ...a }); setShowForm(false) }}
                      className="text-primary-600 hover:text-primary-800 text-xs mr-2">Изм.</button>
                    <button onClick={() => deleteMutation.mutate(a.id)}
                      className="text-red-500 hover:text-red-700 text-xs">Удал.</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Нет статей</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
