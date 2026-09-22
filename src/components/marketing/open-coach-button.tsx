"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { openCoachWidget } from "@/components/widget/widget-events";

export function OpenCoachButton(props: Omit<ComponentProps<typeof Button>, "onClick">) {
  return <Button {...props} onClick={() => openCoachWidget()} />;
}
