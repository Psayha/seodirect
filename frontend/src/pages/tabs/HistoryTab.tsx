import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'

function cx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

const EVENT_LABELS: Record<string, string> = {
  project_created: '🆕 Проект создан',
  project_updated: '✏️ Проект обновлён',
  brief_updated: '📝 Бриф обновлён',
  crawl_started: '🕷️ Парсинг запущен',
  crawl_completed: '✅ Парсинг завершён',
  strategy_generated: '🤖 Стратегия сгенерирована',
  strategy_updated: '✏️ Стратегия обновлена',
  campaign_created: '📁 Кампания создана',
  campaign_updated: '✏️ Кампания обновлена',
  campaign_deleted: '🗑 Кампания удалена',
  group_created: '📂 Группа создана',
  keywords_generated: '🔑 Ключи сгенерированы',
  ads_generated: '📣 Объявления сгенерированы',
  negative_kw_generated: '❌ Минус-слова сгенерированы',
  seo_meta_generated: '🔍 Мета-теги сгенерированы',
  export_downloaded: '📥 Экспорт скачан',
  mediaplan_updated: '📊 Медиаплан обновлён',
}

export default function HistoryTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['history', projectId],
    queryFn: () => api.get(`/projects/${projectId}/history`).then((r) => r.data),
    refetchInterval: 30000,
  })

  if (isLoading) return <div className="p-6 text-gray-500">Загрузка...</div>

  const events: any[] = data?.events ?? []

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">История действий</h3>
        <span className="text-sm text-gray-500">{data?.total ?? 0} событий</span>
      </div>
      {events.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p>История пока пуста. Действия появятся здесь по мере работы с проектом.</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />
          <div className="space-y-1">
            {events.map((e: any, i: number) => (
              <div key={e.id} className="flex gap-4 relative pl-10">
                <div className="absolute left-2.5 top-2 w-3 h-3 rounded-full bg-white border-2 border-primary-400" />
                <div className="flex-1 bg-white border rounded-lg px-3 py-2 text-sm hover:border-gray-300 transition">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{EVENT_LABELS[e.event_type] || e.event_type}</span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {new Date(e.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-gray-500 text-xs mt-0.5">{e.description}</p>
                  {e.user_login && <p className="text-xs text-gray-400 mt-0.5">👤 {e.user_login}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
