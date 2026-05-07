// Plain progress bar — no Radix, no animation libraries, just a div + width.
// Indeterminate state shows a gentle scrolling shimmer.

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0…1; ignored when `indeterminate` is true. */
  value?: number;
  indeterminate?: boolean;
}

export function Progress({ value = 0, indeterminate = false, className, ...props }: ProgressProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-[var(--color-border)]",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-2)] transition-[width] duration-200",
          indeterminate && "w-1/3 animate-[progress-slide_1.4s_ease-in-out_infinite]"
        )}
        style={indeterminate ? undefined : { width: `${pct}%` }}
      />
      <style>{`
        @keyframes progress-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}
