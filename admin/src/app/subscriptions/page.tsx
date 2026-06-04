'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { apiGet, apiPost, ApiError } from '@/lib/api'
import Pagination from '@/components/Pagination'

interface Subscription {
  id: string
  userId: string
  plan: string
  status: string
  stripeSubscriptionId: string
  currentPeriodEnd: string
  createdAt: string
}

interface ListResponse {
  data: Subscription[]
  total: number
  page: number
  limit: number
}

const PAGE_SIZE = 20

export default function SubscriptionsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const page = Number(searchParams.get('page') || '1')
  const search = searchParams.get('search') || ''

  const [items, setItems] = useState<Subscription[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [searchInput, setSearchInput] = useState(search)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiGet<ListResponse>('/admin/ops/subscriptions', {
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
      })
      setItems(res.data)
      setTotal(res.total)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => {
    load()
  }, [load])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    params.set('page', '1')
    if (searchInput) params.set('search', searchInput)
    router.push(`${pathname}?${params.toString()}`)
  }

  async function forceDormant(id: string) {
    setActionError('')
    try {
      await apiPost(`/admin/ops/subscriptions/${id}/force-dormant`)
      await load()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Action failed')
    }
  }

  const hasMore = page * PAGE_SIZE < total

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Subscriptions</h1>

      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by user ID"
          className="border border-gray-300 px-3 py-1.5 text-sm w-72 focus:outline-none focus:border-gray-500"
        />
        <button
          type="submit"
          className="px-3 py-1.5 text-sm bg-gray-900 text-white hover:bg-gray-700"
        >
          Search
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm px-3 py-2 mb-4">
          {error}
        </div>
      )}
      {actionError && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm px-3 py-2 mb-4">
          {actionError}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <>
          <div className="text-sm text-gray-500 mb-2">{total} total</div>
          <table className="w-full text-sm border border-gray-200">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-3 py-2 border-b border-gray-200 font-medium">ID</th>
                <th className="px-3 py-2 border-b border-gray-200 font-medium">User ID</th>
                <th className="px-3 py-2 border-b border-gray-200 font-medium">Plan</th>
                <th className="px-3 py-2 border-b border-gray-200 font-medium">Status</th>
                <th className="px-3 py-2 border-b border-gray-200 font-medium">Period End</th>
                <th className="px-3 py-2 border-b border-gray-200 font-medium">Stripe ID</th>
                <th className="px-3 py-2 border-b border-gray-200 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s, i) => (
                <tr key={s.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 border-b border-gray-100 font-mono text-xs">{s.id}</td>
                  <td className="px-3 py-2 border-b border-gray-100 font-mono text-xs">{s.userId}</td>
                  <td className="px-3 py-2 border-b border-gray-100">{s.plan}</td>
                  <td className="px-3 py-2 border-b border-gray-100">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100 text-gray-500">
                    {s.currentPeriodEnd
                      ? new Date(s.currentPeriodEnd).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100 font-mono text-xs text-gray-500">
                    {s.stripeSubscriptionId || '—'}
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100">
                    <button
                      onClick={() => forceDormant(s.id)}
                      className="text-xs px-2 py-1 border border-orange-300 text-orange-600 hover:bg-orange-50"
                    >
                      Force Dormant
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} hasMore={hasMore} />
        </>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'active'
      ? 'bg-green-100 text-green-700'
      : status === 'dormant'
        ? 'bg-yellow-100 text-yellow-700'
        : status === 'cancelled'
          ? 'bg-red-100 text-red-700'
          : 'bg-gray-100 text-gray-600'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
      {status}
    </span>
  )
}
