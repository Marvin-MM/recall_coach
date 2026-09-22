"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { signInWithGoogle } from "@/lib/auth-client";

const EXAMPLES = [
  { kind: "Mistake", text: "Skipped the Result in a STAR answer about a missed deadline." },
  { kind: "Goal", text: "Backend engineer interview at a payments company on 15 Oct." },
  { kind: "Learns best", text: "Examples first, concise feedback." },
];

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z"
      />
    </svg>
  );
}

export function SignInCard({ callbackPath }: { callbackPath: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    try {
      const res = await signInWithGoogle(callbackPath);
      if (res.error) throw new Error(res.error.message ?? "Sign-in failed");
    } catch {
      setError("Couldn't reach Google sign-in. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5 text-sm">
      <div className="space-y-2">
        <h3 className="text-lg font-medium leading-snug">
          A coach that picks up where you left off.
        </h3>
        <p className="text-muted-foreground">
          Sign in so I can remember your target role, how you like to learn and what tripped you up
          last time — on any device.
        </p>
      </div>

      <figure className="space-y-2">
        <figcaption className="text-xs text-muted-foreground">
          The kind of notes I keep (example):
        </figcaption>
        <ul className="space-y-1.5">
          {EXAMPLES.map((e) => (
            <li key={e.kind} className="border-l-2 border-link bg-card py-1.5 pr-2 pl-3">
              <span className="text-xs text-muted-foreground">{e.kind}</span>
              <p>{e.text}</p>
            </li>
          ))}
        </ul>
      </figure>

      <div className="mt-auto space-y-2">
        <Button className="h-10 w-full text-sm" onClick={signIn} disabled={pending}>
          <GoogleMark />
          {pending ? "Opening Google…" : "Continue with Google"}
        </Button>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          We only ask Google for your name and email.{" "}
          <Link href="/privacy" className="text-link underline">
            How memory and privacy work
          </Link>
        </p>
      </div>
    </div>
  );
}
