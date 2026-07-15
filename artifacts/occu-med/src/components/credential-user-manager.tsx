import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, KeyRound, Mail, Plus, RefreshCw, Shield, ShieldAlert, Trash2, UserRound } from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

export type ManagedAudience = "admin" | "client";
type ManagedRole = "super_admin" | "admin" | "client_user" | "read_only";

type ManagedUser = {
  id: number;
  email: string;
  name: string;
  role: ManagedRole;
  active: boolean;
  employerName?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
};

type CredentialHandoff = {
  name: string;
  email: string;
  password: string;
  portalUrl: string;
};

function generatePassword() {
  const groups = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnopqrstuvwxyz",
    "23456789",
    "!@#$%&*",
  ];
  const all = groups.join("");
  const values = new Uint32Array(16);
  crypto.getRandomValues(values);
  const characters = groups.map((group, index) => group[values[index] % group.length]);
  for (let index = groups.length; index < values.length; index += 1) {
    characters.push(all[values[index] % all.length]);
  }
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = values[index] % (index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join("");
}

async function readError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return payload?.error || `Request failed (${response.status})`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

export function CredentialUserManager({ audience }: { audience: ManagedAudience }) {
  const isAdminAudience = audience === "admin";
  const title = isAdminAudience ? "Admin User Management" : "Client User Management";
  const description = isAdminAudience
    ? "Create and manage credentials that can sign in to the separate Admin Render."
    : "Create and manage client credentials for the Global Coverage Atlas and associate each user with an employer.";
  const queryKey = ["managed-users", audience] as const;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
  const [createdHandoff, setCreatedHandoff] = useState<CredentialHandoff | null>(null);
  const [resetHandoff, setResetHandoff] = useState<CredentialHandoff | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    employerName: "",
    role: (isAdminAudience ? "admin" : "client_user") as ManagedRole,
  });

  const portalUrl = useMemo(() => {
    if (isAdminAudience) return window.location.origin;
    return import.meta.env.VITE_CLIENT_APP_URL || window.location.origin;
  }, [isAdminAudience]);

  const { data: users = [], isLoading } = useQuery<ManagedUser[]>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/users?audience=${audience}`, { credentials: "include" });
      if (!response.ok) throw new Error(await readError(response));
      return response.json();
    },
  });

  const createUser = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          employerName: isAdminAudience ? undefined : form.employerName,
          active: true,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      return response.json() as Promise<ManagedUser>;
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey });
      setCreatedHandoff({ name: created.name, email: created.email, password: form.password, portalUrl });
      toast({ title: `${isAdminAudience ? "Admin" : "Client"} account created` });
    },
    onError: (error) => toast({ title: "Account could not be created", description: errorMessage(error), variant: "destructive" }),
  });

  const updateUser = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const response = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(await readError(response));
      return response.json() as Promise<ManagedUser>;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
    onError: (error) => toast({ title: "User could not be updated", description: errorMessage(error), variant: "destructive" }),
  });

  const deleteUser = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/users/${id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error(await readError(response));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      toast({ title: "User deleted" });
    },
    onError: (error) => toast({ title: "User could not be deleted", description: errorMessage(error), variant: "destructive" }),
  });

  const resetCreateForm = () => {
    setForm({ name: "", email: "", password: "", employerName: "", role: isAdminAudience ? "admin" : "client_user" });
    setCreatedHandoff(null);
  };

  const submitCreate = () => {
    if (!form.name.trim() || !form.email.trim() || form.password.length < 8) {
      toast({ title: "Name, valid email, and an 8-character password are required", variant: "destructive" });
      return;
    }
    if (!isAdminAudience && !form.employerName.trim()) {
      toast({ title: "Employer is required for client tracking", variant: "destructive" });
      return;
    }
    createUser.mutate();
  };

  const submitReset = () => {
    if (!resetUser || resetPassword.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    const target = resetUser;
    const password = resetPassword;
    updateUser.mutate({ id: target.id, data: { password } }, {
      onSuccess: () => {
        setResetHandoff({ name: target.name, email: target.email, password, portalUrl });
        setResetPassword("");
        toast({ title: "Password reset" });
      },
    });
  };

  const copyCredentials = async (handoff: CredentialHandoff) => {
    await navigator.clipboard.writeText(
      `Occu-Med ${isAdminAudience ? "Atlas Administration" : "Global Coverage Atlas"}\nPortal: ${handoff.portalUrl}\nUsername: ${handoff.email}\nTemporary password: ${handoff.password}`,
    );
    toast({ title: "Credentials copied" });
  };

  const emailCredentials = (handoff: CredentialHandoff) => {
    const subject = encodeURIComponent(`Your Occu-Med ${isAdminAudience ? "Atlas Admin" : "Coverage Atlas"} credentials`);
    const body = encodeURIComponent(
      `Hello ${handoff.name},\n\nYour Occu-Med access has been created.\n\nPortal: ${handoff.portalUrl}\nUsername: ${handoff.email}\nTemporary password: ${handoff.password}\n\nPlease store these credentials securely.`,
    );
    window.location.href = `mailto:${handoff.email}?subject=${subject}&body=${body}`;
  };

  const roleIcon = (role: ManagedRole) => {
    if (role === "super_admin") return <ShieldAlert className="w-4 h-4 admin-icon" />;
    if (role === "admin") return <Shield className="w-4 h-4 admin-icon" />;
    if (role === "read_only") return <Eye className="w-4 h-4 admin-icon" />;
    return <UserRound className="w-4 h-4 admin-icon" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        <Button onClick={() => { resetCreateForm(); setCreateOpen(true); }}>
          <Plus className="w-4 h-4 mr-2 admin-icon" /> Create {isAdminAudience ? "admin" : "client"} login
        </Button>
      </div>

      <GlassPanel className="p-0 overflow-hidden">
        <Table>
          <TableHeader className="bg-white/35">
            <TableRow>
              <TableHead>User</TableHead>
              {!isAdminAudience && <TableHead>Employer</TableHead>}
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={isAdminAudience ? 5 : 6} className="text-center py-8 text-muted-foreground">Loading users…</TableCell></TableRow>
            ) : users.length === 0 ? (
              <TableRow><TableCell colSpan={isAdminAudience ? 5 : 6} className="text-center py-8 text-muted-foreground">No {audience} users found.</TableCell></TableRow>
            ) : users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="font-semibold">{user.name}</div>
                  <div className="text-xs text-muted-foreground">{user.email}</div>
                </TableCell>
                {!isAdminAudience && <TableCell>{user.employerName || "—"}</TableCell>}
                <TableCell>
                  <div className="flex items-center gap-2">
                    {roleIcon(user.role)}
                    <Select value={user.role} onValueChange={(role) => updateUser.mutate({ id: user.id, data: { role } })}>
                      <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {isAdminAudience ? (
                          <>
                            <SelectItem value="super_admin">Super Admin</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="client_user">Client User</SelectItem>
                            <SelectItem value="read_only">Read Only</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>
                <TableCell><Switch checked={user.active} onCheckedChange={(active) => updateUser.mutate({ id: user.id, data: { active } })} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}</TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-1">
                    <Button variant="ghost" size="icon" title="Set or reset password" onClick={() => { setResetHandoff(null); setResetPassword(""); setResetUser(user); }}>
                      <KeyRound className="w-4 h-4 admin-icon" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Delete user" onClick={() => { if (confirm(`Delete ${user.name}?`)) deleteUser.mutate(user.id); }}>
                      <Trash2 className="w-4 h-4 admin-icon" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </GlassPanel>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm(); }}>
        <DialogContent className="atlas-modal sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>Create {isAdminAudience ? "admin" : "client"} login</DialogTitle>
            <DialogDescription>
              Enter a password or generate one. It becomes the credential this user will use for the {isAdminAudience ? "Admin Panel" : "Client Atlas"}.
            </DialogDescription>
          </DialogHeader>
          {createdHandoff ? (
            <CredentialHandoffPanel
              handoff={createdHandoff}
              onCopy={() => void copyCredentials(createdHandoff)}
              onEmail={() => emailCredentials(createdHandoff)}
              onDone={() => { setCreateOpen(false); resetCreateForm(); }}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              <Field label="Full name *" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
              <Field label="Email / username *" type="email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} />
              {!isAdminAudience && <div className="md:col-span-2"><Field label="Employer / company *" value={form.employerName} onChange={(value) => setForm((current) => ({ ...current, employerName: value }))} /></div>}
              <PasswordField value={form.password} onChange={(password) => setForm((current) => ({ ...current, password }))} />
              <div className="space-y-2 md:col-span-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(role) => setForm((current) => ({ ...current, role: role as ManagedRole }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {isAdminAudience ? (
                      <><SelectItem value="admin">Admin</SelectItem><SelectItem value="super_admin">Super Admin</SelectItem></>
                    ) : (
                      <><SelectItem value="client_user">Client User</SelectItem><SelectItem value="read_only">Read Only</SelectItem></>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button className="md:col-span-2 mt-2" onClick={submitCreate} disabled={createUser.isPending}>
                {createUser.isPending ? "Creating account…" : "Create account and prepare credentials"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(resetUser)}
        onOpenChange={(open) => {
          if (!open) {
            setResetUser(null);
            setResetPassword("");
            setResetHandoff(null);
          }
        }}
      >
        <DialogContent className="atlas-modal sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>Set password for {resetUser?.name}</DialogTitle>
            <DialogDescription>The previous password cannot be viewed. Setting a new one immediately replaces it.</DialogDescription>
          </DialogHeader>
          {resetHandoff ? (
            <CredentialHandoffPanel
              handoff={resetHandoff}
              onCopy={() => void copyCredentials(resetHandoff)}
              onEmail={() => emailCredentials(resetHandoff)}
              onDone={() => { setResetUser(null); setResetPassword(""); setResetHandoff(null); }}
            />
          ) : (
            <div className="space-y-4 mt-3">
              <PasswordField value={resetPassword} onChange={setResetPassword} label="New password" />
              <Button className="w-full" onClick={submitReset} disabled={updateUser.isPending}>
                {updateUser.isPending ? "Saving…" : "Save new password"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CredentialHandoffPanel({ handoff, onCopy, onEmail, onDone }: { handoff: CredentialHandoff; onCopy: () => void; onEmail: () => void; onDone: () => void }) {
  return (
    <div className="space-y-4 mt-3">
      <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 space-y-2 text-sm">
        <div><span className="text-muted-foreground">Portal:</span> <strong>{handoff.portalUrl}</strong></div>
        <div><span className="text-muted-foreground">Username:</span> <strong>{handoff.email}</strong></div>
        <div><span className="text-muted-foreground">Password:</span> <strong className="font-mono">{handoff.password}</strong></div>
      </div>
      <p className="text-xs text-muted-foreground">This is the only point at which the plain-text password is available in the portal. Copy or email it now.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onCopy}><Copy className="w-4 h-4 mr-2 admin-icon" /> Copy credentials</Button>
        <Button variant="secondary" onClick={onEmail}><Mail className="w-4 h-4 mr-2 admin-icon" /> Email credentials</Button>
      </div>
      <Button className="w-full" onClick={onDone}>Done</Button>
    </div>
  );
}

function PasswordField({ value, onChange, label = "Password *" }: { value: string; onChange: (value: string) => void; label?: string }) {
  return (
    <div className="space-y-2 md:col-span-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input type="text" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Enter or generate a password" />
        <Button type="button" variant="secondary" onClick={() => onChange(generatePassword())}>
          <RefreshCw className="w-4 h-4 mr-2 admin-icon" /> Generate
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
