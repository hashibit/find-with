'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { apiGet, ApiError } from '@/lib/api'
import Pagination from '@/components/Pagination'

interface AuditLog {
  id: string
  actorId: string
  action: string
  resourceType: string
  resourceId: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

interface ListResponse {
  data: AuditLog[]
  total: number
  page: number
  limit: number
}

const PAGE_SIZE = 20

export default function AuditLogsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const page = Number(searchParams.get('page') || '1')
  const search = searchParams.get('search') || ''

  const [items, setItems] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchInput, setSearchInput] = useState(search)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiGet<ListResponse>('/admin/ops/audit-logs', {
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

  const hasMore = page * PAGE_SIZE < total

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Audit Logs</h1>

      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by action or resource type"
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

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <>
          <div className="text-sm text-gray-500 mb-2">{total} total</div>
          <table className="w-full text-sm border border-gray-200">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-3 py-2 border-b border-gray-200 font-medium">ID</th>
                <th className="px-3 py-2 border-b border-gray-200 font-medium">Actor ID</th>
                <th className="px-3 py-2 border-b border-gray-200 font-medium">Action</th>
                <th className="px-3 py-2 border-b border-gray-200 font-medium">Resource</th>
                <th className="px-3 py-2 border-b border-gray-200 font-medium">Resource ID</th>
                <th className="px-3 py-2 border-b border-gray-200 font-medium">Metadata</th>
                <th className="px-3 py-2 border-b border-gray-200 font-medium">At</th>
              </tr>
            </thead>
            <tbody>
              {items.map((log, i) => (
                <tr key={log.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 border-b border-gray-100 font-mono text-xs">{log.id}</td>
                  <td className="px-3 py-2 border-b border-gray-100 font-mono text-xs">{log.actorId}</td>
                  <td className="px-3 py-2 border-b border-gray-100 font-mono text-xs">{log.action}</td>
                  <td className="px-3 py-2 border-b border-gray-100">{log.resourceType}</td>
                  <td className="px-3 py-2 border-b border-gray-100 font-mono text-xs">{log.resourceId}</td>
                  <td className="px-3 py-2 border-b border-gray-100 text-xs text-gray-500 max-w-xs truncate">
                    {log.metadata ? JSON.stringify(log.metadata) : '—'}
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100 text-gray-500">
                    {new Date(log.createdAt).toLocaleString()}
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
