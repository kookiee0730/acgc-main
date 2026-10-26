import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Search,
  BookSearch,
  Pencil,
  Play,
} from "lucide-react";

import { getAdminOrders, updateOrderProgress, updateOrderStatus } from "@/api/orders";
import { subscribeToRealtime } from "@/lib/realtimeEvents";
import { formatDateToMMMDDYYYY } from "@/lib/dateUtils";
import { getProgressColor } from "@/lib/utils";
import { isProgressMonitorEligibleOrder } from "@/lib/orderWorkflow";
import toast, { Toaster } from "react-hot-toast";
import { uploadFiles } from "@/api/uploads";
import ProgressViewModal from "../../components/ProgressViewModal";
import ProgressEditModal from "../../components/ProgressEditModal";
import ProfileAvatar from "../../components/ui/ProfileAvatar";
import { useIsMobile } from "@/hooks/useIsMobile";

import Sidebar from "../../components/layout/Sidebar";
import Navbar from "../../components/layout/Navbar";
import AdminPageHeader from "../../components/layout/AdminPageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminTheme } from "@/contexts/AdminThemeContext";
import { recordActivity } from "@/lib/activityLog";
import { buildBatchProductTimelineStages, calculateStageProgressPercent, isInstallationDeadlineOverdue } from "@/lib/orderTimeline";

const normalizeStageStatus = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-");

const hasDelayedStage = (stages = []) =>
  Array.isArray(stages) &&
  stages.some(
    (stage) =>
      (!stage.completed && normalizeStageStatus(stage.status) === "delayed") ||
      (Array.isArray(stage.subStages) &&
        stage.subStages.some((sub) => !sub.completed && normalizeStageStatus(sub.status) === "delayed"))
  );

const CORE_STAGE_NAMES = new Set([
  "cutting",
  "assembly",
  "fabrication",
  "processing",
  "installation",
  "site-inspection",
]);

const hasAddedStages = (stages = []) =>
  Array.isArray(stages) &&
  stages.some((stage) => {
    const key = normalizeStageStatus(stage.key);
    const name = normalizeStageStatus(stage.name);
    const isAddedMainStage = Boolean(key || name)
      && !CORE_STAGE_NAMES.has(key)
      && !CORE_STAGE_NAMES.has(name);
    if (isAddedMainStage) return true;

    if (!Array.isArray(stage.subStages) || stage.subStages.length === 0) return false;
    const status = normalizeStageStatus(stage.status);
    const isCurrent = ["in-progress", "active", "current"].includes(status);
    const isDone = stage.completed === true || ["done", "completed"].includes(status);
    return !isCurrent && !isDone;
  });

export const buildStartedProgressStages = (stages = []) => {
  const stageDefinitions = [
    { key: "cutting", name: "Cutting" },
    { key: "assembly", name: "Assembly" },
    { key: "fabrication", name: "Fabrication" },
    { key: "installation", name: "Installation" },
  ];
  const existingStages = Array.isArray(stages) ? stages : [];

  return stageDefinitions.map(({ key, name }) => {
    const existingStage = existingStages.find((stage) => {
      const normalizedKey = normalizeStageStatus(stage.key);
      const normalizedName = normalizeStageStatus(stage.name);
      return normalizedKey === key || normalizedName === normalizeStageStatus(name);
    }) || existingStages.find((stage) =>
      normalizeStageStatus(stage.key || stage.name).includes(key)
    );
    const wasCompleted = existingStage?.completed === true ||
      ["done", "completed"].includes(normalizeStageStatus(existingStage?.status));

    return {
      ...(existingStage || {}),
      key,
      name,
      status: key === "cutting" ? "in_progress" : wasCompleted ? "done" : "pending",
      completed: key !== "cutting" && wasCompleted,
    };
  });
};

export const formatOrderStatus = (status, contractStatus) => {
  if (status === "completed") return "Completed";
  if (status === "site_inspection") return "Installation";
  if (status === "processing") return "Fabrication";
  if (status === "approved") return "Pending";
  if (status === "contract_accepted") return "Pending";
  if (status === "contract_sent") return "Pending";
  if (status === "admin_review") return "Pending";
  if (status === "order_submitted") return "Pending";
  if (status === "cancelled") return "Cancelled";
  return "Pending";
};

export const getProjectStatus = (order, stages = order?.progress_stages ?? []) => {
  if (Array.isArray(stages) && stages.length > 0) {
    const allCompleted = stages.every((stage) => {
      const stageCompleted = stage.completed === true || ["done", "completed"].includes(normalizeStageStatus(stage.status));
      const subStages = Array.isArray(stage.subStages) ? stage.subStages : [];
      return stageCompleted && subStages.every((subStage) =>
        subStage.completed === true || ["done", "completed"].includes(normalizeStageStatus(subStage.status))
      );
    });
    if (allCompleted) return "Completed";
  }

  const projectTimelineOrder = { ...order, progress_stages: stages, items: [{ progress_stages: stages }] };
  if (isInstallationDeadlineOverdue(projectTimelineOrder)) return "Delayed";

  if (hasDelayedStage(stages)) return "Delayed";

  const activeStage = Array.isArray(stages)
    ? stages.find((stage) => {
        const status = normalizeStageStatus(stage.status);
        return status === "in-progress" || status === "active";
      })
    : null;

  if (activeStage?.name) return activeStage.name;

  const nextStage = Array.isArray(stages)
    ? stages.find((stage) => {
        const status = normalizeStageStatus(stage.status);
        return ["pending", "not-started"].includes(status);
      })
    : null;

  if (nextStage?.name) return nextStage.name;

  const firstIncompleteStage = Array.isArray(stages)
    ? stages.find((stage) => {
        const stageCompleted = stage.completed === true || ["done", "completed"].includes(normalizeStageStatus(stage.status));
        const subStages = Array.isArray(stage.subStages) ? stage.subStages : [];
        return !stageCompleted || !subStages.every((subStage) =>
          subStage.completed === true || ["done", "completed"].includes(normalizeStageStatus(subStage.status))
        );
      })
    : null;
  if (firstIncompleteStage?.name) return firstIncompleteStage.name;

  return formatOrderStatus(order?.status, order?.contract_status);
};

const getStageProgressColor = (project) => {
  const status = String(project?.status || "").toLowerCase();

  if (status === "completed") return "bg-emerald-500";
  if (status === "installation") return "bg-sky-500";
  if (status === "fabrication" || status === "processing") return "bg-amber-500";
  if (status === "assembly") return "bg-blue-500";
  if (status === "cutting") return "bg-orange-500";
  if (status === "delayed") return "bg-rose-500";
  if (status === "accepted") return "bg-violet-500";
  if (status === "pending") return "bg-slate-400";

  const progress = Number(project?.progress) || 0;
  if (progress >= 70) return "bg-emerald-500";
  if (progress >= 31) return "bg-amber-500";
  return "bg-red-500";
};

const getProjectStatusBadgeClasses = (status, darkMode = false) => {
  const statusClasses = {
    pending: darkMode ? "border-slate-600 bg-slate-800 text-slate-200" : "border-slate-300 bg-slate-100 text-slate-700",
    cutting: darkMode ? "border-orange-800 bg-orange-950/50 text-orange-200" : "border-orange-200 bg-orange-100 text-orange-800",
    assembly: darkMode ? "border-blue-800 bg-blue-950/50 text-blue-200" : "border-blue-200 bg-blue-100 text-blue-800",
    fabrication: darkMode ? "border-amber-800 bg-amber-950/50 text-amber-200" : "border-amber-200 bg-amber-100 text-amber-800",
    installation: darkMode ? "border-sky-800 bg-sky-950/50 text-sky-200" : "border-sky-200 bg-sky-100 text-sky-800",
    completed: darkMode ? "border-emerald-800 bg-emerald-950/50 text-emerald-200" : "border-emerald-200 bg-emerald-100 text-emerald-800",
    delayed: darkMode ? "border-rose-800 bg-rose-950/50 text-rose-200" : "border-rose-200 bg-rose-100 text-rose-800",
    accepted: darkMode ? "border-violet-800 bg-violet-950/50 text-violet-200" : "border-violet-200 bg-violet-100 text-violet-800",
    cancelled: darkMode ? "border-rose-800 bg-rose-950/50 text-rose-200" : "border-rose-200 bg-rose-100 text-rose-800",
  };

  return statusClasses[normalizeStageStatus(status)] || "border-slate-300 bg-slate-100 text-slate-700";
};

const mapProgressFromStatus = (status, progress) => {
  // If API already provided a numeric progress, respect it but avoid showing 100%
  // for non-completed orders (cap at 90).
  if (typeof progress === "number") {
    return progress >= 100 && status !== "completed" ? 90 : progress;
  }

  if (status === "completed") return 100;
  if (status === "approved") return 0;
  if (status === "site_inspection") return 70;
  if (status === "processing") return 65;
  if (status === "contract_accepted") return 50;
  if (status === "contract_sent") return 25;
  return 15;
};

const formatClientType = (order) => {
  const rawType = (order.acceptance_method || order.order_type || "online_order").toString();
  return rawType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const buildProjectRows = (order) => {
  const orderId = order?._id || order?.id || "unknown-order";
  const items = Array.isArray(order?.items) && order.items.length > 0 ? order.items.filter(Boolean) : [null];

  return items.map((item, index) => {
    const stages = Array.isArray(item?.progress_stages) && item.progress_stages.length > 0
      ? item.progress_stages
      : order.progress_stages || [];
    const itemProgress = typeof item?.progress === "number" ? item.progress : null;
    const itemName =
      item?.name ||
      item?.product_name ||
      item?.product_id?.name ||
      item?.category ||
      order?.product_name ||
      order?.project_name ||
      "Project";

    const customerName =
      order.customer_name ||
      `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim() ||
      "Unknown";

    const projectTimelineOrder = { ...order, progress_stages: stages, items: [{ progress_stages: stages }] };

    return {
      id: item?._id || item?.id || `${orderId}-item-${index}`,
      orderId,
      client: customerName,
      clientEmail: order.customer?.email || order.customer_email || "",
      product: itemName,
      clientType: formatClientType(order),
      inspection: formatDateToMMMDDYYYY(order.inspection_date) ||
        (order.inspection_status && order.inspection_status !== "pending"
          ? order.inspection_status.charAt(0).toUpperCase() + order.inspection_status.slice(1)
          : "TBD"),
      installation: formatDateToMMMDDYYYY(order.estimated_installation_date) || "TBD",
      estimated_installation_date: order.estimated_installation_date,
      progress: stages.length > 0
        ? calculateStageProgressPercent(buildBatchProductTimelineStages(order, item || { progress_stages: stages }, index, { applyDeadlineDelay: false }))
        : itemProgress ?? mapProgressFromStatus(order.status, order.progress),
      isOverdue: isInstallationDeadlineOverdue(projectTimelineOrder),
      stages,
      status: getProjectStatus(order, stages),
      statusKey: order.status,
      contract_status: order.contract_status,
      payment_status: order.payment_status,
      inspection_status: order.inspection_status,
      inspection_date: order.inspection_date,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      contract_terms: order.contract_terms,
      progress_notes: item?.progress_notes ?? order.progress_notes ?? "",
      progress_audit: item?.progress_audit ?? order.progress_audit ?? [],
      rawOrder: order,
      itemIndex: index,
    };
  });
};

const getCurrentStageName = (stages = []) => {
  const list = Array.isArray(stages) ? stages : [];
  const active = list.find((stage) => !stage.completed && String(stage.status || "").toLowerCase() === "in_progress");
  const next = active || list.find((stage) => !stage.completed && !["done", "completed"].includes(String(stage.status || "").toLowerCase()));
  return next?.name || (list.length && list.every((stage) => stage.completed) ? "All stages complete" : "Not started");
};

const isSameProjectRow = (currentProject, targetProject) => {
  if (!currentProject || !targetProject) return false;

  if (currentProject.id && targetProject.id && currentProject.id === targetProject.id) {
    return true;
  }

  return (
    currentProject.orderId === targetProject.orderId &&
    currentProject.itemIndex === targetProject.itemIndex
  );
};

function ProgressMonitor() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { darkMode } = useAdminTheme();
  const canUploadProgressPhoto = user?.role !== "skilled_worker" || (
    user.staff_access?.modules?.progress_monitoring?.enabled === true &&
    user.staff_access.modules.progress_monitoring.actions?.upload_progress_photo === true
  );
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] =
    useState(() => {
      if (typeof window === "undefined") return true;
      const stored = localStorage.getItem("sidebarOpen");
      return stored !== null ? JSON.parse(stored) : true;
    });

  const [currentPage, setCurrentPage] =
    useState(1);

  useEffect(() => {
    localStorage.setItem("sidebarOpen", JSON.stringify(isSidebarOpen));
  }, [isSidebarOpen]);

  const [statusFilter, setStatusFilter] = useState(() => location.state?.statusFilter || "All");

  const [search, setSearch] =
    useState("");

  const [showEditModal, setShowEditModal] =
    useState(false);

  const [showViewModal, setShowViewModal] = useState(false);

  const [selectedProject, setSelectedProject] =
    useState(null);
  const selectedProjectRef = useRef(null);
  const showEditModalRef = useRef(false);

  useEffect(() => {
    selectedProjectRef.current = selectedProject;
  }, [selectedProject]);

  useEffect(() => {
    showEditModalRef.current = showEditModal;
  }, [showEditModal]);

  const [cancelConfirm, setCancelConfirm] = useState({ open: false, id: null });
  const [cancellingId, setCancellingId] = useState(null);
  const [startingProjectId, setStartingProjectId] = useState(null);
  const [startConfirm, setStartConfirm] = useState(null);

  const rowsPerPage = 10;

  const [projectList, setProjectList] = useState([]);
  const [projectLoading, setProjectLoading] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setProjectList((current) => current.map((project) => {
        const order = { ...(project.rawOrder || project), progress_stages: project.stages, items: [{ progress_stages: project.stages }] };
        const isOverdue = isInstallationDeadlineOverdue(order);
        const status = getProjectStatus(order, project.stages);
        return isOverdue === project.isOverdue && status === project.status
          ? project
          : { ...project, isOverdue, status };
      }));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const projectStatusOptions = [
    "All",
    "Pending",
    "Cutting",
    "Assembly",
    "Fabrication",
    "Installation",
    "Completed",
    "Delayed",
    "Added stages",
  ];
  const getProjectStatusCount = (status) => status === "Added stages"
    ? projectList.filter((project) => hasAddedStages(project.stages)).length
    : status === "All"
      ? projectList.length
      : projectList.filter((project) => project.status === status).length;

  const filteredProjects =
    projectList.filter((project) => {
      const matchSearch =
        project.client
          .toLowerCase()
          .includes(search.toLowerCase()) ||
        project.product
          .toLowerCase()
          .includes(search.toLowerCase());

      const matchStatus =
        statusFilter === "Added stages"
          ? hasAddedStages(project.stages)
          : statusFilter === "All"
          ? true
          : statusFilter === "Pending"
          ? project.status === "Pending"
          : project.status === statusFilter;

      return matchSearch && matchStatus;
    });

  const lastIndex =
    currentPage * rowsPerPage;

  const firstIndex =
    lastIndex - rowsPerPage;

  const currentProjects = isMobile
    ? filteredProjects
    : filteredProjects.slice(
      firstIndex,
      lastIndex
    );

  const totalPages = Math.max(1, Math.ceil(
    filteredProjects.length / rowsPerPage
  ));

  useEffect(() => {
    let active = true;
    let requestInFlight = false;
    let refreshPending = false;
    const fetchProjects = async (showLoading = true) => {
      if (requestInFlight) {
        if (!showLoading) refreshPending = true;
        return;
      }
      requestInFlight = true;
      if (showLoading) setProjectLoading(true);
      try {
        const response = await getAdminOrders({ module: "progress_monitoring" });
        if (!active) return;
        const orders = response.orders || [];
        const projects = orders
          .filter(isProgressMonitorEligibleOrder)
          .flatMap((order) => buildProjectRows(order));
        setProjectList(projects);
        if (!showEditModalRef.current && selectedProjectRef.current) {
          const selectedProjectUpdate = projects.find((project) => isSameProjectRow(project, selectedProjectRef.current));
          if (selectedProjectUpdate) {
            selectedProjectRef.current = selectedProjectUpdate;
            setSelectedProject(selectedProjectUpdate);
          }
        }
      } catch (error) {
        console.error("Failed to load progress monitor projects", error);
        if (active && showLoading) setProjectList([]);
      } finally {
        requestInFlight = false;
        if (active && showLoading) setProjectLoading(false);
        if (active && refreshPending) {
          refreshPending = false;
          fetchProjects(false);
        }
      }
    };

    fetchProjects();
    const unsubscribeRealtime = subscribeToRealtime("orders", () => {
      if (document.visibilityState === "visible") fetchProjects(false);
    });
    return () => {
      active = false;
      unsubscribeRealtime();
    };
  }, []);

  const handleSave = async (updated, fileContexts = [], onUploadProgress) => {
    let updatedProject = { ...updated };
    try {
      if (fileContexts && fileContexts.length > 0) {
        const files = fileContexts.map((ctx) => ctx.file);
        const res = await uploadFiles(files, onUploadProgress, { purpose: "progress-media" });
        const uploadedUrls = (res.files || []).map((f) => f.url).filter(Boolean);

        uploadedUrls.forEach((url, index) => {
          const context = fileContexts[index];
          if (typeof context.subIndex === "number") {
            updatedProject.stages[context.stageIndex].subStages[context.subIndex].images = [
              ...(updatedProject.stages[context.stageIndex].subStages[context.subIndex].images || []),
              url,
            ];
          } else {
            updatedProject.stages[context.stageIndex].images = [
              ...(updatedProject.stages[context.stageIndex].images || []),
              url,
            ];
          }
        });
      }

      const targetOrderId = updatedProject.orderId || updatedProject.id;
      if (targetOrderId) {
        const response = await updateOrderProgress(targetOrderId, {
          progress: updatedProject.progress,
          status: updatedProject.status,
          estimated_installation_date: updatedProject.installation,
          stages: updatedProject.stages,
          progress_notes: updatedProject.progress_notes || "",
          expectedUpdatedAt: updatedProject.rawOrder?.updatedAt || "",
          correctionReason: updatedProject.correctionReason || "",
          proof_images: [],
          ...(updatedProject.rawOrder?.items?.length > 1 ? { itemIndex: updatedProject.itemIndex } : {}),
        });
        recordActivity(user, `Updated progress for ${updatedProject.product} in order ${targetOrderId}.`, "Progress Monitor");

        if (response?.order) {
          const savedOrder = response.order;
          const savedItem = savedOrder.items?.[updatedProject.itemIndex];
          const savedStages = savedItem?.progress_stages?.length
            ? savedItem.progress_stages
            : savedOrder.progress_stages || [];
          updatedProject = {
            ...updatedProject,
            rawOrder: savedOrder,
            progress_notes: savedItem?.progress_notes ?? savedOrder.progress_notes ?? "",
            progress_audit: savedItem?.progress_audit ?? savedOrder.progress_audit ?? [],
            statusKey: savedOrder.status,
            contract_status: savedOrder.contract_status,
            payment_status: savedOrder.payment_status,
            inspection_status: savedOrder.inspection_status,
            inspection_date: savedOrder.inspection_date,
            installation: formatDateToMMMDDYYYY(savedOrder.estimated_installation_date) || "TBD",
            estimated_installation_date: savedOrder.estimated_installation_date,
            createdAt: savedOrder.createdAt,
            updatedAt: savedOrder.updatedAt,
            contract_terms: savedOrder.contract_terms,
            progress: typeof savedItem?.progress === "number"
              ? savedItem.progress
              : mapProgressFromStatus(savedOrder.status, savedOrder.progress),
            stages: savedStages,
            progress_stages: savedStages,
            status: getProjectStatus(savedOrder, savedStages),
          };
        }
      }

      setProjectList((items) =>
        items.map((item) =>
          isSameProjectRow(item, updatedProject)
            ? { ...item, ...updatedProject, id: item.id || updatedProject.id, orderId: item.orderId || updatedProject.orderId }
            : item
        )
      );
      setSelectedProject(updatedProject);
    } catch (err) {
      console.error("Failed to save progress", err);
      throw err;
    }
  };

  const handleStartProject = async (project) => {
    const targetOrderId = project.orderId || project.id;
    if (!targetOrderId) return;

    setStartingProjectId(project.id);
    try {
      const isBatchOrder = project.rawOrder?.items?.length > 1;
      const stages = buildStartedProgressStages(project.stages);
      const response = await updateOrderProgress(targetOrderId, {
        progress: 20,
        status: "Cutting",
        estimated_installation_date: project.estimated_installation_date || "",
        stages,
        proof_images: [],
        ...(isBatchOrder ? { itemIndex: project.itemIndex } : {}),
      });

      const savedOrder = response.order;
      const savedItem = savedOrder.items?.[project.itemIndex];
      const savedStages = savedItem?.progress_stages?.length
        ? savedItem.progress_stages
        : savedOrder.progress_stages?.length
          ? savedOrder.progress_stages
          : stages;
      const updatedProject = {
        ...project,
        rawOrder: savedOrder,
        statusKey: savedOrder.status,
        progress: typeof savedItem?.progress === "number"
          ? savedItem.progress
          : typeof savedOrder.progress === "number"
            ? savedOrder.progress
            : 20,
        stages: savedStages,
        progress_stages: savedStages,
        status: getProjectStatus(savedOrder, savedStages),
      };

      setProjectList((items) =>
        items.map((item) =>
          isSameProjectRow(item, updatedProject) ? { ...item, ...updatedProject } : item
        )
      );
      setCurrentPage(1);
      recordActivity(user, `Started project ${project.product} in order ${targetOrderId}.`, "Progress Monitor");
      toast.success("Project started at Cutting.");
      return true;
    } catch (error) {
      const serverError = error?.data?.error;
      const errorMessage = error?.data?.message || error?.message || "Unable to start project.";
      toast.error(serverError ? `${errorMessage}: ${serverError}` : errorMessage);
      return false;
    } finally {
      setStartingProjectId(null);
    }
  };

  const handleConfirmStartProject = async () => {
    if (!startConfirm) return;
    const started = await handleStartProject(startConfirm);
    if (started) setStartConfirm(null);
  };

  const handleTimelineOrderChange = (savedOrder) => {
    if (!savedOrder) return;
    const orderId = savedOrder._id || savedOrder.id || selectedProject?.orderId || selectedProject?.id;
    const updatedProject = {
      ...(selectedProject || {}),
      id: selectedProject?.id || orderId,
      orderId,
      client:
        savedOrder.customer_name ||
        `${savedOrder.customer?.first_name || ""} ${savedOrder.customer?.last_name || ""}`.trim() ||
        selectedProject?.client ||
        "Unknown",
      product:
        selectedProject?.product ||
        (savedOrder.items && savedOrder.items.length > 0
          ? savedOrder.items[0].name || savedOrder.items[0].category || "Project"
          : "Project"),
      inspection: formatDateToMMMDDYYYY(savedOrder.inspection_date) ||
        (savedOrder.inspection_status && savedOrder.inspection_status !== "pending"
          ? savedOrder.inspection_status.charAt(0).toUpperCase() + savedOrder.inspection_status.slice(1)
          : "TBD"),
      installation: formatDateToMMMDDYYYY(savedOrder.estimated_installation_date) || "TBD",
      estimated_installation_date: savedOrder.estimated_installation_date,
      progress: mapProgressFromStatus(savedOrder.status, savedOrder.progress),
      stages: savedOrder.progress_stages || [],
      progress_stages: savedOrder.progress_stages || [],
      status: getProjectStatus(savedOrder),
      statusKey: savedOrder.status,
      contract_status: savedOrder.contract_status,
      payment_status: savedOrder.payment_status,
      inspection_status: savedOrder.inspection_status,
      inspection_date: savedOrder.inspection_date,
      createdAt: savedOrder.createdAt,
      updatedAt: savedOrder.updatedAt,
      contract_terms: savedOrder.contract_terms,
      rawOrder: savedOrder,
    };

    setProjectList((items) =>
      items.map((item) =>
        isSameProjectRow(item, updatedProject)
          ? { ...item, ...updatedProject, id: item.id || updatedProject.id, orderId }
          : item
      )
    );
    setSelectedProject(updatedProject);
  };

  const closeCancelModal = () => setCancelConfirm({ open: false, id: null });

  const handleConfirmCancel = async () => {
    const orderId = cancelConfirm.id;
    setCancelConfirm({ open: false, id: null });
    if (!orderId) return;
    const prev = projectList.find((p) => (p.orderId || p.id) === orderId && p.itemIndex === selectedProject?.itemIndex);
    const prevStatus = prev?.statusKey || prev?.status || null;
    try {
      setCancellingId(orderId);
      const res = await updateOrderStatus(orderId, { status: "cancelled" });
      recordActivity(user, `Cancelled project ${orderId}.`, "Progress Monitor");
      if (res && res.order) {
        const saved = res.order;
        setProjectList((prevList) =>
          prevList.map((p) =>
            isSameProjectRow(p, prev)
              ? {
                  ...p,
                  rawOrder: saved,
                  statusKey: saved.status,
                  contract_status: saved.contract_status,
                  payment_status: saved.payment_status,
                  inspection_status: saved.inspection_status,
                  inspection_date: saved.inspection_date,
                  createdAt: saved.createdAt,
                  updatedAt: saved.updatedAt,
                  contract_terms: saved.contract_terms,
                  progress: mapProgressFromStatus(saved.status, saved.progress),
                  stages: saved.progress_stages || [],
                  progress_stages: saved.progress_stages || [],
                  status: getProjectStatus(saved),
                }
              : p
          )
        );

        toast((t) => (
          <div className="flex items-center justify-between gap-4">
            <div>Order cancelled</div>
            <div className="flex items-center gap-2">
              {prevStatus && (
                <button
                  onClick={async () => {
                    toast.dismiss(t.id);
                    try {
                      const undoRes = await updateOrderStatus(orderId, { status: prevStatus });
                      if (undoRes && undoRes.order) {
                        const restored = undoRes.order;
                        setProjectList((prevList) =>
                          prevList.map((p) =>
                            p.id === orderId
                              ? {
                                  ...p,
                                  rawOrder: restored,
                                  statusKey: restored.status,
                                  contract_status: restored.contract_status,
                                  payment_status: restored.payment_status,
                                  inspection_status: restored.inspection_status,
                                  inspection_date: restored.inspection_date,
                                  createdAt: restored.createdAt,
                                  updatedAt: restored.updatedAt,
                                  contract_terms: restored.contract_terms,
                                  progress: mapProgressFromStatus(restored.status, restored.progress),
                                  stages: restored.progress_stages || [],
                                  progress_stages: restored.progress_stages || [],
                                  status: getProjectStatus(restored),
                                }
                              : p
                          )
                        );
                        toast.success("Order restored");
                      }
                    } catch (e) {
                      console.error("Failed to restore order", e);
                      toast.error("Failed to restore order");
                    }
                  }}
                  className="text-sm text-blue-600"
                >
                  Undo
                </button>
              )}
            </div>
          </div>
        ), { duration: 6000 });
      } else {
        // fallback: mark locally
        setProjectList((prevList) => prevList.map((p) => (isSameProjectRow(p, prev) ? { ...p, status: "Cancelled", statusKey: "cancelled" } : p)));
        toast((t) => (
          <div className="flex items-center justify-between gap-4">
            <div>Order cancelled</div>
            <div className="flex items-center gap-2">
              {prevStatus && (
                <button
                  onClick={async () => {
                    toast.dismiss(t.id);
                    try {
                      const undoRes = await updateOrderStatus(orderId, { status: prevStatus });
                      if (undoRes && undoRes.order) {
                        const restored = undoRes.order;
                        setProjectList((prevList) =>
                          prevList.map((p) =>
                            (p.orderId || p.id) === orderId
                              ? {
                                  ...p,
                                  rawOrder: restored,
                                  statusKey: restored.status,
                                  contract_status: restored.contract_status,
                                  payment_status: restored.payment_status,
                                  inspection_status: restored.inspection_status,
                                  inspection_date: restored.inspection_date,
                                  createdAt: restored.createdAt,
                                  updatedAt: restored.updatedAt,
                                  contract_terms: restored.contract_terms,
                                  progress: mapProgressFromStatus(restored.status, restored.progress),
                                  stages: restored.progress_stages || [],
                                  progress_stages: restored.progress_stages || [],
                                  status: getProjectStatus(restored),
                                }
                              : p
                          )
                        );
                        toast.success("Order restored");
                      }
                    } catch (e) {
                      console.error("Failed to restore order", e);
                      toast.error("Failed to restore order");
                    }
                  }}
                  className="text-sm text-blue-600"
                >
                  Undo
                </button>
              )}
            </div>
          </div>
        ), { duration: 6000 });
      }
    } catch (err) {
      console.error("Failed to cancel order", err);
      toast.error(err?.data?.message || err?.message || "Failed to cancel order.");
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className={`flex h-screen overflow-hidden ${darkMode ? "bg-[#07111f] text-slate-100" : "bg-gray-100 text-slate-900"}`}>
      <Toaster position="bottom-right" />
      <Sidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen((open) => !open)} />

      <div className="flex-1 min-h-0 flex flex-col">
        <Navbar />

        <main className="flex-1 min-h-0 overflow-y-auto p-6 !pb-[calc(10rem+env(safe-area-inset-bottom))] sm:!pb-[calc(10rem+env(safe-area-inset-bottom))] lg:!pb-24">

          <AdminPageHeader
            title="Progress Monitor"
            description="Monitor fabrication and installation progress."
            statsClassName="grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-3"
            stats={[
              { label: "Total Projects", value: projectList.length, color: "text-blue-200" },
              { label: "In Progress", value: projectList.filter((project) => project.progress < 100 && project.status !== "Cancelled").length, color: "text-amber-200" },
              { label: "Completed", value: projectList.filter((project) => project.status === "Completed" || project.progress >= 100).length, color: "text-emerald-300" },
            ]}
          />

          {/* FILTERS */}

          <div className={`mt-6 rounded-3xl border p-6 shadow ${darkMode ? "border-slate-700 bg-[#10243a]" : "border-slate-200 bg-white"}`}>

            <div className="relative">
              <Search
                size={18}
                className={`absolute left-4 top-4 ${darkMode ? "text-slate-400" : "text-gray-400"}`}
              />

              <input
                type="text"
                placeholder="Search client or product..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className={`w-full rounded-xl border py-3 pl-12 pr-4 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 ${darkMode ? "border-slate-600 bg-[#172d45] text-slate-100 placeholder:text-slate-400" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"}`}
              />
            </div>

            <div className="mt-4 md:hidden">
              <select
                aria-label="Project status category"
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setCurrentPage(1);
                }}
                className={`w-full rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 ${darkMode ? "border-slate-600 bg-[#172d45] text-slate-100" : "border-gray-200 bg-white text-gray-700"}`}
              >
                {projectStatusOptions.map((status) => (
                <option key={status} value={status}>{status} ({getProjectStatusCount(status)})</option>
                ))}
              </select>
            </div>

            <div className="mt-4 hidden max-w-full flex-wrap gap-1.5 md:flex" role="tablist" aria-label="Filter projects by status">
              {projectStatusOptions.map((status) => (
                <button
                  key={status}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === status}
                  onClick={() => {
                    setStatusFilter(status);
                    setCurrentPage(1)
                  }}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 ${statusFilter === status ? (darkMode ? "border-red-700 bg-red-950/60 text-red-100 shadow-sm" : "border-red-200 bg-red-50 text-red-950 shadow-sm") : (darkMode ? "border-slate-600 bg-[#172d45] text-slate-300 shadow-sm hover:bg-slate-700 hover:text-white" : "border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900")}`}
                >
                  {status}
                  <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] tabular-nums ${statusFilter === status ? (darkMode ? "bg-red-800 text-red-50" : "bg-red-200 text-red-900") : (darkMode ? "bg-slate-700 text-slate-300" : "bg-slate-200 text-slate-700")}`}>
                    {getProjectStatusCount(status)}
                  </span>
                </button>
              ))}
            </div>

          </div>

          {/* TABLE */}

          <div className={`mt-6 overflow-hidden rounded-3xl border shadow ${darkMode ? "border-slate-700 bg-[#0d2033]" : "border-slate-200 bg-white"}`}>
            <div className="hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className={darkMode ? "bg-[#10243a] text-slate-300" : "bg-gray-50 text-slate-600"}>
                    <tr>
                      <th className="p-4 text-left">Client</th>
                      <th className="p-4 text-left">Client Type</th>
                      <th className="p-4 text-left">Product</th>
                      <th className="p-4 text-left">Site Inspection</th>
                      <th className="p-4 text-left">Est. Installation</th>
                      <th className="p-4 text-left">Progress</th>
                      {statusFilter === "All" && <th className="p-4 text-left">Status</th>}
                      <th className="p-4 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectLoading && (
                      <tr>
                        <td className={`p-6 text-center ${darkMode ? "text-slate-400" : "text-gray-500"}`} colSpan={statusFilter === "All" ? 8 : 7}>
                          Loading projects...
                        </td>
                      </tr>
                    )}
                    {!projectLoading && currentProjects.map((project, index) => (
                      <tr key={index} className={`border-t ${darkMode ? "border-slate-700 text-slate-200 hover:bg-slate-800/70" : "border-slate-200 text-slate-700 hover:bg-gray-50"}`}>
                        <td className="p-4"><ProfileAvatar name={project.client} email={project.clientEmail} /></td>
                        <td className="p-4">{project.clientType}</td>
                        <td className="p-4">{project.product}</td>
                        <td className="p-4">{project.inspection}</td>
                        <td className="p-4">{project.installation}</td>
                        <td className="p-4">
                          <div className={`h-3 w-full rounded-full ${darkMode ? "bg-slate-700" : "bg-gray-200"}`}>
                            {(() => {
                              const progressColor = getStageProgressColor(project);
                              return (
                                <div className={`h-3 rounded-full ${progressColor}`} style={{ width: `${project.progress}%` }} />
                              );
                            })()}
                          </div>
                          <span className="font-semibold text-sm">{project.progress}%</span>
                          <p className={`mt-1 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Current: {getCurrentStageName(project.stages)}</p>
                          {project.isOverdue && <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${darkMode ? "bg-rose-950/60 text-rose-200" : "bg-rose-100 text-rose-800"}`}>Project Overdue</span>}
                        </td>
                        {statusFilter === "All" && <td className="p-4"><span className={`rounded-full px-3 py-1 ${darkMode ? "bg-slate-800 text-slate-200" : "bg-gray-100 text-slate-700"}`}>{project.status}</span></td>}
                        <td className="py-3 pl-4 pr-6">
                          <div className="flex justify-end gap-2.5">
                            <button onClick={() => { setSelectedProject(project); setShowViewModal(true); }} className={`rounded-lg p-2 ${darkMode ? "bg-blue-950/60 text-blue-300 hover:bg-blue-900/70" : "bg-blue-100 text-blue-600"}`} aria-label={`View ${project.product} progress`}>
                              <BookSearch size={18} />
                            </button>
                            {project.status === "Pending" ? (
                              <button onClick={() => setStartConfirm(project)} disabled={startingProjectId === project.id} className={`rounded-lg p-2 disabled:cursor-wait disabled:opacity-50 ${darkMode ? "bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/70" : "bg-emerald-100 text-emerald-700"}`} title="Start project at Cutting" aria-label={`Start ${project.product} at Cutting`}>
                                <Play size={18} />
                              </button>
                            ) : (
                              <button onClick={() => { setSelectedProject(project); setShowEditModal(true); }} className={`rounded-lg p-2 ${darkMode ? "bg-amber-950/60 text-amber-300 hover:bg-amber-900/70" : "bg-yellow-100 text-yellow-600"}`}>
                                <Pencil size={18} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!projectLoading && currentProjects.length === 0 && (
                      <tr>
                        <td className={`p-6 text-center ${darkMode ? "text-slate-400" : "text-gray-500"}`} colSpan={8}>No projects found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3 p-3 md:hidden">
              {projectLoading ? (
                <div className={`rounded-2xl border border-dashed p-6 text-center text-sm ${darkMode ? "border-slate-700 text-slate-400" : "border-gray-200 text-gray-500"}`}>Loading projects...</div>
              ) : currentProjects.length === 0 ? (
                <div className={`rounded-2xl border border-dashed p-6 text-center text-sm ${darkMode ? "border-slate-700 text-slate-400" : "border-gray-200 text-gray-500"}`}>No projects found.</div>
              ) : currentProjects.map((project) => (
                <div key={project.id || project.client + project.product} className={`rounded-2xl border p-3 ${darkMode ? "border-slate-700 bg-[#10243a]" : "border-gray-200 bg-gray-50"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-bold ${darkMode ? "text-slate-100" : "text-gray-900"}`}>{project.product}</p>
                      <p className={`mt-1 text-xs ${darkMode ? "text-slate-400" : "text-gray-500"}`}>{project.client}</p>
                    </div>
                    <div className="flex max-w-[52%] flex-wrap justify-end gap-1.5">
                      {hasAddedStages(project.stages) && (
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${darkMode ? "border-violet-800 bg-violet-950/50 text-violet-200" : "border-violet-200 bg-violet-100 text-violet-800"}`}>
                          Added stages
                        </span>
                      )}
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${getProjectStatusBadgeClasses(project.status, darkMode)}`}>
                        {project.status}
                      </span>
                    </div>
                  </div>
                  <div className={`mt-3 grid grid-cols-2 gap-2 text-xs ${darkMode ? "text-slate-300" : "text-gray-600"}`}>
                    <div>
                      <p className={`text-[10px] uppercase tracking-wide ${darkMode ? "text-slate-500" : "text-gray-400"}`}>Type</p>
                      <p className={`mt-1 font-medium ${darkMode ? "text-slate-200" : "text-gray-700"}`}>{project.clientType}</p>
                    </div>
                    <div>
                      <p className={`text-[10px] uppercase tracking-wide ${darkMode ? "text-slate-500" : "text-gray-400"}`}>Progress</p>
                      <p className={`mt-1 font-semibold ${darkMode ? "text-slate-100" : "text-gray-900"}`}>{project.progress}%</p>
                      <p className={`mt-1 text-[11px] ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Current: {getCurrentStageName(project.stages)}</p>
                      {project.isOverdue && <p className="mt-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300">Project Overdue</p>}
                    </div>
                    <div>
                      <p className={`text-[10px] uppercase tracking-wide ${darkMode ? "text-slate-500" : "text-gray-400"}`}>Inspection</p>
                      <p className={`mt-1 font-medium ${darkMode ? "text-slate-200" : "text-gray-700"}`}>{project.inspection}</p>
                    </div>
                    <div>
                      <p className={`text-[10px] uppercase tracking-wide ${darkMode ? "text-slate-500" : "text-gray-400"}`}>Install</p>
                      <p className={`mt-1 font-medium ${darkMode ? "text-slate-200" : "text-gray-700"}`}>{project.installation}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-2.5 pr-1">
                    <button onClick={() => { setSelectedProject(project); setShowViewModal(true); }} className={`rounded-lg p-2 ${darkMode ? "bg-blue-950/60 text-blue-300 hover:bg-blue-900/70" : "bg-blue-100 text-blue-600"}`} aria-label={`View ${project.product} progress`}>
                      <BookSearch size={18} />
                    </button>
                    {project.status === "Pending" ? (
                      <button onClick={() => setStartConfirm(project)} disabled={startingProjectId === project.id} className={`rounded-lg p-2 disabled:cursor-wait disabled:opacity-50 ${darkMode ? "bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/70" : "bg-emerald-100 text-emerald-700"}`} title="Start project at Cutting" aria-label={`Start ${project.product} at Cutting`}>
                        <Play size={18} />
                      </button>
                    ) : (
                      <button onClick={() => { setSelectedProject(project); setShowEditModal(true); }} className={`rounded-lg p-2 ${darkMode ? "bg-amber-950/60 text-amber-300 hover:bg-amber-900/70" : "bg-yellow-100 text-yellow-600"}`}>
                        <Pencil size={18} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* PAGINATION */}

            <div className={`hidden items-center justify-center gap-4 border-t p-4 md:flex ${darkMode ? "border-slate-700 bg-[#10243a] text-slate-300" : "border-gray-200 bg-gray-50 text-slate-700"}`}>

              <span>
                Page {currentPage} of {totalPages}
              </span>

              <div className="flex gap-2">

                <button
                  disabled={currentPage === 1}
                  onClick={() =>
                    setCurrentPage(currentPage - 1)
                  }
                  className={`rounded-lg border px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50 ${darkMode ? "border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}
                >
                  Previous
                </button>

                {[...Array(totalPages)].map(
                  (_, index) => (
                    <button
                      key={index}
                      onClick={() =>
                        setCurrentPage(index + 1)
                      }
                      className={`w-10 h-10 rounded-lg ${
                        currentPage === index + 1
                          ? "bg-red-700 text-white shadow-sm"
                          : darkMode ? "border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {index + 1}
                    </button>
                  )
                )}

                <button
                  disabled={
                    currentPage === totalPages
                  }
                  onClick={() =>
                    setCurrentPage(currentPage + 1)
                  }
                  className={`rounded-lg border px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50 ${darkMode ? "border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}
                >
                  Next
                </button>

              </div>

            </div>

          </div>

          {showViewModal && selectedProject && (
            <ProgressViewModal
              project={selectedProject}
              onClose={() => setShowViewModal(false)}
              onOrderChange={handleTimelineOrderChange}
            />
          )}

          {showEditModal && selectedProject && (
            <ProgressEditModal project={selectedProject} onClose={() => setShowEditModal(false)} onSave={handleSave} canUploadProgressPhoto={canUploadProgressPhoto} />
          )}

          {cancelConfirm.open && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="absolute inset-0" />
              <div className={`relative w-full max-w-md rounded-3xl p-6 shadow-lg ${darkMode ? "bg-[#132238] text-slate-100" : "bg-white text-slate-900"}`}>
                <h2 className="text-2xl font-bold mb-2">Confirm Cancel</h2>
                <p className={`mb-6 text-sm ${darkMode ? "text-slate-300" : "text-slate-600"}`}>Are you sure you want to cancel this project/order? This action will mark the order as cancelled.</p>
                <div className="flex justify-end gap-3">
                  <button onClick={closeCancelModal} className={`rounded-lg px-4 py-2 transition ${darkMode ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-gray-100 text-slate-700 hover:bg-gray-200"}`}>Close</button>
                  <button onClick={handleConfirmCancel} disabled={cancellingId === cancelConfirm.id} className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                    {cancellingId === cancelConfirm.id ? "Cancelling..." : "Confirm Cancel"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {startConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-start-project-title"
                className={`relative w-full max-w-md rounded-3xl p-6 shadow-lg ${darkMode ? "bg-[#132238] text-slate-100" : "bg-white text-slate-900"}`}
              >
                <h2 id="confirm-start-project-title" className="mb-2 text-2xl font-bold">Start Project</h2>
                <p className={`mb-6 text-sm ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                  Start {startConfirm.product} at Cutting? This will move the project into production.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setStartConfirm(null)}
                    disabled={startingProjectId === startConfirm.id}
                    className={`rounded-lg px-4 py-2 transition disabled:cursor-not-allowed disabled:opacity-50 ${darkMode ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-gray-100 text-slate-700 hover:bg-gray-200"}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmStartProject}
                    disabled={startingProjectId === startConfirm.id}
                    className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-50"
                  >
                    {startingProjectId === startConfirm.id ? "Starting..." : "Confirm Start"}
                  </button>
                </div>
              </section>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

export default ProgressMonitor;
