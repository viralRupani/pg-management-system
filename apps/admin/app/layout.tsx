import type { Metadata } from "next";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Basera",
  description: "Basera — PG management software. Residents, rent, and more.",
};

// Inline script run synchronously before paint — reads the cached accent color
// from localStorage and sets --brand so buttons never flash the default purple.
const applyBrandScript = `
(function(){
  try {
    var c = localStorage.getItem('pg_brand_color');
    if (c && /^#[0-9a-fA-F]{6}$/.test(c)) {
      document.documentElement.style.setProperty('--brand', c);
    }
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
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
