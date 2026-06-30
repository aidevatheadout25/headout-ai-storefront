import Link from "@/compat/next-link";
import type { Kit } from "@/lib/types";

type KitTileProps = {
  kit: Kit;
  toolCount: number;
};

export function KitTile({ kit, toolCount }: KitTileProps) {
  return (
    <Link href={`/registry?kit=${kit.id}`} className="kit-tile">
      <div
        className="kit-tile__accent"
        style={{ background: `var(${kit.accentVar})` }}
        aria-hidden="true"
      />
      <div className="kit-tile__body">
        <h3 className="kit-tile__name t-heading-rg">{kit.name}</h3>
        <p className="kit-tile__desc t-para-sm">{kit.description}</p>
        <span className="kit-tile__count t-label-rg-heavy">
          {toolCount} tool{toolCount === 1 ? "" : "s"}
        </span>
      </div>
    </Link>
  );
}
