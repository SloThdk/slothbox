import type { CSSProperties } from "react";

/**
 * Picture-based image element that serves AVIF → WebP → original.
 *
 * Why this exists: the portfolio runs `output: "export"` +
 * `images.unoptimized: true`, which disables Next.js's automatic
 * AVIF/WebP serving. Without that, every visitor downloads the raw
 * PNG/JPG — multi-megabyte project screenshots hit the wire intact
 * and LCP tanks on mobile.
 *
 * The build-time script at `scripts/optimize-images.mjs` walks
 * /public and generates a sibling `.avif` and `.webp` next to every
 * `.png` / `.jpg` / `.jpeg`, plus `-800` and `-1600` width variants
 * where the source is big enough to downscale to those widths
 * without enlargement. This component renders a `<picture>` tag with
 * a multi-width AVIF source, a WebP fallback, and the original raster
 * as the last-resort `<img src>`.
 *
 * Responsive picking: when `fill` is true (the image lays out against
 * a positioned parent and a `sizes` value tells the browser the
 * displayed width per breakpoint), the AVIF + WebP <source> elements
 * emit a `srcSet` listing all three widths. The browser then picks
 * the smallest variant that satisfies the displayed pixel density.
 * Mobile users on a 375 px viewport download the 800-wide variant,
 * not the 2000-wide one — typically a 4-5x bytes saving on the LCP.
 *
 * For images rendered at explicit width/height (e.g. icons), srcSet
 * adds no value (the browser already knows the exact pixel size), so
 * the component falls back to a single-source <picture> there.
 *
 * For external URLs (CDN-hosted icons, CMS images, etc.) and SVGs,
 * the component degrades to a plain `<img>` — there is nothing to
 * upgrade, and trying to rewrite `cdn.jsdelivr.net/.../react.svg`
 * to a non-existent `.avif` sibling would 404.
 *
 * API mirrors `next/image` deliberately so migration is mechanical:
 *   - `src`           — public path, e.g. "/images/projects/foo.png"
 *   - `alt`           — required for a11y; pass "" for decorative.
 *   - `fill`          — fills a positioned parent (Hero portrait, card thumb).
 *   - `width/height`  — explicit dimensions (when `fill` is not used).
 *   - `priority`      — sets fetchpriority="high" + loading="eager".
 *                       Set true on the LCP element only.
 *   - `sizes`         — forwarded for responsive resource hint.
 *   - `className`     — applied to the `<img>` (or the `<picture>` when fill).
 *   - `style`         — applied to the `<img>`.
 */

type CommonProps = {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  sizes?: string;
  priority?: boolean;
  /** Optional explicit aspect-ratio CSS value (e.g. "16/10") — only
   *  honoured when neither `fill` nor explicit width/height are passed. */
  aspectRatio?: string;
};

type FillProps = CommonProps & {
  fill: true;
  width?: never;
  height?: never;
};

type SizedProps = CommonProps & {
  fill?: false;
  width: number;
  height: number;
};

export type OptimizedImageProps = FillProps | SizedProps;

// Source paths that the build-time optimizer touches. Everything else
// (external URLs, SVGs, data URIs, blob URLs) bypasses the picture
// rewriting and renders as a plain <img>.
const OPTIMIZABLE_EXT = /\.(png|jpe?g)$/i;

// Widths the build-time optimizer emits per-source. Mirror
// `RESPONSIVE_WIDTHS` in scripts/optimize-images.mjs. The largest
// (capped at the optimizer's MAX_WIDTH) is the unsuffixed `.avif` /
// `.webp` so existing single-source consumers still work.
const RESPONSIVE_WIDTHS = [400, 800, 1600] as const;
const MAX_VARIANT_WIDTH = 2000;

type Siblings = {
  avif: string;
  webp: string;
  avifSrcSet: string;
  webpSrcSet: string;
};

function deriveSiblings(src: string): Siblings | null {
  if (!src.startsWith("/")) return null;
  if (!OPTIMIZABLE_EXT.test(src)) return null;
  const base = src.replace(OPTIMIZABLE_EXT, "");
  const avif = `${base}.avif`;
  const webp = `${base}.webp`;
  // Build the multi-width srcSet. The unsuffixed file is the largest
  // variant (capped at MAX_VARIANT_WIDTH by the build script), so it
  // gets the MAX_VARIANT_WIDTH descriptor.
  const avifEntries = [
    ...RESPONSIVE_WIDTHS.map((w) => `${base}-${w}.avif ${w}w`),
    `${avif} ${MAX_VARIANT_WIDTH}w`,
  ];
  const webpEntries = [
    ...RESPONSIVE_WIDTHS.map((w) => `${base}-${w}.webp ${w}w`),
    `${webp} ${MAX_VARIANT_WIDTH}w`,
  ];
  return {
    avif,
    webp,
    avifSrcSet: avifEntries.join(", "),
    webpSrcSet: webpEntries.join(", "),
  };
}

export function OptimizedImage(props: OptimizedImageProps) {
  const { src, alt, className, style, sizes, priority = false, aspectRatio } = props;
  const fill = "fill" in props && props.fill === true;
  const width = "width" in props ? props.width : undefined;
  const height = "height" in props ? props.height : undefined;

  const siblings = deriveSiblings(src);

  // Style for the <img>. In `fill` mode it absolutely-positions and
  // covers the parent — same shape as next/image's fill output, so
  // existing positioned parents and `object-cover` classes keep working.
  const imgStyle: CSSProperties = fill
    ? {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        color: "transparent",
        ...style,
      }
    : {
        ...(aspectRatio && !width && !height ? { aspectRatio } : {}),
        ...style,
      };

  // Browsers fetch <img loading="lazy"> off the critical path. The LCP
  // element must be eager + high fetchpriority so it sits at the head
  // of the request queue.
  const loading = priority ? "eager" : "lazy";
  const fetchPriority = priority ? "high" : "auto";

  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- this is the
    // intentional <img> tag inside <picture>; next/image is disabled
    // site-wide via `images.unoptimized: true` in next.config.mjs.
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={imgStyle}
      loading={loading}
      // `decoding="async"` lets the browser keep painting while the
      // image decodes off the main thread. No measurable downside for
      // the LCP element either — the browser already prioritises it.
      decoding="async"
      // fetchPriority is the React 19 / Next 15 prop name (camelCase).
      // Older lints may flag it; it maps to the HTML `fetchpriority`
      // attribute and is what tells Chrome to up-rank the LCP image.
      fetchPriority={fetchPriority}
      sizes={sizes}
    />
  );

  if (!siblings) return img;

  // Pick whether to emit a multi-width srcSet or a single-src source.
  //
  // We use srcSet only when the consumer is in `fill` mode (the image
  // is sized by its layout, not a fixed pixel width). In `fill` mode
  // the `sizes` prop tells the browser the rendered width per
  // breakpoint, which is what makes the width descriptors meaningful.
  //
  // For explicit width/height (icons, fixed-size graphics), the
  // displayed size IS the request size — srcSet adds no value, and a
  // 1920×1080 source with no -800/-1600 sibling for a 100×56 icon
  // would 404 on the missing variants. Stick to single-src there.
  const useResponsive = fill;
  const avifSrc = useResponsive ? siblings.avifSrcSet : siblings.avif;
  const webpSrc = useResponsive ? siblings.webpSrcSet : siblings.webp;

  return (
    <picture>
      <source type="image/avif" srcSet={avifSrc} sizes={sizes} />
      <source type="image/webp" srcSet={webpSrc} sizes={sizes} />
      {img}
    </picture>
  );
}
