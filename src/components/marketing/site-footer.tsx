import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { siteConfig, stack } from "@/config/site";
import { OpenCoachButton } from "./open-coach-button";

const PRODUCT = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#what-it-remembers", label: "What it remembers" },
  { href: "/#before-after", label: "With vs without memory" },
  { href: "/#faq", label: "FAQ" },
];

const TRUST = [
  { href: "/privacy", label: "Privacy" },
  { href: "/#privacy-and-trust", label: "Where memories live" },
  { href: "/api/health", label: "System status" },
];

/** Only real, configured profile links (a bare host is not a link to us). */
const SOCIAL = [
  { href: siteConfig.links.github, label: "GitHub" },
  { href: siteConfig.links.article, label: "Article" },
  { href: siteConfig.links.x, label: "X" },
].filter((l) => l.href && new URL(l.href).pathname.length > 1);

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-mono text-[11px] tracking-[0.16em] text-white/50 uppercase">{title}</h2>
      <ul className="mt-4 space-y-2.5 text-sm">{children}</ul>
    </div>
  );
}

const linkCls = "text-white/75 transition-colors hover:text-white";

export function SiteFooter() {
  return (
    <footer data-band="deep" className="deep relative isolate overflow-hidden">
      <div
        aria-hidden
        className="blueprint-grid absolute inset-0 -z-10 opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(29_78_216/0.45),transparent_70%)]"
      />

      {/* CTA band */}
      <div className="mx-auto max-w-6xl px-4 pt-20 pb-16 sm:px-6">
        <div className="relative flex flex-col gap-8 overflow-hidden border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm sm:p-10 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl space-y-3">
            <p className="font-mono text-[11px] tracking-[0.18em] text-link uppercase">
              Start today
            </p>
            <p className="text-3xl font-semibold tracking-[-0.025em] text-balance text-white sm:text-4xl">
              Your next session starts where the last one left off.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <OpenCoachButton className="h-11 px-5 text-sm">Start practicing</OpenCoachButton>
            <Link
              href="/privacy"
              className="inline-flex h-11 items-center border border-white/55 px-5 text-sm text-white/80 transition-colors hover:border-white/60 hover:text-white"
            >
              How your data is kept
            </Link>
          </div>

          {/* Mascot — peeking up from the bottom-right corner */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-4 -bottom-6 hidden sm:block"
          >
            <Image
              src="/callback.png"
              alt=""
              width={200}
              height={200}
              className="h-44 w-auto select-none opacity-90 drop-shadow-[0_-8px_24px_rgb(77_162_255/0.25)]"
              draggable={false}
              priority={false}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div className="space-y-4">
          <Link href="/" aria-label={`${siteConfig.name} home`} className="inline-flex">
            <Logo tone="light" className="h-7" />
          </Link>
          <p className="max-w-[34ch] text-sm leading-relaxed text-white/65">{siteConfig.tagline}</p>
          <p className="inline-flex items-center gap-2 border border-white/10 px-2.5 py-1 font-mono text-[11px] text-white/70">
            <span aria-hidden className="size-1.5 bg-[#97f0e5]" />
            Memories on Walrus Mainnet
          </p>
        </div>

        <Column title="Product">
          {PRODUCT.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={linkCls}>
                {l.label}
              </Link>
            </li>
          ))}
        </Column>

        <Column title="Trust">
          {TRUST.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={linkCls}>
                {l.label}
              </Link>
            </li>
          ))}
        </Column>

        <Column title="Built on">
          {stack.map((s) => (
            <li key={s.name}>
              <a
                href={s.href}
                target="_blank"
                rel="noreferrer noopener"
                title={s.role}
                className={`group inline-flex items-center gap-1 ${linkCls}`}
              >
                {s.name}
                <ArrowUpRight
                  className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  aria-hidden
                />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          ))}
        </Column>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-white/55 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} {siteConfig.name}. Memory by Walrus Memory · Storage by
            Walrus · Secured by Sui.
          </p>
          {SOCIAL.length > 0 && (
            <ul className="flex gap-5">
              {SOCIAL.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="hover:text-white"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </footer>
  );
}
