import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'

export default function ExportTab({ projectId }: { projectId: string }) {
  const { data: validation } = useQuery({
    queryKey: ['export-validate', projectId],
    queryFn: () => api.get(`/projects/${projectId}/export/validate`).then((r) => r.data),
  })
  return (
    <div className="p-6 max-w-3xl">
      <h3 className="font-semibold mb-4">Экспорт</h3>
      {validation && (
        <div className="bg-surface-raised rounded-xl p-4 mb-4 text-sm space-y-1.5">
          {[
            ['Кампаний', validation.campaigns_count],
            ['Групп', validation.groups_count],
            ['Объявлений', validation.ads_count],
            ['Ключевых фраз', validation.keywords_count],
            ['Минус-слов', validation.negative_keywords_count],
          ].map(([label, val]) => (
            <p key={label as string}><span className="text-muted">{label}:</span> <strong>{val}</strong></p>
          ))}
          {(validation.warnings || []).map((w: string, i: number) => (
            <p key={i} className="text-yellow-600 text-xs">⚠️ {w}</p>
          ))}
        </div>
      )}

      <p className="text-xs text-muted uppercase tracking-wide font-medium mb-2">Яндекс Директ</p>
      <div className="space-y-2 mb-5">
        <button onClick={() => window.open(`/api/projects/${projectId}/export/direct-xls`, '_blank')}
          className="w-full bg-green-600 text-white py-2.5 rounded-xl text-sm hover:bg-green-700 transition font-medium">
          📥 XLS для Директ Коммандера
        </button>
      </div>

      <p className="text-xs text-muted uppercase tracking-wide font-medium mb-2">Стратегия</p>
      <div className="space-y-2 mb-5">
        <button onClick={() => window.open(`/api/projects/${projectId}/export/strategy-html`, '_blank')}
          className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm hover:bg-blue-700 transition font-medium">
          🖨 Стратегия HTML (для печати / PDF)
        </button>
        <button onClick={() => window.open(`/api/projects/${projectId}/export/strategy-md`, '_blank')}
          className="w-full btn-ghost py-2.5 font-medium">
          📄 Стратегия Markdown
        </button>
      </div>

      <p className="text-xs text-muted uppercase tracking-wide font-medium mb-2">Копирайтеру</p>
      <div className="space-y-2">
        <button onClick={() => window.open(`/api/projects/${projectId}/export/copywriter-brief`, '_blank')}
          className="w-full bg-purple-600 text-white py-2.5 rounded-xl text-sm hover:bg-purple-700 transition font-medium">
          📝 ТЗ копирайтеру (DOCX)
        </button>
      </div>
    </div>
  )
}
