const BUSINESS_TIME_ZONE = "Asia/Manila";

const getBusinessDateKey = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const fields = Object.fromEntries(new Intl.DateTimeFormat("en", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).map(({ type, value: part }) => [type, part]));
  return `${fields.year}-${fields.month}-${fields.day}`;
};

const isStageComplete = (stage) => {
  const completed = stage?.completed === true || ["done", "completed"].includes(String(stage?.status || "").toLowerCase());
  return completed && (stage?.subStages || []).every((sub) => (
    sub?.completed === true || ["done", "completed"].includes(String(sub?.status || "").toLowerCase())
  ));
};

export const isOrderScheduleOverdue = (order, now = new Date()) => {
  if (!order?.estimated_installation_date || ["completed", "cancelled"].includes(String(order.status || "").toLowerCase())) return false;
  const itemStages = Array.isArray(order.items) && order.items.length > 1
    ? order.items.map((item) => item?.progress_stages?.length ? item.progress_stages : order.progress_stages?.length ? order.progress_stages : [])
    : [order.progress_stages?.length ? order.progress_stages : order.items?.[0]?.progress_stages || []];
  const populatedStageSets = itemStages.filter((stages) => stages.length > 0);
  const allStagesComplete = populatedStageSets.length > 0 && populatedStageSets.every((stages) => stages.every(isStageComplete));
  if (allStagesComplete) return false;
  const deadline = getBusinessDateKey(order.estimated_installation_date);
  const today = getBusinessDateKey(now);
  return Boolean(deadline && today && deadline <= today);
};

export const attachOrderScheduleOverdue = (order, now) => {
  if (!order) return order;
  const responseOrder = typeof order.toObject === "function" ? order.toObject() : order;
  responseOrder.schedule_overdue = isOrderScheduleOverdue(responseOrder, now);
  return responseOrder;
};
