import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

// Multi-page input map: the root index.html, the blog index (blog/index.html),
// and every post (blog/<slug>/index.html) — discovered from disk so a new post
// only needs a new folder, never a config edit.
const input = { main: resolve(root, "index.html") };
const blogDir = resolve(root, "blog");
input.blog = resolve(blogDir, "index.html");
for (const entry of readdirSync(blogDir, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    input[`blog-${entry.name}`] = resolve(blogDir, entry.name, "index.html");
  }
}

// Static marketing site — pure HTML/CSS + ~1KB vanilla JS, no framework runtime.
// Vite is a thin wrapper here: it minifies HTML/CSS/JS (esbuild) and content-hashes
// the CSS/JS bundles so they can be served `Cache-Control: immutable` on CloudFront.
// Fonts, favicon, robots.txt and sitemap.xml live in public/ on stable paths
// (referenced by <link rel="preload"> and @font-face), so they are NOT hashed.
export default defineConfig({
  base: "/",
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
