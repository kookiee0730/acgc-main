import { useEffect, useRef, useState } from "react";
import { getAdminOrders } from "@/api/orders";
import { getRepairRequests } from "@/api/repairs";
import { subscribeToRealtime } from "@/lib/realtimeEvents";
import { Bell, CheckCheck, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, CreditCard, Send, ShoppingCart, Wrench, XCircle } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { formatDateTimeToMMDDYYYY, formatTimeAgo } from "@/lib/dateUtils";
import { getFinalProjectCost } from "@/lib/orderPricing";
import { ADMIN_READ_NOTIFICATIONS_KEY, getAdminNotificationId, getAdminReadNotificationIds, markAdminNotificationRead, sortAdminNotificationsNewestFirst } from "@/lib/notificationState";
import AdminPageHeader from "../../components/layout/AdminPageHeader";
import Navbar from "../../components/layout/Navbar";
import { useAdminTheme } from "@/contexts/AdminThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { getAdminSiteInspectionNotificationMessage } from "@/pages/CustomerDashboard/orderStatusUtils";

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedNotifications = useRef(false);
  const [notificationFilter, setNotificationFilter] = useState("all");
  const [pageByFilter, setPageByFilter] = useState({});
  const { darkMode } = useAdminTheme();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const backPath = location.state?.from || "/dashboard";
  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const filterOptions = [
    ["all", "All"],
    ["orders", "Orders"],
    ["inspections", "Inspections"],
    ["accepted", "Accepted"],
    ["declined", "Declined"],
    ["sent", "Sent"],
    ["payments", "Payments"],
    ["repairs", "Repairs"],
  ];
  const filteredNotifications = notifications.filter((notification) => (
    notificationFilter === "all" || notification.category === notificationFilter
  ));
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredNotifications.length / pageSize));
  const currentPage = Math.min(pageByFilter[notificationFilter] || 1, totalPages);
  const paginatedNotifications = filteredNotifications.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const setCurrentPage = (page) => setPageByFilter((current) => ({ ...current, [notificationFilter]: page }));

  useEffect(() => {
    let active = true;
    let requestInFlight = false;
    let refreshQueued = false;
    const fetch = async () => {
      if (!active) return;
      if (requestInFlight) {
        refreshQueued = true;
        return;
      }
      requestInFlight = true;
      if (!hasLoadedNotifications.current) setLoading(true);
      try {
        const staffModules = user?.staff_access?.modules || {};
        const canReadModule = (moduleKey) => user?.role !== "skilled_worker" || (
          staffModules[moduleKey]?.enabled === true && staffModules[moduleKey]?.actions?.view === true
        );
        const fetchModuleOrders = (params, moduleKey) => canReadModule(moduleKey)
          ? getAdminOrders({ ...params, module: moduleKey, view: "notifications", limit: 100 })
          : Promise.resolve({ orders: [] });
        const [newOrdersResp, inspectionsResp, acceptedResp, declinedResp, sentResp, paymentResp, cancelledResp, repairResp] = await Promise.all([
          fetchModuleOrders({ status: "order_submitted" }, "dashboard"),
          fetchModuleOrders({ status: "site_inspection" }, "site_inspection"),
          fetchModuleOrders({ contract_status: "accepted" }, "site_inspection"),
          fetchModuleOrders({ contract_status: "declined" }, "site_inspection"),
          fetchModuleOrders({ contract_status: "sent" }, "site_inspection"),
          fetchModuleOrders({ payment_proof_submitted: "true" }, "transactions"),
          fetchModuleOrders({ status: "cancelled" }, "site_inspection"),
          user?.role === "skilled_worker" ? Promise.resolve({ repairs: [] }) : getRepairRequests(),
        ]);
        const isLegacyUnscheduledOnlineOrder = (order) => (
          String(order.order_type || "").toLowerCase() === "online_order"
          && !order.inspection_date
          && !["scheduled", "completed"].includes(String(order.inspection_status || "pending").toLowerCase())
        );
        const legacyUnscheduledOrders = (inspectionsResp.orders || []).filter(isLegacyUnscheduledOnlineOrder);
        const items = [
          ...(newOrdersResp.orders || []).map((order) => ({
            ...order,
            notificationType: "new-order",
            category: "orders",
            title: "New order request",
            message: `${order.tracking || "An order"} is waiting for approval.`,
            id: getAdminNotificationId("new-order", order),
          })),
          ...(cancelledResp.orders || []).map((order) => {
            const customerName = `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim()
              || order.customer_name
              || "Customer";
            const orderNumber = order.tracking || order.order_number || order.orderNumber || "this order";
            const cancellationReason = String(order.cancellation_reason || "").trim();
            const cancellationCount = Number(order.customer_cancellation_count_at_cancel || order.customer?.customer_cancellation_count) || 0;
            const cancellationCountInCycle = cancellationCount > 0 ? ((cancellationCount - 1) % 3) + 1 : 0;
            const cooldownUntil = order.customer?.online_order_cooldown_until
              ? formatDateTimeToMMDDYYYY(order.customer.online_order_cooldown_until)
              : "";
            const cancellationPolicyMessage = cancellationCountInCycle === 3
              ? `This customer has canceled orders 3 times already. Do you want to continue? ${customerName}'s cancellation triggered a 7-day online ordering restriction${cooldownUntil ? ` until ${cooldownUntil}` : ""}.`
              : cancellationCountInCycle > 0
                ? `${customerName} has canceled ${cancellationCountInCycle} of 3 orders in the current policy cycle. The third cancellation triggers a 7-day online ordering restriction.`
                : `${customerName}'s order ${orderNumber} was cancelled.`;
            return {
              ...order,
              notificationType: "cancelled",
              category: "orders",
              title: cancellationCountInCycle === 3 ? "Customer cancellation limit reached" : "Customer cancelled an order",
              message: `${cancellationPolicyMessage} Order ${orderNumber}.${cancellationReason ? ` Reason: ${cancellationReason}` : ""}`,
              id: getAdminNotificationId("cancelled", order),
            };
          }),
          ...legacyUnscheduledOrders.map((order) => ({
            ...order,
            notificationType: "pending-inspection-order",
            category: "orders",
            title: "Order awaiting inspection scheduling",
            message: `${order.tracking || "An order"} is waiting for an inspection to be scheduled.`,
            id: getAdminNotificationId("pending-inspection-order", order),
          })),
          ...(inspectionsResp.orders || [])
            .filter((order) => (
              !["sent", "declined"].includes(String(order.contract_status || "").toLowerCase())
              && !isLegacyUnscheduledOnlineOrder(order)
            ))
            .map((order) => {
              const customerName = `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim()
                || order.customer_name
                || "Customer";
              return {
                ...order,
                notificationType: "inspection",
                category: "inspections",
                title: order.inspection_date || order.inspection_status === "scheduled" ? "Inspection scheduled" : "Inspection needs scheduling",
                message: getAdminSiteInspectionNotificationMessage(order, customerName),
                id: getAdminNotificationId("inspection", order),
              };
            }),
          ...(acceptedResp.orders || []).map((order) => ({
            ...order,
            notificationType: "accepted",
            category: "accepted",
            message: `Customer accepted the contract for ₱${getFinalProjectCost(order).toLocaleString()}`,
            id: getAdminNotificationId("accepted", order),
          })),
          ...(declinedResp.orders || []).map((order) => ({
            ...order,
            notificationType: "declined",
            category: "declined",
            message: "Customer declined the contract",
            id: getAdminNotificationId("declined", order),
          })),
          ...(sentResp.orders || []).map((o) => ({
            ...o,
            updatedAt: o.contractSentAt || o.updatedAt,
            notificationType: "sent",
            category: "sent",
            message: "Contract sent to customer for review",
            id: getAdminNotificationId("sent", o),
          })),
          ...(paymentResp.orders || []).map((o) => {
            const customerName = `${o.customer?.first_name || ""} ${o.customer?.last_name || ""}`.trim()
              || o.customer_name
              || "Customer";
            const orderNumber = o.tracking || o.order_number || o.orderNumber || o._id;
            const amount = Number(o.payment_proof_amount || o.payment_amount || 0)
              .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            return {
              ...o,
              updatedAt: o.payment_proof_submitted_at,
              notificationType: "payment",
              category: "payments",
              id: getAdminNotificationId("payment", o),
              title: "Customer Reported a Payment",
              message: `${customerName} says they paid ₱${amount} for order ${orderNumber}. Please confirm.`,
            };
          }),
          ...(repairResp.repairs || []).flatMap((repair) => {
            const titles = {
              pending_review: "New repair request",
              admin_approved: "Warranty claim approved",
              rejected: "Warranty claim rejected",
              quotation_issued: "Repair quotation issued",
              customer_accepted: "Customer accepted quotation",
              payment_proof_submitted: "Repair payment proof submitted",
              payment_proof_approved: "Repair payment verified",
              payment_proof_rejected: "Repair payment proof rejected",
              cancelled: "Repair quotation declined",
              scheduled: "Repair visit scheduled",
              in_progress: "Repair work started",
              completed: "Repair completed",
            };
            const history = repair.history?.length ? repair.history : [{ event: repair.status || "pending_review", detail: "Repair request updated.", createdAt: repair.updatedAt || repair.createdAt }];
            return history.map((entry, index) => ({
              ...repair,
              id: `repair-${repair._id}-${entry.event}-${entry.createdAt ? new Date(entry.createdAt).getTime() : index}-${index}`,
              recordId: String(repair._id),
              tracking: repair.orderTracking || "Repair request",
              updatedAt: entry.createdAt || repair.updatedAt || repair.createdAt,
              notificationType: "repair-request",
              category: "repairs",
              title: titles[entry.event] || "Repair request updated",
              message: entry.detail || `${repair.productName || "Product repair"} status updated to ${String(repair.status || "updated").replaceAll("_", " ")}.`,
              icon: Wrench,
              date: entry.createdAt || repair.updatedAt || repair.createdAt,
            }));
          }),
        ].sort(sortAdminNotificationsNewestFirst);
        const readNotificationIds = getAdminReadNotificationIds();
        if (active) {
          setNotifications(items.map((item) => ({ ...item, read: readNotificationIds.has(item.id) })));
        }
      } catch (err) {
        console.error(err);
      } finally {
        requestInFlight = false;
        hasLoadedNotifications.current = true;
        if (active) setLoading(false);
        if (active && refreshQueued) {
          refreshQueued = false;
          refreshTimeout = window.setTimeout(() => {
            refreshTimeout = null;
            fetch();
          }, 0);
        }
      }
    };
    fetch();
    let refreshTimeout = null;
    const scheduleRefresh = () => {
      if (refreshTimeout) window.clearTimeout(refreshTimeout);
      refreshTimeout = window.setTimeout(() => {
        refreshTimeout = null;
        if (document.visibilityState === "visible") fetch();
      }, 80);
    };
    const unsubscribeRealtime = subscribeToRealtime(["orders", "reviews", "repairs"], scheduleRefresh);
    window.addEventListener("focus", scheduleRefresh);
    const refreshReadState = (event) => {
      if (event.key === ADMIN_READ_NOTIFICATIONS_KEY) scheduleRefresh();
    };
    window.addEventListener("storage", refreshReadState);
    return () => {
      active = false;
      if (refreshTimeout) window.clearTimeout(refreshTimeout);
      window.removeEventListener("focus", scheduleRefresh);
      window.removeEventListener("storage", refreshReadState);
      unsubscribeRealtime();
    };
  }, [user]);

  return (
    <div className="notifications-page-shell flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden">
      <div className="shrink-0"><Navbar /></div>
      <main className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overscroll-y-contain p-3 !pb-[calc(10rem+env(safe-area-inset-bottom))] sm:p-6 sm:!pb-[calc(10rem+env(safe-area-inset-bottom))] lg:!pb-24">
          <button
        type="button"
        onClick={() => navigate(backPath)}
        className={`mb-3 inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${darkMode ? "text-slate-300 hover:bg-slate-800 hover:text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back
      </button>
      <AdminPageHeader
        title="Notifications"
        description="Review customer responses and administrative actions that need attention."
      />
      <div className={`mt-5 overflow-hidden rounded-2xl border shadow-sm ${darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
        <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5 ${darkMode ? "border-slate-700" : "border-slate-100"}`}>
          <div>
            <h2 className={`text-base font-bold ${darkMode ? "text-white" : "text-slate-950"}`}>Activity feed</h2>
            <p className={`mt-0.5 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{notifications.length} total updates</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${unreadCount ? "bg-sky-50 text-sky-700" : darkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
            <CheckCheck size={13} />
            {unreadCount} unread
          </span>
        </div>

        <div className={`grid grid-cols-2 gap-2 border-b px-4 py-3 sm:flex sm:flex-wrap sm:px-5 ${darkMode ? "border-slate-700 bg-slate-950/30" : "border-slate-100 bg-slate-50/70"}`} role="group" aria-label="Filter notifications">
          {filterOptions.map(([filter, label]) => {
            const count = filter === "all"
              ? notifications.length
              : notifications.filter((notification) => notification.category === filter).length;

            return (
              <button
                key={filter}
                type="button"
                onClick={() => setNotificationFilter(filter)}
                aria-pressed={notificationFilter === filter}
                className={`inline-flex w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[11px] font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 sm:w-auto sm:gap-2 sm:px-3 sm:text-xs ${
                  notificationFilter === filter
                    ? darkMode ? "border-red-400/40 bg-red-950/40 text-red-200" : "border-red-200 bg-rose-50 text-red-700"
                    : darkMode ? "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100"
                }`}
              >
                {label}
                <span className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold tabular-nums ${notificationFilter === filter ? darkMode ? "bg-red-400/15 text-red-200" : "bg-red-100 text-red-700" : darkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        <div className="p-3 sm:p-4">
          {loading ? (
            <div className="space-y-3" aria-label="Loading notifications">
              {[...Array(3)].map((_, index) => <div key={index} className={`h-20 animate-pulse rounded-xl ${darkMode ? "bg-slate-800" : "bg-slate-100"}`} />)}
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className={`flex flex-col items-center rounded-xl border border-dashed px-5 py-12 text-center ${darkMode ? "border-slate-700 text-slate-300" : "border-slate-200 text-slate-600"}`}>
              <span className={`flex h-11 w-11 items-center justify-center rounded-full ${darkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500"}`}><Bell size={19} /></span>
              <p className="mt-3 text-sm font-semibold">{notificationFilter === "all" ? "You're all caught up" : `No ${filterOptions.find(([filter]) => filter === notificationFilter)?.[1].toLowerCase()} notifications`}</p>
              <p className={`mt-1 text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>{notificationFilter === "all" ? "New customer activity will appear here." : "Try another filter to see more activity."}</p>
            </div>
          ) : (
            <div className={`divide-y overflow-hidden rounded-xl border ${darkMode ? "divide-slate-700 border-slate-700" : "divide-slate-200 border-slate-200"}`}>
              {paginatedNotifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    markAdminNotificationRead(n.id);
                    setNotifications((current) => current.map((item) => item.id === n.id ? { ...item, read: true } : item));
                    const recordId = String(n._id || n.id || n.tracking);
                    const destination = n.notificationType === "repair-request"
                      ? "/repair-requests"
                      : n.notificationType === "pending-inspection-order"
                      ? `/site-inspection?view=${recordId}`
                      : n.notificationType === "cancelled"
                      ? "/site-inspection"
                      : n.category === "payments"
                      ? "/transactions"
                      : n.category === "orders"
                        ? "/dashboard"
                        : `/site-inspection?view=${recordId}`;
                    const recordType = n.notificationType === "repair-request"
                      ? "repair"
                      : n.notificationType === "pending-inspection-order"
                      ? "inspection"
                      : n.notificationType === "cancelled"
                      ? "inspection"
                      : n.category === "payments"
                      ? "payment"
                      : n.category === "inspections"
                        ? "inspection"
                        : ["accepted", "declined", "sent"].includes(n.category)
                          ? "contract"
                          : "order";
                    navigate(destination, {
                      state: {
                        ...(n.notificationType === "cancelled" ? { activeTab: "cancelled" } : {}),
                        ...(n.notificationType === "sent" || n.category === "sent" ? { openContract: true } : {}),
                        notificationHighlight: { recordId, recordType },
                      },
                    });
                  }}
                  className={`flex w-full gap-3 border-l-[3px] p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 sm:gap-4 sm:p-4 ${n.read ? darkMode ? "border-l-transparent bg-slate-900 hover:bg-slate-800" : "border-l-transparent bg-white hover:bg-slate-50" : darkMode ? "border-l-sky-400 bg-sky-950/20 hover:bg-sky-950/35" : "border-l-sky-500 bg-sky-50/70 hover:bg-sky-50"}`}
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${darkMode ? "bg-slate-800" : "bg-slate-100"}`}>
                    {n.notificationType === "repair-request" ? (
                      <Wrench size={18} className="text-amber-600" />
                    ) : n.notificationType === "payment" ? (
                      <CreditCard size={18} className="text-emerald-600" />
                    ) : n.notificationType === "sent" ? (
                      <Send size={18} className="text-sky-600" />
                    ) : n.notificationType === "accepted" ? (
                      <CheckCircle2 size={18} className="text-emerald-600" />
                    ) : n.notificationType === "declined" || n.notificationType === "cancelled" ? (
                      <XCircle size={18} className="text-red-600" />
                    ) : n.notificationType === "inspection" ? (
                      <ClipboardCheck size={18} className="text-amber-600" />
                    ) : ["new-order", "pending-inspection-order"].includes(n.notificationType) ? (
                      <ShoppingCart size={18} className="text-blue-600" />
                    ) : (
                      <Bell size={18} className={n.notificationType === "accepted" ? "text-emerald-600" : "text-red-600"} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className={`truncate text-sm font-semibold ${darkMode ? n.read ? "text-slate-300" : "text-white" : n.read ? "text-slate-600" : "text-slate-950"}`}>{n.title}</div>
                        {!n.read && <span className="shrink-0 rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-sky-700">New</span>}
                      </div>
                      <div className={`text-[10px] sm:text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`} title={formatDateTimeToMMDDYYYY(n.updatedAt || n.createdAt) || undefined}>
                        {formatTimeAgo(n.updatedAt || n.createdAt)}
                      </div>
                    </div>
                    <div className={`mt-1 text-xs leading-5 sm:text-sm ${darkMode ? n.read ? "text-slate-400" : "text-slate-300" : n.read ? "text-slate-500" : "text-slate-700"}`}>{n.message}</div>
                    <div className={`mt-1 text-[11px] font-medium ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                      Tracking ID: {n.tracking || n.order_number || n.orderNumber || "Not assigned"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {!loading && filteredNotifications.length > 0 && totalPages > 1 && (
            <div className={`mt-4 flex flex-col items-center justify-between gap-3 border-t pt-4 sm:flex-row ${darkMode ? "border-slate-700" : "border-slate-200"}`}>
              <span className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredNotifications.length)} of {filteredNotifications.length}
              </span>
              <nav className="flex flex-wrap items-center justify-center gap-1.5" aria-label={`${filterOptions.find(([filter]) => filter === notificationFilter)?.[1]} notifications pagination`}>
                <button type="button" onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1} aria-label="Previous page" className={`inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${darkMode ? "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                  <ChevronLeft size={14} /> Previous
                </button>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                  <button key={page} type="button" onClick={() => setCurrentPage(page)} aria-current={currentPage === page ? "page" : undefined} aria-label={`Page ${page}`} className={`h-9 min-w-9 rounded-lg border px-2.5 text-xs font-semibold ${currentPage === page ? "border-red-600 bg-red-600 text-white" : darkMode ? "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                    {page}
                  </button>
                ))}
                <button type="button" onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages} aria-label="Next page" className={`inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${darkMode ? "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                  Next <ChevronRight size={14} />
                </button>
              </nav>
            </div>
          )}
        </div>
      </div>
      </main>
    </div>
  );
}
