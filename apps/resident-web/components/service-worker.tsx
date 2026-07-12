"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker (public/sw.js) once on mount — production
 * builds only. In dev it does the OPPOSITE: unregisters any SW + clears its
 * caches, because an SW left behind by a previous production/preview session
 * on this origin (localhost:3001) serves that build's cached chunks/RSC
 * payloads under the dev server, which breaks client navigation ("Cannot read
 * properties of null (reading 'enqueueModel')"). No-op where service workers
 * aren't supported. Mounted in the root layout.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => void r.unregister()))
        .catch(() => {});
      if (typeof caches !== "undefined") {
        caches
          .keys()
          .then((keys) => keys.forEach((k) => void caches.delete(k)))
          .catch(() => {});
      }
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration is best-effort; the app works fine without it.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
