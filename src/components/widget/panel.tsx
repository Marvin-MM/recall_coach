"use client";

import { BrainCircuit, EllipsisVertical, LogOut, Maximize2, X } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { siteConfig } from "@/config/site";
import { MemoryStatusBadge } from "./memory-status-badge";

export interface PanelHeaderProps {
  titleId: string;
  titleRef: RefObject<HTMLHeadingElement | null>;
  memoryState: "on" | "off" | "saving" | null;
  variant: "floating" | "page";
  signedIn: boolean;
  onExpand: () => void;
  onClose: () => void;
  onOpenInspector: () => void;
  onSignOut: () => void;
}

export function PanelHeader({
  titleId,
  titleRef,
  memoryState,
  variant,
  signedIn,
  onExpand,
  onClose,
  onOpenInspector,
  onSignOut,
}: PanelHeaderProps) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
      <h2 id={titleId} ref={titleRef} tabIndex={-1} className="text-sm font-semibold outline-none">
        {siteConfig.name} <span className="font-normal text-muted-foreground">coach</span>
      </h2>
      {memoryState && <MemoryStatusBadge state={memoryState} />}
      <div className="ml-auto flex items-center">
        {signedIn && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Coach menu">
                <EllipsisVertical aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onOpenInspector}>
                <BrainCircuit aria-hidden />
                What I remember
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onSignOut}>
                <LogOut aria-hidden />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {variant === "floating" && (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onExpand}
              aria-label="Open full-page coach"
            >
              <Maximize2 aria-hidden />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close coach (Esc)">
              <X aria-hidden />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function PanelFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">{children}</div>
  );
}
