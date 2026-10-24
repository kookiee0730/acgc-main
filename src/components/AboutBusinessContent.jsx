import {
  ArrowUpRight,
  CalendarClock,
  Check,
  ClipboardList,
  Clock3,
  Hammer,
  Mail,
  MapPin,
  Phone,
  Ruler,
  Users,
  Wrench,
} from "lucide-react";
import { useAdminContactPhone } from "@/hooks/useAdminContactPhone";

const stats = [
  { value: "14+", label: "Years of Experience", icon: Clock3 },
  { value: "500+", label: "Happy Clients", icon: Users },
  { value: "1,200+", label: "Projects Completed", icon: Check },
  { value: "7 Days", label: "Avg. Turnaround", icon: CalendarClock },
];

const services = [
  "Custom Glass Windows & Doors",
  "Aluminum Frames & Partitions",
  "Sliding Doors & Panels",
  "Site Inspection & Consultation",
  "Professional Installation",
];

const process = [
  { title: "Order Request", description: "Submit your custom order with dimensions.", icon: ClipboardList },
  { title: "Site Inspection", description: "Our team visits to take precise measurements.", icon: Ruler },
  { title: "Fabrication", description: "Your order is crafted in our workshop.", icon: Hammer },
  { title: "Installation", description: "Professional installation at your location.", icon: Wrench },
];

function AboutBusinessContent({ darkMode = false }) {
  const { phone, phoneHref, address, addressHref, email, emailHref } = useAdminContactPhone();
  const text = darkMode ? "text-slate-100" : "text-slate-900";
  const muted = darkMode ? "text-slate-400" : "text-slate-600";
  const accentText = darkMode ? "text-red-300" : "text-red-700";
  const card = darkMode
    ? "border-slate-700/80 bg-slate-900/70 shadow-black/10"
    : "border-slate-200/80 bg-white shadow-slate-900/[0.045]";
  const inset = darkMode ? "border-slate-700 bg-slate-800/70" : "border-slate-200 bg-slate-50/80";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 sm:space-y-10">
      <section className={`relative overflow-hidden rounded-3xl border p-5 shadow-sm sm:p-7 ${card}`}>
        <div className={`pointer-events-none absolute -right-16 -top-24 size-64 rounded-full blur-3xl ${darkMode ? "bg-red-950/30" : "bg-red-100/50"}`} />
        <div className="relative mb-6 flex flex-col gap-2 text-center sm:mb-7">
          <span className={`mx-auto text-[10px] font-extrabold uppercase tracking-[0.22em] ${accentText}`}>From request to finish</span>
          <h3 className={`text-2xl font-black tracking-tight sm:text-3xl ${text}`}>Our Process</h3>
          <p className={`mx-auto max-w-xl text-sm leading-6 ${muted}`}>A clear, careful process keeps your project moving at every step.</p>
        </div>
        <div className="relative grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <div className={`pointer-events-none absolute left-[12%] right-[12%] top-8 hidden border-t border-dashed lg:block ${darkMode ? "border-slate-600" : "border-red-200"}`} />
          {process.map(({ title, description, icon: Icon }, index) => (
            <article key={title} className={`relative rounded-2xl border p-3 text-center transition duration-300 hover:-translate-y-1 hover:shadow-md sm:p-5 ${darkMode ? "border-slate-700 bg-slate-800/75" : "border-slate-200 bg-white/90"}`}>
              <div className={`relative mx-auto flex size-12 items-center justify-center rounded-2xl bg-red-800 text-white shadow-lg shadow-red-900/15 ring-4 sm:size-14 ${darkMode ? "ring-slate-900" : "ring-white"}`}>
                <Icon size={21} aria-hidden="true" />
                <span className={`absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full border-2 text-[10px] font-black shadow-sm ${darkMode ? "border-slate-800 bg-slate-800 text-red-300" : "border-white bg-white text-red-800"}`}>{index + 1}</span>
              </div>
              <h4 className={`mt-3 text-xs font-extrabold sm:mt-4 sm:text-sm ${text}`}>{title}</h4>
              <p className={`mx-auto mt-1.5 max-w-[220px] text-[11px] leading-4 sm:mt-2 sm:text-xs sm:leading-5 ${muted}`}>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-label="ACGC at a glance" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map(({ value, label, icon: Icon }) => (
          <article key={label} className={`group relative overflow-hidden rounded-2xl border p-4 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg sm:rounded-3xl sm:p-5 ${card}`}>
            <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-800 via-red-600 to-orange-400 ${darkMode ? "opacity-80" : ""}`} />
            <div className="flex items-center justify-between gap-2">
              <p className={`text-2xl font-black tracking-tight sm:text-3xl ${accentText}`}>{value}</p>
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${accentText} ${darkMode ? "bg-red-950/70" : "bg-red-50"}`}>
                <Icon size={17} aria-hidden="true" />
              </span>
            </div>
            <p className={`mt-2 text-[11px] font-semibold leading-4 sm:text-xs ${muted}`}>{label}</p>
          </article>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr] lg:gap-5">
        <section className={`rounded-3xl border p-5 shadow-sm sm:p-7 ${card}`}>
          <div className={`flex items-center gap-3 border-b pb-4 ${darkMode ? "border-slate-700" : "border-slate-100"}`}>
            <span className={`flex size-11 items-center justify-center rounded-2xl ${accentText} ${darkMode ? "bg-red-950/70" : "bg-red-50"}`}><Wrench size={20} aria-hidden="true" /></span>
            <div>
              <h3 className={`text-lg font-extrabold ${text}`}>Our Services</h3>
              <p className={`mt-0.5 text-xs ${muted}`}>Solutions made to fit your space.</p>
            </div>
          </div>
          <ul className="mt-3 space-y-1.5">
            {services.map((service) => (
              <li key={service} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${darkMode ? "text-slate-300 hover:bg-slate-800/80" : "text-slate-700 hover:bg-red-50/70"}`}>
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-red-700 text-white shadow-sm"><Check size={13} strokeWidth={3} aria-hidden="true" /></span>
                <span className="leading-5">{service}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={`rounded-3xl border p-5 shadow-sm sm:p-7 ${card}`}>
          <div className={`flex items-center gap-3 border-b pb-4 ${darkMode ? "border-slate-700" : "border-slate-100"}`}>
            <span className={`flex size-11 items-center justify-center rounded-2xl ${accentText} ${darkMode ? "bg-red-950/70" : "bg-red-50"}`}><MapPin size={20} aria-hidden="true" /></span>
            <div>
              <h3 className={`text-lg font-extrabold ${text}`}>Contact Information</h3>
              <p className={`mt-0.5 text-xs ${muted}`}>We’re ready to help with your project.</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <a href={emailHref} className={`group flex items-start gap-3 rounded-2xl border p-3.5 transition hover:border-red-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${inset}`}>
              <span className={`mt-0.5 ${accentText}`}><Mail size={17} aria-hidden="true" /></span>
              <span className="min-w-0"><span className={`block text-[10px] font-extrabold uppercase tracking-[0.15em] ${muted}`}>Email</span><span className={`mt-1 block break-words text-sm font-bold ${text}`}>{email}</span></span>
              <ArrowUpRight size={15} className={`ml-auto mt-1 shrink-0 ${muted}`} aria-hidden="true" />
            </a>
            <a href={phoneHref} className={`group flex items-start gap-3 rounded-2xl border p-3.5 transition hover:border-red-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${inset}`}>
              <span className={`mt-0.5 ${accentText}`}><Phone size={17} aria-hidden="true" /></span>
              <span className="min-w-0"><span className={`block text-[10px] font-extrabold uppercase tracking-[0.15em] ${muted}`}>Phone</span><span className={`mt-1 block text-sm font-bold ${text}`}>{phone}</span></span>
              <ArrowUpRight size={15} className={`ml-auto mt-1 shrink-0 ${muted}`} aria-hidden="true" />
            </a>
            <a href={addressHref} target="_blank" rel="noreferrer" className={`group flex items-start gap-3 rounded-2xl border p-3.5 transition hover:border-red-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${inset}`}>
              <span className={`mt-0.5 ${accentText}`}><MapPin size={17} aria-hidden="true" /></span>
              <span className="min-w-0"><span className={`block text-[10px] font-extrabold uppercase tracking-[0.15em] ${muted}`}>Address</span><span className={`mt-1 block text-sm font-semibold leading-5 ${text}`}>{address}</span></span>
              <ArrowUpRight size={15} className={`ml-auto mt-1 shrink-0 ${muted}`} aria-hidden="true" />
            </a>
            <div className={`flex items-start gap-3 rounded-2xl border p-3.5 ${inset}`}>
              <span className={`mt-0.5 ${accentText}`}><Clock3 size={17} aria-hidden="true" /></span>
              <span><span className={`block text-[10px] font-extrabold uppercase tracking-[0.15em] ${muted}`}>Business Hours</span><span className={`mt-1 block text-sm font-semibold ${text}`}>Mon–Sat · 8:00 AM – 6:00 PM</span></span>
            </div>
          </div>
        </section>
      </div>

    </div>
  );
}

export default AboutBusinessContent;
