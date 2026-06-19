import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/service-worker";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/lib/auth";
import { QueryProvider } from "@/lib/query-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "My PG",
  description: "Rent, complaints, KYC, deposit, mess menu and more for your PG.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "My PG",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d9488",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

// Inline script run before paint — reads the persisted accent and replays the
// SAME palette derivation as lib/theme.ts (all six --brand* tints, not just
// --brand) so a cold start with a saved session never flashes the teal default.
const applyBrandScript = `
(function(){
  try {
    var hex = localStorage.getItem('pg_resident_accent');
    if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    function ph(h){h=h.replace('#','');return{r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16)};}
    function mix(c,t,r){var a=ph(c),b=ph(t);function ch(x,y){return Math.round(x*r+y*(1-r)).toString(16).padStart(2,'0');}return '#'+ch(a.r,b.r)+ch(a.g,b.g)+ch(a.b,b.b);}
    function fg(h){var p=ph(h);var l=(0.299*p.r+0.587*p.g+0.114*p.b)/255;return l>0.6?'#0f172a':'#ffffff';}
    var s=document.documentElement.style;
    s.setProperty('--brand',hex);
    s.setProperty('--brand-foreground',fg(hex));
    s.setProperty('--brand-soft',mix(hex,'#ffffff',0.12));
    s.setProperty('--brand-softer',mix(hex,'#ffffff',0.22));
    s.setProperty('--brand-line',mix(hex,'#ffffff',0.4));
    s.setProperty('--brand-deep',mix(hex,'#000000',0.88));
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: applyBrandScript }} />
      </head>
      <body>
        <QueryProvider>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </QueryProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
