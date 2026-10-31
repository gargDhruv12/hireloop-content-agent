import { brightpathSample } from "./brightpath-sample";
import { hireloop } from "./hireloop";
import type { ClientProfile } from "./types";

/**
 * Every client the desk can write for. A run stores its client's id, and every
 * later step (checks, rewrites, previews) uses that client's facts and voice.
 * The sample client is for demos; set SAMPLE_CLIENT=off to hide it.
 */
export function clients(): ClientProfile[] {
  return [hireloop, ...(process.env.SAMPLE_CLIENT === "off" ? [] : [brightpathSample])];
}

export const DEFAULT_CLIENT = hireloop;

/** The client with this id; HireLoop for runs made before clients had ids. */
export function clientById(id: string | undefined): ClientProfile {
  return clients().find((c) => c.id === id) ?? DEFAULT_CLIENT;
}

export function isClientId(id: unknown): id is string {
  return typeof id === "string" && clients().some((c) => c.id === id);
}
