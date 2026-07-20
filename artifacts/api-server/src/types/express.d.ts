import type { IGuardianUserDetails } from "../downstreams/guardian/endpoints";
import type { AuthUser } from "@workspace/api-zod";

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;
      user?: User | undefined;
      /** Raw `name=value` Ory session cookie, when validated via Guardian. */
      rawCookie?: string | undefined;
      /** Starter-kit shape: Guardian user + raw cookie after requireAuth. */
      auth?: {
        user: IGuardianUserDetails;
        rawCookie: string;
      };
    }

    export interface AuthedRequest {
      user: User;
      rawCookie: string;
    }
  }
}

export {};
