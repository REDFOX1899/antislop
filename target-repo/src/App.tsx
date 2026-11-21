import { useState, type FormEvent } from 'react';
import {
  ArrowRight,
  BarChart3,
  Check,
  Cpu,
  Layers,
  Menu,
  Play,
  ShieldCheck,
  Sparkles,
  Star,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import { SITE_CONTENT, type FeatureItem } from './data/content';

function FeatureIcon({ icon }: { icon: FeatureItem['icon'] }) {
  const iconProps = { className: 'h-6 w-6 text-purple-300' };
  switch (icon) {
    case 'sparkles':
      return <Sparkles {...iconProps} />;
    case 'cpu':
      return <Cpu {...iconProps} />;
    case 'layers':
      return <Layers {...iconProps} />;
    case 'shield':
      return <ShieldCheck {...iconProps} />;
    case 'workflow':
      return <Workflow {...iconProps} />;
    case 'chart':
      return <BarChart3 {...iconProps} />;
  }
}

export default function App() {
  const [annualBilling, setAnnualBilling] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [ctaSubmitted, setCtaSubmitted] = useState(false);
  const [demoModalNotice, setDemoModalNotice] = useState(false);

  const handleWaitlistSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setCtaSubmitted(true);
    setEmail('');
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-purple-950 text-slate-100 selection:bg-purple-500/40 selection:text-white">
      {/* Classic AI Slop glowing purple radial blobs + faint grid */}
      <div className="as-slop-grid pointer-events-none fixed inset-0 opacity-60" aria-hidden="true" />
      <div
        className="as-glow-orb fixed -top-40 left-1/4 h-[520px] w-[520px] rounded-full bg-purple-600/25 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="as-glow-orb fixed top-1/3 -right-32 h-[480px] w-[480px] rounded-full bg-indigo-500/20 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="as-glow-orb fixed bottom-0 left-1/3 h-[420px] w-[420px] rounded-full bg-fuchsia-600/20 blur-3xl"
        aria-hidden="true"
      />

      {/* Sticky Glassmorphic Header */}
      <header
        data-section="header"
        className="sticky top-0 z-40 border-b border-purple-500/20 bg-slate-950/75 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <a href="#hero" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 via-indigo-500 to-fuchsia-500 shadow-[0_0_24px_rgba(168,85,247,0.55)]">
              <Zap className="h-5 w-5 text-white" />
            </span>
            <span className="bg-gradient-to-r from-white via-purple-200 to-indigo-300 bg-clip-text text-xl font-extrabold tracking-tight text-transparent">
              {SITE_CONTENT.brand.name}
            </span>
          </a>

          <nav className="hidden items-center gap-8 md:flex" aria-label="Primary Navigation">
            {SITE_CONTENT.nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-slate-300 transition-colors hover:text-purple-300"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <a
              href="#cta"
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white"
            >
              Sign In
            </a>
            <a
              href="#pricing"
              className="as-btn-motion inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_25px_rgba(168,85,247,0.45)] hover:shadow-[0_0_35px_rgba(192,132,252,0.65)]"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="inline-flex items-center justify-center rounded-xl border border-purple-500/30 bg-white/5 p-2 text-slate-200 md:hidden"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-purple-500/20 bg-slate-950/95 px-6 py-4 md:hidden">
            <div className="flex flex-col gap-3">
              {SITE_CONTENT.nav.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:bg-purple-500/15"
                >
                  {item.label}
                </a>
              ))}
              <a
                href="#pricing"
                onClick={() => setMobileMenuOpen(false)}
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white"
              >
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        )}
      </header>

      <main className="relative z-10">
        {/* Hero Section */}
        <section id="hero" data-section="hero" className="mx-auto max-w-7xl px-6 pt-20 pb-20 lg:pt-28">
          <div className="mx-auto max-w-4xl text-center">
            <div className="as-fade-up mb-8 inline-flex items-center gap-2 rounded-full border border-purple-400/35 bg-purple-500/15 px-4 py-1.5 text-xs font-semibold tracking-wide text-purple-200 shadow-[0_0_24px_rgba(168,85,247,0.28)] backdrop-blur-md sm:text-sm">
              <span className="h-2 w-2 rounded-full bg-fuchsia-400 shadow-[0_0_10px_#e879f9]" />
              {SITE_CONTENT.hero.badge}
            </div>

            <h1 className="as-fade-up-delay-1 text-4xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl lg:leading-[1.08]">
              {SITE_CONTENT.hero.headlineLeading}{' '}
              <span className="bg-gradient-to-r from-purple-400 via-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
                {SITE_CONTENT.hero.headlineAccent}
              </span>
            </h1>

            <p className="as-fade-up-delay-2 mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-xl">
              {SITE_CONTENT.hero.subheadline}
            </p>

            <div className="as-fade-up-delay-2 mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href="#pricing"
                className="as-btn-motion inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-fuchsia-600 px-8 py-4 text-base font-semibold text-white shadow-[0_0_32px_rgba(168,85,247,0.5)] hover:shadow-[0_0_45px_rgba(192,132,252,0.75)] sm:w-auto"
              >
                {SITE_CONTENT.hero.primaryCta}
                <ArrowRight className="h-5 w-5" />
              </a>
              <button
                type="button"
                onClick={() => setDemoModalNotice((prev) => !prev)}
                className="as-btn-motion inline-flex w-full items-center justify-center gap-2 rounded-full border border-purple-400/35 bg-white/5 px-8 py-4 text-base font-semibold text-slate-100 backdrop-blur-md hover:border-purple-300/60 hover:bg-white/10 sm:w-auto"
              >
                <Play className="h-4 w-4 fill-purple-300 text-purple-300" />
                {SITE_CONTENT.hero.secondaryCta}
              </button>
            </div>

            {demoModalNotice && (
              <div className="mx-auto mt-5 max-w-lg rounded-2xl border border-purple-400/35 bg-purple-950/70 px-5 py-3 text-sm text-purple-200 backdrop-blur-md">
                Interactive Neural Sandbox loaded below — explore live metrics or select any plan to launch.
              </div>
            )}

            {/* Trusted Logo Strip */}
            <div className="mt-14">
              <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase">
                {SITE_CONTENT.hero.trustedLabel}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
                {SITE_CONTENT.hero.trustedLogos.map((logo) => (
                  <span
                    key={logo}
                    className="text-base font-bold tracking-tight text-slate-400/80 transition-colors hover:text-purple-200 sm:text-lg"
                  >
                    {logo}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Hero Visual Media Slot (ready to swap to /generated/hero.jpg) */}
          <div className="mx-auto mt-16 max-w-5xl">
            <div className="relative rounded-3xl border border-purple-400/30 bg-gradient-to-b from-purple-500/20 via-indigo-500/10 to-transparent p-2 shadow-[0_0_80px_rgba(139,92,246,0.28)] backdrop-blur-xl">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/90">
                <img
                  src={SITE_CONTENT.hero.imageUrl}
                  alt={SITE_CONTENT.hero.imageAlt}
                  className="aspect-[16/9] w-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Stock Metrics Row */}
        <section id="metrics" data-section="metrics" className="mx-auto max-w-7xl px-6 py-12">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {SITE_CONTENT.metrics.map((metric) => (
              <div
                key={metric.label}
                className="as-card-hover rounded-2xl border border-purple-500/25 bg-white/[0.04] p-7 text-center backdrop-blur-md"
              >
                <div className="bg-gradient-to-r from-purple-300 via-fuchsia-300 to-indigo-300 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
                  {metric.value}
                </div>
                <div className="mt-2 text-base font-semibold text-white">{metric.label}</div>
                <p className="mt-1 text-xs text-slate-400">{metric.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Generic 3-Column Glassy Glowing Feature Cards */}
        <section id="features" data-section="features" className="mx-auto max-w-7xl px-6 py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-block rounded-full border border-indigo-400/30 bg-indigo-500/15 px-4 py-1 text-xs font-semibold tracking-wider text-indigo-300 uppercase">
              {SITE_CONTENT.featuresSection.eyebrow}
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
              {SITE_CONTENT.featuresSection.title}
            </h2>
            <p className="mt-4 text-base text-slate-300 sm:text-lg">
              {SITE_CONTENT.featuresSection.subtitle}
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {SITE_CONTENT.features.map((feature) => (
              <article
                key={feature.id}
                className="as-card-hover group relative rounded-2xl border border-purple-500/25 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-7 backdrop-blur-xl"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-purple-400/35 bg-gradient-to-br from-purple-500/25 to-indigo-500/25 shadow-[0_0_20px_rgba(168,85,247,0.28)]">
                    <FeatureIcon icon={feature.icon} />
                  </div>
                  <span className="rounded-full border border-purple-400/25 bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-200">
                    {feature.tag}
                  </span>
                </div>
                <h3 className="mt-6 text-xl font-bold text-white group-hover:text-purple-200">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Cliché SaaS Pricing Tiers with Interactive Monthly / Annual Toggle */}
        <section id="pricing" data-section="pricing" className="mx-auto max-w-7xl px-6 py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-block rounded-full border border-purple-400/30 bg-purple-500/15 px-4 py-1 text-xs font-semibold tracking-wider text-purple-300 uppercase">
              {SITE_CONTENT.pricingSection.eyebrow}
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
              {SITE_CONTENT.pricingSection.title}
            </h2>
            <p className="mt-4 text-base text-slate-300 sm:text-lg">
              {SITE_CONTENT.pricingSection.subtitle}
            </p>

            {/* Interactive Billing Toggle */}
            <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-purple-500/30 bg-white/5 p-1.5 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setAnnualBilling(false)}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                  !annualBilling
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_20px_rgba(168,85,247,0.45)]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setAnnualBilling(true)}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                  annualBilling
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_20px_rgba(168,85,247,0.45)]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Annual
                <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-xs font-bold text-emerald-300">
                  Save 20%
                </span>
              </button>
            </div>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-center">
            {SITE_CONTENT.pricingTiers.map((tier) => {
              const price = annualBilling ? tier.annualPrice : tier.monthlyPrice;
              const isSelected = selectedPlan === tier.id;

              return (
                <div
                  key={tier.id}
                  className={`as-card-hover relative flex flex-col rounded-3xl p-8 backdrop-blur-xl ${
                    tier.popular
                      ? 'border-2 border-purple-400/80 bg-gradient-to-b from-purple-900/50 via-indigo-950/70 to-slate-950/90 shadow-[0_0_55px_rgba(168,85,247,0.35)] lg:scale-[1.03]'
                      : 'border border-purple-500/25 bg-white/[0.04]'
                  }`}
                >
                  {tier.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-indigo-500 px-4 py-1 text-xs font-bold tracking-wider text-white uppercase shadow-[0_0_24px_rgba(192,132,252,0.7)]">
                      Most Popular
                    </div>
                  )}

                  <h3 className="text-2xl font-bold text-white">{tier.name}</h3>
                  <p className="mt-2 text-sm text-slate-300">{tier.description}</p>

                  <div className="mt-6 flex items-baseline gap-1.5">
                    <span className="text-5xl font-extrabold tracking-tight text-white">
                      ${price}
                    </span>
                    <span className="text-sm font-medium text-slate-400">/ month</span>
                  </div>
                  <p className="mt-1 text-xs text-purple-300/80">
                    {price === 0
                      ? 'Free forever for personal projects'
                      : annualBilling
                        ? 'Billed annually per workspace'
                        : 'Billed monthly per workspace'}
                  </p>

                  <ul className="mt-8 flex-1 space-y-3.5">
                    {tier.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-3 text-sm text-slate-200">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-500/25 text-purple-300">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                        {feat}
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => setSelectedPlan(tier.id)}
                    className={`as-btn-motion mt-8 w-full rounded-full px-6 py-3.5 text-sm font-semibold ${
                      tier.popular
                        ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-fuchsia-600 text-white shadow-[0_0_28px_rgba(168,85,247,0.5)]'
                        : 'border border-purple-400/35 bg-white/5 text-white hover:bg-purple-500/20'
                    }`}
                  >
                    {isSelected ? `✓ ${tier.name} Plan Selected` : tier.ctaLabel}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Generic Testimonials Grid */}
        <section id="testimonials" data-section="testimonials" className="mx-auto max-w-7xl px-6 py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-block rounded-full border border-fuchsia-400/30 bg-fuchsia-500/15 px-4 py-1 text-xs font-semibold tracking-wider text-fuchsia-300 uppercase">
              {SITE_CONTENT.testimonialsSection.eyebrow}
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
              {SITE_CONTENT.testimonialsSection.title}
            </h2>
            <p className="mt-4 text-base text-slate-300 sm:text-lg">
              {SITE_CONTENT.testimonialsSection.subtitle}
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
            {SITE_CONTENT.testimonials.map((item) => (
              <blockquote
                key={item.id}
                className="as-card-hover flex flex-col justify-between rounded-2xl border border-purple-500/25 bg-white/[0.04] p-7 backdrop-blur-xl"
              >
                <div>
                  <div className="flex gap-1 text-amber-400" aria-label="5 out of 5 stars">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <Star key={idx} className="h-4 w-4 fill-amber-400" />
                    ))}
                  </div>
                  <p className="mt-5 text-sm leading-relaxed text-slate-200">“{item.quote}”</p>
                </div>

                <div className="mt-6 flex items-center gap-3.5 border-t border-purple-500/20 pt-5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-sm font-bold text-white shadow-[0_0_16px_rgba(168,85,247,0.45)]">
                    {item.initials}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">{item.author}</div>
                    <div className="text-xs text-slate-400">
                      {item.role}, {item.company}
                    </div>
                  </div>
                </div>
              </blockquote>
            ))}
          </div>
        </section>

        {/* Generic Glowing CTA Banner */}
        <section id="cta" data-section="cta" className="mx-auto max-w-7xl px-6 py-20">
          <div className="relative overflow-hidden rounded-3xl border border-purple-400/35 bg-gradient-to-r from-purple-900/70 via-indigo-900/75 to-fuchsia-900/65 px-8 py-16 text-center shadow-[0_0_75px_rgba(168,85,247,0.3)] backdrop-blur-xl sm:px-16">
            <span className="inline-flex items-center rounded-full border border-purple-300/35 bg-white/10 px-4 py-1 text-xs font-semibold text-purple-100">
              {SITE_CONTENT.ctaBanner.badge}
            </span>
            <h2 className="mx-auto mt-5 max-w-2xl text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
              {SITE_CONTENT.ctaBanner.title}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-purple-100/85 sm:text-lg">
              {SITE_CONTENT.ctaBanner.subtitle}
            </p>

            <form
              onSubmit={handleWaitlistSubmit}
              className="mx-auto mt-9 flex max-w-md flex-col gap-3 sm:flex-row"
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={SITE_CONTENT.ctaBanner.placeholder}
                className="flex-1 rounded-full border border-purple-300/35 bg-slate-950/60 px-5 py-3.5 text-sm text-white placeholder-slate-400 outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-400/40"
              />
              <button
                type="submit"
                className="as-btn-motion inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-bold text-indigo-950 shadow-lg hover:bg-purple-100"
              >
                {SITE_CONTENT.ctaBanner.buttonLabel}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            {ctaSubmitted && (
              <p className="mt-4 text-sm font-semibold text-emerald-300">
                Welcome aboard! Your NovaFlow AI trial workspace link has been queued.
              </p>
            )}

            <p className="mt-5 text-xs text-purple-200/75">{SITE_CONTENT.ctaBanner.footnote}</p>
          </div>
        </section>
      </main>

      {/* Standard 4-Column SaaS Footer */}
      <footer
        id="footer"
        data-section="footer"
        className="relative z-10 border-t border-purple-500/20 bg-slate-950/80 backdrop-blur-xl"
      >
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600">
                  <Zap className="h-4 w-4 text-white" />
                </span>
                <span className="text-lg font-extrabold text-white">{SITE_CONTENT.brand.name}</span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-slate-400">
                {SITE_CONTENT.brand.tagline}
              </p>
            </div>

            {SITE_CONTENT.footer.map((column) => (
              <div key={column.heading}>
                <h4 className="text-xs font-bold tracking-wider text-purple-300 uppercase">
                  {column.heading}
                </h4>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-slate-400 transition-colors hover:text-purple-200"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-purple-500/15 pt-8 text-xs text-slate-500 sm:flex-row">
            <p>{SITE_CONTENT.brand.copyright}</p>
            <p>Built with Next-Gen Neural Infrastructure</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
