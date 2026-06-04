'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiGet, ApiError } from '@/lib/api'

interface ServiceHealth {
  status: 'ok' | 'degraded' | 'down'
  message?: string
  latencyMs?: number
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'down'
  services: Record<string, ServiceHealth>
  timestamp: string
}

const STATUS_DOT: Record<string, string> = {
  ok: 'bg-green-500',
  degraded: 'bg-yellow-400',
  down: 'bg-red-500',
}

const STATUS_TEXT: Record<string, string> = {
  ok: 'text-green-700',
  degraded: 'text-yellow-700',
  down: 'text-red-700',
}

export default function HealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await apiGet<HealthResponse>('/admin/ops/health')
      setData(res)
      setLastRefreshed(new Date())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load health')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30_000)
    return () => clearInterval(interval)
  }, [load])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Health</h1>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-gray-400">
              Last refreshed: {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={load}
            className="text-sm px-3 py-1.5 border border-gray-300 hover:bg-gray-100"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {loading && !data ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : data ? (
        <>
          <div className="flex items-center gap-3 mb-6 p-4 border border-gray-200">
            <span className={`w-3 h-3 rounded-full ${STATUS_DOT[data.status] ?? 'bg-gray-400'}`} />
            <span className={`font-medium ${STATUS_TEXT[data.status] ?? ''}`}>
              Overall: {data.status.toUpperCase()}
            </span>
            <span className="text-xs text-gray-400 ml-auto">
              {new Date(data.timestamp).toLocaleString()}
            </span>
          </div>

          <div className="space-y-2">
            {Object.entries(data.services).map(([name, svc]) => (
              <div
                key={name}
                className="flex items-center gap-4 px-4 py-3 border border-gray-200"
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[svc.status] ?? 'bg-gray-400'}`}
                />
                <span className="w-40 font-medium text-sm">{name}</span>
                <span
                  className={`text-sm ${STATUS_TEXT[svc.status] ?? 'text-gray-600'}`}
                >
                  {svc.status}
                </span>
                {svc.latencyMs !== undefined && (
                  <span className="text-xs text-gray-400">{svc.latencyMs}ms</span>
                )}
                {svc.message && (
                  <span className="text-xs text-gray-500 ml-auto">{svc.message}</span>
                )}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
