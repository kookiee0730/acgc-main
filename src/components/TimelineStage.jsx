import React from "react";
import { Check, ClipboardList, CreditCard, FileText, Package, Scissors, Star, Truck, Wrench, Camera } from "lucide-react";
import { getTimelineStagePhotos, getTimelineStageStatus } from "./orderTimelineUtils";

const stageIcons = {
  order_submitted: ClipboardList,
  admin_review: ClipboardList,
  site_inspection: Camera,
  site_inspection_scheduled: Camera,
  contract_sent: FileText,
  contract_created: FileText,
  contract_accepted: CreditCard,
  cutting: Scissors,
  assembly: Wrench,
  fabrication: Package,
  project_in_progress: Package,
  installation: Truck,
  installation_scheduled: Truck,
  installation_completed: Truck,
  completed: Star,
  project_completed: Star,
};

const formatCompletedAt = (value) => {
  if (!value) return "Date not recorded";
  if (["completed", "pending", "in progress"].includes(String(value).trim().toLowerCase())) return "Date not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function TimelineStage({
  stage,
  isLast = false,
  isNextUp = false,
  isNotificationTarget = false,
  notificationStageKey,
  notificationItemIndex,
  darkMode = false,
  onPhotoOpen,
  itemIndex = 0,
  onUploadProgressPhoto,
}) {
  const status = getTimelineStageStatus(stage);
  const normalizedKey = String(stage?.key || "")
    .replace(/^batch_\d+_/, "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const StageIcon = stageIcons[normalizedKey] || ClipboardList;
  const photos = getTimelineStagePhotos(stage);
  const subStages = Array.isArray(stage?.subStages) ? stage.subStages : [];
  const isDelayed = String(stage?.status || "").toLowerCase() === "delayed";
  const labelClass = status === "done"
    ? darkMode ? "text-emerald-300" : "text-emerald-800"
    : status === "current"
      ? isDelayed
        ? darkMode ? "text-rose-300" : "text-rose-800"
        : darkMode ? "text-amber-200" : "text-amber-900"
      : isNextUp
        ? darkMode ? "text-sky-300" : "text-sky-800"
        : darkMode ? "text-slate-300" : "text-slate-700";
  const nodeClass = status === "done"
    ? "border-emerald-600 bg-emerald-600 text-white"
    : status === "current"
      ? isDelayed
        ? "border-rose-600 bg-rose-600 text-white"
        : "border-amber-500 bg-amber-500 text-white"
      : isNextUp
        ? "border-sky-500 bg-transparent text-sky-600"
        : darkMode
          ? "border-slate-600 bg-slate-900 text-slate-400"
          : "border-slate-300 bg-white text-slate-500";
  const connectorClass = status === "done"
    ? "bg-emerald-600"
    : darkMode ? "bg-slate-700" : "bg-slate-200";
  const note = stage?.note || stage?.notes || "";
  const completionNote = status === "done" ? String(stage?.completionNote || "").trim() : "";
  const statusText = status === "done"
    ? `Completed · ${formatCompletedAt(stage?.completedAt || stage?.date)}`
    : status === "current"
      ? `${String(stage?.status || "").toLowerCase() === "delayed" ? "Delayed" : "In progress"}${note ? ` · ${note}` : ""}`
      : isNextUp
        ? "Up next"
        : stage?.statusText === "Cancelled" ? "Cancelled" : "Pending";
  const statusTextClass = isDelayed
    ? darkMode ? "text-rose-300" : "text-rose-700"
    : darkMode ? "text-slate-400" : "text-slate-500";

  return (
    <li
      data-notification-stage-key={notificationStageKey}
      data-notification-stage-name={stage?.label || stage?.name}
      data-notification-item-index={notificationItemIndex}
      className={`relative grid grid-cols-[24px_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0 ${isNotificationTarget ? "notification-target-highlight" : ""}`}
    >
      {!isLast && (
        <span
          className={`absolute left-[11px] top-6 bottom-0 w-0.5 ${connectorClass}`}
          aria-hidden="true"
        />
      )}
      <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border ${nodeClass}`} aria-hidden="true">
        {status === "done"
          ? <Check size={13} strokeWidth={2.5} />
          : <StageIcon size={12} />}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className={`break-words text-sm font-semibold leading-5 ${labelClass}`}>{stage?.label || stage?.name || "Project stage"}</p>
        <p className={`mt-0.5 break-words text-xs leading-5 ${statusTextClass}`}>{statusText}</p>
        {completionNote && <p className={`mt-1 break-words text-xs leading-5 ${darkMode ? "text-slate-300" : "text-slate-600"}`}><span className="font-semibold">Completion note:</span> {completionNote}</p>}
                {status !== "done" && stage?.photoRequirement && (stage.photoRequirement === "required" || onUploadProgressPhoto) && (
                  <div className={`mt-2 rounded-lg border p-2.5 text-xs ${darkMode ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-200 bg-white text-slate-600"}`}>
                    {stage.photoRequirement === "required" && (
                      <p>A progress photo is required before this stage can be marked as completed.</p>
                    )}
                    {onUploadProgressPhoto && status !== "done" && (
                      <label className={`mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 font-medium ${darkMode ? "border-slate-600 text-slate-200 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
                        <Camera size={14} aria-hidden="true" />
                        Upload progress photo
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="sr-only"
                          aria-label={`Upload progress photo for ${stage?.label || stage?.name || "stage"}`}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) onUploadProgressPhoto(file, itemIndex, stage.batchStageKey || stage.key);
                            event.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}
        {isDelayed && (
          <dl className={`mt-1 grid gap-x-4 gap-y-0.5 text-[11px] leading-4 sm:grid-cols-2 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
            <div className="flex flex-wrap gap-x-1">
              <dt>Date reported</dt>
              <dd>{stage?.delayReportedAt || stage?.latestDelayEntry?.reportedAt || "Not recorded"}</dd>
            </div>
            <div className="flex flex-wrap gap-x-1">
              <dt>Expected resolution</dt>
              <dd>{stage?.delayExpectedResolution || stage?.latestDelayEntry?.expectedResolution || "Not set"}</dd>
            </div>
          </dl>
        )}
        {photos.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {photos.map((photo, index) => (
              <button
                key={`${stage?.key || stage?.label || "stage"}-photo-${index}`}
                type="button"
                onClick={() => onPhotoOpen?.({ photos, index, title: stage?.label || stage?.name || "Stage" })}
                className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 transition hover:ring-2 hover:ring-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                aria-label={`View ${stage?.label || stage?.name || "Stage"} photo ${index + 1}`}
              >
                <img
                  src={photo}
                  alt={`${stage?.label || stage?.name || "Stage"} photo ${index + 1}`}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
        {subStages.length > 0 && (
          <ul className={`mt-3 space-y-3 border-l-2 pl-3 ${darkMode ? "border-slate-700" : "border-slate-200"}`}>
            {subStages.map((subStage, index) => {
              const subStatus = getTimelineStageStatus(subStage);
              const isSubDelayed = String(subStage?.status || "").toLowerCase() === "delayed";
              const subName = subStage?.name || `Sub-stage ${index + 1}`;
              const subPhotos = getTimelineStagePhotos(subStage);
              const subNote = subStage?.note || subStage?.notes || "";
              const subCompletionNote = subStatus === "done" ? String(subStage?.completionNote || "").trim() : "";
              const subStatusText = subStatus === "done"
                ? `Completed · ${formatCompletedAt(subStage?.completedAt || subStage?.date)}`
                : subStatus === "current"
                  ? `${String(subStage?.status || "").toLowerCase() === "delayed" ? "Delayed" : "In progress"}${subNote ? ` · ${subNote}` : ""}`
                  : "Pending";
                  const subDateReported = subStage?.delayReportedAt || subStage?.latestDelayEntry?.reportedAt;
                  const subExpectedResolution = subStage?.delayExpectedResolution || subStage?.latestDelayEntry?.expectedResolution;
              const subNodeClass = subStatus === "done"
                ? "border-emerald-600 bg-emerald-600 text-white"
                : subStatus === "current"
                  ? isSubDelayed
                    ? "border-rose-600 bg-rose-600 text-white"
                    : "border-amber-500 bg-amber-500 text-white"
                  : darkMode
                    ? "border-slate-600 bg-slate-900 text-slate-400"
                    : "border-slate-300 bg-white text-slate-500";

              return (
                <li key={`${stage?.key || stage?.label || "stage"}-sub-${index}`} className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-2.5">
                  <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border ${subNodeClass}`} aria-hidden="true">
                    {subStatus === "done" ? <Check size={11} strokeWidth={2.5} /> : <StageIcon size={10} />}
                  </span>
                  <div className="min-w-0">
                    <p className={`break-words text-xs font-medium leading-5 ${darkMode ? "text-slate-200" : "text-slate-800"}`}>{subName}</p>
                    <p className={`break-words text-[11px] leading-4 ${isSubDelayed ? darkMode ? "text-rose-300" : "text-rose-700" : darkMode ? "text-slate-400" : "text-slate-500"}`}>{subStatusText}</p>
                    {subCompletionNote && <p className={`mt-1 break-words text-[11px] leading-4 ${darkMode ? "text-slate-300" : "text-slate-600"}`}><span className="font-semibold">Completion note:</span> {subCompletionNote}</p>}
                    {isSubDelayed && (
                      <dl className={`mt-1 grid gap-y-0.5 text-[10px] leading-4 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                        <div className="flex flex-wrap gap-x-1"><dt>Date reported</dt><dd>{subDateReported || "Not recorded"}</dd></div>
                        <div className="flex flex-wrap gap-x-1"><dt>Expected resolution</dt><dd>{subExpectedResolution || "Not set"}</dd></div>
                      </dl>
                    )}
                    {subPhotos.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {subPhotos.map((photo, photoIndex) => (
                          <button
                            key={`${stage?.key || "stage"}-sub-${index}-photo-${photoIndex}`}
                            type="button"
                            onClick={() => onPhotoOpen?.({ photos: subPhotos, index: photoIndex, title: subName })}
                            className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 transition hover:ring-2 hover:ring-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                            aria-label={`View ${subName} photo ${photoIndex + 1}`}
                          >
                            <img
                              src={photo}
                              alt={`${subName} photo ${photoIndex + 1}`}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                    {subStatus !== "done" && subStage?.photoRequirement && (subStage.photoRequirement === "required" || onUploadProgressPhoto) && (
                      <div className={`mt-2 rounded-lg border p-2.5 text-[11px] ${darkMode ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-200 bg-white text-slate-600"}`}>
                        {subStage.photoRequirement === "required" && (
                          <p>A progress photo is required before this sub-stage can be marked as completed.</p>
                        )}
                        {onUploadProgressPhoto && subStatus !== "done" && (
                          <label className={`mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 font-medium ${darkMode ? "border-slate-600 text-slate-200 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
                            <Camera size={13} aria-hidden="true" />
                            Upload photo
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/gif"
                              className="sr-only"
                              aria-label={`Upload progress photo for ${subName}`}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) onUploadProgressPhoto(file, itemIndex, stage.batchStageKey || stage.key, index);
                                event.target.value = "";
                              }}
                            />
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </li>
  );
}
