import type {
  CreateSessionInput,
  OnboardingInput,
  PatchSessionInput,
  PatchSettingsInput,
} from "@/lib/schemas/api";
import type {
  ActiveSessionDto,
  ApiErrorBody,
  DeletedDto,
  MemoryInspectorDto,
  MeResponse,
  OnboardingResultDto,
  SessionDetailDto,
  SessionDto,
  SessionMemoriesDto,
  SessionMessagesDto,
  SessionsListDto,
  SettingsDto,
} from "@/types/api";

/** Typed error for non-2xx API responses (never includes stack traces). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: ApiErrorBody["error"]["issues"] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "NETWORK", "You appear to be offline. Check your connection and retry.");
  }
  if (res.ok) return (await res.json()) as T;
  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    // non-JSON error (e.g. proxy) — fall through
  }
  throw new ApiError(
    res.status,
    body?.error.code ?? `HTTP_${res.status}`,
    body?.error.message ?? "Something went wrong. Please retry.",
    body?.error.issues ?? [],
  );
}

const sessionPath = (id: string) => `/api/sessions/${encodeURIComponent(id)}`;

export const api = {
  me: () => request<MeResponse>("/api/me"),
  sessions: () => request<SessionsListDto>("/api/sessions"),
  activeSession: () => request<ActiveSessionDto>("/api/sessions/active"),
  sessionMessages: (id: string) => request<SessionMessagesDto>(`${sessionPath(id)}/messages`),
  deleteSessionMessages: (id: string) =>
    request<DeletedDto>(`${sessionPath(id)}/messages`, { method: "DELETE" }),
  sessionMemories: (id: string) => request<SessionMemoriesDto>(`${sessionPath(id)}/memories`),
  patchSettings: (input: PatchSettingsInput) =>
    request<SettingsDto>("/api/me/settings", { method: "PATCH", body: JSON.stringify(input) }),
  deleteAllTranscripts: () => request<DeletedDto>("/api/me/transcripts", { method: "DELETE" }),
  createSession: (input: CreateSessionInput) =>
    request<SessionDto>("/api/sessions", { method: "POST", body: JSON.stringify(input) }),
  session: (id: string) => request<SessionDetailDto>(sessionPath(id)),
  patchSession: (id: string, input: PatchSessionInput) =>
    request<SessionDto>(sessionPath(id), {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  onboard: (input: OnboardingInput) =>
    request<OnboardingResultDto>("/api/onboarding", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  memory: (refresh = false) =>
    request<MemoryInspectorDto>(`/api/memory${refresh ? "?refresh=1" : ""}`),
};
