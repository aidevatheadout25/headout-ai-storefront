/**
 * Manage keys are the per-tool secrets that prove ownership for edits. There is
 * no login in v1, so the claimer's manage key is kept in localStorage (per
 * browser) and replayed as the `x-manage-token` header on edits.
 */
const PREFIX = "headout-storefront:manage-token:";

export function getManageToken(toolId: string): string | null {
  try {
    return localStorage.getItem(PREFIX + toolId);
  } catch {
    return null;
  }
}

export function setManageToken(toolId: string, token: string): void {
  try {
    localStorage.setItem(PREFIX + toolId, token);
  } catch {
    // storage may be unavailable (private mode) — non-fatal
  }
}

export function clearManageToken(toolId: string): void {
  try {
    localStorage.removeItem(PREFIX + toolId);
  } catch {
    // non-fatal
  }
}
