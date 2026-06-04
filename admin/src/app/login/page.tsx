'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiGet, setAdminSecret, ApiError } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [secret, setSecret] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await apiGet('/admin/ops/health', undefined, secret)
      setAdminSecret(secret)
      router.push('/users')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Invalid secret.')
      } else {
        setError('Could not reach server. Check the API URL.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 border border-gray-200 w-80">
        <h1 className="text-lg font-semibold mb-6">Admin Login</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Admin Secret
            </label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-500"
              placeholder="Enter admin secret"
              required
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 text-sm px-3 py-2">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white text-sm py-2 hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? 'Checking...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
