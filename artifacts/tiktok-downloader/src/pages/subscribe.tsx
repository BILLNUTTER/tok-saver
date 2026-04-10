import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useGetSubscriptionStatus, useInitiateSubscription, useVerifyPayment } from "@workspace/api-client-react";
import { getApiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, ArrowLeft, Smartphone, ShieldCheck, Info, RefreshCw } from "lucide-react";
import { useEffect, useState, useRef } from "react";

const POLL_INTERVAL_MS = 2000;   // lightweight DB check every 2s — fast detection
const MAX_POLL_ATTEMPTS = 30;    // 30 × 2s = 60s before "taking longer" message

export default function Subscribe() {
  const { user, isLoading: userLoading } = useAuth();
  const [_, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: subStatus, isLoading: subLoading, refetch: refetchStatus } = useGetSubscriptionStatus();
  const subscribeMutation = useInitiateSubscription();
  const verifyMutation = useVerifyPayment();   // hits Paylor API — only on user request

  const [payPhone, setPayPhone] = useState("");
  const [phoneEdited, setPhoneEdited] = useState(false);
  const [plan, setPlan] = useState<"weekly" | "monthly">("monthly");
  const [stkSent, setStkSent] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (!userLoading && !user) {
      toast({ title: "Authentication required", description: "Please login to subscribe" });
      setLocation("/login");
    }
  }, [user, userLoading, setLocation, toast]);

  useEffect(() => {
    if (user?.phone && !phoneEdited) setPayPhone(user.phone);
  }, [user?.phone, phoneEdited]);

  // Seconds counter for UX
  useEffect(() => {
    if (!stkSent) { setSecondsElapsed(0); return; }
    const t = setInterval(() => setSecondsElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [stkSent]);

  // After STK push: poll the DB-only status endpoint every 4 seconds.
  // This is lightweight — no external API calls, relies on the Paylor webhook to update the DB.
  // The user can also manually trigger a Paylor API check via the "I've Paid" button.
  useEffect(() => {
    if (!stkSent) return;
    setTimedOut(false);
    attemptsRef.current = 0;

    pollRef.current = setInterval(async () => {
      attemptsRef.current += 1;

      if (attemptsRef.current > MAX_POLL_ATTEMPTS) {
        clearInterval(pollRef.current!);
        setTimedOut(true);
        return;
      }

      const result = await refetchStatus();
      if (result.data?.isActive) {
        clearInterval(pollRef.current!);
        toast({ title: "Payment confirmed!", description: "Your Pro subscription is now active." });
        setLocation("/");
      }
    }, POLL_INTERVAL_MS);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [stkSent]); // eslint-disable-line react-hooks/exhaustive-deps

  // If already active at any point, clear the poll and redirect
  useEffect(() => {
    if (subStatus?.isActive && stkSent) {
      if (pollRef.current) clearInterval(pollRef.current);
      toast({ title: "Payment confirmed!", description: "Your Pro subscription is now active." });
      setLocation("/");
    }
  }, [subStatus?.isActive, stkSent]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleManualCheck = () => {
    // Calls Paylor API directly to check transaction status — use sparingly
    verifyMutation.mutate(undefined, {
      onSuccess: (data) => {
        if (data.isActive) {
          if (pollRef.current) clearInterval(pollRef.current);
          toast({ title: "Payment confirmed!", description: "Your Pro subscription is now active." });
          setLocation("/");
        } else {
          toast({
            title: "Not confirmed yet",
            description: "Payment is still pending. If you entered your PIN, please wait a moment and try again.",
          });
        }
      },
      onError: (error: unknown) => {
        toast({
          variant: "destructive",
          title: "Check failed",
          description: getApiErrorMessage(error, "Could not verify payment. Please try again."),
        });
      },
    });
  };

  if (userLoading || subLoading) {
    return (
      <div className="flex justify-center items-center flex-1">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (subStatus?.isActive) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center shadow-lg border-primary/20">
          <CardContent className="pt-8 space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">You're already Pro!</h2>
            <p className="text-muted-foreground">Your subscription is active. You have unlimited downloads.</p>
            <Button className="mt-4 w-full" onClick={() => setLocation("/")}>Go to Downloader</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (stkSent) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm text-center shadow-xl border-primary/20">
          <CardContent className="pt-10 pb-10 space-y-6">

            {timedOut ? (
              /* Timed out — let them manually verify or retry */
              <>
                <div className="w-16 h-16 rounded-full bg-amber-400/10 flex items-center justify-center mx-auto">
                  <Smartphone className="w-8 h-8 text-amber-400" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold">Taking longer than usual</h2>
                  <p className="text-muted-foreground text-sm">
                    If you completed the M-Pesa payment, tap below to check. Otherwise contact support.
                  </p>
                  <a href="mailto:nutterxtech@gmail.com" className="text-primary text-sm font-semibold hover:underline block mt-2">
                    nutterxtech@gmail.com
                  </a>
                </div>
                <Button
                  className="w-full"
                  onClick={handleManualCheck}
                  disabled={verifyMutation.isPending}
                  data-testid="button-check-payment"
                >
                  {verifyMutation.isPending
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Checking…</>
                    : <><RefreshCw className="w-4 h-4 mr-2" /> I've Paid — Check Now</>
                  }
                </Button>
                <Button variant="outline" className="w-full" onClick={() => { setStkSent(false); setTimedOut(false); }}>
                  Try Again
                </Button>
              </>
            ) : (
              /* Waiting — spinner + manual check button */
              <>
                <div className="relative w-20 h-20 mx-auto">
                  <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
                  <div className="relative w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center">
                    <Loader2 className="w-9 h-9 text-primary animate-spin" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-xl font-bold">
                    {subscribeMutation.isPending ? "Sending M-Pesa prompt…" : "Waiting for payment…"}
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {subscribeMutation.isPending
                      ? <>Contacting M-Pesa for <strong>{payPhone}</strong>. This takes a few seconds.</>
                      : <>Enter your M-Pesa PIN on <strong>{payPhone}</strong>.<br />This will confirm automatically.</>
                    }
                  </p>
                </div>

                <p className="text-xs text-muted-foreground tabular-nums">
                  {secondsElapsed}s elapsed
                </p>

                {/* Manual check — only show once the STK push has been sent */}
                {!subscribeMutation.isPending && (
                  <Button
                    variant="outline"
                    className="w-full border-primary/30 text-primary hover:bg-primary/10"
                    onClick={handleManualCheck}
                    disabled={verifyMutation.isPending}
                    data-testid="button-check-payment"
                  >
                    {verifyMutation.isPending
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Checking…</>
                      : <><RefreshCw className="w-4 h-4 mr-2" /> I've Paid — Check Now</>
                    }
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground text-xs"
                  onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setStkSent(false); }}
                >
                  Didn't get prompt? Send again
                </Button>
              </>
            )}

          </CardContent>
        </Card>
      </div>
    );
  }

  const monthlyPrice = subStatus?.subscriptionPrice || 49;
  const weeklyPrice = subStatus?.weeklyPrice || 19;
  const price = plan === "weekly" ? weeklyPrice : monthlyPrice;
  const currency = subStatus?.currency || "KES";

  const handleSubscribe = () => {
    // Show the waiting screen immediately — don't make the user stare at a
    // loading button for 17s while Paylor sends the STK push to Safaricom.
    // The M-Pesa prompt will arrive on their phone ~17s later.
    setStkSent(true);

    subscribeMutation.mutate(
      { data: { phone: payPhone || undefined, plan } },
      {
        onError: (error: unknown) => {
          // Roll back optimistic transition if STK push itself failed
          setStkSent(false);
          toast({
            variant: "destructive",
            title: "Payment initiation failed",
            description: getApiErrorMessage(error, "Could not start payment process."),
          });
        },
      }
    );
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 py-12">
      <div className="w-full max-w-lg space-y-4">

        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground -ml-1"
          onClick={() => setLocation("/")}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>

        <div className="relative overflow-hidden rounded-2xl border border-primary/20 shadow-2xl bg-card">
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl -ml-24 -mb-24 pointer-events-none" />

          <div className="relative p-8 text-center space-y-2 pt-10 border-b border-border">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest">Pro Plan</p>
            <h1 className="text-4xl font-extrabold tracking-tight">Unlock Unlimited</h1>
            <p className="text-muted-foreground">Full access to all features</p>

            {/* Plan toggle */}
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => setPlan("weekly")}
                className={`flex-1 max-w-[140px] rounded-xl py-2.5 text-sm font-semibold transition-all border ${
                  plan === "weekly"
                    ? "bg-primary text-primary-foreground border-primary shadow-md"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50"
                }`}
              >
                Weekly
                <div className={`text-xs font-normal ${plan === "weekly" ? "opacity-80" : "text-muted-foreground"}`}>{currency} {weeklyPrice}</div>
              </button>
              <button
                onClick={() => setPlan("monthly")}
                className={`flex-1 max-w-[140px] rounded-xl py-2.5 text-sm font-semibold transition-all border ${
                  plan === "monthly"
                    ? "bg-primary text-primary-foreground border-primary shadow-md"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50"
                }`}
              >
                Monthly
                <div className={`text-xs font-normal ${plan === "monthly" ? "opacity-80" : "text-muted-foreground"}`}>{currency} {monthlyPrice} <span className="text-[10px]">save more</span></div>
              </button>
            </div>

            <div className="pt-2">
              <span className="text-6xl font-black">{currency} {price}</span>
              <span className="text-xl text-muted-foreground font-medium">/{plan === "weekly" ? "week" : "month"}</span>
            </div>
          </div>

          <div className="relative p-8 space-y-6">
            <ul className="space-y-3">
              {[
                "Unlimited watermark-free downloads",
                "TikTok watermark-free downloads",
                "Highest quality video resolution",
                "Fastest download speeds",
                "Secure and private",
                "Cancel anytime",
              ].map((feature, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-primary" />
                  </div>
                  <span className="text-sm font-medium">{feature}</span>
                </li>
              ))}
            </ul>

            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-primary shrink-0" />
                <Label htmlFor="pay-phone" className="font-semibold text-sm">
                  M-Pesa Number
                </Label>
              </div>

              <Input
                id="pay-phone"
                type="tel"
                placeholder="07XXXXXXXX or 2547XXXXXXXX"
                value={payPhone}
                onChange={(e) => { setPayPhone(e.target.value); setPhoneEdited(true); }}
                className="bg-background text-base h-11"
                data-testid="input-pay-phone"
              />

              <p className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                The M-Pesa prompt will be sent to this number. It can differ from your registered number.
              </p>
            </div>

            <Button
              size="lg"
              className="w-full text-base h-13 font-semibold"
              onClick={handleSubscribe}
              disabled={subscribeMutation.isPending || !payPhone.trim()}
              data-testid="button-subscribe-now"
            >
              {subscribeMutation.isPending ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Sending prompt…</>
              ) : (
                <>Pay {currency} {price} via M-Pesa</>
              )}
            </Button>

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              Secured by Paylor · Powered by M-Pesa
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
