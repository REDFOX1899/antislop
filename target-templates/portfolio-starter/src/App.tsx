import { useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileText,
  Github,
  Layers,
  Linkedin,
  Mail,
  Menu,
  Pause,
  Play,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import {
  PORTFOLIO_CONTENT,
  buildCvDocument,
  type PortfolioSectionId,
  type ReadingCategory,
} from './data/content';

type ActiveTab = 'all' | PortfolioSectionId;

export default function App() {
  const [activeNav, setActiveNav] = useState<PortfolioSectionId>('about');
  const [activeTab, setActiveTab] = useState<ActiveTab>('all');
  const [readingCategory, setReadingCategory] = useState<ReadingCategory>('All');
  const [expandedEssayId, setExpandedEssayId] = useState<string | null>(
    PORTFOLIO_CONTENT.writing.entries[0]?.id ?? null,
  );
  const [motionPaused, setMotionPaused] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cvDownloaded, setCvDownloaded] = useState(false);

  const visibleReading =
    readingCategory === 'All'
      ? PORTFOLIO_CONTENT.reading.entries
      : PORTFOLIO_CONTENT.reading.entries.filter((item) => item.category === readingCategory);

  const handleNavClick = (sectionId: PortfolioSectionId) => {
    setActiveNav(sectionId);
    setActiveTab('all');
    setMobileMenuOpen(false);
    const target = document.getElementById(sectionId);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleDownloadCv = () => {
    const content = buildCvDocument();
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Alex-Rivera-CV.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setCvDownloaded(true);
    window.setTimeout(() => setCvDownloaded(false), 2600);
  };

  const showSection = (id: PortfolioSectionId) => activeTab === 'all' || activeTab === id;

  return (
    <div className="slop-mesh-bg min-h-screen bg-[#0b0f1f] text-slate-100">
      {/* Intentionally Generic AI-Slop Top Header with 5-Link Nav & CV Action */}
      <header
        data-section="header"
        className="sticky top-0 z-40 border-b border-indigo-500/20 bg-[#0b0f1f]/85 backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <a
            href="#hero"
            onClick={() => setActiveTab('all')}
            className="flex items-center gap-2.5 text-slate-100"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 text-sm font-extrabold text-white shadow-lg shadow-indigo-500/35">
              AR
            </span>
            <div className="leading-tight">
              <span className="block text-sm font-bold tracking-tight text-white">
                {PORTFOLIO_CONTENT.person.name}
              </span>
              <span className="block text-[11px] font-medium text-indigo-300">
                {PORTFOLIO_CONTENT.person.role}
              </span>
            </div>
          </a>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary Portfolio Navigation">
            {PORTFOLIO_CONTENT.nav.map((item) => {
              const isCurrent = activeNav === item.id;
              return (
                <a
                  key={item.id}
                  href={item.href}
                  aria-current={isCurrent ? 'location' : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    handleNavClick(item.id);
                  }}
                  className={`relative rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                    isCurrent
                      ? 'bg-indigo-500/20 text-white underline decoration-indigo-400 decoration-2 underline-offset-4'
                      : 'text-slate-300 hover:bg-indigo-500/10 hover:text-white'
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleDownloadCv}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-500/30 transition-opacity hover:opacity-95"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{cvDownloaded ? 'CV Saved' : 'Download CV'}</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="inline-flex items-center justify-center rounded-lg border border-indigo-400/30 bg-slate-900/70 p-2 text-slate-200 md:hidden"
              aria-label="Toggle Navigation Menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-indigo-500/20 bg-[#0e1429] px-5 py-3 md:hidden">
            <ul className="flex flex-col gap-1">
              {PORTFOLIO_CONTENT.nav.map((item) => (
                <li key={item.id}>
                  <a
                    href={item.href}
                    aria-current={activeNav === item.id ? 'location' : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      handleNavClick(item.id);
                    }}
                    className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                      activeNav === item.id
                        ? 'bg-indigo-500/25 text-white underline decoration-indigo-400 underline-offset-4'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-20">
        {/* Generic AI-Slop Hero Section with Circle-to-Tweak Butterfly/Orb Artwork */}
        <section
          id="hero"
          data-section="hero"
          className="grid grid-cols-1 items-center gap-8 pt-10 pb-12 lg:grid-cols-12 lg:pt-14"
        >
          <div className="lg:col-span-7">
            <div className="flex flex-wrap gap-2">
              {PORTFOLIO_CONTENT.hero.badges.map((badge, index) => (
                <span
                  key={badge}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                    index === 0
                      ? 'border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-200 shadow-sm shadow-fuchsia-500/20'
                      : 'border-indigo-400/35 bg-indigo-500/15 text-indigo-200'
                  }`}
                >
                  <Sparkles className="h-3 w-3 text-indigo-300" aria-hidden="true" />
                  {badge}
                </span>
              ))}
            </div>

            <h1 className="mt-5 bg-gradient-to-r from-white via-indigo-200 to-fuchsia-300 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl">
              {PORTFOLIO_CONTENT.hero.headline}
            </h1>

            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-300">
              {PORTFOLIO_CONTENT.hero.subheadline}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleDownloadCv}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-transform hover:-translate-y-0.5"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {cvDownloaded ? 'Downloaded Alex-Rivera-CV.txt' : PORTFOLIO_CONTENT.hero.primaryCta}
              </button>

              <a
                href="#design"
                onClick={(event) => {
                  event.preventDefault();
                  handleNavClick('design');
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-indigo-400/35 bg-slate-900/75 px-5 py-3 text-sm font-semibold text-indigo-100 transition-colors hover:border-purple-400/60 hover:bg-indigo-950/60"
              >
                {PORTFOLIO_CONTENT.hero.secondaryCta}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>

            {/* Cramped AI-Slop Vanity Stat Chips */}
            <div className="mt-7 grid grid-cols-3 gap-3">
              {PORTFOLIO_CONTENT.hero.stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-indigo-400/25 bg-slate-900/70 px-3.5 py-3 shadow-inner"
                >
                  <div className="bg-gradient-to-r from-indigo-300 to-fuchsia-300 bg-clip-text text-xl font-extrabold text-transparent">
                    {stat.value}
                  </div>
                  <div className="mt-0.5 text-[11px] font-medium text-slate-400">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Dedicated Hero Artwork Slot (Circle-to-Tweak target: data-section="artwork") */}
          <div className="lg:col-span-5">
            <div
              id="artwork"
              data-section="artwork"
              className={`slop-card relative overflow-hidden rounded-3xl p-5 ${
                motionPaused ? 'as-motion-paused' : ''
              }`}
            >
              <div className="flex items-center justify-between text-xs text-indigo-200/80">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/35 bg-indigo-500/20 px-2.5 py-0.5 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
                  Hero Artwork
                </span>
                <button
                  type="button"
                  onClick={() => setMotionPaused((prev) => !prev)}
                  className="inline-flex items-center gap-1 rounded-full border border-indigo-400/30 bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:border-indigo-300"
                >
                  {motionPaused ? (
                    <>
                      <Play className="h-3 w-3" aria-hidden="true" />
                      Play Motion
                    </>
                  ) : (
                    <>
                      <Pause className="h-3 w-3" aria-hidden="true" />
                      Pause Motion
                    </>
                  )}
                </button>
              </div>

              {PORTFOLIO_CONTENT.hero.customArtworkUrl ? (
                <div className="mt-4 overflow-hidden rounded-2xl border border-indigo-400/25 bg-slate-950/70">
                  <img
                    src={PORTFOLIO_CONTENT.hero.customArtworkUrl}
                    alt={PORTFOLIO_CONTENT.hero.artworkCaption}
                    className="aspect-[6/5] w-full object-cover"
                  />
                </div>
              ) : (
                <div className="relative mt-4 flex aspect-[6/5] items-center justify-center overflow-hidden rounded-2xl border border-indigo-400/25 bg-[#090d1b]">
                  <svg
                    viewBox="0 0 360 300"
                    className="h-full w-full max-w-[340px]"
                    role="img"
                    aria-label="Glowing neon butterfly and orb hero illustration"
                  >
                    <defs>
                      <radialGradient id="slopOrb" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#c084fc" stopOpacity="0.6" />
                        <stop offset="55%" stopColor="#6366f1" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="#090d1b" stopOpacity="0" />
                      </radialGradient>
                      <linearGradient id="wingUpper" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#818cf8" />
                        <stop offset="50%" stopColor="#a855f7" />
                        <stop offset="100%" stopColor="#ec4899" />
                      </linearGradient>
                      <linearGradient id="wingLower" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#6366f1" />
                      </linearGradient>
                    </defs>

                    {/* Generic AI Glowing Orb Backdrop */}
                    <circle cx="180" cy="145" r="118" fill="url(#slopOrb)" className="as-orb-glow" />
                    <ellipse
                      cx="180"
                      cy="145"
                      rx="126"
                      ry="54"
                      transform="rotate(-16 180 145)"
                      stroke="#818cf8"
                      strokeOpacity="0.35"
                      strokeWidth="1.5"
                      strokeDasharray="6 6"
                      fill="none"
                    />
                    <circle cx="294" cy="112" r="6" fill="#38bdf8" />
                    <circle cx="72" cy="186" r="4" fill="#f472b6" />

                    {/* Energetically Floating Generic Butterfly SVG */}
                    <g className="as-butterfly-float">
                      <g className="as-wing-left">
                        <path
                          d="M176 140 C138 72, 66 76, 78 134 C86 168, 134 166, 174 150 Z"
                          fill="url(#wingUpper)"
                          fillOpacity="0.92"
                          stroke="#e0e7ff"
                          strokeOpacity="0.45"
                          strokeWidth="1.5"
                        />
                        <path
                          d="M175 154 C140 166, 94 198, 118 228 C140 248, 170 210, 176 168 Z"
                          fill="url(#wingLower)"
                          fillOpacity="0.88"
                          stroke="#bae6fd"
                          strokeOpacity="0.4"
                          strokeWidth="1.5"
                        />
                        <circle cx="118" cy="124" r="9" fill="#fdf4ff" fillOpacity="0.55" />
                      </g>

                      <g className="as-wing-right">
                        <path
                          d="M184 140 C222 72, 294 76, 282 134 C274 168, 226 166, 186 150 Z"
                          fill="url(#wingUpper)"
                          fillOpacity="0.92"
                          stroke="#e0e7ff"
                          strokeOpacity="0.45"
                          strokeWidth="1.5"
                        />
                        <path
                          d="M185 154 C220 166, 266 198, 242 228 C220 248, 190 210, 184 168 Z"
                          fill="url(#wingLower)"
                          fillOpacity="0.88"
                          stroke="#bae6fd"
                          strokeOpacity="0.4"
                          strokeWidth="1.5"
                        />
                        <circle cx="242" cy="124" r="9" fill="#fdf4ff" fillOpacity="0.55" />
                      </g>

                      {/* Butterfly Body & Antennae */}
                      <rect x="175" y="114" width="10" height="72" rx="5" fill="#e2e8f0" />
                      <circle cx="180" cy="108" r="6" fill="#f8fafc" />
                      <path
                        d="M177 104 C170 86, 158 80, 150 84"
                        stroke="#c7d2fe"
                        strokeWidth="2"
                        strokeLinecap="round"
                        fill="none"
                      />
                      <path
                        d="M183 104 C190 86, 202 80, 210 84"
                        stroke="#c7d2fe"
                        strokeWidth="2"
                        strokeLinecap="round"
                        fill="none"
                      />
                    </g>
                  </svg>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                <span>{PORTFOLIO_CONTENT.hero.artworkCaption}</span>
                <span className="font-mono text-[11px] text-indigo-300">1.75s loop</span>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Section Focus Tabs (Quick View or Full Scroll) */}
        <div
          className="mb-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-500/25 bg-slate-900/75 p-2.5"
          role="tablist"
          aria-label="Filter Portfolio Sections"
        >
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'all'}
              onClick={() => setActiveTab('all')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === 'all'
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              All Sections
            </button>
            {PORTFOLIO_CONTENT.nav.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={activeTab === item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setActiveNav(item.id);
                }}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  activeTab === item.id
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="px-2 text-[11px] font-medium text-indigo-300/80">
            5 sections · {PORTFOLIO_CONTENT.person.location}
          </span>
        </div>

        {/* SECTION 1: ABOUT */}
        {showSection('about') && (
          <section id="about" data-section="about" className="scroll-mt-24 py-8">
            <div className="mb-5 flex items-center gap-2 text-xs font-bold tracking-wider text-indigo-400 uppercase">
              <User className="h-4 w-4" aria-hidden="true" />
              <span>{PORTFOLIO_CONTENT.about.eyebrow}</span>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <div className="slop-card rounded-2xl p-6 lg:col-span-7">
                <h2 className="text-2xl font-bold tracking-tight text-white">
                  {PORTFOLIO_CONTENT.about.title}
                </h2>
                <div className="mt-4 space-y-3.5 text-sm leading-relaxed text-slate-300">
                  {PORTFOLIO_CONTENT.about.paragraphs.map((paragraph) => (
                    <p key={paragraph.slice(0, 24)}>{paragraph}</p>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-5 lg:col-span-5">
                <div className="slop-card rounded-2xl p-5">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/35 bg-purple-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-purple-200">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    {PORTFOLIO_CONTENT.about.currentFocus.badge}
                  </span>
                  <h3 className="mt-3 text-base font-bold text-white">
                    {PORTFOLIO_CONTENT.about.currentFocus.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                    {PORTFOLIO_CONTENT.about.currentFocus.description}
                  </p>
                </div>

                <div className="slop-card rounded-2xl p-5">
                  <h3 className="text-xs font-bold tracking-wider text-indigo-300 uppercase">
                    Core Stack & Craft
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {PORTFOLIO_CONTENT.about.skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-lg border border-indigo-400/25 bg-indigo-950/60 px-2.5 py-1 text-xs font-medium text-indigo-100"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* SECTION 2: TIMELINE */}
        {showSection('timeline') && (
          <section id="timeline" data-section="timeline" className="scroll-mt-24 py-8">
            <div className="mb-5 flex items-center gap-2 text-xs font-bold tracking-wider text-indigo-400 uppercase">
              <Briefcase className="h-4 w-4" aria-hidden="true" />
              <span>{PORTFOLIO_CONTENT.timeline.eyebrow}</span>
            </div>

            <div className="mb-6">
              <h2 className="text-2xl font-bold tracking-tight text-white">
                {PORTFOLIO_CONTENT.timeline.title}
              </h2>
              <p className="mt-1 text-sm text-slate-400">{PORTFOLIO_CONTENT.timeline.subtitle}</p>
            </div>

            <div className="space-y-4">
              {PORTFOLIO_CONTENT.timeline.entries.map((entry) => (
                <article
                  key={entry.id}
                  className="slop-card relative rounded-2xl p-5 sm:p-6"
                >
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                    <div>
                      <h3 className="text-lg font-bold text-white">{entry.role}</h3>
                      <p className="text-sm font-medium text-indigo-300">
                        {entry.organization} · <span className="text-slate-400">{entry.location}</span>
                      </p>
                    </div>
                    <span className="inline-flex w-fit items-center rounded-full border border-indigo-400/35 bg-indigo-500/15 px-3 py-1 font-mono text-xs font-semibold text-indigo-200">
                      {entry.period}
                    </span>
                  </div>

                  <p className="mt-3 text-sm leading-relaxed text-slate-300">{entry.summary}</p>
                  <ul className="mt-3 space-y-1.5 text-xs text-slate-300">
                    {entry.highlights.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-fuchsia-400" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* SECTION 3: READING */}
        {showSection('reading') && (
          <section id="reading" data-section="reading" className="scroll-mt-24 py-8">
            <div className="mb-5 flex items-center gap-2 text-xs font-bold tracking-wider text-indigo-400 uppercase">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              <span>{PORTFOLIO_CONTENT.reading.eyebrow}</span>
            </div>

            <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white">
                  {PORTFOLIO_CONTENT.reading.title}
                </h2>
                <p className="mt-1 text-sm text-slate-400">{PORTFOLIO_CONTENT.reading.subtitle}</p>
              </div>

              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter Reading List">
                {PORTFOLIO_CONTENT.reading.categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setReadingCategory(cat)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      readingCategory === cat
                        ? 'bg-indigo-500 text-white shadow-sm shadow-indigo-500/30'
                        : 'border border-indigo-400/25 bg-slate-900/70 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visibleReading.map((book) => (
                <article key={book.id} className="slop-card flex flex-col justify-between rounded-2xl p-5">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-[11px] font-semibold text-indigo-200">
                        {book.category}
                      </span>
                      <span className="font-mono text-[11px] text-fuchsia-300">{book.status}</span>
                    </div>
                    <h3 className="mt-3 text-base font-bold text-white">{book.title}</h3>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {book.author} · {book.year}
                    </p>
                    <p className="mt-2.5 text-xs leading-relaxed text-slate-300">{book.note}</p>
                  </div>

                  <a
                    href={book.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-indigo-300 hover:text-indigo-200"
                  >
                    Reference Note
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* SECTION 4: DESIGN */}
        {showSection('design') && (
          <section id="design" data-section="design" className="scroll-mt-24 py-8">
            <div className="mb-5 flex items-center gap-2 text-xs font-bold tracking-wider text-indigo-400 uppercase">
              <Layers className="h-4 w-4" aria-hidden="true" />
              <span>{PORTFOLIO_CONTENT.design.eyebrow}</span>
            </div>

            <div className="mb-6">
              <h2 className="text-2xl font-bold tracking-tight text-white">
                {PORTFOLIO_CONTENT.design.title}
              </h2>
              <p className="mt-1 text-sm text-slate-400">{PORTFOLIO_CONTENT.design.subtitle}</p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {PORTFOLIO_CONTENT.design.projects.map((project) => (
                <article key={project.id} className="slop-card flex flex-col overflow-hidden rounded-2xl">
                  <div className="relative overflow-hidden border-b border-indigo-400/20 bg-slate-950">
                    <img
                      src={project.thumbnailUrl}
                      alt={`${project.title} preview`}
                      className="aspect-[16/9] w-full object-cover"
                    />
                    <span className="absolute top-3 left-3 rounded-full border border-indigo-300/35 bg-slate-950/80 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-200 backdrop-blur-xs">
                      {project.category} · {project.year}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="text-lg font-bold text-white">{project.title}</h3>
                    <p className="mt-1 text-xs font-medium text-fuchsia-300">{project.tagline}</p>
                    <p className="mt-2.5 flex-1 text-xs leading-relaxed text-slate-300">
                      {project.description}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {project.stack.map((tech) => (
                        <span
                          key={tech}
                          className="rounded-md border border-indigo-400/20 bg-slate-900/90 px-2 py-0.5 text-[11px] text-slate-300"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>

                    <div className="mt-5 flex items-center gap-4 border-t border-indigo-500/20 pt-3.5 text-xs font-semibold">
                      <a
                        href={project.liveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-indigo-300 hover:text-white"
                      >
                        Live Project
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                      <a
                        href={project.repoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-slate-400 hover:text-white"
                      >
                        <Github className="h-3.5 w-3.5" aria-hidden="true" />
                        Source
                      </a>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* SECTION 5: WRITING */}
        {showSection('writing') && (
          <section id="writing" data-section="writing" className="scroll-mt-24 py-8">
            <div className="mb-5 flex items-center gap-2 text-xs font-bold tracking-wider text-indigo-400 uppercase">
              <FileText className="h-4 w-4" aria-hidden="true" />
              <span>{PORTFOLIO_CONTENT.writing.eyebrow}</span>
            </div>

            <div className="mb-6">
              <h2 className="text-2xl font-bold tracking-tight text-white">
                {PORTFOLIO_CONTENT.writing.title}
              </h2>
              <p className="mt-1 text-sm text-slate-400">{PORTFOLIO_CONTENT.writing.subtitle}</p>
            </div>

            <div className="space-y-3.5">
              {PORTFOLIO_CONTENT.writing.entries.map((essay) => {
                const isExpanded = expandedEssayId === essay.id;
                return (
                  <article key={essay.id} className="slop-card rounded-2xl p-5">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span className="font-mono text-indigo-300">{essay.date}</span>
                          <span>·</span>
                          <span>{essay.readTime}</span>
                          <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[11px] font-medium text-purple-200">
                            {essay.tag}
                          </span>
                        </div>
                        <h3 className="mt-2 text-base font-bold text-white sm:text-lg">
                          {essay.title}
                        </h3>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-300 sm:text-sm">
                          {essay.summary}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandedEssayId(isExpanded ? null : essay.id)}
                        aria-expanded={isExpanded}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-400/30 bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:border-purple-400/60"
                      >
                        {isExpanded ? 'Hide Excerpt' : 'Read Excerpt'}
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 space-y-3 border-t border-indigo-500/20 pt-4 text-sm leading-relaxed text-slate-300">
                        {essay.excerpt.map((paragraph) => (
                          <p key={paragraph.slice(0, 24)}>{paragraph}</p>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* Generic Dark Indigo Footer */}
      <footer
        id="footer"
        data-section="footer"
        className="border-t border-indigo-500/20 bg-[#080b17]"
      >
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-10 sm:flex-row sm:items-center">
          <div>
            <div className="text-sm font-bold text-white">{PORTFOLIO_CONTENT.person.name}</div>
            <p className="mt-1 max-w-md text-xs text-slate-400">
              {PORTFOLIO_CONTENT.person.tagline}
            </p>
            <p className="mt-2 text-[11px] text-slate-500">{PORTFOLIO_CONTENT.person.copyright}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-300">
            <a
              href={`mailto:${PORTFOLIO_CONTENT.person.email}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-400/25 bg-slate-900/70 px-3 py-1.5 hover:border-indigo-400/60 hover:text-white"
            >
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              Email
            </a>
            <a
              href={PORTFOLIO_CONTENT.person.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-400/25 bg-slate-900/70 px-3 py-1.5 hover:border-indigo-400/60 hover:text-white"
            >
              <Github className="h-3.5 w-3.5" aria-hidden="true" />
              GitHub
            </a>
            <a
              href={PORTFOLIO_CONTENT.person.linkedinUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-400/25 bg-slate-900/70 px-3 py-1.5 hover:border-indigo-400/60 hover:text-white"
            >
              <Linkedin className="h-3.5 w-3.5" aria-hidden="true" />
              LinkedIn
            </a>
            <button
              type="button"
              onClick={handleDownloadCv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-400/35 bg-fuchsia-500/15 px-3 py-1.5 text-fuchsia-200 hover:bg-fuchsia-500/25"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              CV
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
