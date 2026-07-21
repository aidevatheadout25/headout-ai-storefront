import { Configuration, FrontendApi } from "@ory/client-fetch";
import { env } from "@/lib/env";

const basePath = env.VITE_ORY_SDK_URL;

/** Ory Frontend API — login UI redirects + browser logout only. Identity comes from Guardian via `/api/auth/user`. */
export const ory = new FrontendApi(
  new Configuration({ basePath, credentials: "include" }),
);

export const ORY_LOGIN_URL = `${basePath}/ui/login`;

export function buildLoginUrl(returnTo: string = window.location.href): string {
  return `${ORY_LOGIN_URL}?return_to=${encodeURIComponent(returnTo)}`;
}

export async function oryLogout(): Promise<void> {
  const { logout_token } = await ory.createBrowserLogoutFlow();
  await ory.updateLogoutFlow({ token: logout_token });
}
