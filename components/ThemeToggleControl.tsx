"use client";

import React, { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

export function ThemeToggleControl() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid SSR hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="p-3 border border-zinc-800 rounded-lg bg-zinc-900/50 flex items-center justify-between w-full">
        <span className="text-xs font-mono text-zinc-400">THEME MODE</span>
        <div className="w-12 h-6 bg-zinc-800 rounded-full animate-pulse" />
      </div>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <div className="p-3 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-100 dark:bg-zinc-900/60 flex items-center justify-between w-full transition-colors">
      <div className="flex items-center gap-2">
        {isDark ? (
          <Moon className="w-4 h-4 text-cyan-400" />
        ) : (
          <Sun className="w-4 h-4 text-amber-500" />
        )}
        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
          {isDark ? "DARK MODE" : "LIGHT MODE"}
        </span>
      </div>

      {/* Manual Theme Switch Toggle */}
      <button
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label="Toggle Theme"
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
          isDark ? "bg-cyan-500" : "bg-amber-500"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            isDark ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
