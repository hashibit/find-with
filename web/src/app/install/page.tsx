import Link from 'next/link';

const CHROME_STORE_URL = process.env.NEXT_PUBLIC_CHROME_STORE_URL || 'https://chrome.google.com/webstore';

export default function InstallPage() {
  return (
    <div className="min-h-screen">
      <nav className="flex items-center justify-between px-8 py-4 border-b">
        <Link href="/" className="font-serif text-2xl font-bold text-brand-700">FindWith</Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-gray-600 hover:text-gray-900">Log in</Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto py-16 px-8 text-center">
        <h1 className="font-serif text-4xl font-bold mb-4">Install the FindWith Extension</h1>
        <p className="text-gray-600 text-lg mb-12">
          Available for Chrome and Chromium-based browsers. Takes 30 seconds.
        </p>

        <div className="flex flex-col gap-6 mb-16">
          {[
            {
              step: '1',
              title: 'Click Install below',
              desc: 'Opens the Chrome Web Store listing.',
            },
            {
              step: '2',
              title: 'Click "Add to Chrome"',
              desc: 'Chrome will ask for permissions — we only request access to job listing pages.',
            },
            {
              step: '3',
              title: 'Sign in to FindWith',
              desc: 'Click the extension icon and sign in or create a free account.',
            },
            {
              step: '4',
              title: 'Open any job description',
              desc: 'Quinn will automatically analyze the role and give you tailored guidance.',
            },
          ].map((s) => (
            <div key={s.step} className="flex items-start gap-4 text-left bg-gray-50 rounded-xl p-6 border">
              <span className="bg-brand-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold shrink-0">
                {s.step}
              </span>
              <div>
                <h3 className="font-semibold mb-1">{s.title}</h3>
                <p className="text-gray-600 text-sm">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <a
          href={CHROME_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block bg-brand-600 text-white px-10 py-4 rounded-xl text-lg font-semibold hover:bg-brand-700"
        >
          Install on Chrome
        </a>

        <p className="text-sm text-gray-400 mt-6">
          Already installed?{' '}
          <Link href="/login" className="text-brand-600 hover:underline">
            Sign in here
          </Link>
        </p>
      </main>

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
