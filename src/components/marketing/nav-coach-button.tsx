"use client";

import { Button } from "@/components/ui/button";
import { openCoachWidget } from "@/components/widget/widget-events";
import { authClient } from "@/lib/auth-client";

/** "Sign in" for visitors, "Open coach" once signed in — both open the widget. */
export function NavCoachButton() {
  const { data, isPending } = authClient.useSession();
  return (
    <Button variant="outline" onClick={() => openCoachWidget()} aria-busy={isPending}>
      {data?.user ? "Open coach" : "Sign in"}
    </Button>
  );
}
