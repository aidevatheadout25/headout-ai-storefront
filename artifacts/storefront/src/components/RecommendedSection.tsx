
import { ToolCard } from "@/components/ToolCard";
import { useApp } from "@/context/AppContext";
import {
  getMockTeamLabel,
  getRecommendedTools,
} from "@/lib/recommendations";
import { ROLE_LABELS } from "@/lib/types";

export function RecommendedSection() {
  const { role, approvedTools } = useApp();
  const recommended = getRecommendedTools(role, approvedTools);
  const mockTeam = getMockTeamLabel(role);

  return (
    <section className="recommended-section">
      <div className="recommended-section__header">
        <h2 className="recommended-section__title t-heading-md">
          Recommended for you
        </h2>
        <p className="recommended-section__caption t-para-rg">
          Based on your role ({ROLE_LABELS[role].toLowerCase()}) and team (
          {mockTeam}).
        </p>
      </div>
      <div className="tool-grid tool-grid--compact">
        {recommended.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </div>
    </section>
  );
}
