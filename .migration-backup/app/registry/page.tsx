import { RegistryView } from "@/components/RegistryView";
import type { RegistryUrlParams } from "@/lib/registryNav";

type RegistryPageProps = {
  searchParams: Promise<RegistryUrlParams>;
};

export default async function RegistryPage({ searchParams }: RegistryPageProps) {
  const params = await searchParams;
  return <RegistryView urlParams={params} />;
}
