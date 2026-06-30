import { redirect } from "next/navigation";

/** @deprecated Builder management removed — everyone can build */
export default function AdminBuildersPage() {
  redirect("/admin/approvals");
}
