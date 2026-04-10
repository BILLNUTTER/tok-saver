import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useGetSubscriptionStatus, useGetUserPayments, useChangePassword } from "@workspace/api-client-react";
import { getApiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, User, Lock, CreditCard, Calendar, CheckCircle2, Clock,
  Mail, ArrowLeft, ShieldCheck, AlertCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Link } from "wouter";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your new password"),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

function getDaysRemaining(expiresAt: string | null | undefined): number {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000));
}

function CountdownRing({ days }: { days: number }) {
  const totalDays = 30;
  const pct = Math.min(1, days / totalDays);
  const r = 40;
  const circ = 2 * Math.PI * r;
  const dashOffset = circ * (1 - pct);
  const color = days <= 3 ? "#ef4444" : days <= 7 ? "#f97316" : "#FF1A81";

  return (
    <svg width="100" height="100" viewBox="0 0 100 100" className="shrink-0">
      <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
      <circle
        cx="50" cy="50" r={r} fill="none"
        stroke={color} strokeWidth="8"
        strokeDasharray={circ}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
      <text x="50" y="46" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="18" fontWeight="bold">
        {days}
      </text>
      <text x="50" y="62" textAnchor="middle" dominantBaseline="middle" fill="hsl(var(--muted-foreground))" fontSize="9">
        {days === 1 ? "day" : "days"}
      </text>
    </svg>
  );
}

export default function Settings() {
  const { user, isLoading: userLoading } = useAuth();
  const [_, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: subStatus, isLoading: subLoading } = useGetSubscriptionStatus();
  const { data: payments, isLoading: paymentsLoading } = useGetUserPayments();
  const changePasswordMutation = useChangePassword();

  const form = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  useEffect(() => {
    if (!userLoading && !user) setLocation("/login");
  }, [user, userLoading, setLocation]);

  if (userLoading || subLoading) {
    return (
      <div className="flex justify-center items-center flex-1 min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  const daysLeft = getDaysRemaining(subStatus?.expiresAt as string | undefined);

  function onChangePassword(values: z.infer<typeof changePasswordSchema>) {
    changePasswordMutation.mutate(
      { data: { currentPassword: values.currentPassword, newPassword: values.newPassword } },
      {
        onSuccess: () => {
          toast({ title: "Password changed", description: "Your password has been updated successfully." });
          form.reset();
        },
        onError: (err) => {
          toast({ variant: "destructive", title: "Failed", description: getApiErrorMessage(err) });
        },
      }
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">My Account</h1>
          <p className="text-sm text-muted-foreground">Manage your subscription and account settings</p>
        </div>
      </div>

      {/* Profile card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="w-4 h-4 text-primary" /> Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Name</p>
            <p className="font-medium">{user.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Email</p>
            <p className="font-medium">{user.email}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Phone</p>
            <p className="font-medium">{user.phone}</p>
          </div>
        </CardContent>
      </Card>

      {/* Subscription countdown */}
      <Card className={subStatus?.isActive ? "border-primary/30" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-4 h-4 text-primary" /> Subscription
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subStatus?.isActive ? (
            <div className="flex items-center gap-6">
              <CountdownRing days={daysLeft} />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary/20 text-primary">Pro Active</Badge>
                  {daysLeft <= 7 && (
                    <Badge variant="destructive" className="text-xs">
                      {daysLeft <= 3 ? "Expiring very soon!" : "Renew soon"}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining
                </p>
                <p className="text-xs text-muted-foreground">
                  Expires {new Date(subStatus.expiresAt as string).toLocaleDateString("en-KE", {
                    day: "numeric", month: "long", year: "numeric"
                  })}
                </p>
                <Link href="/subscribe">
                  <Button size="sm" variant="outline" className="mt-2 text-primary border-primary/30">
                    Renew Subscription
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center shrink-0">
                <AlertCircle className="w-7 h-7 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <p className="font-medium">No active subscription</p>
                <p className="text-sm text-muted-foreground">
                  {subStatus && subStatus.remainingFreeDownloads > 0
                    ? `You have ${subStatus.remainingFreeDownloads} free download${subStatus.remainingFreeDownloads !== 1 ? "s" : ""} remaining.`
                    : "You've used your free downloads."}
                </p>
                <Link href="/subscribe">
                  <Button size="sm" className="mt-1">Subscribe — {subStatus?.currency} {subStatus?.subscriptionPrice}/month</Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="w-4 h-4 text-primary" /> Payment History
          </CardTitle>
          <CardDescription>All your subscription payments</CardDescription>
        </CardHeader>
        <CardContent>
          {paymentsLoading ? (
            <div className="py-6 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
          ) : payments?.length ? (
            <div className="rounded-md border border-border overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Valid Until</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {new Date(p.paidAt).toLocaleDateString("en-KE", {
                          day: "numeric", month: "short", year: "numeric"
                        })}
                      </TableCell>
                      <TableCell className="font-semibold text-green-400 whitespace-nowrap">
                        {p.currency} {p.amountPaid.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {p.status === "active" ? (
                          <Badge className="bg-primary/20 text-primary text-xs">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Paid
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            <Clock className="w-3 h-3 mr-1" /> Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {p.paymentReference ? (
                          <span className="font-mono text-xs text-muted-foreground">
                            {p.paymentReference}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(p.expiresAt).toLocaleDateString("en-KE", {
                          day: "numeric", month: "short", year: "numeric"
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No payments yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="w-4 h-4 text-primary" /> Change Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onChangePassword)} className="space-y-4 max-w-sm">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Enter current password" {...field} data-testid="input-current-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="At least 8 characters" {...field} data-testid="input-new-password" />
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
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Repeat new password" {...field} data-testid="input-confirm-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={changePasswordMutation.isPending} data-testid="button-change-password">
                {changePasswordMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Updating…</>
                ) : "Update Password"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Contact admin */}
      <Card className="border-dashed">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center gap-4">
            <Mail className="w-8 h-8 text-primary shrink-0" />
            <div>
              <p className="font-medium text-sm">Need help?</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Contact support for billing issues, account problems, or questions.
              </p>
              <a
                href="mailto:nutterxtech@gmail.com"
                className="text-sm text-primary hover:underline mt-1 inline-block font-medium"
              >
                nutterxtech@gmail.com
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
