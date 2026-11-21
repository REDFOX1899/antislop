import type { Metadata } from 'next';
import {
  Instrument_Serif,
  JetBrains_Mono,
  Plus_Jakarta_Sans,
} from 'next/font/google';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AntiSlop — Multimodal Visual Editor powered by Gemini 4',
  description:
    'A multimodal visual editor for live frontends. Powered by Gemini 4 & calibrated Decisions API — zero AI slop.',
};

const THEME_INIT_SCRIPT = `
(function(){
  try {
    var saved = localStorage.getItem('antislop-theme');
    var t = (saved === 'light' || saved === 'dark') ? saved : 'dark';
    document.documentElement.dataset.theme = t;
    var m = document.querySelector('meta[name="color-scheme"]');
    if (m) m.content = t;
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${plusJakartaSans.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <meta name="color-scheme" content="dark light" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-[var(--bg-void)] text-[var(--ink-primary)] font-sans antialiased selection:bg-[var(--sapphire-soft)] selection:text-[var(--ink-primary)]">
        {children}
      </body>
    </html>
  );
}
