import Order from "../models/Order.js";
import CustomerNotification from "../models/CustomerNotification.js";

const TIME_ZONE = "Asia/Manila";
const CHECK_INTERVAL_MS = 60_000;
let reminderTimer;
let checkInProgress = false;

const getManilaDateKey = (date) => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const getManilaDayWindow = (date) => {
  const dateKey = getManilaDateKey(date);
  const start = new Date(`${dateKey}T00:00:00+08:00`);
  return { dateKey, start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
};

const formatInspectionDate = (date) => new Intl.DateTimeFormat("en-PH", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "long",
  day: "numeric",
}).format(date);

export const runSiteInspectionReminderCheck = async ({ now = new Date(), realtime } = {}) => {
  const { dateKey, start, end } = getManilaDayWindow(now);
  const orders = await Order.find({
    customer: { $exists: true, $ne: null },
    inspection_status: "scheduled",
    inspection_date: { $gte: start, $lt: end },
    status: { $ne: "cancelled" },
  }).select("_id customer tracking inspection_date").lean();

  let created = 0;
  for (const order of orders) {
    const inspectionDateKey = getManilaDateKey(order.inspection_date);
    const eventKey = `site_inspection_today:${inspectionDateKey}`;
    const scheduledDate = formatInspectionDate(order.inspection_date);
    try {
      const result = await CustomerNotification.updateOne(
        { order: order._id, eventKey },
        { $setOnInsert: {
          customer: order.customer,
          order: order._id,
          eventKey,
          type: "site_inspection_today",
          title: "Site Inspection Scheduled for Today",
          message: `Reminder: your site inspection for order ${order.tracking || order._id} is scheduled for ${scheduledDate}.`,
          tracking: order.tracking || "",
          stageKey: "site_inspection",
          stageName: "Site Inspection",
        } },
        { upsert: true },
      );
      if (!result.upsertedCount && !result.upsertedId) continue;

      created += 1;
      realtime?.to(`user:${String(order.customer)}`).emit("realtime:changed", {
        id: `site-inspection-reminder:${String(order._id)}:${dateKey}`,
        type: "orders.notification",
        area: "orders",
        action: "notification",
        orderId: String(order._id),
        recordId: String(order._id),
        timestamp: now.toISOString(),
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  return { date: dateKey, examined: orders.length, created };
};

export const startSiteInspectionReminderScheduler = (realtime) => {
  if (reminderTimer) return;
  const check = async () => {
    if (checkInProgress) return;
    checkInProgress = true;
    try {
      const result = await runSiteInspectionReminderCheck({ realtime });
      if (result.created > 0) console.info(`Created ${result.created} site inspection reminder(s) for ${result.date}.`);
    } catch (error) {
      console.error("Site inspection reminder check failed:", error);
    } finally {
      checkInProgress = false;
    }
  };
  void check();
  reminderTimer = setInterval(check, CHECK_INTERVAL_MS);
  reminderTimer.unref?.();
};
