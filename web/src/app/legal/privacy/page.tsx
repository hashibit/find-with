import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — FindWith',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <nav className="flex items-center justify-between px-8 py-4 border-b">
        <Link href="/" className="font-serif text-2xl font-bold text-brand-700">FindWith</Link>
      </nav>

      <main className="max-w-3xl mx-auto py-12 px-8 prose prose-gray">
        <h1 className="font-serif text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-gray-500 text-sm mb-8">Last updated: May 2025</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">1. What we collect</h2>
          <p className="text-gray-700 leading-relaxed">
            FindWith collects information you provide directly (resume content, career history,
            job preferences), data from your use of the extension (job descriptions you analyze,
            actions in the job pipeline), and standard usage metadata (session tokens, timestamps).
            We do not collect browsing history outside of job listing pages you interact with.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">2. How we use it</h2>
          <p className="text-gray-700 leading-relaxed">
            Your data powers the AI features — resume tailoring, JD analysis, interview prep —
            personalized to your career profile. We do not sell your data to third parties or use
            it to train general-purpose AI models.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">3. Data storage and security</h2>
          <p className="text-gray-700 leading-relaxed">
            Data is stored in encrypted form at rest and in transit. Authentication is handled by
            Clerk. Payments are processed by Stripe. We do not store raw payment card information.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">4. Your rights (GDPR / CCPA)</h2>
          <p className="text-gray-700 leading-relaxed">
            You have the right to access, correct, export, or delete your data at any time.
            Visit{' '}
            <Link href="/dashboard/data" className="text-brand-600 hover:underline">
              Dashboard &rarr; Data
            </Link>{' '}
            to export or request deletion. For requests, contact privacy@findwith.com.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">5. Cookies</h2>
          <p className="text-gray-700 leading-relaxed">
            We use session cookies for authentication and no third-party tracking cookies.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">6. Contact</h2>
          <p className="text-gray-700">
            Questions? Email us at{' '}
            <a href="mailto:privacy@findwith.com" className="text-brand-600 hover:underline">
              privacy@findwith.com
            </a>
          </p>
        </section>
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
