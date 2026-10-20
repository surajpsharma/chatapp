/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep the MongoDB driver external so it is `require`d at runtime rather than
  // bundled — this also lets the test harness swap in an in-memory stand-in.
  experimental: {
    serverComponentsExternalPackages: ['mongodb'],
  },
};

module.exports = nextConfig;
