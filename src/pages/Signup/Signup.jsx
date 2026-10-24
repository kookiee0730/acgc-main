import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { preservePendingProductRedirect } from "@/lib/pendingProductAction";
import { getPasswordStrength, isPasswordPolicySatisfied, PASSWORD_POLICY_HINT, PASSWORD_POLICY_MESSAGE } from "@/lib/passwordStrength";
import { getPhilippinePhoneError, isValidPhilippinePhone, normalizePhoneInput } from "@/lib/phoneValidation";
import logo from "../../assets/images/ACGCLOGO1.png";
import {
  AtSign,
  Building2,
  Eye,
  EyeOff,
  Hash,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  UserRound,
  X,
} from "lucide-react";

const policySections = [
  {
    title: "Terms and Conditions",
    sections: [
      { title: "1. Acceptance of Terms", text: "By creating an account and using this platform, you agree to comply with these Terms and Conditions and all applicable laws and regulations." },
      { title: "2. Eligibility", text: "Users must be at least 18 years old or meet the minimum legal age required in their jurisdiction to register an account." },
      { title: "3. Account Registration", text: "You agree to provide accurate, complete, and up-to-date information during registration. Providing false information may result in account suspension or termination." },
      { title: "4. Account Responsibility", text: "You are responsible for maintaining the confidentiality of your login credentials and for all activities conducted under your account." },
      {
        title: "5. Acceptable Use",
        items: [
          "Use the platform for unlawful purposes",
          "Impersonate another person or entity",
          "Upload harmful, abusive, or malicious content",
          "Attempt unauthorized access to accounts or systems",
          "Interfere with platform operations or security",
        ],
      },
      { title: "6. Intellectual Property", text: "All content, logos, trademarks, and materials available on the platform are the property of the company or respective owners and are protected by applicable intellectual property laws." },
      { title: "7. Suspension or Termination", text: "The platform reserves the right to suspend or terminate accounts that violate these Terms and Conditions without prior notice." },
      { title: "8. Limitation of Liability", text: "The platform is provided \u201cas is\u201d without warranties of any kind. The company shall not be liable for any damages arising from the use or inability to use the platform." },
      { title: "9. Changes to Terms", text: "The company may update these Terms and Conditions at any time. Continued use of the platform after changes are posted constitutes acceptance of the revised terms." },
      { title: "10. Governing Law", text: "These Terms and Conditions shall be governed by the laws applicable in the jurisdiction where the company operates." },
    ],
  },
  {
    title: "Privacy Policy",
    sections: [
      {
        title: "1. Information Collection",
        text: "We may collect the following information when you create an account or use the platform:",
        items: ["Full name", "Email address", "Contact number", "Username and password", "Device and usage information"],
      },
      {
        title: "2. Use of Information",
        text: "Collected information may be used to:",
        items: ["Create and manage your account", "Provide platform services", "Improve user experience", "Send important notifications or updates", "Maintain security and prevent fraud"],
      },
      { title: "3. Data Protection", text: "We implement reasonable security measures to protect your personal information from unauthorized access, disclosure, or misuse." },
      {
        title: "4. Information Sharing",
        text: "Your personal information will not be sold or rented to third parties. Information may only be shared when:",
        items: ["Required by law", "Necessary to provide services", "Needed to protect platform security and users"],
      },
      { title: "5. Cookies and Tracking", text: "The platform may use cookies and similar technologies to improve functionality and analyze usage patterns." },
      { title: "6. User Rights", text: "Users may request access, correction, or deletion of their personal information subject to applicable laws and regulations." },
      { title: "7. Data Retention", text: "Personal information will only be retained for as long as necessary to fulfill the purposes stated in this Privacy Policy or as required by law." },
      { title: "8. Third-Party Services", text: "The platform may contain links or integrations with third-party services. We are not responsible for the privacy practices of third-party providers." },
      { title: "9. Changes to Privacy Policy", text: "We reserve the right to update this Privacy Policy at any time. Changes become effective upon posting on the platform." },
      { title: "10. Contact Information", text: "For questions or concerns regarding these Terms and Conditions or Privacy Policy, users may contact the platform administrator through official communication channels." },
    ],
  },
];

function Signup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { register, authError, setAuthError, adminExists, adminLoading } = useAuth();
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    username: "",
    street_address: "",
    city: "",
    province: "",
    zip_code: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [showPolicies, setShowPolicies] = useState(false);
  const passwordStrength = getPasswordStrength(formData.password);

  useEffect(() => {
    if (!adminLoading && adminExists === false) navigate("/", { replace: true });
  }, [adminExists, adminLoading, navigate]);

  useEffect(() => {
    if (!showPolicies) return undefined;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setShowPolicies(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [showPolicies]);

  const sanitizeFieldValue = (name, value) => {
    if (name === "phone") return normalizePhoneInput(value);

    if (["first_name", "last_name", "city", "province"].includes(name)) {
      return value.replace(/[^\p{L}\s'-]/gu, "");
    }

    if (name === "zip_code") {
      return value.replace(/\D/g, "");
    }

    return value;
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: sanitizeFieldValue(name, value),
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setAuthError("");

    if (submitting) return;

    if (!acceptedPolicies) {
      setError("Please accept the Terms and Conditions and Privacy Policy.");
      return;
    }

    if (formData.phone && !isValidPhilippinePhone(formData.phone)) {
      setError(getPhilippinePhoneError(formData.phone));
      return;
    }

    if (Object.values(formData).some((value) => !value)) {
      setError("Please complete all required fields.");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!isPasswordPolicySatisfied(formData.password)) {
      setError(PASSWORD_POLICY_MESSAGE);
      return;
    }

    try {
      setSubmitting(true);
      const response = await register({
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        username: formData.username,
        street_address: formData.street_address,
        city: formData.city,
        province: formData.province,
        zip_code: formData.zip_code,
        phone: formData.phone,
        password: formData.password,
      });
      preservePendingProductRedirect(location.state?.from);
      navigate("/login", {
        replace: true,
        state: {
          from: location.state?.from,
          message: response.message || `Verification email sent to ${formData.email}.`,
        },
      });
    } catch (err) {
      setError(err.data?.message || err.message || "Sign up failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full rounded-xl border border-gray-300 py-2 pr-4 outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-500/10";

  return (
    <div className="auth-light-canvas flex h-[100dvh] min-h-[100dvh] items-stretch justify-center overflow-hidden lg:items-center lg:px-4 lg:py-5">
      <div className="relative z-10 grid h-full w-full max-w-none grid-rows-[minmax(10rem,30dvh)_minmax(0,1fr)] overflow-hidden bg-white lg:h-[calc(100dvh-2rem)] lg:max-h-[calc(100dvh-2rem)] lg:max-w-6xl lg:grid-cols-5 lg:grid-rows-1 lg:rounded-[20px] lg:border lg:border-gray-800 lg:shadow-[0_24px_70px_rgba(2,6,23,0.6)]">
        <div className="relative flex min-h-0 flex-col items-center justify-center gap-2 overflow-hidden bg-gradient-to-br from-slate-950 via-[#111827] to-[#450a0a] p-4 text-white sm:gap-3 lg:col-span-2 lg:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(148,163,184,.08),transparent_42%,rgba(127,29,29,.28))]" />
          <div className="pointer-events-none absolute -right-28 -top-20 h-80 w-80 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -right-16 -top-8 h-56 w-56 rounded-full border border-white/10" />
          <div className="relative z-10 text-center">
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.28em] text-red-100 sm:text-xs lg:mb-6 lg:tracking-[0.3em]">Welcome To</p>
            <img src={logo} alt="ACGC" className="mx-auto mb-2 w-28 drop-shadow-[0_0_4px_rgba(255,255,255,0.7)] sm:mb-3 sm:w-36 lg:w-56" />
            <p className="mx-auto max-w-sm text-[11px] font-medium leading-4 text-red-50 sm:text-xs lg:text-sm lg:leading-6">Securely manage products, site inspections, and operations from one powerful dashboard.</p>
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden bg-white px-4 py-2 text-slate-900 sm:px-6 lg:col-span-3 lg:p-5">
          <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Create your ACGC account</h1>
            <p className="mt-1 text-xs leading-5 text-gray-500">Verify your email to activate your profile.</p>

            <form className="mt-3 flex min-h-0 flex-1 flex-col lg:mt-4" onSubmit={handleSubmit}>
              {error || authError ? <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error || authError}</div> : null}
              {success ? <div className="mb-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">{success}</div> : null}

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid gap-1.5 md:grid-cols-2">
                <Field icon={UserRound} label="First Name *" name="first_name" value={formData.first_name} onChange={handleChange} placeholder="Enter your first name" inputClass={inputClass} />
                <Field icon={UserRound} label="Last Name *" name="last_name" value={formData.last_name} onChange={handleChange} placeholder="Enter your last name" inputClass={inputClass} />
                <Field icon={Mail} label="Email *" type="email" name="email" value={formData.email} onChange={handleChange} placeholder="Enter your email" inputClass={inputClass} />
                <Field icon={AtSign} label="Username *" name="username" minLength={6} maxLength={12} pattern="[A-Za-z0-9._-]{6,12}" title="Use 6-12 letters, numbers, dots, underscores, or hyphens." value={formData.username} onChange={handleChange} placeholder="Choose a username" inputClass={inputClass} />
              </div>

              <div className="mt-1.5"><Field icon={MapPin} label="Address *" name="street_address" value={formData.street_address} onChange={handleChange} placeholder="Enter your street address" inputClass={inputClass} /></div>
              <div className="mt-1.5 grid gap-1.5 md:grid-cols-2">
                <Field icon={Building2} label="City *" name="city" value={formData.city} onChange={handleChange} placeholder="Enter your city" inputClass={inputClass} />
                <Field icon={MapPin} label="Province *" name="province" value={formData.province} onChange={handleChange} placeholder="Enter your province" inputClass={inputClass} />
                <Field icon={Hash} label="Zip Code *" name="zip_code" inputMode="numeric" value={formData.zip_code} onChange={handleChange} placeholder="4000" inputClass={inputClass} />
                <Field icon={Phone} label="Phone Number *" name="phone" type="tel" inputMode="tel" maxLength={13} value={formData.phone} onChange={handleChange} placeholder="+639171234567 or 09171234567" inputClass={inputClass} />
              </div>
              <div className="mt-1.5 grid gap-1.5 md:grid-cols-2">
                <div>
                  <Field
                    icon={LockKeyhole}
                    label="Password *"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    minLength={8}
                    maxLength={128}
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Enter your password"
                    inputClass={inputClass}
                    showPasswordToggle
                    passwordVisible={showPassword}
                    onToggleVisibility={() => setShowPassword((visible) => !visible)}
                  />
                  {formData.password ? (
                    <div className="mt-2" aria-live="polite">
                      <div
                        className="h-1.5 w-3/4 overflow-hidden rounded-full bg-slate-200"
                        role="progressbar"
                        aria-label="Password strength"
                        aria-valuemin="0"
                        aria-valuemax="4"
                        aria-valuenow={passwordStrength.score}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500 ease-out"
                          style={{
                            width: `${passwordStrength.score * 25}%`,
                            backgroundColor: passwordStrength.color,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-xs font-semibold" style={{ color: passwordStrength.color }}>
                        {passwordStrength.label} password
                      </p>
                    </div>
                  ) : null}
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">
                    {PASSWORD_POLICY_HINT}
                  </p>
                </div>
                <div>
                  <Field
                    icon={LockKeyhole}
                    label="Confirm Password *"
                    type={showConfirmPassword ? "text" : "password"}
                    name="confirmPassword"
                    minLength={8}
                    maxLength={128}
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Confirm your password"
                    inputClass={inputClass}
                    showPasswordToggle
                    passwordVisible={showConfirmPassword}
                    onToggleVisibility={() => setShowConfirmPassword((visible) => !visible)}
                    isValid={formData.confirmPassword.length > 0 && formData.password === formData.confirmPassword}
                  />
                  {formData.confirmPassword ? (
                    <p className={`mt-2 text-xs font-semibold ${formData.password === formData.confirmPassword ? "text-green-600" : "text-red-600"}`} role="status">
                      {formData.password === formData.confirmPassword ? "Passwords match" : "Passwords do not match"}
                    </p>
                  ) : null}
                </div>
              </div>

              </div>

              <div className="shrink-0 bg-white pt-2">
              <div className="mb-2 flex items-start gap-2 text-xs leading-5 text-slate-700 sm:text-sm">
                <input
                  id="accept-policies"
                  type="checkbox"
                  checked={acceptedPolicies}
                  onChange={(event) => setAcceptedPolicies(event.target.checked)}
                  aria-label="I accept the Terms and Conditions and Privacy Policy"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-red-700"
                />
                <p className="min-w-0 flex-1">
                  <label htmlFor="accept-policies">I accept the </label>
                  <button
                    type="button"
                    onClick={() => setShowPolicies(true)}
                    className="text-left font-semibold text-red-700 underline-offset-2 hover:text-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    Terms and Conditions and Privacy Policy
                  </button>
                </p>
              </div>
              <button type="submit" disabled={submitting || !acceptedPolicies} aria-busy={submitting} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-brand px-4 py-2 text-base font-bold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? <><LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> Sending verification email...</> : "Verify Email"}
              </button>
              <div className="mt-1.5 flex min-h-9 w-full flex-wrap items-center justify-center gap-1.5 rounded-xl border border-red-100 bg-red-50 px-3 py-1.5 text-xs text-slate-600 sm:text-sm">
                <span>Already have an account?</span>
                <Link to="/login" className="font-bold text-brand transition-opacity hover:opacity-80">Login</Link>
              </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      {showPolicies && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6"
          onClick={() => setShowPolicies(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="signup-policies-title"
            className="flex h-[85dvh] max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 sm:px-5">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-red-700">ACGC Services</p>
                <h2 id="signup-policies-title" className="mt-1 text-base font-bold text-slate-900">Terms and Conditions &amp; Privacy Policy</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowPolicies(false)}
                aria-label="Close Terms and Conditions and Privacy Policy"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <div className="overflow-y-auto overscroll-contain px-4 py-4 sm:px-5" tabIndex={0}>
              {policySections.map((policy) => (
                <section key={policy.title} className="mb-6 last:mb-0" aria-labelledby={`policy-${policy.title.replace(/\s+/g, "-").toLowerCase()}`}>
                  <h3 id={`policy-${policy.title.replace(/\s+/g, "-").toLowerCase()}`} className="mb-3 border-b border-slate-200 pb-2 text-lg font-bold text-slate-900">
                    {policy.title}
                  </h3>
                  <div className="space-y-3">
                    {policy.sections.map((section) => (
                      <section key={section.title}>
                        <h4 className="text-[13px] font-semibold text-slate-800">{section.title}</h4>
                        {section.text && <p className="mt-1 text-[13px] leading-5 text-slate-600">{section.text}</p>}
                        {section.items && (
                          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] leading-5 text-slate-600">
                            {section.items.map((item) => <li key={item}>{item}</li>)}
                          </ul>
                        )}
                      </section>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <footer className="flex shrink-0 flex-col-reverse justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:px-5">
              <button
                type="button"
                onClick={() => setShowPolicies(false)}
                className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setAcceptedPolicies(true);
                  setShowPolicies(false);
                }}
                className="min-h-10 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
              >
                Accept Terms
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function Field({ label, inputClass, icon: Icon, showPasswordToggle = false, passwordVisible = false, onToggleVisibility, isValid = false, ...props }) {
  return (
    <label className="block text-xs font-semibold text-slate-700">
      <span className="mb-1 block">{label}</span>
      <span className="relative block">
        <Icon
          size={18}
          strokeWidth={1.8}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input {...props} className={`${inputClass} ${isValid ? "border-green-500 focus:border-green-500 focus:ring-green-500/10" : ""} ${showPasswordToggle ? "pr-11" : ""} pl-11`} />
        {showPasswordToggle ? (
          <button
            type="button"
            onClick={onToggleVisibility}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-red-700"
            aria-label={passwordVisible ? "Hide password" : "Show password"}
          >
            {passwordVisible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        ) : null}
      </span>
    </label>
  );
}

export default Signup;
