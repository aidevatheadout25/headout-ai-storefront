import { RegistryView } from "@/components/RegistryView";
import { registryParamsFromSearchParams } from "@/lib/registryNav";
import { useSearchParams } from "@/compat/next-navigation";

export default function RegistryPage() {
  const searchParams = useSearchParams();
  const params = registryParamsFromSearchParams(searchParams);
  return <RegistryView urlParams={params} />;
}
