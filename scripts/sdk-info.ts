import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Installed package version (package.json is not in the SDK's exports map). */
export function installedVersion(pkg: string): string {
  try {
    const raw = readFileSync(join(process.cwd(), "node_modules", pkg, "package.json"), "utf8");
    return (JSON.parse(raw) as { version?: string }).version ?? "unknown";
  } catch {
    return "unknown";
  }
}
