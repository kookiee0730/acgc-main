import { CalendarDays, Check, CircleX, Wrench } from "lucide-react";

const statusLabels = {
  pending_review: "Under review",
  quotation_pending_approval: "Quotation ready",
  customer_accepted: "Quotation accepted",
  admin_approved: "Warranty approved",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-PH", { dateStyle: "medium" });
};

function OrderRepairProgress({ repairRequests = [], darkMode = false }) {
  if (!repairRequests.length) return null;

  const panel = darkMode ? "border-slate-700 bg-slate-900/70 text-slate-100" : "border-slate-200 bg-white text-slate-900";
  const muted = darkMode ? "text-slate-400" : "text-slate-500";

  return (
    <section className={`mt-5 rounded-2xl border p-4 sm:p-5 ${panel}`} aria-labelledby="repair-progress-title">
      <div className={`mb-4 flex items-center gap-3 border-b pb-4 ${darkMode ? "border-slate-700" : "border-slate-100"}`}>
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${darkMode ? "bg-amber-500/10 text-amber-300" : "bg-amber-50 text-amber-700"}`}>
          <Wrench size={18} aria-hidden="true" />
        </span>
        <div>
          <p className={`text-[10px] font-extrabold uppercase tracking-[0.16em] ${darkMode ? "text-amber-300" : "text-amber-700"}`}>Repair service</p>
          <h4 id="repair-progress-title" className="text-base font-extrabold">Repair Request Progress</h4>
        </div>
      </div>

      <div className="space-y-3">
        {repairRequests.map((repair) => {
          const warranty = repair.workflowType === "warranty";
          const stages = [["submitted", "Submitted"], ["approved", "Approved"], ["scheduled", "Scheduled"], ["in_progress", "In progress"], ["completed", "Completed"]];
          const stageByStatus = {
            pending_review: 0,
            quotation_pending_approval: 1,
            customer_accepted: 1,
            admin_approved: 1,
            scheduled: 2,
            in_progress: 3,
            completed: 4,
          };
          const currentStage = stageByStatus[repair.status] ?? 0;
          const closed = ["cancelled", "rejected"].includes(repair.status);
          const completed = repair.status === "completed";
          const badgeClass = completed
            ? darkMode ? "border-emerald-800 bg-emerald-950/50 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-700"
            : closed
              ? darkMode ? "border-red-900 bg-red-950/50 text-red-300" : "border-red-200 bg-red-50 text-red-700"
              : darkMode ? "border-amber-800 bg-amber-950/40 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800";

          return (
            <article key={repair._id} className={`space-y-4 rounded-xl border p-3.5 sm:p-4 ${darkMode ? "border-slate-700 bg-slate-950/40" : "border-slate-200 bg-slate-50/70"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h5 className="break-words text-sm font-bold">{repair.productName || "Repair request"}</h5>
                  <p className={`mt-1 text-xs capitalize ${muted}`}>{warranty ? "Warranty repair" : "Paid repair"} · Requested {formatDate(repair.requestedAt)}</p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${badgeClass}`}>
                  {closed ? <CircleX size={13} aria-hidden="true" /> : completed ? <Check size={13} aria-hidden="true" /> : null}
                  {statusLabels[repair.status] || "In progress"}
                </span>
              </div>

              <dl className={`grid gap-3 rounded-lg border p-3 text-xs sm:grid-cols-2 ${darkMode ? "border-slate-700 bg-slate-900/60" : "border-slate-200 bg-white"}`}>
                <div className="min-w-0">
                  <dt className={`text-[10px] font-bold uppercase tracking-wide ${muted}`}>Repair ID</dt>
                  <dd className="mt-1 break-all font-mono font-semibold">{repair.repairTrackingId}</dd>
                </div>
                {repair.issueDescription && <div className="min-w-0">
                  <dt className={`text-[10px] font-bold uppercase tracking-wide ${muted}`}>Reported issue</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words leading-5">{repair.issueDescription}</dd>
                </div>}
                {warranty && <div className="min-w-0 sm:col-span-2">
                  <dt className={`text-[10px] font-bold uppercase tracking-wide ${muted}`}>Warranty coverage</dt>
                  <dd className="mt-1 font-semibold capitalize">{repair.warranty?.status || "Unknown"}{repair.warranty?.expiresAt ? ` · through ${formatDate(repair.warranty.expiresAt)}` : ""}</dd>
                </div>}
              </dl>

              {!closed && <ol className="grid grid-cols-5 gap-x-0 gap-y-3 max-[620px]:grid-cols-1" aria-label="Repair request progress">
                {stages.map(([status, title], index) => {
                  const done = completed || index < currentStage;
                  const current = !completed && currentStage === index;
                  const stepClass = done
                    ? "bg-emerald-600 text-white"
                    : current
                      ? "border-2 border-red-700 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/40 dark:text-red-300"
                      : darkMode ? "bg-slate-800 text-slate-400" : "bg-slate-200 text-slate-500";
                  const lineDone = completed || index < currentStage;
                  const connectorClass = lineDone ? "bg-emerald-600" : darkMode ? "bg-slate-700" : "bg-slate-200";
                  return <li key={status} className={`relative flex min-h-10 flex-col items-center gap-1.5 text-center text-[10px] leading-tight max-[620px]:min-h-6 max-[620px]:flex-row max-[620px]:gap-3 max-[620px]:text-left ${done ? "font-bold text-emerald-700 dark:text-emerald-300" : current ? "font-bold text-red-700 dark:text-red-300" : `font-normal ${muted}`}`}>
                    {index < stages.length - 1 && <span aria-hidden="true" className={`absolute left-1/2 top-3 z-0 h-0.5 w-full max-[620px]:left-3 max-[620px]:top-3 max-[620px]:h-[calc(100%+0.75rem)] max-[620px]:w-0.5 ${connectorClass}`} />}
                    <span className={`relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full ${stepClass}`}>{done ? <Check size={13} aria-hidden="true" /> : index + 1}</span>
                    <span className="relative z-10">{title}</span>
                  </li>;
                })}
              </ol>}

              {(repair.schedule?.startDate || repair.schedule?.date) && <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[11px] ${darkMode ? "border-slate-700 bg-slate-900/70" : "border-slate-200 bg-blue-50/70"}`}>
                <CalendarDays size={14} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                <p className={muted}>Service visit: <strong className="font-bold text-slate-800 dark:text-slate-100">{formatDate(repair.schedule.startDate || repair.schedule.date)}
                {(repair.schedule.finishDate || repair.schedule.startDate) && ` – ${formatDate(repair.schedule.finishDate || repair.schedule.startDate)}`}
              </strong></p></div>}
              <p className={`text-[10px] ${muted}`}>Last updated {formatDate(repair.updatedAt || repair.completedAt || repair.requestedAt)}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default OrderRepairProgress;
