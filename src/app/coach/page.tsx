import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/marketing/theme-toggle";
import { CoachWidget } from "@/components/widget/coach-widget";
import { siteConfig } from "@/config/site";
import { getOptionalUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Coach", robots: { index: false } };

export default async function CoachPage() {
  // The proxy only checks that a cookie exists; validate the session for real.
  const user = await getOptionalUser();
  if (!user) redirect("/?signin=1&next=/coach");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-12 items-center gap-2 border-b border-border px-4 text-sm">
        <Link href="/" aria-label={`${siteConfig.name} home`} className="mr-auto flex items-center">
          <Logo className="h-6" priority />
        </Link>
        <ThemeToggle />
      </header>
      <main id="main" className="flex flex-1 p-2 sm:p-4">
        <CoachWidget variant="page" />
      </main>
    </div>
  );
}
