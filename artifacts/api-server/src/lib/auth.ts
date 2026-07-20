import { db, usersTable } from "@workspace/db";
import type { AuthUser } from "@workspace/api-zod";
import type { IGuardianUserDetails } from "../downstreams/guardian/endpoints";

/**
 * Temporary go-live bypass until storefront.headout.com DNS + Guardian SSO
 * are live. Enable with AUTH_BYPASS=true on the API service. Remove once
 * real Ory cookies reach the deploy host.
 */
export function isAuthBypassEnabled(): boolean {
  const v = process.env["AUTH_BYPASS"];
  return v === "1" || v === "true" || v === "TRUE";
}

/** Synthetic user used only when AUTH_BYPASS is on. */
export const AUTH_BYPASS_USER: AuthUser = {
  id: "auth-bypass@headout.com",
  email: "auth-bypass@headout.com",
  firstName: "Storefront",
  lastName: "Bypass",
  profileImageUrl: null,
};

export const AUTH_BYPASS_GUARDIAN_USER: IGuardianUserDetails = {
  userId: "auth-bypass@headout.com",
  firstName: "Storefront",
  lastName: "Bypass",
  groups: null,
};

/**
 * Map Guardian whoami → Storefront AuthUser.
 * Guardian's `userId` is the Headout email (identity trait); there is no
 * separate `email` field on the whoami DTO.
 */
export function guardianUserToAuthUser(user: IGuardianUserDetails): AuthUser {
  return {
    id: user.userId,
    email: user.userId || null,
    firstName: user.firstName || null,
    lastName: user.lastName || null,
    profileImageUrl: null,
  };
}

/**
 * Conversations (and other tables) FK to `users.id`. Upsert the auth user
 * so chat persistence works for both Guardian SSO and AUTH_BYPASS.
 */
export async function ensureAuthUserRow(user: AuthUser): Promise<void> {
  await db
    .insert(usersTable)
    .values({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
    })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        updatedAt: new Date(),
      },
    });
}
