import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useGetInvitation, useAcceptInvitation } from "@workspace/api-client-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { Activity, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";

const acceptSchema = z.object({
  name: z.string().min(2, "Name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { refetch } = useAuth();
  
  // Need custom fetch hook if token is provided
  // We have useGetInvitation(token)
  // Need to handle missing query config properly in generated hook, using manual check or fallback
  const { data: invitation, isError, isLoading } = useGetInvitation(token || "", { query: { enabled: !!token, retry: false, queryKey: ["invitation", token] } });
  
  const acceptInvite = useAcceptInvitation();

  const form = useForm<z.infer<typeof acceptSchema>>({
    resolver: zodResolver(acceptSchema),
    defaultValues: {
      name: "",
      password: "",
      confirmPassword: ""
    }
  });

  const onSubmit = (data: z.infer<typeof acceptSchema>) => {
    if (!token) return;
    acceptInvite.mutate({ token, data: { name: data.name, password: data.password } }, {
      onSuccess: () => {
        toast({ title: "Account Created", description: "Welcome to Occu-Med." });
        refetch();
        setLocation("/login"); // Let login page redirect to appropriate dash
      },
      onError: () => {
        toast({ title: "Setup Failed", description: "Invalid or expired token.", variant: "destructive" });
      }
    });
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background">Loading...</div>;

  if (isError || !invitation) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background relative overflow-hidden">
        <GlassPanel className="w-full max-w-md p-8 relative z-10 text-center">
          <ShieldCheck className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-destructive mb-2">Invalid Invitation</h1>
          <p className="text-muted-foreground mb-6">This invitation link is invalid or has expired.</p>
          <Button onClick={() => setLocation("/login")} variant="outline" className="w-full">Return to Login</Button>
        </GlassPanel>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[120px] pointer-events-none" />
      
      <GlassPanel className="w-full max-w-md p-8 relative z-10">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-card border border-white/10 flex items-center justify-center shadow-lg shadow-primary/20 mb-4">
            <Activity className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Complete Your Account</h1>
          <p className="text-muted-foreground text-sm mt-1">Invited to join as {invitation.role.replace("_", " ")}</p>
          <p className="text-sm font-medium mt-2">{invitation.email}</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" className="bg-background/50 border-white/10" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" className="bg-background/50 border-white/10" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" className="bg-background/50 border-white/10" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full mt-6" disabled={acceptInvite.isPending}>
              {acceptInvite.isPending ? "Creating Account..." : "Create Account"}
            </Button>
          </form>
        </Form>
      </GlassPanel>
    </div>
  );
}
