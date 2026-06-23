import Link from "next/link";
import { ButtonLink } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { buildFunnelUrl } from "@/lib/askBar";
import type { Kit } from "@/lib/types";
import { STOREFRONT_SLACK_CHANNEL, STOREFRONT_SLACK_URL } from "@/lib/toolMeta";

type ZeroResultsPanelProps = {
  query: string;
  kits: Kit[];
  leadMessage?: string;
};

export function ZeroResultsPanel({ query, kits, leadMessage }: ZeroResultsPanelProps) {
  const displayQuery = query.trim() || "your search";

  return (
    <div className="zero-results">
      <p className="zero-results__lead t-para-md">
        {leadMessage ??
          `Nothing matched "${displayQuery}" — here are some next steps.`}
      </p>

      {kits.length > 0 && (
        <section className="zero-results__section">
          <h3 className="zero-results__heading t-subheading-rg">Closest kits</h3>
          <ul className="zero-results__kits">
            {kits.map((kit) => (
              <li key={kit.id}>
                <Link
                  href={`/registry?kit=${kit.id}`}
                  className="zero-results__kit t-para-rg text-link"
                >
                  {kit.name}
                </Link>
                <span className="zero-results__kit-desc t-para-sm text-muted">
                  {kit.description}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="zero-results__actions">
        <ButtonLink
          href={buildFunnelUrl(query)}
          variant="primary"
          size="sm"
        >
          Start guided intake
        </ButtonLink>
        <Link href="/requests" className="zero-results__registry t-para-rg text-link">
          Browse open requests
        </Link>
        <a
          href={STOREFRONT_SLACK_URL}
          className="zero-results__slack t-para-rg text-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="mail" size={16} />
          Ask in {STOREFRONT_SLACK_CHANNEL}
        </a>
      </div>
    </div>
  );
}
