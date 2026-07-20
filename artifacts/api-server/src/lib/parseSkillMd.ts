/**
 * Parse a Claude/Cursor-style SKILL.md (YAML frontmatter + markdown body).
 * Used by the add-tool flow so teammates can upload a skill file instead of
 * pasting a URL.
 */

export type ParsedSkillMd = {
  name: string;
  description: string;
  body: string;
  /** Raw frontmatter keys (lowercased) for optional extras. */
  frontmatter: Record<string, string>;
};

const MAX_SKILL_CHARS = 200_000;

export class SkillMdParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillMdParseError";
  }
}

/**
 * Minimal YAML-ish frontmatter reader: `key: value` lines only (no nested
 * objects). Matches how Headout skill files are authored today.
 */
function parseFrontmatterBlock(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    let value = line.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

/**
 * Parse SKILL.md text into name / description / body.
 * Requires a `---` frontmatter block with at least `name` or `description`.
 */
export function parseSkillMd(raw: string): ParsedSkillMd {
  const text = raw.replace(/^\uFEFF/, "");
  if (!text.trim()) {
    throw new SkillMdParseError("That file is empty");
  }
  if (text.length > MAX_SKILL_CHARS) {
    throw new SkillMdParseError(
      `Skill file is too large (max ${MAX_SKILL_CHARS.toLocaleString()} characters)`,
    );
  }

  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new SkillMdParseError(
      "That doesn't look like a SKILL.md (needs YAML frontmatter with name/description). For docs or apps, paste a URL instead.",
    );
  }

  const frontmatter = parseFrontmatterBlock(match[1] ?? "");
  const body = (match[2] ?? "").trim();
  const name = (frontmatter.name ?? frontmatter.title ?? "").trim();
  const description = (frontmatter.description ?? "").trim();

  if (!name && !description) {
    throw new SkillMdParseError(
      "Frontmatter needs at least a name or description field",
    );
  }

  return { name, description, body, frontmatter };
}
