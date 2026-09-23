import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { AppProviders } from "@/components/providers/app-providers";
import { siteConfig } from "@/config/site";
import { env } from "@/env";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: [
    "interview coach",
    "AI interview practice",
    "chatbot that remembers",
    "mock interview",
    "STAR method",
    "Walrus Memory",
  ],
  openGraph: {
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  manifest: "/site.webmanifest",
  icons: {
    // The mark is white on transparent; light browser chrome gets an ink variant.
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      {
        url: "/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/brand/icon-ink-32.png",
        sizes: "32x32",
        type: "image/png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/brand/icon-ink-16.png",
        sizes: "16x16",
        type: "image/png",
        media: "(prefers-color-scheme: light)",
      },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#050b14" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:bg-card focus:px-3 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
