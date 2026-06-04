'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiGet, ApiError } from '@/lib/api'

interface MetricsOverview {
  users: {
    total: number
    active: number
    disabled: number
    newLast7Days: number
    newLast30Days: number
  }
  subscriptions: {
    totalActive: number
    totalDormant: number
    totalCancelled: number
    proCount: number
    proPlusCount: number
  }
  quota: {
    totalUsageToday: number
    avgUsagePerUser: number
  }
  outbox: {
    pending: number
    failed: number
    processedLast24h: number
  }
  webhooks: {
    receivedLast24h: number
    failedLast24h: number
  }
}

export default function MetricsPage() {
  const [data, setData] = useState<MetricsOverview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await apiGet<MetricsOverview>('/admin/ops/metrics/overview')
      setData(res)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load metrics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Metrics</h1>
        <button
          onClick={load}
          className="text-sm px-3 py-1.5 border border-gray-300 hover:bg-gray-100"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : data ? (
        <div className="space-y-8">
          <Section title="Users">
            <StatCard label="Total" value={data.users.total} />
            <StatCard label="Active" value={data.users.active} />
            <StatCard label="Disabled" value={data.users.disabled} />
            <StatCard label="New (7d)" value={data.users.newLast7Days} />
            <StatCard label="New (30d)" value={data.users.newLast30Days} />
          </Section>

          <Section title="Subscriptions">
            <StatCard label="Active" value={data.subscriptions.totalActive} />
            <StatCard label="Dormant" value={data.subscriptions.totalDormant} />
            <StatCard label="Cancelled" value={data.subscriptions.totalCancelled} />
            <StatCard label="Pro" value={data.subscriptions.proCount} />
            <StatCard label="Pro Plus" value={data.subscriptions.proPlusCount} />
          </Section>

          <Section title="Quota">
            <StatCard label="Usage Today" value={data.quota.totalUsageToday} />
            <StatCard
              label="Avg / User"
              value={data.quota.avgUsagePerUser.toFixed(1)}
            />
          </Section>

          <Section title="Outbox">
            <StatCard label="Pending" value={data.outbox.pending} highlight={data.outbox.pending > 0} />
            <StatCard label="Failed" value={data.outbox.failed} highlight={data.outbox.failed > 0} />
            <StatCard label="Processed (24h)" value={data.outbox.processedLast24h} />
          </Section>

          <Section title="Webhooks">
            <StatCard label="Received (24h)" value={data.webhooks.receivedLast24h} />
            <StatCard label="Failed (24h)" value={data.webhooks.failedLast24h} highlight={data.webhooks.failedLast24h > 0} />
          </Section>
        </div>
      ) : null}
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        {title}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {children}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: number | string
  highlight?: boolean
}) {
  return (
    <div
      className={`border p-4 ${highlight ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}
    >
      <div className={`text-2xl font-semibold ${highlight ? 'text-red-700' : 'text-gray-900'}`}>
        {value}
      </div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  )
}
