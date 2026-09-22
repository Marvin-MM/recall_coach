import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-lg space-y-3 px-4 py-24 text-sm">
      <p className="font-mono text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">The link may be old, or the page has moved.</p>
      <Link href="/" className="text-link underline">
        Go to the home page
      </Link>
    </main>
  );
}
