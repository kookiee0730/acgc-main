import process from "node:process";
import { sendMail } from "../config/mailer.js";
import User from "../models/User.js";
import { getOrderPaymentAmounts } from "./paymentLedger.js";
import { buildFrontendUrl } from "./frontendUrl.js";
import { buildCustomerEmailTemplate } from "./customerEmailTemplate.js";

const orderIdOf = (order) => String(order?.tracking || order?._id || order?.id || "Order");
const asNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const statusLabel = (value) => String(value || "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const money = (value) => `PHP ${asNumber(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" });
};
const dateOnly = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-PH", { dateStyle: "long" });
};

export const getCurrentCustomerContact = async (customerId) => {
  if (!customerId) return null;
  try {
    return await User.findById(customerId).select("email first_name last_name").lean();
  } catch (error) {
    console.error("Unable to resolve current customer contact:", error);
    return null;
  }
};

export const resolveOrderCustomerEmail = (order, options = {}, linkedCustomer = null) =>
  linkedCustomer?.email || options.customerEmail || order?.customer_email || order?.customer?.email || "";
const customerName = (order) => order?.customer_name || [order?.customer?.first_name, order?.customer?.last_name].filter(Boolean).join(" ") || "Valued Customer";
const itemDescription = (item) => {
  const quantity = asNumber(item?.quantity) || 1;
  const width = asNumber(item?.width ?? item?.dimensions?.width);
  const height = asNumber(item?.height ?? item?.dimensions?.height);
  const unit = item?.measurement_unit || item?.dimensions?.unit || "in";
  const measurements = width > 0 && height > 0 ? ` (${width} x ${height} ${unit})` : "";
  const amount = asNumber(item?.line_total) || asNumber(item?.estimated_price) || 0;
  return `${item?.name || item?.product_name || "Product"} x ${quantity}${measurements}${amount > 0 ? ` - ${money(amount)}` : ""}`;
};
const itemsText = (order) => (Array.isArray(order?.items) ? order.items : []).map(itemDescription);
const paymentTotals = (order) => {
  const total = asNumber(order?.contract_amount) || asNumber(order?.total_amount);
  const configuredRequired = order?.required_downpayment_amount ?? order?.downpayment_amount;
  const required = Math.min(total, Math.max(
    configuredRequired === undefined || configuredRequired === null
      ? (order?.payment_terms === "full_payment" ? total : total * 0.5)
      : asNumber(configuredRequired),
    0,
  ));
  let paid = getOrderPaymentAmounts(order).paidAmount;
  if (order?.payment_status === "paid" && !order?.payment_proof_submitted_at && paid === 0) paid = total;
  return { total, required, paid, balance: Math.max(total - paid, 0) };
};

const getEventContent = (event, order, audience, extra) => {
  const { total, required, paid, balance } = paymentTotals(order);
  const products = itemsText(order);
  const common = [
    ["Customer", customerName(order)],
    ["Order ID", orderIdOf(order)],
  ];
  const eventContent = {
    order_submitted: {
      title: "Order request received",
      summary: "Your order request has been submitted and is ready for review.",
      subject: `Order request received - ${orderIdOf(order)}`,
      status: statusLabel(order?.status || "Submitted"),
      action: "View order",
      path: "customer-dashboard?tab=orders",
      next: "Our team will review the products and measurements, then contact you about the next steps.",
      fields: [
        ["Order date", dateTime(order?.createdAt || new Date())],
        ["Ordered products", products.join("; ")],
        ["Total order amount", money(total)],
        ["Required downpayment", money(required)],
        ["Current order status", statusLabel(order?.status || "Submitted")],
      ],
    },
    payment_amount_updated: {
      title: "Payment Amount Updated",
      summary: "Your submitted payment amount differs from the amount verified by the admin. Please review the details below.",
      subject: `Payment amount updated - ${orderIdOf(order)}`,
      status: "Amount Updated",
      action: "Review payment details",
      path: "customer-dashboard?tab=orders",
      next: balance > 0 ? `Your verified payment was applied. Downpayment remaining: ${money(Math.max(required - paid, 0))}. Remaining project balance: ${money(balance)}.` : "Your order is fully paid.",
      fields: [
        ["Order reference", order?.tracking || orderIdOf(order)],
        [extra.wasAdjustment ? "Previously verified amount" : "Customer-submitted amount", money(extra.wasAdjustment ? extra.previousAmount : extra.submittedAmount)],
        ["Admin-verified amount", money(extra.confirmedAmount)],
        ["Difference", `${asNumber(extra.difference) < 0 ? "Lower by " : "Higher by "}${money(Math.abs(asNumber(extra.difference)))}`],
        ["Verified on", dateTime(order?.payment_records?.id?.(extra.paymentRecordId)?.verified_at || order?.payment_proof_confirmed_at || new Date())],
        ...(extra.reason ? [["Admin explanation", extra.reason]] : []),
        ["Total project cost", money(total)],
        ["Verified amount paid", money(paid)],
        ["Remaining project balance", money(balance)],
      ],
    },
    payment_discrepancy_resolved: {
      title: "Payment Discrepancy Resolved",
      summary: "An administrator has formally resolved the payment amount discrepancy on your order.",
      subject: `Payment discrepancy resolved - ${orderIdOf(order)}`,
      status: "Resolved",
      action: "Review payment details",
      path: "customer-dashboard?tab=orders",
      next: extra.reason || "Review the updated payment history in your account.",
      fields: [
        ["Order reference", order?.tracking || orderIdOf(order)],
        ["Customer-reported amount", money(extra.customerReportedAmount)],
        ["Admin-recorded amount", money(extra.adminRecordedAmount)],
        ["Difference", money(extra.difference)],
        ["Resolution note", extra.reason || "-"],
      ],
    },
    payment_proof_rejected: {
      title: "Payment Proof Rejected",
      summary: "The admin reviewed your payment proof and could not verify it. The submitted amount has not been counted as paid.",
      subject: `Payment proof rejected - ${orderIdOf(order)}`,
      status: "Rejected",
      action: "Review order and resubmit payment proof",
      path: "customer-dashboard?tab=orders",
      next: extra.reason || "Please review your payment details and submit a new proof of payment when ready.",
      fields: [
        ["Order reference", order?.tracking || orderIdOf(order)],
        ["Submitted amount", money(extra.submittedAmount)],
        ["Rejected on", dateTime(order?.payment_records?.id?.(extra.paymentRecordId)?.rejected_at || new Date())],
        ...(extra.reason ? [["Admin explanation", extra.reason]] : []),
        ["Verified amount paid", money(paid)],
        ["Downpayment remaining", money(Math.max(required - paid, 0))],
        ["Remaining project balance", money(balance)],
      ],
    },
    order_cancelled: {
      title: "Order cancelled",
      summary: "Your order has been cancelled.",
      subject: `Order cancelled - ${orderIdOf(order)}`,
      status: "Cancelled",
      action: "View cancelled order",
      path: "customer-dashboard?tab=orders",
      next: paid > 0 ? "Our support team will contact you regarding any applicable refund." : "No further action is required. Contact support if you have questions.",
      fields: [
        ["Cancellation date", dateTime(extra.date || new Date())],
        ["Cancelled products", products.join("; ") || "Entire order"],
        ["Order amount", money(total)],
        ...(paid > 0 ? [["Payment/downpayment received", money(paid)], ["Refund information", extra.refundInformation || "Refund eligibility and processing will be confirmed by our support team."]] : []),
        ...(extra.reason ? [["Cancellation reason", extra.reason]] : []),
        ["Current order status", "Cancelled"],
      ],
    },
    payment_proof_submitted: {
      title: audience === "admin" ? "Payment proof requires verification" : "Payment proof submitted",
      summary: audience === "admin"
        ? "A customer submitted payment proof that needs review."
        : "Your payment proof was successfully submitted and is awaiting admin verification.",
      subject: audience === "admin" ? `Payment proof pending verification - ${orderIdOf(order)}` : `Payment proof received - ${orderIdOf(order)}`,
      status: "Pending Verification",
      action: audience === "admin" ? "Review payment" : "View transaction",
      path: audience === "admin" ? "transactions" : "customer-dashboard?tab=transactions",
      next: audience === "admin" ? "Review the payment reference and uploaded proof, then confirm or reject the payment." : "The payment remains subject to admin verification. We will update you once it has been reviewed.",
      fields: [
        ["Payment/transaction ID", order?.transaction_number || order?.payment_proof_file_name || extra.transactionId || orderIdOf(order)],
        ["Payment amount", money(order?.payment_proof_amount)],
        ["Payment method", order?.payment_method || "Not provided"],
        ["Date and time submitted", dateTime(order?.payment_proof_submitted_at)],
        ...(audience === "admin" && (order?.payment_proof_file_name || order?.payment_proof_file_url) ? [["Payment proof/reference", order.payment_proof_file_name || order.payment_proof_file_url]] : []),
        ["Current payment status", audience === "admin" ? "Pending Verification" : statusLabel(order?.payment_status || "Pending Verification")],
        ...(audience === "customer" ? [["Submission confirmation", "Payment proof successfully submitted"], ["Verification notice", "Payment is still subject to admin verification"]] : []),
      ],
    },
    payment_proof_confirmed: {
      title: "Payment proof confirmed",
      summary: "Your submitted payment proof has been reviewed and confirmed by our team.",
      subject: `Payment confirmed - ${orderIdOf(order)}`,
      status: "Confirmed",
      action: "View transaction",
      path: "customer-dashboard?tab=transactions",
      next: balance > 0 ? `Your payment has been applied. Remaining balance: ${money(balance)}.` : "Your order is fully paid.",
      fields: [
        ["Payment/transaction ID", order?.transaction_number || order?.payment_proof_file_name || orderIdOf(order)],
        ["Confirmed payment amount", money(extra.confirmedAmount || order?.payment_proof_amount)],
        ["Payment method", order?.payment_method || "Not provided"],
        ["Confirmation date", dateTime(order?.payment_proof_confirmed_at || new Date())],
        ...(order?.payment_proof_file_name || order?.payment_proof_file_url
          ? [["Payment proof/reference", order.payment_proof_file_name || order.payment_proof_file_url]]
          : []),
        ["Previous payment status", extra.previousStatus || "Pending Verification"],
        ["Current payment status", statusLabel(order?.payment_status || "Confirmed")],
        ["Total amount paid", money(paid)],
        ["Required downpayment", money(required)],
        ["Remaining balance", money(balance)],
      ],
    },
    admin_payment_recorded: {
      title: "Payment recorded by our team",
      summary: "Our team recorded a payment on your behalf. The amount has been applied to your order.",
      subject: `Payment recorded - ${orderIdOf(order)}`,
      status: statusLabel(order?.payment_status || "Updated"),
      action: "Review payment details",
      path: "customer-dashboard?tab=orders",
      next: balance > 0 ? `Remaining project balance: ${money(balance)}.` : "Your order is fully paid.",
      fields: [
        ["Order reference", order?.tracking || orderIdOf(order)],
        ["Recorded payment amount", money(extra.confirmedAmount)],
        ["Payment method", order?.payment_method || "Not provided"],
        ["Payment date", dateTime(order?.payment_records?.id?.(extra.paymentRecordId)?.payment_date)],
        ["Current payment status", statusLabel(order?.payment_status || "Updated")],
        ["Total amount paid", money(paid)],
        ["Required downpayment", money(required)],
        ["Remaining project balance", money(balance)],
        ...(extra.reason ? [["Admin note", extra.reason]] : []),
      ],
    },
    downpayment_exception_approved: {
      title: "Downpayment exception approved",
      summary: "Our team approved accepting your payment below the configured downpayment as an exception. The original downpayment terms remain unchanged.",
      subject: `Downpayment exception approved - ${orderIdOf(order)}`,
      status: statusLabel(order?.payment_status || "Partial Downpayment"),
      action: "Review payment details",
      path: "customer-dashboard?tab=orders",
      next: `Remaining project balance: ${money(balance)}. The original required downpayment remains ${money(required)}.`,
      fields: [
        ["Order reference", order?.tracking || orderIdOf(order)],
        ["Accepted payment amount", money(extra.acceptedAmount)],
        ["Original required downpayment", money(required)],
        ["Remaining amount to required downpayment", money(Math.max(required - paid, 0))],
        ["Remaining project balance", money(balance)],
        ["Current payment status", statusLabel(order?.payment_status || "Partial Downpayment")],
        ["Exception reason", extra.reason || ""],
      ],
    },
    downpayment_exception_requested: {
      title: "Awaiting Admin Approval",
      summary: "An exception to the configured downpayment was requested for your submitted payment. It is not approved yet and the payment is not counted as verified.",
      subject: `Downpayment exception awaiting approval - ${orderIdOf(order)}`,
      status: "Awaiting Admin Approval",
      action: "Review payment details",
      path: "customer-dashboard?tab=orders",
      next: `Your payment remains unverified. The original required downpayment is ${money(required)} and the remaining project balance is ${money(balance)}.`,
      fields: [
        ["Order reference", order?.tracking || orderIdOf(order)],
        ["Proposed accepted amount", money(extra.acceptedAmount)],
        ["Original required downpayment", money(required)],
        ["Shortfall if accepted", money(extra.shortfall)],
        ["Amount already verified", money(paid)],
        ["Remaining project balance", money(balance)],
        ["Current payment status", statusLabel(order?.payment_status || "Pending")],
      ],
    },
    contract_accepted: {
      title: "Contract accepted",
      summary: "The contract for this order has been accepted.",
      subject: `Contract accepted - ${orderIdOf(order)}`,
      status: statusLabel(order?.status || "Contract Accepted"),
      action: "View contract and order",
      path: "customer-dashboard?tab=contracts",
      next: "Our team will coordinate the next project steps and keep you updated through your order dashboard.",
      fields: [
        ["Contract ID", order?.contractId || order?.contract_number || order?.contractHistory?.[0]?.contractId || ""],
        ["Accepted on", dateTime(order?.acceptedAt || order?.contract_signed_date || extra.acceptedAt)],
        ["Order details", products.join("; ")],
        ["Total order amount", money(total)],
        ["Required downpayment", money(required)],
        ["Current order status", statusLabel(order?.status || "Contract Accepted")],
      ],
    },
    transaction_update: {
      title: "Payment transaction updated",
      summary: "A confirmed payment has been applied to your order.",
      subject: `Payment transaction update - ${orderIdOf(order)}`,
      status: statusLabel(order?.payment_status || "Updated"),
      action: "View transaction",
      path: "customer-dashboard?tab=transactions",
      next: balance > 0 ? `Remaining balance: ${money(balance)}.` : "Your order is fully paid.",
      fields: [
        ["Transaction ID", order?.transaction_number || extra.transactionId || orderIdOf(order)],
        ["Transaction date", dateTime(extra.transactionDate || order?.payment_proof_confirmed_at || new Date())],
        ["Confirmed payment amount", money(extra.confirmedAmount)],
        ["Payment method", order?.payment_method || "Not provided"],
        ["Previous payment status", extra.previousStatus || "Not recorded"],
        ["New payment status", statusLabel(order?.payment_status || "Updated")],
        ["Total amount paid", money(paid)],
        ["Required downpayment", money(required)],
        ["Remaining balance", money(balance)],
        ...(asNumber(extra.confirmedAmount) > 0 ? [["Additional payment", money(extra.confirmedAmount)]] : []),
      ],
    },
    transaction_approved: {
      title: "Transaction approved",
      summary: "Your accepted contract has been approved by our team. Your project is now eligible to appear in progress monitoring.",
      subject: `Transaction approved - ${orderIdOf(order)}`,
      status: statusLabel(order?.status || "Approved"),
      action: "View project status",
      path: "customer-dashboard?tab=orders",
      next: "You can follow project stages from your My Orders page as work progresses.",
      fields: [
        ["Order reference", order?.tracking || orderIdOf(order)],
        ["Contract status", statusLabel(order?.contract_status || "Accepted")],
        ["Transaction approval date", dateTime(extra.approvedAt || order?.transaction_approved_at)],
        ["Total project cost", money(total)],
        ["Current payment status", statusLabel(order?.payment_status || "Pending")],
        ["Remaining project balance", money(balance)],
      ],
    },
    warranty_notification: {
      title: "Warranty details",
      summary: "Warranty coverage is now recorded for the following products.",
      subject: `Warranty details - ${orderIdOf(order)}`,
      status: statusLabel(order?.warranty_status || "Active"),
      action: "View warranty details",
      path: "customer-dashboard?tab=transactions",
      next: "Keep your order reference and proof of purchase for any warranty claim. Contact support before arranging repairs.",
      fields: [
        ["Warranty coverage", (extra.warrantyLines || []).join("; ")],
        ...(order?.warranty_terms ? [["Warranty terms", order.warranty_terms]] : []),
      ],
    },
    installation_date: {
      title: "Installation scheduled",
      summary: "An installation date has been scheduled for your order.",
      subject: `Installation scheduled - ${orderIdOf(order)}`,
      status: statusLabel(extra.installationStatus || "Scheduled"),
      action: "View installation details",
      path: "customer-dashboard?tab=orders",
      next: "Please ensure the installation area is accessible and clear before the team arrives. Contact support in advance if the date or access arrangements need attention.",
      fields: [
        ["Installation date", dateOnly(extra.installationDate)],
        ...(extra.installationTime ? [["Installation time", extra.installationTime]] : []),
        ["Installation address", order?.shipping_address || "Not provided"],
        ["Products included", products.join("; ")],
        ["Installation status", statusLabel(extra.installationStatus || "Scheduled")],
        ...(order?.inspection_notes ? [["Preparation instructions", order.inspection_notes]] : []),
        ["Customer requirements", "Provide clear access to the installation area and ensure an authorized person is available."],
        ["Questions or concerns", process.env.SUPPORT_EMAIL || "acgc.services00@gmail.com"],
      ],
    },
    overdue_payment: {
      title: "Outstanding project balance",
      summary: "Installation is complete and your project has an outstanding balance. Please settle the remaining amount when convenient.",
      subject: `Outstanding project balance - ${orderIdOf(order)}`,
      status: "Payment reminder",
      action: "View payment details",
      path: "customer-dashboard?tab=orders",
      next: "If you have already paid, please contact us so we can review and update your payment record.",
      fields: [
        ["Installation completed", dateOnly(extra.completedAt)],
        ["Total project cost", money(total)],
        ["Verified payments", money(paid)],
        ["Outstanding balance", money(extra.balance ?? balance)],
      ],
    },
    installation_payment_reminder: {
      title: "Upcoming payment reminder",
      summary: extra.paymentDueDate
        ? "Your agreed payment date is approaching. Please review the payment terms and any remaining downpayment."
        : "Your scheduled installation is approaching. Please review the payment terms and any remaining downpayment before the scheduled date.",
      subject: `Upcoming payment reminder - ${orderIdOf(order)}`,
      status: "Payment due soon",
      action: "View payment details",
      path: "customer-dashboard?tab=orders",
      next: "This is a scheduled reminder, not an overdue payment notice. Contact us if you have already submitted a payment that is awaiting verification.",
      fields: [
        ...(extra.paymentDueDate ? [["Agreed payment date", dateOnly(extra.paymentDueDate)]] : []),
        ["Installation date", dateOnly(extra.installationDate)],
        ["Required downpayment", money(required)],
        ["Verified payments", money(paid)],
        ["Downpayment remaining", money(Math.max(required - paid, 0))],
      ],
    },
    installation_up_next: {
      title: "Installation coming up",
      summary: extra.productName
        ? `Installation for ${extra.productName} is coming up. Our team is preparing for this project stage.`
        : "Installation is coming up. Our team is preparing for this project stage.",
      subject: `Installation coming up - ${orderIdOf(order)}`,
      status: "Coming Up",
      action: "View project progress",
      path: "customer-dashboard?tab=orders",
      next: "Please keep the installation area accessible and clear. We will contact you if we need to confirm anything before our team arrives.",
      fields: [
        ...(extra.productName ? [["Product", extra.productName]] : []),
        ["Installation date", dateOnly(extra.installationDate || order?.estimated_installation_date)],
        ["Installation address", order?.shipping_address || "Not provided"],
        ["Products included", products.join("; ")],
      ],
    },
    installation_completed: {
      title: "Installation complete",
      summary: extra.productName
        ? `Installation for ${extra.productName} has been completed. Thank you for choosing ACGC Aluminum Services!`
        : "Your installation has been completed. Thank you for choosing ACGC Aluminum Services!",
      subject: `Installation complete - ${orderIdOf(order)}`,
      status: "Completed",
      action: "View project details",
      path: "customer-dashboard?tab=orders",
      next: "Thank you for choosing ACGC. If you have any questions about your completed installation, please contact our support team.",
      fields: [
        ...(extra.productName ? [["Product", extra.productName]] : []),
        ["Completed on", dateTime(extra.completedAt)],
        ["Installation address", order?.shipping_address || "Not provided"],
        ["Products included", products.join("; ")],
      ],
    },
  };

  const content = eventContent[event];
  if (!content) throw new Error(`Unsupported order email event: ${event}`);
  const fields = [...common, ...content.fields]
    .filter((field) => field[1] !== undefined && field[1] !== null && String(field[1]).trim() !== "")
    .map(([label, value]) => [label, String(value)]);
  return { ...content, fields };
};

export const buildOrderEmail = (event, order, { audience = "customer", ...extra } = {}) => {
  const content = getEventContent(event, order, audience, extra);
  const actionUrl = buildFrontendUrl(content.path, { orderId: order?._id || order?.id || "" });
  const supportEmail = process.env.SUPPORT_EMAIL || "acgc.services00@gmail.com";
  const { text, html, attachments } = buildCustomerEmailTemplate({
    title: content.title,
    summary: content.summary,
    status: content.status,
    orderId: orderIdOf(order),
    fields: content.fields,
    nextSteps: content.next,
    actionUrl,
    actionLabel: content.action,
    supportEmail,
    supportPhone: process.env.SUPPORT_PHONE,
  });
  return { subject: content.subject, text, html, attachments };
};

export const sendOrderNotification = async (event, order, options = {}) => {
  const recipients = [];
  let linkedCustomer = null;
  if (order?.customer) {
    linkedCustomer = await getCurrentCustomerContact(order.customer?._id || order.customer);
    if (!order.customer_name && linkedCustomer) {
      order.customer_name = [linkedCustomer.first_name, linkedCustomer.last_name].filter(Boolean).join(" ");
    }
  }
  const customerEmail = resolveOrderCustomerEmail(order, options, linkedCustomer);
  const adminEmail = options.adminEmail || process.env.ADMIN_EMAIL;
  if (options.audience !== "admin" && customerEmail) recipients.push({ to: customerEmail, audience: "customer" });
  if (["order_submitted", "payment_proof_submitted", "contract_accepted"].includes(event) && adminEmail && options.audience !== "customer") {
    recipients.push({ to: adminEmail, audience: "admin" });
  }
  const results = await Promise.all(recipients.map(async ({ to, audience }) => {
    try {
      const email = buildOrderEmail(event, order, { ...options, audience });
      await sendMail({ from: process.env.EMAIL_FROM || "ACGC Glass & Aluminum Services <no-reply@acgc.com>", to, ...email });
      return { audience, sent: true };
    } catch (error) {
      console.error(`Order ${event} email failed for ${audience}:`, error);
      return { audience, sent: false, error };
    }
  }));
  return { sent: results.some((result) => result.sent), failed: results.some((result) => !result.sent), results };
};

export const getOrderEmailPaymentTotals = paymentTotals;
export const formatOrderEmailDate = dateTime;
