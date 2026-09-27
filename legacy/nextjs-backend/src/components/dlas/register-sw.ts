"use client";

// PWA registration (T10) — safe, conservative: shell cache only, never API.
// Self-healing: when a NEW service worker takes control (e.g. after a UI
// rebuild bumps the cache version), reload ONCE so the page never keeps
// rendering with a stale CSS/JS bundle. sessionStorage guards reload loops.
export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // visible no-op: PWA install simply stays unavailable, nothing silent
      console.info("[DLAS] Service worker registration unavailable in this browser.");
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      try {
        if (sessionStorage.getItem("dlas-sw-reloaded") === "1") return;
        sessionStorage.setItem("dlas-sw-reloaded", "1");
        window.location.reload();
      } catch {
        // private-mode storage may throw — ignore, SW still functions
      }
    });
  });
}

registerServiceWorker();
