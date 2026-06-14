import { useListServiceRequests, useUpdateServiceRequest, getListServiceRequestsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { ServiceRequestUpdateStatus } from "@workspace/api-client-react";

export default function AdminRequests() {
  const { data: requests = [], isLoading } = useListServiceRequests();
  const updateRequest = useUpdateServiceRequest();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleStatusChange = (id: number, status: ServiceRequestUpdateStatus) => {
    updateRequest.mutate({ id, data: { status } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListServiceRequestsQueryKey() });
        toast({ title: "Status Updated" });
      }
    });
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case "pending": return <Badge className="bg-amber-500/20 text-amber-500 hover:bg-amber-500/30 border-none">Pending</Badge>;
      case "in_review": return <Badge className="bg-blue-500/20 text-blue-500 hover:bg-blue-500/30 border-none">In Review</Badge>;
      case "fulfilled": return <Badge className="bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30 border-none">Fulfilled</Badge>;
      case "closed": return <Badge variant="outline" className="text-muted-foreground border-white/20">Closed</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch(urgency) {
      case "urgent": return "text-destructive font-bold";
      case "high": return "text-amber-500 font-semibold";
      default: return "text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Service Requests</h1>
      </div>

      <GlassPanel className="p-0 overflow-hidden">
        <Table>
          <TableHeader className="bg-card/50">
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead>Date</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Urgency</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading requests...</TableCell>
              </TableRow>
            ) : requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No pending requests.</TableCell>
              </TableRow>
            ) : (
              requests.map((r) => (
                <TableRow key={r.id} className="border-white/5 hover:bg-white/5 transition-colors">
                  <TableCell className="whitespace-nowrap">{format(new Date(r.createdAt), "MMM d, yyyy")}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.clientName}</div>
                    <div className="text-xs text-muted-foreground">{r.employerCompany || r.clientEmail}</div>
                  </TableCell>
                  <TableCell>{r.requestedService}</TableCell>
                  <TableCell>{r.requestedLocation}</TableCell>
                  <TableCell className={getUrgencyColor(r.urgency)}>{r.urgency.toUpperCase()}</TableCell>
                  <TableCell>{getStatusBadge(r.status)}</TableCell>
                  <TableCell>
                    <Select 
                      defaultValue={r.status} 
                      onValueChange={(val) => handleStatusChange(r.id, val as ServiceRequestUpdateStatus)}
                    >
                      <SelectTrigger className="w-[130px] h-8 text-xs bg-background/50 border-white/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_review">In Review</SelectItem>
                        <SelectItem value="fulfilled">Fulfilled</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </GlassPanel>
    </div>
  );
}
