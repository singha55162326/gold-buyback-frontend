import type { Metadata } from 'next';
import { Noto_Sans_Lao } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

/**
 * Noto Sans Lao is self-hosted by next/font — the shop may be offline, so the
 * UI must not depend on a font CDN at runtime.
 */
const notoSansLao = Noto_Sans_Lao({
  subsets: ['lao'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-lao',
});

export const metadata: Metadata = {
  title: 'ລະບົບບໍລິຫານຈັດການຮ້ານຄຳພູວົງ',
  description: 'Gold Store & Financial Management System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="lo" className={notoSansLao.variable}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
