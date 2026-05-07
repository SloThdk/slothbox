// Root layout. Wraps every route with:
//   - <html> + class wiring (dark by default, OS pref or `.light` toggles light)
//   - Inter (sans), Playfair Display (display serif), JetBrains Mono (mono)
//   - Sonner toaster
//   - Header and Footer (shared chrome)
//
// `next/font/google` ships the fonts as CSS variables, which `globals.css`
// surfaces to Tailwind via `@theme`'s `--font-family-*` tokens.

import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";
import { headers } from "next/headers";
import { Toaster } from "sonner";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { APP_NAME, APP_TAGLINE, PUBLIC_URL } from "@/lib/config";
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
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  weight: ["500", "600", "700"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
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
    "GDPR",
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
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
  ],
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
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Hint browsers that support h3 about HTTP/3 availability. */}
        <meta httpEquiv="x-dns-prefetch-control" content="on" />
      </head>
      <body className="flex min-h-screen flex-col font-sans antialiased" data-nonce={nonce}>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
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
      </body>
    </html>
  );
}
