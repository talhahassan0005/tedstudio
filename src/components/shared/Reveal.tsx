'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

export interface RevealProps {
  children: React.ReactNode;
  /** Stagger slot — each step adds 90ms before the entrance plays. */
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'span';
}

/**
 * Fades content up once it scrolls into view, once.
 * Pure IntersectionObserver — no animation library. The matching keyframes
 * live in globals.css (`.reveal`), and prefers-reduced-motion disables them.
 */
export function Reveal({ children, delay = 0, className, as = 'div' }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // No observer support (old browser, some crawlers): just show it.
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const Tag = as;

  return (
    <Tag
      ref={ref as React.RefObject<never>}
      data-shown={shown}
      className={cn('reveal', className)}
      style={{ animationDelay: `${delay * 90}ms` }}
    >
      {children}
    </Tag>
  );
}
