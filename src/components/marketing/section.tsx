import { cn } from "@/lib/utils";

/** Landing-page section shell: eyebrow + heading + intro, consistent rhythm. */
export function Section({
  id,
  eyebrow,
  title,
  intro,
  align = "start",
  className,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  align?: "start" | "center";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-20", className)}>
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-20 sm:px-6 sm:py-24">
        <div className={cn("max-w-2xl space-y-3", align === "center" && "mx-auto text-center")}>
          {eyebrow && (
            <p className="font-mono text-[11px] tracking-[0.18em] text-link uppercase">{eyebrow}</p>
          )}
          <h2
            id={`${id}-title`}
            className="text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl"
          >
            {title}
          </h2>
          {intro && (
            <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{intro}</p>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}
