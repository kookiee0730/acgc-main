import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, UploadCloud, Plus, CheckCircle2, Lock, Trash2, AlertTriangle, ChevronDown, Scissors, Wrench, Package, Truck, Check, Pencil } from "lucide-react";
import { formatDateToMMDDYYYY, formatDateTimeToMMDDYYYY, getTodayIso } from "@/lib/dateUtils";
import { getInstallationDateError, getMinimumInstallationDate } from "@/lib/installationSchedule";
import { calculateProjectProgressFromStages } from "@/lib/orderTimeline";
import UnsavedChangesDialog from "@/components/UnsavedChangesDialog";
import { createUnsavedSnapshot } from "@/lib/unsavedSnapshot";

const focusableSelectors = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const PARENT_STAGE_DEFINITIONS = [
  { key: "cutting", name: "Cutting" },
  { key: "assembly", name: "Assembly" },
  { key: "fabrication", name: "Fabrication" },
  { key: "installation", name: "Installation" },
];

const getMainStagePresets = () => [
  ...PARENT_STAGE_DEFINITIONS,
  { key: "custom_stage", name: "Custom Stage", isCustom: true },
];

const VALID_STAGE_STATUSES = ["pending", "in_progress", "done", "delayed", "on_hold"];

const normalizeStage = (source = {}, key, name, defaultStatus = "pending") => {
  const status = source.status && VALID_STAGE_STATUSES.includes(source.status)
    ? source.status
    : source.completed
    ? "done"
    : defaultStatus;

  const acceptedSchedule = source.customerResponse === "accepted";
  const effectiveStatus = acceptedSchedule ? "done" : status;
  const completed = !!source.completed || effectiveStatus === "done" || acceptedSchedule;
  return {
    key,
    name,
    status: effectiveStatus,
    completed,
    saved: completed,
    date: source.date ? new Date(source.date) : null,
    installationStartedAt: source.installationStartedAt ? new Date(source.installationStartedAt) : null,
    installationCompletedAt: source.installationCompletedAt ? new Date(source.installationCompletedAt) : null,
    images: Array.isArray(source.images) ? source.images : [],
    image_uploads: Array.isArray(source.image_uploads) ? source.image_uploads : [],
    newFiles: [],
    imagePreviews: Array.isArray(source.images) ? source.images : [],
    delayReason: source.delayReason || "",
    delayExpectedResolution: source.delayExpectedResolution ? new Date(source.delayExpectedResolution) : null,
    delayNotes: source.delayNotes || "",
    delayReportedAt: source.delayReportedAt ? new Date(source.delayReportedAt) : null,
    delayReportedBy: source.delayReportedBy || "",
    delayHistory: Array.isArray(source.delayHistory)
      ? source.delayHistory.map((entry) => ({
          reason: entry.reason || "",
          expectedResolution: entry.expectedResolution ? new Date(entry.expectedResolution) : null,
          notes: entry.notes || "",
          reportedAt: entry.reportedAt ? new Date(entry.reportedAt) : null,
          reportedBy: entry.reportedBy || "",
          status: entry.status || "",
          resolvedAt: entry.resolvedAt ? new Date(entry.resolvedAt) : null,
        }))
      : [],
    subStages: Array.isArray(source.subStages)
      ? source.subStages.map((subStage) => {
          const subStatus = subStage.status && VALID_STAGE_STATUSES.includes(subStage.status)
            ? subStage.status
            : subStage.completed ? "done" : "pending";
          return {
            ...subStage,
            name: subStage.name || "",
            description: subStage.description || "",
            status: subStatus,
            completed: Boolean(subStage.completed) || subStatus === "done",
            date: subStage.date ? new Date(subStage.date) : null,
            images: Array.isArray(subStage.images) ? subStage.images : [],
            newFiles: [],
            imagePreviews: Array.isArray(subStage.images) ? subStage.images : [],
            saved: true,
          };
        })
      : [],
    proposedInstallationDate: source.proposedInstallationDate ? new Date(source.proposedInstallationDate) : null,
    proposedInstallationTime: source.proposedInstallationTime || "",
    contactMethods: Array.isArray(source.contactMethods) ? source.contactMethods : [],
    schedulingNotes: source.schedulingNotes || "",
    contactAttempts: Array.isArray(source.contactAttempts) ? source.contactAttempts : [],
    customerResponse: source.customerResponse || "pending",
    customerResponseAt: source.customerResponseAt ? new Date(source.customerResponseAt) : null,
    customerDeclineReason: source.customerDeclineReason || "",
    customerPreferredInstallationDate: source.customerPreferredInstallationDate ? new Date(source.customerPreferredInstallationDate) : null,
    customerPreferredInstallationTime: source.customerPreferredInstallationTime || "",
    customerRescheduleNotes: source.customerRescheduleNotes || "",
  };
};

const normalizeProjectStages = (stageRows = []) => {
  const seenParentKeys = new Set();
  const normalizedStages = [];

  stageRows.forEach((source, index) => {
    if (!source) return;
    const candidate = `${source.key || ""} ${source.name || ""}`.toLowerCase();
    const isInstallationScheduling = candidate.includes("installation_scheduling")
      || candidate.includes("installation scheduled")
      || candidate.includes("installation scheduling");
    const parentDefinition = isInstallationScheduling ? null : PARENT_STAGE_DEFINITIONS.find(({ key, name }) => (
      candidate.includes(key) || candidate.includes(name.toLowerCase())
      || (key === "fabrication" && candidate.includes("processing"))
      || (key === "installation" && candidate.includes("site_inspection"))
    ));

    if (parentDefinition) {
      if (seenParentKeys.has(parentDefinition.key)) return;
      seenParentKeys.add(parentDefinition.key);
      normalizedStages.push(normalizeStage(
        source,
        parentDefinition.key,
        parentDefinition.name,
        parentDefinition.key === "cutting" ? "in_progress" : "pending"
      ));
      return;
    }

    const name = String(source.name || "New Stage").trim();
    const generatedKey = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const key = String(source.key || generatedKey || `custom_stage_${index + 1}`);
    normalizedStages.push(normalizeStage(source, key, name, "pending"));
  });

  const missingParentStages = PARENT_STAGE_DEFINITIONS
    .filter(({ key }) => !seenParentKeys.has(key))
    .map(({ key, name }) => normalizeStage({}, key, name, key === "cutting" ? "in_progress" : "pending"));

  return [...normalizedStages, ...missingParentStages];
};

const initialStages = [];

export default function ProgressEditModal({ project, onClose, onSave, canUploadProgressPhoto = true }) {
  const [progress, setProgress] = useState(project.progress || 0);
  const [status, setStatus] = useState(project.status || "Pending");
  const [additionalNotes, setAdditionalNotes] = useState(project.progress_notes || project.rawOrder?.progress_notes || "");
  const [installationDate, setInstallationDate] = useState(() => {
    const value = project.estimated_installation_date || project.rawOrder?.estimated_installation_date;
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  });
  const inspectionDate = project.inspection_date || project.rawOrder?.inspection_date;
  const [stages, setStages] = useState(initialStages);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [modalErrorMessage, setModalErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [newSubStageName, setNewSubStageName] = useState("");
  const [newMainStagePresetKey, setNewMainStagePresetKey] = useState("");
  const [newCustomMainStageName, setNewCustomMainStageName] = useState("");
  const [confirmExit, setConfirmExit] = useState(false);
  const initialProgressSnapshot = useRef(null);
  const [newMainStageAfterKey, setNewMainStageAfterKey] = useState("");
  const [editingMainStageIndex, setEditingMainStageIndex] = useState(null);
  const [editedMainStageName, setEditedMainStageName] = useState("");
  const [showRemoveMainStageModal, setShowRemoveMainStageModal] = useState(false);
  const [removeMainStageIndex, setRemoveMainStageIndex] = useState(null);
  const [newSubStageDescription, setNewSubStageDescription] = useState("");
  const [newSubStageStatus, setNewSubStageStatus] = useState("pending");
  const [newSubStageFiles, setNewSubStageFiles] = useState([]);
  const [newSubStagePreviews, setNewSubStagePreviews] = useState([]);
  const [showSubStageModal, setShowSubStageModal] = useState(false);
  const [subStageModalParentIndex, setSubStageModalParentIndex] = useState(null);
  const [showDelayModal, setShowDelayModal] = useState(false);
  const [delayStageIndex, setDelayStageIndex] = useState(null);
  const [delayReason, setDelayReason] = useState("");
  const [delayExpectedResolution, setDelayExpectedResolution] = useState("");
  const [delayModalError, setDelayModalError] = useState("");
  const [showRemoveSubStageModal, setShowRemoveSubStageModal] = useState(false);
  const [removeStageIndex, setRemoveStageIndex] = useState(null);
  const [removeSubStageIndex, setRemoveSubStageIndex] = useState(null);
  const [removeModalError, setRemoveModalError] = useState("");
  const [showMarkDoneConfirmation, setShowMarkDoneConfirmation] = useState(false);
  const [stagePendingCompletion, setStagePendingCompletion] = useState(null);
  const [markDoneValidationError, setMarkDoneValidationError] = useState("");
  const [completionDateTime, setCompletionDateTime] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [completionNote, setCompletionNote] = useState("");
  const minimumInstallationDate = getMinimumInstallationDate(inspectionDate);
  const modalRef = useRef(null);
  const previousActiveElement = useRef(null);

  useEffect(() => {
    const projectStages = Array.isArray(project.stages)
      ? project.stages
      : Array.isArray(project.progress_stages) ? project.progress_stages : [];
    const nextStages = normalizeProjectStages(projectStages);
    const currentStage = nextStages.find((stage) => !stage.completed && String(stage.status || "").trim().toLowerCase().replace(/[_\s]+/g, "-") === "in-progress")
      || nextStages.find((stage) => !stage.completed)
      || nextStages.at(-1);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStages(nextStages);
    initialProgressSnapshot.current = createUnsavedSnapshot({
      progress: project.progress || 0,
      status: project.status || "Pending",
      installationDate: (() => {
        const value = project.estimated_installation_date || project.rawOrder?.estimated_installation_date;
        if (!value) return "";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
      })(),
      stages: nextStages,
    });
    setNewMainStageAfterKey(currentStage?.key || "");
  }, [project.stages, project.progress_stages]);

  const currentProgressSnapshot = createUnsavedSnapshot({ progress, status, installationDate, stages, additionalNotes });
  const hasUnsavedChanges = initialProgressSnapshot.current !== null && currentProgressSnapshot !== initialProgressSnapshot.current;
  const requestClose = useCallback(() => {
    if (isSaving) return;
    if (hasUnsavedChanges) setConfirmExit(true);
    else onClose();
  }, [hasUnsavedChanges, isSaving, onClose]);

  useEffect(() => {
    previousActiveElement.current = document.activeElement;
    const focusable = modalRef.current?.querySelectorAll(focusableSelectors);
    if (focusable && focusable.length > 0) {
      focusable[0].focus();
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
      if (event.key === "Tab") {
        const nodes = modalRef.current?.querySelectorAll(focusableSelectors);
        if (!nodes || nodes.length === 0) return;
        const firstNode = nodes[0];
        const lastNode = nodes[nodes.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === firstNode) {
            event.preventDefault();
            lastNode.focus();
          }
        } else if (document.activeElement === lastNode) {
          event.preventDefault();
          firstNode.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousActiveElement.current?.focus) {
        previousActiveElement.current.focus();
      }
    };
  }, [requestClose]);

  const getLatestCompletedStageIndex = () => {
    return stages.reduce((latestIndex, stage, index) => {
      return stage?.completed && stage?.saved ? index : latestIndex;
    }, -1);
  };

  const hasLaterStageStarted = (index) => {
    return stages.slice(index + 1).some((stage) => stage?.status !== "pending");
  };

  const isStageLocked = (index) => {
    const stage = stages[index];
    if (!stage?.completed || !stage?.saved) return false;
    return hasLaterStageStarted(index);
  };

  const currentStageIndex = stages.findIndex((stage) => !stage.completed);
  const activeStageIndex = currentStageIndex === -1 ? stages.length - 1 : currentStageIndex;

  const isStageEditable = (index) => {
    const stage = stages[index];
    return index === activeStageIndex && !stage?.completed;
  };

  const isCoreMainStage = (stage) => PARENT_STAGE_DEFINITIONS.some(({ key }) => key === stage?.key);

  const startEditingMainStage = (stageIndex) => {
    const stage = stages[stageIndex];
    if (!stage || isCoreMainStage(stage) || stage.completed) return;
    setEditingMainStageIndex(stageIndex);
    setEditedMainStageName(stage.name);
    setErrorMessage("");
  };

  const saveMainStageName = () => {
    if (editingMainStageIndex === null) return;
    const name = editedMainStageName.trim();
    if (!name) {
      setErrorMessage("Stage name is required.");
      return;
    }
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!key || stages.some((stage, index) => (
      index !== editingMainStageIndex && (stage.key === key || stage.name.toLowerCase() === name.toLowerCase())
    ))) {
      setErrorMessage("A stage with that name already exists.");
      return;
    }

    const oldKey = stages[editingMainStageIndex].key;
    setStages((current) => current.map((stage, index) => (
      index === editingMainStageIndex ? { ...stage, key, name } : stage
    )));
    setNewMainStageAfterKey((current) => current === oldKey ? key : current);
    setEditingMainStageIndex(null);
    setEditedMainStageName("");
    setErrorMessage("");
  };

  const cancelEditingMainStage = () => {
    setEditingMainStageIndex(null);
    setEditedMainStageName("");
    setErrorMessage("");
  };

  const openRemoveMainStageConfirmation = (stageIndex) => {
    const stage = stages[stageIndex];
    if (!stage || isCoreMainStage(stage) || stage.completed) return;
    setRemoveMainStageIndex(stageIndex);
    setErrorMessage("");
    setShowRemoveMainStageModal(true);
  };

  const closeRemoveMainStageConfirmation = () => {
    setShowRemoveMainStageModal(false);
    setRemoveMainStageIndex(null);
  };

  const removeMainStage = () => {
    if (removeMainStageIndex === null || !stages[removeMainStageIndex] || isCoreMainStage(stages[removeMainStageIndex])) return;
    const removedKey = stages[removeMainStageIndex].key;
    const fallbackStage = stages[removeMainStageIndex - 1] || stages[removeMainStageIndex + 1];
    setStages((current) => current.filter((_, index) => index !== removeMainStageIndex));
    setNewMainStageAfterKey((current) => current === removedKey ? fallbackStage?.key || "" : current);
    if (editingMainStageIndex === removeMainStageIndex) cancelEditingMainStage();
    closeRemoveMainStageConfirmation();
  };

  const addMainStage = () => {
    const preset = getMainStagePresets().find(({ key }) => key === newMainStagePresetKey);
    if (!preset) {
      setErrorMessage("Select a preset stage to add.");
      return;
    }

    let stageToInsert;
    let nextStages;
    if (preset.isCustom) {
      const name = newCustomMainStageName.trim();
      if (!name) {
        setErrorMessage("Enter a name for the custom stage.");
        return;
      }
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      if (!key || stages.some((stage) => stage.key === key || stage.name.toLowerCase() === name.toLowerCase())) {
        setErrorMessage("A stage with that name already exists.");
        return;
      }
      stageToInsert = normalizeStage({}, key, name, "pending");
      nextStages = [...stages];
    } else {
      const existingIndex = stages.findIndex((stage) => stage.key === preset.key);
      if (existingIndex >= 0 && newMainStageAfterKey === preset.key) {
        setErrorMessage("Choose a different stage to insert after.");
        return;
      }
      nextStages = [...stages];
      stageToInsert = existingIndex >= 0
        ? nextStages.splice(existingIndex, 1)[0]
        : normalizeStage({}, preset.key, preset.name, "pending");
    }

    const selectedIndex = nextStages.findIndex((stage) => stage.key === newMainStageAfterKey);
    const insertionIndex = selectedIndex < 0 ? nextStages.length : selectedIndex + 1;
    nextStages.splice(insertionIndex, 0, stageToInsert);
    setStages(nextStages);
    setNewMainStageAfterKey(stageToInsert.key);
    setNewMainStagePresetKey("");
    setNewCustomMainStageName("");
    setErrorMessage("");
  };

  const canManageSubStages = (index) => {
    const stage = stages[index];
    return stage?.completed && stage?.saved && !isStageLocked(index) && index === getLatestCompletedStageIndex();
  };

  const canAcceptSubStages = (index) => {
    return canManageSubStages(index);
  };


  const openAddSubStageModal = (stageIndex) => {
    if (!canAcceptSubStages(stageIndex)) return;
    setSubStageModalParentIndex(stageIndex);
    setNewSubStageName("");
    setNewSubStageDescription("");
    setNewSubStageStatus("pending");
    setNewSubStageFiles([]);
    setNewSubStagePreviews([]);
    setShowSubStageModal(true);
    setModalErrorMessage("");
  };

  const closeAddSubStageModal = () => {
    setShowSubStageModal(false);
    setSubStageModalParentIndex(null);
    setNewSubStageName("");
    setNewSubStageDescription("");
    setNewSubStageStatus("pending");
    setNewSubStageFiles([]);
    setNewSubStagePreviews([]);
    setModalErrorMessage("");
  };

  const closeDelayModal = () => {
    setShowDelayModal(false);
    setDelayStageIndex(null);
    setDelayReason("");
    setDelayExpectedResolution("");
    setDelayModalError("");
  };

  const openDelayReasonModal = (stageIndex) => {
    setDelayStageIndex(stageIndex);
    setDelayReason("");
    setDelayExpectedResolution("");
    setDelayModalError("");
    setShowDelayModal(true);
  };

  const handleStageStatusChange = (stageIndex, nextStatus) => {
    const stage = stages[stageIndex];
    if (!stage) return;
    if (nextStatus === "delayed") {
      if (stage.status === "delayed") return;
      openDelayReasonModal(stageIndex);
      return;
    }
    updateStage(stageIndex, { status: nextStatus });
  };

  const handleDelayReasonSave = () => {
    if (!delayReason.trim()) {
      setDelayModalError("Please provide a reason for the delay before saving.");
      return;
    }

    const now = new Date();
    const index = delayStageIndex;
    if (index === null || typeof index === "undefined") {
      setDelayModalError("Invalid stage selected for delay.");
      return;
    }

    const stage = stages[index];
    if (!stage) {
      setDelayModalError("Invalid stage selected for delay.");
      return;
    }

    const historyEntry = {
      reason: delayReason.trim(),
      expectedResolution: delayExpectedResolution ? new Date(delayExpectedResolution) : null,
      reportedAt: now,
      reportedBy: "",
      status: "delayed",
      resolvedAt: null,
    };

    const nextHistory = [...(stage.delayHistory || []), historyEntry];

    updateStage(index, {
      status: "delayed",
      delayReason: delayReason.trim(),
      delayExpectedResolution: delayExpectedResolution ? new Date(delayExpectedResolution) : null,
      delayReportedAt: now,
      delayReportedBy: "",
      delayHistory: nextHistory,
    });

    closeDelayModal();
  };

  const handleSubStageModalFiles = (e) => {
    if (!canUploadProgressPhoto) return;
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    const previews = selected.map((file) => URL.createObjectURL(file));
    setNewSubStageFiles([...newSubStageFiles, ...selected]);
    setNewSubStagePreviews([...newSubStagePreviews, ...previews]);
    e.target.value = "";
  };

  const removeSubStageModalFile = (index) => {
    if (newSubStagePreviews[index]) {
      URL.revokeObjectURL(newSubStagePreviews[index]);
    }
    setNewSubStageFiles((prev) => prev.filter((_, i) => i !== index));
    setNewSubStagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const calculateProgress = useCallback(() => calculateProjectProgressFromStages(stages), [stages]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgress(calculateProgress());
  }, [calculateProgress]);


  const updateStage = (index, patch) => {
    setStages((prev) => {
      const next = [...prev];
      const current = next[index] || {};
      const updated = { ...current, ...patch };

      if (patch.status) {
        if (patch.status === "done") {
          updated.completed = true;
          updated.date = new Date();
        } else {
          updated.completed = false;
          updated.date = null;
        }

        if (current.status === "delayed" && patch.status !== "delayed") {
          const history = Array.isArray(updated.delayHistory) ? [...updated.delayHistory] : [];
          const lastEntry = history[history.length - 1];
          if (lastEntry && !lastEntry.resolvedAt && lastEntry.status === "delayed") {
            history[history.length - 1] = {
              ...lastEntry,
              resolvedAt: new Date(),
            };
            updated.delayHistory = history;
          }
        }
      }

      next[index] = updated;
      return next;
    });
  };

  const updateSubStage = (stageIndex, subIndex, patch) => {
    setStages((prev) => {
      const next = [...prev];
      const stage = { ...next[stageIndex] };
      const subs = [...stage.subStages];
      const current = subs[subIndex] || {};
      const updated = { ...current, ...patch };
      if (patch.status) {
        if (patch.status === "done") {
          updated.completed = true;
          updated.date = new Date();
        } else {
          updated.completed = false;
          updated.date = null;
        }
      }
      subs[subIndex] = updated;
      stage.subStages = subs;
      next[stageIndex] = stage;
      return next;
    });
  };

  const handleContactCustomer = (stageIndex) => {
    const stage = stages[stageIndex];
    if (!stage) return;
    if (!stage.proposedInstallationDate) {
      setErrorMessage("Proposed installation date is required before sending the schedule.");
      return;
    }
    if (!stage.proposedInstallationTime || !stage.proposedInstallationTime.trim()) {
      setErrorMessage("Proposed installation time is required before sending the schedule.");
      return;
    }

    const contactAttempt = {
      attemptedAt: new Date().toISOString(),
      methods: Array.isArray(stage.contactMethods) ? stage.contactMethods : [],
      notes: stage.schedulingNotes || "",
    };

    updateStage(stageIndex, {
      status: "in_progress",
      contactAttempts: [...(stage.contactAttempts || []), contactAttempt],
    });
    setErrorMessage("");
  };

  

  const canRemoveSubStage = (stageIndex, subIndex) => {
    const stage = stages[stageIndex];
    if (!stage) return false;
    const sub = stage.subStages[subIndex];
    if (!sub) return false;
    if (sub.completed || sub.status === "done") return false;
    if (stage.completed && stage.saved) return canManageSubStages(stageIndex);
    return isStageEditable(stageIndex);
  };

  const openRemoveSubStageModal = (stageIndex, subIndex) => {
    if (!canRemoveSubStage(stageIndex, subIndex)) return;
    setRemoveStageIndex(stageIndex);
    setRemoveSubStageIndex(subIndex);
    setRemoveModalError("");
    setShowRemoveSubStageModal(true);
  };

  const closeRemoveSubStageModal = () => {
    setShowRemoveSubStageModal(false);
    setRemoveStageIndex(null);
    setRemoveSubStageIndex(null);
    setRemoveModalError("");
  };

  const openMarkDoneConfirmation = (stageIndex) => {
    const stage = stages[stageIndex];
    
    // Validation: check if all sub-stages are done
    const incompleteSubs = stage.subStages.filter(sub => !sub.completed && sub.status !== "done");
    if (incompleteSubs.length > 0) {
      setMarkDoneValidationError(
        `Cannot mark ${stage.name} as done. Please complete all sub-stages first. Pending: ${incompleteSubs.map((subStage) => subStage.name).join(", ")}`
      );
      return;
    }
    
    setStagePendingCompletion(stageIndex);
    setCompletionNote("");
    const now = new Date();
    setCompletionDateTime(new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    setMarkDoneValidationError("");
    setShowMarkDoneConfirmation(true);
  };

  const closeMarkDoneConfirmation = () => {
    setShowMarkDoneConfirmation(false);
    setStagePendingCompletion(null);
    setMarkDoneValidationError("");
  };

  const confirmMarkStageDone = () => {
    if (stagePendingCompletion === null) return;
    handleMarkStageDone(stagePendingCompletion);
    closeMarkDoneConfirmation();
  };

  const handleRemoveSubStage = () => {
    if (removeStageIndex === null || removeSubStageIndex === null) {
      setRemoveModalError("Unable to remove this sub-stage.");
      return;
    }

    setStages((prev) => {
      const next = [...prev];
      const stage = { ...next[removeStageIndex] };
      stage.subStages = stage.subStages.filter((_, index) => index !== removeSubStageIndex);
      next[removeStageIndex] = stage;
      return next;
    });

    closeRemoveSubStageModal();
  };

  const handleCreateSubStageFromModal = () => {
    if (!newSubStageName.trim()) {
      setModalErrorMessage("Sub-stage title is required.");
      return;
    }
    if (subStageModalParentIndex === null) {
      setModalErrorMessage("Invalid parent stage.");
      return;
    }
    if (!canAcceptSubStages(subStageModalParentIndex)) {
      setModalErrorMessage("The selected parent stage can no longer accept new sub-stages.");
      return;
    }

    const next = [...stages];
    const stage = { ...next[subStageModalParentIndex] };
    stage.subStages = [
      ...(stage.subStages || []),
      {
        name: newSubStageName.trim(),
        description: newSubStageDescription.trim(),
        status: newSubStageStatus,
        completed: false,
        date: null,
        images: [],
        newFiles: newSubStageFiles,
        imagePreviews: newSubStagePreviews,
      },
    ];
    next[subStageModalParentIndex] = stage;
    setStages(next);
    closeAddSubStageModal();
  };

  const appendStageFiles = (stageIndex, files) => {
    setStages((prev) => {
      const next = [...prev];
      const stage = { ...next[stageIndex] };
      const previews = files.map((file) => URL.createObjectURL(file));
      stage.newFiles = [...(stage.newFiles || []), ...files];
      stage.imagePreviews = [...(stage.imagePreviews || []), ...previews];
      next[stageIndex] = stage;
      return next;
    });
  };

  const appendSubStageFiles = (stageIndex, subIndex, files) => {
    setStages((prev) => {
      const next = [...prev];
      const stage = { ...next[stageIndex] };
      const subs = [...stage.subStages];
      const sub = { ...subs[subIndex] };
      const previews = files.map((file) => URL.createObjectURL(file));
      sub.newFiles = [...(sub.newFiles || []), ...files];
      sub.imagePreviews = [...(sub.imagePreviews || []), ...previews];
      subs[subIndex] = sub;
      stage.subStages = subs;
      next[stageIndex] = stage;
      return next;
    });
  };

  const handleStageFiles = (stageIndex, e) => {
    if (!canUploadProgressPhoto) return;
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    appendStageFiles(stageIndex, selected);
    e.target.value = "";
  };

  const removeStagePreview = (stageIndex, previewIndex) => {
    setStages((prev) => {
      const next = [...prev];
      const stage = { ...next[stageIndex] };
      const previews = [...(stage.imagePreviews || [])];
      if (previewIndex < 0 || previewIndex >= previews.length) return next;
      const previewUrl = previews[previewIndex];
      if (previewUrl?.startsWith?.("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
      const images = Array.isArray(stage.images) ? [...stage.images] : [];
      const newFiles = Array.isArray(stage.newFiles) ? [...stage.newFiles] : [];
      previews.splice(previewIndex, 1);
      if (previewIndex < images.length) {
        images.splice(previewIndex, 1);
      } else {
        newFiles.splice(previewIndex - images.length, 1);
      }
      stage.imagePreviews = previews;
      stage.images = images;
      stage.newFiles = newFiles;
      next[stageIndex] = stage;
      return next;
    });
  };

  const handleSubStageFiles = (stageIndex, subIndex, e) => {
    if (!canUploadProgressPhoto) return;
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    appendSubStageFiles(stageIndex, subIndex, selected);
    e.target.value = "";
  };

  const removeSubStagePreview = (stageIndex, subIndex, previewIndex) => {
    setStages((prev) => {
      const next = [...prev];
      const stage = { ...next[stageIndex] };
      const subs = [...(stage.subStages || [])];
      const sub = { ...subs[subIndex] };
      const previews = [...(sub.imagePreviews || [])];
      if (previewIndex < 0 || previewIndex >= previews.length) return next;
      const previewUrl = previews[previewIndex];
      if (previewUrl?.startsWith?.("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
      const images = Array.isArray(sub.images) ? [...sub.images] : [];
      const newFiles = Array.isArray(sub.newFiles) ? [...sub.newFiles] : [];
      previews.splice(previewIndex, 1);
      if (previewIndex < images.length) {
        images.splice(previewIndex, 1);
      } else {
        newFiles.splice(previewIndex - images.length, 1);
      }
      sub.imagePreviews = previews;
      sub.images = images;
      sub.newFiles = newFiles;
      subs[subIndex] = sub;
      stage.subStages = subs;
      next[stageIndex] = stage;
      return next;
    });
  };

  const getPhotoCount = (item) => (item.images?.length || 0) + (item.newFiles?.length || 0);

  const canMarkSubStageDone = (stageIndex, subIndex) => {
    const stage = stages[stageIndex];
    const sub = stage.subStages[subIndex];
    return (
      (isStageEditable(stageIndex) || canManageSubStages(stageIndex)) &&
      !sub.completed &&
      !!sub.name.trim() &&
      getPhotoCount(sub) > 0
    );
  };

  const canMarkStageDone = (stage, stageIndex) => {
    return isStageEditable(stageIndex) && !stage.completed;
  };

  const handleMarkSubStageDone = (stageIndex, subIndex) => {
    const stage = stages[stageIndex];
    const sub = stage.subStages[subIndex];
    if (!sub.name.trim()) {
      setErrorMessage("Sub-stage title is required before marking it done.");
      return;
    }
    if (!window.confirm(`Mark “${sub.name}” as complete?`)) return;
    const note = window.prompt("Optional completion note:", sub.completionNote || "");
    if (note === null) return;
    updateSubStage(stageIndex, subIndex, {
      completed: true,
      status: "done",
      date: new Date(),
      completionNote: note.trim().slice(0, 1000),
    });
    setErrorMessage("");
  };

  const handleMarkStageDone = (stageIndex) => {
    const stage = stages[stageIndex];
    if (!canMarkStageDone(stage, stageIndex)) {
      setErrorMessage("Only the current active stage can be marked as done.");
      return;
    }
    const incompleteSubStages = (stage.subStages || []).filter((subStage) =>
      !subStage.completed && !["done", "completed"].includes(String(subStage.status || "").toLowerCase())
    );
    if (incompleteSubStages.length > 0) {
      setErrorMessage(`Cannot mark ${stage.name} as done. Complete all sub-stages first: ${incompleteSubStages.map((subStage) => subStage.name).join(", ")}`);
      return;
    }
    updateStage(stageIndex, {
      completed: true,
      status: "done",
      date: completionDateTime ? new Date(completionDateTime) : new Date(),
      completionNote: completionNote.trim(),
    });
    setErrorMessage("");
  };

  const buildPayloadStages = () => {
    const schedulingDone = stages.some(
      (stage) => stage.key === "installation_scheduling" && stage.completed
    );

    return stages.map((stage) => {
      const shouldStartInstallation =
        schedulingDone &&
        stage.key === "installation" &&
        !stage.completed &&
        !["in_progress", "delayed", "on_hold"].includes(stage.status);

      return {
        key: stage.key,
        name: stage.name,
        status: shouldStartInstallation ? "in_progress" : stage.status,
        completed: stage.completed,
        date: stage.date ? stage.date.toISOString() : null,
        completionNote: stage.completionNote || "",
        installationStartedAt: stage.installationStartedAt ? stage.installationStartedAt.toISOString() : null,
        installationCompletedAt: stage.installationCompletedAt ? stage.installationCompletedAt.toISOString() : null,
        images: stage.images,
        image_uploads: stage.image_uploads || [],
        delayReason: stage.delayReason || "",
        delayExpectedResolution: stage.delayExpectedResolution ? stage.delayExpectedResolution.toISOString() : null,
        delayNotes: stage.delayNotes || "",
        delayReportedAt: stage.delayReportedAt ? stage.delayReportedAt.toISOString() : null,
        delayReportedBy: stage.delayReportedBy || "",
        delayHistory: Array.isArray(stage.delayHistory)
          ? stage.delayHistory.map((entry) => ({
              reason: entry.reason || "",
              expectedResolution: entry.expectedResolution ? entry.expectedResolution.toISOString() : null,
              notes: entry.notes || "",
              reportedAt: entry.reportedAt ? entry.reportedAt.toISOString() : null,
              reportedBy: entry.reportedBy || "",
              status: entry.status || "",
              resolvedAt: entry.resolvedAt ? entry.resolvedAt.toISOString() : null,
            }))
          : [],
        proposedInstallationDate: stage.proposedInstallationDate ? stage.proposedInstallationDate.toISOString() : null,
        proposedInstallationTime: stage.proposedInstallationTime || null,
        contactMethods: Array.isArray(stage.contactMethods) ? stage.contactMethods : [],
        schedulingNotes: stage.schedulingNotes || "",
        contactAttempts: Array.isArray(stage.contactAttempts)
          ? stage.contactAttempts.map((attempt) => ({
              attemptedAt: attempt.attemptedAt || null,
              methods: Array.isArray(attempt.methods) ? attempt.methods : [],
              notes: attempt.notes || "",
            }))
          : [],
        customerResponse: stage.customerResponse || "pending",
        customerResponseAt: stage.customerResponseAt ? stage.customerResponseAt.toISOString() : null,
        customerDeclineReason: stage.customerDeclineReason || "",
        customerPreferredInstallationDate: stage.customerPreferredInstallationDate ? stage.customerPreferredInstallationDate.toISOString() : null,
        customerPreferredInstallationTime: stage.customerPreferredInstallationTime || "",
        customerRescheduleNotes: stage.customerRescheduleNotes || "",
        subStages: (stage.subStages || []).map((subStage) => ({
          name: subStage.name || "",
          description: subStage.description || "",
          status: subStage.status || (subStage.completed ? "done" : "pending"),
          completed: Boolean(subStage.completed),
          date: subStage.date ? subStage.date.toISOString() : null,
          completionNote: subStage.completionNote || "",
          images: Array.isArray(subStage.images) ? subStage.images : [],
        })),
      };
    });
  };

  const buildFileContexts = () => {
    if (!canUploadProgressPhoto) return [];
    const contexts = [];
    stages.forEach((stage, stageIndex) => {
      (stage.newFiles || []).forEach((file) => {
        contexts.push({ file, stageIndex });
      });
      (stage.subStages || []).forEach((sub, subIndex) => {
        (sub.newFiles || []).forEach((file) => {
          contexts.push({ file, stageIndex, subIndex });
        });
      });
    });
    return contexts;
  };

  const handleSave = async () => {
    setErrorMessage("");
    const installationDateError = getInstallationDateError(inspectionDate, installationDate);
    if (installationDateError) {
      setErrorMessage(installationDateError);
      return;
    }
    setIsSaving(true);
    setUploadProgress(0);

    const fileContexts = buildFileContexts();
    const payloadStages = buildPayloadStages();

    try {
      await onSave(
        {
          ...project,
          progress,
          status,
          progress_notes: additionalNotes,
          installation: installationDate ? new Date(`${installationDate}T00:00:00.000Z`).toISOString() : "",
          stages: payloadStages,
        },
        fileContexts,
        setUploadProgress
      );
      setIsSaving(false);
      onClose();
    } catch (error) {
      setErrorMessage(error.message || "Unable to save progress. Please try again.");
      setIsSaving(false);
    }
  };

  const handleProjectStatusChange = (nextStatus) => {
    setStatus(nextStatus);
    if (activeStageIndex === -1 || stages[activeStageIndex]?.completed) return;

    const normalized = nextStatus.toLowerCase().replace(/\s+/g, "_");
    let stageStatus = null;

    if (normalized === "delayed") {
      stageStatus = "delayed";
    } else if (normalized === "completed") {
      stageStatus = "done";
    } else if (normalized === "pending") {
      stageStatus = "pending";
    } else if (["cutting", "assembly", "fabrication", "installation"].includes(normalized)) {
      stageStatus = "in_progress";
    }

    if (stageStatus) {
      updateStage(activeStageIndex, { status: stageStatus });
    }
  };

  const handleOverlayClick = useCallback(
    (event) => {
      if (event.target === event.currentTarget) {
        requestClose();
      }
    },
    [requestClose]
  );

  return (
    <div
      className="mobile-fullscreen-overlay fixed inset-0 z-[70] flex items-stretch justify-center bg-black/50 p-0 lg:items-center lg:p-4"
      onClick={handleOverlayClick}
      role="presentation"
    >
      <style>{`.progress-edit-dialog,
        .progress-edit-dialog * { box-shadow: none !important; }
        .progress-edit-dialog :is(.font-semibold, .font-bold, .font-black, .font-extrabold) { font-weight: 500; }
        .progress-edit-stage-summary::-webkit-details-marker { display: none; }
        .progress-edit-dialog :is(button, input, select, textarea, summary):focus-visible {
          outline: 2px solid var(--color-blue-500);
          outline-offset: 2px;
        }
        .progress-edit-stage[open] > .progress-edit-stage-summary .progress-edit-stage-chevron {
          transform: rotate(180deg);
        }
      `}</style>
      <div
        className="mobile-fullscreen-dialog progress-edit-dialog flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col overflow-hidden rounded-none border border-slate-200 bg-white lg:h-auto lg:max-h-[90vh] lg:max-w-[600px] lg:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="progress-edit-title"
        aria-describedby="progress-edit-description"
        ref={modalRef}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-5">
          <div>
            <h3 id="progress-edit-title" className="text-lg font-medium">
              Edit Progress — {project.client}
            </h3>
            <p id="progress-edit-description" className="text-sm text-gray-500">
              Manage main stages, proof photos, and completion history.
            </p>
          </div>
          <button
            onClick={requestClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Close edit progress dialog"
          >
            <X size={17} />
          </button>
        </div>

        <div className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-5">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-2xl font-medium leading-none">{Math.round(Math.max(0, Math.min(progress, 100)))}%</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">auto-calculated</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.max(0, Math.min(progress, 100)))}>
              <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-500">Automatically calculated from completed stages.</p>
          </div>
          <div className="mt-4 max-w-sm">
            <label htmlFor="progress-installation-date" className="mb-1.5 block text-sm font-medium text-slate-700">
              Est. Installation Date
            </label>
            <input
              id="progress-installation-date"
              type="date"
              value={installationDate}
              min={minimumInstallationDate}
              onChange={(event) => {
                setInstallationDate(event.target.value);
                if (errorMessage) setErrorMessage("");
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            {minimumInstallationDate && (
              <p className="mt-1.5 text-xs text-slate-500">
                Must be after the Site Inspection Date. Earliest allowed date is {formatDateToMMDDYYYY(minimumInstallationDate)}.
              </p>
            )}
          </div>
        </div>

        <div className="min-h-0 max-h-none flex-1 overflow-y-auto bg-slate-50 px-3 py-3 sm:px-4 lg:max-h-[460px]">
          <div className="space-y-3">
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <label htmlFor="progress-additional-notes" className="mb-1 block text-sm font-semibold text-slate-800">Additional Notes (admin only)</label>
            <p className="mb-2 text-xs text-slate-600">Private notes for staff. Customers will not see this field.</p>
            <textarea id="progress-additional-notes" value={additionalNotes} maxLength={4000} onChange={(event) => setAdditionalNotes(event.target.value)} rows={3} placeholder="Add internal project notes..." className="w-full resize-y rounded-lg border border-amber-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" />
            <div className="mt-1 text-right text-xs text-slate-500">{additionalNotes.length}/4000</div>
            {(project.progress_audit || []).length > 0 && (
              <details className="mt-3 border-t border-amber-200 pt-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-700">Progress history ({project.progress_audit.length})</summary>
                <ol className="mt-2 max-h-36 space-y-2 overflow-y-auto">
                  {[...project.progress_audit].reverse().slice(0, 10).map((entry, index) => (
                    <li key={`${entry.type}-${entry.at}-${index}`} className="text-xs text-slate-600">
                      <span className="font-medium text-slate-800">{entry.byName || "Staff"}</span> · {entry.type?.replaceAll("_", " ")}{entry.stageName ? `: ${entry.stageName}` : ""}{entry.subStageName ? ` / ${entry.subStageName}` : ""}{entry.reason ? ` — ${entry.reason}` : ""}
                      <span className="ml-1 text-slate-500">{entry.at ? new Date(entry.at).toLocaleString() : ""}</span>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </section>
          {stages.length === 0 && (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
              No progress stages have been added yet.
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Add New Stage</h3>
            <label className="sr-only" htmlFor="new-main-stage-preset">Select a preset stage</label>
            <select
              id="new-main-stage-preset"
              value={newMainStagePresetKey}
              onChange={(event) => setNewMainStagePresetKey(event.target.value)}
              className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">-- Select a Preset Stage --</option>
              {getMainStagePresets().map((preset) => (
                <option key={preset.key} value={preset.key}>
                  {preset.name}
                </option>
              ))}
            </select>
            {getMainStagePresets().find(({ key }) => key === newMainStagePresetKey)?.isCustom && (
              <label className="mt-2 block">
                <span className="sr-only">Custom stage name</span>
                <input
                  aria-label="Custom stage name"
                  value={newCustomMainStageName}
                  onChange={(event) => setNewCustomMainStageName(event.target.value)}
                  placeholder="Enter custom stage name"
                  className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            )}
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="shrink-0 text-sm font-medium text-slate-600" htmlFor="new-main-stage-after">Insert after:</label>
              <select
                id="new-main-stage-after"
                value={newMainStageAfterKey}
                onChange={(event) => setNewMainStageAfterKey(event.target.value)}
                className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {stages.map((stage, index) => (
                  <option key={stage.key} value={stage.key}>{index + 1}. {stage.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={addMainStage}
                disabled={!newMainStagePresetKey}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={16} aria-hidden="true" /> Add
              </button>
            </div>
          </div>

          {stages.map((stage, stageIndex) => {
            const stageLocked = isStageLocked(stageIndex);
            const stageEditable = isStageEditable(stageIndex);
            const StageIcon = stage.key === "cutting"
              ? Scissors
              : stage.key === "assembly"
                ? Wrench
                : stage.key === "fabrication"
                  ? Package
                  : Truck;
            return (
              <details
                key={stage.key}
                open={stageEditable}
                className={`progress-edit-stage overflow-hidden rounded-xl border ${stageEditable ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-100/80"}`}
              >
                <summary className={`progress-edit-stage-summary flex list-none items-start gap-3 p-3 sm:p-4 ${stageEditable ? "cursor-pointer transition-colors hover:bg-slate-50" : "cursor-pointer"}`}>
                  <span className={`mt-0.5 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border ${stage.completed ? "border-emerald-600 bg-emerald-600 text-white" : stageEditable ? "border-amber-500 bg-amber-500 text-white" : "border-slate-300 bg-white text-slate-500"}`} aria-hidden="true">
                    {stage.completed
                      ? <Check size={15} strokeWidth={2.5} />
                      : stageEditable
                        ? <StageIcon size={14} />
                        : <Lock size={13} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[15px] font-medium leading-5">{stage.name}</span>
                      {stage.completed && (
                        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-emerald-700">
                          Completed
                        </span>
                      )}
                      {stage.status === "delayed" && !stage.completed && (
                        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-amber-700">
                          Delayed
                        </span>
                      )}
                    </span>
                    {stageLocked && !stage.completed && (
                      <span className="mt-1 flex items-center gap-2 text-[13px] text-slate-500">
                        <Lock className="h-3.5 w-3.5" />
                        <span>Stage Locked - Project has progressed to the next phase.</span>
                      </span>
                    )}
                    <span className="mt-1 block text-[13px] leading-5 text-slate-500">
                      {stage.completed
                        ? stage.saved
                          ? `Completed on ${stage.date ? formatDateTimeToMMDDYYYY(stage.date) : "Unknown"}`
                          : "Marked as Done (Unsaved). Review before saving."
                        : stage.status === "delayed"
                        ? "This stage is delayed. Update the status once it resumes."
                        : stageLocked
                        ? "This stage is locked because the project has moved to the next phase."
                        : "Active stage. Update its state or mark it as done when work is complete."}
                    </span>
                    {stage.completed && !stage.saved && (
                      <span className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        Marked as Done (Unsaved)
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] ${
                        stage.completed
                          ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                          : stageEditable
                          ? "border-amber-200 bg-amber-100 text-amber-800"
                          : "border-slate-300 bg-slate-100 text-slate-600"
                      }`}
                    >
                      {stage.completed ? "Done" : stageEditable ? "Current" : "Locked"}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {getPhotoCount(stage)} proof photo(s)
                    </span>
                  </span>
                  <ChevronDown className="progress-edit-stage-chevron mt-1 h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 motion-reduce:transition-none" aria-hidden="true" />
                </summary>

                <div className="border-t border-slate-200 px-3 pb-4 sm:px-4">
                {!isCoreMainStage(stage) && (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    {editingMainStageIndex === stageIndex ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <label className="sr-only" htmlFor={`edit-main-stage-name-${stage.key}`}>Edit stage name</label>
                        <input
                          id={`edit-main-stage-name-${stage.key}`}
                          aria-label={`Edit stage name for ${stage.name}`}
                          value={editedMainStageName}
                          onChange={(event) => setEditedMainStageName(event.target.value)}
                          className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={cancelEditingMainStage} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100">Cancel</button>
                          <button type="button" onClick={saveMainStageName} className="min-h-10 rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white hover:bg-blue-800">Save Name</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-500">Added stage</span>
                        {!stage.completed && <div className="flex gap-2">
                          <button type="button" onClick={() => startEditingMainStage(stageIndex)} aria-label={`Edit added stage ${stage.name}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                            <Pencil size={14} aria-hidden="true" /> Edit
                          </button>
                          <button type="button" onClick={() => openRemoveMainStageConfirmation(stageIndex)} aria-label={`Remove added stage ${stage.name}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100">
                            <Trash2 size={14} aria-hidden="true" /> Remove
                          </button>
                        </div>}
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-4 grid gap-3 min-[480px]:grid-cols-2">
                  <label className="block text-sm text-gray-600">
                    Stage State
                    {stage.completed ? (
                      <div className="mt-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">Completed</div>
                    ) : (
                      <select
                        className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus-visible:ring-2 focus-visible:ring-blue-500"
                        value={stage.status}
                        disabled={!stageEditable}
                        onChange={(e) => handleStageStatusChange(stageIndex, e.target.value)}
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="delayed">Delayed</option>
                      </select>
                    )}
                  </label>

                    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <UploadCloud size={17} />
                        Parent Stage Proof
                      </div>
                      <p className="mt-1.5 text-xs text-slate-500">{canUploadProgressPhoto ? "Photos are optional; upload if available." : "Photo uploads are disabled for your account."}</p>
                      {canUploadProgressPhoto && <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          disabled={!stageEditable && !stage.completed}
                          onChange={(e) => handleStageFiles(stageIndex, e)}
                          aria-label={`Upload proof images for ${stage.name}`}
                          id={`parent-stage-files-${stage.key}`}
                          className="peer sr-only"
                        />
                        <label
                          htmlFor={`parent-stage-files-${stage.key}`}
                          className={`cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-blue-500 ${!stageEditable && !stage.completed ? "pointer-events-none opacity-50" : ""}`}
                        >
                          Choose Files
                        </label>
                        <span className="min-w-0 truncate text-xs text-slate-500">
                          {stage.newFiles.length === 0
                            ? "No file chosen"
                            : stage.newFiles.length === 1
                              ? stage.newFiles[0].name
                              : `${stage.newFiles.length} files`}
                        </span>
                      </div>}
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {stage.imagePreviews.map((src, i) => (
                          <div key={`${stage.key}-preview-${i}`} className="relative">
                            <img
                              src={src}
                              alt={`${stage.name} preview ${i + 1}`}
                              className="h-20 w-full object-cover rounded-lg"
                            />
                            {(stageEditable || stage.completed) && (
                              <button
                                type="button"
                                onClick={() => removeStagePreview(stageIndex, i)}
                                className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm hover:bg-red-100 hover:text-red-700"
                                aria-label={`Remove photo ${i + 1} from ${stage.name}`}
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                </div>

                    {(stage.status === "delayed" || (Array.isArray(stage.delayHistory) && stage.delayHistory.length > 0)) && (
                      <div className="progress-delay-panel mt-5 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 sm:p-5">
                        {(() => {
                          const latestDelay = Array.isArray(stage.delayHistory) ? stage.delayHistory.at(-1) : null;
                          const reason = stage.delayReason || latestDelay?.reason || "No reason provided";
                          const reportedAt = stage.delayReportedAt || latestDelay?.reportedAt;
                          const expectedResolution = stage.delayExpectedResolution || latestDelay?.expectedResolution;
                          const reportedBy = stage.delayReportedBy || latestDelay?.reportedBy || "Admin";

                          return (
                            <>
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                                    <AlertTriangle size={16} aria-hidden="true" />
                                  </span>
                                  <div>
                                    <h5 className="text-sm font-bold text-amber-950">Delay details</h5>
                                    <p className="text-xs text-amber-800">{stage.name}</p>
                                  </div>
                                </div>
                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${stage.status === "delayed" ? "bg-amber-200 text-amber-950" : "border border-amber-300 bg-white/70 text-amber-900"}`}>
                                  {stage.status === "delayed" ? "Currently delayed" : "Delay history"}
                                </span>
                              </div>

                              <div className="mt-4 border-t border-amber-200 pt-4">
                                <p className="text-[11px] font-semibold text-amber-800">Reason</p>
                                <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-slate-800">{reason}</p>
                              </div>

                              <dl className="mt-4 grid gap-x-6 gap-y-4 border-t border-amber-200 pt-4 sm:grid-cols-2">
                                <div>
                                  <dt className="text-[11px] font-semibold text-amber-800">Date reported</dt>
                                  <dd className="mt-1 text-sm text-slate-800">{reportedAt ? formatDateTimeToMMDDYYYY(reportedAt) : "Not recorded"}</dd>
                                </div>
                                <div>
                                  <dt className="text-[11px] font-semibold text-amber-800">Expected resolution</dt>
                                  <dd className="mt-1 text-sm text-slate-800">{expectedResolution ? formatDateToMMDDYYYY(expectedResolution) : "Not set"}</dd>
                                </div>
                                <div>
                                  <dt className="text-[11px] font-semibold text-amber-800">Reported by</dt>
                                  <dd className="mt-1 break-all text-sm text-slate-800">{reportedBy}</dd>
                                </div>
                              </dl>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    <div className="mt-5 hidden">
                      <div className="flex items-center justify-between gap-4 mb-4">
                        <div>
                          <p className="text-sm font-semibold">Sub-stages</p>
                          <p className="text-xs text-slate-500">
                            Manage sub-stages created for this phase.
                          </p>
                        </div>
                      </div>

                      {stage.completed && stage.saved ? (
                        <div className="border-l-2 border-slate-200 pl-4 space-y-4">
                          {stage.subStages.length === 0 ? (
                            <div className="text-center py-6">
                              <p className="text-sm text-slate-500 mb-3">No sub-stages created yet.</p>
                              {canAcceptSubStages(stageIndex) && (
                                <button
                                  type="button"
                                  onClick={() => openAddSubStageModal(stageIndex)}
                                  className="inline-flex items-center gap-2 rounded-full bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white"
                                  aria-label={`Add sub-stage to ${stage.name}`}
                                >
                                  <Plus size={16} /> Add Sub-Stage
                                </button>
                              )}
                            </div>
                          ) : (
                            <>
                              {stage.subStages.map((sub, subIndex) => {
                                const subLocked = sub.completed;
                                const subEditable = (stageEditable || canManageSubStages(stageIndex)) && !subLocked;
                                return (
                                  <div
                                    key={`${stage.key}-sub-${subIndex}`}
                                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                                  >
                                    {/* Header with status indicator */}
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                          <div
                                            className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${
                                              sub.completed
                                                ? "border-emerald-600 bg-emerald-600 text-white"
                                                : sub.status === "in_progress"
                                                ? "border-amber-300 bg-amber-100 text-amber-700"
                                                : "border-slate-200 bg-white text-slate-500"
                                            }`}
                                          >
                                            {sub.completed ? "✓" : subIndex + 1}
                                          </div>
                                          <div>
                                            <p className="font-semibold text-slate-900">{sub.name || "Untitled sub-stage"}</p>
                                            {sub.completed && (
                                              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                                                Completed
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        {sub.date && (
                                          <p className="text-xs text-slate-500 ml-11">
                                            Completed on {formatDateTimeToMMDDYYYY(sub.date) ?? "Unknown"}
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        <span
                                          className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
                                            sub.completed
                                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                              : sub.status === "in_progress"
                                              ? "border-amber-200 bg-amber-50 text-amber-700"
                                              : "border-slate-200 bg-white text-slate-600"
                                          }`}
                                        >
                                          {sub.completed
                                            ? "Done"
                                            : sub.status === "in_progress"
                                            ? "In Progress"
                                            : sub.status === "delayed"
                                            ? "Delayed"
                                            : "Pending"}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                          {getPhotoCount(sub)} photo(s)
                                        </span>
                                      </div>
                                    </div>

                                    {/* Description */}
                                    {sub.description && !subEditable && (
                                      <p className="mt-3 text-sm text-slate-600">{sub.description}</p>
                                    )}

                                    {/* Editable Fields */}
                                    {subEditable && (
                                      <>
                                        <div className="grid gap-4 mt-4 sm:grid-cols-2">
                                          <label className="text-sm text-gray-600 block">
                                            Title
                                            <input
                                              type="text"
                                              value={sub.name}
                                              onChange={(e) => updateSubStage(stageIndex, subIndex, { name: e.target.value })}
                                              disabled={!subEditable}
                                              className="mt-2 w-full border p-2 rounded-lg"
                                              aria-label={`Sub-stage title for ${stage.name}`}
                                            />
                                          </label>

                                          <label className="text-sm text-gray-600 block">
                                            Sub-Stage State
                                            <select
                                              value={sub.status}
                                              disabled={!subEditable}
                                              onChange={(e) => updateSubStage(stageIndex, subIndex, { status: e.target.value })}
                                              className="mt-2 w-full border p-2 rounded-lg"
                                            >
                                              <option value="pending">Pending</option>
                                              <option value="in_progress">In Progress</option>
                                              <option value="done">Done</option>
                                              <option value="delayed">Delayed</option>
                                            </select>
                                          </label>
                                        </div>

                                        <div className="mt-4">
                                          <label className="text-sm text-gray-600 block">
                                            Description
                                            <textarea
                                              value={sub.description}
                                              onChange={(e) => updateSubStage(stageIndex, subIndex, { description: e.target.value })}
                                              disabled={!subEditable}
                                              className="mt-2 w-full min-h-[80px] border p-2 rounded-lg"
                                              aria-label={`Sub-stage description for ${stage.name}`}
                                            />
                                          </label>
                                        </div>
                                      </>
                                    )}

                                    {/* Photos Section */}
                                    <div className="mt-4 border rounded-2xl border-dashed border-slate-200 bg-white p-4">
                                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                        <UploadCloud size={16} />
                                        Proof Photos
                                      </div>
                                      <p className="text-xs text-slate-500 mt-2">
                                        {getPhotoCount(sub) > 0
                                          ? `${getPhotoCount(sub)} photo(s) uploaded`
                                          : "Photos are required before this sub-stage can be marked as done."}
                                      </p>
                                      {canUploadProgressPhoto && subEditable && (
                                        <div className="mt-3">
                                          <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            disabled={!subEditable}
                                            onChange={(e) => handleSubStageFiles(stageIndex, subIndex, e)}
                                            aria-label={`Upload proof images for ${sub.name || "sub-stage"}`}
                                          />
                                        </div>
                                      )}
                                      {sub.imagePreviews.length > 0 && (
                                        <div className="mt-3 grid grid-cols-3 gap-2">
                                          {sub.imagePreviews.map((src, i) => (
                                            <div key={`${stage.key}-sub-${subIndex}-preview-${i}`} className="relative">
                                              <img
                                                src={src}
                                                alt={`${sub.name || "Sub-stage"} preview ${i + 1}`}
                                                className="h-20 w-full object-cover rounded-lg"
                                              />
                                              {subEditable && (
                                                <button
                                                  type="button"
                                                  onClick={() => removeSubStagePreview(stageIndex, subIndex, i)}
                                                  className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm hover:bg-red-100 hover:text-red-700"
                                                  aria-label={`Remove photo ${i + 1} from ${sub.name || "sub-stage"}`}
                                                >
                                                  <X size={14} />
                                                </button>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    {/* Action Buttons */}
                                    {subEditable && !sub.completed && (
                                      <div className="mt-4 flex justify-end gap-3">
                                        <button
                                          type="button"
                                          onClick={() => openRemoveSubStageModal(stageIndex, subIndex)}
                                          className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 px-3 py-2 text-sm font-semibold"
                                        >
                                          <Trash2 size={14} />
                                          Remove
                                        </button>
                                        <button
                                          type="button"
                                          disabled={!canMarkSubStageDone(stageIndex, subIndex)}
                                          onClick={() => handleMarkSubStageDone(stageIndex, subIndex)}
                                          className="inline-flex items-center gap-2 rounded-full bg-emerald-600 hover:bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          <CheckCircle2 size={14} />
                                          Mark as Done
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                              {/* Add Sub-Stage button at the bottom */}
                              {canAcceptSubStages(stageIndex) && (
                                <div className="mt-4 flex justify-center">
                                  <button
                                    type="button"
                                    onClick={() => openAddSubStageModal(stageIndex)}
                                    className="inline-flex items-center gap-2 rounded-full bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white"
                                    aria-label={`Add sub-stage to ${stage.name}`}
                                  >
                                    <Plus size={16} /> Add Sub-Stage
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                          {stage.completed && !stage.saved
                            ? "Sub-stages will become available after saving this completed parent stage."
                            : "Sub-stages will become available after this parent stage is marked as completed."}
                        </div>
                      )}
                    </div>
                
                <div className="mt-4 flex justify-end gap-3 border-t border-slate-100 pt-3">
                  {!stage.completed && (
                    <button
                      type="button"
                      disabled={!canMarkStageDone(stage, stageIndex)}
                      aria-disabled={!canMarkStageDone(stage, stageIndex)}
                      onClick={() => openMarkDoneConfirmation(stageIndex)}
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCircle2 size={16} />
                      {stage.key === "installation" ? "Mark Installation as Done" : `Mark ${stage.name} Done`}
                    </button>
                  )}
                </div>
                </div>
              </details>
            );
          })}
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700 mt-4">
            {errorMessage}
          </div>
        )}

        {showMarkDoneConfirmation && stagePendingCompletion !== null && (
          <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
            <section className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" role="alertdialog" aria-modal="true" aria-labelledby="complete-stage-title">
              <h3 id="complete-stage-title" className="text-lg font-semibold text-slate-900">Complete {stages[stagePendingCompletion]?.name}?</h3>
              <p className="mt-1 text-sm text-slate-600">Confirm the completion details. The date and note are optional.</p>
              <label className="mt-4 block text-sm font-medium text-slate-700">Completion date and time
                <input type="datetime-local" value={completionDateTime} onChange={(event) => setCompletionDateTime(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="mt-3 block text-sm font-medium text-slate-700">Completion note (optional)
                <textarea value={completionNote} maxLength={1000} onChange={(event) => setCompletionNote(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              {markDoneValidationError && <p className="mt-2 text-sm text-red-700">{markDoneValidationError}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={closeMarkDoneConfirmation} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">Cancel</button>
                <button type="button" onClick={confirmMarkStageDone} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Confirm completion</button>
              </div>
            </section>
          </div>
        )}

        {/* Add Sub-Stage Modal */}
        {showSubStageModal && subStageModalParentIndex !== null && (
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
            role="presentation"
          >
            <div
              className="bg-white rounded-2xl p-6 w-full max-w-md shadow-lg outline-none"
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-substage-title"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 id="add-substage-title" className="text-lg font-semibold">
                    Add Sub-Stage
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    to {stages[subStageModalParentIndex]?.name}
                  </p>
                </div>
                <button
                  onClick={closeAddSubStageModal}
                  className="p-2 text-gray-500 hover:text-gray-700"
                  aria-label="Close add sub-stage dialog"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <label className="text-sm text-gray-600 block">
                  Sub-Stage Name *
                  <input
                    type="text"
                    className="mt-2 w-full border p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newSubStageName}
                    onChange={(e) => setNewSubStageName(e.target.value)}
                    placeholder="e.g., Material Preparation, Glass Cutting"
                    autoFocus
                  />
                </label>

                <label className="text-sm text-gray-600 block">
                  Description
                  <textarea
                    className="mt-2 w-full border p-2 rounded-lg min-h-[80px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newSubStageDescription}
                    onChange={(e) => setNewSubStageDescription(e.target.value)}
                    placeholder="Optional description for this sub-stage"
                  />
                </label>

                <label className="text-sm text-gray-600 block">
                  Sub-Stage State
                  <select
                    className="mt-2 w-full border p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newSubStageStatus}
                    onChange={(e) => setNewSubStageStatus(e.target.value)}
                  >
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </label>

                {canUploadProgressPhoto ? (
                  <label className="text-sm text-gray-600 block">
                    Proof Photos (Optional)
                    <div className="mt-2 border-2 border-dashed border-slate-200 rounded-lg p-4 text-center">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleSubStageModalFiles}
                        className="w-full"
                        aria-label="Upload proof images"
                      />
                    </div>
                  </label>
                ) : <p className="text-xs text-slate-500">Photo uploads are disabled for your account.</p>}

                {newSubStagePreviews.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-600 mb-2">
                      {newSubStagePreviews.length} photo(s) selected
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {newSubStagePreviews.map((src, i) => (
                        <div key={i} className="relative">
                          <img
                            src={src}
                            alt={`Preview ${i + 1}`}
                            className="h-20 w-full object-cover rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={() => removeSubStageModalFile(i)}
                            className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1"
                            aria-label={`Remove photo ${i + 1}`}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {modalErrorMessage && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-xs text-red-700">
                    {modalErrorMessage}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={closeAddSubStageModal}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateSubStageFromModal}
                  disabled={!newSubStageName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create Sub-Stage
                </button>
              </div>
            </div>
          </div>
        )}

        {showDelayModal && delayStageIndex !== null && (
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4"
            role="presentation"
          >
            <div
              className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-lg outline-none"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delay-reason-title"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 id="delay-reason-title" className="text-lg font-semibold">
                    Project Delay Reason
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Provide a reason before marking this stage as delayed.
                  </p>
                </div>
                <button
                  onClick={closeDelayModal}
                  className="p-2 text-gray-500 hover:text-gray-700"
                  aria-label="Close delay reason dialog"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <label className="text-sm text-gray-600 block">
                  Delay Reason *
                  <textarea
                    className="mt-2 w-full min-h-[120px] border p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    value={delayReason}
                    onChange={(e) => setDelayReason(e.target.value)}
                    placeholder="Material delivery delayed by supplier."
                  />
                </label>

                <label className="text-sm text-gray-600 block">
                  Expected Resolution Date
                  <input
                    type="date"
                    min={getTodayIso()}
                    className="mt-2 w-full border p-2 rounded-lg"
                    value={delayExpectedResolution}
                    onChange={(e) => setDelayExpectedResolution(e.target.value)}
                  />
                </label>

                {delayModalError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                    {delayModalError}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={closeDelayModal}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelayReasonSave}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                >
                  Save Delay Reason
                </button>
              </div>
            </div>
          </div>
        )}

        {showRemoveSubStageModal && removeStageIndex !== null && removeSubStageIndex !== null && (
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-[80] p-4"
            role="presentation"
          >
            <div
              className="bg-white rounded-2xl p-6 w-full max-w-md shadow-lg outline-none"
              role="dialog"
              aria-modal="true"
              aria-labelledby="remove-substage-title"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 id="remove-substage-title" className="text-lg font-semibold">
                    Remove Sub-Stage
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Are you sure you want to remove this sub-stage? This action cannot be undone.
                  </p>
                </div>
                <button
                  onClick={closeRemoveSubStageModal}
                  className="p-2 text-gray-500 hover:text-gray-700"
                  aria-label="Close remove sub-stage dialog"
                >
                  <X size={20} />
                </button>
              </div>

              {removeModalError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4">
                  {removeModalError}
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={closeRemoveSubStageModal}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRemoveSubStage}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Remove Sub-Stage
                </button>
              </div>
            </div>
          </div>
        )}

        {showRemoveMainStageModal && removeMainStageIndex !== null && stages[removeMainStageIndex] && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
            role="presentation"
          >
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg" role="alertdialog" aria-modal="true" aria-labelledby="remove-main-stage-title">
              <h3 id="remove-main-stage-title" className="text-lg font-semibold text-slate-900">Remove Added Stage</h3>
              <p className="mt-2 text-sm text-slate-600">
                Remove “{stages[removeMainStageIndex].name}” and its progress details? This change will be saved when you save progress.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={closeRemoveMainStageConfirmation} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">Cancel</button>
                <button type="button" onClick={removeMainStage} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Remove Stage</button>
              </div>
            </div>
          </div>
        )}

        {isSaving && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700 mt-4">
            Saving... {uploadProgress > 0 && `${uploadProgress}%`}
            <div className="mt-2 h-2 bg-blue-100 rounded-full overflow-hidden">
              <div className="h-2 bg-blue-600 rounded-full" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}

        <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5 lg:pb-3">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
        <UnsavedChangesDialog open={confirmExit} onStay={() => setConfirmExit(false)} onDiscard={onClose} />
      </div>
    </div>
  );
}
