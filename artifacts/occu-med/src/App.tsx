import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import Login from "@/pages/login";
import AcceptInvite from "@/pages/accept-invite";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminProviders from "@/pages/admin/providers";
import AdminRequests from "@/pages/admin/requests";
import AdminAnalytics from "@/pages/admin/analytics";
import AdminUsers from "@/pages/admin/users";
import AdminInvitations from "@/pages/admin/invitations";
import { AdminLayout } from "@/components/admin-layout";

const queryClient = new QueryClient();
const APP_MODE = import.meta.env.VITE_APP_MODE === "admin" ? "admin" : "client";

function ClientRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">Loading Atlas…</div>;
  }

  if (!isAuthenticated) {
    setLocation("/login");
    return null;
  }

  return <Component />;
}

function AdminRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">Loading administration…</div>;
  }

  if (!isAuthenticated) {
    setLocation("/login");
    return null;
  }

  if (user?.role !== "admin" && user?.role !== "super_admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold">Access unavailable</h1>
          <p className="text-muted-foreground mt-2">This account is not authorized for the internal administration service.</p>
        </div>
      </div>
    );
  }

  return (
    <AdminLayout>
      <Component />
    </AdminLayout>
  );
}

function AdminEntry() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">Loading administration…</div>;
  }

  if (!isAuthenticated) return <Login />;

  if (user?.role === "admin" || user?.role === "super_admin") {
    setLocation("/admin");
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">Access unavailable</h1>
        <p className="text-muted-foreground mt-2">This account is not authorized for the internal administration service.</p>
      </div>
    </div>
  );
}

function ClientRouter() {
  return (
    <Switch>
      <Route path="/" component={() => <ClientRoute component={Home} />} />
      <Route path="/login" component={Login} />
      <Route path="/accept-invite/:token" component={AcceptInvite} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AdminRouter() {
  return (
    <Switch>
      <Route path="/" component={AdminEntry} />
      <Route path="/login" component={Login} />
      <Route path="/admin" component={() => <AdminRoute component={AdminDashboard} />} />
      <Route path="/admin/providers" component={() => <AdminRoute component={AdminProviders} />} />
      <Route path="/admin/requests" component={() => <AdminRoute component={AdminRequests} />} />
      <Route path="/admin/analytics" component={() => <AdminRoute component={AdminAnalytics} />} />
      <Route path="/admin/users" component={() => <AdminRoute component={AdminUsers} />} />
      <Route path="/admin/invitations" component={() => <AdminRoute component={AdminInvitations} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const shellClass = APP_MODE === "admin"
    ? "admin-app dark text-foreground bg-background min-h-screen"
    : "client-app text-foreground bg-background min-h-screen";

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <div className={shellClass}>
              {APP_MODE === "admin" ? <AdminRouter /> : <ClientRouter />}
            </div>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
