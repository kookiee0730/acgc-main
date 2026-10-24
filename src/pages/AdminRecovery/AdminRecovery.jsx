import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AtSign, ArrowLeft, CheckCircle2, Eye, EyeOff, Hash, KeyRound, LockKeyhole, Mail, ShieldAlert, ShieldCheck, UserRound } from "lucide-react";
import { restoreAdminRecovery, verifyAdminRecovery } from "@/api/auth";
import { getPasswordStrength, isPasswordPolicySatisfied, PASSWORD_POLICY_HINT, PASSWORD_POLICY_MESSAGE } from "@/lib/passwordStrength";
import logo from "@/assets/images/ACGCLOGO1.png";

const EMPTY_PROFILE = {
  first_name: "",
  last_name: "",
  email: "",
  username: "",
  password: "",
  confirmPassword: "",
};

const inputClass = "w-full rounded-xl border border-gray-300 bg-white py-2.5 pr-4 text-sm text-slate-950 outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-500/10";
const ADMIN_USERNAME_PATTERN = /^[A-Za-z0-9._-]{6,12}$/;

const validateRecoveryProfile = (profile) => {
  const firstName = profile.first_name.trim();
  const lastName = profile.last_name.trim();
  const email = profile.email.trim();
  const username = profile.username.trim();

  if (!firstName || !lastName) return "Enter the administrator first and last name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return "Enter a valid administrator email address.";
  if (!ADMIN_USERNAME_PATTERN.test(username)) return "Use a username with 6-12 letters, numbers, dots, underscores, or hyphens. Do not use an email address as the username.";
  if (!isPasswordPolicySatisfied(profile.password)) return PASSWORD_POLICY_MESSAGE;
  if (profile.password !== profile.confirmPassword) return "The passwords do not match.";
  return "";
};

function AdminRecovery() {
  const { refreshAdminStatus } = useAuth();
  const [step, setStep] = useState("verify");
  const [ownerCredentials, setOwnerCredentials] = useState({ username: "", secret: "", code: "" });
  const [recoverySession, setRecoverySession] = useState("");
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [confirmed, setConfirmed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [error, setError] = useState("");
  const passwordStrength = getPasswordStrength(profile.password);

  useEffect(() => {
    if (retrySeconds <= 0) return undefined;
    const timeoutId = window.setTimeout(() => {
      setRetrySeconds((remaining) => Math.max(remaining - 1, 0));
    }, 1000);
    return () => window.clearTimeout(timeoutId);
  }, [retrySeconds]);

  const updateOwnerCredential = (event) => {
    const { name, value } = event.target;
    setOwnerCredentials((current) => ({ ...current, [name]: value }));
  };

  const updateProfile = (event) => {
    const { name, value } = event.target;
    setProfile((current) => ({ ...current, [name]: value }));
  };

  const verifyOwner = async (event) => {
    event.preventDefault();
    if (busy || retrySeconds > 0) return;
    setBusy(true);
    setError("");
    try {
      const response = await verifyAdminRecovery(ownerCredentials);
      setRecoverySession(response.recoverySession);
      setOwnerCredentials({ username: "", secret: "", code: "" });
      setStep("restore");
    } catch (requestError) {
      const status = requestError.response?.status;
      if (status === 429) {
        const seconds = Math.max(1, Number(requestError.retryAfterSeconds) || 1);
        setRetrySeconds(seconds);
        setError(`Too many attempts. Wait ${seconds} seconds before trying again.`);
      } else if (status === 401) {
        const seconds = Math.max(0, Number(requestError.retryAfterSeconds) || 0);
        setRetrySeconds(seconds);
        setError("The recovery details do not match the deployed backend. Check ADMIN_RECOVERY_USERNAME, ADMIN_RECOVERY_SECRET, and ADMIN_RECOVERY_TOTP_SECRET in Vercel and confirm the authenticator setup before retrying.");
      } else if (status === 403) {
        setError("Emergency recovery is unavailable. It is disabled while a valid administrator account exists; otherwise check the backend recovery configuration.");
      } else {
        setError(requestError.data?.message || "Unable to verify recovery details right now.");
      }
    } finally {
      setBusy(false);
    }
  };

  const restoreAdministrator = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    const validationError = validateRecoveryProfile(profile);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!confirmed) {
      setError("Confirm that you are restoring administrator access.");
      return;
    }

    setBusy(true);
    try {
      await restoreAdminRecovery({
        recoverySession,
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email.trim().toLowerCase(),
        username: profile.username.trim().toLowerCase(),
        password: profile.password,
      });
      await refreshAdminStatus();
      setRecoverySession("");
      setProfile(EMPTY_PROFILE);
      setConfirmed(false);
      setStep("success");
    } catch (requestError) {
      setError(requestError.data?.message || "Unable to complete recovery right now. Please try again later.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="public-light-theme relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(220,38,38,0.10),_transparent_42%),linear-gradient(135deg,_#f8fafc,_#e2e8f0)]" aria-hidden="true" />
      <section className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
        <div className="flex items-center gap-4 border-b border-slate-200 px-6 py-5 sm:px-8">
          <img src={logo} alt="ACGC Aluminum Services" className="h-12 w-12 object-contain" />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-700">ACGC Aluminum Services</p>
            <h1 className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">Administrator Account Recovery</h1>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          {step === "verify" && (
            <>
              <div className="mb-6 flex items-start gap-3 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-950">
                <ShieldAlert size={19} className="mt-0.5 shrink-0" aria-hidden="true" />
                <p>Use this only when no working administrator account is available. Recovery requires the system owner credentials and a current authenticator code.</p>
              </div>
              {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
              <form onSubmit={verifyOwner} className="space-y-4">
                <RecoveryField icon={UserRound} label="Recovery username" autoComplete="username" name="username" required value={ownerCredentials.username} onChange={updateOwnerCredential} placeholder="Enter recovery username" />
                <RecoveryField icon={LockKeyhole} label="Recovery secret" autoComplete="off" name="secret" type="password" required minLength={32} value={ownerCredentials.secret} onChange={updateOwnerCredential} placeholder="Enter recovery secret" />
                <RecoveryField icon={Hash} label="Authenticator code" autoComplete="one-time-code" name="code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={ownerCredentials.code} onChange={updateOwnerCredential} placeholder="000000" className="max-w-48 font-mono tracking-[0.2em]" />
                <button type="submit" disabled={busy || retrySeconds > 0} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-bold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60">
                  <KeyRound size={17} aria-hidden="true" />{busy ? "Verifying..." : retrySeconds > 0 ? `Try again in ${retrySeconds}s` : "Verify owner credentials"}
                </button>
              </form>
            </>
          )}

          {step === "restore" && (
            <>
              <div className="mb-6 flex items-start gap-3 border-l-4 border-red-600 bg-red-50 p-4 text-sm text-red-950">
                <ShieldCheck size={19} className="mt-0.5 shrink-0" aria-hidden="true" />
                <p>Set the administrator account details. Recovery will not change customers, products, orders, payments, contracts, or other business records.</p>
              </div>
              {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
              <form onSubmit={restoreAdministrator} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <RecoveryField icon={UserRound} label="First name" autoComplete="given-name" name="first_name" required maxLength={80} value={profile.first_name} onChange={updateProfile} placeholder="Enter first name" />
                  <RecoveryField icon={UserRound} label="Last name" autoComplete="family-name" name="last_name" required maxLength={80} value={profile.last_name} onChange={updateProfile} placeholder="Enter last name" />
                  <RecoveryField icon={Mail} label="Administrator email" autoComplete="email" name="email" type="email" required maxLength={254} value={profile.email} onChange={updateProfile} placeholder="Enter administrator email" />
                  <RecoveryField icon={AtSign} label="Administrator username" autoComplete="username" name="username" required minLength={6} maxLength={12} pattern="[A-Za-z0-9._-]{6,12}" title="Use 6-12 letters, numbers, dots, underscores, or hyphens. Do not use an email address." value={profile.username} onChange={updateProfile} placeholder="admin_acgc" />
                  <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                    New password
                    <span className="relative block">
                      <RecoveryInput icon={LockKeyhole} hasVisibilityToggle autoComplete="new-password" name="password" type={showPassword ? "text" : "password"} required minLength={8} maxLength={128} value={profile.password} onChange={updateProfile} />
                      <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide new password" : "Show new password"} aria-pressed={showPassword} className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">
                        {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                      </button>
                    </span>
                    {profile.password ? (
                      <span className="block" aria-live="polite">
                        <span className="block h-1.5 w-3/4 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Password strength" aria-valuemin={0} aria-valuemax={4} aria-valuenow={passwordStrength.score}>
                          <span className="block h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${passwordStrength.score * 25}%`, backgroundColor: passwordStrength.color }} />
                        </span>
                        <span className="mt-1 block text-xs font-semibold" style={{ color: passwordStrength.color }}>{passwordStrength.label} password</span>
                      </span>
                    ) : null}
                    <span className="mt-2 block text-xs leading-4 text-slate-500">{PASSWORD_POLICY_HINT}</span>
                  </label>
                  <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                    Confirm password
                    <span className="relative block">
                      <RecoveryInput icon={LockKeyhole} hasVisibilityToggle autoComplete="new-password" name="confirmPassword" type={showConfirmPassword ? "text" : "password"} required minLength={8} maxLength={128} value={profile.confirmPassword} onChange={updateProfile} />
                      <button type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "Hide confirmed password" : "Show confirmed password"} aria-pressed={showConfirmPassword} className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">
                        {showConfirmPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                      </button>
                    </span>
                  </label>
                </div>
                <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                  <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 size-4 accent-red-700" />
                  <span>I confirm that I am the authorized system owner and want to restore this administrator account.</span>
                </label>
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                  <button type="button" disabled={busy} onClick={() => { setRecoverySession(""); setStep("verify"); setError(""); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><ArrowLeft size={16} aria-hidden="true" />Start over</button>
                  <button type="submit" disabled={busy || !confirmed} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-700 px-5 text-sm font-bold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Restoring..." : "Restore administrator access"}</button>
                </div>
              </form>
            </>
          )}

          {step === "success" && (
            <div className="py-6 text-center">
              <CheckCircle2 size={48} className="mx-auto text-emerald-600" aria-hidden="true" />
              <h2 className="mt-4 text-xl font-black text-slate-950">Administrator access restored</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Your recovery session has ended. Sign in using the administrator username or email and the password you just created.</p>
              <Link to="/login" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-red-700 px-6 text-sm font-bold text-white hover:bg-red-800">Continue to login</Link>
            </div>
          )}

          {step !== "success" && <div className="mt-6 border-t border-slate-200 pt-4 text-center"><Link to="/login" className="text-sm font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-red-700">Return to administrator login</Link></div>}
        </div>
      </section>
    </main>
  );
}

function RecoveryField({ icon: Icon, label, className = "", ...inputProps }) {
  return (
    <label className="block text-xs font-semibold text-slate-700">
      <span className="mb-1 block">{label}</span>
      <RecoveryInput icon={Icon} className={className} {...inputProps} />
    </label>
  );
}

function RecoveryInput({ icon: Icon, hasVisibilityToggle = false, className = "", ...inputProps }) {
  return (
    <span className="relative block">
      {Icon && <Icon size={18} strokeWidth={1.8} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />}
      <input {...inputProps} className={`${inputClass} ${Icon ? "pl-11" : "pl-4"} ${hasVisibilityToggle ? "pr-12" : ""} ${className}`} />
    </span>
  );
}

export default AdminRecovery;
