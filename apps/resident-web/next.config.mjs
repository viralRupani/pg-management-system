/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pure client SPA — no SSR/middleware/server-actions. The NestJS API is the
  // only trust boundary (see root CLAUDE.md). Builds to ./out as static files.
  output: "export",
  // next/image can't optimize without a server in a static export.
  images: { unoptimized: true },
  // Workspace packages ship TS source; let Next transpile them.
  transpilePackages: ["@pg/shared", "@pg/api-client"],
  // Static hosts serve /rent as /rent/index.html.
  trailingSlash: true,
};

export default nextConfig;
