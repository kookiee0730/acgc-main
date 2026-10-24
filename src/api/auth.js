import { apiFetch } from "./client";

export const register = (payload) => apiFetch("/auth/register", {
  method: "POST",
  body: JSON.stringify(payload),
  _retries: 1,
});

export const verifyEmail = (token) =>
  apiFetch(`/auth/verify-email?token=${encodeURIComponent(token)}`);

export const requestPasswordReset = (email) =>
  apiFetch("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
    _retries: 1,
  });

export const resendPasswordResetCode = (email) =>
  apiFetch("/auth/resend-reset-code", {
    method: "POST",
    body: JSON.stringify({ email }),
    _retries: 1,
  });

export const verifyPasswordResetCode = (email, code) =>
  apiFetch("/auth/verify-reset-code", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });

export const resetPassword = (resetToken, password) =>
  apiFetch("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ resetToken, password }),
  });

export const login = (payload) => apiFetch("/auth/login", {
  method: "POST",
  body: JSON.stringify(payload),
});

export const adminExists = () => apiFetch("/auth/admin-exists", { cache: "no-store" });

export const verifyAdminRecovery = (payload) => apiFetch("/auth/admin-recovery/verify", {
  method: "POST",
  body: JSON.stringify(payload),
});

export const restoreAdminRecovery = (payload) => apiFetch("/auth/admin-recovery/restore", {
  method: "POST",
  body: JSON.stringify(payload),
});

export const getMe = () => apiFetch("/auth/me", { cache: "no-store" });

export const getPublicContact = () => apiFetch("/auth/public-contact", { cache: "no-store" });

export const updateProfile = (payload) => apiFetch("/auth/profile", {
  method: "PUT",
  body: JSON.stringify(payload),
});

export const requestEmailChange = (payload) => apiFetch("/auth/profile/email-change", {
  method: "POST",
  body: JSON.stringify(payload),
});

export const verifyEmailChangeCode = (code) => apiFetch("/auth/profile/email-change/verify", {
  method: "POST",
  body: JSON.stringify({ code }),
});

export const resendEmailChangeCode = () => apiFetch("/auth/profile/email-change/resend", {
  method: "POST",
});

export const requestUsernameChange = (payload) => apiFetch("/auth/profile/username-change/request-code", {
  method: "POST",
  body: JSON.stringify(payload),
});

export const resendUsernameChangeCode = () => apiFetch("/auth/profile/username-change/resend", {
  method: "POST",
});

export const verifyUsernameChangeCode = (code) => apiFetch("/auth/profile/username-change/verify", {
  method: "POST",
  body: JSON.stringify({ code }),
});

export const completeUsernameChange = (username) => apiFetch("/auth/profile/username-change/complete", {
  method: "POST",
  body: JSON.stringify({ username }),
});
