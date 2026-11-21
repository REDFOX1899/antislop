'use client';

import { useId } from 'react';

/**
 * Crisp layered multi-tone prism emblem echoing Code Wiki's geometric mark,
 * crafted specifically for AntiSlop's multimodal layers.
 */
export function AntiSlopPrismMark({ className = 'h-6 w-6' }: { className?: string }) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id={`${id}-top`} x1="2" y1="6" x2="26" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF5A4F" />
          <stop offset="52%" stopColor="#FBBC04" />
          <stop offset="100%" stopColor="#4285F4" />
        </linearGradient>
        <linearGradient id={`${id}-mid`} x1="2" y1="14" x2="26" y2="14" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FBBC04" />
          <stop offset="50%" stopColor="#34A853" />
          <stop offset="100%" stopColor="#8AB4F8" />
        </linearGradient>
        <linearGradient id={`${id}-bot`} x1="2" y1="21" x2="26" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="55%" stopColor="#1A73E8" />
          <stop offset="100%" stopColor="#8AB4F8" />
        </linearGradient>
      </defs>
      {/* Top layered facet */}
      <path
        d="M14 3.5L24.5 7.75L14 12L3.5 7.75L14 3.5Z"
        fill={`url(#${id}-top)`}
      />
      {/* Middle prism chevron */}
      <path
        d="M3.5 13.75L14 18L24.5 13.75L21.5 12.55L14 15.6L6.5 12.55L3.5 13.75Z"
        fill={`url(#${id}-mid)`}
      />
      {/* Lower base facet */}
      <path
        d="M3.5 19.75L14 24L24.5 19.75L21.5 18.55L14 21.6L6.5 18.55L3.5 19.75Z"
        fill={`url(#${id}-bot)`}
      />
    </svg>
  );
}

/**
 * Iconic Google Gemini 4-point luminous sapphire star mark.
 */
export function GeminiSparkleMark({
  className = 'h-4 w-4',
  glow = false,
}: {
  className?: string;
  glow?: boolean;
}) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
      style={
        glow
          ? { filter: 'drop-shadow(0 0 18px rgba(66, 133, 244, 0.55))' }
          : undefined
      }
    >
      <defs>
        <linearGradient id={`${id}-spark`} x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A8C7FA" />
          <stop offset="48%" stopColor="#4285F4" />
          <stop offset="100%" stopColor="#1A73E8" />
        </linearGradient>
      </defs>
      <path
        d="M16 2C16.85 9.4 22.6 15.15 30 16C22.6 16.85 16.85 22.6 16 30C15.15 22.6 9.4 16.85 2 16C9.4 15.15 15.15 9.4 16 2Z"
        fill={`url(#${id}-spark)`}
      />
    </svg>
  );
}

/**
 * Clean monochrome GitHub octocat mark matching Code Wiki's card header.
 */
export function GitHubMark({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12c0 4.64 3.01 8.58 7.18 9.97.53.1.72-.23.72-.51 0-.25-.01-.92-.01-1.8-2.92.63-3.54-1.41-3.54-1.41-.48-1.21-1.17-1.53-1.17-1.53-.95-.65.07-.64.07-.64 1.05.07 1.61 1.08 1.61 1.08.94 1.61 2.46 1.14 3.06.87.09-.68.37-1.14.67-1.4-2.33-.26-4.78-1.17-4.78-5.19 0-1.15.41-2.08 1.08-2.82-.11-.27-.47-1.33.1-2.78 0 0 .88-.28 2.89 1.08a10.03 10.03 0 0 1 5.26 0c2-1.36 2.88-1.08 2.88-1.08.58 1.45.22 2.51.11 2.78.67.74 1.08 1.67 1.08 2.82 0 4.03-2.46 4.92-4.8 5.18.38.33.71.97.71 1.96 0 1.42-.01 2.56-.01 2.91 0 .28.19.62.73.51A10.506 10.506 0 0 0 22.5 12c0-5.8-4.7-10.5-10.5-10.5Z" />
    </svg>
  );
}
