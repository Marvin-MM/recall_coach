/**
 * Public (browser-safe) configuration. Values are inlined at build time and
 * validated by src/env.ts during `next build`, so no secrets can appear here.
 */
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
  walrusBlobUrl:
    process.env.NEXT_PUBLIC_WALRUS_EXPLORER_BLOB_URL ?? "https://walruscan.com/mainnet/blob/",
  suiObjectUrl:
    process.env.NEXT_PUBLIC_SUI_EXPLORER_OBJECT_URL ?? "https://suiscan.xyz/mainnet/object/",
} as const;

export const blobExplorerUrl = (blobId: string) =>
  `${publicEnv.walrusBlobUrl}${encodeURIComponent(blobId)}`;
