import {
  AlertTriangle,
  CalendarDays,
  ClipboardCheck,
  Flag,
  GraduationCap,
  type LucideIcon,
  NotebookPen,
  Sparkles,
  Target,
  ThumbsUp,
  TrendingUp,
  UserRound,
} from "lucide-react";
import type { MemoryKind } from "@/types/domain";

export type ChipKind = MemoryKind | "note";

export const KIND_META: Record<ChipKind, { label: string; icon: LucideIcon }> = {
  profile: { label: "Profile", icon: UserRound },
  target_role: { label: "Target role", icon: Target },
  interview_date: { label: "Interview date", icon: CalendarDays },
  learning_style: { label: "Learning style", icon: GraduationCap },
  mistake: { label: "Mistake", icon: AlertTriangle },
  strength: { label: "Strength", icon: ThumbsUp },
  improvement: { label: "Improvement", icon: TrendingUp },
  goal: { label: "Goal", icon: Flag },
  preference: { label: "Preference", icon: Sparkles },
  assignment: { label: "Assignment", icon: ClipboardCheck },
  note: { label: "Note", icon: NotebookPen },
};

/** Order used by the memory inspector (most coaching-relevant first). */
export const KIND_ORDER: readonly ChipKind[] = [
  "assignment",
  "mistake",
  "improvement",
  "strength",
  "goal",
  "preference",
  "target_role",
  "interview_date",
  "learning_style",
  "note",
];

export function shortBlobId(blobId: string): string {
  return blobId.length > 14 ? `${blobId.slice(0, 6)}…${blobId.slice(-4)}` : blobId;
}

export function formatWhen(iso: string | null, now = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
