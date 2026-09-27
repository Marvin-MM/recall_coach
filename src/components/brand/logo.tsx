import Image from "next/image";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

type Tone = "auto" | "light" | "dark";

/**
 * Wordmark: the ring mark + the product name as live text (so a rename in
 * `siteConfig.name` is the only change needed). `auto` swaps the mark with the
 * theme via CSS (no hydration flash); `light` = white for dark surfaces (the
 * deep hero band), `dark` = ink for light surfaces.
 */
export function Logo({
  tone = "auto",
  className,
  priority = false,
}: {
  tone?: Tone;
  className?: string;
  priority?: boolean;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex h-7 items-center gap-1.5 font-semibold leading-none tracking-[-0.03em]",
        tone === "light" ? "text-white" : tone === "dark" ? "text-ink" : "text-foreground",
        className,
      )}
    >
      <LogoMark tone={tone} className="aspect-square h-full w-auto" priority={priority} />
      <span className="text-[1.25em]">{siteConfig.name}</span>
    </span>
  );
}

/** Mark only (rings), for compact spots. */
export function LogoMark({
  tone = "auto",
  className,
  priority = false,
}: {
  tone?: Tone;
  className?: string;
  priority?: boolean;
}) {
  return (
    <span className={cn("relative inline-flex size-7", className)}>
      {(tone === "auto" || tone === "dark") && (
        <Image
          src="/brand/mark-ink.png"
          alt=""
          priority={priority}
          width={192}
          height={192}
          className={cn("size-full", tone === "auto" && "dark:hidden")}
        />
      )}
      {(tone === "auto" || tone === "light") && (
        <Image
          src="/brand/mark-white.png"
          alt=""
          priority={priority}
          width={192}
          height={192}
          className={cn("size-full", tone === "auto" && "hidden dark:block")}
        />
      )}
    </span>
  );
}
