import type { Metadata } from 'next';
import { Cormorant_Garamond, Noto_Sans_Lao, Noto_Serif_Lao } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { Backdrop } from '@/components/backdrop';

/**
 * Noto Sans Lao is self-hosted by next/font — the shop may be offline, so the
 * UI must not depend on a font CDN at runtime.
 */
const notoSansLao = Noto_Sans_Lao({
  subsets: ['lao'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-lao',
});

const notoSerifLao = Noto_Serif_Lao({
  subsets: ['lao'],
  weight: ['600', '700'],
  display: 'swap',
  variable: '--font-serif-lao',
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600'],
  display: 'swap',
  variable: '--font-latin',
});

/** Runs before first paint so the saved (or system) theme never flashes. */
const THEME_SCRIPT = `try{var t=localStorage.getItem('kpv.theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.dataset.theme=t}catch(e){}`;

export const metadata: Metadata = {
  title: 'ລະບົບບໍລິຫານຈັດການຮ້ານຄຳພູວົງ',
  description: 'Gold Store & Financial Management System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="lo"
      data-theme="dark"
      suppressHydrationWarning
      className={`${notoSansLao.variable} ${notoSerifLao.variable} ${cormorant.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="font-sans">
        <Backdrop />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
