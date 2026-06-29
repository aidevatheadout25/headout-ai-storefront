import { NextResponse } from "next/server";
import { analyzeZepManifest } from "@/lib/analyzeZep";
import type { ZepManifest } from "@/lib/zeps";

export async function POST(request: Request) {
  let body: { manifest?: ZepManifest };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.manifest || typeof body.manifest !== "object") {
    return NextResponse.json({ error: "manifest is required" }, { status: 400 });
  }

  const draft = await analyzeZepManifest(body.manifest);
  return NextResponse.json(draft);
}
