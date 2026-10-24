import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  completeUsernameChange,
  requestUsernameChange,
  resendUsernameChangeCode,
  verifyUsernameChangeCode,
} from "@/api/auth";

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{6,12}$/;
const CODE_RESEND_COOLDOWN_SECONDS = 30;

function UsernameChangeFlow({ open, onClose, currentUsername = "", email = "", darkMode = false, onVerified }) {
  const [step, setStep] = useState("password");
  const [newUsername, setNewUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [sentToEmail, setSentToEmail] = useState(email);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!open || step !== "code") return undefined;
    const timer = window.setInterval(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    setStep("password");
    setNewUsername("");
    setCurrentPassword("");
    setShowCurrentPassword(false);
    setSentToEmail(email);
    setCode("");
    setError("");
    setMessage("");
    setCooldown(0);
  }, [open, email]);

  const close = () => {
    if (saving || verifying || resending) return;
    setStep("password");
    setError("");
    setMessage("");
    onClose?.();
  };

  const requestCode = async (event) => {
    event.preventDefault();
    setError("");
    if (!currentPassword) {
      setError("Enter your current password to continue.");
      return;
    }

    setSaving(true);
    try {
      const response = await requestUsernameChange({ current_password: currentPassword });
      setSentToEmail(response.verification_email || email);
      setCode("");
      setCooldown(CODE_RESEND_COOLDOWN_SECONDS);
      setMessage(`A verification code was sent to ${response.verification_email || email}.`);
      setStep("code");
    } catch (requestError) {
      setError(requestError?.data?.message || requestError?.message || "Unable to request a verification code.");
    } finally {
      setSaving(false);
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    if (verifying) return;
    setError("");
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the six-digit verification code.");
      return;
    }
    setVerifying(true);
    try {
      const response = await verifyUsernameChangeCode(code);
      setMessage(response.message || "Email verified. You can now choose a new username.");
      setCode("");
      setError("");
      setStep("username");
    } catch (verifyError) {
      setError(verifyError?.data?.message || verifyError?.message || "Unable to verify the code.");
    } finally {
      setVerifying(false);
    }
  };

  const resendCode = async () => {
    if (resending || verifying || cooldown > 0) return;
    setError("");
    setResending(true);
    try {
      const response = await resendUsernameChangeCode();
      setCode("");
      setCooldown(CODE_RESEND_COOLDOWN_SECONDS);
      setMessage(response.message || "A new verification code was sent.");
    } catch (resendError) {
      const retryAfter = Number(resendError?.data?.retry_after_seconds) || 0;
      if (retryAfter) setCooldown(retryAfter);
      setError(resendError?.data?.message || resendError?.message || "Unable to resend the verification code.");
    } finally {
      setResending(false);
    }
  };

  const saveUsername = async (event) => {
    event.preventDefault();
    if (saving) return;
    setError("");
    const username = newUsername.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(username)) {
      setError("Use 6-12 letters, numbers, dots, underscores, or hyphens.");
      return;
    }
    if (username === String(currentUsername).trim().toLowerCase()) {
      setError("This matches your current username.");
      return;
    }

    setSaving(true);
    try {
      const response = await completeUsernameChange(username);
      await onVerified?.(response.username || username, response);
      setStep("password");
      setMessage("");
      onClose?.();
    } catch (saveError) {
      setError(saveError?.data?.message || saveError?.message || "Unable to update your username.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const surfaceClass = `my-auto w-full max-w-lg rounded-2xl border p-5 shadow-2xl sm:p-6 ${darkMode ? "border-slate-700 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-900"}`;
  const fieldClass = `w-full rounded-xl border px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500 ${darkMode ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"}`;
  const cancelButton = `rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${darkMode ? "border-slate-600 text-slate-200 hover:bg-slate-700" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`;
  const submitButton = "rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-wait disabled:opacity-60";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6">
      {step === "code" ? (
        <form role="dialog" aria-modal="true" aria-labelledby="username-verify-title" onSubmit={verifyCode} className={surfaceClass}>
          <h2 id="username-verify-title" className="text-lg font-bold">Verify Your Email</h2>
          <p className={`mt-1 text-sm ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
            Enter the six-digit code sent to <strong>{sentToEmail}</strong> before choosing a new username.
          </p>
          {message && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
          {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <label htmlFor="username-verification-code" className="mb-2 mt-5 block text-sm font-medium">Verification Code</label>
          <input
            id="username-verification-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className={`${fieldClass} text-center text-lg font-bold tracking-[0.3em]`}
          />
          <div className="mt-3">
            <button type="button" onClick={resendCode} disabled={resending || verifying || cooldown > 0} className={`text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${darkMode ? "text-red-300" : "text-red-700"}`}>
              {resending ? "Sending code..." : cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            </button>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={close} disabled={verifying || resending} className={cancelButton}>Cancel</button>
            <button type="submit" disabled={verifying || resending} className={submitButton}>
              {verifying ? "Verifying..." : "Verify Code"}
            </button>
          </div>
        </form>
      ) : step === "username" ? (
        <form role="dialog" aria-modal="true" aria-labelledby="username-change-title" onSubmit={saveUsername} className={surfaceClass}>
          <h2 id="username-change-title" className="text-lg font-bold">Choose New Username</h2>
          <p className={`mt-1 text-sm ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
            Your email is verified. Enter the username you want to use for your account.
          </p>
          {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <label htmlFor="new-account-username" className="mb-2 mt-5 block text-sm font-semibold">New Username</label>
          <input id="new-account-username" type="text" autoComplete="username" minLength={6} maxLength={12} pattern="[A-Za-z0-9._-]{6,12}" required autoFocus value={newUsername} onChange={(event) => setNewUsername(event.target.value)} className={fieldClass} />
          <p className={`mt-1 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Use 6-12 letters, numbers, dots, underscores, or hyphens.</p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={close} disabled={saving} className={cancelButton}>Cancel</button>
            <button type="submit" disabled={saving} className={submitButton}>
              {saving ? "Saving username..." : "Save username"}
            </button>
          </div>
        </form>
      ) : (
        <form role="dialog" aria-modal="true" aria-labelledby="username-start-title" onSubmit={requestCode} className={surfaceClass}>
          <h2 id="username-start-title" className="text-lg font-bold">Change Username</h2>
          <p className={`mt-1 text-sm ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
            We'll send a verification code to your account email, <strong>{email}</strong>. Verify your email before entering a new username.
          </p>
          {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <label htmlFor="username-current-password" className="mb-2 mt-5 block text-sm font-semibold">Current Password</label>
          <div className="relative">
            <input id="username-current-password" type={showCurrentPassword ? "text" : "password"} autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className={`${fieldClass} pr-12`} />
            <button
              type="button"
              onClick={() => setShowCurrentPassword((visible) => !visible)}
              aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
              aria-pressed={showCurrentPassword}
              className={`absolute inset-y-0 right-0 inline-flex items-center justify-center px-4 ${darkMode ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-800"}`}
            >
              {showCurrentPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={close} disabled={saving} className={cancelButton}>Cancel</button>
            <button type="submit" disabled={saving} className={submitButton}>
              {saving ? "Sending code..." : "Send verification code"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default UsernameChangeFlow;
