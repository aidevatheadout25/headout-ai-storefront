import { redirect } from "next/navigation";

type FileNeedPageProps = {
  searchParams: Promise<{ title?: string; problem?: string }>;
};

export default async function FileNeedPage({ searchParams }: FileNeedPageProps) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  const q = params.title?.trim() || params.problem?.trim();
  if (q) {
    qs.set("q", q);
  }
  redirect(qs.toString() ? `/?${qs}` : "/");
}
