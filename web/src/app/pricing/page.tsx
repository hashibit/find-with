import Link from 'next/link';

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Get started with essential job search tools.',
    features: [
      '5 JD analyses per month',
      'Basic resume tailoring',
      'Job pipeline tracking (up to 10 jobs)',
      'Email support',
    ],
    cta: 'Get Started',
    href: '/install',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$19',
    period: 'per month',
    description: 'For active job seekers who need full power.',
    features: [
      'Unlimited JD analyses',
      'Unlimited resume tailoring',
      'Full job pipeline (unlimited)',
      'Interview prep with Quinn',
      'Cover letter generation',
      'Priority support',
    ],
    cta: 'Upgrade to Pro',
    href: '/billing/upgrade?plan=pro',
    highlighted: true,
  },
  {
    name: 'Pro Plus',
    price: '$39',
    period: 'per month',
    description: 'For power users and career changers.',
    features: [
      'Everything in Pro',
      'LinkedIn message drafts',
      'Recruiter outreach templates',
      'Salary negotiation guidance',
      'Multi-resume management',
      'Dedicated onboarding call',
    ],
    cta: 'Upgrade to Pro Plus',
    href: '/billing/upgrade?plan=pro_plus',
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <nav className="flex items-center justify-between px-8 py-4 border-b">
        <Link href="/" className="font-serif text-2xl font-bold text-brand-700">FindWith</Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-gray-600 hover:text-gray-900">Log in</Link>
          <Link href="/install" className="bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700">
            Install Extension
          </Link>
        </div>
      </nav>

      <section className="max-w-5xl mx-auto py-16 px-8">
        <h1 className="font-serif text-4xl font-bold text-center mb-4">Simple, honest pricing</h1>
        <p className="text-center text-gray-600 mb-12">No usage surprises. Cancel anytime.</p>

        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl border p-8 flex flex-col ${
                plan.highlighted
                  ? 'border-brand-500 shadow-lg ring-2 ring-brand-500'
                  : 'border-gray-200'
              }`}
            >
              {plan.highlighted && (
                <span className="text-xs font-semibold text-brand-600 uppercase tracking-wide mb-2">
                  Most Popular
                </span>
              )}
              <h2 className="text-2xl font-bold mb-1">{plan.name}</h2>
              <div className="mb-2">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-gray-500 ml-1">/{plan.period}</span>
              </div>
              <p className="text-gray-600 text-sm mb-6">{plan.description}</p>
              <ul className="space-y-2 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <span className="text-brand-600 mt-0.5">&#10003;</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`block text-center py-3 px-6 rounded-lg font-semibold transition-colors ${
                  plan.highlighted
                    ? 'bg-brand-600 text-white hover:bg-brand-700'
                    : 'border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-16 overflow-x-auto">
          <h2 className="font-serif text-2xl font-bold text-center mb-8">Full feature comparison</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 pr-4 font-semibold w-1/2">Feature</th>
                <th className="py-3 px-4 font-semibold">Free</th>
                <th className="py-3 px-4 font-semibold text-brand-600">Pro</th>
                <th className="py-3 px-4 font-semibold">Pro Plus</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['JD analyses', '5/mo', 'Unlimited', 'Unlimited'],
                ['Resume tailoring', '5/mo', 'Unlimited', 'Unlimited'],
                ['Job pipeline', '10 jobs', 'Unlimited', 'Unlimited'],
                ['Interview prep', '—', '✓', '✓'],
                ['Cover letters', '—', '✓', '✓'],
                ['LinkedIn outreach', '—', '—', '✓'],
                ['Multi-resume', '—', '—', '✓'],
                ['Salary negotiation', '—', '—', '✓'],
                ['Support', 'Email', 'Priority', 'Dedicated'],
              ].map(([feature, free, pro, proPlus]) => (
                <tr key={feature} className="border-b last:border-0">
                  <td className="py-3 pr-4 text-gray-700">{feature}</td>
                  <td className="py-3 px-4 text-center text-gray-500">{free}</td>
                  <td className="py-3 px-4 text-center text-brand-600 font-medium">{pro}</td>
                  <td className="py-3 px-4 text-center text-gray-700">{proPlus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
