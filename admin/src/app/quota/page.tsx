'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { apiGet, apiPost, ApiError } from '@/lib/api'
import Pagination from '@/components/Pagination'

interface QuotaEntry {
  id: string
  userId: string
  type: string
  used: number
  limit: number
  resetAt: string
}

interface ListResponse {
  data: QuotaEntry[]
  total: number
  page: number
  limit: number
}

const PAGE_SIZE = 20

export default function QuotaPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const page = Number(searchParams.get('page') || '1')
  const search = searchParams.get('search') || ''

  const [items, setItems] = useState<QuotaEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [searchInput, setSearchInput] = useState(search)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiGet<ListResponse>('/admin/ops/quota', {
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

  async function resetQuota(id: string) {
    setActionError('')
    try {
      await apiPost(`/admin/ops/quota/${id}/reset`)
      await load()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Reset failed')
    }
  }

  const hasMore = page * PAGE_SIZE < total

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Quota</h1>

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
                <th className="px-3 py-2 border-b border-gray-200 font-medium">Type</th>
                <th className="px-3 py-2 border-b border-gray-200 font-medium">Used / Limit</th>
                <th className="px-3 py-2 border-b border-gray-200 font-medium">Reset At</th>
                <th className="px-3 py-2 border-b border-gray-200 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((q, i) => (
                <tr key={q.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 border-b border-gray-100 font-mono text-xs">{q.id}</td>
                  <td className="px-3 py-2 border-b border-gray-100 font-mono text-xs">{q.userId}</td>
                  <td className="px-3 py-2 border-b border-gray-100">{q.type}</td>
                  <td className="px-3 py-2 border-b border-gray-100">
                    <span
                      className={
                        q.used >= q.limit ? 'text-red-600 font-medium' : ''
                      }
                    >
                      {q.used} / {q.limit}
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100 text-gray-500">
                    {q.resetAt ? new Date(q.resetAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100">
                    <button
                      onClick={() => resetQuota(q.id)}
                      className="text-xs px-2 py-1 border border-blue-300 text-blue-600 hover:bg-blue-50"
                    >
                      Reset
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
