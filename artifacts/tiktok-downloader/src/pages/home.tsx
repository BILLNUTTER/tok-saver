import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
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
  useGetSubscriptionStatus
} from "@workspace/api-client-react";
import { ApiError, getApiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, History, Settings, Users, BarChart3, Lock, CheckCircle2, AlertCircle, ShieldOff, ShieldCheck, Trash2, ArrowUpCircle } from "lucide-react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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

// --- URL Input Form Schema ---
const downloadSchema = z.object({
  url: z.string().url("Please enter a valid URL").regex(/tiktok\.com/i, "Must be a TikTok URL"),
});

// --- Admin Key Form Schema ---
const adminKeySchema = z.object({
  key: z.string().min(1, "Admin key is required"),
});

// --- Admin Settings Form Schema ---
const settingsSchema = z.object({
  subscriptionPrice: z.coerce.number().min(0),
  currency: z.string().min(1),
  paylorApiKey: z.string(),
  paylorApiUrl: z.string().url(),
  paylorChannelId: z.string(),
  adminKey: z.string().min(1),
  freeDownloadsPerUser: z.coerce.number().min(0),
});

export default function Home() {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const isAdmin = searchParams.get("admin") === "true";
  
  if (isLoading) {
    return <div className="flex justify-center items-center h-full min-h-[50vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (isAdmin) {
    return <AdminDashboard />;
  }

  if (!user) {
    return <Landing />;
  }

  return <DownloadInterface />;
}

function Landing() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 text-center max-w-3xl mx-auto space-y-8 min-h-[70vh]">
      <div className="space-y-4">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">
          Download TikToks <br className="hidden md:block" />
          <span className="text-primary">Without Watermarks</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          High-quality, fast, and completely watermark-free video downloads. Register now to get your first download absolutely free.
        </p>
      </div>
      
      <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
        <Link href="/register">
          <Button size="lg" className="w-full sm:w-auto text-lg px-8" data-testid="button-landing-register">
            Get Started Free
          </Button>
        </Link>
        <Link href="/login">
          <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg px-8" data-testid="button-landing-login">
            Login
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full pt-12">
        <Card className="bg-card/50 border-none shadow-none text-center p-6">
          <Download className="w-10 h-10 mx-auto text-primary mb-4" />
          <h3 className="font-bold text-lg mb-2">Fast & Easy</h3>
          <p className="text-muted-foreground text-sm">Just paste the link and download instantly.</p>
        </Card>
        <Card className="bg-card/50 border-none shadow-none text-center p-6">
          <CheckCircle2 className="w-10 h-10 mx-auto text-primary mb-4" />
          <h3 className="font-bold text-lg mb-2">No Watermarks</h3>
          <p className="text-muted-foreground text-sm">Clean videos ready for repurposing or sharing.</p>
        </Card>
        <Card className="bg-card/50 border-none shadow-none text-center p-6">
          <Lock className="w-10 h-10 mx-auto text-primary mb-4" />
          <h3 className="font-bold text-lg mb-2">Secure</h3>
          <p className="text-muted-foreground text-sm">Safe, secure, and private downloads.</p>
        </Card>
      </div>
    </div>
  );
}

function DownloadInterface() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [downloadResult, setDownloadResult] = useState<{url: string, title?: string | null, thumbnail?: string | null} | null>(null);

  const { data: subStatus, refetch: refetchSubStatus } = useGetSubscriptionStatus();
  const { data: history, refetch: refetchHistory } = useGetDownloadHistory();
  
  const downloadMutation = useDownloadVideo();

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
          setDownloadResult({
            url: data.downloadUrl,
            title: data.title,
            thumbnail: data.thumbnailUrl
          });
          toast({
            title: "Success",
            description: "Video downloaded successfully",
          });
          form.reset();
          refetchHistory();
          refetchSubStatus();
        },
        onError: (error: unknown) => {
          if (error instanceof ApiError && error.status === 402) {
             toast({
               variant: "destructive",
               title: "Subscription Required",
               description: getApiErrorMessage(error, "You have used your free downloads."),
             });
             setLocation("/subscribe");
          } else {
            toast({
              variant: "destructive",
              title: "Error",
              description: getApiErrorMessage(error, "Failed to download video"),
            });
          }
        },
      }
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl space-y-8">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card border border-border p-6 rounded-xl shadow-sm">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Download Video</h2>
          <p className="text-muted-foreground mt-1">Paste a TikTok URL below to get the watermark-free video.</p>
        </div>
        
        {subStatus && (
          <div className="text-right">
            {subStatus.isActive ? (
              <Badge variant="default" className="bg-primary/20 text-primary hover:bg-primary/30 text-sm px-3 py-1">
                Pro Subscriber
              </Badge>
            ) : (
              <div className="flex flex-col items-end">
                <Badge variant="outline" className="text-sm px-3 py-1 mb-2">
                  {subStatus.remainingFreeDownloads} Free Downloads Left
                </Badge>
                <Link href="/subscribe">
                  <Button variant="secondary" size="sm" className="text-xs" data-testid="button-upgrade-now">
                    Upgrade Now
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      <Card className="border-primary/20 shadow-lg shadow-primary/5">
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>TikTok URL</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        <Input 
                          placeholder="https://www.tiktok.com/@user/video/1234567890" 
                          {...field} 
                          className="flex-1 bg-background"
                          data-testid="input-tiktok-url"
                        />
                        <Button 
                          type="submit" 
                          disabled={downloadMutation.isPending}
                          data-testid="button-download"
                        >
                          {downloadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                          Download
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>

          {downloadResult && (
            <div className="mt-8 p-4 border border-border rounded-lg bg-background/50 flex flex-col sm:flex-row gap-6 items-center">
              {downloadResult.thumbnail ? (
                <div className="w-32 h-40 bg-muted rounded-md overflow-hidden shrink-0">
                  <img src={downloadResult.thumbnail} alt="Thumbnail" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-32 h-40 bg-muted rounded-md flex items-center justify-center shrink-0">
                  <Download className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              
              <div className="flex-1 flex flex-col justify-center space-y-4 w-full">
                <h4 className="font-semibold line-clamp-2">{downloadResult.title || "TikTok Video"}</h4>
                <Button asChild className="w-full sm:w-auto" data-testid="link-save-video">
                  <a href={downloadResult.url} download target="_blank" rel="noreferrer">
                    Save Video File
                  </a>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4 pt-8">
        <h3 className="text-xl font-bold flex items-center gap-2">
          <History className="w-5 h-5 text-primary" /> 
          Recent Downloads
        </h3>
        
        {!history || history.length === 0 ? (
          <Card className="bg-card/30 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <History className="w-12 h-12 mb-4 opacity-20" />
              <p>No downloads yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead className="w-[200px]">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-mono text-sm truncate max-w-[200px] sm:max-w-md">
                      <a href={record.url} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline">
                        {record.url}
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(record.downloadedAt).toLocaleDateString()} {new Date(record.downloadedAt).toLocaleTimeString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
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
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" /> Admin Access
            </CardTitle>
            <CardDescription>Enter the admin key to access the dashboard.</CardDescription>
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
                        <Input type="password" {...field} data-testid="input-admin-key" />
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
  }} />;
}

function AdminPanel({ adminKey, onLogout }: { adminKey: string, onLogout: () => void }) {
  const reqOptions = { request: { headers: { 'x-admin-key': adminKey } } };
  const queryOptions = { enabled: !!adminKey, retry: false };
  const queryClient = useQueryClient();
  
  const { data: stats, isLoading: statsLoading, error: statsError } = useAdminGetStats({
    ...reqOptions,
    query: { ...queryOptions, queryKey: ['adminStats', adminKey] }
  });
  
  const { data: users, isLoading: usersLoading } = useAdminGetUsers({
    ...reqOptions,
    query: { ...queryOptions, queryKey: ['adminUsers', adminKey] }
  });

  const { data: settings, isLoading: settingsLoading } = useAdminGetSettings({
    ...reqOptions,
    query: { ...queryOptions, queryKey: ['adminSettings', adminKey] }
  });

  const updateSettingsMutation = useAdminUpdateSettings();
  const upgradeMutation = useAdminUpgradeUser();
  const suspendMutation = useAdminSuspendUser();
  const unsuspendMutation = useAdminUnsuspendUser();
  const deleteMutation = useAdminDeleteUser();
  const { toast } = useToast();

  const refetchUsers = () => queryClient.invalidateQueries({ queryKey: ['adminUsers', adminKey] });

  function handleUpgrade(userId: number, userName: string) {
    upgradeMutation.mutate(
      { id: userId, ...reqOptions },
      {
        onSuccess: () => {
          toast({ title: "Upgraded", description: `${userName} has been upgraded to Pro.` });
          refetchUsers();
        },
        onError: (err) => toast({ variant: "destructive", title: "Error", description: getApiErrorMessage(err) }),
      }
    );
  }

  function handleSuspend(userId: number, userName: string) {
    suspendMutation.mutate(
      { id: userId, ...reqOptions },
      {
        onSuccess: () => {
          toast({ title: "Suspended", description: `${userName} has been suspended.` });
          refetchUsers();
        },
        onError: (err) => toast({ variant: "destructive", title: "Error", description: getApiErrorMessage(err) }),
      }
    );
  }

  function handleUnsuspend(userId: number, userName: string) {
    unsuspendMutation.mutate(
      { id: userId, ...reqOptions },
      {
        onSuccess: () => {
          toast({ title: "Unsuspended", description: `${userName} has been unsuspended.` });
          refetchUsers();
        },
        onError: (err) => toast({ variant: "destructive", title: "Error", description: getApiErrorMessage(err) }),
      }
    );
  }

  function handleDelete(userId: number, userName: string) {
    deleteMutation.mutate(
      { id: userId, ...reqOptions },
      {
        onSuccess: () => {
          toast({ title: "Deleted", description: `${userName} has been permanently deleted.` });
          refetchUsers();
        },
        onError: (err) => toast({ variant: "destructive", title: "Error", description: getApiErrorMessage(err) }),
      }
    );
  }

  const settingsForm = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      subscriptionPrice: 0,
      currency: "KES",
      paylorApiKey: "",
      paylorApiUrl: "https://paylor.webnixke.com/",
      paylorChannelId: "",
      adminKey: "",
      freeDownloadsPerUser: 1
    },
  });

  // Populate the settings form once data loads from the API.
  useEffect(() => {
    if (settings) {
      settingsForm.reset(settings);
    }
  }, [settings, settingsForm]);

  // Handle unauthorized admin key
  if (statsError instanceof ApiError && statsError.status === 401) {
    onLogout();
    toast({ variant: "destructive", title: "Unauthorized", description: "Invalid admin key" });
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div className="flex justify-between items-center bg-card p-6 rounded-xl border border-border">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage users, view stats, and configure app settings.</p>
        </div>
        <Button variant="outline" onClick={onLogout} data-testid="button-admin-logout">Exit Admin</Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="overview" className="flex items-center gap-2" data-testid="tab-overview">
            <BarChart3 className="w-4 h-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2" data-testid="tab-users">
            <Users className="w-4 h-4" /> Users
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2" data-testid="tab-settings">
            <Settings className="w-4 h-4" /> Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {statsLoading ? <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div> : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-stats-total-users">{stats?.totalUsers || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Active Subscribers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary" data-testid="text-stats-active-subs">{stats?.activeSubscribers || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Downloads</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-stats-total-dl">{stats?.totalDownloads || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Revenue (Month)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-500" data-testid="text-stats-revenue">
                    {settings?.currency || "KSH"} {stats?.revenueThisMonth || 0}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">New Users (Month)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-stats-new-users">{stats?.newUsersThisMonth || 0}</div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Registered Users</CardTitle>
              <CardDescription>A complete list of all users on the platform.</CardDescription>
            </CardHeader>
            <CardContent>
              {usersLoading ? <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div> : (
                <div className="rounded-md border border-border overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Downloads</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users?.map((u) => (
                        <TableRow key={u.id} className={u.isSuspended ? "opacity-60" : ""}>
                          <TableCell className="font-medium">{u.name}</TableCell>
                          <TableCell>{u.email}</TableCell>
                          <TableCell className="text-muted-foreground">{u.phone}</TableCell>
                          <TableCell>{u.downloadsCount}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {u.subscriptionStatus === "active" ? (
                                <Badge variant="default" className="bg-primary/20 text-primary hover:bg-primary/30 w-fit">Pro</Badge>
                              ) : (
                                <Badge variant="secondary" className="w-fit">Free</Badge>
                              )}
                              {u.isSuspended && (
                                <Badge variant="destructive" className="w-fit">Suspended</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {new Date(u.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2 justify-end">
                              {u.subscriptionStatus !== "active" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-primary border-primary/30 hover:bg-primary/10"
                                  title="Upgrade to Pro"
                                  onClick={() => handleUpgrade(u.id, u.name)}
                                  disabled={upgradeMutation.isPending}
                                  data-testid={`btn-upgrade-${u.id}`}
                                >
                                  <ArrowUpCircle className="w-4 h-4" />
                                </Button>
                              )}
                              {u.isSuspended ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-green-600 border-green-600/30 hover:bg-green-600/10"
                                  title="Unsuspend user"
                                  onClick={() => handleUnsuspend(u.id, u.name)}
                                  disabled={unsuspendMutation.isPending}
                                  data-testid={`btn-unsuspend-${u.id}`}
                                >
                                  <ShieldCheck className="w-4 h-4" />
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-orange-500 border-orange-500/30 hover:bg-orange-500/10"
                                  title="Suspend user"
                                  onClick={() => handleSuspend(u.id, u.name)}
                                  disabled={suspendMutation.isPending}
                                  data-testid={`btn-suspend-${u.id}`}
                                >
                                  <ShieldOff className="w-4 h-4" />
                                </Button>
                              )}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-destructive border-destructive/30 hover:bg-destructive/10"
                                    title="Delete user"
                                    disabled={deleteMutation.isPending}
                                    data-testid={`btn-delete-${u.id}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete {u.name}?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete <strong>{u.name}</strong> ({u.email}) and all their downloads and subscriptions. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={() => handleDelete(u.id, u.name)}
                                    >
                                      Delete permanently
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!users?.length && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No users found.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Application Settings</CardTitle>
              <CardDescription>Configure pricing, API keys, and limits.</CardDescription>
            </CardHeader>
            <CardContent>
              {settingsLoading ? <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div> : (
                <Form {...settingsForm}>
                  <form onSubmit={settingsForm.handleSubmit((values) => {
                    updateSettingsMutation.mutate(
                      { data: values, ...reqOptions },
                      {
                        onSuccess: () => toast({ title: "Settings updated", description: "Changes saved successfully" }),
                        onError: (e: unknown) => toast({ variant: "destructive", title: "Error", description: getApiErrorMessage(e, "Failed to update settings") })
                      }
                    );
                  })} className="space-y-6">
                    
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={settingsForm.control} name="subscriptionPrice" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subscription Price</FormLabel>
                          <FormControl><Input type="number" {...field} data-testid="input-setting-price" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={settingsForm.control} name="currency" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Currency</FormLabel>
                          <FormControl><Input {...field} data-testid="input-setting-currency" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <FormField control={settingsForm.control} name="freeDownloadsPerUser" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Free Downloads Per User</FormLabel>
                          <FormControl><Input type="number" {...field} data-testid="input-setting-free-dl" /></FormControl>
                          <FormMessage />
                        </FormItem>
                    )} />

                    <div className="pt-4 border-t border-border">
                      <h3 className="text-lg font-medium mb-4">Paylor Integration</h3>
                      <div className="space-y-4">
                        <FormField control={settingsForm.control} name="paylorApiUrl" render={({ field }) => (
                          <FormItem>
                            <FormLabel>API URL</FormLabel>
                            <FormControl><Input {...field} data-testid="input-setting-paylor-url" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={settingsForm.control} name="paylorApiKey" render={({ field }) => (
                          <FormItem>
                            <FormLabel>API Key</FormLabel>
                            <FormControl><Input type="password" {...field} data-testid="input-setting-paylor-key" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={settingsForm.control} name="paylorChannelId" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Channel ID</FormLabel>
                            <FormControl><Input {...field} placeholder="e.g. PAYL-XJ7K2P" data-testid="input-setting-paylor-channel" /></FormControl>
                            <FormDescription className="text-xs text-muted-foreground mt-1">Your Paylor merchant channel ID (found in your Paylor dashboard).</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                    </div>

                    <div className="pt-4 border-t border-border">
                      <h3 className="text-lg font-medium mb-4">Security</h3>
                      <FormField control={settingsForm.control} name="adminKey" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Admin Key</FormLabel>
                          <FormControl><Input type="password" {...field} data-testid="input-setting-admin-key" /></FormControl>
                          <FormDescription className="text-xs text-muted-foreground mt-1">If you change this, you will need to re-authenticate.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <Button type="submit" disabled={updateSettingsMutation.isPending} data-testid="button-save-settings">
                      {updateSettingsMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                      Save Changes
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
