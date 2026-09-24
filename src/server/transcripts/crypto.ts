import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/env";

/**
 * Transcript encryption: AES-256-GCM with a random 96-bit IV per message and a
 * 128-bit auth tag. The AAD binds every ciphertext to its owner, session and
 * position (`${userId}:${sessionId}:${seq}`), so a row copied to another user,
 * session or seq fails to decrypt instead of being shown out of context.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export interface TranscriptKey {
  version: number;
  key: Uint8Array;
}

/** Current key for new writes, plus every key still needed for reading (rotation). */
export interface TranscriptKeyring {
  current: TranscriptKey;
  byVersion: ReadonlyMap<number, Uint8Array>;
}

export interface EncryptedMessage {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  authTag: Uint8Array;
  keyVersion: number;
}

export interface MessageAad {
  userId: string;
  sessionId: string;
  seq: number;
}

export class TranscriptDecryptError extends Error {
  constructor(message = "Transcript message could not be decrypted.") {
    super(message);
    this.name = "TranscriptDecryptError";
  }
}

export function aadFor({ userId, sessionId, seq }: MessageAad): Buffer {
  return Buffer.from(`${userId}:${sessionId}:${seq}`, "utf8");
}

function decodeKey(base64: string): Uint8Array {
  const key = Buffer.from(base64, "base64");
  if (key.length !== KEY_BYTES) throw new RangeError("Transcript keys must be 32 bytes.");
  return new Uint8Array(key);
}

export function createKeyring(input: {
  currentKey: string;
  currentVersion: number;
  previous?: readonly { version: number; key: string }[];
}): TranscriptKeyring {
  const byVersion = new Map<number, Uint8Array>();
  for (const k of input.previous ?? []) byVersion.set(k.version, decodeKey(k.key));
  if (byVersion.has(input.currentVersion)) {
    throw new RangeError(
      `TRANSCRIPT_PREVIOUS_KEYS must not reuse the current version ${input.currentVersion}.`,
    );
  }
  const current = { version: input.currentVersion, key: decodeKey(input.currentKey) };
  byVersion.set(current.version, current.key);
  return { current, byVersion };
}

export function encryptMessage(
  keyring: TranscriptKeyring,
  aad: MessageAad,
  plaintext: string,
): EncryptedMessage {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyring.current.key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aadFor(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: new Uint8Array(ciphertext),
    iv: new Uint8Array(iv),
    authTag: new Uint8Array(cipher.getAuthTag()),
    keyVersion: keyring.current.version,
  };
}

/** Throws TranscriptDecryptError on a wrong key, unknown key version or any tampering. */
export function decryptMessage(
  keyring: TranscriptKeyring,
  aad: MessageAad,
  message: EncryptedMessage,
): string {
  const key = keyring.byVersion.get(message.keyVersion);
  if (!key)
    throw new TranscriptDecryptError(`Unknown transcript key version ${message.keyVersion}.`);
  if (message.iv.length !== IV_BYTES || message.authTag.length !== TAG_BYTES) {
    throw new TranscriptDecryptError();
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, message.iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(aadFor(aad));
    decipher.setAuthTag(message.authTag);
    return Buffer.concat([decipher.update(message.ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new TranscriptDecryptError();
  }
}

let cached: TranscriptKeyring | undefined;

/** Production keyring from the validated environment (memoized). */
export function envKeyring(): TranscriptKeyring {
  if (cached) return cached;
  cached = createKeyring({
    currentKey: env.TRANSCRIPT_ENCRYPTION_KEY,
    currentVersion: env.TRANSCRIPT_KEY_VERSION,
    previous: env.TRANSCRIPT_PREVIOUS_KEYS ?? [],
  });
  return cached;
}
