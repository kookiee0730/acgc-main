export const normalizeOrderStatus = (value) => {
  if (value === null || value === undefined) return "";
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const isOrderStatusCompleted = (order) => normalizeOrderStatus(order?.status) === "completed";

export const normalizeOrderStatusKey = (value) => normalizeOrderStatus(value).replace(/\s+/g, "_");

const toTitleCase = (text) =>
  String(text || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => (word.length ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(" ");

export const getOrderStatusLabel = (status) => {
  const normalized = normalizeOrderStatus(status);
  switch (normalized) {
    case "order submitted":
      return "Order Submitted";
    case "admin review":
      return "Admin Review";
    case "site inspection":
      return "Site Inspection";
    case "contract sent":
      return "Awaiting Contract Sign-off";
    case "contract accepted":
      return "Contract Accepted";
    case "contract declined":
      return "Contract Declined";
    case "cutting":
      return "Cutting";
    case "fabrication":
      return "Fabrication";
    case "installation":
      return "Installation";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return toTitleCase(status) || "Unknown";
  }
};

export const getOrderStatusClasses = (status) => {
  const normalized = normalizeOrderStatus(status);
  switch (normalized) {
    case "completed":
      return "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30";
    case "awaiting contract sign off":
    case "contract sent":
      return "bg-sky-50 text-sky-800 border border-sky-200";
    case "awaiting payment":
      return "bg-amber-50 text-amber-800 border border-amber-200";
    case "contract declined":
    case "cancelled":
      return "bg-red-100 text-red-800 border border-red-300";
    case "order submitted":
    case "admin review":
    case "site inspection":
    case "contract sent":
    case "contract accepted":
    case "cutting":
    case "assembly":
    case "fabrication":
    case "installation":
      return "bg-red-50 text-red-700 border border-red-200";
    default:
      return "bg-slate-100 text-slate-700 border border-slate-200";
  }
};

const formatInspectionDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export const getSiteInspectionNotificationMessage = (order = {}) => {
  const inspectionStatus = normalizeOrderStatus(order?.inspection_status);
  const inspectionDate =
    order?.inspection_date ||
    order?.inspectionDate ||
    order?.site_inspection_date ||
    order?.scheduledInspectionDate;

  if (inspectionStatus === "completed" || order?.inspection_completed_at || order?.inspectionCompletedAt) {
    return "Your site inspection has been completed.";
  }

  if (inspectionDate) {
    const formattedDate = formatInspectionDate(inspectionDate);
    return formattedDate
      ? `Your site inspection has been scheduled for ${formattedDate}.`
      : "Your site inspection has been scheduled.";
  }

  return "Your order request has been received. Our team will contact you to arrange a site inspection.";
};

export const getAdminSiteInspectionNotificationMessage = (order = {}, customerName = "Customer") => {
  const inspectionStatus = normalizeOrderStatus(order?.inspection_status);
  const inspectionDate =
    order?.inspection_date ||
    order?.inspectionDate ||
    order?.site_inspection_date ||
    order?.scheduledInspectionDate;

  if (inspectionStatus === "completed" || order?.inspection_completed_at || order?.inspectionCompletedAt) {
    return `Site inspection for ${customerName} has been completed.`;
  }

  if (inspectionDate) {
    const formattedDate = formatInspectionDate(inspectionDate);
    return formattedDate
      ? `Site inspection scheduled for ${customerName} on ${formattedDate}.`
      : `Site inspection scheduled for ${customerName}.`;
  }

  return `Site inspection is pending for ${customerName}.`;
};

export const getCustomerOrderNotificationMessage = (order = {}) => {
  const status = normalizeOrderStatusKey(order?.status);
  const contractStatus = normalizeOrderStatusKey(order?.contract_status);
  const inspectionStatus = normalizeOrderStatus(order?.inspection_status);
  const inspectionDate =
    order?.inspection_date ||
    order?.inspectionDate ||
    order?.site_inspection_date ||
    order?.scheduledInspectionDate;

  if (inspectionStatus === "completed" || order?.inspection_completed_at || order?.inspectionCompletedAt) {
    return "Your site inspection has been completed.";
  }

  if (status === "contract_accepted" || contractStatus === "accepted") {
    return "Your contract has been accepted successfully. Your order is now awaiting admin transaction approval.";
  }

  if (status === "contract_sent" || contractStatus === "sent") {
    return "Your contract has been sent for your review and acceptance.";
  }

  if (status === "order_submitted") {
    return "Your order has been submitted successfully and is awaiting admin review.";
  }

  if (status === "admin_review") {
    return "Your order is currently under admin review.";
  }

  if (status === "site_inspection") {
    if (inspectionDate) {
      const formattedDate = formatInspectionDate(inspectionDate);
      return formattedDate
        ? `Your site inspection has been scheduled for ${formattedDate}.`
        : "Your site inspection has been scheduled.";
    }
    return getSiteInspectionNotificationMessage(order);
  }

  if (status === "fabrication") {
    return "Your project is currently in fabrication.";
  }

  if (status === "installation") {
    return "Your project installation is currently in progress.";
  }

  if (status === "completed") {
    return "Your project has been completed successfully!";
  }

  if (status === "cancelled" || status === "contract_declined" || contractStatus === "declined") {
    return "Your order has been cancelled.";
  }

  return `Order status: ${getOrderStatusLabel(order.status)}`;
};
