import { redirect } from "next/navigation";

/** @deprecated Intake lives on the home chat */
export default function FunnelPage() {
  redirect("/");
}
