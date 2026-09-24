import type { OptionalUserResolver } from "@/server/auth/session";
import type { MemoryEventsRepo } from "@/server/db/repositories/memory-events.repo";
import type { UserSettingsRepo } from "@/server/db/repositories/user-settings.repo";
import { errorResponse, jsonOk } from "@/server/http/respond";
import type { MeResponse } from "@/types/api";
import { firstName } from "./common";

export interface MeDeps {
  getOptionalUser: OptionalUserResolver;
  userSettings: UserSettingsRepo;
  memoryEvents: Pick<MemoryEventsRepo, "countDoneBlobsByUser">;
  adminEmails: readonly string[];
}

export function createMeHandler(deps: MeDeps) {
  return async function me(request: Request): Promise<Response> {
    try {
      const user = await deps.getOptionalUser(request);
      if (!user) return jsonOk<MeResponse>({ signedIn: false });
      const [settings, doneMemories] = await Promise.all([
        deps.userSettings.get(user.id),
        deps.memoryEvents.countDoneBlobsByUser(user.id),
      ]);
      return jsonOk<MeResponse>({
        signedIn: true,
        user: {
          id: user.id,
          name: user.name,
          firstName: firstName(user.name),
          email: user.email,
          image: user.image,
        },
        onboarded: Boolean(settings?.onboardedAt),
        memoryConsent: Boolean(settings?.memoryConsentAt),
        isAdmin: deps.adminEmails.includes(user.email.toLowerCase()),
        doneMemories,
        saveTranscripts: settings?.saveTranscripts ?? true,
      });
    } catch (error) {
      return errorResponse(error, { route: "me" });
    }
  };
}
