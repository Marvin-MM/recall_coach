import { createKeyring } from "@/server/transcripts/crypto";

/** Fixed, test-only AES-256 key (32 bytes of 0x2a). Never used outside tests. */
export const testKeyring = createKeyring({
  currentKey: Buffer.alloc(32, 0x2a).toString("base64"),
  currentVersion: 1,
});
