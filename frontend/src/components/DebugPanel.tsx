import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api/client'
import type { InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'

interface LogEntry {
  id: number
  ts: string
  method: string
  url: string
  status?: number
  duration?: number
  reqBody?: unknown
  resBody?: unknown
  error?: string
}

let logId = 0
const pendingTimers = new Map<string, number>()

export default function DebugPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [filter, setFilter] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const addLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => [...prev.slice(-200), entry])
  }, [])

  const updateLog = useCallback((id: number, patch: Partial<LogEntry>) => {
    setLogs((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }, [])

  useEffect(() => {
    const reqId = api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      const id = ++logId
      ;(config as any).__debugId = id
      ;(config as any).__debugStart = Date.now()
      const url = (config.baseURL || '') + (config.url || '')
      addLog({
        id,
        ts: new Date().toLocaleTimeString('ru-RU', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }),
        method: (config.method || 'GET').toUpperCase(),
        url,
        reqBody: config.data ? (typeof config.data === 'string' ? tryParse(config.data) : config.data) : undefined,
      })
      return config
    })

    const resId = api.interceptors.response.use(
      (res: AxiosResponse) => {
        const id = (res.config as any).__debugId
        const start = (res.config as any).__debugStart
        if (id) {
          updateLog(id, {
            status: res.status,
            duration: start ? Date.now() - start : undefined,
            resBody: res.data,
          })
        }
        return res
      },
      (err: AxiosError) => {
        const id = (err.config as any)?.__debugId
        const start = (err.config as any)?.__debugStart
        if (id) {
          updateLog(id, {
            status: err.response?.status,
            duration: start ? Date.now() - start : undefined,
            resBody: err.response?.data,
            error: err.message,
          })
        }
        return Promise.reject(err)
      }
    )

    return () => {
      api.interceptors.request.eject(reqId)
      api.interceptors.response.eject(resId)
    }
  }, [addLog, updateLog])

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, open])

  const filtered = filter
    ? logs.filter((l) => l.url.toLowerCase().includes(filter.toLowerCase()) || l.method.includes(filter.toUpperCase()))
    : logs

  const statusColor = (s?: number) => {
    if (!s) return 'text-yellow-400'
    if (s < 300) return 'text-green-400'
    if (s < 400) return 'text-blue-400'
    if (s < 500) return 'text-orange-400'
    return 'text-red-400'
  }

  const copyLog = (entry: LogEntry) => {
    const text = JSON.stringify({
      method: entry.method,
      url: entry.url,
      status: entry.status,
      duration: entry.duration,
      request: entry.reqBody,
      response: entry.resBody,
      error: entry.error,
    }, null, 2)
    navigator.clipboard.writeText(text)
  }

  const copyAll = () => {
    const text = JSON.stringify(filtered.map(e => ({
      ts: e.ts,
      method: e.method,
      url: e.url,
      status: e.status,
      duration: e.duration,
      request: e.reqBody,
      response: e.resBody,
      error: e.error,
    })), null, 2)
    navigator.clipboard.writeText(text)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-[9999] bg-gray-800 text-gray-300 border border-gray-600 rounded-lg px-3 py-2 text-xs font-mono hover:bg-gray-700 shadow-lg flex items-center gap-2"
      >
        <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        Debug ({logs.length})
      </button>
    )
  }

  return (
    <div className="fixed bottom-0 right-0 z-[9999] w-[700px] max-w-[100vw] h-[50vh] bg-gray-900 border border-gray-700 rounded-tl-lg shadow-2xl flex flex-col font-mono text-xs">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700 bg-gray-800 rounded-tl-lg shrink-0">
        <span className="text-gray-300 font-bold text-sm">API Debug</span>
        <input
          type="text"
          placeholder="Фильтр URL..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 placeholder-gray-500 text-xs"
        />
        <button onClick={copyAll} className="text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700" title="Скопировать все">
          📋
        </button>
        <button onClick={() => setLogs([])} className="text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700" title="Очистить">
          🗑
        </button>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700">
          ✕
        </button>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto p-1">
        {filtered.length === 0 && (
          <div className="text-gray-500 text-center py-8">Нет запросов. Выполните действие на странице.</div>
        )}
        {filtered.map((entry) => (
          <div key={entry.id} className="border-b border-gray-800 hover:bg-gray-800/50">
            <div
              className="flex items-center gap-2 px-2 py-1.5 cursor-pointer"
              onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
            >
              <span className="text-gray-500 w-[75px] shrink-0">{entry.ts}</span>
              <span className={`w-[50px] shrink-0 font-bold ${entry.method === 'GET' ? 'text-cyan-400' : entry.method === 'POST' ? 'text-yellow-400' : entry.method === 'PUT' || entry.method === 'PATCH' ? 'text-purple-400' : 'text-red-400'}`}>
                {entry.method}
              </span>
              <span className={`w-[35px] shrink-0 text-center font-bold ${statusColor(entry.status)}`}>
                {entry.status ?? '…'}
              </span>
              <span className="text-gray-300 truncate flex-1" title={entry.url}>
                {entry.url.replace('/api', '')}
              </span>
              {entry.duration != null && (
                <span className={`shrink-0 ${entry.duration > 3000 ? 'text-red-400' : entry.duration > 1000 ? 'text-yellow-400' : 'text-gray-500'}`}>
                  {entry.duration}ms
                </span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); copyLog(entry) }}
                className="text-gray-500 hover:text-white shrink-0"
                title="Скопировать"
              >
                📋
              </button>
            </div>
            {expanded === entry.id && (
              <div className="px-3 pb-2 space-y-1">
                {entry.reqBody && (
                  <div>
                    <span className="text-gray-500">Request:</span>
                    <pre className="text-green-300 bg-gray-950 rounded p-2 mt-0.5 overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all">
                      {formatJson(entry.reqBody)}
                    </pre>
                  </div>
                )}
                {entry.resBody !== undefined && (
                  <div>
                    <span className="text-gray-500">Response:</span>
                    <pre className={`${entry.error ? 'text-red-300' : 'text-blue-300'} bg-gray-950 rounded p-2 mt-0.5 overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap break-all`}>
                      {formatJson(entry.resBody)}
                    </pre>
                  </div>
                )}
                {entry.error && (
                  <div className="text-red-400">Error: {entry.error}</div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function tryParse(s: string) {
  try { return JSON.parse(s) } catch { return s }
}

function formatJson(v: unknown): string {
  if (typeof v === 'string') return v
  try { return JSON.stringify(v, null, 2) } catch { return String(v) }
}
