import Link from "next/link";
import { siteConfig } from "@/config/site";
import { NavCoachButton } from "./nav-coach-button";
import { ThemeToggle } from "./theme-toggle";

export function SiteNav() {
  return (
    <header className="border-b border-border">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-4 text-sm sm:gap-4 sm:px-6"
      >
        <Link href="/" className="mr-auto flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="inline-block size-3 bg-primary ring-1 ring-ink" />
          {siteConfig.name}
        </Link>
        <Link href="/#how-it-works" className="hidden px-2 py-1 hover:text-link sm:inline">
          How it works
        </Link>
        <Link href="/privacy" className="px-2 py-1 hover:text-link">
          Privacy
        </Link>
        <ThemeToggle />
        <NavCoachButton />
      </nav>
    </header>
  );
}
