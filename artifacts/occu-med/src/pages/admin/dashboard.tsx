import { useGetAnalyticsSummary } from "@workspace/api-client-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Activity, Users, MapPin, ClipboardList, Search, AlertCircle } from "lucide-react";

export default function AdminDashboard() {
  const { data: summary, isLoading } = useGetAnalyticsSummary();

  if (isLoading) {
    return <div className="animate-pulse">Loading dashboard...</div>;
  }

  const statCards = [
    { label: "Total Providers", value: summary?.totalProviders || 0, icon: MapPin, color: "text-blue-400" },
    { label: "Pending Requests", value: summary?.pendingRequests || 0, icon: ClipboardList, color: "text-amber-400" },
    { label: "Total Searches", value: summary?.totalSearches || 0, icon: Search, color: "text-teal-400" },
    { label: "Zero Result Searches", value: summary?.zeroResultSearches || 0, icon: AlertCircle, color: "text-red-400" },
    { label: "Total Users", value: summary?.totalUsers || 0, icon: Users, color: "text-indigo-400" },
    { label: "Conversion Rate", value: `${((summary?.searchToRequestRate || 0) * 100).toFixed(1)}%`, icon: Activity, color: "text-emerald-400" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Command Center Overview</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <GlassPanel key={i} className="p-6 flex items-center gap-4">
              <div className={`p-4 rounded-xl bg-card border border-white/5 shadow-inner ${stat.color}`}>
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
        <Activity className="w-16 h-16 mb-4 opacity-20" />
        <p className="text-lg">Detailed visualization panels available in Analytics tab.</p>
      </GlassPanel>
    </div>
  );
}
