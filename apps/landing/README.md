# @pg/landing — Basera marketing site

The public marketing/landing page for Basera. **Zero-framework static site** — the
fastest, cheapest thing to ship: hand-written HTML + CSS and ~1 KB of vanilla JS,
no React/Next runtime. Imported from the Claude Design project
`pg-management-system` (file `Basera - PG Management Landing Page.html`) and wrapped
in a thin Vite build for minification + content-hashed, immutable-cacheable bundles.

Deploys as plain static files to **S3 + CloudFront** — no SSR, no server.

Multi-page: the homepage (`index.html`) plus a blog (`blog/index.html` + one
directory per post, `blog/<slug>/index.html`) — see "Structure" below.

## Structure

```
index.html                        homepage
blog/index.html                   blog listing (/blog/)
blog/<slug>/index.html            one post each (/blog/<slug>/)
src/styles.css                    single shared stylesheet (homepage + blog classes)
src/app.js                        shared nav/drawer/calculator JS
public/                           sitemap.xml, robots.txt, favicons, og-image.png, fonts
```

Vite's `rollupOptions.input` (`vite.config.js`) discovers every `blog/*/` folder
automatically at build time — adding a post is a new folder, not a config edit.
Because a post's canonical/OG/JSON-LD and `sitemap.xml` entry all need to match its
final path, **add a post by copying an existing `blog/<slug>/index.html`** (it has
every required tag already wired) rather than writing one from scratch. Then:

1. Update its `<title>`, description, dates, tag, headline and body copy.
2. Add a card for it to `blog/index.html`'s grid and JSON-LD `blogPost` list.
3. Add its 2-3 "related" links on a couple of existing posts (internal linking is
   most of what makes a blog help SEO — see the checklist below).
4. Add a `<url>` entry to `public/sitemap.xml`.
5. `robots.txt` needs no change (`Allow: /` already covers new paths).

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

> **Keep SEO in mind on every change to this app.** This is a marketing/landing
> page — its whole job is to be found and to rank. Any edit to `index.html`,
> `public/`, or the on-page copy should preserve (and ideally improve) the items
> below, not just avoid breaking them. Checklist before you consider a change done:
>
> - `<title>` stays a specific, keyword-bearing phrase (~50–60 chars).
> - `meta description` stays truthful and under ~160 chars (Google truncates
>   longer snippets in search results) — check with
>   `python3 -c "print(len('...'))"` before committing copy changes.
> - `canonical`, `og:url`, the JSON-LD `@id`/`url` fields, and `sitemap.xml`'s
>   `<loc>` all point at the **same** production domain (`baserapg.com`) — if the
>   domain ever changes, update all four together, plus `robots.txt`'s `Sitemap:`
>   line and `DEPLOY.md`.
> - New sections/copy get exactly one `<h1>` per page and a logical `<h2>`/`<h3>`
>   hierarchy (see `#features`/`#how`/`#pricing`/`#faq` for the pattern) — don't
>   skip levels or add a second `<h1>`.
> - Any new `<img>` gets a real `alt`; decorative inline SVG/mock visuals keep using
>   `role="img" aria-label="..."` the way the hero mockups do.
> - New claims in JSON-LD (`FAQPage`, `Offer`, etc.) must be true and match the
>   visible page copy — don't add structured data for content that isn't rendered.
> - Don't add fabricated stats/testimonials/reviews (adoption numbers, star
>   ratings) — this repo intentionally ships none until they're real (see
>   `DEPLOY.md`); fake `AggregateRating`/`Review` schema is a Google spam violation.
> - Bump `sitemap.xml`'s `<lastmod>` when the page content meaningfully changes.
> - Re-run Lighthouse (`pnpm --filter @pg/landing preview` → audit) after any
>   change and keep the SEO score at 100 — see "Measured" above for the baseline.
>
> **Blog-specific**, on top of the above:
> - Every post needs its own `sitemap.xml` entry, `canonical`, `og:url` and
>   `BlogPosting` JSON-LD `mainEntityOfPage` — all pointing at its own
>   `/blog/<slug>/` URL, not the blog index or homepage.
> - Every post links to 2-3 others (the "Keep reading" related grid) and back to
>   `/#pricing` or `/#demo` at least once. Internal links are the main SEO lever a
>   new post pulls — a post nothing links to, and that links to nothing else,
>   contributes far less. **True backlinks** (links from *other* domains) can't be
>   manufactured here — they come from the content being genuinely link-worthy and
>   getting shared; this repo only controls the internal linking and share-ability
>   (OG/Twitter cards) side of that.
> - Claims about Indian tenancy/KYC/deposit law are hedged ("check your local
>   rules/state"), never stated as settled fact — these vary by state/city and a
>   wrong specific claim is worse than a general pointer to check locally.
> - A new post is a new page for CloudFront too — see `DEPLOY.md`'s
>   "Directory-index requests" section before it goes live.
>
> Currently shipped: `<title>` + meta description, canonical, Open Graph + Twitter
> card (with a real 1200×630 PNG share image, `og:image:type`/`twitter:image:alt`),
> `theme-color`, favicon set, `robots.txt`, `sitemap.xml` (with `lastmod`), and
> JSON-LD structured data (`Organization`, `SoftwareApplication`, `FAQPage` on the
> homepage; `Blog`/`BlogPosting`/`BreadcrumbList` on the blog).

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
  real app URL (`app.baserapg.com`?) and a demo form.
- The fabricated stat band and named testimonials from the design have been
  **removed** (no unverifiable adoption numbers or quotes ship). Re-add a
  testimonials section only once you have real, attributable quotes.
- Footer phone (`+91 70163 93006`) and WhatsApp/social links are placeholders.
- Production domain is `baserapg.com`, live throughout canonical/OG/JSON-LD/sitemap —
  if it ever changes, update all of them together (see "SEO" below).
- The blog's 7 launch posts are original, written for this site — not placeholders,
  but review them for tone/accuracy before publishing like any other page copy.
