import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2 } from "lucide-react";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  useForgotPassword,
  useVerifyResetCode,
  useResetPassword,
} from "@workspace/api-client-react";

// ─── Step 1: Confirm identity (email + phone) ─────────────────────────────────

const identitySchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().min(9, "Please enter a valid phone number"),
});

function StepEmail({ onNext }: { onNext: (email: string) => void }) {
  const { toast } = useToast();
  const mutation = useForgotPassword();
  const form = useForm<z.infer<typeof identitySchema>>({
    resolver: zodResolver(identitySchema),
    defaultValues: { email: "", phone: "" },
  });

  function onSubmit(values: z.infer<typeof identitySchema>) {
    mutation.mutate(
      { data: values },
      {
        onSuccess: () => onNext(values.email),
        onError: (err: unknown) =>
          toast({
            variant: "destructive",
            title: "Could not verify account",
            description: getApiErrorMessage(err, "Please check your details and try again."),
          }),
      }
    );
  }

  return (
    <Card className="w-full max-w-md shadow-2xl border-primary/10">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-3xl font-bold tracking-tight">Forgot password?</CardTitle>
        <CardDescription>
          Confirm your account details and we'll send a 6-digit code to your email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email address</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      data-testid="input-forgot-email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone number</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="07XXXXXXXX"
                      data-testid="input-forgot-phone"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={mutation.isPending}
              data-testid="button-forgot-send"
            >
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send verification code
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

// ─── Step 2: Enter OTP code ───────────────────────────────────────────────────

const codeSchema = z.object({
  code: z
    .string()
    .length(6, "The code must be exactly 6 digits")
    .regex(/^\d+$/, "Only digits allowed"),
});

function StepCode({
  email,
  onNext,
  onBack,
}: {
  email: string;
  onNext: (code: string) => void;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const mutation = useVerifyResetCode();
  const form = useForm<z.infer<typeof codeSchema>>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });

  function onSubmit(values: z.infer<typeof codeSchema>) {
    mutation.mutate(
      { data: { email, code: values.code } },
      {
        onSuccess: () => onNext(values.code),
        onError: (err: unknown) =>
          toast({
            variant: "destructive",
            title: "Invalid code",
            description: getApiErrorMessage(err, "The code is incorrect or has expired."),
          }),
      }
    );
  }

  return (
    <Card className="w-full max-w-md shadow-2xl border-primary/10">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-3xl font-bold tracking-tight">Enter your code</CardTitle>
        <CardDescription className="space-y-1">
          <span>
            We sent a 6-digit code to{" "}
            <span className="font-medium text-foreground">{email}</span>.
          </span>
          <span className="block text-xs mt-1">
            Don't see it? <strong>Check your spam or junk folder</strong> — it may have landed there.
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Verification code</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="123456"
                      className="text-center text-2xl tracking-[0.4em] font-mono"
                      data-testid="input-reset-code"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={mutation.isPending}
              data-testid="button-verify-code"
            >
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verify code
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={onBack}
            >
              Use a different email
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// ─── Step 3: Set new password ─────────────────────────────────────────────────

const passwordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

function StepNewPassword({
  email,
  code,
  onDone,
}: {
  email: string;
  code: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const mutation = useResetPassword();
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "", confirm: "" },
  });

  function onSubmit(values: z.infer<typeof passwordSchema>) {
    mutation.mutate(
      { data: { email, code, newPassword: values.password } },
      {
        onSuccess: () => onDone(),
        onError: (err: unknown) =>
          toast({
            variant: "destructive",
            title: "Error",
            description: getApiErrorMessage(err, "Could not reset password. Please try again."),
          }),
      }
    );
  }

  return (
    <Card className="w-full max-w-md shadow-2xl border-primary/10">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-3xl font-bold tracking-tight">Set new password</CardTitle>
        <CardDescription>Choose a strong password for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="At least 8 characters"
                      data-testid="input-new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Repeat your new password"
                      data-testid="input-confirm-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={mutation.isPending}
              data-testid="button-reset-password"
            >
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Set new password
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// ─── Step 4: Done ─────────────────────────────────────────────────────────────

function StepDone() {
  return (
    <Card className="w-full max-w-md shadow-2xl border-primary/10 text-center">
      <CardHeader className="space-y-3 pt-10 pb-2">
        <div className="flex justify-center">
          <CheckCircle2 className="w-14 h-14 text-primary" />
        </div>
        <CardTitle className="text-2xl font-bold">Password updated!</CardTitle>
        <CardDescription>
          Your password has been reset successfully. You can now sign in with your new password.
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-8">
        <Link href="/login">
          <Button className="w-full mt-4" data-testid="button-go-to-login">
            Go to sign in
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Step = "email" | "code" | "password" | "done";

export default function ForgotPassword() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      {step === "email" && (
        <StepEmail
          onNext={(e) => {
            setEmail(e);
            setStep("code");
          }}
        />
      )}
      {step === "code" && (
        <StepCode
          email={email}
          onNext={(c) => {
            setCode(c);
            setStep("password");
          }}
          onBack={() => setStep("email")}
        />
      )}
      {step === "password" && (
        <StepNewPassword email={email} code={code} onDone={() => setStep("done")} />
      )}
      {step === "done" && <StepDone />}
    </div>
  );
}
