/**
 * TEST-ONLY sign-in for Playwright. In production builds `NODE_ENV` is inlined
 * as "production", so the handler body below the guard is dead code and the
 * auth helpers are never bundled. Outside production it also requires
 * E2E_AUTH_SECRET (header `x-e2e-secret`). Any failure is an opaque 404.
 */
export const runtime = "nodejs";

const notFound = () => new Response(null, { status: 404 });

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") return notFound();

  const { isAuthorizedE2eRequest, e2eSignIn, e2eSignInSchema } = await import("@/server/auth/e2e");
  if (!isAuthorizedE2eRequest(request)) return notFound();

  const parsed = e2eSignInSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });

  const result = await e2eSignIn(parsed.data);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
