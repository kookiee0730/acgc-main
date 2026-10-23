import Order from "../models/Order.js";
import CustomerNotification from "../models/CustomerNotification.js";
import { sendOrderNotification } from "./orderEmails.js";
import { getOrderPaymentAmounts } from "./paymentLedger.js";

const TIME_ZONE = "Asia/Manila";
const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const EMAIL_RETRY_MS = 15 * 60 * 1000;
const EMAIL_STALE_MS = 30 * 60 * 1000;
let timer;
let checkInProgress = false;

const getDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const getDayNumber = (dateKey) => {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

const stagesFor = (order) => [
  ...(Array.isArray(order?.progress_stages) ? order.progress_stages : []),
  ...(Array.isArray(order?.items) ? order.items.flatMap((item) => item?.progress_stages || []) : []),
];

const installationStagesFor = (order) => stagesFor(order).filter((stage) => {
  const key = String(stage?.key || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const name = String(stage?.name || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return key === "installation" || name === "installation";
});

const stageIsComplete = (stage) => (
  stage?.completed === true
  || ["done", "completed"].includes(String(stage?.status || "").toLowerCase())
) && (Array.isArray(stage?.subStages) ? stage.subStages : []).every((subStage) => (
  subStage?.completed === true || ["done", "completed"].includes(String(subStage?.status || "").toLowerCase())
));

const getInstallationState = (order) => {
  const stages = installationStagesFor(order);
  const orderCompleted = String(order?.status || "").toLowerCase() === "completed" || Number(order?.progress) >= 100;
  if (stages.length) {
    const completedStages = stages.filter(stageIsComplete);
    const completed = orderCompleted || completedStages.length === stages.length;
    return {
      completed,
      completedAt: completed
        ? completedStages.map((stage) => stage.installationCompletedAt || stage.date).filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || order.updatedAt
        : null,
      scheduledDate: stages.map((stage) => stage.proposedInstallationDate || stage.date).filter(Boolean).sort((a, b) => new Date(a) - new Date(b))[0] || order.estimated_installation_date,
    };
  }
  return {
    completed: orderCompleted,
    completedAt: orderCompleted ? order.updatedAt : null,
    scheduledDate: order?.estimated_installation_date || null,
  };
};

const getEligibleReminder = (order, now) => {
  if (!order?.customer || /^(cancelled|canceled)$/i.test(String(order.status || ""))) return null;
  const { totalAmount, requiredAmount, paidAmount, remainingAmount } = getOrderPaymentAmounts(order);
  if (totalAmount <= 0 || remainingAmount <= 0) return null;

  const installation = getInstallationState(order);
  if (installation.completed && installation.completedAt) {
    const completedDay = getDayNumber(getDateKey(installation.completedAt));
    const currentDay = getDayNumber(getDateKey(now));
    if (Number.isFinite(completedDay) && Number.isFinite(currentDay) && currentDay >= completedDay) {
      const reminderPeriod = Math.floor((currentDay - completedDay) / 7);
      return {
        type: "overdue_payment",
        eventKey: `overdue_payment:${reminderPeriod}`,
        title: "Outstanding Project Balance",
        message: `Installation is complete for order ${order.tracking || order._id}. Your remaining balance is PHP ${remainingAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}. Please review your payment details.`,
        stageKey: "installation",
        stageName: "Installation",
        completedAt: installation.completedAt,
        balance: remainingAmount,
        emailEvent: "overdue_payment",
      };
    }
    return null;
  }

  const configuredDays = Number.parseInt(process.env.PAYMENT_INSTALLATION_REMINDER_DAYS || "3", 10);
  const reminderDays = Number.isFinite(configuredDays) ? Math.max(0, Math.min(configuredDays, 30)) : 3;
  if (paidAmount < requiredAmount) return null;
  const today = getDayNumber(getDateKey(now));
  const reminderDates = [
    order.agreed_payment_date ? { date: order.agreed_payment_date, kind: "payment_due" } : null,
    installation.scheduledDate ? { date: installation.scheduledDate, kind: "installation" } : null,
  ].filter(Boolean).map((entry) => ({ ...entry, day: getDayNumber(getDateKey(entry.date)) }))
    .filter((entry) => Number.isFinite(entry.day) && entry.day >= today)
    .sort((first, second) => first.day - second.day);
  const upcomingReminderDate = reminderDates[0];
  if (!upcomingReminderDate || upcomingReminderDate.day - today > reminderDays) return null;

  return {
    type: "installation_payment_reminder",
    eventKey: `installation_payment_reminder:${upcomingReminderDate.kind}:${getDateKey(upcomingReminderDate.date)}`,
    title: "Upcoming Payment Reminder",
    message: upcomingReminderDate.kind === "payment_due"
      ? `Your agreed payment date for order ${order.tracking || order._id} is ${getDateKey(upcomingReminderDate.date)}. Please review your payment terms and any remaining balance.`
      : `Your installation for order ${order.tracking || order._id} is scheduled for ${getDateKey(upcomingReminderDate.date)}. Please review your payment terms and any remaining balance.`,
    stageKey: "installation",
    stageName: "Installation",
    installationDate: installation.scheduledDate,
    paymentDueDate: order.agreed_payment_date,
    balance: remainingAmount,
    emailEvent: "installation_payment_reminder",
  };
};

const saveNotification = async (order, reminder) => {
  const result = await CustomerNotification.updateOne(
    { order: order._id, eventKey: reminder.eventKey },
    { $setOnInsert: {
      customer: order.customer,
      order: order._id,
      eventKey: reminder.eventKey,
      type: reminder.type,
      title: reminder.title,
      message: reminder.message,
      tracking: order.tracking || "",
      stageKey: reminder.stageKey,
      stageName: reminder.stageName,
      completedAt: reminder.completedAt || null,
      paymentBalance: reminder.balance,
      emailStatus: "pending",
    } },
    { upsert: true },
  );
  return Boolean(result.upsertedCount || result.upsertedId);
};

const deliverReminderEmail = async (order, reminder, now) => {
  const notification = await CustomerNotification.findOne({ order: order._id, eventKey: reminder.eventKey });
  if (!notification || notification.emailStatus === "sent") return false;
  const retryDue = !notification.emailNextRetryAt || notification.emailNextRetryAt <= now;
  const staleSending = notification.emailStatus === "sending"
    && notification.emailLastAttemptAt
    && notification.emailLastAttemptAt <= new Date(now.getTime() - EMAIL_STALE_MS);
  if (!retryDue || (notification.emailStatus === "sending" && !staleSending)) return false;

  const claimed = await CustomerNotification.findOneAndUpdate(
    {
      _id: notification._id,
      emailStatus: { $in: ["pending", "failed", ...(staleSending ? ["sending"] : [])] },
      $or: [{ emailNextRetryAt: null }, { emailNextRetryAt: { $lte: now } }],
    },
    { $set: { emailStatus: "sending", emailLastAttemptAt: now, emailError: "" }, $inc: { emailAttempts: 1 } },
    { new: true },
  );
  if (!claimed) return false;

  // Re-read immediately before delivery so a newly verified payment suppresses a stale reminder.
  const latestOrder = await Order.findById(order._id).lean();
  const latestReminder = latestOrder && getEligibleReminder(latestOrder, now);
  if (!latestReminder || latestReminder.eventKey !== reminder.eventKey) {
    await CustomerNotification.updateOne({ _id: claimed._id, emailStatus: "sending" }, { $set: { emailStatus: "not_sent", emailNextRetryAt: null } });
    return false;
  }

  await CustomerNotification.updateOne({ _id: claimed._id, emailStatus: "sending" }, {
    $set: { paymentBalance: latestReminder.balance },
  });

  const result = await sendOrderNotification(reminder.emailEvent, latestOrder, {
    audience: "customer",
    completedAt: latestReminder.completedAt,
    installationDate: latestReminder.installationDate,
    paymentDueDate: latestReminder.paymentDueDate,
    balance: latestReminder.balance,
  });
  if (result?.sent && !result?.failed) {
    await CustomerNotification.updateOne({ _id: claimed._id, emailStatus: "sending" }, {
      $set: { emailStatus: "sent", emailSentAt: new Date(), emailNextRetryAt: null, emailError: "" },
    });
    return true;
  }

  const errorMessage = result?.results?.find((entry) => !entry.sent)?.error?.message || "Email delivery failed";
  await CustomerNotification.updateOne({ _id: claimed._id, emailStatus: "sending" }, {
    $set: {
      emailStatus: "failed",
      emailNextRetryAt: new Date(now.getTime() + EMAIL_RETRY_MS),
      emailError: String(errorMessage).slice(0, 1000),
    },
  });
  return false;
};

export const runPaymentReminderCheck = async ({ now = new Date(), realtime } = {}) => {
  const orders = await Order.find({
    customer: { $exists: true, $ne: null },
    status: { $not: /^(cancelled|canceled)$/i },
  }).select("customer tracking status progress updatedAt total_amount final_project_cost contract_amount payment_terms agreed_payment_date required_downpayment_amount downpayment_amount payment_records payment_ledger_initialized legacy_verified_amount amount_paid payment_status payment_proof_confirmed_at payment_proof_submitted_at payment_proof_amount downpayment_received estimated_installation_date progress_stages items.progress_stages").lean();

  let created = 0;
  let sent = 0;
  for (const order of orders) {
    const reminder = getEligibleReminder(order, now);
    if (!reminder) continue;
    try {
      const wasCreated = await saveNotification(order, reminder);
      if (wasCreated) {
        created += 1;
        realtime?.to(`user:${String(order.customer)}`).emit("realtime:changed", {
          id: `payment-reminder:${String(order._id)}:${reminder.eventKey}`,
          type: "orders.notification",
          area: "orders",
          action: "notification",
          orderId: String(order._id),
          recordId: String(order._id),
          timestamp: now.toISOString(),
        });
      }
      if (await deliverReminderEmail(order, reminder, now)) sent += 1;
    } catch (error) {
      if (error?.code !== 11000) console.error(`Payment reminder failed for order ${order.tracking || order._id}:`, error);
    }
  }

  return { examined: orders.length, created, sent };
};

export const startPaymentReminderScheduler = (realtime) => {
  if (timer) return;
  const check = async () => {
    if (checkInProgress) return;
    checkInProgress = true;
    try {
      const result = await runPaymentReminderCheck({ realtime });
      if (result.created || result.sent) console.info(`Payment reminder check: ${result.created} created, ${result.sent} email(s) sent.`);
    } catch (error) {
      console.error("Payment reminder check failed:", error);
    } finally {
      checkInProgress = false;
    }
  };
  void check();
  timer = setInterval(check, CHECK_INTERVAL_MS);
  timer.unref?.();
};
