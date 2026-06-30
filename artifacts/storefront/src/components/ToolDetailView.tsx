import { useEffect, useState } from "react";
import { useParams, notFound } from "@/compat/next-navigation";
import Link from "@/compat/next-link";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/EmptyState";
import { ToolDetailContent } from "@/components/ToolDetailContent";
import { fetchTool } from "@/lib/api";
import { ErrorState } from "@/components/ErrorState";
import type { Tool } from "@/lib/types";

export function ToolDetailView() {
  const params = useParams();
  const id = params.id as string;

  const [tool, setTool] = useState<Tool | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [errored, setErrored] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMissing(false);
    setErrored(false);
    fetchTool(id)
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setTool(result);
        } else {
          setMissing(true);
        }
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  if (loading) {
    return (
      <EmptyState
        icon="hourglass"
        title="Loading…"
        description="Fetching this tool from the catalogue."
      />
    );
  }

  if (errored) {
    return (
      <ErrorState
        title="Couldn't load this tool"
        message="The catalogue is unavailable right now. Please try again."
        onRetry={() => setReloadKey((k) => k + 1)}
      />
    );
  }

  if (missing || !tool) {
    notFound();
  }

  return (
    <article className="tool-detail">
      <Link href="/registry" className="tool-detail__back t-para-rg text-link">
        <Icon
          name="chevron-right"
          size={16}
          style={{ transform: "rotate(180deg)" }}
        />
        Back to registry
      </Link>

      <ToolDetailContent tool={tool} onUpdated={(updated) => setTool(updated)} />
    </article>
  );
}
