import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

// Multi-page input map: the root index.html, the blog index (blog/index.html),
// and every post (blog/<slug>/index.html) — discovered from disk so a new post
// only needs a new folder, never a config edit.
const input = {
  main: resolve(root, "index.html"),
  notFound: resolve(root, "404.html"),
};
const blogDir = resolve(root, "blog");
input.blog = resolve(blogDir, "index.html");
for (const entry of readdirSync(blogDir, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    input[`blog-${entry.name}`] = resolve(blogDir, entry.name, "index.html");
  }
}

// `vite preview` (production-mode static serving) leaves a real 404 unmatched
// path as a bare, empty 404 response — sirv has no file to serve and nothing else
// renders content for it. CloudFront fills that gap in prod via the custom-error-
// response mapping in DEPLOY.md (404/403 -> /404.html, still a 404 status); this
// plugin does the same thing for local `pnpm preview`, purely so the branded page
// is visible without a deploy. Runs only in preview and only after every real file
// has already had a chance to match.
function previewNotFound() {
  return {
    name: "preview-not-found",
    configurePreviewServer(server) {
      return () => {
        server.middlewares.use((req, res) => {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(readFileSync(resolve(root, "dist/404.html")));
        });
      };
    },
  };
}

// Static marketing site — pure HTML/CSS + ~1KB vanilla JS, no framework runtime.
// Vite is a thin wrapper here: it minifies HTML/CSS/JS (esbuild) and content-hashes
// the CSS/JS bundles so they can be served `Cache-Control: immutable` on CloudFront.
// Fonts, favicon, robots.txt and sitemap.xml live in public/ on stable paths
// (referenced by <link rel="preload"> and @font-face), so they are NOT hashed.
export default defineConfig({
  base: "/",
  // This is a real multi-page site (a distinct .html per route), not a client-routed
  // SPA. Default "spa" appType makes both `vite` and `vite preview` fall back to
  // index.html for any unmatched path (200, not 404) — fine for a router, wrong here:
  // it masks broken links locally and would make /404.html itself unreachable via a
  // real miss. "mpa" disables that fallback so unmatched paths 404 for real, matching
  // how S3/CloudFront serves the built output in production (see DEPLOY.md).
  appType: "mpa",
  plugins: [previewNotFound()],
  build: {
    target: "es2020",
    minify: "esbuild",
    cssMinify: "esbuild",
    assetsInlineLimit: 0, // keep fonts as separate cacheable files, never inline
    rollupOptions: {
      input,
      output: {
        // hashed bundle filenames -> safe for long-lived immutable caching
        entryFileNames: "assets/[name].[hash].js",
        assetFileNames: "assets/[name].[hash][extname]",
      },
    },
  },
});
