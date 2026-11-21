export interface NavItem {
  label: string;
  href: string;
}

export interface MetricItem {
  value: string;
  label: string;
  detail: string;
}

export interface FeatureItem {
  id: string;
  icon: 'sparkles' | 'cpu' | 'layers' | 'shield' | 'workflow' | 'chart';
  title: string;
  description: string;
  tag: string;
}

export interface PricingTier {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  popular?: boolean;
  ctaLabel: string;
  features: string[];
}

export interface TestimonialItem {
  id: string;
  quote: string;
  author: string;
  role: string;
  company: string;
  initials: string;
}

export interface FooterColumn {
  heading: string;
  links: Array<{ label: string; href: string }>;
}

/**
 * Default inline SVG hero placeholder illustrating a generic glowing purple AI dashboard.
 * AntiSlop can effortlessly swap `hero.imageUrl` to `/generated/hero.jpg` when bespoke
 * editorial art is generated into `public/generated/hero.jpg`.
 */
const DEFAULT_HERO_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 680" fill="none">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="680" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0f0a2c"/>
      <stop offset="50%" stop-color="#1e1148"/>
      <stop offset="100%" stop-color="#2e1065"/>
    </linearGradient>
    <radialGradient id="orb1" cx="0.25" cy="0.2" r="0.55">
      <stop offset="0%" stop-color="#a855f7" stop-opacity="0.48"/>
      <stop offset="100%" stop-color="#a855f7" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="orb2" cx="0.82" cy="0.78" r="0.5">
      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="line" x1="120" y1="450" x2="760" y2="270" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#818cf8"/>
      <stop offset="55%" stop-color="#c084fc"/>
      <stop offset="100%" stop-color="#f472b6"/>
    </linearGradient>
    <linearGradient id="area" x1="0" y1="260" x2="0" y2="540" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#a855f7" stop-opacity="0.38"/>
      <stop offset="100%" stop-color="#a855f7" stop-opacity="0.0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="680" fill="url(#bg)"/>
  <rect width="1200" height="680" fill="url(#orb1)"/>
  <rect width="1200" height="680" fill="url(#orb2)"/>
  <!-- Window chrome -->
  <rect x="44" y="36" width="1112" height="608" rx="22" fill="#0b0820" fill-opacity="0.78" stroke="#a855f7" stroke-opacity="0.32" stroke-width="1.5"/>
  <circle cx="80" cy="68" r="7" fill="#f43f5e" fill-opacity="0.8"/>
  <circle cx="104" cy="68" r="7" fill="#f59e0b" fill-opacity="0.8"/>
  <circle cx="128" cy="68" r="7" fill="#10b981" fill-opacity="0.8"/>
  <rect x="380" y="56" width="440" height="24" rx="12" fill="#ffffff" fill-opacity="0.06" stroke="#a855f7" stroke-opacity="0.22"/>
  <text x="600" y="72" text-anchor="middle" fill="#cbd5e1" font-family="Inter, sans-serif" font-size="12" font-weight="500">app.novaflow.ai / neural-command-center</text>
  <!-- Sidebar -->
  <rect x="64" y="102" width="196" height="520" rx="16" fill="#ffffff" fill-opacity="0.04" stroke="#a855f7" stroke-opacity="0.18"/>
  <rect x="84" y="126" width="156" height="36" rx="10" fill="#a855f7" fill-opacity="0.25" stroke="#c084fc" stroke-opacity="0.45"/>
  <text x="102" y="149" fill="#f8fafc" font-family="Inter, sans-serif" font-size="13" font-weight="600">AI Orchestrator</text>
  <rect x="84" y="176" width="156" height="32" rx="8" fill="#ffffff" fill-opacity="0.03"/>
  <rect x="84" y="218" width="156" height="32" rx="8" fill="#ffffff" fill-opacity="0.03"/>
  <rect x="84" y="260" width="156" height="32" rx="8" fill="#ffffff" fill-opacity="0.03"/>
  <rect x="84" y="302" width="156" height="32" rx="8" fill="#ffffff" fill-opacity="0.03"/>
  <rect x="84" y="520" width="156" height="82" rx="12" fill="#6366f1" fill-opacity="0.18" stroke="#818cf8" stroke-opacity="0.35"/>
  <text x="100" y="548" fill="#e2e8f0" font-family="Inter, sans-serif" font-size="12" font-weight="600">Token Velocity</text>
  <text x="100" y="576" fill="#c084fc" font-family="Inter, sans-serif" font-size="22" font-weight="800">98.4%</text>
  <!-- Top KPI row -->
  <rect x="282" y="102" width="270" height="118" rx="16" fill="#ffffff" fill-opacity="0.05" stroke="#a855f7" stroke-opacity="0.24"/>
  <text x="304" y="134" fill="#94a3b8" font-family="Inter, sans-serif" font-size="13">Autonomous Runs</text>
  <text x="304" y="176" fill="#f8fafc" font-family="Inter, sans-serif" font-size="34" font-weight="800">142,890</text>
  <text x="304" y="202" fill="#34d399" font-family="Inter, sans-serif" font-size="12" font-weight="600">+38.4% this week</text>

  <rect x="572" y="102" width="270" height="118" rx="16" fill="#ffffff" fill-opacity="0.05" stroke="#6366f1" stroke-opacity="0.24"/>
  <text x="594" y="134" fill="#94a3b8" font-family="Inter, sans-serif" font-size="13">Latency Reduction</text>
  <text x="594" y="176" fill="#f8fafc" font-family="Inter, sans-serif" font-size="34" font-weight="800">10.4x</text>
  <text x="594" y="202" fill="#c084fc" font-family="Inter, sans-serif" font-size="12" font-weight="600">Sub-120ms neural routing</text>

  <rect x="862" y="102" width="272" height="118" rx="16" fill="#ffffff" fill-opacity="0.05" stroke="#ec4899" stroke-opacity="0.24"/>
  <text x="884" y="134" fill="#94a3b8" font-family="Inter, sans-serif" font-size="13">Active AI Agents</text>
  <text x="884" y="176" fill="#f8fafc" font-family="Inter, sans-serif" font-size="34" font-weight="800">1,284</text>
  <text x="884" y="202" fill="#f472b6" font-family="Inter, sans-serif" font-size="12" font-weight="600">99.99% SLA Healthy</text>

  <!-- Main chart card -->
  <rect x="282" y="242" width="560" height="380" rx="16" fill="#ffffff" fill-opacity="0.04" stroke="#a855f7" stroke-opacity="0.22"/>
  <text x="306" y="278" fill="#f8fafc" font-family="Inter, sans-serif" font-size="16" font-weight="700">Neural Pipeline Throughput</text>
  <text x="306" y="300" fill="#94a3b8" font-family="Inter, sans-serif" font-size="12">Live multi-agent execution velocity across workspaces</text>
  <path d="M308 530 C370 500, 410 470, 468 430 C524 392, 570 420, 628 360 C686 300, 740 315, 816 268 L816 580 L308 580 Z" fill="url(#area)"/>
  <path d="M308 530 C370 500, 410 470, 468 430 C524 392, 570 420, 628 360 C686 300, 740 315, 816 268" stroke="url(#line)" stroke-width="4" stroke-linecap="round"/>
  <circle cx="628" cy="360" r="7" fill="#c084fc" stroke="#ffffff" stroke-width="2.5"/>
  <circle cx="816" cy="268" r="7" fill="#f472b6" stroke="#ffffff" stroke-width="2.5"/>

  <!-- Right AI assistant panel -->
  <rect x="862" y="242" width="272" height="380" rx="16" fill="#ffffff" fill-opacity="0.04" stroke="#818cf8" stroke-opacity="0.24"/>
  <text x="884" y="278" fill="#f8fafc" font-family="Inter, sans-serif" font-size="15" font-weight="700">NovaFlow Copilot</text>
  <rect x="884" y="300" width="228" height="72" rx="12" fill="#a855f7" fill-opacity="0.16" stroke="#c084fc" stroke-opacity="0.35"/>
  <text x="898" y="325" fill="#e9d5ff" font-family="Inter, sans-serif" font-size="12" font-weight="600">Agent Auto-Scaling Ready</text>
  <text x="898" y="348" fill="#cbd5e1" font-family="Inter, sans-serif" font-size="11">Deployed 24 parallel workflows</text>
  <rect x="884" y="388" width="228" height="72" rx="12" fill="#6366f1" fill-opacity="0.14" stroke="#818cf8" stroke-opacity="0.3"/>
  <text x="898" y="413" fill="#c7d2fe" font-family="Inter, sans-serif" font-size="12" font-weight="600">Zero-Touch Sync Active</text>
  <text x="898" y="436" fill="#cbd5e1" font-family="Inter, sans-serif" font-size="11">All 200+ connectors verified</text>
  <rect x="884" y="556" width="228" height="44" rx="22" fill="#a855f7" fill-opacity="0.9"/>
  <text x="998" y="583" text-anchor="middle" fill="#ffffff" font-family="Inter, sans-serif" font-size="13" font-weight="600">Optimize Workflows</text>
</svg>`)}`;

export const SITE_CONTENT = {
  brand: {
    name: 'NovaFlow AI',
    tagline: 'Next-Generation Autonomous Workflow Automation',
    copyright: '© 2026 NovaFlow AI, Inc. All rights reserved.',
  },
  nav: [
    { label: 'Features', href: '#features' },
    { label: 'Metrics', href: '#metrics' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Testimonials', href: '#testimonials' },
  ] as NavItem[],
  hero: {
    badge: '✨ Powered by Next-Gen AI · NovaFlow 4.0 is Live',
    headlineLeading: 'Supercharge Your Workflow with',
    headlineAccent: 'Autonomous AI Agents',
    subheadline:
      'Unlock unprecedented productivity, streamline complex operations, and empower your entire team to ship 10x faster with our cutting-edge neural automation platform.',
    primaryCta: 'Start Building Free',
    secondaryCta: 'Watch Interactive Demo',
    trustedLabel: 'Trusted by 50,000+ innovative teams worldwide',
    trustedLogos: ['AcmeCorp', 'QuantumLabs', 'NebulaTech', 'HyperScale', 'SynergyAI'],
    /** Swap to '/generated/hero.jpg' to render bespoke generated editorial artwork */
    imageUrl: DEFAULT_HERO_SVG,
    imageAlt: 'NovaFlow AI Neural Command Center Dashboard Preview',
  },
  metrics: [
    { value: '99.99%', label: 'Uptime SLA', detail: 'Multi-region neural redundancy' },
    { value: '10x', label: 'Faster Shipping', detail: 'Verified across enterprise orgs' },
    { value: '50k+', label: 'Active Teams', detail: 'Scaling globally every day' },
    { value: '2.4M+', label: 'Workflows Automated', detail: 'Executed autonomously daily' },
  ] as MetricItem[],
  featuresSection: {
    eyebrow: 'Cutting-Edge Capabilities',
    title: 'Everything You Need to Scale Effortlessly',
    subtitle:
      'Harness the full power of next-generation AI automation with a unified suite of intelligent workflows built for modern high-velocity teams.',
  },
  features: [
    {
      id: 'neural-engine',
      icon: 'sparkles',
      title: 'Neural Workflow Engine',
      description:
        'Automate repetitive cross-functional tasks effortlessly with self-healing, context-aware AI pipelines that adapt in real time.',
      tag: 'Core AI',
    },
    {
      id: 'realtime-intel',
      icon: 'cpu',
      title: 'Real-Time Intelligence',
      description:
        'Surface high-impact operational insights across every workspace in milliseconds using sub-120ms distributed inference routing.',
      tag: 'Sub-120ms',
    },
    {
      id: 'seamless-integrations',
      icon: 'layers',
      title: 'Seamless Integrations',
      description:
        'Connect 200+ enterprise SaaS tools, data warehouses, and internal APIs with effortless one-click OAuth synchronization.',
      tag: '200+ Apps',
    },
    {
      id: 'enterprise-security',
      icon: 'shield',
      title: 'Enterprise-Grade Security',
      description:
        'SOC 2 Type II certified with zero-knowledge encryption, granular RBAC permissions, and immutable compliance audit trails.',
      tag: 'SOC 2 II',
    },
    {
      id: 'collaborative-canvas',
      icon: 'workflow',
      title: 'Collaborative AI Canvas',
      description:
        'Co-create prompts, multi-agent graphs, and real-time operational dashboards visually alongside your entire engineering org.',
      tag: 'Multiplayer',
    },
    {
      id: 'predictive-analytics',
      icon: 'chart',
      title: 'Predictive Analytics',
      description:
        'Forecast workflow bottlenecks, optimize compute allocation, and scale infrastructure automatically before demand spikes.',
      tag: 'Forecasting',
    },
  ] as FeatureItem[],
  pricingSection: {
    eyebrow: 'Simple Transparent Pricing',
    title: 'Choose the Plan That Fits Your Scale',
    subtitle:
      'Start free and unlock unlimited autonomous AI workflows as your organization grows. Switch or cancel anytime.',
  },
  pricingTiers: [
    {
      id: 'starter',
      name: 'Starter',
      description: 'Perfect for solo builders and small teams exploring AI automation.',
      monthlyPrice: 0,
      annualPrice: 0,
      ctaLabel: 'Get Started Free',
      features: [
        'Up to 5 autonomous AI agents',
        '2,500 monthly workflow executions',
        '25 standard SaaS integrations',
        'Community Discord support',
      ],
    },
    {
      id: 'pro',
      name: 'Pro',
      description: 'Built for high-velocity product teams automating critical operations.',
      monthlyPrice: 49,
      annualPrice: 39,
      popular: true,
      ctaLabel: 'Start 14-Day Free Trial',
      features: [
        'Unlimited autonomous AI agents',
        '100,000 monthly workflow executions',
        'All 200+ enterprise integrations',
        'Real-time predictive analytics suite',
        'Priority 24/7 engineering support',
      ],
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      description: 'Dedicated neural infrastructure with custom security & uptime SLAs.',
      monthlyPrice: 199,
      annualPrice: 159,
      ctaLabel: 'Contact Sales Team',
      features: [
        'Custom private VPC model hosting',
        'Unlimited executions & concurrency',
        'SAML SSO, SCIM & custom RBAC',
        'Dedicated Solutions Architect',
        '99.99% contractual uptime SLA',
      ],
    },
  ] as PricingTier[],
  testimonialsSection: {
    eyebrow: 'Loved by Modern Teams',
    title: 'See Why 50,000+ Teams Trust NovaFlow AI',
    subtitle:
      'Discover how forward-thinking leaders eliminate busywork and unlock transformative productivity gains.',
  },
  testimonials: [
    {
      id: 't1',
      quote:
        'NovaFlow AI completely revolutionized our deployment and triage workflows. Our engineers now ship features 10x faster with zero manual toil.',
      author: 'Elena Vance',
      role: 'VP of Engineering',
      company: 'HyperScale',
      initials: 'EV',
    },
    {
      id: 't2',
      quote:
        'We replaced five legacy automation tools in a single afternoon. The autonomous neural agents feel like adding ten senior operators overnight.',
      author: 'Marcus Chen',
      role: 'Head of Product',
      company: 'NebulaTech',
      initials: 'MC',
    },
    {
      id: 't3',
      quote:
        'Unprecedented reliability and effortless onboarding. NovaFlow paid for itself in the first week and our team genuinely loves using it daily.',
      author: 'Priya Nair',
      role: 'Founder & CEO',
      company: 'QuantumLabs',
      initials: 'PN',
    },
  ] as TestimonialItem[],
  ctaBanner: {
    badge: '🚀 Launch in Under 60 Seconds',
    title: 'Ready to Revolutionize Your Workflow?',
    subtitle:
      'Join 50,000+ innovative teams supercharging their operations with autonomous next-gen AI agents today.',
    placeholder: 'Enter your work email...',
    buttonLabel: 'Start Free Trial',
    footnote: 'No credit card required · Instant setup · Cancel anytime',
  },
  footer: [
    {
      heading: 'Product',
      links: [
        { label: 'Neural Engine', href: '#features' },
        { label: 'Integrations', href: '#features' },
        { label: 'Pricing', href: '#pricing' },
        { label: 'Changelog', href: '#hero' },
      ],
    },
    {
      heading: 'Company',
      links: [
        { label: 'About Us', href: '#metrics' },
        { label: 'Customers', href: '#testimonials' },
        { label: 'Careers', href: '#cta' },
        { label: 'Security', href: '#features' },
      ],
    },
    {
      heading: 'Resources',
      links: [
        { label: 'Documentation', href: '#features' },
        { label: 'API Reference', href: '#features' },
        { label: 'System Status', href: '#metrics' },
        { label: 'Privacy Policy', href: '#footer' },
      ],
    },
  ] as FooterColumn[],
};
