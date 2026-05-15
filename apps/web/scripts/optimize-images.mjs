#!/usr/bin/env node
// Idempotent image optimizer for /public.
//
// For every source .jpg / .jpeg / .png it generates a sibling set of
// .avif and .webp variants at responsive widths (800, 1600, max-2000).
// AVIF gives a 5-10x compression win over the source PNG/JPG for
// screenshots and photos at visually indistinguishable quality. WebP
// is the fallback for the ~3% of visitors on browsers older than 2020.
//
// Output naming:
//   foo.png  ->  foo.avif       (max width, capped at MAX_WIDTH)
//                foo.webp       (max width, capped at MAX_WIDTH)
//                foo-1600.avif  (1600px wide)
//                foo-1600.webp
//                foo-800.avif   (800px wide)
//                foo-800.webp
//
// The unsuffixed `.avif` / `.webp` is the largest variant — kept so
// the existing single-source <picture> tags in components without
// srcset still work as before. The numbered variants feed the new
// srcset path inside <OptimizedImage>.
//
// Behaviour:
//   - Walks public/ recursively.
//   - Skips any variant where the output exists AND is newer than the
//     source — so repeated runs are free.
//   - If the source is narrower than a target variant width, the
//     variant is downscaled-not-enlarged: a 900px source still gets a
//     `-800.avif` (800px) but not a `-1600.avif` (would be enlargement).
//   - Prints per-source savings + a total summary at the end.
//
// Run manually: `node scripts/optimize-images.mjs`
// Or via the npm script: `npm run optimize:images`
//
// The generated .avif / .webp files are checked into git so production
// serves them directly from CF Pages without a build-step dependency.

import { readdir, stat } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "public");

// Quality + sizing knobs. Tuned for portfolio screenshots and product
// photos — both compress well at AVIF q60. Push higher if you start
// shipping fine-detail photography (textile close-ups, dark scenes
// with banding) where q60 can show artefacts.
const MAX_WIDTH = 2000;
const AVIF_QUALITY = 60;
const AVIF_EFFORT = 6;
const WEBP_QUALITY = 82;

// Responsive widths to generate alongside the max-width variant.
// -  400 covers the smallest 1x mobile render (Hero portrait at 80vw
//    on a 375 px iPhone = 300 px CSS pixels; the home cards at 100vw
//    on the same device = 343 px after padding).
// -  800 covers 2x mobile + 1x small-desktop columns.
// - 1600 covers 1x large-desktop hero + 2x tablet.
// - max  (~2000) remains the desktop-2x / detail-page candidate.
const RESPONSIVE_WIDTHS = [400, 800, 1600];

const SOURCE_EXTS = new Set([".jpg", ".jpeg", ".png"]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (SOURCE_EXTS.has(extname(e.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

async function fileMtime(p) {
  try {
    return (await stat(p)).mtimeMs;
  } catch {
    return -1;
  }
}

async function isStale(targetPath, sourceMtime) {
  const t = await fileMtime(targetPath);
  return t < sourceMtime;
}

/**
 * Encode `src` into `target` at format `format`, downscaling the
 * pipeline to `width` (or MAX_WIDTH if width === null) without
 * enlarging. When the source is narrower than the target width, sharp
 * keeps the source width — the output file is a same-resolution
 * encode at the variant name. This is wasteful per byte (the -1600
 * file for a 900px source is roughly the same content as the max
 * variant) but eliminates 404s on the <picture srcSet> path inside
 * OptimizedImage. Browsers tolerate 404s in srcSet by falling through,
 * but they appear as errors in DevTools / Lighthouse audits, and the
 * fetch attempt itself contends with critical-path bytes.
 */
async function encode(src, target, format, width) {
  const targetWidth = width ?? MAX_WIDTH;
  const pipeline = sharp(src, { failOn: "error" })
    .rotate()
    .resize({ width: targetWidth, withoutEnlargement: true });
  if (format === "avif") {
    await pipeline
      .avif({ quality: AVIF_QUALITY, effort: AVIF_EFFORT })
      .toFile(target);
  } else {
    await pipeline.webp({ quality: WEBP_QUALITY }).toFile(target);
  }
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Two sources in the same directory with the same basename but
 * different extensions (e.g. foo.png and foo.jpg) would both want to
 * emit `foo.avif` / `foo.webp` — whichever gets processed last wins,
 * and the resulting AVIF doesn't necessarily match the source the
 * site actually references. This is a real foot-gun: the live site
 * can end up serving the wrong image content even though the <img>
 * src looks correct, because the browser picks the AVIF source first.
 *
 * Error out loud on the first collision rather than silently writing
 * potentially-wrong output. The fix is for the caller to delete the
 * orphan source they don't want — typically the older one left over
 * from a content refresh.
 */
function assertNoBasenameCollisions(sources) {
  const seen = new Map();
  for (const src of sources) {
    const base = src.slice(0, -extname(src).length);
    const prior = seen.get(base);
    if (prior) {
      throw new Error(
        `Source basename collision — both files would emit the same .avif / .webp variants:\n  ${prior}\n  ${src}\n` +
          `Delete the source you don't want before re-running.`,
      );
    }
    seen.set(base, src);
  }
}

async function main() {
  const sources = await walk(ROOT);
  assertNoBasenameCollisions(sources);
  let totalSource = 0;
  let totalAvif = 0;
  let totalWebp = 0;
  let processed = 0;
  let skipped = 0;

  for (const src of sources) {
    const base = src.slice(0, -extname(src).length);
    const srcStat = await stat(src);
    const srcMtime = srcStat.mtimeMs;
    totalSource += srcStat.size;

    // Build the full list of variants to emit for this source.
    // null width = the max-width default (no -<width> suffix).
    const targets = [
      { width: null, avif: `${base}.avif`, webp: `${base}.webp` },
      ...RESPONSIVE_WIDTHS.map((w) => ({
        width: w,
        avif: `${base}-${w}.avif`,
        webp: `${base}-${w}.webp`,
      })),
    ];

    let didWork = false;
    for (const t of targets) {
      const [avifStale, webpStale] = await Promise.all([
        isStale(t.avif, srcMtime),
        isStale(t.webp, srcMtime),
      ]);
      if (avifStale) {
        await encode(src, t.avif, "avif", t.width);
        didWork = true;
      }
      if (webpStale) {
        await encode(src, t.webp, "webp", t.width);
        didWork = true;
      }
    }

    // Total up the bytes of the max variant only — that's the headline
    // savings number. Per-width breakdown is in the per-file log below.
    const [avifStat, webpStat] = await Promise.all([
      stat(targets[0].avif).catch(() => null),
      stat(targets[0].webp).catch(() => null),
    ]);
    if (avifStat) totalAvif += avifStat.size;
    if (webpStat) totalWebp += webpStat.size;

    if (didWork) {
      processed++;
      const rel = src.replace(ROOT, "").replace(/\\/g, "/");
      const avifSize = avifStat ? fmtBytes(avifStat.size) : "—";
      const webpSize = webpStat ? fmtBytes(webpStat.size) : "—";
      console.log(
        `  ${rel.padEnd(56)} ${fmtBytes(srcStat.size).padStart(9)} → AVIF ${avifSize.padStart(9)}  WebP ${webpSize.padStart(9)}`,
      );
    } else {
      skipped++;
    }
  }

  console.log("");
  console.log(
    `Done. Encoded ${processed} source(s), skipped ${skipped} up-to-date.`,
  );
  console.log(
    `Total source:    ${fmtBytes(totalSource).padStart(12)}  (${sources.length} files)`,
  );
  console.log(
    `Total AVIF max:  ${fmtBytes(totalAvif).padStart(12)}  (-${(((totalSource - totalAvif) / totalSource) * 100).toFixed(1)}%)`,
  );
  console.log(
    `Total WebP max:  ${fmtBytes(totalWebp).padStart(12)}  (-${(((totalSource - totalWebp) / totalSource) * 100).toFixed(1)}%)`,
  );
  console.log(`Plus -400, -800, -1600 variants per source.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
