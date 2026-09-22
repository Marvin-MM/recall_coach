import type { CoachingMode, MemoryKind } from "./domain";
import type { CoachProfile, MemoryView } from "./memory";

export interface ApiErrorBody {
  error: { code: string; message: string; issues?: { path: string; message: string }[] };
}

export interface SessionDto {
  id: string;
  mode: CoachingMode;
  title: string;
  memoryEnabled: boolean;
  turnCount: number;
  createdAt: string;
  endedAt: string | null;
  savedMemories: number;
}

export interface SessionDetailDto extends Omit<SessionDto, "savedMemories"> {
  jobs: { pending: number; done: number; failed: number };
}

export interface SessionsListDto {
  sessions: SessionDto[];
}

export interface MeDto {
  user: { id: string; name: string; firstName: string; email: string; image: string | null };
  onboarded: boolean;
  memoryConsent: boolean;
  isAdmin: boolean;
}

export interface OnboardingResultDto {
  ok: true;
  savedJobs: number;
}

export interface MemoryInspectorDto {
  profile: CoachProfile | null;
  profileAt: string | null;
  groups: Partial<Record<MemoryKind | "note", MemoryView[]>>;
  totals: { doneBlobs: number; recalled: number };
  degraded: boolean;
  fetchedAt: string;
}

export interface HealthDto {
  db: "ok" | "down";
  relayer: "ok" | "down";
  relayerVersion?: string;
  relayerReason?: string;
  model: string;
  checkedAt: string;
}

export interface EvidenceUserDto {
  pseudonym: string;
  doneByKind: Partial<Record<MemoryKind, number>>;
  doneTotal: number;
  failedTotal: number;
  pendingTotal: number;
  sessions: number;
  recallHitRate: number | null;
  firstActivity: string | null;
  lastActivity: string | null;
}

export interface EvidenceDto {
  generatedAt: string;
  accountId: string;
  delegatePublicKey: string;
  delegateSuiAddress: string;
  relayer: string;
  namespacePrefix: string;
  users: EvidenceUserDto[];
  totals: {
    users: number;
    doneBlobs: number;
    sessions: number;
    usersWith10Plus: number;
    meetsThreshold: boolean;
  };
}
