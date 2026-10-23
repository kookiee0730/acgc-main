export const ADMIN_READ_NOTIFICATIONS_KEY = "acgc-admin-read-notifications";

export const getAdminReadNotificationIds = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(ADMIN_READ_NOTIFICATIONS_KEY) || "[]"));
  } catch {
    return new Set();
  }
};

export const markAdminNotificationRead = (notificationId) => {
  if (!notificationId) return;
  const readIds = getAdminReadNotificationIds();
  readIds.add(notificationId);
  localStorage.setItem(ADMIN_READ_NOTIFICATIONS_KEY, JSON.stringify([...readIds]));
  window.dispatchEvent(new Event("admin-notifications-updated"));
};

export const markAdminNotificationsRead = (notificationIds = []) => {
  const readIds = getAdminReadNotificationIds();
  notificationIds.filter(Boolean).forEach((notificationId) => readIds.add(notificationId));
  localStorage.setItem(ADMIN_READ_NOTIFICATIONS_KEY, JSON.stringify([...readIds]));
  window.dispatchEvent(new Event("admin-notifications-updated"));
};

const getNotificationTimestamp = (notification) => {
  const timestamp = new Date(notification?.date || notification?.updatedAt || notification?.createdAt || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const sortAdminNotificationsNewestFirst = (first, second) => (
  getNotificationTimestamp(second) - getNotificationTimestamp(first)
);

export const getAdminNotificationId = (type, order) => {
  const orderId = order?._id || order?.id || order?.tracking || "unknown-order";
  switch (type) {
    case "new-order":
      return `${orderId}-new-order`;
    case "inspection":
      return `${orderId}-inspection`;
    case "accepted":
      return `${orderId}-accepted`;
    case "declined":
      return `${orderId}-declined`;
    case "cancelled":
      return `${orderId}-cancelled`;
    case "sent": {
      const date = order?.contractSentAt || order?.updatedAt || order?.createdAt;
      return `${orderId}-contract-sent-${new Date(date || 0).getTime()}`;
    }
    case "payment": {
      const date = order?.payment_proof_submitted_at;
      return `${orderId}-payment-submitted-${new Date(date || 0).getTime()}`;
    }
    case "repair": {
      const date = order?.updatedAt || order?.createdAt;
      return `${orderId}-repair-${String(order?.status || "update")}-${new Date(date || 0).getTime()}`;
    }
    default:
      return `${orderId}-${type || "update"}`;
  }
};
