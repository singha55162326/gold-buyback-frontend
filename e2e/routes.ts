// NAV is plain TS data (no Next runtime imports), so it is imported directly from the app.
import { NAV } from '../src/lib/nav';

export interface RouteDef {
  path: string;
  group: string;
  slug: string;
  authed: boolean;
}

const hrefs = Array.from(new Set(NAV.flatMap((g) => g.items.map((i) => i.href))));

const toRoute = (path: string, authed: boolean): RouteDef => ({
  path,
  authed,
  group: path.split('/')[1] || 'root',
  slug: path.replace(/^\//, '').replace(/\//g, '-') || 'root',
});

// /help is already in NAV; /login is not (no session).
export const ROUTES: RouteDef[] = [...hrefs.map((h) => toRoute(h, true)), toRoute('/login', false),
  // Unlisted page: not in NAV, so it is added by hand to keep it covered.
  toRoute('/ledger/ap-ar-cash', true),
];
