// Tiny generic helpers used across components.
//
// Kept dependency-free apart from clsx + tailwind-merge so the utility module
// is safe to import from any client or server component.

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class strings with the standard shadcn `cn` recipe — clsx
 * resolves conditional inputs, then twMerge collapses conflicting Tailwind
 * utilities (e.g. last `text-*` wins).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a byte count with a single SI prefix and one decimal of precision.
 * 0 maps to "0 B"; ranges scale through KB/MB/GB/TB. We use 1024 (binary) as
 * file managers do — matches what users see in Finder / Explorer.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / Math.pow(1024, i);
  // Whole-number bytes/KB look weird with `.0`; trim them.
  const formatted =
    i === 0 || value >= 100 ? value.toFixed(0) : value.toFixed(1);
  return `${formatted} ${units[i]}`;
}

/**
 * Format milliseconds as a humane duration string.
 * 0–60s → "12s", 60s–60m → "5m 12s", 1h+ → "1h 5m".
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/**
 * Clamp a numeric value into [min, max].
 */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Cheap equality check for two `Uint8Array`s. Used by the receiver-side
 * integrity checks. NOT constant-time — do NOT use on secrets.
 */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Conservative environment getter. Reads a `NEXT_PUBLIC_*` var with a fallback
 * appropriate for the docker-compose default ports.
 */
export function publicEnv(name: string, fallback: string): string {
  // Next.js inlines `process.env.NEXT_PUBLIC_*` at build time — accessing
  // through this helper keeps the call sites tidy without changing the
  // semantics.
  const value = (process.env as Record<string, string | undefined>)[name];
  return value && value.length > 0 ? value : fallback;
}
