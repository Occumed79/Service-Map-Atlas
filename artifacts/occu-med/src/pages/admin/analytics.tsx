import { useGetTopServices, useGetTopLocations, useGetZeroResultSearches } from "@workspace/api-client-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { AlertTriangle, Map, BarChart3 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminAnalytics() {
  const { data: topServices = [] } = useGetTopServices({ limit: 5 });
  const { data: topLocations = [] } = useGetTopLocations({ limit: 5 });
  const { data: zeroResults = [] } = useGetZeroResultSearches({ limit: 5 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Intelligence Analytics</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <GlassPanel className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 admin-icon" />
            <h2 className="text-xl font-bold">Top Requested Services</h2>
          </div>
          <div className="space-y-4">
            {topServices.map((service) => (
              <div key={service.serviceType} className="flex items-center justify-between">
                <span className="text-sm font-medium">{service.serviceType}</span>
                <span className="text-sm text-[#173b5c] bg-[#d8e7f1] px-2 py-1 rounded-full">{service.count}</span>
              </div>
            ))}
            {topServices.length === 0 && <p className="text-muted-foreground text-sm">No data available.</p>}
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Map className="w-5 h-5 admin-icon" />
            <h2 className="text-xl font-bold">High Demand Regions</h2>
          </div>
          <div className="space-y-4">
            {topLocations.map((location) => (
              <div key={`${location.city}-${location.state || ""}`} className="flex items-center justify-between">
                <span className="text-sm font-medium">{location.city}{location.state ? `, ${location.state}` : ""}</span>
                <span className="text-sm text-[#173b5c] bg-[#d8e7f1] px-2 py-1 rounded-full">{location.count}</span>
              </div>
            ))}
            {topLocations.length === 0 && <p className="text-muted-foreground text-sm">No data available.</p>}
          </div>
        </GlassPanel>

        <GlassPanel className="p-6 md:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 admin-icon" />
            <h2 className="text-xl font-bold">Zero-Result Searches (Coverage Gaps)</h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Search Text</TableHead>
                  <TableHead>Service Filter</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zeroResults.map((result) => (
                  <TableRow key={result.id}>
                    <TableCell className="font-medium">{result.searchText}</TableCell>
                    <TableCell>{result.selectedServiceType || "None"}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(result.timestamp).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
                {zeroResults.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">No zero-result searches recorded recently.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
