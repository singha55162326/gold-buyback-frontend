import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHASE_PRODUCTION_BUILD } from 'next/constants.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * `NEXT_PUBLIC_*` values are compiled INTO the browser bundle, not read at
 * runtime. Building without NEXT_PUBLIC_API_URL bakes in the localhost
 * fallback, and every staff browser then calls its own machine on port 4000 —
 * a deployment that starts cleanly, serves pages, and cannot log anyone in.
 *
 * Nothing about that failure points back at the build, so fail the build.
 * Keyed on Next's build phase rather than NODE_ENV, which npm does not pass
 * through the workspace script chain reliably.
 */
function assertApiUrl() {
  if (process.env.SKIP_ENV_CHECK === 'true') return;

  const url = process.env.NEXT_PUBLIC_API_URL;

  // The dangerous value is not a missing one — a .env almost always supplies
  // something — it is `localhost`, which resolves to the VIEWER's machine.
  let host = null;
  try {
    host = url ? new URL(url).hostname : null;
  } catch {
    host = null;
  }
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (host && !isLoopback) return;

  throw new Error(
    [
      '',
      'NEXT_PUBLIC_API_URL ຕ້ອງຕັ້ງກ່ອນ build (ບໍ່ແມ່ນຫຼັງ build).',
      '',
      `NEXT_PUBLIC_API_URL is ${url ? `"${url}"` : 'not set'}; a production build needs`,
      'the PUBLIC url of the API. This value is compiled into the browser',
      'bundle, so a localhost address points every staff browser at its own',
      'machine and nobody can log in.',
      '',
      '  NEXT_PUBLIC_API_URL=https://your-domain/api npm run build',
      '',
      'Rebuild after changing it. SKIP_ENV_CHECK=true bypasses this check',
      '(local production builds that are never served to anyone else).',
      '',
    ].join('\n'),
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // @kpv/domain ships ESM TypeScript output; Next compiles it with the app.
  transpilePackages: ['@kpv/domain'],

  // The frontend is deployed on its own box, without the rest of the repo.
  // `standalone` makes Next trace every import and copy the reachable files
  // — including the @kpv/domain workspace — into .next/standalone, so the
  // server needs no npm install and no monorepo.
  output: 'standalone',

  // Tracing must start at the REPO root, not at frontend/. @kpv/domain lives
  // in backend/shared, one level outside this package; with the default root
  // Next stops at frontend/ and silently ships a bundle that cannot resolve
  // the pricing engine.
  outputFileTracingRoot: path.join(here, '..'),
};

export default (phase) => {
  if (phase === PHASE_PRODUCTION_BUILD) assertApiUrl();
  return nextConfig;
};
