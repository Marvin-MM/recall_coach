"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { blobExplorerUrl } from "@/config/public-env";
import { cn } from "@/lib/utils";
import { shortBlobId } from "./kind-meta";

/** Truncated Walrus blob id in mono, with copy + explorer link. */
export function BlobId({ blobId, className }: { blobId: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(blobId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (permissions) — the full id is in the title attribute
    }
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground",
        className,
      )}
    >
      <span title={blobId}>{shortBlobId(blobId)}</span>
      <button
        type="button"
        onClick={copy}
        className="inline-flex size-6 items-center justify-center hover:text-foreground"
        aria-label={copied ? "Blob id copied" : "Copy blob id"}
      >
        {copied ? (
          <Check className="size-3" aria-hidden />
        ) : (
          <Copy className="size-3" aria-hidden />
        )}
      </button>
      <a
        href={blobExplorerUrl(blobId)}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex size-6 items-center justify-center hover:text-link"
        aria-label="View blob on Walruscan (opens in a new tab)"
      >
        <ExternalLink className="size-3" aria-hidden />
      </a>
    </span>
  );
}
