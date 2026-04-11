import { useMutation } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { ApiError } from "./custom-fetch";
import type { ForgotPasswordBody, VerifyResetCodeBody, ResetPasswordBody, MessageResponse } from "./generated/api.schemas";

// ─── Forgot Password ──────────────────────────────────────────────────────────

export const forgotPassword = (data: ForgotPasswordBody): Promise<MessageResponse> =>
  customFetch<MessageResponse>("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const useForgotPassword = (): UseMutationResult<
  MessageResponse,
  ApiError,
  { data: ForgotPasswordBody }
> =>
  useMutation({
    mutationKey: ["auth", "forgot-password"],
    mutationFn: ({ data }) => forgotPassword(data),
  });

// ─── Verify Reset Code ────────────────────────────────────────────────────────

export const verifyResetCode = (data: VerifyResetCodeBody): Promise<MessageResponse> =>
  customFetch<MessageResponse>("/api/auth/verify-reset-code", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const useVerifyResetCode = (): UseMutationResult<
  MessageResponse,
  ApiError,
  { data: VerifyResetCodeBody }
> =>
  useMutation({
    mutationKey: ["auth", "verify-reset-code"],
    mutationFn: ({ data }) => verifyResetCode(data),
  });

// ─── Reset Password ───────────────────────────────────────────────────────────

export const resetPassword = (data: ResetPasswordBody): Promise<MessageResponse> =>
  customFetch<MessageResponse>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const useResetPassword = (): UseMutationResult<
  MessageResponse,
  ApiError,
  { data: ResetPasswordBody }
> =>
  useMutation({
    mutationKey: ["auth", "reset-password"],
    mutationFn: ({ data }) => resetPassword(data),
  });
