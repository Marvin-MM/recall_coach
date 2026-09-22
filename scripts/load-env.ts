/**
 * Load .env.local etc. the same way Next.js does, before any module reads
 * process.env. Import this FIRST in every script.
 */
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
