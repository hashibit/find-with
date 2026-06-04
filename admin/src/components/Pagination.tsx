'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'

interface Props {
  page: number
  hasMore: boolean
}

export default function Pagination({ page, hasMore }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function go(newPage: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(newPage))
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-3 mt-4 text-sm">
      <button
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1 border border-gray-300 disabled:opacity-40 hover:bg-gray-100"
      >
        Prev
      </button>
      <span className="text-gray-600">Page {page}</span>
      <button
        onClick={() => go(page + 1)}
        disabled={!hasMore}
        className="px-3 py-1 border border-gray-300 disabled:opacity-40 hover:bg-gray-100"
      >
        Next
      </button>
    </div>
  )
}
