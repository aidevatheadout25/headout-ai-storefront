import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { ToolDetailContent } from "@/components/ToolDetailContent";
import { fetchTool } from "@/lib/api";
import type { Tool } from "@/lib/types";

type ToolDetailOverlayProps = {
  /** Tool id to load; when null the overlay is closed. */
  toolId: string | null;
  onClose: () => void;
};

/**
 * Chat-context detail view: a side panel over the conversation. It loads the
 * full record by id (same read path as the `/tools/:id` page) so the chat stays
 * visible behind it and closes back to the same conversation.
 */
export function ToolDetailOverlay({ toolId, onClose }: ToolDetailOverlayProps) {
  const [tool, setTool] = useState<Tool | null>(null);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);
  const [errored, setErrored] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!toolId) return;
    let cancelled = false;
    setTool(null);
    setLoading(true);
    setMissing(false);
    setErrored(false);
    fetchTool(toolId)
      .then((result) => {
        if (cancelled) return;
        if (result) setTool(result);
        else setMissing(true);
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
  }, [toolId, reloadKey]);

  const open = toolId !== null;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="tool-overlay__backdrop" />
        <DialogPrimitive.Content
          className="tool-overlay__panel"
          aria-describedby={undefined}
        >
          <div className="tool-overlay__bar">
            <DialogPrimitive.Title className="tool-overlay__title t-label-rg-heavy">
              Tool details
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="tool-overlay__close"
              aria-label="Close"
            >
              <Icon name="cross" size={18} />
            </DialogPrimitive.Close>
          </div>

          <div className="tool-overlay__body">
            {loading && (
              <EmptyState
                icon="hourglass"
                title="Loading…"
                description="Fetching this tool from the catalogue."
              />
            )}
            {!loading && errored && (
              <ErrorState
                title="Couldn't load this tool"
                message="The catalogue is unavailable right now. Please try again."
                onRetry={() => setReloadKey((k) => k + 1)}
              />
            )}
            {!loading && !errored && missing && (
              <EmptyState
                icon="globe"
                title="Tool not found"
                description="This listing may have been removed from the catalogue."
              />
            )}
            {!loading && !errored && tool && (
              <article className="tool-detail tool-detail--overlay">
                <ToolDetailContent
                  tool={tool}
                  onUpdated={(updated) => setTool(updated)}
                />
              </article>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
