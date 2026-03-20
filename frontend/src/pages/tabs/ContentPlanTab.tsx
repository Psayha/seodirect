import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

const ARTICLE_STATUSES = [
  { value: 'idea', label: 'Идея', color: 'bg-surface-raised text-muted' },
  { value: 'in_progress', label: 'В работе', color: 'bg-blue-100 text-blue-700' },
  { value: 'review', label: 'Ревью', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'published', label: 'Опубликовано', color: 'bg-green-100 text-green-700' },
  { value: 'archived', label: 'Архив', color: 'bg-surface-raised text-muted' },
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
        <label className="block text-xs text-muted mb-1">Заголовок статьи *</label>
        <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Как выбрать..." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted mb-1">Ключевое слово</label>
          <input value={form.target_keyword || ''} onChange={(e) => f('target_keyword', e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Кластер</label>
          <input value={form.cluster || ''} onChange={(e) => f('cluster', e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-muted mb-1">Статус</label>
          <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm">
            {ARTICLE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Интент</label>
          <select value={form.intent || ''} onChange={(e) => f('intent', e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm">
            <option value="">—</option>
            {INTENTS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Приоритет</label>
          <input type="number" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: Number(e.target.value) }))}
            className="w-full border rounded-xl px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted mb-1">Дедлайн</label>
          <input type="date" value={form.due_date || ''} onChange={(e) => f('due_date', e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Исполнитель</label>
          <input value={form.assigned_to || ''} onChange={(e) => f('assigned_to', e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted mb-1">URL (после публикации)</label>
          <input value={form.url || ''} onChange={(e) => f('url', e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Объём (слов)</label>
          <input type="number" value={form.word_count_target || ''} onChange={(e) => f('word_count_target', Number(e.target.value))}
            className="w-full border rounded-xl px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">Заметки</label>
        <textarea value={form.notes || ''} onChange={(e) => f('notes', e.target.value)}
          rows={2} className="w-full border rounded-xl px-3 py-2 text-sm" />
      </div>
    </div>
  )

  const statusBadge = (s: string) => {
    const st = ARTICLE_STATUSES.find((x) => x.value === s)
    return <span className={cx('px-2 py-0.5 rounded-full text-xs font-medium', st?.color || 'bg-surface-raised text-muted')}>{st?.label || s}</span>
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-primary">Контент-план блога</h2>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm(emptyArticle) }}
          className="px-3 py-1.5 bg-accent text-white text-sm rounded-xl hover:bg-accent">
          + Добавить статью
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {['all', ...ARTICLE_STATUSES.map((s) => s.value)].map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={cx('px-3 py-1 text-xs rounded-full border transition',
              filterStatus === s ? 'bg-accent text-white border-accent' : 'border-[var(--border)] text-muted hover:border-[var(--border)]')}>
            {s === 'all' ? 'Все' : ARTICLE_STATUSES.find((x) => x.value === s)?.label || s}
          </button>
        ))}
      </div>

      {/* Create/Edit modal */}
      {(showForm || editId) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold mb-4">{editId ? 'Редактировать статью' : 'Новая статья'}</h3>
            <ArticleFormFields />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => editId ? updateMutation.mutate({ id: editId, ...form }) : createMutation.mutate(form)}
                disabled={!form.title || createMutation.isPending || updateMutation.isPending}
                className="flex-1 py-2 bg-accent text-white text-sm rounded-xl hover:bg-accent disabled:opacity-50"
              >
                {createMutation.isPending || updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button onClick={() => { setShowForm(false); setEditId(null) }}
                className="flex-1 py-2 border text-sm rounded-xl hover:bg-surface-raised">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-muted text-sm">Загрузка...</p>
      ) : (
        <div className="bg-surface rounded-xl border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-raised border-b">
                <th className="px-4 py-3 text-left font-medium text-muted">Статья</th>
                <th className="px-4 py-3 text-left font-medium text-muted w-28">Статус</th>
                <th className="px-4 py-3 text-left font-medium text-muted w-32">Ключевое слово</th>
                <th className="px-4 py-3 text-left font-medium text-muted w-24">Дедлайн</th>
                <th className="px-4 py-3 text-left font-medium text-muted w-28">Исполнитель</th>
                <th className="px-4 py-3 text-right font-medium text-muted w-20">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-surface-raised">
                  <td className="px-4 py-3">
                    <p className="font-medium text-primary">{a.title}</p>
                    {a.cluster && <p className="text-xs text-muted">{a.cluster}</p>}
                  </td>
                  <td className="px-4 py-3">{statusBadge(a.status)}</td>
                  <td className="px-4 py-3 text-muted">{a.target_keyword || '—'}</td>
                  <td className="px-4 py-3 text-muted">{a.due_date || '—'}</td>
                  <td className="px-4 py-3 text-muted">{a.assigned_to || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { setEditId(a.id); setForm({ ...a }); setShowForm(false) }}
                      className="text-accent hover:text-primary-800 text-xs mr-2">Изм.</button>
                    <button onClick={() => deleteMutation.mutate(a.id)}
                      className="text-red-500 hover:text-red-700 text-xs">Удал.</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Нет статей</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
