import { redirect } from "next/navigation";

type FileNeedPageProps = {
  searchParams: Promise<{ title?: string; problem?: string }>;
};

export default async function FileNeedPage({ searchParams }: FileNeedPageProps) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.title?.trim()) {
    qs.set("q", params.title.trim());
  }
  redirect(qs.toString() ? `/funnel?${qs}` : "/funnel");
}
