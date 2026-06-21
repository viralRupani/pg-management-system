import { defineConfig } from "vite";

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
      output: {
        // hashed bundle filenames -> safe for long-lived immutable caching
        entryFileNames: "assets/[name].[hash].js",
        assetFileNames: "assets/[name].[hash][extname]",
      },
    },
  },
});
