"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Adds an `in` class to the element once it scrolls into view (once only).
 * Pair with the `.reveal` CSS class. Respects prefers-reduced-motion via CSS.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  options: { threshold?: number; rootMargin?: string } = {},
) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        }
      },
      {
        threshold: options.threshold ?? 0.15,
        rootMargin: options.rootMargin ?? "0px 0px -8% 0px",
      },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [options.threshold, options.rootMargin]);
  return ref;
}

/** True after first client mount — used to gate time-dependent rendering. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** Current Unix time, refreshed slowly for freshness/status labels. */
export function useNowSeconds(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = window.setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      intervalMs,
    );
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Animates a number from 0 → target once `active` becomes true.
 * Returns the current value. Respects reduced motion (jumps to target).
 */
export function useCountUp(target: number, active: boolean, durationMs = 1100): number {
  const [value, setValue] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setValue(target);
      return;
    }
    let raf = 0;
    let start = 0;
    const step = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, target, durationMs]);
  return value;
}
