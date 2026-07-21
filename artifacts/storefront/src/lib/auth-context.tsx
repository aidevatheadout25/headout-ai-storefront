import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthUser } from "@workspace/api-client-react";
import { buildLoginUrl, oryLogout } from "@/services/ory-client";

export type { AuthUser };

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function loginRedirect() {
  window.location.href = buildLoginUrl(window.location.href);
}

async function injectDevSessionCookie(): Promise<void> {
  if (!import.meta.env.DEV) return;
  try {
    await fetch("/__dev-auth-cookie", { credentials: "include" });
  } catch {
    // Best-effort; /api/auth/user below surfaces auth failure.
  }
}

/**
 * Resolve identity through the Storefront BFF → Guardian whoami path
 * (`GET /api/auth/user`). Soft-landing: null user is OK (show landing CTA).
 */
async function fetchAuthUser(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/user", { credentials: "include" });
  if (!res.ok) {
    throw new Error(`auth/user failed: ${res.status}`);
  }
  const body = (await res.json()) as { user: AuthUser | null };
  return body.user ?? null;
}

/**
 * Guardian/Ory auth behind the existing `useAuthContext()` shape so App,
 * Sidebar, HomeChat, etc. need no changes.
 *
 * - Login: redirect to Ory hosted UI
 * - Session: cookie → Express → Guardian `/auth/whoami`
 * - Logout: Ory browser logout flow, then soft landing
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      await injectDevSessionCookie();
      setUser(await fetchAuthUser());
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      if (response.status === 401) {
        let errorCode: string | null = null;
        try {
          const clone = response.clone();
          const body = (await clone.json()) as { errorCode?: string };
          errorCode = body.errorCode ?? null;
        } catch {
          // non-JSON 401
        }
        if (errorCode === "INVALID_SESSION" || errorCode === null) {
          setUser(null);
        }
      }
      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [user]);

  const logout = useCallback(() => {
    void (async () => {
      try {
        await oryLogout();
      } catch {
        // Session may already be invalid.
      }
      setUser(null);
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      window.location.href = `${base}/` || "/";
    })();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user != null,
      login: loginRedirect,
      logout,
    }),
    [user, isLoading, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return ctx;
}
