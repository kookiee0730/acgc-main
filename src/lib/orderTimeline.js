import { formatDateTimeToMMDDYYYY, formatDateToMMDDYYYY } from "@/lib/dateUtils";

const stageDefinitions = [
  { key: "order_submitted", label: "Order Submitted", assignedTo: "Sales Team" },
  { key: "admin_review", label: "Admin Review", assignedTo: "Admin Team" },
  { key: "site_inspection_scheduled", label: "Site Inspection", assignedTo: "Inspection Team" },
  { key: "site_inspection_completed", label: "Site Inspection Completed", assignedTo: "Inspection Team" },
  { key: "contract_created", label: "Contract Created", assignedTo: "Contract Team" },
  { key: "contract_sent", label: "Contract Sent to Customer", assignedTo: "Contract Team" },
  { key: "contract_accepted", label: "Contract Accepted", assignedTo: "Customer" },
  { key: "contract_declined", label: "Contract Declined", assignedTo: "Customer" },
  { key: "project_in_progress", label: "Fabrication", assignedTo: "Production Team" },
  { key: "installation_scheduled", label: "Installation", assignedTo: "Installation Team" },
  { key: "installation_completed", label: "Installation", assignedTo: "Installation Team" },
  { key: "project_completed", label: "Completed", assignedTo: "Project Manager" },
];

const getOrderStageScore = (order) => {
  if (!order) return -1;
  if (order.status === "cancelled") return 0;
  if (order.status === "completed") return 10;
  if (order.status === "processing") return 7;
  if (order.status === "contract_accepted") return 6;
  if (order.status === "contract_sent") return 5;
  if (order.contract_status === "declined") return 6;
  if (order.status === "site_inspection") {
    return order.inspection_status === "completed" ? 3 : 2;
  }
  if (order.status === "admin_review") return 1;
  if (order.status === "order_submitted") return 0;
  return 0;
};

const isInspectionCompleted = (order) =>
  order?.inspection_status === "completed" || Boolean(order?.inspection_completed_at);

const getStageDate = (order, stageKey) => {
  switch (stageKey) {
    case "order_submitted":
      return order.createdAt || order.created_at || null;
    case "admin_review":
      return order.updatedAt || order.updated_at || null;
    case "site_inspection_scheduled":
      return order.inspection_date || null;
    case "site_inspection_completed":
      return isInspectionCompleted(order) ? order.inspection_completed_at || order.updatedAt || null : null;
    case "contract_created":
      return order.contractGenerated ? order.contractGeneratedAt || order.updatedAt || null : order.contract_terms ? order.updatedAt || null : null;
    case "contract_sent":
      return ["sent", "accepted", "declined"].includes(order.contract_status) || order.status === "contract_sent"
        ? order.contractSentAt || order.updatedAt || null
        : null;
    case "contract_accepted":
      return order.contract_status === "accepted" || order.status === "contract_accepted" ? order.acceptedAt || order.contract_signed_date || order.updatedAt || null : null;
    case "contract_declined":
      return order.contract_status === "declined" ? order.contractDeclinedAt || order.updatedAt || null : null;
    case "project_in_progress":
      return order.status === "processing" ? order.updatedAt || null : null;
    case "installation_scheduled":
      return order.inspection_date || null;
    case "installation_completed":
      return order.status === "completed" ? order.updatedAt || null : null;
    case "project_completed":
      return order.status === "completed" ? order.updatedAt || null : null;
    default:
      return null;
  }
};

const getStageNotes = (order, stageKey) => {
  if (!order) return null;
  if (stageKey === "site_inspection_scheduled" || stageKey === "site_inspection_completed") {
    return order.inspection_notes || null;
  }
  if (stageKey === "contract_created" || stageKey === "contract_sent" || stageKey === "contract_accepted") {
    return order.contract_terms || null;
  }
  if (stageKey === "contract_declined") return order.contractDeclineReason || "No reason provided.";
  if (stageKey === "project_in_progress") {
    return order.progress != null ? `Current completion: ${order.progress}%` : null;
  }
  return null;
};

const getStageStatus = (order, stepIndex, currentIndex, stageKey) => {
  if (!order) return "pending";
  if (order.status === "cancelled") {
    if (stepIndex === 0) return "completed";
    return stepIndex <= currentIndex ? "cancelled" : "pending";
  }

  const inspectionCompleted = isInspectionCompleted(order);
  const inspectionScheduled = order.inspection_status === "scheduled" || order.inspection_status === "completed";
  const hasContractTerms = Boolean(order.contract_terms);
  const contractSent = order.contract_status === "sent" || order.contract_status === "accepted" || order.contract_status === "declined" || order.status === "contract_sent";
  const contractAccepted = order.contract_status === "accepted" || order.status === "contract_accepted";
  const contractDeclined = order.contract_status === "declined";

  switch (stageKey) {
    case "order_submitted":
      return "completed";
    case "admin_review":
      return order.status === "order_submitted" ? "pending" : "completed";
    case "site_inspection_scheduled":
      return inspectionScheduled ? "completed" : order.status === "site_inspection" ? "in-progress" : "pending";
    case "site_inspection_completed":
      return inspectionCompleted ? "completed" : "pending";
    case "contract_created":
      return order.contractGenerated || hasContractTerms ? "completed" : "pending";
    case "contract_sent":
      return contractSent ? "completed" : "pending";
    case "contract_accepted":
      return contractAccepted ? "completed" : "pending";
    case "contract_declined":
      return contractDeclined ? "completed" : "pending";
    default:
      if (stepIndex < currentIndex) return "completed";
      if (stepIndex === currentIndex) return "in-progress";
      return "pending";
  }
};

const batchOrderMilestones = [
  { key: "order_submitted", label: "Order Submitted" },
  { key: "admin_review", label: "Admin Review" },
  { key: "site_inspection", label: "Site Inspection" },
  { key: "contract_sent", label: "Contract Sent" },
  { key: "contract_accepted", label: "Contract Accepted" },
];

const batchProductStages = [
  { key: "cutting", label: "Cutting" },
  { key: "assembly", label: "Assembly" },
  { key: "fabrication", label: "Fabrication" },
  { key: "installation", label: "Installation" },
];

const normalizeStageKey = (stage) =>
  (stage?.key || stage?.name || "").toString().toLowerCase().replace(/\s+/g, "_");

const normalizeStageStatus = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-");

const getDateInBusinessTimeZone = (value, timeZone = "Asia/Manila") => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${fields.year}-${fields.month}-${fields.day}`;
};

export const isInstallationDeadlineOverdue = (order, now = new Date()) => {
  const orderStatus = String(order?.status || "").toLowerCase();
  if (!order?.estimated_installation_date || ["completed", "cancelled"].includes(orderStatus)) return false;

  const progressSets = (Array.isArray(order.items) && order.items.length > 1
    ? order.items.map((item) => item?.progress_stages?.length ? item.progress_stages : order.progress_stages?.length ? order.progress_stages : [])
    : [order.progress_stages?.length ? order.progress_stages : order.items?.[0]?.progress_stages || []])
    .filter((stages) => stages.length > 0);
  const allStagesComplete = progressSets.length > 0 && progressSets.every((stages) => stages.every((stage) => {
    const completed = stage?.completed === true || ["done", "completed"].includes(normalizeStageStatus(stage?.status));
    const subStages = Array.isArray(stage?.subStages) ? stage.subStages : [];
    return completed && subStages.every((sub) => sub?.completed === true || ["done", "completed"].includes(normalizeStageStatus(sub?.status)));
  }));
  if (allStagesComplete) return false;

  const deadline = getDateInBusinessTimeZone(order.estimated_installation_date);
  const today = getDateInBusinessTimeZone(now);
  return Boolean(deadline && today && deadline <= today);
};

export const calculateStageProgressPercent = (steps = []) => {
  const visibleSteps = Array.isArray(steps) ? steps.filter(Boolean) : [];

  if (visibleSteps.length === 0) {
    return 0;
  }

  const activeIndex = visibleSteps.findLastIndex((step) => (
    Boolean(step?.active) || ["in-progress", "in_progress", "delayed", "active"].includes(normalizeStageStatus(step?.progressStatus ?? step?.status ?? ""))
  ));

  if (activeIndex >= 0) {
    return Math.round(((activeIndex + 1) / visibleSteps.length) * 100);
  }

  const completedIndex = visibleSteps.findLastIndex((step) => (
    Boolean(step?.done) || ["done", "completed"].includes(normalizeStageStatus(step?.progressStatus ?? step?.status ?? ""))
  ));

  if (completedIndex >= 0) {
    return Math.round(((completedIndex + 1) / visibleSteps.length) * 100);
  }

  return Math.round((1 / visibleSteps.length) * 100);
};

const progressStageDefinitions = [
  { key: "cutting", name: "cutting" },
  { key: "assembly", name: "assembly" },
  { key: "fabrication", name: "fabrication" },
  { key: "installation", name: "installation" },
];

const isProgressStageDone = (stage) => (
  stage?.completed === true || ["done", "completed"].includes(normalizeStageStatus(stage?.status))
);

const getCoreProgressStageKey = (stage) => {
  const identity = [stage?.key, stage?.name]
    .filter(Boolean)
    .join("_")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (identity.split("_").includes("processing")) return "fabrication";
  if (identity.includes("site_inspection")) return "installation";
  if (identity.includes("installation_scheduling")) return null;
  return progressStageDefinitions.find(({ key }) => identity.split("_").includes(key))?.key || null;
};

export const calculateProjectProgressFromStages = (stageRows = []) => {
  const sourceStages = Array.isArray(stageRows) ? stageRows.filter(Boolean) : [];
  const normalizedStages = [];
  const coreKeys = new Set();

  sourceStages.forEach((stage) => {
    const coreKey = getCoreProgressStageKey(stage);
    if (coreKey) {
      if (coreKeys.has(coreKey)) return;
      coreKeys.add(coreKey);
      normalizedStages.push({ ...stage, key: coreKey });
      return;
    }
    normalizedStages.push(stage);
  });

  progressStageDefinitions.forEach(({ key }) => {
    if (coreKeys.has(key)) return;
    coreKeys.add(key);
    normalizedStages.push({ key, completed: false, status: key === "cutting" ? "in_progress" : "pending", subStages: [] });
  });

  const totalProgress = normalizedStages.reduce((total, stage) => {
    if (isProgressStageDone(stage)) return total + 1;
    const subStages = Array.isArray(stage?.subStages) ? stage.subStages : [];
    if (subStages.length === 0) return total;
    return total + subStages.filter(isProgressStageDone).length / subStages.length;
  }, 0);

  let percentage = Math.round((totalProgress / normalizedStages.length) * 100);
  const installation = normalizedStages.find((stage) => getCoreProgressStageKey(stage) === "installation");
  if (installation && !isProgressStageDone(installation)) percentage = Math.min(percentage, 90);
  return percentage;
};

const getBatchMilestoneIndex = (order, hasProductionStarted) => {
  const status = String(order?.status || "").toLowerCase();
  const contractStatus = String(order?.contract_status || "").toLowerCase();

  if (status === "completed" || status === "approved" || status === "processing") return 5;
  if (contractStatus === "accepted" || status === "contract_accepted") return hasProductionStarted ? 5 : 4;
  if (status === "contract_sent" || ["sent", "declined"].includes(contractStatus)) return 3;
  if (status === "site_inspection" && order.inspection_status === "completed") return 3;
  if (status === "site_inspection") return 2;
  if (status === "admin_review") return 1;
  return 0;
};

export const buildBatchProductTimelineStages = (order, item, itemIndex = 0, { applyDeadlineDelay = true, now = new Date() } = {}) => {
  const status = String(order?.status || "").toLowerCase();
  const contractStatus = String(order?.contract_status || "").toLowerCase();
  const isCancelled = status === "cancelled";
  const isOverdue = applyDeadlineDelay && isInstallationDeadlineOverdue(order, now);
  const hasAcceptedContract = status === "contract_accepted" || contractStatus === "accepted";
  const hasItemStages = Array.isArray(item?.progress_stages) && item.progress_stages.length > 0;
  const savedStages = hasItemStages
    ? item.progress_stages
    : Array.isArray(order?.progress_stages)
    ? order.progress_stages
    : [];
  const stageMap = new Map(savedStages.map((stage) => [normalizeStageKey(stage), stage]));
  const hasProductionStarted = batchProductStages.some((definition) => {
    const stage = stageMap.get(definition.key);
    return stage && (stage.completed || !["", "pending"].includes(String(stage.status || "").toLowerCase()));
  });
  const milestoneIndex = getBatchMilestoneIndex(order, hasProductionStarted);

  const milestoneSteps = batchOrderMilestones.map((milestone, index) => {
    const milestoneStatus = isCancelled
      ? "cancelled"
      : index < milestoneIndex
      ? "completed"
      : index === milestoneIndex
      ? "in-progress"
      : "pending";
    const milestoneDates = {
      order_submitted: order?.createdAt || order?.created_at,
      admin_review: order?.updatedAt || order?.updated_at,
      site_inspection: order?.inspection_date,
      contract_sent: order?.contractSentAt || order?.updatedAt,
      contract_accepted: order?.acceptedAt || order?.contract_signed_date || order?.updatedAt,
    };

    return {
      key: `batch_${itemIndex + 1}_${milestone.key}`,
      label: milestone.label,
      status: milestoneStatus,
      statusText: milestoneStatus === "completed" ? "Completed" : milestoneStatus === "in-progress" ? "In Progress" : milestoneStatus === "cancelled" ? "Cancelled" : "Pending",
      date: milestoneStatus === "completed" ? formatDateTimeToMMDDYYYY(milestoneDates[milestone.key]) || "Completed" : milestoneStatus === "in-progress" ? "In progress" : "Pending",
      assignedTo: milestone.key === "contract_accepted" ? "Customer" : milestone.key === "site_inspection" ? "Inspection Team" : "Admin Team",
      notes: "Order milestone shared by all products in this batch.",
      subStages: [],
    };
  });

  const progressDefinitions = savedStages.length > 0
    ? savedStages.map((sourceStage, index) => ({
        key: normalizeStageKey(sourceStage) || `custom_stage_${index + 1}`,
        label: sourceStage.name || sourceStage.key || `Stage ${index + 1}`,
        sourceStage,
      }))
    : batchProductStages.map((definition) => ({ ...definition, sourceStage: stageMap.get(definition.key) }));

  const productionSteps = progressDefinitions.map((definition) => {
    const sourceStage = definition.sourceStage || stageMap.get(definition.key) ||
      (definition.key === "fabrication" ? stageMap.get("processing") : null);
    const sourceStatus = normalizeStageStatus(sourceStage?.status || "");
    const sourceSubStages = Array.isArray(sourceStage?.subStages) ? sourceStage.subStages : [];
    const subStagesCompleted = sourceSubStages.every((subStage) =>
      subStage.completed === true || ["done", "completed"].includes(normalizeStageStatus(subStage.status))
    );
    const completed = Boolean(sourceStage) &&
      (Boolean(sourceStage.completed) || ["done", "completed"].includes(sourceStatus)) &&
      subStagesCompleted;
    const stepStatus = isCancelled
      ? "cancelled"
      : completed
      ? "completed"
      : isOverdue
      ? "delayed"
      : sourceStatus === "delayed"
      ? "delayed"
      : ["in-progress", "in_progress", "active"].includes(sourceStatus)
      ? "in-progress"
      : "pending";
    const subStages = Array.isArray(sourceStage?.subStages)
      ? sourceStage.subStages.map((sub) => {
          const subCompleted = sub.completed || ["done", "completed"].includes(normalizeStageStatus(sub.status));
          return {
            name: sub.name || "",
            status: subCompleted
              ? "completed"
              : isOverdue
              ? "delayed"
              : normalizeStageStatus(sub.status) === "delayed"
              ? "delayed"
              : normalizeStageStatus(sub.status) === "in-progress"
              ? "in-progress"
              : "pending",
            date: formatDateTimeToMMDDYYYY(sub.date),
            completionNote: String(sub.completionNote || "").trim(),
            notes: subCompleted && String(sub.completionNote || "").trim()
              ? String(sub.completionNote).trim()
              : sub.description || null,
            images: Array.isArray(sub.images) ? sub.images : [],
          };
        })
      : [];
    const latestDelayEntry = Array.isArray(sourceStage?.delayHistory)
      ? sourceStage.delayHistory.at(-1)
      : null;

    return {
      key: `batch_${itemIndex + 1}_${definition.key}`,
      batchStageKey: definition.key,
      label: sourceStage?.name || definition.label,
      status: stepStatus,
      progressStatus: completed ? "completed" : sourceStatus === "delayed" ? "delayed" : ["in-progress", "in_progress", "active"].includes(sourceStatus) ? "in-progress" : "pending",
      statusText: stepStatus === "completed" ? "Completed" : stepStatus === "in-progress" ? "In Progress" : stepStatus === "delayed" ? "Delayed" : stepStatus === "cancelled" ? "Cancelled" : "Pending",
      deadlineDelayed: isOverdue && !completed,
      date: stepStatus === "completed" ? formatDateTimeToMMDDYYYY(sourceStage?.date || sourceStage?.installationCompletedAt) || "Completed" : stepStatus === "in-progress" ? "In progress" : "Pending",
      assignedTo: definition.key.includes("installation") ? "Installation Team" : "Production Team",
      completionNote: String(sourceStage?.completionNote || "").trim(),
      notes: completed && String(sourceStage?.completionNote || "").trim()
        ? String(sourceStage.completionNote).trim()
        : sourceStage?.delayReason || sourceStage?.delayNotes || `Current phase: ${definition.label}`,
      ...(sourceStage ? { photoRequirement: sourceStage.photoRequirement === "required" ? "required" : "optional" } : {}),
      delayReason: latestDelayEntry?.reason || sourceStage?.delayReason || (isOverdue && !completed ? "The estimated installation date has passed." : ""),
      delayNotes: latestDelayEntry?.notes || sourceStage?.delayNotes || "",
      delayReportedAt: formatDateTimeToMMDDYYYY(latestDelayEntry?.reportedAt || sourceStage?.delayReportedAt) || "Not recorded",
      delayExpectedResolution: formatDateToMMDDYYYY(latestDelayEntry?.expectedResolution || sourceStage?.delayExpectedResolution) || "Not set",
      images: Array.isArray(sourceStage?.images) ? sourceStage.images : [],
      subStages,
    };
  });

  const productionComplete = productionSteps.every((step) => step.status === "completed");

  const normalizedProductionSteps = hasAcceptedContract && savedStages.length === 0 && !isOverdue
    ? productionSteps.map((step, index) => index === 0 ? { ...step, status: "in-progress", statusText: "In Progress" } : step)
    : productionSteps;

  const visibleSteps = hasAcceptedContract
    ? [...normalizedProductionSteps, {
        key: `batch_${itemIndex + 1}_completed`,
        label: "Completed",
        status: isCancelled ? "cancelled" : productionComplete ? "completed" : "pending",
        statusText: isCancelled ? "Cancelled" : productionComplete ? "Completed" : "Pending",
        date: isCancelled ? "Cancelled" : productionComplete ? "Completed" : "Pending",
        assignedTo: "Project Manager",
        notes: "All production stages for this product must be completed.",
        subStages: [],
      }]
    : milestoneSteps;

  return visibleSteps;
};

export const buildOrderTimelineStages = (order) => {
  if (!order) return [];
  const deadlineOverdue = isInstallationDeadlineOverdue(order);

  const currentIndex = getOrderStageScore(order);
  const contractOutcomeStage = order.contract_status === "declined"
    ? stageDefinitions.find((stage) => stage.key === "contract_declined")
    : stageDefinitions.find((stage) => stage.key === "contract_accepted");
  const baseStages = [...stageDefinitions.slice(0, 6), contractOutcomeStage].map((stage, index) => {
    const status = getStageStatus(order, index, currentIndex, stage.key);
    return {
      ...stage,
      status,
      statusText:
        status === "completed"
          ? "Completed"
          : status === "in-progress"
          ? "In Progress"
          : status === "cancelled"
          ? "Cancelled"
          : "Pending",
      date: formatDateTimeToMMDDYYYY(getStageDate(order, stage.key)),
      assignedTo: stage.assignedTo,
      notes: getStageNotes(order, stage.key),
    };
  });

  const progressStageKeys = [
    { key: "cutting", label: "Cutting" },
    { key: "assembly", label: "Assembly" },
    { key: "fabrication", label: "Fabrication" },
    { key: "installation_scheduling", label: "Installation" },
    { key: "installation_agreement", label: "Installation" },
    { key: "installation", label: "Installation" },
  ];

  const sourceProgressStages = Array.isArray(order.progress_stages) && order.progress_stages.length > 0
    ? order.progress_stages
    : Array.isArray(order.items)
    ? order.items.find((item) => Array.isArray(item?.progress_stages) && item.progress_stages.length > 0)?.progress_stages || []
    : [];

  const stageMap = sourceProgressStages.reduce((map, stage) => {
    const key = stage.key || (stage.name || "").toLowerCase().replace(/\s+/g, "_");
    map[key] = stage;
    return map;
  }, {});

  const progressStages = progressStageKeys
    .map((definition) => {
      const isAgreementStage = definition.key === "installation_agreement";
      const scheduleStageCandidates = ["installation_scheduling", "installation_scheduled"].map((key) => stageMap[key]).filter(Boolean);
      const sourceStage = isAgreementStage
        ? scheduleStageCandidates.find((stage) => ["accepted", "reschedule_requested"].includes(stage.customerResponse)) || scheduleStageCandidates[scheduleStageCandidates.length - 1] || {}
        : stageMap[definition.key] || {};

      const normalizedSourceStatus = normalizeStageStatus(sourceStage?.status || "");
      const subStagesComplete = !Array.isArray(sourceStage.subStages) || sourceStage.subStages.every((subStage) =>
        subStage.completed === true || ["done", "completed"].includes(normalizeStageStatus(subStage.status))
      );
      const completed = isAgreementStage
        ? sourceStage.customerResponse === "accepted" || sourceStage.customerResponse === "reschedule_requested"
        : (!!sourceStage.completed || ["done", "completed"].includes(normalizedSourceStatus)) && subStagesComplete;
      const delayed = !completed && (deadlineOverdue || normalizedSourceStatus === "delayed");
      const inProgress = !completed && ["in-progress", "in_progress", "active"].includes(normalizedSourceStatus);
      const status = completed ? "completed" : delayed ? "delayed" : inProgress ? "in-progress" : "pending";
      const subStages = Array.isArray(sourceStage.subStages)
        ? sourceStage.subStages.map((sub) => ({
            name: sub.name || "",
            status: sub.completed || ["done", "completed"].includes(normalizeStageStatus(sub.status))
              ? "completed"
              : deadlineOverdue
              ? "delayed"
              : normalizeStageStatus(sub.status) === "delayed"
              ? "delayed"
              : ["in-progress", "in_progress", "active"].includes(normalizeStageStatus(sub.status))
              ? "in-progress"
              : "pending",
            date: formatDateTimeToMMDDYYYY(sub.date),
            completionNote: String(sub.completionNote || "").trim(),
            notes: (sub.completed || ["done", "completed"].includes(normalizeStageStatus(sub.status))) && String(sub.completionNote || "").trim()
              ? String(sub.completionNote).trim()
              : sub.description || null,
            images: Array.isArray(sub.images) ? sub.images : [],
            photoRequirement: sub.photoRequirement === "required" ? "required" : "optional",
          }))
        : [];

      const visibleSubStages = subStages;

      if (isAgreementStage) {
        const hasProposal = sourceStage.proposedInstallationDate && sourceStage.proposedInstallationTime;
        if (!hasProposal) return null;
      }

      const latestDelayEntry = Array.isArray(sourceStage.delayHistory) && sourceStage.delayHistory.length > 0
        ? sourceStage.delayHistory[sourceStage.delayHistory.length - 1]
        : null;

      const activeSubStage = visibleSubStages.find((sub) => sub.status !== "completed");
      const latestCompletedSubStage = [...visibleSubStages].reverse().find((sub) => sub.status === "completed");
      const subStageNotes = activeSubStage?.notes || latestCompletedSubStage?.notes || null;

      const defaultNotes =
        visibleSubStages.length > 0
          ? subStageNotes ?? "No notes available."
          : `Current phase: ${definition.label}`;

      const schedulingNotes =
        definition.key === "installation_scheduling"
          ? sourceStage.proposedInstallationDate && sourceStage.proposedInstallationTime
            ? sourceStage.customerResponse === "accepted"
              ? sourceStage.customerPreferredInstallationDate || sourceStage.customerPreferredInstallationTime
                ? `Customer preferred installation schedule accepted for ${formatDateToMMDDYYYY(sourceStage.proposedInstallationDate)} at ${sourceStage.proposedInstallationTime}`
                : `Installation schedule confirmed for ${formatDateToMMDDYYYY(sourceStage.proposedInstallationDate)} at ${sourceStage.proposedInstallationTime}`
              : sourceStage.customerResponse === "reschedule_requested"
              ? `Customer requested a reschedule from ${formatDateToMMDDYYYY(sourceStage.proposedInstallationDate)} at ${sourceStage.proposedInstallationTime}`
              : sourceStage.customerResponse === "declined"
              ? "Customer declined the proposed schedule. Awaiting a new installation proposal."
              : `Waiting for customer confirmation - proposed ${formatDateToMMDDYYYY(sourceStage.proposedInstallationDate)} at ${sourceStage.proposedInstallationTime}`
            : "Waiting for customer confirmation"
          : null;

      const agreementStatusText = sourceStage.customerResponse === "accepted"
        ? "Accepted"
        : sourceStage.customerResponse === "reschedule_requested"
        ? "Reschedule Requested"
        : sourceStage.customerResponse
        ? "Waiting for Customer Response"
        : "Pending";

      const statusText = deadlineOverdue && !completed
        ? "Delayed"
        : definition.key === "installation_scheduling"
          ? completed
            ? "Completed"
            : sourceStage.customerResponse === "accepted"
            ? "Completed"
            : sourceStage.customerResponse === "reschedule_requested"
            ? "Reschedule Requested"
            : sourceStage.proposedInstallationDate && sourceStage.proposedInstallationTime
            ? "Waiting for Customer Response"
            : "Pending"
          : definition.key === "installation_agreement"
          ? agreementStatusText
          : completed
          ? "Completed"
          : delayed
          ? "Delayed"
          : inProgress
          ? "In Progress"
          : "Pending";

      return {
        key: definition.key,
        label: isAgreementStage ? "Installation Agreement" : sourceStage.name || definition.label,
        status,
        statusText,
        deadlineDelayed: deadlineOverdue && !completed,
        date: isAgreementStage
          ? sourceStage.customerResponseAt ? formatDateTimeToMMDDYYYY(sourceStage.customerResponseAt) : null
          : formatDateTimeToMMDDYYYY(sourceStage.date || (definition.key === "installation" ? sourceStage.installationCompletedAt : null)),
        assignedTo: "Production Team",
        notes: isAgreementStage
          ? sourceStage.customerResponse === "reschedule_requested"
            ? `Customer requested a new installation time: ${sourceStage.customerPreferredInstallationDate ? formatDateToMMDDYYYY(sourceStage.customerPreferredInstallationDate) : "TBD"} at ${sourceStage.customerPreferredInstallationTime || "TBD"}. ${sourceStage.customerRescheduleNotes || ""}`
            : sourceStage.customerResponse === "accepted"
            ? sourceStage.customerPreferredInstallationDate || sourceStage.customerPreferredInstallationTime
              ? `Your preferred installation schedule was approved for ${sourceStage.proposedInstallationDate ? formatDateToMMDDYYYY(sourceStage.proposedInstallationDate) : "TBD"} at ${sourceStage.proposedInstallationTime || "TBD"}.`
              : `Installation agreement accepted for ${sourceStage.proposedInstallationDate ? formatDateToMMDDYYYY(sourceStage.proposedInstallationDate) : "TBD"} at ${sourceStage.proposedInstallationTime || "TBD"}.`
            : sourceStage.proposedInstallationDate && sourceStage.proposedInstallationTime
            ? `Please agree or request a change for the proposed installation on ${formatDateToMMDDYYYY(sourceStage.proposedInstallationDate)} at ${sourceStage.proposedInstallationTime}.`
            : "Awaiting installation agreement."
          : completed && String(sourceStage.completionNote || "").trim()
            ? String(sourceStage.completionNote).trim()
            : schedulingNotes || defaultNotes,
        completionNote: String(sourceStage.completionNote || "").trim(),
        images: Array.isArray(sourceStage.images) ? sourceStage.images : [],
        subStages: visibleSubStages,
        proposedInstallationDate: formatDateToMMDDYYYY(sourceStage.proposedInstallationDate),
        proposedInstallationTime: sourceStage.proposedInstallationTime || null,
        customerResponse: sourceStage.customerResponse || null,
        customerResponseAt: sourceStage.customerResponseAt ? formatDateTimeToMMDDYYYY(sourceStage.customerResponseAt) : null,
        customerDeclineReason: sourceStage.customerDeclineReason || null,
        customerPreferredInstallationDate: formatDateToMMDDYYYY(sourceStage.customerPreferredInstallationDate),
        customerPreferredInstallationTime: sourceStage.customerPreferredInstallationTime || null,
        customerRescheduleNotes: sourceStage.customerRescheduleNotes || null,
        delayReason: sourceStage.delayReason || (latestDelayEntry?.reason || null),
        delayExpectedResolution: formatDateTimeToMMDDYYYY(sourceStage.delayExpectedResolution || latestDelayEntry?.expectedResolution),
        delayNotes: sourceStage.delayNotes || (latestDelayEntry?.notes || null),
        delayReportedAt: formatDateTimeToMMDDYYYY(sourceStage.delayReportedAt || latestDelayEntry?.reportedAt),
        delayReportedBy: sourceStage.delayReportedBy || (latestDelayEntry?.reportedBy || null),
        delayHistory: Array.isArray(sourceStage.delayHistory) ? sourceStage.delayHistory.map((entry) => ({
          ...entry,
          expectedResolution: formatDateTimeToMMDDYYYY(entry.expectedResolution),
          reportedAt: formatDateTimeToMMDDYYYY(entry.reportedAt),
          resolvedAt: formatDateTimeToMMDDYYYY(entry.resolvedAt),
        })) : [],
        latestDelayEntry: latestDelayEntry ? {
          reason: latestDelayEntry.reason || null,
          expectedResolution: formatDateTimeToMMDDYYYY(latestDelayEntry.expectedResolution),
          notes: latestDelayEntry.notes || null,
          reportedAt: formatDateTimeToMMDDYYYY(latestDelayEntry.reportedAt),
          reportedBy: latestDelayEntry.reportedBy || null,
          resolvedAt: formatDateTimeToMMDDYYYY(latestDelayEntry.resolvedAt),
        } : null,
      };
    })
    .filter(Boolean);

  const installationStage = stageMap.installation || {};
  const installationStatus = normalizeStageStatus(installationStage.status);
  const installationSubStages = Array.isArray(installationStage.subStages) ? installationStage.subStages : [];
  const installationComplete = Boolean(installationStage.completed) || ["done", "completed"].includes(installationStatus)
    ? installationSubStages.every((subStage) => subStage.completed === true || ["done", "completed"].includes(normalizeStageStatus(subStage.status)))
    : false;
  const completedStage = {
    key: "project_completed",
    label: "Completed",
    status: installationComplete ? "completed" : "pending",
    statusText: installationComplete ? "Completed" : "Pending",
    date: installationComplete ? formatDateTimeToMMDDYYYY(installationStage.date || installationStage.installationCompletedAt) : null,
    assignedTo: "Project Manager",
    notes: installationComplete ? "Project execution complete." : "Final project completion pending.",
  };

  const contractAccepted = order.contract_status === "accepted" || order.status === "contract_accepted";
  if (contractAccepted) {
    const productionFallback = [
      { key: "cutting", label: "Cutting", status: deadlineOverdue ? "delayed" : "in-progress", statusText: deadlineOverdue ? "Delayed" : "In Progress", deadlineDelayed: deadlineOverdue, date: null, assignedTo: "Production Team", notes: "Current phase: Cutting", images: [], subStages: [] },
      { key: "assembly", label: "Assembly", status: deadlineOverdue ? "delayed" : "pending", statusText: deadlineOverdue ? "Delayed" : "Pending", deadlineDelayed: deadlineOverdue, date: null, assignedTo: "Production Team", notes: "Current phase: Assembly", images: [], subStages: [] },
      { key: "fabrication", label: "Fabrication", status: deadlineOverdue ? "delayed" : "pending", statusText: deadlineOverdue ? "Delayed" : "Pending", deadlineDelayed: deadlineOverdue, date: null, assignedTo: "Production Team", notes: "Current phase: Fabrication", images: [], subStages: [] },
      { key: "installation", label: "Installation", status: deadlineOverdue ? "delayed" : "pending", statusText: deadlineOverdue ? "Delayed" : "Pending", deadlineDelayed: deadlineOverdue, date: null, assignedTo: "Production Team", notes: "Current phase: Installation", images: [], subStages: [] },
      completedStage,
    ];

    const acceptedTimeline = progressStages.length ? progressStages : productionFallback;
    return [...baseStages, ...acceptedTimeline, completedStage];
  }

  return [...baseStages, ...progressStages, completedStage];
};

export const getOrderTimelineStatusClass = (status) => {
  switch (status) {
    case "completed":
      return "bg-emerald-600 text-white border-emerald-600";
    case "in-progress":
      return "bg-amber-100 text-amber-700 border-amber-300";
    case "delayed":
      return "bg-red-100 text-red-700 border-red-300";
    case "cancelled":
      return "bg-red-100 text-red-700 border-red-300";
    default:
      return "bg-slate-100 text-slate-500 border-slate-200";
  }
};

export const getOrderTimelineLineClass = (status) => {
  switch (status) {
    case "completed":
      return "bg-emerald-600";
    case "in-progress":
      return "bg-amber-300";
    case "delayed":
      return "bg-red-400";
    case "cancelled":
      return "bg-red-400";
    default:
      return "bg-slate-200";
  }
};
