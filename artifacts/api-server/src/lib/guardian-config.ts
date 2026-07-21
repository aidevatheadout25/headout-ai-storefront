import { logger } from "./logger";

const GUARDIAN_APPLICATION_NAME =
  process.env["GUARDIAN_APPLICATION_NAME"] ?? null;
const ORY_SESSION_COOKIE_NAME = process.env["ORY_SESSION_COOKIE_NAME"] ?? null;

/**
 * Keep in sync with Guardian's `OryApplication` enum
 * (github.com/headout/guardian …/enums/OryApplication.kt).
 * STOREFRONT is not registered yet — set GUARDIAN_APPLICATION_NAME only after
 * platform adds it; until then /me-style permission lookups stay off.
 */
const ORY_APPLICATIONS = [
  "ARIES",
  "SUPPLIERS",
  "RECON",
  "BMS",
  "FEITORIA",
  "FULFILMENT",
  "SCORPIO",
  "GUARDIAN",
  "NIMBUS",
  "ATLAS",
  "HUB",
  "ATHENA",
  "APOLLO",
  "DAM",
  "MMP",
  "ILF",
  "PLTOPERATOR",
  "SENTRA",
  "URUK",
  "ENDURANCE",
  "SPEED_OR_BLEED",
  "ORBIT",
  "BOB",
  "PREPURCHASE",
  "STARGATE",
  "PLATODASH",
  "STOREFRONT",
] as const;

export type TOryApplication = (typeof ORY_APPLICATIONS)[number];
export type TAccessPermission = "VIEW" | "EDIT";

function isOryApplication(value: string): value is TOryApplication {
  return (ORY_APPLICATIONS as readonly string[]).includes(value);
}

export function getConfiguredApplicationName(): TOryApplication | null {
  if (!GUARDIAN_APPLICATION_NAME) return null;
  if (!isOryApplication(GUARDIAN_APPLICATION_NAME)) {
    logger.warn(
      { value: GUARDIAN_APPLICATION_NAME },
      "GUARDIAN_APPLICATION_NAME is not a valid OryApplication enum value; ignoring",
    );
    return null;
  }
  return GUARDIAN_APPLICATION_NAME;
}

/** Strict: required for requireAuth / production cookie agreement. */
export function getOrySessionCookieName(): string {
  if (!ORY_SESSION_COOKIE_NAME) {
    throw new Error(
      "ORY_SESSION_COOKIE_NAME environment variable is required but was not provided.",
    );
  }
  return ORY_SESSION_COOKIE_NAME;
}

/**
 * Resolve the Ory session cookie from the request.
 * Prefer ORY_SESSION_COOKIE_NAME when set; otherwise pick the first
 * `ory_session_*` cookie (useful before the slug is confirmed).
 */
export function resolveOrySessionCookie(
  cookies: Record<string, unknown> | undefined,
): { name: string; value: string } | null {
  if (!cookies) return null;

  if (ORY_SESSION_COOKIE_NAME) {
    const value = cookies[ORY_SESSION_COOKIE_NAME];
    if (typeof value === "string" && value.length > 0) {
      return { name: ORY_SESSION_COOKIE_NAME, value };
    }
    return null;
  }

  for (const [name, value] of Object.entries(cookies)) {
    if (
      name.startsWith("ory_session_") &&
      typeof value === "string" &&
      value.length > 0
    ) {
      return { name, value };
    }
  }
  return null;
}

export function getConfiguredOrySessionCookieName(): string | null {
  return ORY_SESSION_COOKIE_NAME;
}
