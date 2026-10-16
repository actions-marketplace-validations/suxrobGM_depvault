"use client";

type ScrollToFn = (id: string) => void;

/** Returns a function that smooth-scrolls to an element ID, offset for the fixed header. */
export function useScrollTo(): ScrollToFn {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: "smooth" });
  };

  return scrollTo;
}
