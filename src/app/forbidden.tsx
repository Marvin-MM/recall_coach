import Link from "next/link";

export default function Forbidden() {
  return (
    <main id="main" className="mx-auto max-w-lg space-y-3 px-4 py-24 text-sm">
      <p className="font-mono text-muted-foreground">403</p>
      <h1 className="text-2xl font-semibold">This page is for admins only</h1>
      <p className="text-muted-foreground">
        Your account doesn't have access. If you think it should, ask the project owner to add your
        email to the admin list.
      </p>
      <Link href="/" className="text-link underline">
        Go to the home page
      </Link>
    </main>
  );
}
