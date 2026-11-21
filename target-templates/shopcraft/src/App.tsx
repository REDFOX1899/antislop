import { useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Menu,
  Minus,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Star,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import {
  STORE_CONTENT,
  type ProductCategory,
  type ProductItem,
  type ValuePropItem,
} from './data/content';

interface CartEntry {
  product: ProductItem;
  quantity: number;
}

function BenefitIcon({ icon }: { icon: ValuePropItem['icon'] }) {
  const cls = 'h-5 w-5 text-blue-600';
  switch (icon) {
    case 'truck':
      return <Truck className={cls} />;
    case 'refresh':
      return <RefreshCw className={cls} />;
    case 'shield':
      return <ShieldCheck className={cls} />;
  }
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
    const target = document.getElementById('catalog');
    target?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Generic Corporate Blue Promo Bar */}
      <div
        data-section="promo-bar"
        className="bg-blue-600 px-4 py-2 text-center text-xs font-medium text-white sm:text-sm"
      >
        {STORE_CONTENT.brand.promoBanner}
      </div>

      {/* Standard White E-Commerce Header */}
      <header
        data-section="header"
        className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur-sm"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <a href="#hero" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Package className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight text-gray-900">
              {STORE_CONTENT.brand.name}
            </span>
          </a>

          <nav className="hidden items-center gap-8 md:flex" aria-label="Main Store Navigation">
            {STORE_CONTENT.nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-gray-600 transition-colors hover:text-blue-600"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="as-btn-motion inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-800 shadow-xs hover:border-blue-300 hover:bg-gray-50"
              aria-label="Open Shopping Cart"
            >
              <ShoppingBag className="h-4 w-4 text-blue-600" />
              <span>Cart</span>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-bold text-white">
                {totalItems}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="inline-flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-700 md:hidden"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-gray-200 bg-white px-6 py-4 md:hidden">
            <div className="flex flex-col gap-2">
              {STORE_CONTENT.nav.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        )}
      </header>

      <main>
        {/* Generic Split Hero Banner */}
        <section
          id="hero"
          data-section="hero"
          className="border-b border-gray-200 bg-gray-100"
        >
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-6 py-16 lg:grid-cols-2 lg:py-24">
            <div className="as-fade-up">
              <span className="inline-block rounded-md bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                {STORE_CONTENT.hero.badge}
              </span>
              <h1 className="mt-4 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
                {STORE_CONTENT.hero.title}
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-gray-600 sm:text-lg">
                {STORE_CONTENT.hero.subtitle}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a
                  href="#catalog"
                  className="as-btn-motion inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-xs hover:bg-blue-700"
                >
                  {STORE_CONTENT.hero.primaryCta}
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="#collections"
                  className="as-btn-motion inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  {STORE_CONTENT.hero.secondaryCta}
                </a>
              </div>
            </div>

            {/* Hero Image Slot (ready to swap to /generated/hero.jpg) */}
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <img
                src={STORE_CONTENT.hero.imageUrl}
                alt={STORE_CONTENT.hero.imageAlt}
                className="aspect-[3/2] w-full object-cover"
              />
            </div>
          </div>
        </section>

        {/* Generic Product Catalog with Interactive Category Filter */}
        <section id="catalog" data-section="catalog" className="mx-auto max-w-7xl px-6 py-20">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">
                {STORE_CONTENT.catalogSection.title}
              </h2>
              <p className="mt-2 text-sm text-gray-600 sm:text-base">
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
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visibleProducts.map((product) => (
              <article
                key={product.id}
                className="as-card-hover flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs"
              >
                <div className="relative bg-gray-100">
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="aspect-[4/3] w-full object-cover"
                  />
                  {product.badge && (
                    <span className="absolute top-3 left-3 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white">
                      {product.badge}
                    </span>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-blue-600">{product.category}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      {product.rating} ({product.reviews})
                    </span>
                  </div>

                  <h3 className="mt-2 text-lg font-semibold text-gray-900">{product.name}</h3>
                  <p className="mt-1 text-xs text-gray-500">{product.material}</p>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">
                    {product.description}
                  </p>

                  <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
                    <span className="text-xl font-bold text-gray-900">${product.price}</span>
                    <button
                      type="button"
                      onClick={() => addToCart(product)}
                      className="as-btn-motion inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      <Plus className="h-4 w-4" />
                      Add to Cart
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Generic Value Proposition Strip */}
        <section
          id="benefits"
          data-section="benefits"
          className="border-y border-gray-200 bg-white py-14"
        >
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-6 md:grid-cols-3">
            {STORE_CONTENT.valueProps.map((prop) => (
              <div key={prop.id} className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                  <BenefitIcon icon={prop.icon} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{prop.title}</h3>
                  <p className="mt-1 text-sm text-gray-600">{prop.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Editorial Collection Strip */}
        <section id="collections" data-section="collections" className="mx-auto max-w-7xl px-6 py-20">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">
              {STORE_CONTENT.collectionsSection.title}
            </h2>
            <p className="mt-2 text-sm text-gray-600 sm:text-base">
              {STORE_CONTENT.collectionsSection.subtitle}
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2">
            {STORE_CONTENT.collections.map((collection) => (
              <article
                key={collection.id}
                className="as-card-hover overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs"
              >
                <img
                  src={collection.imageUrl}
                  alt={collection.title}
                  className="aspect-[16/9] w-full object-cover"
                />
                <div className="p-6">
                  <span className="text-xs font-semibold tracking-wider text-blue-600 uppercase">
                    {collection.eyebrow}
                  </span>
                  <h3 className="mt-2 text-2xl font-bold text-gray-900">{collection.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">
                    {collection.description}
                  </p>
                  <button
                    type="button"
                    onClick={() => selectCollection(collection.filterCategory)}
                    className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
                  >
                    {collection.ctaLabel}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Customer Reviews Strip */}
        <section
          id="reviews"
          data-section="reviews"
          className="border-t border-gray-200 bg-white py-20"
        >
          <div className="mx-auto max-w-7xl px-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">
                {STORE_CONTENT.reviewsSection.title}
              </h2>
              <p className="mt-2 text-sm text-gray-600 sm:text-base">
                {STORE_CONTENT.reviewsSection.subtitle}
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
              {STORE_CONTENT.reviews.map((review) => (
                <blockquote
                  key={review.id}
                  className="flex flex-col justify-between rounded-xl border border-gray-200 bg-gray-50 p-6"
                >
                  <div>
                    <div className="flex gap-1 text-amber-400" aria-label="5 out of 5 stars">
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <Star key={idx} className="h-4 w-4 fill-amber-400" />
                      ))}
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-gray-700">“{review.quote}”</p>
                  </div>
                  <div className="mt-6 border-t border-gray-200 pt-4">
                    <div className="text-sm font-semibold text-gray-900">{review.author}</div>
                    <div className="text-xs text-gray-500">
                      {review.location} · Verified buyer of {review.product}
                    </div>
                  </div>
                </blockquote>
              ))}
            </div>
          </div>
        </section>

        {/* Generic Gray Newsletter Strip */}
        <section
          id="newsletter"
          data-section="newsletter"
          className="border-t border-gray-200 bg-gray-100 py-16"
        >
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              {STORE_CONTENT.newsletter.title}
            </h2>
            <p className="mt-2 text-sm text-gray-600 sm:text-base">
              {STORE_CONTENT.newsletter.subtitle}
            </p>
            <form
              onSubmit={handleNewsletterSubmit}
              className="mx-auto mt-6 flex max-w-md flex-col gap-3 sm:flex-row"
            >
              <input
                type="email"
                required
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                placeholder={STORE_CONTENT.newsletter.placeholder}
                className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
              <button
                type="submit"
                className="as-btn-motion rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {STORE_CONTENT.newsletter.buttonLabel}
              </button>
            </form>
            {subscribed && (
              <p className="mt-3 text-sm font-medium text-emerald-700">
                Thanks for subscribing! Check your inbox for code WELCOME10.
              </p>
            )}
          </div>
        </section>
      </main>

      {/* Standard 4-Column Store Footer */}
      <footer id="footer" data-section="footer" className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-14">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <Package className="h-4 w-4" />
                </span>
                <span className="text-base font-bold text-gray-900">{STORE_CONTENT.brand.name}</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">
                {STORE_CONTENT.brand.tagline}
              </p>
            </div>

            {STORE_CONTENT.footer.map((column) => (
              <div key={column.heading}>
                <h4 className="text-xs font-semibold tracking-wider text-gray-900 uppercase">
                  {column.heading}
                </h4>
                <ul className="mt-3.5 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-gray-600 transition-colors hover:text-blue-600"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-10 border-t border-gray-200 pt-6 text-xs text-gray-500">
            {STORE_CONTENT.brand.copyright}
          </div>
        </div>
      </footer>

      {/* Interactive Cart Slide-Over Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-gray-900/40 backdrop-blur-xs">
          <div className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-base font-bold text-gray-900">Your Cart ({totalItems})</h2>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                aria-label="Close Cart"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {cart.length === 0 ? (
                <p className="py-12 text-center text-sm text-gray-500">
                  Your shopping cart is currently empty.
                </p>
              ) : (
                <ul className="space-y-4">
                  {cart.map(({ product, quantity }) => (
                    <li
                      key={product.id}
                      className="flex items-center gap-4 rounded-lg border border-gray-200 p-3"
                    >
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-16 w-20 rounded-md object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold text-gray-900">
                          {product.name}
                        </h3>
                        <p className="text-xs text-gray-500">${product.price} each</p>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateQuantity(product.id, -1)}
                            className="rounded border border-gray-200 p-1 text-gray-600 hover:bg-gray-100"
                            aria-label={`Decrease ${product.name} quantity`}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="min-w-6 text-center text-xs font-semibold">
                            {quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(product.id, 1)}
                            className="rounded border border-gray-200 p-1 text-gray-600 hover:bg-gray-100"
                            aria-label={`Increase ${product.name} quantity`}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateQuantity(product.id, -quantity)}
                        className="p-1.5 text-gray-400 hover:text-red-600"
                        aria-label={`Remove ${product.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-gray-200 px-6 py-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="text-lg font-bold text-gray-900">${subtotal.toFixed(2)}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {subtotal >= 75
                  ? 'You unlocked free standard shipping.'
                  : `Add $${(75 - subtotal).toFixed(2)} more for free shipping.`}
              </p>
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => setCheckoutDone(true)}
                className="as-btn-motion mt-4 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {checkoutDone ? 'Order Demo Confirmed ✓' : 'Proceed to Checkout'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
