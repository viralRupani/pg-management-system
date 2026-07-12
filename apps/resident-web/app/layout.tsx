import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { ServiceWorker } from "@/components/service-worker";
import { ToastHost } from "@/components/ui/toast";
import { AuthProvider } from "@/lib/auth";
import { QueryProvider } from "@/lib/query-provider";
import { ThemeProvider } from "@/lib/theme";
import { NEUTRALS, SEMANTICS } from "@/lib/tokens";
import "./globals.css";

// Self-hosted at build time (static export friendly); exposed as --font-inter
// for globals.css --font-sans. Same family + weights as the mobile app.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

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

// Inline script run before paint. It replays EXACTLY what ThemeProvider will
// apply after hydration: resolve the persisted scheme preference (system →
// prefers-color-scheme) + persisted accent, then write the full token var set
// (neutrals + semantics + derived brand palette, incl. the dark contrast-lift)
// onto <html>. Without this, a cold start with a saved session flashes the
// teal-on-light defaults. The palette tables are embedded from lib/tokens.ts
// at build time so the two can never drift.
const antiFlashScript = `
(function(){try{
var N=${JSON.stringify(NEUTRALS)},S=${JSON.stringify(SEMANTICS)};
var a=null,p=null;
try{a=localStorage.getItem('pg_resident_accent');p=localStorage.getItem('pg_resident_scheme')}catch(e){}
if(!a||!/^#[0-9a-fA-F]{6}$/.test(a))a='#0d9488';
var dark=p==='dark'||(p!=='light'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);
var sch=dark?'dark':'light';
function ph(h){h=h.replace('#','');return{r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16)}}
function mix(c,t,r){var x=ph(c),y=ph(t);function ch(u,v){return Math.round(u*r+v*(1-r)).toString(16).padStart(2,'0')}return'#'+ch(x.r,y.r)+ch(x.g,y.g)+ch(x.b,y.b)}
function fg(h){var q=ph(h);return((0.299*q.r+0.587*q.g+0.114*q.b)/255)>0.6?'#0f172a':'#ffffff'}
function lum(h){var q=ph(h);function l(c){var s=c/255;return s<=0.03928?s/12.92:Math.pow((s+0.055)/1.055,2.4)}return 0.2126*l(q.r)+0.7152*l(q.g)+0.0722*l(q.b)}
function cr(x,y){var u=lum(x),v=lum(y);var hi=Math.max(u,v),lo=Math.min(u,v);return(hi+0.05)/(lo+0.05)}
var n=N[sch],m=S[sch],st=document.documentElement.style,b,f;
if(dark){var c=a;for(var i=0;i<12&&cr(c,n.page)<4.5;i++)c=mix(c,'#ffffff',0.88);f=fg(c);
b={'--brand':c,'--brand-foreground':f,'--brand-foreground-dim':mix(f,c,0.75),'--brand-soft':mix(c,n.surface,0.16),'--brand-softer':mix(c,n.surface,0.24),'--brand-line':mix(c,n.surface,0.38),'--brand-deep':mix(c,'#ffffff',0.65)};
}else{f=fg(a);
b={'--brand':a,'--brand-foreground':f,'--brand-foreground-dim':mix(f,a,0.75),'--brand-soft':mix(a,'#ffffff',0.12),'--brand-softer':mix(a,'#ffffff',0.22),'--brand-line':mix(a,'#ffffff',0.4),'--brand-deep':mix(a,'#000000',0.88)};}
['page','surface','surface2','line','line2','ink','ink2','ink3','ink4'].forEach(function(k){st.setProperty('--'+k,n[k])});
['amber','success','danger','info'].forEach(function(k){var v=m[k];st.setProperty('--'+k,v.text);st.setProperty('--'+k+'-bg',v.bg);st.setProperty('--'+k+'-dot',v.dot);st.setProperty('--'+k+'-line',v.line)});
for(var k2 in b)st.setProperty(k2,b[k2]);
st.colorScheme=sch;
}catch(e){}})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: antiFlashScript }} />
      </head>
      <body>
        <QueryProvider>
          <AuthProvider>
            <ThemeProvider>
              {children}
              {/* Inside ThemeProvider so toasts pick up the token vars. */}
              <ToastHost />
            </ThemeProvider>
          </AuthProvider>
        </QueryProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
