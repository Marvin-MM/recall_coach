import { z } from "zod";
import { coachLimits } from "@/config/coach";
import { coachProfileSchema } from "@/lib/schemas/profile";
import { type FactKind, MEMORY_KINDS } from "@/types/domain";
import type { CoachProfile, DecodedMemory } from "@/types/memory";
import { stripInstructionMarkup } from "./sanitize";

/**
 * Self-describing memory lines, e.g.
 *   [kind=mistake][at=2026-09-22T10:14:00.000Z][session=<uuid>] The user skipped the Result…
 *   [kind=profile][at=…][v=1] {"targetRole":"Backend Engineer",…}
 * Lines stay meaningful when recalled out of context.
 */
export const PROFILE_FORMAT_VERSION = 1;
const MAX_PROFILE_JSON_CHARS = 1200;

export interface FactInput {
  kind: FactKind;
  text: string;
  at: Date;
  sessionId?: string | null | undefined;
}

export interface ProfileInput {
  profile: CoachProfile;
  at: Date;
}

/** Truncate to `max` chars on a word boundary, adding an ellipsis. */
export function capText(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}

export function cleanFactText(text: string): string {
  return capText(stripInstructionMarkup(text), coachLimits.maxFactChars);
}

const uuidSchema = z.uuid();

export function encodeFact(input: FactInput): string {
  const body = cleanFactText(input.text);
  if (body.length === 0) throw new RangeError("encodeFact: empty fact text");
  const session =
    input.sessionId && uuidSchema.safeParse(input.sessionId).success
      ? `[session=${input.sessionId}]`
      : "";
  return `[kind=${input.kind}][at=${input.at.toISOString()}]${session} ${body}`;
}

export function encodeProfile(input: ProfileInput): string {
  const profile = coachProfileSchema.parse(input.profile);
  // Profile values pass through the same markup stripping as facts.
  const cleaned = Object.fromEntries(
    Object.entries(profile).map(([k, v]) => [
      k,
      Array.isArray(v)
        ? v.map((s) => stripInstructionMarkup(s))
        : typeof v === "string"
          ? stripInstructionMarkup(v)
          : v,
    ]),
  );
  const json = JSON.stringify(cleaned);
  if (json.length > MAX_PROFILE_JSON_CHARS)
    throw new RangeError("encodeProfile: profile too large");
  return `[kind=profile][at=${input.at.toISOString()}][v=${PROFILE_FORMAT_VERSION}] ${json}`;
}

const HEADER_RE = /^((?:\[[a-z]+=[^[\]\s]{1,64}\])+)\s?([\s\S]*)$/;
const FIELD_RE = /\[([a-z]+)=([^[\]\s]{1,64})\]/g;

const headerSchema = z.object({
  kind: z.enum(MEMORY_KINDS),
  at: z.iso.datetime({ offset: true }),
  session: z.uuid().optional(),
  v: z.coerce.number().int().positive().optional(),
});

/** Parse a stored line. Returns null for untyped/legacy/malformed lines. */
export function decodeMemory(text: string): DecodedMemory | null {
  const match = HEADER_RE.exec(text.trim());
  if (!match) return null;
  const [, header = "", rest = ""] = match;
  const fields: Record<string, string> = {};
  for (const m of header.matchAll(FIELD_RE)) {
    const key = m[1];
    const value = m[2];
    if (key && value !== undefined && !(key in fields)) fields[key] = value;
  }
  const parsed = headerSchema.safeParse(fields);
  if (!parsed.success) return null;
  const body = rest.trim();
  if (body.length === 0) return null;

  const decoded: DecodedMemory = {
    kind: parsed.data.kind,
    at: new Date(parsed.data.at).toISOString(),
    body,
  };
  if (parsed.data.session) decoded.sessionId = parsed.data.session;
  if (parsed.data.v !== undefined) decoded.version = parsed.data.v;

  if (parsed.data.kind === "profile") {
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return null;
    }
    const profile = coachProfileSchema.safeParse(json);
    if (!profile.success) return null;
    decoded.profile = stripUndefined(profile.data);
  }
  return decoded;
}

export type WithoutUndefined<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

/** Drop undefined-valued keys (exactOptionalPropertyTypes-friendly). */
export function stripUndefined<T extends object>(value: T): WithoutUndefined<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as WithoutUndefined<T>;
}
