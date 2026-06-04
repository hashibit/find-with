'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { apiGet, apiPost, ApiError } from '@/lib/api'
import Pagination from '@/components/Pagination'

interface User {
  id: string
  email: string
  clerkId: string
  status: string
  createdAt: string
}

interface ListResponse {
  data: User[]
  total: number
  page: number
  limit: number
}

const PAGE_SIZE = 20

export default function UsersPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const page = Number(searchParams.get('page') || '1')
  const search = searchParams.get('search') || ''

  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [searchInput, setSearchInput] = useState(search)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiGet<ListResponse>('/admin/ops/users', {
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
      })
      setUsers(res.data)
      setTotal(res.total)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load users')
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

  async function toggleStatus(user: User) {
    setActionError('')
    const action = user.status === 'active' ? 'disable' : 'enable'
    try {
      await apiPost(`/admin/ops/users/${user.id}/${action}`)
      await load()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : `Failed to ${action} user`,
      )
    }
  }

  const hasMore = page * PAGE_SIZE < total

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Users</h1>

      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by email or ID"
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
                <th className="px-3 py-2 border-b border-gray-200 font-medium">Email</th>
                <th className="px-3 py-2 border-b border-gray-200 font-medium">Clerk ID</th>
                <th className="px-3 py-2 border-b border-gray-200 font-medium">Status</th>
                <th className="px-3 py-2 border-b border-gray-200 font-medium">Created</th>
                <th className="px-3 py-2 border-b border-gray-200 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 border-b border-gray-100 font-mono text-xs">{u.id}</td>
                  <td className="px-3 py-2 border-b border-gray-100">{u.email}</td>
                  <td className="px-3 py-2 border-b border-gray-100 font-mono text-xs">{u.clerkId}</td>
                  <td className="px-3 py-2 border-b border-gray-100">
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100 text-gray-500">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100">
                    <button
                      onClick={() => toggleStatus(u)}
                      className={`text-xs px-2 py-1 border ${
                        u.status === 'active'
                          ? 'border-red-300 text-red-600 hover:bg-red-50'
                          : 'border-green-300 text-green-600 hover:bg-green-50'
                      }`}
                    >
                      {u.status === 'active' ? 'Disable' : 'Enable'}
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
      : status === 'disabled'
        ? 'bg-red-100 text-red-700'
        : 'bg-gray-100 text-gray-600'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
      {status}
    </span>
  )
}
