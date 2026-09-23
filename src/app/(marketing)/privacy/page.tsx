import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { env } from "@/env";

export const metadata: Metadata = {
  title: "Privacy",
  description: `How ${siteConfig.name} stores coaching memories on Walrus and what it never stores.`,
};

export default function PrivacyPage() {
  const accountUrl = `${env.NEXT_PUBLIC_SUI_EXPLORER_OBJECT_URL}${env.MEMWAL_ACCOUNT_ID}`;
  return (
    <article className="mx-auto max-w-[68ch] space-y-8 px-4 pt-28 pb-16 leading-relaxed sm:px-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy and memory</h1>
        <p className="text-muted-foreground">
          What {siteConfig.name} remembers, where it lives, and what it never keeps.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">What we store, and where</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Your account</strong> (Google name, email, profile picture) in our Postgres
            database, to sign you in. We request only the{" "}
            <code className="font-mono text-sm">openid email profile</code> scopes.
          </li>
          <li>
            <strong>Coaching memories</strong> — short notes such as your target role, interview
            date, learning style, mistakes, strengths and improvements — encrypted with Seal and
            stored on Walrus Mainnet through the Walrus Memory relayer. Only this coach's delegate
            key can decrypt them.
          </li>
          <li>
            <strong>Bookkeeping</strong> in our database: when a memory was saved, its kind, its
            Walrus blob id and whether it succeeded. Never the memory text.
          </li>
          <li>
            <strong>Session metadata</strong>: mode, a generic title such as “Mock interview · 22
            Sep”, turn count and timestamps.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">What we never store</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Conversation transcripts. Your chat lives in your browser tab; use “Export conversation”
            to keep a copy.
          </li>
          <li>
            Secrets, credentials, contact details or information about other people. The memory
            extractor is instructed to skip these, and anything that looks like an instruction to
            the AI is dropped before saving.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">Your controls</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Consent first</strong>: nothing is saved until you agree during setup.
          </li>
          <li>
            <strong>Amnesia Mode</strong>: start any session without memory — nothing is recalled or
            saved.
          </li>
          <li>
            <strong>See everything</strong>: “What I remember” shows every note the coach can
            recall, each linked to its blob on a Walrus explorer.
          </li>
        </ul>
        <p className="border-l-2 border-warning-foreground/60 bg-warning px-3 py-2 text-sm text-warning-foreground">
          Walrus storage is immutable. Deleting your account removes our database records and stops
          the coach from recalling your notes, but it cannot erase blobs already written to Walrus.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">Isolation</h2>
        <p>
          Memory namespaces are derived on our server from your internal account id. Requests can't
          choose a namespace, user id or account id. This is an organizational boundary enforced by
          our server, not a cryptographic one — all notes are encrypted under this app's Walrus
          Memory account.
        </p>
        <p>
          <a
            href={accountUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-link underline"
          >
            The Walrus Memory account on a Sui explorer
          </a>
        </p>
      </section>
    </article>
  );
}
