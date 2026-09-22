import { log } from "@/lib/log";
import { onboardingSchema } from "@/lib/schemas/api";
import { describeLearningStyle } from "@/lib/schemas/profile";
import type { UserResolver } from "@/server/auth/session";
import type { MemoryEventsRepo } from "@/server/db/repositories/memory-events.repo";
import type { UserSettingsRepo } from "@/server/db/repositories/user-settings.repo";
import { errorResponse, jsonOk, parseJsonBody } from "@/server/http/respond";
import type { ExtractionResult } from "@/server/llm/extraction";
import type { ExtractionPromptInput } from "@/server/llm/prompts/extraction";
import { decodeMemory, encodeProfile, stripUndefined } from "@/server/memory/memory-format";
import type { MemoryPort } from "@/server/memory/memory-port";
import { deriveNamespaces } from "@/server/memory/namespace";
import { persistOnboarding } from "@/server/memory/persist-service";
import type { ProfileCache } from "@/server/memory/profile-cache";
import type { RateLimitPolicy } from "@/server/ratelimit";
import type { OnboardingResultDto } from "@/types/api";
import type { CoachProfile } from "@/types/memory";

export interface OnboardingDeps {
  requireUser: UserResolver;
  rateLimit: RateLimitPolicy;
  userSettings: UserSettingsRepo;
  memoryEvents: MemoryEventsRepo;
  memory: () => MemoryPort;
  extract: (input: ExtractionPromptInput) => Promise<ExtractionResult>;
  after: (task: () => Promise<void>) => void;
  namespacePrefix: string;
  profileCache?: ProfileCache;
  now?: () => Date;
}

export function createOnboardingHandler(deps: OnboardingDeps) {
  const now = deps.now ?? (() => new Date());
  return async function onboard(request: Request): Promise<Response> {
    try {
      const user = await deps.requireUser(request);
      await deps.rateLimit.enforce("api", user.id);
      const input = await parseJsonBody(request, onboardingSchema);
      const at = now();
      const settings = await deps.userSettings.completeOnboarding(user.id, at);
      const namespaces = deriveNamespaces(user.id, settings.namespaceVersion, deps.namespacePrefix);

      const profile: CoachProfile = stripUndefined({
        targetRole: input.targetRole,
        company: input.company,
        level: input.level,
        interviewDate: input.interviewDate,
        learningStyle: describeLearningStyle(input.learningStyle),
        focusAreas: input.focusAreas.length > 0 ? input.focusAreas : undefined,
      });

      // Provisional cache entry (no blob id yet) so the very next turn on this
      // instance already knows the profile while the Walrus write completes.
      const line = encodeProfile({ profile, at });
      deps.profileCache?.set(namespaces.profile, {
        blobId: "",
        text: line,
        distance: 0,
        decoded: decodeMemory(line),
      });

      const planned = 1 + input.focusAreas.length;
      deps.after(async () => {
        try {
          await persistOnboarding(
            {
              memory: deps.memory(),
              memoryEvents: deps.memoryEvents,
              extract: deps.extract,
              ...(deps.profileCache ? { profileCache: deps.profileCache } : {}),
              now,
            },
            { userId: user.id, namespaces, profile, focusAreas: input.focusAreas },
          );
        } catch (error) {
          log.error("onboarding.persist_failed", { userId: user.id, error });
        }
      });
      return jsonOk<OnboardingResultDto>({ ok: true, savedJobs: planned });
    } catch (error) {
      return errorResponse(error, { route: "onboarding" });
    }
  };
}
