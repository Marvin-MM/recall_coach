import type { CreateSessionInput, OnboardingInput, PatchSessionInput } from "@/lib/schemas/api";
import type {
  ApiErrorBody,
  MeDto,
  MemoryInspectorDto,
  OnboardingResultDto,
  SessionDetailDto,
  SessionDto,
  SessionsListDto,
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

export const api = {
  me: () => request<MeDto>("/api/me"),
  sessions: () => request<SessionsListDto>("/api/sessions"),
  createSession: (input: CreateSessionInput) =>
    request<SessionDto>("/api/sessions", { method: "POST", body: JSON.stringify(input) }),
  session: (id: string) => request<SessionDetailDto>(`/api/sessions/${encodeURIComponent(id)}`),
  patchSession: (id: string, input: PatchSessionInput) =>
    request<SessionDto>(`/api/sessions/${encodeURIComponent(id)}`, {
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
