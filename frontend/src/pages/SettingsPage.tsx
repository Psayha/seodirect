import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'

type Tab = 'api-keys' | 'crawler' | 'ai'

function ApiKeysTab() {
  const { data: services = [], isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.get('/settings/api-keys').then((r) => r.data),
  })
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({})
  const qc = useQueryClient()

  const saveMutation = useMutation({
    mutationFn: ({ service, values }: { service: string; values: Record<string, string> }) =>
      api.put(`/settings/api-keys/${service}`, { values }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  })

  const testMutation = useMutation({
    mutationFn: (service: string) => api.post(`/settings/api-keys/${service}/test`).then((r) => r.data),
    onSuccess: (data, service) => setTestResults((r) => ({ ...r, [service]: data })),
  })

  if (isLoading) return <div className="p-4 text-gray-500">Загрузка...</div>

  return (
    <div className="space-y-4">
      {services.map((svc: any) => (
        <div key={svc.service} className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium">{svc.label}</h4>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const vals: Record<string, string> = {}
                  svc.keys.forEach((k: any) => { if (editing[`${svc.service}.${k.key}`]) vals[k.key] = editing[`${svc.service}.${k.key}`] })
                  if (Object.keys(vals).length) saveMutation.mutate({ service: svc.service, values: vals })
                }}
                className="text-sm bg-primary-600 text-white px-3 py-1 rounded-lg hover:bg-primary-700 transition"
              >
                Сохранить
              </button>
              <button
                onClick={() => testMutation.mutate(svc.service)}
                disabled={testMutation.isPending}
                className="text-sm border border-gray-300 px-3 py-1 rounded-lg hover:bg-gray-50 transition"
              >
                Проверить
              </button>
            </div>
          </div>
          {svc.keys.map((k: any) => (
            <div key={k.key} className="mb-2">
              <label className="block text-xs text-gray-500 mb-1">{k.key}</label>
              <input
                type="password"
                className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder={k.masked || 'Не задан'}
                value={editing[`${svc.service}.${k.key}`] || ''}
                onChange={(e) => setEditing((ed) => ({ ...ed, [`${svc.service}.${k.key}`]: e.target.value }))}
              />
            </div>
          ))}
          {testResults[svc.service] && (
            <p className={`text-sm mt-2 ${testResults[svc.service].ok ? 'text-green-600' : 'text-red-500'}`}>
              {testResults[svc.service].ok ? '✅' : '❌'} {testResults[svc.service].message}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('api-keys')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'api-keys', label: 'API ключи' },
    { key: 'crawler', label: 'Парсер' },
    { key: 'ai', label: 'ИИ параметры' },
  ]

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Настройки</h2>
      <div className="flex gap-1 mb-6 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
              tab === t.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="max-w-xl">
        {tab === 'api-keys' && <ApiKeysTab />}
        {tab === 'crawler' && <div className="text-gray-500 text-sm">Настройки парсера — в разработке</div>}
        {tab === 'ai' && <div className="text-gray-500 text-sm">Настройки ИИ — в разработке</div>}
      </div>
    </div>
  )
}
