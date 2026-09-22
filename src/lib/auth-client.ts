"use client";

import { createAuthClient } from "better-auth/react";

/** Browser auth client (same origin; no secrets). */
export const authClient = createAuthClient();

export function signInWithGoogle(callbackURL: string) {
  return authClient.signIn.social({ provider: "google", callbackURL });
}
