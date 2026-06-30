export type RegistryUrlParams = {
  type?: string;
  tab?: string;
  q?: string;
  kit?: string;
};

export function registryParamsFromSearchParams(
  searchParams: URLSearchParams,
): RegistryUrlParams {
  return {
    type: searchParams.get("type") ?? undefined,
    tab: searchParams.get("tab") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    kit: searchParams.get("kit") ?? undefined,
  };
}

export function isCatalogueHrefActive(
  pathname: string,
  params: RegistryUrlParams,
  href: string,
): boolean {
  if (pathname !== "/registry") return false;

  const [path, query = ""] = href.split("?");
  if (path !== "/registry") return false;

  if (!query) {
    return params.tab !== "blocks" && !params.type;
  }

  const hrefParams = new URLSearchParams(query);
  for (const [key, value] of hrefParams.entries()) {
    const current = params[key as keyof RegistryUrlParams];
    if (key === "type" && value === "dashboard") {
      if (current !== "app" && current !== "dashboard") return false;
      continue;
    }
    if (current !== value) return false;
  }
  return true;
}
