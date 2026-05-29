import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-4 border-b">
        <span className="font-serif text-2xl font-bold text-brand-700">FindWith</span>
        <div className="flex items-center gap-4">
          <Link href="/pricing" className="text-gray-600 hover:text-gray-900">
            Pricing
          </Link>
          <Link href="/login" className="text-gray-600 hover:text-gray-900">
            Log in
          </Link>
          <Link
            href="/install"
            className="bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700"
          >
            Install Extension
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto text-center py-24 px-8">
        <h1 className="font-serif text-5xl font-bold mb-6">
          Your AI career coach.
          <br />
          Right in your browser.
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          FindWith helps you analyze job descriptions, tailor your resume with truthful precision,
          and manage your entire job search — all from a Chrome extension.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/install"
            className="bg-brand-600 text-white px-8 py-3 rounded-lg text-lg hover:bg-brand-700"
          >
            Get Started Free
          </Link>
          <Link
            href="/pricing"
            className="border border-gray-300 px-8 py-3 rounded-lg text-lg hover:bg-gray-50"
          >
            See Pricing
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto py-16 px-8 grid md:grid-cols-3 gap-8">
        {[
          {
            title: 'Deep Profile',
            desc: 'Quinn builds a career profile from your resume and conversations — not just keywords, real achievements.',
          },
          {
            title: 'Truthful Tailoring',
            desc: 'Every resume bullet traces back to your real experience. No fabrication, ever.',
          },
          {
            title: 'Full Pipeline',
            desc: 'From JD analysis to application to follow-up. Quinn manages the entire flow.',
          },
        ].map((f) => (
          <div key={f.title} className="p-6 rounded-xl border bg-gray-50">
            <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
            <p className="text-gray-600 text-sm">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm text-gray-500">
        <div className="flex justify-center gap-6 mb-4">
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal/tos">Terms</Link>
        </div>
        <p>&copy; {new Date().getFullYear()} FindWith. All rights reserved.</p>
      </footer>
    </div>
  );
}
