import { useGetAnalyticsSummary, useGetTopServices, useGetTopLocations, useGetZeroResultSearches } from "@workspace/api-client-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Activity, AlertTriangle, Map, BarChart } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminAnalytics() {
  const { data: summary } = useGetAnalyticsSummary();
  const { data: topServices = [] } = useGetTopServices({ limit: 5 });
  const { data: topLocations = [] } = useGetTopLocations({ limit: 5 });
  const { data: zeroResults = [] } = useGetZeroResultSearches({ limit: 5 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Intelligence Analytics</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Services */}
        <GlassPanel className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold">Top Requested Services</h2>
          </div>
          <div className="space-y-4">
            {topServices.map((service, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm font-medium">{service.serviceType}</span>
                <span className="text-sm text-primary bg-primary/10 px-2 py-1 rounded-full">{service.count}</span>
              </div>
            ))}
            {topServices.length === 0 && <p className="text-muted-foreground text-sm">No data available.</p>}
          </div>
        </GlassPanel>

        {/* Top Locations */}
        <GlassPanel className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Map className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold">High Demand Regions</h2>
          </div>
          <div className="space-y-4">
            {topLocations.map((loc, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm font-medium">{loc.city}{loc.state ? `, ${loc.state}` : ''}</span>
                <span className="text-sm text-primary bg-primary/10 px-2 py-1 rounded-full">{loc.count}</span>
              </div>
            ))}
            {topLocations.length === 0 && <p className="text-muted-foreground text-sm">No data available.</p>}
          </div>
        </GlassPanel>

        {/* Zero Result Searches */}
        <GlassPanel className="p-6 md:col-span-2 border-destructive/20">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <h2 className="text-xl font-bold">Zero-Result Searches (Coverage Gaps)</h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5">
                  <TableHead>Search Text</TableHead>
                  <TableHead>Service Filter</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zeroResults.map((zr) => (
                  <TableRow key={zr.id} className="border-white/5">
                    <TableCell className="font-medium">{zr.searchText}</TableCell>
                    <TableCell>{zr.selectedServiceType || "None"}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(zr.timestamp).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
                {zeroResults.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-4">No zero-result searches recorded recently.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
