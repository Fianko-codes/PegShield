/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The SDK ships as a source package consumed over a file: dependency.
  transpilePackages: ["@pegshield/sdk"],
  // This app lives inside the PegShield monorepo; pin the tracing root to itself
  // so Next doesn't infer a parent lockfile.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
