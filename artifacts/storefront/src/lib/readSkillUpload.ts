import { strFromU8, unzipSync } from "fflate";

/**
 * Read a Claude/Cursor skill upload into SKILL.md text.
 * Accepts bare SKILL.md / .md, or a packaged `.skill` / `.zip` (zip with SKILL.md inside).
 */
export async function readSkillUpload(file: File): Promise<string> {
  const lower = file.name.toLowerCase();

  if (
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    lower.endsWith(".txt") ||
    lower === "skill.md"
  ) {
    return file.text();
  }

  if (lower.endsWith(".skill") || lower.endsWith(".zip")) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(bytes);
    } catch {
      throw new Error(
        "Couldn't open that .skill package — it should be a zip containing SKILL.md.",
      );
    }

    const paths = Object.keys(entries).filter(
      (p) => !p.endsWith("/") && entries[p] && entries[p].length > 0,
    );
    const skillPath =
      paths.find((p) => /(?:^|\/)skill\.md$/i.test(p)) ??
      paths.find((p) => /skill\.md$/i.test(p));

    if (!skillPath) {
      throw new Error(
        "No SKILL.md found inside that package. Zip the skill folder so it contains SKILL.md.",
      );
    }

    return strFromU8(entries[skillPath]);
  }

  throw new Error(
    "Upload a .skill package or a SKILL.md file (not a folder, PDF, or doc).",
  );
}

export function isSkillUploadFilename(name: string): boolean {
  return /\.(skill|zip|md|markdown|txt)$/i.test(name);
}
