import { useGetAnalyticsSummary } from "@workspace/api-client-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { BarChart3, Users, MapPin, ClipboardList, Search, CircleAlert, Gauge } from "lucide-react";

export default function AdminDashboard() {
  const { data: summary, isLoading } = useGetAnalyticsSummary();

  if (isLoading) {
    return <div className="animate-pulse">Loading dashboard...</div>;
  }

  const statCards = [
    { label: "Total Providers", value: summary?.totalProviders || 0, icon: MapPin },
    { label: "Pending Requests", value: summary?.pendingRequests || 0, icon: ClipboardList },
    { label: "Total Searches", value: summary?.totalSearches || 0, icon: Search },
    { label: "Zero Result Searches", value: summary?.zeroResultSearches || 0, icon: CircleAlert },
    { label: "Total Users", value: summary?.totalUsers || 0, icon: Users },
    { label: "Conversion Rate", value: `${((summary?.searchToRequestRate || 0) * 100).toFixed(1)}%`, icon: Gauge },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Command Center Overview</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <GlassPanel key={stat.label} className="p-6 flex items-center gap-4">
              <div className="p-4 rounded-xl bg-[#e4eef4] border border-white/80 shadow-inner admin-icon">
                <Icon className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                <p className="text-3xl font-bold">{stat.value}</p>
              </div>
            </GlassPanel>
          );
        })}
      </div>

      <GlassPanel className="p-8 mt-8 min-h-[400px] flex items-center justify-center flex-col text-muted-foreground">
        <BarChart3 className="w-16 h-16 mb-4 opacity-25 admin-icon" />
        <p className="text-lg">Detailed visualization panels available in Analytics.</p>
      </GlassPanel>
    </div>
  );
}
