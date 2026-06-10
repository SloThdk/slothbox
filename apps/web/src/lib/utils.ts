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
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  // Whole-number bytes/KB look weird with `.0`; trim them.
  const formatted = i === 0 || value >= 100 ? value.toFixed(0) : value.toFixed(1);
  return `${formatted} ${units[i]}`;
}

/**
 * Cheap equality check for two `Uint8Array`s. Used by the receiver-side
 * whole-file integrity check in `download.ts` (recomputed BLAKE2b vs the hash
 * sealed in the metadata). NOT constant-time — fine here because both operands
 * are non-secret content hashes; do NOT use it on secret key material.
 */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
