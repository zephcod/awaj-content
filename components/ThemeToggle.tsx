"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Light/dark toggle for the main content area. Lives in the (always-navy)
 * sidebar/drawer chrome, so it's styled to match the other chrome controls
 * (Sign out, etc.) regardless of which theme is active. Shared by both the
 * team app and the read-only /client views, since NavShell is shared too.
 *
 * Entirely client-side: flips the `.dark` class on <html> and remembers
 * the choice in localStorage. No cookie, no API route — so there's nothing
 * here for the auth middleware to intercept, on the login page or anywhere
 * else.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !(dark ?? false);
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Private browsing / storage disabled — theme just won't persist.
    }
  }

  // Avoid rendering an icon that could mismatch the pre-hydration script's
  // choice; render a stable placeholder until mounted.
  if (dark === null) {
    return <span className={`inline-block h-4 w-4 ${className}`} aria-hidden />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={`rounded-md p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white ${className}`}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
