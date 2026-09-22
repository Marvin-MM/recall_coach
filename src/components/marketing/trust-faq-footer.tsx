import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { siteConfig } from "@/config/site";
import { LiveStatus } from "./live-status";
import { Section } from "./sections";

export function Trust({ accountUrl }: { accountUrl: string }) {
  return (
    <Section id="privacy-and-trust" title="Where your memories live">
      <div className="grid gap-10 md:grid-cols-[1.4fr_1fr]">
        <div className="max-w-[62ch] space-y-4 leading-relaxed">
          <p>
            Each note is encrypted with Seal and stored on <strong>Walrus Mainnet</strong>, a
            decentralized storage network. Your notes live in a namespace derived on our server from
            your account, so no one can ask for someone else's memories by changing a request.
          </p>
          <p>
            We keep only bookkeeping in our own database — when a note was saved, its blob id and
            its kind. Conversation transcripts are never stored on our servers; you can export yours
            as Markdown from the chat.
          </p>
          <p className="border-l-2 border-warning-foreground/60 bg-warning px-3 py-2 text-sm text-warning-foreground">
            Walrus storage is immutable: “forget” hides a memory from the coach but cannot erase the
            stored blob.
          </p>
          <p className="text-sm">
            <Link href="/privacy" className="text-link underline">
              Read the privacy details
            </Link>{" "}
            ·{" "}
            <a
              href={accountUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-link underline"
            >
              View the memory account on a Sui explorer
            </a>
          </p>
        </div>
        <div className="space-y-3 border border-border bg-card p-4">
          <h3 className="text-sm font-medium">Live status</h3>
          <LiveStatus />
          <a href="/api/health" className="text-xs text-link underline">
            Raw health check
          </a>
        </div>
      </div>
    </Section>
  );
}

const FAQ = [
  {
    q: "What does it remember, exactly?",
    a: "Short notes such as your target role, interview date, learning style, specific mistakes, strengths and improvements. Not your full conversation.",
  },
  {
    q: "Can I practise without it remembering?",
    a: "Yes. Turn on “Start without memory” before a session. Amnesia Mode recalls nothing and saves nothing, which is also a handy way to compare.",
  },
  {
    q: "Which AI model is it?",
    a: "Qwen 3.8 27B running on Groq, called through the Vercel AI SDK. Memory is handled by Walrus Memory, not by the model provider.",
  },
  {
    q: "Can I delete a memory?",
    a: "Not yet in a way that erases it: Walrus blobs are immutable. We document this openly and are tracking a proper “forget” as a feature request.",
  },
  {
    q: "What if memory is down?",
    a: "Coaching continues. You'll see a notice that memory is temporarily unavailable, and the coach won't pretend to remember anything.",
  },
];

export function Faq() {
  return (
    <Section id="faq" title="Questions">
      <Accordion type="single" collapsible className="max-w-3xl">
        {FAQ.map((item) => (
          <AccordionItem key={item.q} value={item.q}>
            <AccordionTrigger className="text-sm">{item.q}</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">{item.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  );
}

export function SiteFooter() {
  const links = [
    { href: siteConfig.links.github, label: "GitHub" },
    { href: siteConfig.links.article, label: "Article" },
    { href: siteConfig.links.x, label: "X" },
  ].filter((l) => l.href);
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <p className="mr-auto">
          {siteConfig.name} — built for {siteConfig.hackathon}.
        </p>
        <Link href="/privacy" className="hover:text-link">
          Privacy
        </Link>
        {links.map((l) => (
          <a
            key={l.label}
            href={l.href}
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-link"
          >
            {l.label}
          </a>
        ))}
      </div>
    </footer>
  );
}
