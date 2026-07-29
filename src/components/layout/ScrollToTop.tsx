'use client';

import { useEffect, useState } from 'react';

/** How far down the page the user has to be before the button is offered. */
const SHOW_AFTER_PX = 400;

/**
 * Desktop-only "back to top" control. The reports run long, so once the user is
 * a screen or so down, a small button parks itself in the bottom-right corner.
 * Mobile keeps its own bottom nav there, so this stays hidden below `lg`.
 */
export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Scroll fires constantly — only touch state when the answer actually flips
    let frame = 0;
    const update = () => {
      frame = 0;
      setVisible(window.scrollY > SHOW_AFTER_PX);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update(); // catch a restored scroll position on mount
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const scrollToTop = () => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top"
      title="Back to top"
      // Kept mounted so it can fade rather than pop; pointer-events off while hidden
      className={`hidden lg:flex print:hidden fixed bottom-8 right-8 z-40 w-11 h-11 items-center justify-center rounded-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white shadow-lg shadow-teal-900/25 ring-1 ring-teal-500/40 transition-all duration-200 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
      }`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
    </button>
  );
}
