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
  hackathon: "Walrus Foundation — Chatbots That Remember",
} as const;

export type SiteConfig = typeof siteConfig;
