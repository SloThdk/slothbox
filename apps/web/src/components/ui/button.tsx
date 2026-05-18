// Lightweight Button primitive — modelled after shadcn/ui but written by hand
// so we don't depend on the shadcn CLI. CVA powers the variant-system; the
// `asChild` escape-hatch (Radix Slot) lets callers project the styles onto an
// `<a>` or `Link` without nesting elements.

"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Base — every variant inherits these.
  // NOTE on `cursor-pointer`: Tailwind v4's preflight resets <button> to
  // cursor: default. That's technically correct per the platform spec,
  // but every web user expects pointer-cursor on clickable controls, so
  // we restore it explicitly. `disabled:cursor-not-allowed` is added in
  // case a disabled button somehow gets pointer-events back (defence in
  // depth — `disabled:pointer-events-none` already short-circuits clicks).
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Primary CTA. Sky-blue accent on slate text — matches the
        // visionOS dark-glass palette. The drop-shadow uses the same
        // sky-blue rgba (not the v0.1 champagne-gold leftover) so the
        // glow under the button reads as ambient accent light rather
        // than a separate warm-on-cool stamp.
        primary:
          "bg-[var(--color-accent)] text-[var(--color-bg)] hover:bg-[var(--color-accent-strong)] active:scale-[0.99] shadow-[0_4px_24px_-10px_rgba(91,158,255,0.45)]",
        secondary:
          "bg-[var(--color-card)] text-[var(--color-fg)] border border-[var(--color-border)] hover:border-[var(--color-accent-tint)] hover:bg-[var(--color-card-elevated)]",
        ghost: "bg-transparent text-[var(--color-fg)] hover:bg-[var(--color-card)]",
        outline:
          "border border-[var(--color-border)] bg-transparent text-[var(--color-fg)] hover:border-[var(--color-accent-tint)] hover:bg-[var(--color-card)]",
        destructive:
          "bg-[var(--color-danger)] text-[var(--color-fg)] hover:bg-[color-mix(in_srgb,var(--color-danger)_90%,black)]",
        link: "underline-offset-4 hover:underline text-[var(--color-accent)]",
      },
      size: {
        sm: "h-9 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** When true, render the styles onto the immediate child instead of a `<button>`. */
  asChild?: boolean;
}

/**
 * Default-exported Button primitive.
 *
 * Examples:
 * ```tsx
 * <Button>Encrypt + Upload</Button>
 * <Button variant="ghost" size="sm">Cancel</Button>
 * <Button asChild><Link href="/about">About</Link></Button>
 * ```
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
