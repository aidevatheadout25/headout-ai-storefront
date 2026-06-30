import { useMemo } from "react";
import {
  useLocation,
  useSearch,
  useParams as useWouterParams,
} from "wouter";

export const NOT_FOUND_SYMBOL = "STOREFRONT_NOT_FOUND";

export class NotFoundError extends Error {
  constructor() {
    super(NOT_FOUND_SYMBOL);
    this.name = "NotFoundError";
  }
}

export function notFound(): never {
  throw new NotFoundError();
}

function isExternal(href: string): boolean {
  return /^[a-z]+:\/\//i.test(href) || href.startsWith("//");
}

export type AppRouter = {
  push: (href: string) => void;
  replace: (href: string) => void;
  refresh: () => void;
  back: () => void;
  forward: () => void;
  prefetch: () => void;
};

export function useRouter(): AppRouter {
  const [, navigate] = useLocation();

  return useMemo<AppRouter>(
    () => ({
      push: (href: string) => {
        if (isExternal(href)) {
          window.location.assign(href);
          return;
        }
        navigate(href);
      },
      replace: (href: string) => {
        if (isExternal(href)) {
          window.location.replace(href);
          return;
        }
        navigate(href, { replace: true });
      },
      refresh: () => {},
      back: () => window.history.back(),
      forward: () => window.history.forward(),
      prefetch: () => {},
    }),
    [navigate],
  );
}

export function useSearchParams(): URLSearchParams {
  const search = useSearch();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function usePathname(): string {
  const [location] = useLocation();
  return location || "/";
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return useWouterParams() as T;
}

export function redirect(href: string): never {
  if (isExternal(href)) {
    window.location.assign(href);
  } else {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    window.history.replaceState({}, "", base + href);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  throw new NotFoundError();
}
