import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createKeyring,
  decryptMessage,
  type EncryptedMessage,
  encryptMessage,
  TranscriptDecryptError,
} from "@/server/transcripts/crypto";

const keyB64 = () => randomBytes(32).toString("base64");
const aad = { userId: "user-1", sessionId: "11111111-1111-4111-8111-111111111111", seq: 3 };

function flip(bytes: Uint8Array, index = 0): Uint8Array {
  const copy = new Uint8Array(bytes);
  copy[index] = (copy[index] ?? 0) ^ 0x01;
  return copy;
}

describe("transcript crypto (AES-256-GCM)", () => {
  const keyring = createKeyring({ currentKey: keyB64(), currentVersion: 1 });

  it("round-trips unicode text and records the key version", () => {
    const text = "Tell me about a time you missed a deadline — résumé 🚀";
    const enc = encryptMessage(keyring, aad, text);
    expect(enc.keyVersion).toBe(1);
    expect(enc.iv).toHaveLength(12);
    expect(enc.authTag).toHaveLength(16);
    expect(Buffer.from(enc.ciphertext).toString("utf8")).not.toContain("deadline");
    expect(decryptMessage(keyring, aad, enc)).toBe(text);
  });

  it("uses a fresh IV per message", () => {
    const a = encryptMessage(keyring, aad, "same");
    const b = encryptMessage(keyring, aad, "same");
    expect(Buffer.from(a.iv).equals(Buffer.from(b.iv))).toBe(false);
    expect(Buffer.from(a.ciphertext).equals(Buffer.from(b.ciphertext))).toBe(false);
  });

  it.each<[string, (e: EncryptedMessage) => EncryptedMessage]>([
    ["ciphertext", (e) => ({ ...e, ciphertext: flip(e.ciphertext) })],
    ["iv", (e) => ({ ...e, iv: flip(e.iv) })],
    ["auth tag", (e) => ({ ...e, authTag: flip(e.authTag) })],
  ])("rejects a tampered %s", (_label, tamper) => {
    const enc = encryptMessage(keyring, aad, "secret answer");
    expect(() => decryptMessage(keyring, aad, tamper(enc))).toThrow(TranscriptDecryptError);
  });

  it.each([
    ["another user", { ...aad, userId: "user-2" }],
    ["another session", { ...aad, sessionId: "22222222-2222-4222-8222-222222222222" }],
    ["another seq", { ...aad, seq: 4 }],
  ])("rejects a row moved to %s (AAD mismatch)", (_label, otherAad) => {
    const enc = encryptMessage(keyring, aad, "secret answer");
    expect(() => decryptMessage(keyring, otherAad, enc)).toThrow(TranscriptDecryptError);
  });

  it("rejects the wrong key and unknown key versions", () => {
    const enc = encryptMessage(keyring, aad, "secret answer");
    const other = createKeyring({ currentKey: keyB64(), currentVersion: 1 });
    expect(() => decryptMessage(other, aad, enc)).toThrow(TranscriptDecryptError);
    expect(() => decryptMessage(keyring, aad, { ...enc, keyVersion: 9 })).toThrow(
      /Unknown transcript key version 9/,
    );
  });

  it("reads messages written with a retired key after rotation", () => {
    const oldKey = keyB64();
    const v1 = createKeyring({ currentKey: oldKey, currentVersion: 1 });
    const enc = encryptMessage(v1, aad, "written before rotation");
    const v2 = createKeyring({
      currentKey: keyB64(),
      currentVersion: 2,
      previous: [{ version: 1, key: oldKey }],
    });
    expect(decryptMessage(v2, aad, enc)).toBe("written before rotation");
    expect(encryptMessage(v2, aad, "new").keyVersion).toBe(2);
  });

  it("refuses keys that aren't 32 bytes and a previous key reusing the current version", () => {
    expect(() =>
      createKeyring({ currentKey: randomBytes(16).toString("base64"), currentVersion: 1 }),
    ).toThrow(RangeError);
    const k = keyB64();
    expect(() =>
      createKeyring({ currentKey: k, currentVersion: 1, previous: [{ version: 1, key: k }] }),
    ).toThrow(/must not reuse/);
  });
});
