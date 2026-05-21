// Root layout. Wraps every route with:
//   - <html> dark-by-default with luminous off-white foreground
//   - Inter (sans, the only display face) + JetBrains Mono (code/hashes)
//   - Sonner toaster (themed to glass)
//   - Header and Footer (shared chrome)
//
// `next/font/google` ships the fonts as CSS variables, which `globals.css`
// surfaces to Tailwind via `@theme`'s `--font-family-*` tokens.
//
// NOTE: Playfair Display was loaded in earlier iterations but the visionOS
// design language is sans-only — the serif italic mid-sentence read as
// editorial-affectation rather than sleek. Removed for a tighter brand.

import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";
import { Toaster } from "sonner";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import { APP_NAME, APP_TAGLINE, PUBLIC_URL } from "@/lib/config";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import "@/styles/globals.css";

// Force every route through the runtime so the per-request nonce minted
// in middleware.ts gets stamped onto Next's emitted <script> tags. With
// the default static prerender, build-time HTML has no nonce attributes,
// CSP rejects every inline script, the page never hydrates, and the
// console fills up with violations. This trade — losing CDN-cacheable
// static HTML in exchange for a strict CSP that actually enforces — is
// the right call for a security-focused product.
export const dynamic = "force-dynamic";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  // Load multiple weights — visionOS uses light to medium across the board.
  // 300 for body, 500 for UI, 600 for display. No bold (700+) anywhere.
  weight: ["300", "400", "500", "600"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_URL),
  title: {
    default: `${APP_NAME} — encrypted file transfer`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_TAGLINE,
  applicationName: APP_NAME,
  keywords: [
    "encrypted file transfer",
    "end-to-end encryption",
    "EU hosted",
    "open source",
    "secure share",
  ],
  authors: [{ name: "Philip Sloth", url: "https://philipsloth.com" }],
  creator: "Philip Sloth",
  // Robots: deliberately allowed to be indexed for the public marketing pages.
  // Receiver pages (`/s/[id]`) emit their own metadata that flips this off.
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    title: APP_NAME,
    description: APP_TAGLINE,
    siteName: APP_NAME,
    locale: "en",
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: APP_TAGLINE,
  },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0a0d14" }],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Pull the per-request nonce from the request headers. Middleware
  // sets x-nonce; we forward it to the React tree so any custom <Script>
  // components can attach the same nonce attribute. Next 15 also reads
  // this header to nonce its own framework scripts during SSR.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        {/* Hint browsers that support h3 about HTTP/3 availability. */}
        <meta httpEquiv="x-dns-prefetch-control" content="on" />
        {/*
          Build SHA stamp. Injected at build time via NEXT_PUBLIC_BUILD_SHA
          (apps/web/Dockerfile + docker-compose.yml). The deploy workflow's
          smoke test grep's for the short SHA in the rendered HTML to catch
          the failure mode where a deploy succeeds at the workflow level
          but ships a stale image — see the 2026-05-08 incident postmortem
          in .github/workflows/deploy.yml. Default "dev" is what local
          builds without an explicit SHA stamp produce, so a curl against
          a dev server doesn't accidentally satisfy the production check.
        */}
        <meta name="x-build-sha" content={process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev"} />
        {/*
          JSON-LD structured data — schema.org @graph with three linked
          entities so search engines can understand what SlothBox is:
            - Organization (the project, founded by Philip Sloth)
            - WebSite (the deployment, bilingual en + da)
            - SoftwareApplication (the open-source product itself)
          Cross-referenced via @id so crawlers (Google, Bing, etc.)
          treat them as one entity-graph rather than three separate
          unrelated objects. Nonce-stamped to satisfy strict CSP.
        */}
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": `${PUBLIC_URL}#organization`,
                  name: APP_NAME,
                  url: PUBLIC_URL,
                  logo: `${PUBLIC_URL}/icon`,
                  founder: {
                    "@type": "Person",
                    "@id": "https://philipsloth.com#person",
                    name: "Philip Sloth",
                    url: "https://philipsloth.com",
                  },
                  sameAs: ["https://github.com/SloThdk/slothbox"],
                },
                {
                  "@type": "WebSite",
                  "@id": `${PUBLIC_URL}#website`,
                  url: PUBLIC_URL,
                  name: APP_NAME,
                  description: APP_TAGLINE,
                  publisher: { "@id": `${PUBLIC_URL}#organization` },
                  inLanguage: ["en", "da"],
                },
                {
                  "@type": "SoftwareApplication",
                  "@id": `${PUBLIC_URL}#software`,
                  name: APP_NAME,
                  url: PUBLIC_URL,
                  applicationCategory: "SecurityApplication",
                  operatingSystem: "Web",
                  offers: {
                    "@type": "Offer",
                    price: "0",
                    priceCurrency: "EUR",
                  },
                  license: "https://opensource.org/licenses/MIT",
                  creator: { "@id": "https://philipsloth.com#person" },
                  codeRepository: "https://github.com/SloThdk/slothbox",
                  description: APP_TAGLINE,
                },
              ],
            }),
          }}
        />
      </head>
      <body className="flex min-h-screen flex-col font-sans antialiased" data-nonce={nonce}>
        {/*
          LanguageProvider wraps EVERY route. It hydrates from
          localStorage / navigator.language on the first client effect,
          so server-rendered HTML is always English (matches the
          `<html lang="en">` we just emitted). The flicker on first
          paint for a Danish-preferring user is intentional — see
          LanguageContext.tsx for the full SSR rationale.
        */}
        <LanguageProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          {/*
            Service-worker registration. Renders nothing — the
            component's only job is to fire `navigator.serviceWorker.register`
            after first paint, in production builds only (the SW is
            skipped in dev because it breaks Next.js HMR). Failure to
            register is silent: the SW is a progressive enhancement
            (offline shell, faster repeat visits), not a hard
            dependency.
          */}
          <RegisterServiceWorker />
          <Toaster
            richColors
            theme="dark"
            position="bottom-right"
            duration={4000}
            toastOptions={{
              style: {
                background: "var(--color-card)",
                borderColor: "var(--color-border)",
                color: "var(--color-fg)",
              },
            }}
          />
        </LanguageProvider>
      </body>
    </html>
  );
}
