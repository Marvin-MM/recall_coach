"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";
import { NavCoachButton } from "./nav-coach-button";
import { OpenCoachButton } from "./open-coach-button";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#what-it-remembers", label: "Memory" },
  { href: "/#privacy-and-trust", label: "Security" },
  { href: "/#faq", label: "FAQ" },
];

/**
 * Transparent over the deep hero on the landing page; after scrolling it
 * becomes a floating bar that matches the band beneath it (`data-band="deep"`
 * sections keep it dark in either theme).
 */
export function SiteHeader() {
  const pathname = usePathname();
  const overHero = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [overDeep, setOverDeep] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > 24);
      // Match the bar to the band beneath it (deep bands stay dark in either theme).
      const under = document
        .elementsFromPoint(window.innerWidth / 2, 40)
        .find((el) => !el.closest("header"));
      setOverDeep(Boolean(under?.closest("[data-band='deep']")));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const transparent = overHero && !scrolled;
  const deep = transparent || overDeep;

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-4">
      <div
        className={cn(
          "pointer-events-auto mx-auto flex h-14 max-w-6xl items-center gap-2 border px-3 transition-[background-color,border-color,box-shadow] duration-300 sm:px-4",
          transparent
            ? "deep border-white/10 bg-transparent"
            : deep
              ? "deep border-white/10 bg-[#050b14]/75 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.6)] backdrop-blur-md"
              : "border-border bg-background/85 shadow-[0_8px_30px_-12px_rgb(11_15_20/0.25)] backdrop-blur-md supports-[backdrop-filter]:bg-background/70",
        )}
      >
        <Link
          href="/"
          aria-label={`${siteConfig.name} home`}
          className="mr-auto flex items-center py-2"
        >
          <Logo tone={deep ? "light" : "auto"} className="h-6 sm:h-7" priority />
        </Link>

        <nav aria-label="Main" className="hidden items-center md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "px-3 py-2 text-sm transition-colors",
                deep
                  ? "text-white/70 hover:text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 md:ml-4">
          <ThemeToggle />
          <div className="hidden sm:block">
            <NavCoachButton />
          </div>
          <OpenCoachButton className="hidden h-9 px-4 text-sm sm:inline-flex">
            Start practicing
          </OpenCoachButton>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(20rem,100vw)] gap-0">
              <SheetHeader className="border-b border-border">
                <SheetTitle>
                  <Logo className="h-6" />
                </SheetTitle>
                <SheetDescription>The interview coach that remembers.</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col p-2">
                {NAV.map((item) => (
                  <SheetClose asChild key={item.href}>
                    <Link href={item.href} className="px-3 py-3 text-base hover:bg-muted">
                      {item.label}
                    </Link>
                  </SheetClose>
                ))}
                <SheetClose asChild>
                  <Link href="/privacy" className="px-3 py-3 text-base hover:bg-muted">
                    Privacy
                  </Link>
                </SheetClose>
              </nav>
              <div className="mt-auto grid gap-2 border-t border-border p-4">
                <SheetClose asChild>
                  <OpenCoachButton className="h-11 text-sm">Start practicing</OpenCoachButton>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
