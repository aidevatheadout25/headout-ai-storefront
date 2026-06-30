
import { KITS, getKitToolCount } from "@/lib/mockData";
import { KitTile } from "@/components/KitTile";
import { useApp } from "@/context/AppContext";

export function KitsSection() {
  const { approvedTools } = useApp();

  return (
    <section className="kits-section">
      <div className="kits-section__header">
        <h2 className="kits-section__title t-heading-md">Kits</h2>
        <p className="kits-section__caption t-para-rg">
          Curated bundles by function — jump straight into what your team needs.
        </p>
      </div>
      <div className="kits-row">
        {KITS.map((kit) => (
          <KitTile
            key={kit.id}
            kit={kit}
            toolCount={getKitToolCount(kit, approvedTools)}
          />
        ))}
      </div>
    </section>
  );
}
