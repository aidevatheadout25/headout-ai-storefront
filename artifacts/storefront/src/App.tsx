import { Component, type ReactNode } from "react";
import { Switch, Route, Redirect, Router as WouterRouter, useSearch } from "wouter";
import { Sidebar } from "@/components/Sidebar";
import { AuthProvider } from "@/lib/auth-context";
import { ConversationsProvider } from "@/lib/conversations-context";
import { NotFoundError } from "@/compat/next-navigation";
import HomePage from "@/pages/home";
import RegistryPage from "@/pages/registry";
import ToolDetailPage from "@/pages/tool-detail";
import NotFound from "@/pages/not-found";

class NotFoundBoundary extends Component<
  { children: ReactNode; routeKey: string },
  { notFound: boolean }
> {
  state = { notFound: false };

  static getDerivedStateFromError(error: unknown) {
    if (error instanceof NotFoundError) {
      return { notFound: true };
    }
    throw error;
  }

  componentDidUpdate(prevProps: { routeKey: string }) {
    if (prevProps.routeKey !== this.props.routeKey && this.state.notFound) {
      this.setState({ notFound: false });
    }
  }

  render() {
    if (this.state.notFound) {
      return <NotFound />;
    }
    return this.props.children;
  }
}

function Routes() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/registry" component={RegistryPage} />
      <Route path="/tools/:id" component={ToolDetailPage} />
      {/* Obsolete flows (submit / build / admin / funnel) now route back to the chat front door. */}
      <Route path="/submit">
        <Redirect to="/" replace />
      </Route>
      <Route path="/build">
        <Redirect to="/" replace />
      </Route>
      <Route path="/funnel">
        <Redirect to="/" replace />
      </Route>
      <Route path="/requests">
        <Redirect to="/" replace />
      </Route>
      <Route path="/file-need">
        <Redirect to="/" replace />
      </Route>
      <Route path="/my-submissions">
        <Redirect to="/" replace />
      </Route>
      <Route path="/edit/:id">
        <Redirect to="/" replace />
      </Route>
      <Route path="/admin/:rest*">
        <Redirect to="/" replace />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function RoutedMain() {
  const search = useSearch();
  return (
    <NotFoundBoundary routeKey={`${window.location.pathname}?${search}`}>
      <Routes />
    </NotFoundBoundary>
  );
}

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <AuthProvider>
        <ConversationsProvider>
          <div className="app-shell">
            <Sidebar />
            <div className="app-content">
              <main className="app-main">
                <RoutedMain />
              </main>
            </div>
          </div>
        </ConversationsProvider>
      </AuthProvider>
    </WouterRouter>
  );
}

export default App;
