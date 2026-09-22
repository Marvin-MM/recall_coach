import { afterEach, describe, expect, it, vi } from "vitest";

describe("E2E sign-in route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is a 404 in production builds and never loads the auth helpers", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const loaded = vi.fn();
    vi.doMock("@/server/auth/e2e", () => {
      loaded();
      return {};
    });
    const { POST } = await import("@/app/api/test/e2e-sign-in/route");
    const res = await POST(
      new Request("http://localhost/api/test/e2e-sign-in", {
        method: "POST",
        headers: { "x-e2e-secret": "anything" },
        body: JSON.stringify({ email: "a@b.co" }),
      }),
    );
    expect(res.status).toBe(404);
    expect(loaded).not.toHaveBeenCalled();
  });

  it("is a 404 without the right secret outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.doMock("@/server/auth/e2e", () => ({
      isAuthorizedE2eRequest: () => false,
      e2eSignIn: vi.fn(),
      e2eSignInSchema: { safeParse: vi.fn() },
    }));
    const { POST } = await import("@/app/api/test/e2e-sign-in/route");
    const res = await POST(
      new Request("http://localhost/api/test/e2e-sign-in", { method: "POST" }),
    );
    expect(res.status).toBe(404);
  });
});
