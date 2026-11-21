import { useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Check,
  Menu,
  Minus,
  Plus,
  ShoppingBag,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  STORE_CONTENT,
  type ProductCategory,
  type ProductItem,
} from './data/content';

interface CartEntry {
  product: ProductItem;
  quantity: number;
}

export default function App() {
  const [activeCategory, setActiveCategory] = useState<ProductCategory>('All');
  const [cart, setCart] = useState<CartEntry[]>([
    { product: STORE_CONTENT.products[0], quantity: 1 },
  ]);
  const [cartOpen, setCartOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [checkoutDone, setCheckoutDone] = useState(false);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const visibleProducts =
    activeCategory === 'All'
      ? STORE_CONTENT.products
      : STORE_CONTENT.products.filter((p) => p.category === activeCategory);

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  const addToCart = (product: ProductItem) => {
    setCheckoutDone(false);
    setCart((prev) => {
      const existing = prev.find((entry) => entry.product.id === product.id);
      if (existing) {
        return prev.map((entry) =>
          entry.product.id === product.id
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    setJustAddedId(product.id);
    window.setTimeout(() => {
      setJustAddedId((current) => (current === product.id ? null : current));
    }, 1200);
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((entry) =>
          entry.product.id === productId
            ? { ...entry, quantity: entry.quantity + delta }
            : entry,
        )
        .filter((entry) => entry.quantity > 0),
    );
  };

  const handleNewsletterSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!newsletterEmail.trim()) return;
    setSubscribed(true);
    setNewsletterEmail('');
  };

  const selectCollection = (category: ProductCategory) => {
    setActiveCategory(category);
    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--ink-primary)]">
      {/* Top Specimen Rule */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-2">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <span className="font-mono-spec text-[10px] tracking-[0.18em] text-[var(--ink-primary)] uppercase">
            {STORE_CONTENT.brand.specimen}
          </span>
          <span className="hidden font-mono-spec text-[10px] tracking-wider text-[var(--ink-secondary)] sm:inline">
            {STORE_CONTENT.brand.promoBanner}
          </span>
        </div>
      </div>

      {/* Swiss Editorial Header */}
      <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <a href="#hero" className="group flex items-center gap-3">
            <span
              className="inline-block h-2.5 w-7 bg-[var(--accent)] transition-all duration-300 group-hover:w-9"
              aria-hidden="true"
            />
            <span className="font-display text-2xl font-medium tracking-tight text-[var(--ink-primary)]">
              {STORE_CONTENT.brand.name}
            </span>
          </a>

          <nav className="hidden items-center gap-9 md:flex" aria-label="Main Navigation">
            {STORE_CONTENT.nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="relative font-mono-spec text-[11px] tracking-[0.14em] text-[var(--ink-secondary)] uppercase transition-colors hover:text-[var(--ink-primary)]"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="inline-flex items-center gap-2 border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-4 py-2 font-mono-spec text-[11px] font-medium tracking-wider text-[var(--ink-primary)] uppercase transition-all duration-200 hover:bg-[var(--ink-primary)] hover:text-[var(--bg-surface)]"
              aria-label="Open Shopping Cart"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>BAG ({totalItems})</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="inline-flex items-center justify-center border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 text-[var(--ink-primary)] transition-colors hover:border-[var(--ink-primary)] md:hidden"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-5 md:hidden">
            <div className="flex flex-col gap-4">
              {STORE_CONTENT.nav.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="font-mono-spec text-xs tracking-[0.14em] text-[var(--ink-primary)] uppercase"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        )}
      </header>

      <main>
        {/* Asymmetric Swiss Editorial Hero */}
        <section id="hero" className="border-b border-[var(--border-subtle)]">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 py-16 lg:grid-cols-12 lg:gap-16 lg:py-24">
            <div className="lg:col-span-6">
              <div className="mb-6 flex items-center gap-3">
                <span className="h-1.5 w-14 bg-[var(--accent)]" aria-hidden="true" />
                <p className="font-mono-spec text-[11px] tracking-[0.18em] text-[var(--ink-secondary)] uppercase">
                  {STORE_CONTENT.hero.badge}
                </p>
              </div>
              <h1 className="font-display text-[clamp(3.25rem,6.5vw,5.5rem)] leading-[0.95] font-normal tracking-[-0.03em] text-[var(--ink-primary)]">
                Form &amp; <span className="italic">Utility.</span>
              </h1>
              <p className="mt-6 max-w-lg text-base leading-relaxed text-[var(--ink-secondary)] sm:text-lg">
                {STORE_CONTENT.hero.subtitle}
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-4">
                <a
                  href="#catalog"
                  className="group inline-flex items-center gap-2.5 bg-[var(--accent)] px-7 py-3.5 font-mono-spec text-xs font-medium tracking-[0.12em] text-[var(--accent-contrast)] uppercase transition-all duration-200 hover:bg-[#b8281c]"
                >
                  {STORE_CONTENT.hero.primaryCta}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                </a>
                <a
                  href="#collections"
                  className="inline-flex items-center gap-2 border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-7 py-3.5 font-mono-spec text-xs font-medium tracking-[0.12em] text-[var(--ink-primary)] uppercase transition-all duration-200 hover:bg-[var(--ink-primary)] hover:text-[var(--bg-surface)]"
                >
                  {STORE_CONTENT.hero.secondaryCta}
                </a>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="group relative border border-[var(--ink-primary)] bg-[var(--bg-surface)] p-3.5 shadow-[0_20px_50px_-20px_rgba(20,20,19,0.18)]">
                <div className="overflow-hidden bg-[var(--bg-surface-muted)]">
                  <img
                    src={STORE_CONTENT.hero.imageUrl}
                    alt={STORE_CONTENT.hero.imageAlt}
                    fetchPriority="high"
                    className="aspect-[3/2] w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                  />
                </div>
                <div className="mt-3.5 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2.5 font-mono-spec text-[10px] tracking-[0.12em] text-[var(--ink-secondary)] uppercase">
                  <span>FIG. 01 — POUR-OVER &amp; TABLEWARE</span>
                  <span>304 STEEL / STONEWARE</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 01 / 02 / 03 Swiss Principles Strip */}
        <section id="benefits" className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] py-14">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-6 md:grid-cols-3 md:gap-10">
            {STORE_CONTENT.valueProps.map((prop) => (
              <div
                key={prop.id}
                className="group border-l border-[var(--border-subtle)] pl-6 transition-colors duration-200 hover:border-[var(--accent)]"
              >
                <span className="font-mono-spec text-xs font-medium tracking-widest text-[var(--accent)]">
                  {prop.index} /
                </span>
                <h2 className="mt-2 font-display text-xl font-medium text-[var(--ink-primary)]">
                  {prop.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ink-secondary)]">
                  {prop.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Catalog with Interactive Category Filter */}
        <section id="catalog" className="mx-auto max-w-7xl px-6 py-24">
          <div className="flex flex-col justify-between gap-6 border-b border-[var(--border-subtle)] pb-8 md:flex-row md:items-end">
            <div>
              <span className="font-mono-spec text-[11px] tracking-[0.16em] text-[var(--accent)] uppercase">
                Archive Selection
              </span>
              <h2 className="mt-2 font-display text-3xl font-normal tracking-tight text-[var(--ink-primary)] sm:text-4xl">
                {STORE_CONTENT.catalogSection.title}
              </h2>
              <p className="mt-2 text-sm text-[var(--ink-secondary)]">
                {STORE_CONTENT.catalogSection.subtitle}
              </p>
            </div>

            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter Products">
              {STORE_CONTENT.categories.map((category) => {
                const isActive = activeCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveCategory(category)}
                    className={`px-4 py-2 font-mono-spec text-[11px] tracking-[0.12em] uppercase transition-all duration-200 ${
                      isActive
                        ? 'bg-[var(--ink-primary)] text-[var(--bg-surface)] shadow-sm'
                        : 'border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]'
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {visibleProducts.map((product) => {
              const isJustAdded = justAddedId === product.id;
              return (
                <article key={product.id} className="swiss-card group">
                  <div className="swiss-card-inner flex h-full flex-col">
                    <div className="relative overflow-hidden border-b border-[var(--border-subtle)] bg-[var(--bg-surface-muted)]">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="aspect-[4/3] w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                      />
                      {product.badge && (
                        <span className="absolute top-3.5 left-3.5 bg-[var(--accent)] px-2.5 py-1 font-mono-spec text-[10px] font-medium tracking-[0.14em] text-[var(--accent-contrast)] uppercase">
                          {product.badge}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col p-6">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono-spec text-[10px] tracking-[0.14em] text-[var(--ink-secondary)] uppercase">
                          {product.category}
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono-spec text-xs text-[var(--ink-secondary)]">
                          <Star className="h-3 w-3 fill-[var(--accent)] text-[var(--accent)]" />
                          {product.rating}
                        </span>
                      </div>

                      <h3 className="mt-2.5 font-display text-xl font-medium text-[var(--ink-primary)]">
                        {product.name}
                      </h3>
                      <p className="mt-1 font-mono-spec text-[11px] text-[var(--ink-secondary)]">
                        {product.material}
                      </p>
                      <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--ink-secondary)]">
                        {product.description}
                      </p>

                      <div className="mt-6 flex items-center justify-between border-t border-[var(--border-subtle)] pt-4">
                        <span className="font-mono-spec text-lg font-medium tabular-nums text-[var(--ink-primary)]">
                          ${product.price}
                        </span>
                        <button
                          type="button"
                          onClick={() => addToCart(product)}
                          className={`inline-flex items-center gap-1.5 px-4 py-2 font-mono-spec text-[11px] font-medium tracking-[0.12em] uppercase transition-all duration-200 ${
                            isJustAdded
                              ? 'bg-[#1D6B42] text-white'
                              : 'bg-[var(--ink-primary)] text-[var(--bg-surface)] hover:bg-[var(--accent)]'
                          }`}
                        >
                          {isJustAdded ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              Added
                            </>
                          ) : (
                            <>
                              <Plus className="h-3.5 w-3.5" />
                              Add
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Editorial Collections */}
        <section id="collections" className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] py-24">
          <div className="mx-auto max-w-7xl px-6">
            <div className="max-w-xl">
              <span className="font-mono-spec text-[11px] tracking-[0.16em] text-[var(--accent)] uppercase">
                Lookbook
              </span>
              <h2 className="mt-2 font-display text-3xl font-normal text-[var(--ink-primary)] sm:text-4xl">
                {STORE_CONTENT.collectionsSection.title}
              </h2>
              <p className="mt-2 text-sm text-[var(--ink-secondary)]">
                {STORE_CONTENT.collectionsSection.subtitle}
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2">
              {STORE_CONTENT.collections.map((collection) => (
                <article
                  key={collection.id}
                  className="group overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-canvas)] transition-colors duration-200 hover:border-[var(--ink-primary)]"
                >
                  <div className="overflow-hidden border-b border-[var(--border-subtle)] bg-[var(--bg-surface-muted)]">
                    <img
                      src={collection.imageUrl}
                      alt={collection.title}
                      className="aspect-[16/9] w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="p-7">
                    <span className="font-mono-spec text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
                      {collection.eyebrow}
                    </span>
                    <h3 className="mt-2 font-display text-2xl font-medium text-[var(--ink-primary)]">
                      {collection.title}
                    </h3>
                    <p className="mt-2.5 text-sm leading-relaxed text-[var(--ink-secondary)]">
                      {collection.description}
                    </p>
                    <button
                      type="button"
                      onClick={() => selectCollection(collection.filterCategory)}
                      className="mt-6 inline-flex items-center gap-2 border-b border-[var(--ink-primary)] pb-1 font-mono-spec text-[11px] font-medium tracking-[0.12em] text-[var(--ink-primary)] uppercase transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    >
                      {collection.ctaLabel}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Reviews & Newsletter */}
        <section id="reviews" className="mx-auto max-w-7xl px-6 py-24">
          <div className="mb-10 flex items-end justify-between border-b border-[var(--border-subtle)] pb-6">
            <div>
              <span className="font-mono-spec text-[11px] tracking-[0.16em] text-[var(--accent)] uppercase">
                Field Notes
              </span>
              <h2 className="mt-2 font-display text-3xl font-normal text-[var(--ink-primary)]">
                From the Studio &amp; Home
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-7 lg:grid-cols-3">
            {STORE_CONTENT.reviews.map((review) => (
              <blockquote
                key={review.id}
                className="flex flex-col justify-between border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-7 transition-colors duration-200 hover:border-[var(--border-strong)]"
              >
                <div>
                  <div className="mb-4 flex gap-1">
                    {[...Array(5)].map((_, idx) => (
                      <Star
                        key={idx}
                        className="h-3 w-3 fill-[var(--accent)] text-[var(--accent)]"
                      />
                    ))}
                  </div>
                  <p className="font-display text-lg leading-relaxed italic text-[var(--ink-primary)]">
                    “{review.quote}”
                  </p>
                </div>
                <footer className="mt-6 border-t border-[var(--border-subtle)] pt-3.5 font-mono-spec text-[11px] text-[var(--ink-secondary)]">
                  {review.author} · {review.location} — {review.product}
                </footer>
              </blockquote>
            ))}
          </div>

          {/* High-Contrast Architectural Dispatch Banner */}
          <div className="mt-20 border border-[var(--ink-primary)] bg-[var(--ink-primary)] p-8 text-[var(--bg-canvas)] sm:p-10 md:flex md:items-center md:justify-between md:gap-10">
            <div className="max-w-md">
              <span className="font-mono-spec text-[10px] tracking-[0.18em] text-[var(--accent)] uppercase">
                Editorial Dispatch
              </span>
              <h3 className="mt-2 font-display text-2xl font-normal text-[var(--bg-canvas)] sm:text-3xl">
                Archive Dispatch
              </h3>
              <p className="mt-2 text-sm text-[#C7C2B8]">
                Seasonal object releases and studio notes. Zero noise.
              </p>
            </div>
            <form
              onSubmit={handleNewsletterSubmit}
              className="mt-6 flex w-full max-w-md flex-col gap-2.5 sm:flex-row md:mt-0"
            >
              <input
                type="email"
                required
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                placeholder="you@domain.com"
                className="flex-1 border border-[#3A3936] bg-[#1F1F1D] px-4 py-3 text-sm text-[var(--bg-canvas)] placeholder:text-[#8E8A82] focus:border-[var(--bg-canvas)] focus:outline-none"
              />
              <button
                type="submit"
                className="bg-[var(--accent)] px-6 py-3 font-mono-spec text-xs font-medium tracking-[0.12em] text-[var(--accent-contrast)] uppercase transition-colors hover:bg-[#b8281c]"
              >
                {subscribed ? 'Joined' : 'Subscribe'}
              </button>
            </form>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--ink-primary)] bg-[var(--bg-canvas)] px-6 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="inline-block h-2 w-5 bg-[var(--accent)]" aria-hidden="true" />
            <span className="font-display text-lg font-medium text-[var(--ink-primary)]">
              {STORE_CONTENT.brand.name}
            </span>
          </div>
          <span className="font-mono-spec text-[11px] tracking-wider text-[var(--ink-secondary)]">
            {STORE_CONTENT.brand.copyright}
          </span>
        </div>
      </footer>

      {/* Slide-Over Cart Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-xs">
          <div className="flex h-full w-full max-w-md flex-col border-l border-[var(--ink-primary)] bg-[var(--bg-canvas)] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
              <h2 className="font-display text-2xl font-medium">Your Bag ({totalItems})</h2>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="border border-transparent p-1.5 text-[var(--ink-primary)] transition-colors hover:border-[var(--border-subtle)]"
                aria-label="Close Cart"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto py-6">
              {cart.length === 0 ? (
                <p className="text-sm text-[var(--ink-secondary)]">Your bag is currently empty.</p>
              ) : (
                cart.map(({ product, quantity }) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4"
                  >
                    <div className="flex items-center gap-3.5">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-14 w-14 border border-[var(--border-subtle)] bg-[var(--bg-surface-muted)] object-cover"
                      />
                      <div>
                        <h3 className="font-display text-base font-medium">{product.name}</h3>
                        <p className="font-mono-spec text-xs text-[var(--ink-secondary)]">
                          ${product.price} each
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuantity(product.id, -1)}
                        className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5 transition-colors hover:border-[var(--ink-primary)]"
                        aria-label="Decrease quantity"
                      >
                        {quantity === 1 ? (
                          <Trash2 className="h-3.5 w-3.5" />
                        ) : (
                          <Minus className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <span className="w-6 text-center font-mono-spec text-xs tabular-nums">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(product.id, 1)}
                        className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5 transition-colors hover:border-[var(--ink-primary)]"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-[var(--border-subtle)] pt-5">
              <div className="flex items-center justify-between font-mono-spec text-sm">
                <span className="tracking-wider text-[var(--ink-secondary)]">SUBTOTAL</span>
                <span className="text-base font-medium tabular-nums">${subtotal}</span>
              </div>
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => setCheckoutDone(true)}
                className="mt-4 w-full bg-[var(--accent)] py-3.5 font-mono-spec text-xs font-medium tracking-[0.14em] text-[var(--accent-contrast)] uppercase transition-colors hover:bg-[#b8281c] disabled:opacity-40"
              >
                {checkoutDone ? 'Order Confirmed' : 'Proceed to Checkout'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
