"use client";

import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ApiError, api } from "@/lib/api-client";

/**
 * Conversation-history settings. Transcripts are for the user (encrypted,
 * readable only by them and — for the unfinished session only — as that
 * thread's history); memories are for the coach and live on Walrus.
 */
export function HistorySettings({
  open,
  onOpenChange,
  saveTranscripts,
  onSaveTranscriptsChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saveTranscripts: boolean;
  onSaveTranscriptsChange: (value: boolean) => void;
}) {
  const id = useId();
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function toggle(value: boolean) {
    setSaving(true);
    try {
      const res = await api.patchSettings({ saveTranscripts: value });
      onSaveTranscriptsChange(res.saveTranscripts);
      toast.success(
        res.saveTranscripts
          ? "History is on: new conversations are saved (encrypted) for you."
          : "History is off: new conversations won't be saved or restored.",
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update the setting. Please retry.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAll() {
    setDeleting(true);
    try {
      const res = await api.deleteAllTranscripts();
      toast.success(
        res.deleted === 0
          ? "There was no saved history to delete."
          : `Deleted ${res.deleted} saved ${res.deleted === 1 ? "message" : "messages"}. Your coach's memories are unchanged.`,
      );
      setConfirmOpen(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't delete history. Please retry.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle className="text-base">Settings</SheetTitle>
          <SheetDescription>Transcripts are for you; memories are for the coach.</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 overflow-y-auto p-4 text-sm">
          <section aria-labelledby={`${id}-history`} className="space-y-3">
            <h3 id={`${id}-history`} className="font-medium">
              Conversation history
            </h3>
            <div className="flex items-start gap-3 border border-border bg-card p-3">
              <Switch
                id={`${id}-save`}
                checked={saveTranscripts}
                disabled={saving}
                onCheckedChange={(v) => void toggle(v)}
                aria-describedby={`${id}-save-hint`}
              />
              <div className="space-y-1">
                <label htmlFor={`${id}-save`} className="font-medium">
                  Save conversation history
                </label>
                <p id={`${id}-save-hint`} className="text-xs text-muted-foreground">
                  Your transcripts are stored encrypted, for you only, so you can reread past
                  sessions and pick up an unfinished one after a refresh. Across sessions the coach
                  only uses memories — never old transcripts.
                </p>
              </div>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              <li>
                <span className="text-foreground">Transcripts</span>: encrypted in our database,
                readable by you. The coach sees only the current session's messages.
              </li>
              <li>
                <span className="text-foreground">Memories</span>: short notes the coach keeps on
                Walrus. See them in “What I remember”.
              </li>
              <li>With history off, nothing new is saved and nothing is restored.</li>
            </ul>
          </section>

          <section aria-labelledby={`${id}-delete`} className="space-y-2">
            <h3 id={`${id}-delete`} className="font-medium">
              Delete all history
            </h3>
            <p className="text-xs text-muted-foreground">
              Permanently deletes every saved transcript. Deleting history doesn't delete memories —
              your coach still remembers what it learned.
            </p>
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 aria-hidden />
              Delete all history
            </Button>
          </section>
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete all conversation history?</DialogTitle>
              <DialogDescription>
                Every saved transcript will be deleted and can't be recovered. Memories on Walrus
                are not affected.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button variant="destructive" disabled={deleting} onClick={() => void deleteAll()}>
                {deleting ? "Deleting…" : "Delete history"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
