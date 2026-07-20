import { guardianClient } from "./client";
import type {
  TAccessPermission,
  TOryApplication,
} from "../../lib/guardian-config";

/**
 * Guardian `/auth/whoami` returns groups as OryGroups enum strings when
 * includeGroups=true — not `{ name, application }` objects. Keep a loose
 * type so callers can inspect either shape without lying in the type system.
 */
export interface IGuardianUserDetails {
  userId: string;
  firstName: string;
  lastName: string;
  groups: unknown[] | null;
}

export interface IGuardianResourcePermission {
  application: TOryApplication;
  resourceName: string;
  accessPermission: TAccessPermission;
}

export interface IGuardianResourcePermissionsResponse {
  data: IGuardianResourcePermission[];
}

export interface IWhoamiOptions {
  includeGroups?: boolean;
}

/**
 * Resolve identity via Guardian. `rawCookie` must be the full `name=value`
 * string — Guardian forwards it to Ory `toSession`, and the Cookie header
 * (set by the axios interceptor) authenticates the BFF call into Guardian.
 */
export async function whoami(
  rawCookie: string,
  options: IWhoamiOptions = {},
): Promise<IGuardianUserDetails> {
  const { includeGroups = false } = options;
  const response = await guardianClient.post<IGuardianUserDetails>(
    "/auth/whoami",
    { sessionCookie: rawCookie },
    {
      rawCookie,
      params: includeGroups ? { includeGroups: true } : undefined,
    },
  );
  return response.data;
}

export interface IListUserResourcePermissionsOptions {
  accessPermission?: TAccessPermission;
}

export async function listUserResourcePermissions(
  userId: string,
  application: TOryApplication,
  rawCookie: string,
  options: IListUserResourcePermissionsOptions = {},
): Promise<IGuardianResourcePermission[]> {
  const { accessPermission } = options;
  const response =
    await guardianClient.get<IGuardianResourcePermissionsResponse>(
      `/permissions/user/${encodeURIComponent(userId)}/resources/all`,
      {
        rawCookie,
        params: {
          application,
          ...(accessPermission ? { accessPermission } : {}),
        },
      },
    );
  return response.data.data;
}
