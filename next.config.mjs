/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @kpv/domain ships ESM TypeScript output; Next compiles it with the app.
  transpilePackages: ['@kpv/domain'],
};

export default nextConfig;
