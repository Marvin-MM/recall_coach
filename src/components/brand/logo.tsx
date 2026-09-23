import Image from "next/image";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

type Tone = "auto" | "light" | "dark";

/**
 * Recall wordmark. `auto` swaps with the theme via CSS (no hydration flash);
 * `light` = white mark for dark surfaces (e.g. the deep hero band),
 * `dark` = ink mark for light surfaces.
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
  // In `auto` mode one image is display:none per theme, so the name lives on
  // the wrapper and both images are decorative.
  const auto = tone === "auto";
  const common = { alt: auto ? "" : siteConfig.name, height: 160, priority } as const;
  return (
    <span
      className={cn("relative inline-flex h-7 items-center", className)}
      {...(auto ? { role: "img", "aria-label": siteConfig.name } : {})}
    >
      {(tone === "auto" || tone === "dark") && (
        <Image
          {...common}
          src="/brand/logo-light.png"
          width={389}
          className={cn("h-full w-auto", tone === "auto" && "dark:hidden")}
        />
      )}
      {(tone === "auto" || tone === "light") && (
        <Image
          {...common}
          src="/brand/logo-dark.png"
          width={425}
          className={cn("h-full w-auto", tone === "auto" && "hidden dark:block")}
        />
      )}
    </span>
  );
}

/** Mark only (rings), for compact spots. */
export function LogoMark({ tone = "auto", className }: { tone?: Tone; className?: string }) {
  return (
    <span className={cn("relative inline-flex size-7", className)}>
      {(tone === "auto" || tone === "dark") && (
        <Image
          src="/brand/mark-ink.png"
          alt=""
          width={192}
          height={192}
          className={cn("size-full", tone === "auto" && "dark:hidden")}
        />
      )}
      {(tone === "auto" || tone === "light") && (
        <Image
          src="/brand/mark-white.png"
          alt=""
          width={192}
          height={192}
          className={cn("size-full", tone === "auto" && "hidden dark:block")}
        />
      )}
    </span>
  );
}
