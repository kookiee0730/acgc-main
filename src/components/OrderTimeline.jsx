import { useEffect, useRef, useState } from "react";
import { buildBatchProductTimelineStages, buildOrderTimelineStages, getOrderTimelineStatusClass, getOrderTimelineLineClass } from "@/lib/orderTimeline";
import { respondToInstallationSchedule } from "@/api/orders";
import { Check, Clock, Play, X, Image, ChevronRight } from "lucide-react";
import { getProgressColor } from "@/lib/utils";
import toast from "react-hot-toast";

const isValidImageSource = (src) => {
  if (!src || typeof src !== "string") return false;
  if (src.startsWith("blob:")) {
    return typeof window !== "undefined" && src.startsWith(`blob:${window.location.origin}`);
  }
  return true;
};

const getValidImages = (images) => (Array.isArray(images) ? images.filter(isValidImageSource) : []);

export default function OrderTimeline({ order, onOrderChange, audience = "customer", onViewContract = null, darkMode = false }) {
  const [photoGallery, setPhotoGallery] = useState(null);
  const [, setDeadlineClock] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setDeadlineClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [scheduleActionLoading, setScheduleActionLoading] = useState(false);
  const [scheduleActionError, setScheduleActionError] = useState("");
  const [scheduleActionMessage, setScheduleActionMessage] = useState("");
  const [agreementModal, setAgreementModal] = useState(null);
  const [showAcceptConfirmationModal, setShowAcceptConfirmationModal] = useState(false);
  const [showRescheduleConfirmationModal, setShowRescheduleConfirmationModal] = useState(false);
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [rescheduleNotes, setRescheduleNotes] = useState("");
  const steps = buildOrderTimelineStages(order).filter(
    (step) => audience === "customer" || step.key !== "installation_agreement"
  );
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [selectedStepIndex, setSelectedStepIndex] = useState(0);
  const [selectedSubIndex, setSelectedSubIndex] = useState(null);
  const [groupStepSelection, setGroupStepSelection] = useState({});
  const stageRefs = useRef([]);

  const batchOrderGroups = Array.isArray(order?.items) && order.items.length > 1
    ? order.items.map((item, index) => {
        const productName = item?.name || item?.product_name || `Product ${index + 1}`;
        return {
          key: `batch-order-group-${index + 1}`,
          label: productName,
          steps: buildBatchProductTimelineStages(order, item, index),
        };
      })
    : [];
  const timelineGroups = batchOrderGroups.length > 0 ? batchOrderGroups : [{ key: "single-order-progress", label: "Order Progress", steps }];
  const timelineSteps = timelineGroups[0]?.steps || steps;
  const selectedTimelineGroup = timelineGroups[selectedGroupIndex] || timelineGroups[0] || { steps: [] };
  const selectedStepIndexForGroup = groupStepSelection[selectedTimelineGroup?.key] ?? 0;
  const selectedStep = selectedTimelineGroup.steps[selectedStepIndexForGroup] || selectedTimelineGroup.steps[0] || null;
  const scheduleStageKeys = ["installation_agreement", "installation_scheduled", "installation_scheduling"];
  const normalizedProgressStages = Array.isArray(order?.progress_stages)
    ? order.progress_stages.map((stage) => ({
        ...stage,
        normalizedKey: (stage.key || stage.name || "").toString().toLowerCase().replace(/\s+/g, "_"),
      }))
    : [];
  const scheduleStages = normalizedProgressStages.filter((stage) => scheduleStageKeys.includes(stage.normalizedKey));
  const currentScheduleStage = [...scheduleStages]
    .reverse()
    .find((stage) => ["accepted", "reschedule_requested"].includes(stage.customerResponse?.toString().toLowerCase())) ||
    scheduleStages.slice(-1)[0] ||
    null;
  const currentScheduleResponse = currentScheduleStage?.customerResponse?.toString().toLowerCase() || "pending";
  const scheduleResponseDate =
    currentScheduleResponse === "reschedule_requested"
      ? currentScheduleStage?.customerPreferredInstallationDate
      : currentScheduleStage?.proposedInstallationDate || currentScheduleStage?.customerPreferredInstallationDate || currentScheduleStage?.date || selectedStep?.date;
  const hasCustomerScheduledResponse = ["accepted", "reschedule_requested"].includes(currentScheduleResponse);
  const canRespondToSchedule =
    audience === "customer" &&
    typeof onOrderChange === "function" &&
    !hasCustomerScheduledResponse &&
    ["installation_agreement", "installation_scheduling", "installation_scheduled"].includes(selectedStep?.key);
  const isInstallationStage = [
    "installation_agreement",
    "installation_scheduling",
    "installation_scheduled",
    "installation",
  ].includes(selectedStep?.key);
  const canAcceptPreferredSchedule = audience === "admin" && currentScheduleResponse === "reschedule_requested";
  const selectedStepAcceptedPreferredSchedule =
    currentScheduleResponse === "accepted" &&
    (selectedStep?.customerPreferredInstallationDate || selectedStep?.customerPreferredInstallationTime || currentScheduleStage?.customerPreferredInstallationDate || currentScheduleStage?.customerPreferredInstallationTime);
  const activeProgressSteps = timelineGroups.flatMap((group) => group.steps);
  const completedCount = activeProgressSteps.filter((step) => step.status === "completed").length;
  const totalCount = activeProgressSteps.length;
  let progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const installationIncomplete = batchOrderGroups.length > 0
    ? batchOrderGroups.some((group) =>
        group.steps.find((step) => step.batchStageKey === "installation")?.status !== "completed"
      )
    : (() => {
        const installationStage = steps.find((step) => step.key === "installation");
        return installationStage && installationStage.status !== "completed";
      })();
  if (installationIncomplete) {
    progressPercent = Math.min(progressPercent, 90);
  }

  const getDotClass = (step, index) => {
    const isCompleted = step.status === "completed";
    const isActive = index === selectedStepIndex;
    if (isCompleted) return "border-emerald-600 bg-emerald-600 text-white";
    if (isActive) return "border-emerald-600 bg-white text-emerald-600";
    return "border-slate-300 bg-slate-100 text-slate-500";
  };

  const getConnectorClass = (step, nextStep) =>
    step.status === "completed" && nextStep?.status === "completed"
      ? "bg-emerald-600"
      : "bg-slate-200";

  const getSubStageLineClass = (sub) =>
    sub.status === "completed" ? "bg-emerald-600" : "bg-slate-300";

  const selectedStepPhotoCount = selectedStep
    ? getValidImages(selectedStep.images).length + (selectedStep.subStages?.reduce((sum, sub) => sum + getValidImages(sub.images).length, 0) || 0)
    : 0;

  const determineDefaultSelectedStepIndex = () => {
    const fallbackSteps = timelineGroups[0]?.steps || [];
    if (!fallbackSteps || fallbackSteps.length === 0) return 0;

    // Priority 1: Find the first incomplete (not completed) stage
    const firstIncompleteIndex = fallbackSteps.findIndex((step) => step.status !== "completed");
    if (firstIncompleteIndex !== -1) return firstIncompleteIndex;

    // Priority 2: If all stages are completed, show the last stage
    return fallbackSteps.length - 1;
  };

  useEffect(() => {
    const defaultIndex = determineDefaultSelectedStepIndex();
    setSelectedStepIndex(defaultIndex);
    setGroupStepSelection((prev) => ({
      ...prev,
      [selectedTimelineGroup?.key || "single-order-progress"]: defaultIndex,
    }));
  }, [order?._id, order?.status, order?.contract_status, order?.inspection_status, order?.inspection_date, order?.updatedAt, timelineGroups.length, selectedTimelineGroup?.key]);

  useEffect(() => {
    if (!selectedTimelineGroup?.steps?.length) return;
    const selectedIndex = groupStepSelection[selectedTimelineGroup.key] ?? 0;
    if (selectedIndex < 0 || selectedIndex >= selectedTimelineGroup.steps.length) return;
    const targetElement = stageRefs.current[selectedIndex];
    if (targetElement?.scrollIntoView) {
      window.requestAnimationFrame(() => {
        targetElement.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      });
    }
  }, [selectedGroupIndex, selectedTimelineGroup?.key, selectedTimelineGroup?.steps.length, groupStepSelection]);

  const handleStageSelect = (groupIndex, stepIndex) => {
    setSelectedGroupIndex(groupIndex);
    setGroupStepSelection((prev) => ({
      ...prev,
      [timelineGroups[groupIndex]?.key]: stepIndex,
    }));
    setSelectedSubIndex(null);
  };

  const handleSubSelect = (stepIndex, subIndex) => {
    setSelectedStepIndex(stepIndex);
    setSelectedSubIndex(subIndex);
  };

  const handleScheduleResponse = async (action, payload = {}) => {
    if (!order || (!order._id && !order.id)) return;
    setScheduleActionLoading(true);
    setScheduleActionError("");
    setScheduleActionMessage("");
    const hasCurrentScheduleResponse = ["accepted", "reschedule_requested"].includes(currentScheduleResponse);
    // Prevent duplicate customer responses to the current schedule
    if ((action === "accept" || action === "reschedule") && hasCurrentScheduleResponse) {
      setScheduleActionError("You have already responded to this installation schedule.");
      setScheduleActionLoading(false);
      return;
    }

    try {
      const response = await respondToInstallationSchedule(order._id || order.id, {
        action,
        ...payload,
      });
      if (response?.order) {
        const successText =
          action === "accept"
            ? "accepted"
            : action === "reschedule"
            ? "reschedule request submitted"
            : "updated";
        setScheduleActionMessage(`Schedule ${successText} successfully.`);
        if (typeof onOrderChange === "function") {
          onOrderChange(response.order);
        }
        setAgreementModal(null);
        setRescheduleReason("");
        setPreferredDate("");
        setPreferredTime("");
        setRescheduleNotes("");
      }
    } catch (error) {
      setScheduleActionError(error.data?.message || error.message || "Unable to respond to installation schedule.");
    } finally {
      setScheduleActionLoading(false);
    }
  };

  const handleAcceptPreferredSchedule = async () => {
    if (!order || (!order._id && !order.id)) return;
    setScheduleActionLoading(true);
    setScheduleActionError("");
    setScheduleActionMessage("");

    try {
      const response = await respondToInstallationSchedule(order._id || order.id, {
        action: "accept_preferred",
      });
      if (response?.order) {
        setScheduleActionMessage("Customer preferred schedule accepted successfully.");
        toast.success("Customer preferred schedule accepted successfully.");
        if (typeof onOrderChange === "function") {
          onOrderChange(response.order);
        }
      }
    } catch (error) {
      setScheduleActionError(error.data?.message || error.message || "Unable to accept preferred schedule.");
    } finally {
      setScheduleActionLoading(false);
    }
  };

  const openRescheduleModal = () => {
    const hasCurrentScheduleResponse = ["accepted", "reschedule_requested"].includes(currentScheduleResponse);
    if (hasCurrentScheduleResponse) {
      setScheduleActionError("You have already responded to this installation schedule.");
      return;
    }
    setAgreementModal("reschedule");
    setScheduleActionError("");
    setScheduleActionMessage("");
  };

  const handleAcceptInstallationClick = () => {
    setShowAcceptConfirmationModal(true);
    setScheduleActionError("");
    setScheduleActionMessage("");
  };

  const closeAcceptConfirmationModal = () => {
    setShowAcceptConfirmationModal(false);
  };

  const closeRescheduleConfirmationModal = () => {
    setShowRescheduleConfirmationModal(false);
  };

  const handleConfirmRescheduleSubmit = () => {
    setShowRescheduleConfirmationModal(false);
    handleScheduleResponse("reschedule", {
      reason: rescheduleReason,
      preferredInstallationDate: preferredDate,
      preferredInstallationTime: preferredTime,
      notes: rescheduleNotes,
    });
  };

  const closeAgreementModal = () => {
    setAgreementModal(null);
    setRescheduleReason("");
    setPreferredDate("");
    setPreferredTime("");
    setRescheduleNotes("");
    setScheduleActionError("");
  };

  // Minimum allowed preferred date: tomorrow (disallow today and past dates)
  const getTomorrowDateString = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const minPreferredDate = getTomorrowDateString();

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${mm}-${dd}-${yyyy}`;
    } catch (e) {
      return dateStr;
    }
  };

  const submitReschedule = () => {
    setScheduleActionError("");
    const hasCurrentScheduleResponse = ["accepted", "reschedule_requested"].includes(currentScheduleResponse);
    if (hasCurrentScheduleResponse) {
      setScheduleActionError("You have already responded to this installation schedule.");
      return;
    }
    if (!preferredDate) {
      setScheduleActionError("Please select a preferred date for rescheduling.");
      return;
    }
    if (preferredDate < minPreferredDate) {
      setScheduleActionError("Please choose a date at least one day in the future.");
      return;
    }

    setShowRescheduleConfirmationModal(true);
  };

  return (
    <>
      <div className={`order-timeline rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${darkMode ? "order-timeline-dark" : ""}`}>
        <div className="mb-5">
          <h5 className="text-base font-semibold text-slate-900">Order timeline</h5>
          <p className="mt-1 text-sm text-slate-500">Track each stage from approval through completion.</p>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Overall progress</p>
                <p className="mt-1 text-xs text-slate-500">{completedCount} of {totalCount} stages complete</p>
              </div>
              <div className="shrink-0 text-right">
                <span className="text-2xl font-bold leading-none text-slate-900">{progressPercent}%</span>
                <span className="mt-1 block text-xs font-medium text-slate-500">complete</span>
              </div>
            </div>
            <div className="mt-4">
              <div
                className="relative h-2 overflow-hidden rounded-full bg-slate-200"
                role="progressbar"
                aria-label="Order completion progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
              >
                {(() => {
                  const color = getProgressColor(progressPercent);
                  return (
                    <div
                      className={`h-full rounded-full ${color.bar} transition-all duration-500 ease-out`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  );
                })()}
              </div>
            </div>
          </div>

          {timelineGroups.length > 1 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {timelineGroups.map((group, groupIndex) => (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => {
                    setSelectedGroupIndex(groupIndex);
                    setSelectedSubIndex(null);
                  }}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                    selectedGroupIndex === groupIndex
                      ? "border-emerald-500 bg-emerald-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={`min-w-0 truncate text-sm font-semibold ${selectedGroupIndex === groupIndex ? "text-emerald-700" : "text-slate-700"}`}>
                      {group.label}
                    </span>
                    <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium ${selectedGroupIndex === groupIndex ? "border-emerald-200 bg-white text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                      {group.steps.length} stages
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-700">{selectedTimelineGroup.label}</p>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                {selectedTimelineGroup.steps.length} stages
              </span>
            </div>

            <div className="overflow-x-auto pb-2">
              <div className="min-w-[640px]">
                <div className="relative flex items-start gap-3 px-2">
                  {selectedTimelineGroup.steps.map((step, index) => {
                    const currentGroupIndex = selectedGroupIndex;
                    const currentStepIndex = groupStepSelection[selectedTimelineGroup.key] ?? 0;
                    return (
                      <div
                        key={`${selectedTimelineGroup.key}-${step.key}`}
                        ref={(el) => {
                          if (selectedTimelineGroup.key === timelineGroups[currentGroupIndex]?.key) {
                            stageRefs.current[index] = el;
                          }
                        }}
                        className={`relative flex min-w-[100px] flex-1 flex-col items-center text-center transition ${
                          currentStepIndex === index ? "z-10" : "z-0 opacity-70 hover:opacity-100"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleStageSelect(currentGroupIndex, index)}
                          className={`group relative z-10 flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${getDotClass(
                            step,
                            index
                          )}`}
                        >
                          {step.status === "completed" ? <Check size={18} aria-hidden="true" /> : index + 1}
                        </button>
                        <div className="mt-2 w-full px-1">
                          <p className="text-xs font-semibold text-slate-900">{step.label}</p>
                          <p className="mt-1 text-xs text-slate-500">{step.date || "Pending"}</p>
                        </div>
                        {index < selectedTimelineGroup.steps.length - 1 && (
                          <div
                            className={`absolute left-1/2 top-5 h-0.5 w-full translate-x-5 ${getConnectorClass(step, selectedTimelineGroup.steps[index + 1])}`}
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            {selectedStep ? (
              <>
                {selectedSubIndex !== null ? (
                  // Sub-stage details view
                  (() => {
                    const sub = selectedStep.subStages?.[selectedSubIndex] || null;
                    return (
                      <div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{sub?.name || "Sub-stage"}</p>
                            <p className="text-xs text-slate-400">Sub-stage details</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getOrderTimelineStatusClass(
                              sub?.status
                            )}`}>{sub?.status === "completed" ? "Done" : sub?.statusText || (sub?.status || "Pending")}</span>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Completed / Date</p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">{sub?.date || "Pending"}</p>
                          </div>
                          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Assigned</p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">{selectedStep.assignedTo || "TBD"}</p>
                          </div>
                        </div>

                        {sub?.notes && (
                          <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-sm font-semibold text-slate-900">Description</p>
                            <p className="mt-2 text-sm text-slate-600">{sub.notes}</p>
                          </div>
                        )}

                        <div className="mt-4">
                          <p className="text-sm font-medium text-gray-900">Proof Photos</p>
                          <p className="text-xs text-gray-400">{getValidImages(sub.images).length} photo{getValidImages(sub.images).length === 1 ? "" : "s"}</p>
                          {getValidImages(sub.images).length > 0 ? (
                            <div className="mt-3 grid grid-cols-3 gap-2">
                              {getValidImages(sub.images).map((src, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setPhotoGallery({ title: `${selectedStep.label} — ${sub.name}`, images: getValidImages(sub.images) })}
                                  className="aspect-square bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-center overflow-hidden hover:bg-gray-100 transition"
                                >
                                  <img src={src} alt={`Proof photo ${idx + 1}`} className="object-cover w-full h-full" />
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-3 text-xs text-gray-400">No proof photos uploaded yet.</p>
                          )}
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  // Parent stage details view (no sub-stage detail elements merged)
                  <>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{selectedStep.label}</p>
                        <p className="mt-1 text-sm text-slate-500">{selectedStep.description || selectedStep.statusText}</p>
                      </div>
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getOrderTimelineStatusClass(
                        selectedStep.status
                      )}`}>{selectedStep.statusText}</span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Stage Date</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{selectedStep.date || "Pending"}</p>
                      </div>
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Assigned</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{selectedStep.assignedTo || "TBD"}</p>
                      </div>
                    </div>

                    {selectedStep.notes && (
                      <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-semibold text-slate-900">Notes</p>
                        <p className="mt-2 text-sm text-slate-600">{selectedStep.notes}</p>
                        {/* If customer already responded, show a status message instead of buttons */}
                        {currentScheduleResponse === "accepted" ? (
                          <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm text-slate-800">
                            <p className="font-semibold text-emerald-700">
                              {audience === "admin" ? "✓ Customer accepted the installation schedule." : "✓ You accepted the installation schedule."}
                            </p>
                            <p className="mt-2 text-xs text-slate-600">Approved Installation Date:</p>
                            <p className="font-medium">{formatDisplayDate(scheduleResponseDate)}</p>
                            <p className="mt-2 text-xs text-slate-500">Waiting for installation to begin.</p>
                          </div>
                        ) : currentScheduleResponse === "reschedule_requested" ? (
                          <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm text-slate-800">
                            <p className="font-semibold text-amber-700">
                              {audience === "admin" ? "⏳ Customer requested a reschedule." : "⏳ Your reschedule request has been submitted."}
                            </p>
                            <p className="mt-2 text-xs text-slate-600">Requested Installation Date:</p>
                            <p className="font-medium">{formatDisplayDate(scheduleResponseDate)}</p>
                            <p className="mt-2 text-xs text-slate-500">
                              {audience === "admin" ? "Respond to the customer request or accept the preferred schedule." : "Waiting for administrator approval."}
                            </p>
                          </div>
                        ) : currentScheduleResponse === "pending" ? (
                          isInstallationStage && canRespondToSchedule && selectedStep?.status !== "completed" && (
                            <div className="mt-3 flex flex-wrap items-center gap-3">
                              <button
                                type="button"
                                disabled={scheduleActionLoading}
                                onClick={handleAcceptInstallationClick}
                                className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {scheduleActionLoading ? "Accepting..." : "Accept Installation"}
                              </button>
                              <button
                                type="button"
                                onClick={openRescheduleModal}
                                disabled={scheduleActionLoading}
                                className="rounded-2xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Request Reschedule
                              </button>
                            </div>
                          )
                        ) : (
                          // No customer response yet — show buttons to customer when allowed
                          isInstallationStage && canRespondToSchedule && selectedStep?.status !== "completed" && (
                            <div className="mt-3 flex flex-wrap items-center gap-3">
                              <button
                                type="button"
                                disabled={scheduleActionLoading}
                                onClick={handleAcceptInstallationClick}
                                className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {scheduleActionLoading ? "Accepting..." : "Accept Installation"}
                              </button>
                              <button
                                type="button"
                                onClick={openRescheduleModal}
                                disabled={scheduleActionLoading}
                                className="rounded-2xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Request Reschedule
                              </button>
                            </div>
                          )
                        )}
                        {canAcceptPreferredSchedule && (
                          <div className="mt-3">
                            <button
                              type="button"
                              disabled={scheduleActionLoading}
                              onClick={handleAcceptPreferredSchedule}
                              className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {scheduleActionLoading ? "Accepting..." : "Accept Preferred Schedule"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sub-stages list removed from parent stage details to keep parent and sub-stage details separate */}

                    {/* Stage proof photos */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">Stage Proof Photos</p>
                        <span className="text-xs bg-gray-50 border border-gray-100 rounded-full px-2 py-0.5 text-gray-400">
                          {getValidImages(selectedStep.images).length} photo{getValidImages(selectedStep.images).length === 1 ? "" : "s"}
                        </span>
                      </div>
                      {getValidImages(selectedStep.images).length > 0 ? (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {getValidImages(selectedStep.images).map((src, index) => (
                            <button
                              key={`${selectedStep.key}-photo-${index}`}
                              type="button"
                              onClick={() => setPhotoGallery({ title: selectedStep.label, images: getValidImages(selectedStep.images) })}
                              className="aspect-square bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-center overflow-hidden hover:bg-gray-100 transition"
                            >
                              <img src={src} alt={`Proof photo ${index + 1}`} className="object-cover w-full h-full" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-gray-400">No proof photos uploaded yet.</p>
                      )}
                    </div>
                  </>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500">No timeline details available for this order.</p>
            )}
          </div>
        </div>
      </div>

      {/* Photo Gallery Modal */}
      {photoGallery && (
        <div
          className="mobile-fullscreen-overlay fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setPhotoGallery(null)}
          role="presentation"
        >
          <div
            className="mobile-fullscreen-dialog bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="gallery-title"
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between">
              <h3 id="gallery-title" className="text-lg font-semibold text-slate-900">
                {photoGallery.title} - Photos
              </h3>
              <button
                onClick={() => setPhotoGallery(null)}
                className="p-2 text-gray-500 hover:text-gray-700"
                aria-label="Close photo gallery"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {photoGallery.images.map((src, idx) => (
                <div key={idx} className="rounded-lg overflow-hidden bg-slate-100">
                  <img
                    src={src}
                    alt={`${photoGallery.title} photo ${idx + 1}`}
                    className="w-full h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {agreementModal === "reschedule" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl p-6 shadow-xl" role="dialog" aria-modal="true">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Request Installation Reschedule</h3>
                <p className="text-sm text-slate-500">Tell us your preferred date and time for the installation.</p>
              </div>
              <button
                onClick={closeAgreementModal}
                className="text-slate-500 hover:text-slate-700"
                aria-label="Close reschedule form"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Reason for reschedule</label>
                <textarea
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900"
                  rows={3}
                  placeholder="Why do you need to change the installation date?"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">Preferred date</label>
                  <input
                    type="date"
                    value={preferredDate}
                    onChange={(e) => setPreferredDate(e.target.value)}
                    min={minPreferredDate}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Preferred time</label>
                  <input
                    type="time"
                    value={preferredTime}
                    onChange={(e) => setPreferredTime(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Additional notes (optional)</label>
                <textarea
                  value={rescheduleNotes}
                  onChange={(e) => setRescheduleNotes(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900"
                  rows={3}
                  placeholder="Add any details for the team."
                />
              </div>

              {scheduleActionError && <p className="text-sm text-red-600">{scheduleActionError}</p>}

              <div className="flex flex-wrap items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={closeAgreementModal}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={scheduleActionLoading}
                  onClick={submitReschedule}
                  className="rounded-2xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {scheduleActionLoading ? "Submitting..." : "Submit Reschedule Request"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAcceptConfirmationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-xl" role="dialog" aria-modal="true">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Confirm Installation Acceptance</h3>
                <p className="mt-2 text-sm text-slate-500">Do you want to accept the proposed installation schedule?</p>
              </div>
              <button
                onClick={closeAcceptConfirmationModal}
                className="text-slate-500 hover:text-slate-700"
                aria-label="Close accept confirmation"
              >
                <X size={20} />
              </button>
            </div>

            {scheduleActionError && <p className="mt-4 text-sm text-red-600">{scheduleActionError}</p>}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={scheduleActionLoading}
                onClick={() => {
                  handleScheduleResponse("accept");
                  closeAcceptConfirmationModal();
                }}
                className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {scheduleActionLoading ? "Accepting..." : "Confirm Accept"}
              </button>
              <button
                type="button"
                onClick={closeAcceptConfirmationModal}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showRescheduleConfirmationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-xl" role="dialog" aria-modal="true">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Confirm Reschedule Request</h3>
                <p className="mt-2 text-sm text-slate-500">Submit this request to change your installation schedule?</p>
              </div>
              <button
                onClick={closeRescheduleConfirmationModal}
                className="text-slate-500 hover:text-slate-700"
                aria-label="Close reschedule confirmation"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-6 space-y-3 text-sm text-slate-600">
              <div>
                <p className="font-semibold text-slate-900">Preferred date</p>
                <p>{preferredDate || "Not selected"}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Preferred time</p>
                <p>{preferredTime || "No time selected"}</p>
              </div>
              {rescheduleReason && (
                <div>
                  <p className="font-semibold text-slate-900">Reason</p>
                  <p>{rescheduleReason}</p>
                </div>
              )}
              {rescheduleNotes && (
                <div>
                  <p className="font-semibold text-slate-900">Additional notes</p>
                  <p>{rescheduleNotes}</p>
                </div>
              )}
            </div>

            {scheduleActionError && <p className="mt-4 text-sm text-red-600">{scheduleActionError}</p>}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={scheduleActionLoading}
                onClick={handleConfirmRescheduleSubmit}
                className="rounded-2xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {scheduleActionLoading ? "Submitting..." : "Confirm Request"}
              </button>
              <button
                type="button"
                onClick={closeRescheduleConfirmationModal}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
