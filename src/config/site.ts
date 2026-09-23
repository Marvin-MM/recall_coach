/** Product identity. Rename the app here; nothing else hard-codes the name. */
export const siteConfig = {
  name: "Recall",
  tagline: "The interview coach that remembers your last mistake.",
  description:
    "Practice with an AI coach that remembers your target role, how you learn, and what tripped you up — across every session and device. Memory stored encrypted on Walrus.",
  /** Cookie prefix for Better Auth cookies (kept stable across renames). */
  authCookiePrefix: "recall",
  links: {
    github: "https://github.com/",
    article: "",
    x: "",
  },
} as const;

export type StackItem = {
  name: string;
  role: string;
  href: string;
  /** Layer in the memory path, used for grouping in the UI. */
  layer: "memory" | "network" | "intelligence";
};

/**
 * The infrastructure Recall runs on. Names only (no third-party logos):
 * these are technologies we build on, not endorsements.
 */
export const stack: readonly StackItem[] = [
  {
    name: "Walrus Memory",
    role: "Memory layer — recall, remember, encrypted notes",
    href: "https://memory.walrus.xyz",
    layer: "memory",
  },
  {
    name: "Walrus",
    role: "Decentralized storage for every memory blob",
    href: "https://www.walrus.xyz",
    layer: "memory",
  },
  {
    name: "Seal",
    role: "Encryption and access policy for memories",
    href: "https://seal.mystenlabs.com",
    layer: "network",
  },
  {
    name: "Sui",
    role: "The network that owns and secures it all",
    href: "https://sui.io",
    layer: "network",
  },
  {
    name: "Qwen on Groq",
    role: "Fast open-weight model for coaching",
    href: "https://groq.com",
    layer: "intelligence",
  },
  {
    name: "Vercel AI SDK",
    role: "Streaming chat and structured extraction",
    href: "https://ai-sdk.dev",
    layer: "intelligence",
  },
];

export type SiteConfig = typeof siteConfig;
