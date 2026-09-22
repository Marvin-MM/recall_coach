import { cn } from "@/lib/utils";

/** Small status pill: whether memory is on for the current view. */
export function MemoryStatusBadge({
  state,
  className,
}: {
  state: "on" | "off" | "saving";
  className?: string;
}) {
  const label =
    state === "on" ? "Memory on" : state === "saving" ? "Saving to Walrus" : "Amnesia Mode";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-1.5 py-0.5 text-[11px]",
        state === "off"
          ? "border-border bg-muted text-muted-foreground"
          : "border-transparent bg-accent text-accent-foreground",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5",
          state === "off" ? "bg-muted-foreground" : "bg-link",
          state === "saving" && "animate-pulse",
        )}
      />
      {label}
    </span>
  );
}
