import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useLogout } from "@workspace/api-client-react";
import { LayoutDashboard, MapPin, ClipboardList, BarChart3, UserCog, Users, Send, LogOut } from "lucide-react";
import { OccuMedLogo } from "@/components/occu-med-logo";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/providers", label: "Coverage & Providers", icon: MapPin },
  { href: "/admin/requests", label: "Requests", icon: ClipboardList },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/users", label: "Admin Users", icon: UserCog },
  { href: "/admin/client-users", label: "Client Users", icon: Users },
  { href: "/admin/invitations", label: "Invitations", icon: Send },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const logout = useLogout();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        setLocation("/login");
        window.location.reload();
      },
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="w-full md:w-64 p-4 flex flex-col gap-4 z-10 shrink-0 border-r border-slate-200/70 bg-white/38 backdrop-blur-2xl">
        <div className="px-3 pt-2 pb-3 text-center">
          <OccuMedLogo className="w-full max-w-[210px] mx-auto h-auto [filter:drop-shadow(0_0_1px_rgba(88,67,34,0.95))_drop-shadow(0_0_5px_rgba(255,250,225,1))_drop-shadow(0_0_14px_rgba(232,208,150,0.9))]" />
          <p className="mt-3 px-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Atlas Administration</p>
        </div>

        <nav className="flex-1 flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;

            return (
              <Link key={item.href} href={item.href}>
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all border ${
                  isActive
                    ? "bg-[#d8e7f1] text-[#173b5c] border-[#9ebed2] shadow-sm"
                    : "text-slate-600 hover:bg-white/70 hover:text-[#173b5c] border-transparent"
                }`}>
                  <Icon className="w-5 h-5 admin-icon" />
                  <span className="font-medium text-sm">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-4 border-t border-slate-200/80">
          <div className="px-4 py-3 mb-2">
            <p className="text-sm font-semibold text-foreground">{user?.name}</p>
            <p className="text-xs text-muted-foreground break-all">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 overflow-y-auto relative h-screen">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-sky-200/20 rounded-full blur-[150px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-100/25 rounded-full blur-[150px] pointer-events-none" />
        <div className="relative z-10 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
