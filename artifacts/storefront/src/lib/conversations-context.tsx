import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { fetchConversations, type ConversationSummary } from "@/lib/api";
import { useAuthContext } from "@/lib/auth-context";

type ConversationsContextValue = {
  conversations: ConversationSummary[];
  isLoading: boolean;
  refresh: () => Promise<void>;
};

const ConversationsContext = createContext<ConversationsContextValue | null>(
  null,
);

/**
 * Loads the signed-in user's saved chats and exposes a `refresh()` the chat view
 * calls after a new conversation is created or a turn is appended, so the
 * history list stays current without a page reload.
 */
export function ConversationsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuthContext();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setConversations([]);
      return;
    }
    setIsLoading(true);
    try {
      const list = await fetchConversations();
      setConversations(list);
    } catch {
      // Keep whatever we last had; the sidebar just won't update this time.
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      void refresh();
    } else {
      setConversations([]);
    }
  }, [isAuthenticated, refresh]);

  return (
    <ConversationsContext.Provider value={{ conversations, isLoading, refresh }}>
      {children}
    </ConversationsContext.Provider>
  );
}

export function useConversationsContext(): ConversationsContextValue {
  const ctx = useContext(ConversationsContext);
  if (!ctx) {
    throw new Error(
      "useConversationsContext must be used within a ConversationsProvider",
    );
  }
  return ctx;
}
