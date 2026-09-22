"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { openCoachWidget, prefetchCoachWidget } from "@/components/widget/widget-events";
import { authClient } from "@/lib/auth-client";

const subscribe = () => () => {};

/** "Sign in" for visitors, "Open coach" once signed in — both open the widget. */
export function NavCoachButton() {
  const { data } = authClient.useSession();
  // The server always renders "Sign in"; only switch after hydration so the
  // client's first render matches even if the session store is already warm.
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <Button
      variant="outline"
      onClick={() => openCoachWidget()}
      onPointerEnter={() => prefetchCoachWidget()}
      onFocus={() => prefetchCoachWidget()}
    >
      {hydrated && data?.user ? "Open coach" : "Sign in"}
    </Button>
  );
}
