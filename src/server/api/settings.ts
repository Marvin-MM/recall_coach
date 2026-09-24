import { patchSettingsSchema } from "@/lib/schemas/api";
import type { UserResolver } from "@/server/auth/session";
import type { UserSettingsRepo } from "@/server/db/repositories/user-settings.repo";
import { errorResponse, jsonOk, parseJsonBody } from "@/server/http/respond";
import type { RateLimitPolicy } from "@/server/ratelimit";
import type { TranscriptStore } from "@/server/transcripts/transcript-store";
import type { DeletedDto, SettingsDto } from "@/types/api";

export interface SettingsDeps {
  requireUser: UserResolver;
  rateLimit: RateLimitPolicy;
  userSettings: UserSettingsRepo;
  transcripts: TranscriptStore;
}

export function createSettingsHandlers(deps: SettingsDeps) {
  return {
    /** PATCH /api/me/settings { saveTranscripts } */
    async patch(request: Request): Promise<Response> {
      try {
        const user = await deps.requireUser(request);
        await deps.rateLimit.enforce("api", user.id);
        const input = await parseJsonBody(request, patchSettingsSchema);
        const row = await deps.userSettings.setSaveTranscripts(user.id, input.saveTranscripts);
        return jsonOk<SettingsDto>({ saveTranscripts: row.saveTranscripts });
      } catch (error) {
        return errorResponse(error, { route: "me.settings" });
      }
    },

    /** DELETE /api/me/transcripts — every stored transcript. Walrus memories are NOT affected. */
    async deleteAllTranscripts(request: Request): Promise<Response> {
      try {
        const user = await deps.requireUser(request);
        await deps.rateLimit.enforce("api", user.id);
        const deleted = await deps.transcripts.deleteAllForUser(user.id);
        return jsonOk<DeletedDto>({ deleted });
      } catch (error) {
        return errorResponse(error, { route: "me.transcripts.delete" });
      }
    },
  };
}
