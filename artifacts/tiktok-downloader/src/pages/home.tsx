import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useDownloadVideo,
  useGetDownloadHistory,
  useAdminGetStats,
  useAdminGetUsers,
  useAdminGetSettings,
  useAdminUpdateSettings,
  useAdminUpgradeUser,
  useAdminSuspendUser,
  useAdminUnsuspendUser,
  useAdminDeleteUser,
  useAdminGetPayments,
  useAdminActivatePayment,
  useAdminRemovePayment,
  useGetSubscriptionStatus
} from "@workspace/api-client-react";
import { ApiError, getApiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Download, History, Settings, Users, BarChart3, Lock,
  CheckCircle2, AlertCircle, ShieldOff, ShieldCheck, Trash2, ArrowUpCircle,
  HardDriveDownload, ExternalLink, CreditCard, Clock, Zap, Star,
  Mail, Phone, MessageSquare, TrendingUp, Shield, Globe
} from "lucide-react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const downloadSchema = z.object({
  url: z.string().url("Please enter a valid URL").regex(
    /tiktok\.com|vm\.tiktok\.com|facebook\.com|fb\.watch|fb\.com/i,
    "Please enter a TikTok or Facebook video link"
  ),
});

const adminKeySchema = z.object({
  key: z.string().min(1, "Admin key is required"),
});

const settingsSchema = z.object({
  subscriptionPrice: z.coerce.number().min(0),
  weeklyPrice: z.coerce.number().min(0),
  currency: z.string().min(1),
  paylorApiKey: z.string(),
  paylorApiUrl: z.string().url(),
  paylorChannelId: z.string(),
  paylorWebhookSecret: z.string(),
  appUrl: z.string(),
  adminKey: z.string().min(1),
  freeDownloadsPerUser: z.coerce.number().min(0),
});

export default function Home() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const isAdmin = searchParams.get("admin") === "true";

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isAdmin) return <AdminDashboard />;
  if (!user) return <Landing />;
  return <DownloadInterface />;
}

function Landing() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden py-20 px-4">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -mr-48 -mt-48 pointer-events-none" />
        <div className="relative container mx-auto max-w-4xl text-center space-y-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Badge variant="outline" className="border-primary/40 text-primary px-3 py-1 text-sm font-medium">
              🎬 Free First Download — No Credit Card Needed
            </Badge>
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight">
            Download TikTok & Facebook<br />
            <span className="text-primary">Videos Without Watermarks</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Get high-quality, watermark-free videos in seconds. Just paste the link — we handle the rest.
            Your first download is completely free.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
            <Link href="/register">
              <Button size="lg" className="w-full sm:w-auto text-base px-10 h-12 font-semibold" data-testid="button-landing-register">
                Get Started Free
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-base px-10 h-12" data-testid="button-landing-login">
                Sign In
              </Button>
            </Link>
          </div>

          {/* Platform badges */}
          <div className="flex items-center justify-center gap-4 pt-4 text-sm text-muted-foreground">
            <span className="font-medium text-foreground/70">Supports:</span>
            <div className="flex items-center gap-2 bg-card border border-border rounded-full px-4 py-1.5">
              <span className="font-semibold">TikTok</span>
            </div>
            <div className="flex items-center gap-2 bg-card border border-border rounded-full px-4 py-1.5">
              <span className="font-semibold">Facebook</span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4 bg-card/30">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight mb-3">How It Works</h2>
            <p className="text-muted-foreground">Three simple steps to download any video</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                icon: <Globe className="w-6 h-6 text-primary" />,
                title: "Copy the Link",
                desc: "Open TikTok or Facebook, find the video you want, and copy its link or URL.",
              },
              {
                step: "2",
                icon: <Download className="w-6 h-6 text-primary" />,
                title: "Paste & Process",
                desc: "Paste the link into TokSaver. We'll instantly fetch the watermark-free version.",
              },
              {
                step: "3",
                icon: <HardDriveDownload className="w-6 h-6 text-primary" />,
                title: "Save to Device",
                desc: "Tap 'Save to Device' and the clean video downloads directly to your phone or computer.",
              },
            ].map((item) => (
              <div key={item.step} className="relative text-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  {item.icon}
                </div>
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                  {item.step}
                </div>
                <h3 className="font-bold text-lg mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight mb-3">Why Choose TokSaver?</h2>
            <p className="text-muted-foreground">Everything you need, nothing you don't</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: <Zap className="w-5 h-5 text-primary" />,
                title: "Lightning Fast",
                desc: "Downloads processed in seconds — no waiting, no queues.",
              },
              {
                icon: <CheckCircle2 className="w-5 h-5 text-primary" />,
                title: "No Watermarks",
                desc: "Get perfectly clean videos ready to share anywhere.",
              },
              {
                icon: <Shield className="w-5 h-5 text-primary" />,
                title: "Safe & Private",
                desc: "Your downloads are private. We never store your videos.",
              },
              {
                icon: <Star className="w-5 h-5 text-primary" />,
                title: "Best Quality",
                desc: "Original resolution — HD quality every time.",
              },
              {
                icon: <Phone className="w-5 h-5 text-primary" />,
                title: "Works on Mobile",
                desc: "Fully optimized for Android and iPhone browsers.",
              },
              {
                icon: <TrendingUp className="w-5 h-5 text-primary" />,
                title: "Unlimited Pro",
                desc: "Subscribe for unlimited downloads at just KSH 19/week.",
              },
            ].map((f, i) => (
              <Card key={i} className="bg-card/50 border-border/60 hover:border-primary/30 transition-colors">
                <CardContent className="pt-6 pb-5">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                    {f.icon}
                  </div>
                  <h3 className="font-semibold mb-1">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 px-4 bg-card/30">
        <div className="container mx-auto max-w-3xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight mb-3">Simple, Affordable Pricing</h2>
            <p className="text-muted-foreground">Start free. Upgrade when you need more.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            {/* Free */}
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Free</CardTitle>
                <CardDescription>Try before you commit</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-3xl font-black">KSH 0</div>
                <ul className="space-y-2 text-sm">
                  {["1 free download", "Watermark-free quality", "TikTok & Facebook"].map((f) => (
                    <li key={f} className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Link href="/register" className="w-full">
                  <Button variant="outline" className="w-full">Get Started</Button>
                </Link>
              </CardFooter>
            </Card>

            {/* Weekly — highlighted */}
            <Card className="border-primary shadow-lg shadow-primary/10 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground px-3 font-semibold">Most Popular</Badge>
              </div>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Weekly Pro</CardTitle>
                <CardDescription>Great for regular users</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <span className="text-3xl font-black text-primary">KSH 19</span>
                  <span className="text-muted-foreground text-sm">/week</span>
                </div>
                <ul className="space-y-2 text-sm">
                  {["Unlimited downloads", "Highest quality", "TikTok & Facebook", "Download history", "M-Pesa payment"].map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Link href="/register" className="w-full">
                  <Button className="w-full font-semibold">Subscribe Weekly</Button>
                </Link>
              </CardFooter>
            </Card>

            {/* Monthly */}
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Monthly Pro</CardTitle>
                <CardDescription>Best value</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <span className="text-3xl font-black">KSH 49</span>
                  <span className="text-muted-foreground text-sm">/month</span>
                </div>
                <ul className="space-y-2 text-sm">
                  {["Unlimited downloads", "Highest quality", "TikTok & Facebook", "Download history", "M-Pesa payment"].map((f) => (
                    <li key={f} className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Link href="/register" className="w-full">
                  <Button variant="outline" className="w-full">Subscribe Monthly</Button>
                </Link>
              </CardFooter>
            </Card>
          </div>
          <p className="text-center text-sm text-muted-foreground mt-6">
            All plans paid via <strong>M-Pesa</strong> — instant activation after payment.
          </p>
        </div>
      </section>

      {/* Contact / Support */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-2xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <MessageSquare className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight mb-3">Need Help?</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Having trouble with a download? Payment not going through? Our support team is ready to help you.
          </p>
          <a
            href="mailto:nutterxtech@gmail.com"
            className="inline-flex items-center gap-2 bg-card border border-border hover:border-primary/40 transition-colors rounded-xl px-6 py-3 font-semibold text-foreground"
          >
            <Mail className="w-4 h-4 text-primary" />
            nutterxtech@gmail.com
          </a>
          <p className="text-xs text-muted-foreground mt-4">We typically respond within a few hours</p>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-16 px-4 bg-primary/5 border-t border-primary/10">
        <div className="container mx-auto max-w-xl text-center space-y-6">
          <h2 className="text-3xl font-bold tracking-tight">Ready to Start?</h2>
          <p className="text-muted-foreground">Create your free account and download your first video right now.</p>
          <Link href="/register">
            <Button size="lg" className="px-12 h-12 text-base font-semibold">
              Create Free Account
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

function DownloadInterface() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [downloadResult, setDownloadResult] = useState<{ url: string; title?: string | null; thumbnail?: string | null; sourceUrl?: string } | null>(null);
  const [saveProgress, setSaveProgress] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { data: subStatus, refetch: refetchSubStatus } = useGetSubscriptionStatus();
  const { data: history, refetch: refetchHistory } = useGetDownloadHistory();
  const downloadMutation = useDownloadVideo();

  function saveVideoToDevice(videoUrl: string, title?: string | null, sourceUrl?: string) {
    const token = localStorage.getItem("auth_token");
    const apiBase = (import.meta.env.VITE_API_URL as string | undefined) || "";
    const defaultName = sourceUrl?.includes("facebook") || sourceUrl?.includes("fb.") ? "facebook-video" : "tiktok-video";
    const safeFilename = (title || defaultName)
      .replace(/[^a-zA-Z0-9_\-\s]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || defaultName;
    const proxyUrl = `${apiBase}/api/download-proxy?url=${encodeURIComponent(videoUrl)}&filename=${encodeURIComponent(safeFilename + ".mp4")}`;

    setIsSaving(true);
    setSaveProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open("GET", proxyUrl, true);
    xhr.responseType = "blob";
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        setSaveProgress(Math.round((event.loaded / event.total) * 100));
      } else {
        setSaveProgress((prev) => (prev !== null && prev < 90 ? prev + 1 : prev ?? 10));
      }
    };

    xhr.onload = () => {
      setIsSaving(false);
      setSaveProgress(null);
      if (xhr.status === 200) {
        const blob = xhr.response as Blob;
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = safeFilename + ".mp4";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        toast({ title: "Saved!", description: "Video saved to your device." });
      } else {
        toast({ variant: "destructive", title: "Save failed", description: "Could not download the video. Try again." });
      }
    };

    xhr.onerror = () => {
      setIsSaving(false);
      setSaveProgress(null);
      toast({ variant: "destructive", title: "Save failed", description: "Network error while downloading. Try again." });
    };

    xhr.send();
  }

  const form = useForm<z.infer<typeof downloadSchema>>({
    resolver: zodResolver(downloadSchema),
    defaultValues: { url: "" },
  });

  function onSubmit(values: z.infer<typeof downloadSchema>) {
    setDownloadResult(null);
    downloadMutation.mutate(
      { data: { url: values.url } },
      {
        onSuccess: (data) => {
          setDownloadResult({ url: data.downloadUrl, title: data.title, thumbnail: data.thumbnailUrl, sourceUrl: values.url });
          toast({ title: "Video ready!", description: "Tap 'Save to Device' to download." });
          form.reset();
          refetchHistory();
          refetchSubStatus();
        },
        onError: (error: unknown) => {
          if (error instanceof ApiError && error.status === 402) {
            toast({ variant: "destructive", title: "Subscription Required", description: getApiErrorMessage(error, "You have used your free downloads.") });
            setLocation("/subscribe");
          } else {
            toast({ variant: "destructive", title: "Error", description: getApiErrorMessage(error, "Failed to process video") });
          }
        },
      }
    );
  }

  const isPro = subStatus?.isActive && subStatus.expiresAt;
  const daysLeft = isPro ? Math.max(0, Math.ceil((new Date(subStatus!.expiresAt as string).getTime() - Date.now()) / 86400000)) : 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">

      {/* Status Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border p-5 rounded-xl">
        <div>
          <h2 className="text-xl font-bold">Download Video</h2>
          <p className="text-muted-foreground text-sm mt-0.5">Paste a TikTok or Facebook video link below</p>
        </div>
        {subStatus && (
          isPro ? (
            <div className="flex items-center gap-3">
              <Badge className="bg-primary/15 text-primary border-primary/30 font-semibold px-3 py-1">
                <Star className="w-3 h-3 mr-1.5" /> Pro · {daysLeft}d left
              </Badge>
              {daysLeft <= 7 && (
                <Link href="/subscribe">
                  <Button variant="ghost" size="sm" className="text-xs text-amber-400 hover:text-amber-300 h-auto p-0">
                    Renew →
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="font-medium px-3 py-1">
                {subStatus.remainingFreeDownloads} free download{subStatus.remainingFreeDownloads !== 1 ? "s" : ""} left
              </Badge>
              <Link href="/subscribe">
                <Button size="sm" className="font-semibold" data-testid="button-upgrade-now">
                  Upgrade to Pro
                </Button>
              </Link>
            </div>
          )
        )}
      </div>

      {/* URL Input Card */}
      <Card className="border-primary/20 shadow-lg shadow-primary/5">
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Video URL</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        <Input
                          placeholder="https://www.tiktok.com/... or facebook.com/..."
                          {...field}
                          className="flex-1 bg-background h-11"
                          data-testid="input-tiktok-url"
                        />
                        <Button type="submit" disabled={downloadMutation.isPending} className="h-11 px-5" data-testid="button-download">
                          {downloadMutation.isPending
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <><Download className="w-4 h-4 mr-2" />Download</>}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>

          {/* Supported platforms hint */}
          <div className="flex items-center gap-3 mt-4 text-xs text-muted-foreground">
            <span>Works with:</span>
            <span className="bg-muted rounded-full px-2.5 py-0.5 font-medium">TikTok</span>
            <span className="bg-muted rounded-full px-2.5 py-0.5 font-medium">Facebook</span>
          </div>

          {/* Result */}
          {downloadResult && (
            <div className="mt-6 p-4 border border-primary/20 rounded-xl bg-primary/5 flex flex-col sm:flex-row gap-5 items-center">
              {downloadResult.thumbnail ? (
                <div className="w-28 h-36 bg-muted rounded-lg overflow-hidden shrink-0">
                  <img src={downloadResult.thumbnail} alt="Thumbnail" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-28 h-36 bg-muted rounded-lg flex items-center justify-center shrink-0">
                  <Download className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 flex flex-col justify-center space-y-4 w-full">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Ready to download</p>
                  <h4 className="font-semibold line-clamp-2">{downloadResult.title || "Video Ready"}</h4>
                </div>
                {isSaving ? (
                  <div className="space-y-2 w-full sm:max-w-xs">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving{saveProgress !== null ? ` — ${saveProgress}%` : "…"}</span>
                    </div>
                    <Progress value={saveProgress ?? 0} className="h-2" />
                  </div>
                ) : (
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => saveVideoToDevice(downloadResult.url, downloadResult.title, downloadResult.sourceUrl)}
                    data-testid="link-save-video"
                  >
                    <HardDriveDownload className="w-4 h-4 mr-2" /> Save to Device
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Download History */}
      <div className="space-y-3">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <History className="w-5 h-5 text-primary" /> Recent Downloads
        </h3>
        {!history || history.length === 0 ? (
          <Card className="bg-card/30 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <History className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm">No downloads yet — paste a link above to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Video Link</TableHead>
                  <TableHead className="w-[180px]">Date & Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-mono text-xs truncate max-w-[200px] sm:max-w-md">
                      <a href={record.url} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline flex items-center gap-1">
                        {record.url}
                        <ExternalLink className="w-3 h-3 shrink-0 opacity-50" />
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                      {new Date(record.downloadedAt).toLocaleDateString()} {new Date(record.downloadedAt).toLocaleTimeString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Support link */}
      <div className="flex items-center gap-3 p-4 bg-card/30 border border-dashed border-border rounded-xl text-sm text-muted-foreground">
        <Mail className="w-4 h-4 text-primary shrink-0" />
        <span>Need help? Contact us at{" "}
          <a href="mailto:nutterxtech@gmail.com" className="text-primary hover:underline font-medium">nutterxtech@gmail.com</a>
        </span>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem("admin_key") || "");
  const [isAuthenticated, setIsAuthenticated] = useState(!!adminKey);
  const { toast } = useToast();

  const keyForm = useForm<z.infer<typeof adminKeySchema>>({
    resolver: zodResolver(adminKeySchema),
    defaultValues: { key: "" },
  });

  function onKeySubmit(values: z.infer<typeof adminKeySchema>) {
    localStorage.setItem("admin_key", values.key);
    setAdminKey(values.key);
    setIsAuthenticated(true);
  }

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm shadow-xl border-primary/20">
          <CardHeader className="text-center pb-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Lock className="w-7 h-7 text-primary" />
            </div>
            <CardTitle className="text-xl">Admin Access</CardTitle>
            <CardDescription>Enter your admin key to access the dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...keyForm}>
              <form onSubmit={keyForm.handleSubmit(onKeySubmit)} className="space-y-4">
                <FormField
                  control={keyForm.control}
                  name="key"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Admin Key</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Enter admin key" {...field} data-testid="input-admin-key" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" data-testid="button-admin-login">Access Dashboard</Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AdminPanel adminKey={adminKey} onLogout={() => {
    localStorage.removeItem("admin_key");
    setAdminKey("");
    setIsAuthenticated(false);
    window.location.href = "/";
  }} />;
}

function AdminPanel({ adminKey, onLogout }: { adminKey: string; onLogout: () => void }) {
  const reqOptions = { request: { headers: { "x-admin-key": adminKey } } };
  const queryOptions = { enabled: !!adminKey, retry: false };
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: stats, isLoading: statsLoading, error: statsError } = useAdminGetStats({
    ...reqOptions, query: { ...queryOptions, queryKey: ["adminStats", adminKey] }
  });
  const { data: users, isLoading: usersLoading } = useAdminGetUsers({
    ...reqOptions, query: { ...queryOptions, queryKey: ["adminUsers", adminKey] }
  });
  const { data: settings, isLoading: settingsLoading } = useAdminGetSettings({
    ...reqOptions, query: { ...queryOptions, queryKey: ["adminSettings", adminKey] }
  });
  const { data: payments, isLoading: paymentsLoading } = useAdminGetPayments({
    ...reqOptions, query: { ...queryOptions, queryKey: ["adminPayments", adminKey] }
  });

  const adminRequest = reqOptions.request;
  const updateSettingsMutation = useAdminUpdateSettings({ request: adminRequest });
  const upgradeMutation = useAdminUpgradeUser({ request: adminRequest });
  const suspendMutation = useAdminSuspendUser({ request: adminRequest });
  const unsuspendMutation = useAdminUnsuspendUser({ request: adminRequest });
  const deleteMutation = useAdminDeleteUser({ request: adminRequest });
  const activatePaymentMutation = useAdminActivatePayment({ request: adminRequest });
  const removePaymentMutation = useAdminRemovePayment({ request: adminRequest });

  const refetchUsers = () => queryClient.invalidateQueries({ queryKey: ["adminUsers", adminKey] });
  const refetchPayments = () => queryClient.invalidateQueries({ queryKey: ["adminPayments", adminKey] });

  function handleActivatePayment(subId: number, userName: string) {
    activatePaymentMutation.mutate({ id: subId }, {
      onSuccess: () => { toast({ title: "Activated", description: `Subscription for ${userName} activated.` }); refetchPayments(); refetchUsers(); },
      onError: (err) => toast({ variant: "destructive", title: "Error", description: getApiErrorMessage(err, "Could not activate subscription.") }),
    });
  }

  function handleRemovePayment(subId: number, userName: string) {
    removePaymentMutation.mutate({ id: subId }, {
      onSuccess: () => { toast({ title: "Removed", description: `Subscription for ${userName} removed.` }); refetchPayments(); refetchUsers(); },
      onError: (err) => toast({ variant: "destructive", title: "Error", description: getApiErrorMessage(err, "Could not remove subscription.") }),
    });
  }

  function handleUpgrade(userId: number, userName: string) {
    upgradeMutation.mutate({ id: userId }, {
      onSuccess: () => { toast({ title: "Upgraded", description: `${userName} upgraded to Pro.` }); refetchUsers(); },
      onError: (err) => toast({ variant: "destructive", title: "Error", description: getApiErrorMessage(err, "Could not upgrade user.") }),
    });
  }

  function handleSuspend(userId: number, userName: string) {
    suspendMutation.mutate({ id: userId }, {
      onSuccess: () => { toast({ title: "Suspended", description: `${userName} has been suspended.` }); refetchUsers(); },
      onError: (err) => toast({ variant: "destructive", title: "Error", description: getApiErrorMessage(err, "Could not suspend user.") }),
    });
  }

  function handleUnsuspend(userId: number, userName: string) {
    unsuspendMutation.mutate({ id: userId }, {
      onSuccess: () => { toast({ title: "Unsuspended", description: `${userName} has been unsuspended.` }); refetchUsers(); },
      onError: (err) => toast({ variant: "destructive", title: "Error", description: getApiErrorMessage(err, "Could not unsuspend user.") }),
    });
  }

  function handleDelete(userId: number, userName: string) {
    deleteMutation.mutate({ id: userId }, {
      onSuccess: () => { toast({ title: "Deleted", description: `${userName} permanently deleted.` }); refetchUsers(); },
      onError: (err) => toast({ variant: "destructive", title: "Error", description: getApiErrorMessage(err, "Could not delete user.") }),
    });
  }

  const settingsForm = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      subscriptionPrice: 0, weeklyPrice: 0, currency: "KES",
      paylorApiKey: "", paylorApiUrl: "https://api.paylorke.com/api/v1",
      paylorChannelId: "", paylorWebhookSecret: "", appUrl: "",
      adminKey: "", freeDownloadsPerUser: 1,
    },
  });

  useEffect(() => {
    if (settings) settingsForm.reset(settings);
  }, [settings, settingsForm]);

  if (statsError instanceof ApiError && statsError.status === 401) {
    onLogout();
    toast({ variant: "destructive", title: "Unauthorized", description: "Invalid admin key" });
    return null;
  }

  const statCards = [
    { label: "Total Users", value: stats?.totalUsers ?? 0, testId: "text-stats-total-users", color: "" },
    { label: "Active Subscribers", value: stats?.activeSubscribers ?? 0, testId: "text-stats-active-subs", color: "text-primary" },
    { label: "Total Downloads", value: stats?.totalDownloads ?? 0, testId: "text-stats-total-dl", color: "" },
    { label: "Revenue (Month)", value: `${settings?.currency || "KSH"} ${stats?.revenueThisMonth ?? 0}`, testId: "text-stats-revenue", color: "text-green-500" },
    { label: "New Users (Month)", value: stats?.newUsersThisMonth ?? 0, testId: "text-stats-new-users", color: "" },
  ];

  return (
    <div className="container mx-auto px-4 py-8 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border p-6 rounded-xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage users, monitor payments and configure the app.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onLogout} data-testid="button-admin-logout">
          Exit Admin
        </Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6 h-11">
          <TabsTrigger value="overview" className="gap-2 text-sm" data-testid="tab-overview">
            <BarChart3 className="w-4 h-4" /> <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2 text-sm" data-testid="tab-users">
            <Users className="w-4 h-4" /> <span className="hidden sm:inline">Users</span>
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-2 text-sm" data-testid="tab-payments">
            <CreditCard className="w-4 h-4" /> <span className="hidden sm:inline">Payments</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2 text-sm" data-testid="tab-settings">
            <Settings className="w-4 h-4" /> <span className="hidden sm:inline">Settings</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-6">
          {statsLoading ? (
            <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {statCards.map((s) => (
                <Card key={s.label} className="border-border/70">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{s.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className={`text-2xl font-bold ${s.color}`} data-testid={s.testId}>{s.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Users */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" /> Registered Users
              </CardTitle>
              <CardDescription>All users on the platform with their status and actions.</CardDescription>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
              ) : (
                <div className="rounded-lg border border-border overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead className="text-center">Downloads</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users?.map((u) => (
                        <TableRow key={u.id} className={u.isSuspended ? "opacity-50" : ""}>
                          <TableCell className="font-medium whitespace-nowrap">{u.name}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{u.phone}</TableCell>
                          <TableCell className="text-center font-mono text-sm">{u.downloadsCount}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {u.subscriptionStatus === "active"
                                ? <Badge className="bg-primary/15 text-primary border-primary/30 w-fit text-xs">Pro</Badge>
                                : <Badge variant="secondary" className="w-fit text-xs">Free</Badge>}
                              {u.isSuspended && <Badge variant="destructive" className="w-fit text-xs">Suspended</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                            {new Date(u.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1.5 justify-end">
                              {u.subscriptionStatus !== "active" && (
                                <Button size="sm" variant="outline" className="text-primary border-primary/30 hover:bg-primary/10 h-8 w-8 p-0"
                                  title="Upgrade to Pro" onClick={() => handleUpgrade(u.id, u.name)} disabled={upgradeMutation.isPending}
                                  data-testid={`btn-upgrade-${u.id}`}>
                                  <ArrowUpCircle className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {u.isSuspended ? (
                                <Button size="sm" variant="outline" className="text-green-500 border-green-500/30 hover:bg-green-500/10 h-8 w-8 p-0"
                                  title="Unsuspend" onClick={() => handleUnsuspend(u.id, u.name)} disabled={unsuspendMutation.isPending}
                                  data-testid={`btn-unsuspend-${u.id}`}>
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                </Button>
                              ) : (
                                <Button size="sm" variant="outline" className="text-orange-500 border-orange-500/30 hover:bg-orange-500/10 h-8 w-8 p-0"
                                  title="Suspend" onClick={() => handleSuspend(u.id, u.name)} disabled={suspendMutation.isPending}
                                  data-testid={`btn-suspend-${u.id}`}>
                                  <ShieldOff className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10 h-8 w-8 p-0"
                                    title="Delete" disabled={deleteMutation.isPending} data-testid={`btn-delete-${u.id}`}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="dark bg-card border-border">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete {u.name}?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete <strong>{u.name}</strong> ({u.email}) and all their data. This cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={() => handleDelete(u.id, u.name)}>Delete permanently</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!users?.length && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No users found.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments */}
        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" /> Payment Records
              </CardTitle>
              <CardDescription>All subscription payments — who paid, when, and current status.</CardDescription>
            </CardHeader>
            <CardContent>
              {paymentsLoading ? (
                <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
              ) : (
                <div className="rounded-lg border border-border overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Paid</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments?.map((p) => (
                        <TableRow key={p.id} className={p.status === "pending" ? "bg-amber-500/5" : ""}>
                          <TableCell className="text-muted-foreground text-xs">{p.id}</TableCell>
                          <TableCell>
                            <div className="font-medium whitespace-nowrap text-sm">{p.userName}</div>
                            <div className="text-xs text-muted-foreground">{p.userEmail}</div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{p.userPhone ?? "—"}</TableCell>
                          <TableCell className="font-semibold text-green-400 whitespace-nowrap text-sm">
                            {p.currency} {p.amountPaid.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {p.status === "active" ? (
                              <Badge className="bg-primary/15 text-primary text-xs whitespace-nowrap">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Paid
                              </Badge>
                            ) : p.status === "pending" ? (
                              <Badge variant="outline" className="border-amber-500/50 text-amber-400 text-xs whitespace-nowrap">
                                <Clock className="w-3 h-3 mr-1" /> Pending
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs whitespace-nowrap">{p.status}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {p.paymentReference
                              ? <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{p.paymentReference}</span>
                              : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                            {new Date(p.paidAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                            {new Date(p.expiresAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1.5 justify-end">
                              {p.status === "pending" && (
                                <Button size="sm" variant="outline" className="text-primary border-primary/30 hover:bg-primary/10 whitespace-nowrap h-8 text-xs"
                                  onClick={() => handleActivatePayment(p.id, p.userName)}
                                  disabled={activatePaymentMutation.isPending || removePaymentMutation.isPending}
                                  data-testid={`btn-activate-payment-${p.id}`}>
                                  {activatePaymentMutation.isPending
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : <><CheckCircle2 className="w-3 h-3 mr-1" />Activate</>}
                                </Button>
                              )}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10 h-8 w-8 p-0"
                                    disabled={removePaymentMutation.isPending} data-testid={`btn-remove-payment-${p.id}`}>
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="dark bg-card border-border">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remove subscription?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This removes <strong>{p.userName}</strong>'s subscription. They lose Pro access immediately. Cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={() => handleRemovePayment(p.id, p.userName)}>Remove</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!payments?.length && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No payment records yet.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
            {!!payments?.length && (
              <CardFooter className="text-xs text-muted-foreground border-t border-border pt-4">
                {payments.length} total · {payments.filter((p) => p.status === "active").length} confirmed
              </CardFooter>
            )}
          </Card>
        </TabsContent>

        {/* Settings */}
        <TabsContent value="settings">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary" /> Application Settings
              </CardTitle>
              <CardDescription>Configure pricing, payment gateway, and account limits.</CardDescription>
            </CardHeader>
            <CardContent>
              {settingsLoading ? (
                <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
              ) : (
                <Form {...settingsForm}>
                  <form onSubmit={settingsForm.handleSubmit((values) => {
                    updateSettingsMutation.mutate({ data: values }, {
                      onSuccess: () => toast({ title: "Settings saved", description: "Changes applied successfully." }),
                      onError: (e: unknown) => toast({ variant: "destructive", title: "Error", description: getApiErrorMessage(e, "Failed to update settings") }),
                    });
                  })} className="space-y-8">

                    {/* Pricing */}
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pricing</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={settingsForm.control} name="subscriptionPrice" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Monthly Price (KSH)</FormLabel>
                            <FormControl><Input type="number" {...field} data-testid="input-setting-price" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={settingsForm.control} name="weeklyPrice" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Weekly Price (KSH)</FormLabel>
                            <FormControl><Input type="number" {...field} data-testid="input-setting-weekly-price" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={settingsForm.control} name="currency" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Currency</FormLabel>
                            <FormControl><Input {...field} data-testid="input-setting-currency" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={settingsForm.control} name="freeDownloadsPerUser" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Free Downloads Per User</FormLabel>
                            <FormControl><Input type="number" {...field} data-testid="input-setting-free-dl" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                    </div>

                    {/* Paylor */}
                    <div className="space-y-4 pt-2 border-t border-border">
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Paylor Payment Gateway</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          M-Pesa payments are processed through Paylor. Get credentials from your{" "}
                          <a href="https://paylor.webnixke.com" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-0.5">
                            Paylor dashboard <ExternalLink className="w-3 h-3" />
                          </a>
                        </p>
                      </div>
                      <FormField control={settingsForm.control} name="paylorApiKey" render={({ field }) => (
                        <FormItem>
                          <FormLabel>API Key (pk_…)</FormLabel>
                          <FormControl><Input type="password" placeholder="pk_live_..." {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={settingsForm.control} name="paylorChannelId" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Channel ID</FormLabel>
                          <FormControl><Input placeholder="Your Paylor channel ID" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={settingsForm.control} name="paylorWebhookSecret" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Webhook Secret (Key ID)</FormLabel>
                          <FormControl><Input type="password" placeholder="Hex Key ID from dashboard" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={settingsForm.control} name="paylorApiUrl" render={({ field }) => (
                        <FormItem>
                          <FormLabel>API URL</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    {/* App config */}
                    <div className="space-y-4 pt-2 border-t border-border">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">App Configuration</h3>
                      <FormField control={settingsForm.control} name="appUrl" render={({ field }) => (
                        <FormItem>
                          <FormLabel>App URL</FormLabel>
                          <FormControl><Input placeholder="https://yourapp.vercel.app" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={settingsForm.control} name="adminKey" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Admin Key</FormLabel>
                          <FormControl><Input type="password" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={updateSettingsMutation.isPending}
                      data-testid="button-save-settings"
                    >
                      {updateSettingsMutation.isPending
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                        : "Save Changes"}
                    </Button>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
