import "server-only";
import { z } from "zod";

/** Fixed external destination. Never taken from configuration or clients. */
export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

const EnvSchema = z.object({
  TYPESAFE_API_KEY: z.string().trim().optional(),
  JEV_MODEL: z.string().trim().min(1).default("jev-1.13.0"),
  DATABASE_PATH: z.string().trim().min(1).default("./data/jevciv.sqlite"),
  ALLOW_MOCK_MODE: z.enum(["true", "false"]).optional(),
  JEV_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  JEV_MAX_ATTEMPTS_PER_TURN: z.coerce.number().int().min(1).max(3).default(3),
  JEV_MAX_ATTEMPTS_PER_GAME: z.coerce.number().int().min(1).max(10000).default(300),
  JEV_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  APP_ORIGIN: z.string().trim().optional(),
  RATE_LIMIT_TURNS_PER_MINUTE: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_GAMES_PER_HOUR: z.coerce.number().int().min(1).default(10),
  NODE_ENV: z.string().optional(),
});

export interface ServerConfig {
  apiKey: string | null;
  model: string;
  databasePath: string;
  allowMock: boolean;
  timeoutMs: number;
  maxAttemptsPerTurn: number;
  maxAttemptsPerGame: number;
  maxConcurrency: number;
  appOrigin: string | null;
  production: boolean;
  /** Local spend/abuse protections (PRD §19). */
  limits: { turnStartsPerMinute: number; gamesPerHour: number };
}

let cached: ServerConfig | null = null;

export function getConfig(): ServerConfig {
  if (cached) return cached;
  const env = EnvSchema.parse(process.env);
  const production = env.NODE_ENV === "production";
  cached = {
    apiKey: env.TYPESAFE_API_KEY && env.TYPESAFE_API_KEY.length > 0 ? env.TYPESAFE_API_KEY : null,
    model: env.JEV_MODEL,
    databasePath: env.DATABASE_PATH,
    // Mock mode is opt-in; it defaults to off in production.
    allowMock: env.ALLOW_MOCK_MODE ? env.ALLOW_MOCK_MODE === "true" : !production,
    timeoutMs: env.JEV_TIMEOUT_MS,
    maxAttemptsPerTurn: env.JEV_MAX_ATTEMPTS_PER_TURN,
    maxAttemptsPerGame: env.JEV_MAX_ATTEMPTS_PER_GAME,
    maxConcurrency: env.JEV_MAX_CONCURRENCY,
    appOrigin: env.APP_ORIGIN && env.APP_ORIGIN.length > 0 ? env.APP_ORIGIN.replace(/\/$/, "") : null,
    production,
    limits: { turnStartsPerMinute: env.RATE_LIMIT_TURNS_PER_MINUTE, gamesPerHour: env.RATE_LIMIT_GAMES_PER_HOUR },
  };
  return cached;
}

/** For tests only. */
export function resetConfigForTests() {
  cached = null;
}

/** Safe, non-secret capabilities for the browser. */
export function publicCapabilities() {
  const c = getConfig();
  return { liveAvailable: c.apiKey !== null, mockPermitted: c.allowMock, model: c.model };
}
