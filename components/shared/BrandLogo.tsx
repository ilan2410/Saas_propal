'use client';

import Image from 'next/image';
import { useSyncExternalStore } from 'react';

function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener('change', onChange);
  };
}

function isDarkTheme() {
  const theme = document.documentElement.dataset.theme;
  return theme === 'dark' || (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

const serverTheme = () => false;

/** Choose the artwork for the actual surface; auto follows the saved app theme. */
export function BrandLogo({
  variant = 'light',
  className = '',
  priority = false,
}: {
  variant?: 'light' | 'dark' | 'auto';
  className?: string;
  priority?: boolean;
}) {
  const darkTheme = useSyncExternalStore(subscribeToTheme, isDarkTheme, serverTheme);
  const dark = variant === 'dark' || (variant === 'auto' && darkTheme);

  return (
    <span className={`inline-block shrink-0 align-middle ${className}`}>
      <Image
        src={dark ? '/branding/proboost-dark.png' : '/branding/proboost-light.png'}
        alt="Proboost — By Livenot"
        width={2176}
        height={720}
        priority={priority}
        className="h-auto w-full"
      />
    </span>
  );
}
