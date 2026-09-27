'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

/**
 * A 2px bar at the very top of the viewport during a route change.
 *
 * It is the single highest-value loading affordance in an application like
 * this: navigation feels instant because something responds immediately,
 * before the destination has rendered anything.
 *
 * The bar is deliberately NOT linear. It runs to ~85% quickly, then crawls,
 * then snaps to 100% on arrival — so a slow route never shows a bar that
 * looks stuck at a fixed point, and a fast one still reads as complete.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    setProgress(0);

    // Start just off zero so the bar is visible on the first frame.
    const start = requestAnimationFrame(() => setProgress(18));

    const creep = setInterval(() => {
      setProgress((p) => (p >= 85 ? p : p + (85 - p) * 0.18));
    }, 180);

    const finish = setTimeout(() => {
      clearInterval(creep);
      setProgress(100);
      setTimeout(() => setVisible(false), 260);
    }, 420);

    return () => {
      cancelAnimationFrame(start);
      clearInterval(creep);
      clearTimeout(finish);
    };
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
      role="progressbar"
      aria-label="Loading page"
      aria-valuenow={Math.round(progress)}
    >
      <div
        className={cn(
          'h-full bg-[var(--color-primary)]',
          'transition-[width,opacity] duration-300 ease-out',
        )}
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
          // A soft glow at the leading edge — the detail that makes it look
          // designed rather than defaulted.
          boxShadow: '0 0 10px 1px color-mix(in srgb, var(--color-primary) 60%, transparent)',
        }}
      />
    </div>
  );
}
