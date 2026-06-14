import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import NotFound from "@/pages/not-found";

// Pages
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

function AdminRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">Loading...</div>;

  if (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    setLocation("/login");
    return null;
  }

  return (
    <AdminLayout>
      <Component />
    </AdminLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/accept-invite/:token" component={AcceptInvite} />
      
      {/* Admin Routes */}
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
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <div className="dark text-foreground bg-background min-h-screen">
              <Router />
            </div>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
