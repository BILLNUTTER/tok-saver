import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { Download, Share, CheckCircle2, SmartphoneNfc, UserCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useState } from "react";

type InstallDialog = "none" | "ios" | "manual";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const isAdminMode = new URLSearchParams(window.location.search).get("admin") === "true";
  const { installState, install } = usePwaInstall();
  const [dialog, setDialog] = useState<InstallDialog>("none");

  const handleInstall = async () => {
    if (installState === "ios") {
      setDialog("ios");
    } else if (installState === "ready") {
      await install();
    } else if (installState === "manual") {
      setDialog("manual");
    }
  };

  // Show the install button in all states except the initial "unsupported" check phase
  const showInstallBtn = !isAdminMode && installState !== "unsupported";

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground dark">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href={isAdminMode ? "/?admin=true" : "/"}
            className="font-bold text-xl tracking-tight flex items-center gap-2"
          >
            <span className="text-primary">Tok</span>Saver
            {isAdminMode && (
              <Badge variant="outline" className="text-xs font-normal text-muted-foreground border-border ml-1">
                Admin
              </Badge>
            )}
          </Link>

          <nav className="flex items-center gap-2">
            {showInstallBtn && (
              <>
                {installState === "installed" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled
                    className="gap-1.5 text-green-400 opacity-90 cursor-default"
                    data-testid="button-install-downloaded"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Downloaded</span>
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleInstall}
                    className="gap-1.5 text-primary hover:text-primary"
                    data-testid="button-install-app"
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">Download App</span>
                  </Button>
                )}
              </>
            )}

            {!isAdminMode && (
              <>
                {user ? (
                  <>
                    <Link href="/settings">
                      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" data-testid="link-nav-account">
                        <UserCircle className="w-4 h-4" />
                        <span className="hidden sm:inline">Account</span>
                      </Button>
                    </Link>
                    {!user.hasActiveSubscription && (
                      <Link href="/subscribe">
                        <Button variant="secondary" size="sm" className="text-primary font-semibold" data-testid="link-nav-subscribe">
                          Upgrade to Pro
                        </Button>
                      </Link>
                    )}
                    <Button variant="ghost" size="sm" onClick={logout} data-testid="button-logout">
                      Logout
                    </Button>
                  </>
                ) : (
                  <>
                    <Link href="/login">
                      <Button variant="ghost" size="sm" data-testid="link-nav-login">
                        Login
                      </Button>
                    </Link>
                    <Link href="/register">
                      <Button size="sm" data-testid="link-nav-register">
                        Get Started
                      </Button>
                    </Link>
                  </>
                )}
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="border-t border-border py-8 px-4 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground/70 mb-1">TokSaver</p>
        <p>&copy; {new Date().getFullYear()} TokSaver — Download TikTok videos without watermarks.</p>
        <p className="mt-2">
          Support:{" "}
          <a href="mailto:nutterxtech@gmail.com" className="text-primary hover:underline">nutterxtech@gmail.com</a>
        </p>
      </footer>

      {/* iOS Safari install instructions */}
      <Dialog open={dialog === "ios"} onOpenChange={(o) => !o && setDialog("none")}>
        <DialogContent className="dark bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share className="w-5 h-5 text-primary" />
              Add TokSaver to Home Screen
            </DialogTitle>
            <DialogDescription className="text-left space-y-2 pt-2">
              <span className="block">To install TokSaver on your iPhone or iPad:</span>
              <ol className="list-decimal list-inside space-y-1 text-foreground/80">
                <li>Tap the <strong>Share</strong> button <Share className="w-3 h-3 inline" /> at the bottom of Safari</li>
                <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                <li>Tap <strong>Add</strong> in the top right corner</li>
              </ol>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Manual install instructions for browsers that don't support auto-prompt */}
      <Dialog open={dialog === "manual"} onOpenChange={(o) => !o && setDialog("none")}>
        <DialogContent className="dark bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SmartphoneNfc className="w-5 h-5 text-primary" />
              Install TokSaver
            </DialogTitle>
            <DialogDescription className="text-left space-y-3 pt-2">
              <span className="block">To add TokSaver to your home screen:</span>
              <div className="space-y-2 text-foreground/80">
                <p className="font-semibold text-foreground text-xs uppercase tracking-wider">Android Chrome</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>Tap the <strong>⋮ menu</strong> (top right)</li>
                  <li>Tap <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong></li>
                </ol>
              </div>
              <div className="space-y-2 text-foreground/80">
                <p className="font-semibold text-foreground text-xs uppercase tracking-wider">Samsung Internet</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>Tap the <strong>☰ menu</strong></li>
                  <li>Tap <strong>"Add page to"</strong> → <strong>"Home screen"</strong></li>
                </ol>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
