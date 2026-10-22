import mongoose from "mongoose";
import Order from "../models/Order.js";
import RepairRequest from "../models/RepairRequest.js";
import User from "../models/User.js";
import { buildWarrantyCoverage } from "../services/warranty.js";
import { sendMail } from "../config/mailer.js";

const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const money = (value, label = "Amount") => {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw Object.assign(new Error(`${label} must be zero or more.`), { status: 400 });
  return Math.round(result * 100) / 100;
};
const statusError = (message, status = 409) => Object.assign(new Error(message), { status });
const event = (repair, name, detail, actor) => repair.history.push({ event: name, detail: text(detail), actor: actor?.id || null, actorRole: actor?.role || "system" });
const publicCustomer = (repair) => ({
  _id: repair._id, order: repair.order, orderTracking: repair.orderTracking, productName: repair.productName,
  customerName: repair.customerName, customerEmail: repair.customerEmail, customerPhone: repair.customerPhone,
  issueDescription: repair.issueDescription, mediaUrls: repair.mediaUrls, workflowType: repair.workflowType,
  warranty: repair.warranty, status: repair.status, inspection: repair.inspection, quotation: repair.quotation,
  payment: repair.payment, schedule: repair.schedule, completion: repair.completion, invoiceNumber: repair.invoiceNumber,
  history: repair.history, requestedAt: repair.createdAt, updatedAt: repair.updatedAt,
});
const publicAdmin = (repair) => repair.toObject ? repair.toObject() : repair;
const getRepair = async (id) => mongoose.Types.ObjectId.isValid(id) ? RepairRequest.findById(id) : null;
const quoteCustomer = async (repair, subject, message) => {
  if (!repair.customerEmail) return;
  try { await sendMail({ from: process.env.EMAIL_FROM || "ACGC Services <no-reply@acgc.com>", to: repair.customerEmail, subject, text: message }); }
  catch (error) { console.error("Repair notification failed:", error); }
};
const notifyAdmin = async (subject, message) => {
  const to = process.env.ADMIN_EMAIL;
  if (!to) return;
  try { await sendMail({ from: process.env.EMAIL_FROM || "ACGC Services <no-reply@acgc.com>", to, subject, text: message }); }
  catch (error) { console.error("Repair admin notification failed:", error); }
};

const warrantyForItem = (order, item, now = new Date()) => {
  const period = item?.warranty_period || order.warranty_period;
  const start = item?.warranty_start_date || order.warranty_start_date || order.createdAt;
  let expiry = item?.warranty_expiry_date || (order.items?.length === 1 ? order.warranty_expiry_date : null) || null;
  if (!expiry && period) expiry = buildWarrantyCoverage(start, period, item?.custom_warranty_days || order.custom_warranty_days, now)?.warranty_expiry_date || null;
  const status = String(item?.warranty_status || (order.items?.length === 1 ? order.warranty_status : "") || "").toLowerCase();
  const noWarranty = String(period || "").trim().toLowerCase() === "no warranty" || status === "no_warranty";
  const expiresAt = expiry ? new Date(expiry) : null;
  const active = !noWarranty && (expiresAt ? expiresAt >= now : status === "active");
  return {
    status: noWarranty ? "no_warranty" : active ? "active" : expiresAt ? "expired" : "unknown",
    startsAt: start ? new Date(start) : null,
    expiresAt,
  };
};

export const listCompletedRepairProjects = async (req, res) => {
  const orders = await Order.find({ customer: req.user?.id, status: "completed" })
    .select("tracking items createdAt updatedAt warranty_period custom_warranty_days warranty_status warranty_start_date warranty_expiry_date")
    .sort({ updatedAt: -1 }).limit(500).lean();
  res.json({ success: true, projects: orders.map((order) => ({ _id: order._id, tracking: order.tracking, items: order.items, completedAt: order.updatedAt || order.createdAt })) });
};

export const listRepairRequests = async (req, res) => {
  const filter = { workflowVersion: 2 };
  if (["warranty", "paid"].includes(req.query.type)) filter.workflowType = req.query.type;
  if (["pending_review", "quotation_pending_approval", "customer_accepted", "admin_approved", "scheduled", "in_progress", "completed", "cancelled", "rejected"].includes(req.query.status)) filter.status = req.query.status;
  const repairs = await RepairRequest.find(filter).sort({ updatedAt: -1 }).limit(1000).lean();
  res.json({ success: true, repairs });
};

export const listCustomerRepairRequests = async (req, res) => {
  const repairs = await RepairRequest.find({ customer: req.user.id, workflowVersion: 2 }).sort({ updatedAt: -1 }).lean();
  res.json({ success: true, repairs: repairs.map(publicCustomer) });
};

export const createCustomerRepairRequest = async (req, res) => {
  const orderId = String(req.body?.orderId || req.body?.projectId || "");
  const productIndex = Number(req.body?.productIndex);
  const issueDescription = text(req.body?.issueDescription);
  if (!mongoose.Types.ObjectId.isValid(orderId)) return res.status(400).json({ success: false, message: "Choose a completed order." });
  if (!Number.isInteger(productIndex) || productIndex < 0) return res.status(400).json({ success: false, message: "Choose a product on the order." });
  if (!issueDescription) return res.status(400).json({ success: false, message: "Describe the repair issue." });
  const order = await Order.findOne({ _id: orderId, customer: req.user.id, status: "completed" }).lean();
  const item = order?.items?.[productIndex];
  if (!order || !item) return res.status(404).json({ success: false, message: "Completed order or product not found in your account." });
  const warranty = warrantyForItem(order, item);
  const workflowType = warranty.status === "active" ? "warranty" : "paid";
  if (workflowType === "paid" && req.body?.outOfWarrantyAcknowledged !== true) return res.status(400).json({ success: false, message: "Confirm that this paid repair is subject to inspection and quotation before filing." });
  const mediaUrls = Array.isArray(req.body?.mediaUrls) ? req.body.mediaUrls.slice(0, 6).map((url) => text(url, 1200)).filter((url) => /^https:\/\//i.test(url)) : [];
  const account = await User.findById(req.user.id).select("first_name last_name email phone").lean();
  if (!account) return res.status(404).json({ success: false, message: "Customer account not found." });
  const customerName = [account.first_name, account.last_name].filter(Boolean).join(" ").trim();
  const repair = await RepairRequest.create({
    order: order._id, productIndex, customer: req.user.id, customerName,
    customerEmail: String(account.email || "").trim().toLowerCase(), customerPhone: account.phone || "",
    orderTracking: order.tracking || "", productName: text(item.name, 200) || "Ordered product", issueDescription,
    mediaUrls, workflowType, warranty, status: "pending_review",
    history: [{ event: "pending_review", detail: `Customer filed a ${workflowType === "warranty" ? "warranty claim" : "paid repair request"} for completed order ${order.tracking || ""}.`, actor: req.user.id, actorRole: "customer" }],
  });
  void notifyAdmin(`New ${workflowType === "warranty" ? "warranty claim" : "paid repair request"}: ${repair.productName}`, `${customerName} filed a repair request for ${repair.productName}. Order ${repair.orderTracking}. Issue: ${issueDescription}`);
  res.status(201).json({ success: true, repair: publicCustomer(repair) });
};

export const reviewWarrantyClaim = async (req, res) => {
  const repair = await getRepair(req.params.repairId);
  if (!repair) return res.status(404).json({ success: false, message: "Repair request not found." });
  if (repair.workflowType !== "warranty" || repair.status !== "pending_review") return res.status(409).json({ success: false, message: "Only a pending warranty claim can be approved here." });
  const order = await Order.findById(repair.order).lean();
  const currentWarranty = order?.items?.[repair.productIndex] ? warrantyForItem(order, order.items[repair.productIndex]) : { status: "unknown" };
  if (currentWarranty.status !== "active") {
    repair.workflowType = "paid";
    repair.warranty.status = currentWarranty.status;
    repair.warranty.expiresAt = currentWarranty.expiresAt || repair.warranty.expiresAt;
    await repair.save();
    return res.status(409).json({ success: false, message: "The warranty is no longer active. This claim was switched to a paid repair; issue a quotation." });
  }
  const notes = text(req.body?.inspectionNotes);
  const reason = text(req.body?.decisionReason, 1200);
  if (!notes || !reason) return res.status(400).json({ success: false, message: "Add inspection findings and a coverage decision reason." });
  repair.inspection = { notes, inspectedAt: new Date() };
  repair.warranty.decisionReason = reason;
  repair.status = "admin_approved";
  repair.payment.status = "not_required";
  event(repair, "admin_approved", `Warranty claim approved at no charge. ${reason}`, req.user);
  await repair.save();
  void quoteCustomer(repair, `Warranty claim approved: ${repair.productName}`, `Your warranty repair claim is approved. ACGC will contact you to schedule a service visit. ${notes}`);
  res.json({ success: true, repair: publicAdmin(repair) });
};

export const rejectWarrantyClaim = async (req, res) => {
  const repair = await getRepair(req.params.repairId);
  if (!repair) return res.status(404).json({ success: false, message: "Repair request not found." });
  if (repair.workflowType !== "warranty" || repair.status !== "pending_review") return res.status(409).json({ success: false, message: "Only a pending warranty claim can be rejected here." });
  const notes = text(req.body?.inspectionNotes);
  const reason = text(req.body?.decisionReason, 1200);
  if (!notes || !reason) return res.status(400).json({ success: false, message: "Add inspection findings and a reason for rejecting the claim." });
  repair.inspection = { notes, inspectedAt: new Date() };
  repair.warranty.decisionReason = reason;
  repair.status = "rejected";
  event(repair, "rejected", `Warranty repair request rejected. Reason: ${reason}`, req.user);
  await repair.save();
  void quoteCustomer(repair, `Warranty repair request rejected: ${repair.productName}`, `Your warranty repair request for ${repair.productName} (order ${repair.orderTracking}) was rejected after inspection. Reason: ${reason}. Inspection findings: ${notes}`);
  res.json({ success: true, repair: publicAdmin(repair) });
};

export const issueRepairQuotation = async (req, res) => {
  const repair = await getRepair(req.params.repairId);
  if (!repair) return res.status(404).json({ success: false, message: "Repair request not found." });
  if (!(["pending_review", "quotation_pending_approval"].includes(repair.status))) return res.status(409).json({ success: false, message: "This repair can no longer be quoted." });
  const override = req.body?.voidWarranty === true;
  if (repair.workflowType === "warranty" && !override) return res.status(409).json({ success: false, message: "Approve a covered claim or void its warranty before issuing a paid quotation." });
  const notes = text(req.body?.inspectionNotes);
  const decisionReason = text(req.body?.decisionReason, 1200);
  if (!notes || (override && !decisionReason)) return res.status(400).json({ success: false, message: "Add inspection findings and explain the warranty override." });
  const parts = Array.isArray(req.body?.parts) ? req.body.parts.slice(0, 50).map((part) => ({ description: text(part?.description, 180), cost: money(part?.cost, "Part cost") })).filter((part) => part.description) : [];
  const laborCost = money(req.body?.laborCost, "Labor fee");
  if (!parts.length && laborCost <= 0) return res.status(400).json({ success: false, message: "Add at least one part or a labor fee to the quotation." });
  const total = money(parts.reduce((sum, part) => sum + part.cost, 0) + laborCost, "Quotation total");
  if (override) {
    repair.workflowType = "paid";
    repair.warranty.status = "voided";
    repair.warranty.decisionReason = decisionReason;
    repair.warranty.overriddenAt = new Date();
    repair.warranty.overriddenBy = req.user.id;
  }
  repair.warranty.active = false;
  repair.inspection = { notes, inspectedAt: new Date() };
  repair.quotation = { parts, laborCost, total, notes: text(req.body?.quotationNotes, 2000), issuedAt: new Date(), expiresAt: new Date(Date.now() + 14 * 86400000), customerDecisionAt: null };
  repair.status = "quotation_pending_approval";
  repair.payment = { method: "", status: "pending", receivedAt: null };
  event(repair, "quotation_issued", `Quotation issued for PHP ${total.toFixed(2)}. Parts: ${parts.map((part) => `${part.description} PHP ${part.cost.toFixed(2)}`).join(", ") || "none"}; labor PHP ${laborCost.toFixed(2)}.${override ? ` Warranty voided: ${decisionReason}` : ""}`, req.user);
  await repair.save();
  void quoteCustomer(repair, `Repair quotation ready: ${repair.productName}`, `ACGC has completed an inspection and posted your repair quotation of PHP ${total.toFixed(2)}. Review and accept or decline it in your customer dashboard.`);
  res.json({ success: true, repair: publicAdmin(repair) });
};

export const respondToQuotation = async (req, res) => {
  const repair = await getRepair(req.params.repairId);
  if (!repair || String(repair.customer) !== String(req.user.id)) return res.status(404).json({ success: false, message: "Repair request not found." });
  if (repair.status !== "quotation_pending_approval" || !repair.quotation.issuedAt) return res.status(409).json({ success: false, message: "This repair has no pending quotation." });
  if (repair.quotation.expiresAt && repair.quotation.expiresAt < new Date()) return res.status(409).json({ success: false, message: "This quotation expired. Contact ACGC for a revised quotation." });
  const action = req.body?.action;
  if (action === "decline") {
    repair.status = "cancelled";
    repair.quotation.customerDecisionAt = new Date();
    event(repair, "cancelled", "Customer declined the quotation; the repair request is closed.", req.user);
  } else if (action === "accept") {
    const method = req.body?.paymentMethod;
    if (!["online_downpayment", "cash_on_site"].includes(method)) return res.status(400).json({ success: false, message: "Choose a payment preference to accept the quotation." });
    repair.status = "customer_accepted";
    repair.quotation.customerDecisionAt = new Date();
    repair.payment.method = method;
    event(repair, "customer_accepted", `Customer accepted PHP ${repair.quotation.total.toFixed(2)} and selected ${method}.`, req.user);
  } else return res.status(400).json({ success: false, message: "Choose accept or decline." });
  await repair.save();
  void quoteCustomer(repair, `Quotation ${action === "accept" ? "accepted" : "declined"}: ${repair.productName}`, `${repair.customerName} ${action === "accept" ? "accepted" : "declined"} the repair quotation for ${repair.productName}.`);
  res.json({ success: true, repair: publicCustomer(repair) });
};

export const submitRepairPaymentProof = async (req, res) => {
  const repair = await getRepair(req.params.repairId);
  if (!repair || String(repair.customer) !== String(req.user.id)) return res.status(404).json({ success: false, message: "Repair request not found." });
  if (repair.workflowType !== "paid" || !["customer_accepted", "scheduled", "in_progress"].includes(repair.status)) {
    return res.status(409).json({ success: false, message: "Accept the repair quotation before submitting payment proof." });
  }
  if (repair.payment.proofReviewStatus === "pending") return res.status(409).json({ success: false, message: "Your payment proof is awaiting review." });

  const proofUrl = text(req.body?.proofUrl, 1200);
  const proofFileName = text(req.body?.proofFileName, 255);
  const transactionNumber = text(req.body?.transactionNumber, 180);
  let amount;
  try { amount = money(req.body?.amount, "Payment amount"); }
  catch (error) { return res.status(error.status || 400).json({ success: false, message: error.message }); }
  try {
    const parsed = new URL(proofUrl);
    const isCloudinaryProof = parsed.protocol === "https:" && parsed.hostname === "res.cloudinary.com" && parsed.pathname.includes("/acgc/payment-proofs/");
    const isLocalUploadedProof = parsed.origin === `${req.protocol}://${req.get("host")}` && /^\/uploads\/[\w-]+\.(jpe?g|png|webp|gif|pdf)$/i.test(parsed.pathname);
    if (!isCloudinaryProof && !isLocalUploadedProof) throw new Error("Invalid proof URL");
  } catch {
    return res.status(400).json({ success: false, message: "Upload a valid payment proof using the payment uploader." });
  }
  if (!proofFileName) return res.status(400).json({ success: false, message: "Payment proof filename is required." });
  if (amount < Number(repair.quotation?.total || 0)) return res.status(400).json({ success: false, message: `The submitted amount must cover the full quotation of PHP ${Number(repair.quotation?.total || 0).toFixed(2)}.` });

  repair.payment.proofUrl = proofUrl;
  repair.payment.proofFileName = proofFileName;
  repair.payment.proofAmount = amount;
  repair.payment.proofTransactionNumber = transactionNumber;
  repair.payment.proofSubmittedAt = new Date();
  repair.payment.proofReviewedAt = null;
  repair.payment.proofReviewStatus = "pending";
  repair.payment.proofRejectionReason = "";
  event(repair, "payment_proof_submitted", `Customer submitted payment proof for PHP ${amount.toFixed(2)}${transactionNumber ? `, reference ${transactionNumber}` : ""}.`, req.user);
  await repair.save();
  void notifyAdmin(`Repair payment proof submitted: ${repair.productName}`, `${repair.customerName} submitted payment proof for repair ${repair.orderTracking}. Review the payment proof in the repair management queue.`);
  res.json({ success: true, repair: publicCustomer(repair) });
};

export const reviewRepairPaymentProof = async (req, res) => {
  const repair = await getRepair(req.params.repairId);
  if (!repair) return res.status(404).json({ success: false, message: "Repair request not found." });
  if (repair.workflowType !== "paid" || repair.payment.proofReviewStatus !== "pending") return res.status(409).json({ success: false, message: "There is no pending repair payment proof to review." });

  const action = req.body?.action;
  if (action === "approve") {
    if (Number(repair.payment.proofAmount || 0) < Number(repair.quotation?.total || 0)) return res.status(409).json({ success: false, message: "The submitted proof does not cover the full quotation." });
    repair.payment.proofReviewStatus = "approved";
    repair.payment.proofRejectionReason = "";
    repair.payment.status = "received";
    repair.payment.receivedAt = new Date();
    repair.payment.proofReviewedAt = new Date();
    event(repair, "payment_proof_approved", `Payment proof approved for PHP ${Number(repair.payment.proofAmount).toFixed(2)}.`, req.user);
  } else if (action === "reject") {
    const reason = text(req.body?.reason, 1200);
    if (!reason) return res.status(400).json({ success: false, message: "Provide a reason for rejecting this payment proof." });
    repair.payment.proofReviewStatus = "rejected";
    repair.payment.proofRejectionReason = reason;
    repair.payment.status = "pending";
    repair.payment.receivedAt = null;
    repair.payment.proofReviewedAt = new Date();
    event(repair, "payment_proof_rejected", `Payment proof rejected: ${reason}`, req.user);
  } else return res.status(400).json({ success: false, message: "Choose approve or reject." });

  await repair.save();
  const approved = action === "approve";
  void quoteCustomer(repair, `Repair payment proof ${approved ? "approved" : "needs correction"}: ${repair.productName}`, approved
    ? `Your payment proof for ${repair.productName} was verified. The repair team can continue with the service.`
    : `Your payment proof for ${repair.productName} could not be verified. Reason: ${repair.payment.proofRejectionReason} Please submit a corrected proof in your Warranty & Repair Service page.`);
  res.json({ success: true, repair: publicAdmin(repair) });
};

export const scheduleRepair = async (req, res) => {
  const repair = await getRepair(req.params.repairId);
  if (!repair) return res.status(404).json({ success: false, message: "Repair request not found." });
  if (!["customer_accepted", "admin_approved", "scheduled"].includes(repair.status)) return res.status(409).json({ success: false, message: "Approve the warranty claim or receive quotation acceptance before scheduling." });
  const date = new Date(req.body?.date);
  const technician = text(req.body?.technician, 180);
  if (Number.isNaN(date.getTime()) || !technician) return res.status(400).json({ success: false, message: "Choose a valid service date and assign a technician." });
  repair.schedule = { date, technician, notes: text(req.body?.notes, 1200) };
  repair.status = "scheduled";
  event(repair, "scheduled", `Service visit scheduled for ${date.toLocaleString("en-PH")} with ${technician}.${repair.schedule.notes ? ` ${repair.schedule.notes}` : ""}`, req.user);
  await repair.save();
  void quoteCustomer(repair, `Repair visit scheduled: ${repair.productName}`, `Your technician ${technician} is scheduled to visit on ${date.toLocaleString("en-PH")}.`);
  res.json({ success: true, repair: publicAdmin(repair) });
};

export const startRepair = async (req, res) => {
  const repair = await getRepair(req.params.repairId);
  if (!repair) return res.status(404).json({ success: false, message: "Repair request not found." });
  if (repair.status !== "scheduled") return res.status(409).json({ success: false, message: "Only a scheduled repair can be started." });
  repair.status = "in_progress";
  event(repair, "in_progress", `Repair work started by ${repair.schedule.technician || "the assigned technician"}.`, req.user);
  await repair.save();
  res.json({ success: true, repair: publicAdmin(repair) });
};

export const completeRepair = async (req, res) => {
  const repair = await getRepair(req.params.repairId);
  if (!repair) return res.status(404).json({ success: false, message: "Repair request not found." });
  if (repair.status !== "in_progress") return res.status(409).json({ success: false, message: "Only an in-progress repair can be completed." });
  const notes = text(req.body?.notes);
  if (!notes) return res.status(400).json({ success: false, message: "Add completion notes." });
  if (repair.workflowType === "paid" && repair.payment.proofReviewStatus === "pending") return res.status(409).json({ success: false, message: "Review the customer's pending payment proof before completing this repair." });
  const amountPaid = repair.workflowType === "warranty" ? 0 : repair.payment.proofReviewStatus === "approved"
    ? Number(repair.payment.proofAmount || 0)
    : money(req.body?.amountPaid ?? repair.quotation.total, "Paid amount");
  if (repair.workflowType === "paid" && ((repair.payment.proofReviewStatus !== "approved" && req.body?.paymentReceived !== true) || amountPaid < repair.quotation.total)) return res.status(409).json({ success: false, message: "Verify the customer's payment proof or confirm receipt of the full quoted amount before completing this paid repair." });
  const evidenceUrls = Array.isArray(req.body?.evidenceUrls) ? req.body.evidenceUrls.slice(0, 10).map((url) => text(url, 1200)).filter((url) => /^https:\/\//i.test(url)) : [];
  repair.completion = { notes, amountPaid, evidenceUrls, completedAt: new Date() };
  repair.payment.status = repair.workflowType === "warranty" ? "not_required" : "received";
  repair.payment.receivedAt = repair.workflowType === "warranty" ? null : new Date();
  repair.invoiceNumber = `ACGC-R-${String(repair._id).slice(-8).toUpperCase()}`;
  repair.status = "completed";
  event(repair, "completed", notes, req.user);
  await repair.save();
  void quoteCustomer(repair, `Repair completed: ${repair.productName}`, `Your repair is complete. Invoice ${repair.invoiceNumber}. Total: PHP ${amountPaid.toFixed(2)}. Download or print it from your service history.`);
  res.json({ success: true, repair: publicAdmin(repair) });
};
