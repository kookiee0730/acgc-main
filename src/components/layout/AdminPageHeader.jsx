import { useAdminTheme } from "../../contexts/AdminThemeContext";

function AdminPageHeader({ title, description, stats = [], className = "", statsClassName = "", compactStats = false, statsBelow = false, mobileCompact = false }) {
  const { darkMode } = useAdminTheme();

  return (
    <section className={`relative overflow-hidden rounded-[22px] bg-gradient-to-br ${mobileCompact ? "px-4 py-5 sm:px-8 sm:py-7" : "px-8 py-7"} shadow-[0_18px_45px_-24px_rgba(15,23,42,0.7)] ${darkMode ? "from-black via-slate-950 to-red-950 text-white" : "from-slate-100 via-white to-slate-200 text-slate-900"} ${className}`}>
      <div className={`pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full border ${darkMode ? "border-red-200/10" : "border-slate-900/10"}`} />
      <div className={`pointer-events-none absolute -right-8 -top-16 h-48 w-48 rounded-full border ${darkMode ? "border-red-200/10" : "border-slate-900/10"}`} />
      <div className={`relative flex flex-col gap-7 ${statsBelow ? "" : "2xl:flex-row 2xl:items-center 2xl:justify-between"}`}>
        <div className="max-w-3xl">
          <p className={`text-xs font-black uppercase tracking-[0.28em] ${darkMode ? "text-red-300" : "text-red-700"}`}>Administration</p>
          <h1 className={`mt-3 font-black tracking-tight ${mobileCompact ? "text-2xl sm:text-5xl" : "text-4xl sm:text-5xl"}`}>{title}</h1>
          {description && <p className={`mt-3 text-sm leading-6 sm:text-base ${darkMode ? "text-slate-300" : "text-slate-600"}`}>{description}</p>}
        </div>

        {stats.length > 0 && (
          <div className={`grid min-w-0 ${statsClassName || "grid-cols-3 gap-3"}`}>
            {stats.map((stat) => (
              <div key={stat.label} className={`min-w-0 rounded-2xl border text-center shadow-lg backdrop-blur-sm ${compactStats ? "px-2.5 py-3 sm:px-3" : "px-3 py-4 sm:px-5"} ${darkMode ? "border-slate-600/80 bg-slate-950/70" : "border-slate-300/80 bg-white/75"}`}>
                <p className={`${compactStats ? "whitespace-nowrap text-sm sm:text-lg" : "break-words text-base sm:text-xl"} font-black tabular-nums leading-tight ${darkMode ? (stat.color || "text-white") : "text-slate-900"}`}>{stat.value}</p>
                <p className={`mt-1 text-[10px] font-bold uppercase tracking-[0.16em] ${darkMode ? "text-slate-400" : "text-slate-600"}`}>{stat.label}</p>
                {stat.detail && <p className={`mt-1 text-[9px] font-semibold normal-case tracking-normal ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{stat.detail}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default AdminPageHeader;
