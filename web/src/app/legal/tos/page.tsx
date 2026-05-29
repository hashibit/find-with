import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service — FindWith',
};

export default function TosPage() {
  return (
    <div className="min-h-screen">
      <nav className="flex items-center justify-between px-8 py-4 border-b">
        <Link href="/" className="font-serif text-2xl font-bold text-brand-700">
          FindWith
        </Link>
      </nav>

      <main className="max-w-3xl mx-auto py-12 px-8 prose prose-gray">
        <h1 className="font-serif text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-gray-500 text-sm mb-8">Last updated: May 2025</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">1. Acceptance</h2>
          <p className="text-gray-700 leading-relaxed">
            By using FindWith (the extension, website, or API), you agree to these Terms. If you are
            using FindWith on behalf of an organization, you represent that you have authority to
            bind that organization.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">2. Use of the service</h2>
          <p className="text-gray-700 leading-relaxed">
            FindWith is a job search tool. You may use it for personal career management. You may
            not use it to scrape job boards at scale, resell outputs, or circumvent employer
            application processes in a deceptive manner.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">3. Truthfulness</h2>
          <p className="text-gray-700 leading-relaxed">
            FindWith is designed to be truthful — resume tailoring is grounded in your actual
            experience. You are responsible for the accuracy of the source material you provide. Do
            not submit false information. We are not liable for consequences arising from
            misrepresentation in applications.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">4. Subscriptions and billing</h2>
          <p className="text-gray-700 leading-relaxed">
            Paid plans are billed monthly or annually via Stripe. You may cancel at any time; access
            continues until the end of the billing period. Refunds are issued at our discretion for
            unused time on annual plans.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">5. Intellectual property</h2>
          <p className="text-gray-700 leading-relaxed">
            FindWith and its underlying models are the property of FindWith Inc. The outputs
            generated based on your career data belong to you.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">6. Limitation of liability</h2>
          <p className="text-gray-700 leading-relaxed">
            FindWith is provided as-is. We do not guarantee job placement outcomes. Our liability is
            limited to the fees paid in the 12 months preceding any claim.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">7. Termination</h2>
          <p className="text-gray-700 leading-relaxed">
            We may suspend or terminate accounts for violation of these Terms. You may terminate
            your account at any time via Account Settings.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">8. Contact</h2>
          <p className="text-gray-700">
            Legal questions:{' '}
            <a href="mailto:legal@findwith.com" className="text-brand-600 hover:underline">
              legal@findwith.com
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
