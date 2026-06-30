import { Component, type ReactNode } from "react";
import { Switch, Route, Redirect, Router as WouterRouter, useSearch } from "wouter";
import { AppProvider } from "@/context/AppContext";
import { Sidebar } from "@/components/Sidebar";
import { NotFoundError } from "@/compat/next-navigation";
import HomePage from "@/pages/home";
import RegistryPage from "@/pages/registry";
import SubmitPage from "@/pages/submit";
import MySubmissionsPage from "@/pages/my-submissions";
import ToolDetailPage from "@/pages/tool-detail";
import EditToolPage from "@/pages/edit";
import ApprovalsPage from "@/pages/approvals";
import AdminMetricsPage from "@/pages/metrics";
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

function FileNeedRedirect() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const q = (params.get("title")?.trim() || params.get("problem")?.trim()) ?? "";
  const target = q ? `/?q=${encodeURIComponent(q)}` : "/";
  return <Redirect to={target} replace />;
}

function Routes() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/registry" component={RegistryPage} />
      <Route path="/submit" component={SubmitPage} />
      <Route path="/my-submissions" component={MySubmissionsPage} />
      <Route path="/tools/:id" component={ToolDetailPage} />
      <Route path="/edit/:id" component={EditToolPage} />
      <Route path="/admin/approvals" component={ApprovalsPage} />
      <Route path="/admin/metrics" component={AdminMetricsPage} />
      <Route path="/admin/builders">
        <Redirect to="/admin/approvals" replace />
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
      <Route path="/file-need" component={FileNeedRedirect} />
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
      <AppProvider>
        <div className="app-shell">
          <Sidebar />
          <div className="app-content">
            <main className="app-main">
              <RoutedMain />
            </main>
          </div>
        </div>
      </AppProvider>
    </WouterRouter>
  );
}

export default App;
