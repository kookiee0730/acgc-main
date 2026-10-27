const isDelayed = (stage) => String(stage?.status || "").toLowerCase() === "delayed";

export const buildDelayNotifications = (order) => {
  if (!order) return [];

  const orderId = order._id || order.id || order.tracking || "order";
  const items = Array.isArray(order.items) ? order.items : [];
  const hasItemProgressStages = items.some((item) => Array.isArray(item?.progress_stages) && item.progress_stages.length > 0);
  const sources = hasItemProgressStages
    ? items.flatMap((item, itemIndex) => (item.progress_stages || []).map((stage, stageIndex) => ({
        stage,
        itemIndex,
        stageIndex,
        productName: item.name || item.product_name || `Project item ${itemIndex + 1}`,
      })))
    : (Array.isArray(order.progress_stages) ? order.progress_stages : []).map((stage, stageIndex) => ({
        stage,
        itemIndex: null,
        stageIndex,
        productName: items[0]?.name || items[0]?.product_name || "Project",
      }));

  const stageNotifications = sources.flatMap(({ stage, itemIndex, stageIndex, productName }) => {
    const history = Array.isArray(stage.delayHistory) && stage.delayHistory.length > 0
      ? stage.delayHistory
      : isDelayed(stage)
        ? [{
            reason: stage.delayReason,
            notes: stage.delayNotes,
            expectedResolution: stage.delayExpectedResolution,
            reportedAt: stage.delayReportedAt,
            status: "delayed",
          }]
        : [];

    return history
      .filter((entry) => !entry.status || String(entry.status).toLowerCase() === "delayed")
      .map((entry, entryIndex) => {
        const stageName = stage.name || stage.key || `Stage ${stageIndex + 1}`;
        const reportedAt = entry.reportedAt || stage.delayReportedAt || order.updatedAt || order.createdAt;
        const isCurrentDelay = isDelayed(stage) && entryIndex === history.length - 1;
        const timestamp = reportedAt && Number.isFinite(new Date(reportedAt).getTime())
          ? new Date(reportedAt).getTime()
          : `${stageName}-${entry.reason || entryIndex}`;

        return {
          ...order,
          notificationType: "delay",
          notificationId: `${orderId}-delay-${itemIndex ?? "order"}-${stage.key || stageIndex}-${timestamp}`,
          notificationDate: isCurrentDelay ? order.updatedAt || reportedAt : reportedAt,
          delayReportedAt: reportedAt,
          delayStageName: stageName,
          delayStageKey: stage.key || `stage-${stageIndex + 1}`,
          delayItemIndex: itemIndex,
          delayReason: entry.reason || stage.delayReason || "",
          delayNotes: entry.notes || stage.delayNotes || "",
          delayExpectedResolution: entry.expectedResolution || stage.delayExpectedResolution || null,
          delayProductName: productName,
        };
      });
  });
  const projectDelayHistory = Array.isArray(order.project_delay?.history) ? order.project_delay.history : [];
  const projectNotifications = projectDelayHistory.map((entry, index) => ({
    ...order,
    notificationType: "project_delay",
    title: entry.status === "resolved" ? "Project delay resolved" : "Project delay reported",
    notificationId: `${orderId}-project-delay-${entry.id || entry.requestId || entry.at || index}`,
    notificationDate: entry.at || order.updatedAt || order.createdAt,
    delayReportedAt: entry.at || order.updatedAt || order.createdAt,
    delayStageName: "Project",
    delayReason: entry.reason || "",
    delayProposedDate: entry.proposedRevisedDate || null,
    delayStatus: entry.status === "resolved" ? "Resolved" : "Delayed",
    delayResolved: entry.status === "resolved",
  }));
  return [...stageNotifications, ...projectNotifications];
};

export const sortCustomerNotificationsNewestFirst = (first, second) => {
  const toTimestamp = (value) => {
    const timestamp = value ? new Date(value).getTime() : 0;
    return Number.isFinite(timestamp) ? timestamp : 0;
  };
  const firstDate = toTimestamp(first.notificationDate || first.updatedAt || first.createdAt);
  const secondDate = toTimestamp(second.notificationDate || second.updatedAt || second.createdAt);
  const dateDifference = secondDate - firstDate;
  if (dateDifference !== 0) return dateDifference;

  if (first.notificationType === "delay" && second.notificationType !== "delay") return -1;
  if (second.notificationType === "delay" && first.notificationType !== "delay") return 1;

  if (first.notificationType === "delay" && second.notificationType === "delay") {
    return new Date(second.delayReportedAt || 0).getTime() - new Date(first.delayReportedAt || 0).getTime();
  }

  return 0;
};
