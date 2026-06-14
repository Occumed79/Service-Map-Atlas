import { useState } from "react";
import { useListProviders, useCreateProvider, useDeleteProvider, getListProvidersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Trash2, Edit2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AdminProviders() {
  const [search, setSearch] = useState("");
  const { data: providers = [], isLoading } = useListProviders({ search: search || undefined });
  const deleteProvider = useDeleteProvider();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this provider?")) {
      deleteProvider.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProvidersQueryKey() });
          toast({ title: "Provider Deleted" });
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Provider Directory</h1>
        <Button>
          <Plus className="w-4 h-4 mr-2" /> Add Provider
        </Button>
      </div>

      <GlassPanel className="p-4 flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search providers..." 
            className="pl-9 bg-background/50 border-white/10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </GlassPanel>

      <GlassPanel className="p-0 overflow-hidden">
        <Table>
          <TableHeader className="bg-card/50">
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading providers...</TableCell>
              </TableRow>
            ) : providers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No providers found.</TableCell>
              </TableRow>
            ) : (
              providers.map((p) => (
                <TableRow key={p.id} className="border-white/5 hover:bg-white/5 transition-colors">
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.city}, {p.state}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div>{p.email}</div>
                      <div className="text-muted-foreground">{p.phone}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs ${p.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>
                      {p.active ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(p.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
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
