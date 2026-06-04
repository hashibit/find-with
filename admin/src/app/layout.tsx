import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'FindWith Admin',
}

const NAV_LINKS = [
  { href: '/users', label: 'Users' },
  { href: '/subscriptions', label: 'Subscriptions' },
  { href: '/quota', label: 'Quota' },
  { href: '/purge-sagas', label: 'Purge Sagas' },
  { href: '/outbox', label: 'Outbox' },
  { href: '/webhooks', label: 'Webhooks' },
  { href: '/audit-logs', label: 'Audit Logs' },
  { href: '/health', label: 'Health' },
  { href: '/metrics', label: 'Metrics' },
]

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen bg-white text-gray-900">
        <aside className="w-52 shrink-0 bg-gray-900 text-gray-100 flex flex-col">
          <div className="px-4 py-5 text-sm font-bold tracking-widest uppercase text-gray-400 border-b border-gray-700">
            FindWith Admin
          </div>
          <nav className="flex-1 py-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="flex-1 p-8 overflow-auto">{children}</main>
      </body>
    </html>
  )
}
