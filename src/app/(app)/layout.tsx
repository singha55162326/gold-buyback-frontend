import { AppShell } from '@/components/app-shell';

/**
 * Every authenticated screen renders inside the app shell (sidebar, header,
 * shift banner, notification bell). The login page sits outside this group.
 */
export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
