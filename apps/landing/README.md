# @pg/landing — Basera marketing site

The public marketing/landing page for Basera. **Zero-framework static site** — the
fastest, cheapest thing to ship: hand-written HTML + CSS and ~1 KB of vanilla JS,
no React/Next runtime. Imported from the Claude Design project
`pg-management-system` (file `Basera - PG Management Landing Page.html`) and wrapped
in a thin Vite build for minification + content-hashed, immutable-cacheable bundles.

Deploys as plain static files to **S3 + CloudFront** — no SSR, no server.

## Build output (gzipped)

| File | gzip |
|---|---|
| `index.html` | ~8 KB |
| CSS bundle | ~5.3 KB |
| JS bundle | ~1.1 KB |

Plus 6 self-hosted variable-font `woff2` files (latin + latin-ext; latin-ext carries
the ₹ sign used throughout the pricing copy).

## Measured

Lighthouse (desktop preset, against `pnpm preview` build output):

| Performance | Accessibility | Best Practices | SEO |
|:-:|:-:|:-:|:-:|
| **99–100** | **98** | **100** | **100** |

LCP ~0.5–0.8 s · TBT 0 ms · CLS 0 (locally; re-run on the live URL after deploy with
CloudFront compression + real network to confirm). The one remaining accessibility
item is a by-design trade-off against the approved visual: a few muted secondary
labels (e.g. mock browser-bar URL, KPI captions) sit just under the AA contrast
ratio. Left as-is to preserve the design; revisit if strict AA/AAA is required.

## Why it's fast

- **No framework runtime.** The only JS is the page's own interactions (nav, mobile
  drawer, the cost calculator, reveal-on-scroll). Everything else is HTML + CSS.
- **Self-hosted fonts.** Replaces the render-blocking Google Fonts `<link>` and its
  two third-party connections. The two LCP-critical faces (Bricolage Grotesque for
  the `<h1>`, Plus Jakarta Sans for body) are `<link rel="preload">`ed; all use
  `font-display: swap`.
- **All-vector visuals.** Hero dashboard, phone mock, icons and stars are inline SVG
  / CSS — zero raster image requests on the page itself.
- **Content-hashed CSS/JS** → serve `Cache-Control: public, max-age=31536000, immutable`.

## SEO

`<title>` + meta description, canonical, Open Graph + Twitter card (with a real
1200×630 PNG share image), `theme-color`, favicon set, `robots.txt`, `sitemap.xml`,
and JSON-LD structured data (`Organization`, `SoftwareApplication`, `FAQPage`).

## Commands

```bash
pnpm --filter @pg/landing dev        # local dev server on :3002
pnpm --filter @pg/landing build      # -> dist/  (deploy this)
pnpm --filter @pg/landing preview     # serve the built dist/
pnpm --filter @pg/landing gen:assets  # regenerate og-image.png + icons (needs sharp)
```

`gen:assets` is a one-off — the OG image and icons are committed to `public/`, so the
build stays pure-static. Re-run it only if the brand mark or OG copy changes.

## Deploy

See [`DEPLOY.md`](./DEPLOY.md) for the S3 + CloudFront setup and the exact
`Cache-Control` headers (immutable for `/assets/**` and `/fonts/**`, short for HTML).

## Edit-before-launch checklist

These were carried over verbatim from the design and need real values before this
goes live — see the "Before launch" section in `DEPLOY.md`:

- The CTA buttons (`Start free`, `Book a demo`) point to `#` / anchors — wire to the
  real app URL (`app.basera.in`?) and a demo form.
- The fabricated stat band and named testimonials from the design have been
  **removed** (no unverifiable adoption numbers or quotes ship). Re-add a
  testimonials section only once you have real, attributable quotes.
- Footer phone (`+91 70163 93006`) and WhatsApp/social links are placeholders.
- Confirm the production domain (`basera.in` assumed throughout canonical/OG/sitemap).
