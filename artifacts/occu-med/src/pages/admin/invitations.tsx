import { useListInvitations, useCreateInvitation, getListInvitationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Send } from "lucide-react";
import type { InvitationInputRole } from "@workspace/api-client-react";

const inviteSchema = z.object({
  email: z.string().email("Valid email required"),
  role: z.enum(["super_admin", "admin", "client_user", "read_only"]),
  employerName: z.string().optional()
});

export default function AdminInvitations() {
  const { data: invitations = [], isLoading } = useListInvitations();
  const createInvite = useCreateInvitation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      role: "client_user",
      employerName: ""
    }
  });

  const onSubmit = (data: z.infer<typeof inviteSchema>) => {
    createInvite.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Invitation Sent", description: `Sent to ${data.email}` });
        queryClient.invalidateQueries({ queryKey: getListInvitationsQueryKey() });
        form.reset();
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Invitations</h1>
        
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Send className="w-4 h-4 mr-2" /> Send Invite
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-panel border-white/10 sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Send Invitation</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input placeholder="user@example.com" className="bg-background/50 border-white/10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background/50 border-white/10">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="client_user">Client User</SelectItem>
                          <SelectItem value="read_only">Read Only</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="employerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employer / Company (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Acme Corp" className="bg-background/50 border-white/10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full mt-4" disabled={createInvite.isPending}>
                  {createInvite.isPending ? "Sending..." : "Send Invitation"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <GlassPanel className="p-0 overflow-hidden">
        <Table>
          <TableHeader className="bg-card/50">
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sent By</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading invitations...</TableCell>
              </TableRow>
            ) : invitations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No pending invitations.</TableCell>
              </TableRow>
            ) : (
              invitations.map((i) => (
                <TableRow key={i.id} className="border-white/5 hover:bg-white/5 transition-colors">
                  <TableCell className="font-medium">{i.email}</TableCell>
                  <TableCell>{i.role}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      i.status === 'pending' ? 'bg-amber-500/10 text-amber-500' :
                      i.status === 'accepted' ? 'bg-emerald-500/10 text-emerald-500' :
                      'bg-destructive/10 text-destructive'
                    }`}>
                      {i.status}
                    </span>
                  </TableCell>
                  <TableCell>{i.invitedByName || "-"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(i.expiresAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="text-xs">Resend</Button>
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
