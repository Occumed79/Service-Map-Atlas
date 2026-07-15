import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { OccuMedLogo } from "@/components/occu-med-logo";

const APP_MODE = import.meta.env.VITE_APP_MODE === "admin" ? "admin" : "client";

const loginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const login = useLogin();
  const { refetch } = useAuth();
  const isAdminService = APP_MODE === "admin";

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (data: z.infer<typeof loginSchema>) => {
    login.mutate({ data }, {
      onSuccess: async (user) => {
        await refetch();

        if (isAdminService && user.role !== "admin" && user.role !== "super_admin") {
          toast({
            title: "Access unavailable",
            description: "This account is not authorized for Atlas administration.",
            variant: "destructive",
          });
          return;
        }

        setLocation(isAdminService ? "/admin" : "/");
      },
      onError: () => {
        toast({ title: "Login failed", description: "Invalid credentials.", variant: "destructive" });
      },
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-sky-200/35 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-100/45 rounded-full blur-[120px] pointer-events-none" />

      <GlassPanel className="w-full max-w-md p-8 relative z-10 rounded-[28px]">
        <div className="flex flex-col items-center mb-8 text-center">
          <OccuMedLogo className="w-[320px] max-w-[94%] h-auto mb-3" />
          <h1 className="text-2xl font-bold tracking-tight">
            {isAdminService ? "Atlas Administration" : "Global Coverage Atlas"}
          </h1>
          <p className="text-muted-foreground text-sm mt-2">
            {isAdminService
              ? "Authorized access to provider network administration."
              : "Sign in to view service coverage and coordinate requests."}
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder={isAdminService ? "authorized@occu-med.com" : "name@company.com"} {...field} />
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
                  <FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full mt-6" disabled={login.isPending}>
              {login.isPending
                ? (isAdminService ? "Opening administration…" : "Opening Atlas…")
                : (isAdminService ? "Open Admin Panel" : "Open Coverage Atlas")}
            </Button>
          </form>
        </Form>
      </GlassPanel>
    </div>
  );
}
