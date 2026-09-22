import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  accountIdSchema,
  adminEmailsSchema,
  clientSchema,
  crossFieldProblems,
  delegateKeySchema,
  groqModelSchema,
  httpsUrlSchema,
  looksLikeSecret,
  MAINNET_RELAYER_URL,
} from "@/lib/env-schemas";

const HEX64 = "a".repeat(64);

describe("delegateKeySchema", () => {
  it("accepts a 64-char hex seed, with or without 0x", () => {
    expect(delegateKeySchema.parse(HEX64)).toBe(HEX64);
    expect(delegateKeySchema.parse(`0x${HEX64}`)).toBe(HEX64);
  });

  it("rejects suiprivkey… values with an owner-vs-delegate explanation", () => {
    const result = delegateKeySchema.safeParse(`suiprivkey1${"q".repeat(58)}`);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/DELEGATE key/);
    expect(result.error?.issues[0]?.message).toMatch(/owner/);
  });

  it("rejects wrong length and non-hex", () => {
    expect(delegateKeySchema.safeParse("ab".repeat(16)).success).toBe(false);
    expect(delegateKeySchema.safeParse("z".repeat(64)).success).toBe(false);
  });
});

describe("groqModelSchema", () => {
  it("accepts qwen/qwen3.8-27b", () => {
    expect(groqModelSchema.parse("qwen/qwen3.8-27b")).toBe("qwen/qwen3.8-27b");
  });

  it.each(["openai/gpt-oss-120b", "openai/gpt-oss-20b", "gpt-4o", "claude-opus", "anthropic/x"])(
    "rejects %s",
    (model) => {
      expect(groqModelSchema.safeParse(model).success).toBe(false);
    },
  );
});

describe("accountIdSchema", () => {
  it("accepts 0x ids and rejects others", () => {
    expect(accountIdSchema.safeParse(`0x${"c3".repeat(32)}`).success).toBe(true);
    expect(accountIdSchema.safeParse("c3ad").success).toBe(false);
    expect(accountIdSchema.safeParse(`0x${"g".repeat(4)}`).success).toBe(false);
    expect(accountIdSchema.safeParse(`0x${"a".repeat(65)}`).success).toBe(false);
  });
});

describe("httpsUrlSchema", () => {
  it("requires https", () => {
    expect(httpsUrlSchema.safeParse("http://relayer.example").success).toBe(false);
    expect(httpsUrlSchema.safeParse(MAINNET_RELAYER_URL).success).toBe(true);
  });
});

describe("adminEmailsSchema", () => {
  it("splits, trims and lowercases", () => {
    expect(adminEmailsSchema.parse(" A@x.com, b@y.org ,")).toEqual(["a@x.com", "b@y.org"]);
  });
  it("rejects invalid emails", () => {
    expect(adminEmailsSchema.safeParse("not-an-email").success).toBe(false);
  });
});

describe("NEXT_PUBLIC_* secret guard", () => {
  const client = z.object(clientSchema);
  const good = {
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_WALRUS_EXPLORER_BLOB_URL: "https://walruscan.com/mainnet/blob/",
    NEXT_PUBLIC_SUI_EXPLORER_OBJECT_URL: "https://suiscan.xyz/mainnet/object/",
  };

  it("accepts plain public URLs", () => {
    expect(client.safeParse(good).success).toBe(true);
  });

  it("rejects a public URL that embeds a secret", () => {
    const bad = { ...good, NEXT_PUBLIC_APP_URL: `https://example.com/?k=gsk_${"A".repeat(40)}` };
    expect(client.safeParse(bad).success).toBe(false);
  });

  it("requires explorer prefixes to end with '/'", () => {
    const bad = {
      ...good,
      NEXT_PUBLIC_SUI_EXPLORER_OBJECT_URL: "https://suiscan.xyz/mainnet/object",
    };
    expect(client.safeParse(bad).success).toBe(false);
  });

  it("detects common secret shapes", () => {
    expect(looksLikeSecret(HEX64)).toBe(true);
    expect(looksLikeSecret("GOCSPX-abc")).toBe(true);
    expect(looksLikeSecret("https://walruscan.com/mainnet/blob/")).toBe(false);
  });
});

describe("crossFieldProblems (production rules)", () => {
  it("is a no-op outside production", () => {
    expect(crossFieldProblems({ NODE_ENV: "development", MEMORY_DRIVER: "fake" })).toEqual([]);
  });

  it("locks the relayer to mainnet in production unless explicitly allowed", () => {
    expect(
      crossFieldProblems({ NODE_ENV: "production", MEMWAL_SERVER_URL: "https://other.example" }),
    ).toHaveLength(1);
    expect(
      crossFieldProblems({
        NODE_ENV: "production",
        MEMWAL_SERVER_URL: "https://other.example",
        ALLOW_CUSTOM_RELAYER: true,
      }),
    ).toEqual([]);
    expect(
      crossFieldProblems({ NODE_ENV: "production", MEMWAL_SERVER_URL: `${MAINNET_RELAYER_URL}/` }),
    ).toEqual([]);
  });

  it("rejects test-only drivers and the E2E secret in production", () => {
    const problems = crossFieldProblems({
      NODE_ENV: "production",
      MEMWAL_SERVER_URL: MAINNET_RELAYER_URL,
      MEMORY_DRIVER: "fake",
      LLM_DRIVER: "fake",
      E2E_AUTH_SECRET: "x".repeat(20),
    });
    expect(problems).toHaveLength(3);
  });
});
