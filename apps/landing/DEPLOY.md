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
#  - Alternate domain (CNAME): basera.in  + ACM cert (us-east-1)
#  - SPA-style 403/404 -> /index.html (200) only if you add client routes; not needed
#    for this single page.
```

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
  --paths "/" "/index.html" "/sitemap.xml" "/robots.txt"
```

Note: `aws s3 sync` sets `Content-Type` from the file extension automatically
(`font/woff2`, `image/png`, `text/css`, …). No manual MIME config needed.

## 3. DNS

Point `basera.in` (and `www`, redirecting to apex) at the CloudFront distribution via
an ALIAS/ANAME record. Add the ACM cert in `us-east-1` (CloudFront requirement).

## Verifying "most optimized"

After the first deploy, run Lighthouse against the live URL (or `pnpm preview`
locally) and confirm: Performance ~100, near-zero render-blocking, LCP = the hero
`<h1>` painting in the preloaded display font. The page ships no framework JS, no
raster images in-page, and ~14 KB gzipped of HTML+CSS+JS total.

## Before launch (content TODOs)

The page copy is the approved design verbatim. Replace placeholders first:

1. **CTA targets** — `Start free` / `Book a demo` currently link to `#`. Wire to the
   real signup (`app.basera.in`?) and a demo booking form.
2. **Stats & testimonials are illustrative** — `12,400+ beds`, `₹4.2 Cr collected`,
   `120+ PGs`, `98% on-time`, and the three named 5-star quotes are placeholders.
   Swap in real figures/quotes or remove them; don't publish as literal claims unverified.
3. **Contact details** — footer phone `+91 70163 93006`, WhatsApp link, and social
   links are stubs.
4. **Domain** — `basera.in` is assumed in `index.html` (canonical/OG), `sitemap.xml`
   and `robots.txt`. Change everywhere if the production domain differs.
