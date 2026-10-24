import { useEffect, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import {
  User,
  Mail,
  Phone,
  MapPin,
  LockKeyhole,
  Save,
  ShieldCheck,
  Activity,
  Clock3,
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  Eye,
  EyeOff,
  Pencil,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isPasswordPolicySatisfied, PASSWORD_POLICY_HINT, PASSWORD_POLICY_MESSAGE } from "@/lib/passwordStrength";
import { getPhilippinePhoneError, isValidPhilippinePhone, normalizePhoneInput } from "@/lib/phoneValidation";
import { getActivityStorageKey, readActivityLog } from "@/lib/activityLog";
import { getAdminOrder } from "@/api/orders";
import { requestEmailChange, resendEmailChangeCode, verifyEmailChangeCode } from "@/api/auth";
import { formatDateTimeToMMMDDYYYY } from "@/lib/dateUtils";
import { useAdminTheme } from "@/contexts/AdminThemeContext";

import Sidebar from "../../components/layout/Sidebar";
import Navbar from "../../components/layout/Navbar";
import AdminPageHeader from "../../components/layout/AdminPageHeader";
import { useIsMobile } from "@/hooks/useIsMobile";
import ProfileAvatar from "../../components/ui/ProfileAvatar";
import { subscribeToRealtime } from "@/lib/realtimeEvents";
import UsernameChangeFlow from "@/components/UsernameChangeFlow";

function AdminProfileTextField({ label, icon: Icon, darkMode, action, inputClassName = "", ...inputProps }) {
  const inputId = inputProps.id || `admin-profile-${inputProps.name}`;
  const themeClass = darkMode
    ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-400 disabled:text-slate-400"
    : "border-gray-300 bg-white text-slate-900 placeholder:text-gray-400 disabled:border-slate-200 disabled:bg-gray-100 disabled:text-gray-500";

  return (
    <div className={`block text-xs font-semibold ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
      <span className="mb-1 flex min-h-4 items-center justify-between gap-2">
        <label htmlFor={inputId}>{label}</label>
        {action}
      </span>
      <span className="relative block">
        <Icon size={18} strokeWidth={1.8} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          {...inputProps}
          id={inputId}
          className={`w-full rounded-xl border py-2.5 pl-11 pr-4 outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-500/10 disabled:cursor-not-allowed ${themeClass} ${inputClassName}`}
        />
      </span>
    </div>
  );
}

const createProfileDraft = (user) => ({
  first_name: user.first_name || "",
  last_name: user.last_name || "",
  email: user.email || "",
  username: user.username || "",
  role: user.role === "skilled_worker" ? user.staff_access?.subrole || "Staff" : user.role || "admin",
  phone: user.phone || "",
  street_address: user.street_address || "",
  current_password: "",
  new_password: "",
  confirm_password: "",
});

const getVisibleActivityLog = (user) => readActivityLog(user).filter(
  (activity) =>
    !activity.description.startsWith("Updated profile information") &&
    !activity.description.startsWith("Visited "),
);

function AdminProfile() {
  const isMobile = useIsMobile();
  const { darkMode } = useAdminTheme();
  const activityPageSize = 5;
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("sidebarOpen");
    return stored !== null ? JSON.parse(stored) : true;
  });
  const { user, loading, updateProfile, refreshUser } = useAuth();
  const isStaff = user?.role === "skilled_worker";
  const profileType = isStaff ? "Staff" : "Admin";
  const [profile, setProfile] = useState(() => user ? createProfileDraft(user) : null);
  const profileAccountIdRef = useRef(user?.id || user?._id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState("profile");
  const [activityLog, setActivityLog] = useState(() => getVisibleActivityLog(user));
  const [activityPage, setActivityPage] = useState(1);
  const [activityDateFilter, setActivityDateFilter] = useState("");
  const [activityCategoryFilter, setActivityCategoryFilter] = useState("all");
  const [activitySearch, setActivitySearch] = useState("");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [passwordModalError, setPasswordModalError] = useState("");
  const [showDiscardConfirmation, setShowDiscardConfirmation] = useState(false);
  const [emailChangeOpen, setEmailChangeOpen] = useState(false);
  const [usernameChangeOpen, setUsernameChangeOpen] = useState(false);
  const [showEmailChangePassword, setShowEmailChangePassword] = useState(false);
  const [emailChangeSaving, setEmailChangeSaving] = useState(false);
  const [emailChangeError, setEmailChangeError] = useState("");
  const [emailChangeForm, setEmailChangeForm] = useState({ new_email: "", confirm_new_email: "", current_password: "" });
  const [emailVerifyOpen, setEmailVerifyOpen] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [emailVerificationCode, setEmailVerificationCode] = useState("");
  const [emailVerifyError, setEmailVerifyError] = useState("");
  const [emailVerifyMessage, setEmailVerifyMessage] = useState("");
  const [emailVerifyLoading, setEmailVerifyLoading] = useState(false);
  const [emailResending, setEmailResending] = useState(false);
  const [emailResendCooldown, setEmailResendCooldown] = useState(0);

  useEffect(() => {
    localStorage.setItem("sidebarOpen", JSON.stringify(isSidebarOpen));
  }, [isSidebarOpen]);

  useEffect(() => {
    if (!emailVerifyOpen) return undefined;
    const cooldownTimer = window.setInterval(() => {
      setEmailResendCooldown((remaining) => Math.max(remaining - 1, 0));
    }, 1000);
    return () => window.clearInterval(cooldownTimer);
  }, [emailVerifyOpen]);

  useEffect(() => {
    const accountId = user?.id || user?._id || "";
    if (!loading && user && profileAccountIdRef.current !== accountId) {
      profileAccountIdRef.current = accountId;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfile(createProfileDraft(user));
    }
  }, [loading, user]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    let requestInFlight = false;
    const loadActivityLog = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
      const storedActivityLog = getVisibleActivityLog(user);
      const orderActivityPrefixes = /^(Approved order|Rejected order|Cancelled site inspection|Restored site inspection|Updated site inspection|Generated contract for order|Created warranty for order|Approved transaction|Cancelled transaction|Updated progress for project|Cancelled project) /;
      const legacyEntries = storedActivityLog.filter((activity) =>
        orderActivityPrefixes.test(activity.description) &&
        /[a-f0-9]{24}/i.test(activity.description),
      );
      const orderIds = [
        ...new Set(
          legacyEntries
            .map((activity) => activity.description.match(/[a-f0-9]{24}/i)?.[0])
            .filter(Boolean),
        ),
      ];
      const orderResults = await Promise.all(
        orderIds.map(async (orderId) => {
          try {
            const response = await getAdminOrder(orderId, "profile");
            return [orderId, response.order || response];
          } catch {
            return [orderId, null];
          }
        }),
      );
      const ordersById = new Map(orderResults);
      const missingOrderIds = new Set(
        orderResults.filter(([, order]) => !order).map(([orderId]) => orderId),
      );
      const resolvedActivityLog = storedActivityLog
        .filter((activity) => {
          const orderId = activity.description.match(/[a-f0-9]{24}/i)?.[0];
          return !missingOrderIds.has(orderId);
        })
        .map((activity) => {
        const orderId = activity.description.match(/[a-f0-9]{24}/i)?.[0];
        const order = orderId ? ordersById.get(orderId) : null;
        if (!order) return activity;

        const customerName = order.customer
          ? `${order.customer.first_name || ""} ${order.customer.last_name || ""}`.trim() || order.customer.email || "Customer"
          : order.customer_name || "Customer";
        if (activity.description.startsWith("Approved order")) {
          return {
            ...activity,
            description: `Approved order for ${customerName} and moved it to site inspection.`,
            page: "Dashboard",
          };
        }
        if (activity.description.startsWith("Rejected order")) {
          return {
            ...activity,
            description: `Rejected order for ${customerName}.`,
            page: "Dashboard",
          };
        }
        if (activity.description.startsWith("Cancelled site inspection")) {
          return {
            ...activity,
            description: `Cancelled site inspection for ${customerName}.`,
            page: "Site Inspection",
          };
        }
        if (activity.description.startsWith("Restored site inspection")) {
          return {
            ...activity,
            description: `Restored site inspection for ${customerName}.`,
            page: "Site Inspection",
          };
        }
        if (activity.description.startsWith("Updated site inspection")) {
          return {
            ...activity,
            description: `Updated site inspection for ${customerName}.`,
            page: "Site Inspection",
          };
        }
        if (activity.description.startsWith("Generated contract for order")) {
          return {
            ...activity,
            description: `Generated contract for ${customerName}.`,
            page: "Site Inspection",
          };
        }
        if (activity.description.startsWith("Created warranty for order")) {
          return {
            ...activity,
            description: `Created warranty for ${customerName}.`,
            page: "Transactions",
          };
        }
        if (activity.description.startsWith("Approved transaction")) {
          return {
            ...activity,
            description: `Approved transaction for ${customerName}.`,
            page: "Transactions",
          };
        }
        if (activity.description.startsWith("Cancelled transaction")) {
          return {
            ...activity,
            description: `Cancelled transaction for ${customerName}.`,
            page: "Transactions",
          };
        }
        if (activity.description.startsWith("Updated progress for project")) {
          return {
            ...activity,
            description: `Updated progress for ${customerName}.`,
            page: "Progress Monitor",
          };
        }
        if (activity.description.startsWith("Cancelled project")) {
          return {
            ...activity,
            description: `Cancelled project for ${customerName}.`,
            page: "Progress Monitor",
          };
        }
        return activity;
        });

      localStorage.setItem(getActivityStorageKey(user), JSON.stringify(resolvedActivityLog));
      if (!cancelled) {
        setActivityLog(resolvedActivityLog);
      }
      } finally {
        requestInFlight = false;
      }
    };

    loadActivityLog();
    const unsubscribeRealtime = subscribeToRealtime(["orders"], () => {
      void loadActivityLog();
    });
    return () => {
      cancelled = true;
      unsubscribeRealtime();
    };
  }, [user]);

  const filteredActivityLog = activityLog.filter((activity) => {
    const activityCategory =
      activity.description === "Logged in" || activity.description === "Logged out"
        ? "security"
        : activity.page === "Products"
          ? "system"
          : "project";
    const matchesCategory =
      activityCategoryFilter === "all" ||
      activityCategoryFilter === activityCategory;
    const searchValue = activitySearch.trim().toLowerCase();
    const matchesSearch =
      !searchValue ||
      `${activity.description} ${activity.page || "Admin"}`
        .toLowerCase()
        .includes(searchValue);
    if (!matchesCategory || !matchesSearch) return false;
    if (!activityDateFilter) return true;
    const activityDate = new Date(activity.createdAt);
    const localDate = [
      activityDate.getFullYear(),
      String(activityDate.getMonth() + 1).padStart(2, "0"),
      String(activityDate.getDate()).padStart(2, "0"),
    ].join("-");
    return localDate === activityDateFilter;
  });
  const activityPageCount = Math.max(
    1,
    Math.ceil(filteredActivityLog.length / activityPageSize),
  );
  const currentActivityPage = Math.min(activityPage, activityPageCount);
  const visibleActivity = isMobile
    ? filteredActivityLog
    : filteredActivityLog.slice(
      (currentActivityPage - 1) * activityPageSize,
      currentActivityPage * activityPageSize,
    );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setError("");
    setSuccess("");
    setPasswordModalError("");
    setProfile((prev) => ({ ...prev, [name]: name === "phone" ? normalizePhoneInput(value) : value }));
  };

  const profileHasChanges = () => {
    if (!user || !profile) return false;
    return (
      profile.first_name !== (user.first_name || "") ||
      profile.last_name !== (user.last_name || "") ||
      profile.phone !== (user.phone || "") ||
      profile.street_address !== (user.street_address || "") ||
      Boolean(profile.new_password) ||
      Boolean(profile.confirm_password)
    );
  };

  const discardProfileChanges = () => {
    if (user) setProfile(createProfileDraft(user));
    setError("");
    setSuccess("");
    setPasswordModalError("");
    setShowPasswordModal(false);
    setShowCurrentPassword(false);
    setShowDiscardConfirmation(false);
  };

  const performSave = async ({ showErrorInModal = false } = {}) => {
    const setSaveError = showErrorInModal ? setPasswordModalError : setError;

    if (profile.phone.trim() && !isValidPhilippinePhone(profile.phone)) {
      setSaveError(getPhilippinePhoneError(profile.phone));
      return false;
    }

    if (!profile.current_password) {
      setSaveError("Please enter your current password to save profile changes.");
      return false;
    }

    if (!profile.first_name || !profile.last_name) {
      setSaveError("Please enter both first name and last name.");
      return false;
    }

    if (profile.new_password || profile.confirm_password) {
      if (!profile.new_password) {
        setSaveError("Please enter a new password.");
        return false;
      }

      if (!isPasswordPolicySatisfied(profile.new_password)) {
        setSaveError(PASSWORD_POLICY_MESSAGE);
        return false;
      }

      if (profile.new_password !== profile.confirm_password) {
        setSaveError("New password and confirmation do not match.");
        return false;
      }
    }

    setSaving(true);
    try {
      const payload = {
        first_name: profile.first_name,
        last_name: profile.last_name,
        phone: profile.phone,
        street_address: profile.street_address,
        current_password: profile.current_password,
      };

      if (profile.new_password) {
        payload.new_password = profile.new_password;
      }

      const response = await updateProfile(payload);

      setProfile((prev) => ({
        ...prev,
        ...response.user,
        current_password: "",
        new_password: "",
        confirm_password: "",
      }));
      setSuccess("Profile updated successfully.");
      toast.success("Your profile changes were saved successfully.");
      return true;
    } catch (err) {
      setSaveError(err.data?.message || err.message || "Failed to update profile.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setError("");
    setSuccess("");
    setPasswordModalError("");

    if (!profileHasChanges()) {
      setSuccess("No changes to save.");
      return;
    }

    if (!profile.current_password) {
      setShowCurrentPassword(false);
      setShowPasswordModal(true);
      return;
    }

    await performSave();
  };

  const openEmailChange = () => {
    setEmailChangeError("");
    setEmailVerifyError("");
    setEmailVerifyMessage("");
    setEmailChangeForm({ new_email: "", confirm_new_email: "", current_password: "" });
    setEmailChangeOpen(true);
  };

  const closeEmailChange = () => {
    if (emailChangeSaving) return;
    setEmailChangeOpen(false);
    setEmailChangeError("");
  };

  const handleEmailChangeSubmit = async (event) => {
    event.preventDefault();
    if (emailChangeSaving) return;
    setEmailChangeError("");

    const newEmail = emailChangeForm.new_email.trim().toLowerCase();
    const confirmedEmail = emailChangeForm.confirm_new_email.trim().toLowerCase();
    const currentEmail = String(profile?.email || user?.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setEmailChangeError("Enter a valid new email address.");
      return;
    }
    if (newEmail !== confirmedEmail) {
      setEmailChangeError("The new email address and confirmation do not match.");
      return;
    }
    if (newEmail === currentEmail) {
      setEmailChangeError("The new email address matches your current email.");
      return;
    }
    if (!emailChangeForm.current_password) {
      setEmailChangeError("Enter your current password to continue.");
      return;
    }

    setEmailChangeSaving(true);
    try {
      const response = await requestEmailChange({
        new_email: newEmail,
        current_password: emailChangeForm.current_password,
      });
      const nextPendingEmail = response.pending_email || newEmail;
      setPendingEmail(nextPendingEmail);
      setEmailVerificationCode("");
      setEmailVerifyError("");
      setEmailVerifyMessage(`A verification code was sent to ${nextPendingEmail}. Your current email stays active until verified.`);
      setEmailResendCooldown(60);
      setEmailChangeOpen(false);
      setEmailVerifyOpen(true);
      setEmailChangeForm({ new_email: "", confirm_new_email: "", current_password: "" });
    } catch (requestError) {
      setEmailChangeError(requestError.data?.message || requestError.message || "Unable to request an email change.");
    } finally {
      setEmailChangeSaving(false);
    }
  };

  const handleEmailCodeVerify = async (event) => {
    event.preventDefault();
    if (emailVerifyLoading) return;
    setEmailVerifyError("");
    if (!/^\d{6}$/.test(emailVerificationCode)) {
      setEmailVerifyError("Enter the six-digit verification code.");
      return;
    }

    setEmailVerifyLoading(true);
    try {
      const response = await verifyEmailChangeCode(emailVerificationCode);
      let updatedUser = null;
      try {
        updatedUser = await refreshUser();
      } catch (refreshError) {
        console.warn("Profile refresh after email verification failed", refreshError);
      }
      const verifiedEmail = updatedUser?.email || response.email || pendingEmail;
      setProfile((current) => ({ ...current, email: verifiedEmail }));
      setEmailVerifyOpen(false);
      setEmailVerificationCode("");
      setPendingEmail("");
      setEmailVerifyMessage("");
      setSuccess(response.message || "Your email address has been updated and verified successfully.");
    } catch (requestError) {
      setEmailVerifyError(requestError.data?.message || requestError.message || "Unable to verify the code.");
    } finally {
      setEmailVerifyLoading(false);
    }
  };

  const handleEmailCodeResend = async () => {
    if (emailResending || emailVerifyLoading || emailResendCooldown > 0) return;
    setEmailVerifyError("");
    setEmailResending(true);
    try {
      await resendEmailChangeCode();
      setEmailVerificationCode("");
      setEmailResendCooldown(60);
      setEmailVerifyMessage("A new verification code was sent.");
    } catch (requestError) {
      const retryAfter = Number(requestError.data?.retry_after_seconds) || 0;
      if (retryAfter > 0) setEmailResendCooldown(retryAfter);
      setEmailVerifyError(requestError.data?.message || requestError.message || "Unable to resend the verification code.");
    } finally {
      setEmailResending(false);
    }
  };

  const closeEmailVerification = () => {
    if (emailVerifyLoading || emailResending) return;
    setEmailVerifyOpen(false);
    setEmailVerificationCode("");
    setEmailVerifyError("");
    setEmailVerifyMessage("");
    setPendingEmail("");
  };

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-500">Loading {profileType.toLowerCase()} profile...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Toaster position="bottom-right" />
      <UsernameChangeFlow
        open={usernameChangeOpen}
        onClose={() => setUsernameChangeOpen(false)}
        currentUsername={profile?.username || user?.username || ""}
        email={profile?.email || user?.email || ""}
        darkMode={darkMode}
        onVerified={async (username, response) => {
          try { await refreshUser(); } catch (refreshError) { console.warn("Profile refresh after username verification failed", refreshError); }
          setProfile((current) => ({ ...current, username }));
          setSuccess(response.message || "Your username has been updated successfully.");
          toast.success("Your username has been updated successfully.");
        }}
      />
      <Sidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen((open) => !open)} />

      <div className="flex-1 min-h-0 flex flex-col">
        <Navbar />

        <main className="min-w-0 flex-1 min-h-0 overflow-y-auto px-4 !pb-[calc(10rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:!pb-[calc(10rem+env(safe-area-inset-bottom))] sm:pt-6 lg:!pb-24 xl:px-8">
          <AdminPageHeader
            title={`${profileType} Profile`}
            description={`Manage your ${profileType.toLowerCase()} account settings and security.`}
          />

          <div className="mx-auto mt-5 grid w-full max-w-[1440px] min-w-0 grid-cols-1 gap-4 sm:mt-6 sm:gap-6 xl:grid-cols-[minmax(250px,0.8fr)_minmax(0,1.8fr)]">
            <div className="hidden min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:rounded-3xl sm:p-7 xl:block">
              <div className="flex flex-col items-center">
                <ProfileAvatar
                  name={`${user?.first_name || ""} ${user?.last_name || ""}`}
                  avatarOnly
                  size="lg"
                  className="border-4 border-red-100"
                />

                <h2 className="mt-5 break-words text-center text-xl font-bold sm:text-2xl">
                  {user?.first_name} {user?.last_name}
                </h2>
                <p className="text-gray-500 capitalize">{profile.role}</p>

                <div className="mt-6 w-full space-y-4">
                  <div className="flex min-w-0 items-start gap-3 rounded-xl bg-gray-50 p-3.5 sm:items-center sm:gap-4 sm:rounded-2xl sm:p-4">
                    <Mail className="text-red-600" />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-500">Email</p>
                      <p className="break-all font-medium">{user?.email}</p>
                    </div>
                  </div>

                  <div className="flex min-w-0 items-start gap-3 rounded-xl bg-gray-50 p-3.5 sm:items-center sm:gap-4 sm:rounded-2xl sm:p-4">
                    <Phone className="text-red-600" />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-500">Phone</p>
                      <p className="font-medium">{user?.phone || "Not set"}</p>
                    </div>
                  </div>

                  <div className="flex min-w-0 items-start gap-3 rounded-xl bg-gray-50 p-3.5 sm:items-center sm:gap-4 sm:rounded-2xl sm:p-4">
                    <ShieldCheck className="text-red-600" />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-500">Role</p>
                      <p className="font-medium capitalize">{profile.role}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6 xl:p-8">
              <h2 className="mb-5 text-xl font-bold sm:mb-6 sm:text-2xl">Profile Settings</h2>

              {error && (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
                  {error}
                </div>
              )}

              {success && (
                <div role="status" aria-live="polite" className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-green-700">
                  {success}
                </div>
              )}

              {profileHasChanges() && (
                <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <span>Unsaved changes. Your saved profile is unchanged until you save.</span>
                  <button type="button" onClick={() => setShowDiscardConfirmation(true)} disabled={saving} className="font-bold underline underline-offset-2 disabled:opacity-60">
                    Discard changes
                  </button>
                </div>
              )}

              <div className="mt-5 sm:mt-7">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="grid w-full grid-cols-3 rounded-2xl border border-gray-200 bg-gray-100 p-1 sm:w-auto sm:rounded-3xl sm:p-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab("profile")}
                      className={`rounded-xl px-2 py-3 text-xs font-semibold transition sm:rounded-2xl sm:px-5 sm:text-sm ${
                        activeTab === "profile"
                          ? "bg-white text-red-600 shadow-sm"
                          : "text-gray-600 hover:text-red-600"
                      }`}
                    >
                      Profile
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("security")}
                      className={`rounded-xl px-2 py-3 text-xs font-semibold transition sm:rounded-2xl sm:px-5 sm:text-sm ${
                        activeTab === "security"
                          ? "bg-white text-red-600 shadow-sm"
                          : "text-gray-600 hover:text-red-600"
                      }`}
                    >
                      Security
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("activity")}
                      className={`rounded-xl px-2 py-3 text-xs font-semibold transition sm:rounded-2xl sm:px-5 sm:text-sm ${
                        activeTab === "activity"
                          ? "bg-white text-red-600 shadow-sm"
                          : "text-gray-600 hover:text-red-600"
                      }`}
                    >
                      Activity Log
                    </button>
                  </div>
                </div>

                <div className="mt-6">
                  {activeTab === "profile" ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <AdminProfileTextField label="First Name" icon={User} darkMode={darkMode} type="text" name="first_name" value={profile.first_name} onChange={handleChange} placeholder="First Name" />
                      <AdminProfileTextField label="Last Name" icon={User} darkMode={darkMode} type="text" name="last_name" value={profile.last_name} onChange={handleChange} placeholder="Last Name" />
                      <AdminProfileTextField
                        label="Email Address"
                        icon={Mail}
                        darkMode={darkMode}
                        type="email"
                        name="email"
                        value={profile.email}
                        disabled
                        action={(
                          <button
                            type="button"
                            onClick={openEmailChange}
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold ${darkMode ? "text-red-300 hover:text-red-200" : "text-red-700 hover:text-red-800"}`}
                          >
                            <Mail size={13} aria-hidden="true" /> Change email
                          </button>
                        )}
                      />
                      <div>
                        <AdminProfileTextField label="Username" icon={User} darkMode={darkMode} type="text" name="username" value={profile.username} disabled action={(
                          <button type="button" onClick={() => setUsernameChangeOpen(true)} className={`inline-flex items-center gap-1.5 text-xs font-semibold ${darkMode ? "text-red-300 hover:text-red-200" : "text-red-700 hover:text-red-800"}`}>
                            <Pencil size={13} aria-hidden="true" /> Change username
                          </button>
                        )} />
                      </div>
                      <AdminProfileTextField label="Phone Number" icon={Phone} darkMode={darkMode} type="tel" inputMode="tel" maxLength={13} name="phone" value={profile.phone} onChange={handleChange} placeholder="+639171234567 or 09171234567" />
                      <div className="md:col-span-2">
                        <AdminProfileTextField label="Address" icon={MapPin} darkMode={darkMode} type="text" name="street_address" value={profile.street_address} onChange={handleChange} placeholder="Business address" />
                      </div>
                    </div>
                  ) : activeTab === "security" ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="md:col-span-2">
                        <AdminProfileTextField label="Current Password" icon={LockKeyhole} darkMode={darkMode} type="password" name="current_password" value={profile.current_password} onChange={handleChange} placeholder="Enter current password" autoComplete="current-password" />
                      </div>
                      <div>
                        <AdminProfileTextField label="New Password" icon={LockKeyhole} darkMode={darkMode} type="password" name="new_password" minLength={8} maxLength={128} value={profile.new_password} onChange={handleChange} placeholder="Enter new password" autoComplete="new-password" />
                        <p className="mt-1 text-xs text-slate-500">{PASSWORD_POLICY_HINT}</p>
                      </div>
                      <AdminProfileTextField label="Confirm Password" icon={LockKeyhole} darkMode={darkMode} type="password" name="confirm_password" minLength={8} maxLength={128} value={profile.confirm_password} onChange={handleChange} placeholder="Confirm new password" autoComplete="new-password" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50 p-4">
                        <Activity className="text-red-600" size={20} />
                        <div>
                          <p className="font-semibold text-gray-800">Recent admin activity</p>
                          <p className="text-sm text-gray-600">
                            Successful admin actions from this device appear here.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="md:col-span-1">
                          <label
                            htmlFor="activity-search"
                            className="text-sm font-medium text-gray-600"
                          >
                            Search activity
                          </label>
                          <input
                            id="activity-search"
                            type="search"
                            value={activitySearch}
                            onChange={(event) => {
                              setActivitySearch(event.target.value);
                              setActivityPage(1);
                            }}
                            placeholder="Search activities..."
                            className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="activity-category-filter"
                            className="text-sm font-medium text-gray-600"
                          >
                            Filter by category
                          </label>
                          <select
                            id="activity-category-filter"
                            value={activityCategoryFilter}
                            onChange={(event) => {
                              setActivityCategoryFilter(event.target.value);
                              setActivityPage(1);
                            }}
                            className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                          >
                            <option value="all">All</option>
                            <option value="system">System</option>
                            <option value="security">Security</option>
                            <option value="project">Project</option>
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="activity-date-filter"
                            className="text-sm font-medium text-gray-600"
                          >
                            Filter by date
                          </label>
                          <div className="mt-2 flex items-center gap-2">
                          <input
                            id="activity-date-filter"
                            type="date"
                            value={activityDateFilter}
                            onChange={(event) => {
                              setActivityDateFilter(event.target.value);
                              setActivityPage(1);
                            }}
                            className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                          />
                          {activityDateFilter && (
                            <button
                              type="button"
                              onClick={() => {
                                setActivityDateFilter("");
                                setActivityPage(1);
                              }}
                              className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                            >
                              Clear
                            </button>
                          )}
                          </div>
                        </div>
                      </div>

                      {filteredActivityLog.length > 0 ? (
                        <div className="space-y-3">
                          {visibleActivity.map((activity) => {
                            const isLogin = activity.description === "Logged in";
                            const isLogout = activity.description === "Logged out";
                            const isSystemActivity = activity.page === "Products";
                            const activityStyles = isLogin
                              ? darkMode
                                ? { card: "border-l-emerald-400 bg-emerald-950/45 hover:border-emerald-700", icon: "text-emerald-300", title: "text-emerald-200", badge: "border-emerald-800 bg-emerald-950 text-emerald-200", label: "Security" }
                                : { card: "border-l-green-500 bg-green-50/60 hover:border-green-300", icon: "text-green-600", title: "text-green-800", badge: "border-red-200 bg-red-50 text-red-600", label: "Security" }
                              : isLogout
                                ? darkMode
                                  ? { card: "border-l-red-400 bg-red-950/45 hover:border-red-700", icon: "text-red-300", title: "text-red-200", badge: "border-red-800 bg-red-950 text-red-200", label: "Security" }
                                  : { card: "border-l-red-500 bg-red-50/60 hover:border-red-300", icon: "text-red-600", title: "text-red-800", badge: "border-red-200 bg-red-50 text-red-600", label: "Security" }
                                : isSystemActivity
                                  ? darkMode
                                    ? { card: "border-l-slate-500 bg-slate-800 hover:border-slate-500", icon: "text-slate-300", title: "text-slate-200", badge: "border-slate-600 bg-slate-700 text-slate-200", label: "System" }
                                    : { card: "border-l-gray-300 bg-gray-50 hover:border-gray-400", icon: "text-gray-500", title: "text-gray-700", badge: "border-gray-200 bg-gray-100 text-gray-500", label: "System" }
                                  : darkMode
                                    ? { card: "border-l-sky-400 bg-sky-950/40 hover:border-sky-700", icon: "text-sky-300", title: "text-sky-200", badge: "border-sky-800 bg-sky-950 text-sky-200", label: "Project" }
                                    : { card: "border-l-blue-500 bg-blue-50/60 hover:border-blue-300", icon: "text-gray-500", title: "text-blue-800", badge: "border-blue-200 bg-blue-50 text-blue-600", label: "Project" };

                            return (
                              <div
                                key={activity.id}
                                className={`group flex items-start gap-4 rounded-2xl border border-gray-200 border-l-4 p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${activityStyles.card}`}
                              >
                                {isLogin ? (
                                  <LogIn className={`mt-0.5 shrink-0 ${activityStyles.icon}`} size={18} />
                                ) : isLogout ? (
                                  <LogOut className={`mt-0.5 shrink-0 ${activityStyles.icon}`} size={18} />
                                ) : (
                                  <Clock3 className={`mt-0.5 shrink-0 ${activityStyles.icon}`} size={18} />
                                )}
                                <div>
                                  <p className={`font-medium ${activityStyles.title}`}>{activity.description}</p>
                                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                    <span className={`rounded-full border px-2.5 py-1 font-semibold uppercase tracking-wide ${activityStyles.badge}`}>
                                      {activityStyles.label}
                                    </span>
                                    <span className={darkMode ? "text-slate-400" : "text-gray-500"}>
                                      {formatDateTimeToMMMDDYYYY(activity.createdAt)}
                                    </span>
                                    <span className={`font-semibold uppercase tracking-wide ${darkMode ? "text-slate-500" : "text-gray-400"}`}>
                                      Page: {activity.page || "Admin"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-gray-500">
                          {activityDateFilter
                            ? "No activity recorded on this date."
                            : "No activity recorded yet."}
                        </div>
                      )}

                      {filteredActivityLog.length > 0 && !isMobile && (
                        <div className="flex items-center justify-end gap-4 pt-2">
                          <span className="text-sm text-gray-500">
                            Page {currentActivityPage} of {activityPageCount}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setActivityPage(currentActivityPage - 1)}
                              disabled={currentActivityPage === 1}
                              className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <ChevronLeft size={16} />
                              Previous
                            </button>
                            <button
                              type="button"
                              onClick={() => setActivityPage(currentActivityPage + 1)}
                              disabled={currentActivityPage === activityPageCount}
                              className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Next
                              <ChevronRight size={16} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {activeTab !== "activity" && (
                <div className={`mt-6 flex justify-end border-t px-4 py-3 sm:mt-8 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 ${darkMode ? "border-slate-700 bg-slate-900/95" : "border-slate-200 bg-white/95"}`}>
                  <button
                    onClick={handleSave}
                    disabled={saving || !profileHasChanges()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:rounded-2xl sm:px-6"
                  >
                    <Save size={18} />
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              )}

              {emailChangeOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4">
                  <form
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="admin-email-change-title"
                    onSubmit={handleEmailChangeSubmit}
                    className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl sm:p-6 ${darkMode ? "border-slate-700 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-900"}`}
                  >
                    <h3 id="admin-email-change-title" className="text-lg font-bold">Change email address</h3>
                    <p className={`mt-1 text-sm ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                      We’ll send a verification code to the new address. Your current email stays active until verification.
                    </p>
                    {emailChangeError && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{emailChangeError}</p>}
                    <div className="mt-5 space-y-4">
                      <label className="block text-sm font-medium">
                        New email address
                        <input
                          type="email"
                          autoComplete="email"
                          required
                          value={emailChangeForm.new_email}
                          onChange={(event) => setEmailChangeForm((current) => ({ ...current, new_email: event.target.value }))}
                          className={`mt-1.5 w-full rounded-xl border px-3 py-2.5 outline-none focus:ring-2 focus:ring-red-500 ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`}
                        />
                      </label>
                      <label className="block text-sm font-medium">
                        Confirm new email address
                        <input
                          type="email"
                          autoComplete="email"
                          required
                          value={emailChangeForm.confirm_new_email}
                          onChange={(event) => setEmailChangeForm((current) => ({ ...current, confirm_new_email: event.target.value }))}
                          className={`mt-1.5 w-full rounded-xl border px-3 py-2.5 outline-none focus:ring-2 focus:ring-red-500 ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`}
                        />
                      </label>
                      <label className="block text-sm font-medium">
                        Current password
                        <span className="relative mt-1.5 block">
                          <input
                            type={showEmailChangePassword ? "text" : "password"}
                            autoComplete="current-password"
                            required
                            value={emailChangeForm.current_password}
                            onChange={(event) => setEmailChangeForm((current) => ({ ...current, current_password: event.target.value }))}
                            className={`w-full rounded-xl border px-3 py-2.5 pr-11 outline-none focus:ring-2 focus:ring-red-500 ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`}
                          />
                          <button type="button" onClick={() => setShowEmailChangePassword((visible) => !visible)} aria-label={showEmailChangePassword ? "Hide current password" : "Show current password"} aria-pressed={showEmailChangePassword} className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 ${darkMode ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-800"}`}>
                            {showEmailChangePassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                          </button>
                        </span>
                      </label>
                    </div>
                    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={closeEmailChange}
                        disabled={emailChangeSaving}
                        className={`rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${darkMode ? "border-slate-600 text-slate-200 hover:bg-slate-700" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={emailChangeSaving}
                        aria-busy={emailChangeSaving}
                        className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-wait disabled:opacity-60"
                      >
                        {emailChangeSaving ? "Sending code..." : "Send verification code"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {emailVerifyOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4">
                  <form
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="admin-email-verify-title"
                    onSubmit={handleEmailCodeVerify}
                    className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl sm:p-6 ${darkMode ? "border-slate-700 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-900"}`}
                  >
                    <h3 id="admin-email-verify-title" className="text-lg font-bold">Verify new email</h3>
                    <p className={`mt-1 text-sm ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                      Enter the six-digit code sent to <strong>{pendingEmail}</strong>. Your current email remains active until verified.
                    </p>
                    {emailVerifyMessage && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{emailVerifyMessage}</p>}
                    {emailVerifyError && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{emailVerifyError}</p>}
                    <label htmlFor="admin-email-verification-code" className="mb-2 mt-5 block text-sm font-medium">Verification code</label>
                    <input
                      id="admin-email-verification-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      required
                      autoFocus
                      value={emailVerificationCode}
                      onChange={(event) => setEmailVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      className={`w-full rounded-xl border px-3 py-3 text-center text-lg font-bold tracking-[0.3em] outline-none focus:ring-2 focus:ring-red-500 ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`}
                    />
                    <button
                      type="button"
                      onClick={handleEmailCodeResend}
                      disabled={emailResending || emailVerifyLoading || emailResendCooldown > 0}
                      className={`mt-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${darkMode ? "text-red-300" : "text-red-700"}`}
                    >
                      {emailResending ? "Sending code..." : emailResendCooldown > 0 ? `Resend code in ${emailResendCooldown}s` : "Resend code"}
                    </button>
                    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={closeEmailVerification}
                        disabled={emailVerifyLoading || emailResending}
                        className={`rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${darkMode ? "border-slate-600 text-slate-200 hover:bg-slate-700" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={emailVerifyLoading || emailResending}
                        aria-busy={emailVerifyLoading}
                        className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-wait disabled:opacity-60"
                      >
                        {emailVerifyLoading ? "Verifying..." : "Verify email"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {showPasswordModal && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 py-6">
                  <form
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="admin-profile-confirm-title"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      setPasswordModalError("");
                      if (!profile.current_password) {
                        setPasswordModalError("Please enter your current password.");
                        return;
                      }
                      const saved = await performSave({ showErrorInModal: true });
                      if (saved) {
                        setShowPasswordModal(false);
                        setShowCurrentPassword(false);
                      }
                    }}
                    className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
                  >
                    <h3 id="admin-profile-confirm-title" className="mb-3 text-xl font-semibold">Confirm Profile Changes</h3>
                    <p className="text-gray-600 mb-4">
                      Enter your current password to confirm saving profile changes.
                    </p>
                    {passwordModalError && (
                      <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
                        {passwordModalError}
                      </div>
                    )}
                    <label htmlFor="admin-profile-current-password" className="mb-1.5 block text-sm font-medium text-gray-700">Current password</label>
                    <div className="relative mb-4">
                      <input
                        id="admin-profile-current-password"
                        type={showCurrentPassword ? "text" : "password"}
                        name="current_password"
                        value={profile.current_password}
                        onChange={handleChange}
                        placeholder="Current password"
                        autoComplete="current-password"
                        className="w-full rounded-2xl border px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword((visible) => !visible)}
                        aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                        aria-pressed={showCurrentPassword}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                      >
                        {showCurrentPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                      </button>
                    </div>
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setShowPasswordModal(false);
                          setShowCurrentPassword(false);
                          setPasswordModalError("");
                        }}
                        className="px-4 py-3 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        aria-busy={saving}
                        className="px-4 py-3 rounded-2xl bg-red-600 text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
                      >
                        {saving ? "Saving..." : "Confirm"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {showDiscardConfirmation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6" role="presentation">
                  <section role="alertdialog" aria-modal="true" aria-labelledby="discard-admin-profile-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
                    <h3 id="discard-admin-profile-title" className="text-lg font-bold">Discard unsaved changes?</h3>
                    <p className="mt-2 text-sm text-slate-600">Your saved profile is unchanged. The edits in this form will be cleared.</p>
                    <div className="mt-5 flex justify-end gap-2">
                      <button type="button" data-close-modal onClick={() => setShowDiscardConfirmation(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        Keep editing
                      </button>
                      <button type="button" onClick={discardProfileChanges} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">
                        Discard changes
                      </button>
                    </div>
                  </section>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default AdminProfile;
