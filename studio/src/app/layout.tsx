import type { Metadata } from 'next';
import { DM_Sans, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const dmSans = DM_Sans({
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
  title: 'AntiSlop Studio — Multimodal Taste IDE powered by Gemini 4',
  description:
    'Drop moodboards, hold physical print up to your webcam, draw circles, speak naturally, and let Gemini 4 + calibrated Decisions API eliminate AI UI slop live.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-[#F5F3EE] text-[#141413] font-sans antialiased selection:bg-[#E03E2D]/15 selection:text-[#141413]">
        {children}
      </body>
    </html>
  );
}
