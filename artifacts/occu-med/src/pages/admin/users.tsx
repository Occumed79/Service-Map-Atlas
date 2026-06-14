import { useListUsers, useUpdateUser, useDeleteUser, getListUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Shield, ShieldAlert, User, Eye, Trash2 } from "lucide-react";
import type { UserUpdateRole } from "@workspace/api-client-react";

export default function AdminUsers() {
  const { data: users = [], isLoading } = useListUsers();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleRoleChange = (id: number, role: UserUpdateRole) => {
    updateUser.mutate({ id, data: { role } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: "Role Updated" });
      }
    });
  };

  const handleStatusChange = (id: number, active: boolean) => {
    updateUser.mutate({ id, data: { active } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: active ? "User Enabled" : "User Disabled" });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Permanently delete this user?")) {
      deleteUser.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          toast({ title: "User Deleted" });
        }
      });
    }
  };

  const getRoleIcon = (role: string) => {
    switch(role) {
      case "super_admin": return <ShieldAlert className="w-4 h-4 text-primary" />;
      case "admin": return <Shield className="w-4 h-4 text-blue-400" />;
      case "client_user": return <User className="w-4 h-4 text-emerald-400" />;
      case "read_only": return <Eye className="w-4 h-4 text-muted-foreground" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
      </div>

      <GlassPanel className="p-0 overflow-hidden">
        <Table>
          <TableHeader className="bg-card/50">
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead>User</TableHead>
              <TableHead>Employer</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading users...</TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No users found.</TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id} className="border-white/5 hover:bg-white/5 transition-colors">
                  <TableCell>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell>{u.employerName || "-"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getRoleIcon(u.role)}
                      <Select 
                        defaultValue={u.role} 
                        onValueChange={(val) => handleRoleChange(u.id, val as UserUpdateRole)}
                      >
                        <SelectTrigger className="w-[140px] h-8 text-xs bg-background/50 border-white/10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="super_admin">Super Admin</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="client_user">Client User</SelectItem>
                          <SelectItem value="read_only">Read Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch 
                      checked={u.active} 
                      onCheckedChange={(val) => handleStatusChange(u.id, val)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(u.id)}>
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
