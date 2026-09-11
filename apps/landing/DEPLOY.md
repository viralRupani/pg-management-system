# Deploying the Basera landing page (S3 + CloudFront)

Pure static site → S3 origin behind CloudFront (for HTTPS, Brotli/gzip compression,
HTTP/2+3, and edge caching). No server, no SSR.

> This doc is the runbook. Nothing here has been executed — deploying is an outward
> action left to you. Build first: `pnpm --filter @pg/landing build` → `dist/`.

## 1. One-time infra

```bash
# Private bucket (CloudFront reads via Origin Access Control — do NOT enable public
# website hosting; serve through CloudFront only).
aws s3 mb s3://basera-landing

# CloudFront distribution:
#  - Origin: the S3 bucket, locked down with Origin Access Control (OAC)
#  - Default root object: index.html
#  - Compress objects automatically: YES (Brotli + gzip)
#  - Viewer protocol policy: redirect-to-https
#  - Alternate domain (CNAME): baserapg.com  + ACM cert (us-east-1)
#  - SPA-style 403/404 -> /index.html (200) only if you add client routes; not needed
#    for the marketing pages.
```

### Directory-index requests (`/blog/`, `/blog/<slug>/`)

The site is multi-page now (`apps/landing/blog/`), and each blog page builds to a
`.../index.html` at a directory path (e.g. `dist/blog/pg-rent-collection-upi-guide/index.html`,
served at `/blog/pg-rent-collection-upi-guide/`). CloudFront's **default root object**
setting only rewrites the bucket *root* (`/` → `/index.html`) — it does **not** apply
to nested paths, so a request for `/blog/` or `/blog/<slug>/` against an OAC-locked S3
origin 404s unless something appends `/index.html` to the request URI first.

Fix with a small CloudFront Function (Viewer Request) — cheap, no cold starts, exactly
this one job:

```js
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith("/")) {
    request.uri += "index.html";
  } else if (!uri.includes(".")) {
    request.uri += "/index.html";
  }
  return request;
}
```

Attach it to the distribution's default cache behavior as a **viewer request**
function. Without it, the homepage still works (root default-root-object covers it)
but every blog URL 404s — test `/blog/` and one post URL after the first deploy,
not just `/`.

## 2. Upload with the right cache headers

The win is two cache tiers. Hashed assets are immutable; HTML and the rotating
metadata files must stay fresh.

```bash
cd apps/landing && pnpm build

# (a) Long-lived, immutable: fingerprinted JS/CSS + fonts (filenames change on edit)
aws s3 sync dist/ s3://basera-landing \
  --exclude "*" --include "assets/*" --include "fonts/*" \
  --cache-control "public, max-age=31536000, immutable"

# (b) Short-lived: HTML + crawler/meta files + icons (stable names, content changes)
aws s3 sync dist/ s3://basera-landing \
  --exclude "assets/*" --exclude "fonts/*" \
  --cache-control "public, max-age=300, must-revalidate"

# (c) Invalidate the always-fresh paths so a new deploy is visible immediately
aws cloudfront create-invalidation --distribution-id <DIST_ID> \
  --paths "/" "/index.html" "/sitemap.xml" "/robots.txt" "/blog/*"
```

Note: `aws s3 sync` sets `Content-Type` from the file extension automatically
(`font/woff2`, `image/png`, `text/css`, …). No manual MIME config needed.

## 3. DNS

Point `baserapg.com` (and `www`, redirecting to apex) at the CloudFront distribution
via an ALIAS/ANAME record. Add the ACM cert in `us-east-1` (CloudFront requirement).
A mismatched domain here breaks the canonical URL / OG `url` / sitemap `loc` that
`index.html` already ships (all pinned to `baserapg.com`) — SEO signals point at a
host that must actually resolve to this site.

## Verifying "most optimized"

After the first deploy, run Lighthouse against the live URL (or `pnpm preview`
locally) and confirm: Performance ~100, near-zero render-blocking, LCP = the hero
`<h1>` painting in the preloaded display font. The page ships no framework JS, no
raster images in-page, and ~14 KB gzipped of HTML+CSS+JS total.

## Before launch (content TODOs)

The page copy is the approved design verbatim. Replace placeholders first:

1. **CTA targets** — `Start free` / `Book a demo` currently link to `#`. Wire to the
   real signup (`app.baserapg.com`?) and a demo booking form.
2. **Contact details** — footer phone `+91 70163 93006`, WhatsApp link, and social
   links are stubs.
3. **Domain** — `baserapg.com` is what's live in `index.html` (canonical/OG/JSON-LD),
   `sitemap.xml` and `robots.txt`. If the production domain ever changes, update all
   four together (canonical, OG `url`, JSON-LD `@id`/`url`, sitemap `loc`) — a
   mismatch silently breaks the SEO signals shipped in `<head>`.
4. **CloudFront Function** — deploy the directory-index rewrite above before the
   first deploy, or `/blog/` and every post URL 404. Easy to miss because `/`
   still works fine without it.
