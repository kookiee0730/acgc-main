import mongoose from "mongoose";

const RepairEventSchema = new mongoose.Schema({
  event: { type: String, required: true, trim: true },
  detail: { type: String, default: "", trim: true },
  actor: { type: mongoose.Schema.Types.ObjectId, default: null },
  actorRole: { type: String, default: "system" },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const PartSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true, maxlength: 180 },
  cost: { type: Number, required: true, min: 0 },
}, { _id: false });

const RepairRequestSchema = new mongoose.Schema({
  workflowVersion: { type: Number, default: 2, immutable: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null, index: true },
  productIndex: { type: Number, default: 0, min: 0 },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  customerName: { type: String, required: true, trim: true },
  customerEmail: { type: String, default: "", trim: true, lowercase: true },
  customerPhone: { type: String, default: "", trim: true },
  orderTracking: { type: String, default: "", trim: true },
  productName: { type: String, required: true, trim: true },
  installationDate: { type: Date, default: null },
  issueDescription: { type: String, required: true, trim: true, maxlength: 4000 },
  mediaUrls: { type: [String], default: [] },
  workflowType: { type: String, enum: ["warranty", "paid"], required: true, index: true },
  createdByAdmin: { type: Boolean, default: false, index: true },
  warranty: {
    status: { type: String, enum: ["active", "expired", "voided", "no_warranty", "unknown"], default: "unknown" },
    startsAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    decisionReason: { type: String, default: "", trim: true },
    overriddenAt: { type: Date, default: null },
    overriddenBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  status: { type: String, enum: ["pending_review", "quotation_pending_approval", "customer_accepted", "admin_approved", "scheduled", "in_progress", "completed", "cancelled", "rejected"], default: "pending_review", index: true },
  inspection: { notes: { type: String, default: "", trim: true }, inspectedAt: { type: Date, default: null } },
  quotation: {
    parts: { type: [PartSchema], default: [] },
    laborCost: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0, default: 0 },
    notes: { type: String, default: "", trim: true },
    issuedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    customerDecisionAt: { type: Date, default: null },
  },
  payment: {
    method: { type: String, enum: ["online_downpayment", "cash_on_site", ""], default: "" },
    status: { type: String, enum: ["not_required", "pending", "received"], default: "pending" },
    receivedAt: { type: Date, default: null },
    proofUrl: { type: String, default: "", trim: true },
    proofFileName: { type: String, default: "", trim: true },
    proofAmount: { type: Number, min: 0, default: null },
    proofTransactionNumber: { type: String, default: "", trim: true },
    proofSubmittedAt: { type: Date, default: null },
    proofReviewedAt: { type: Date, default: null },
    proofReviewStatus: { type: String, enum: ["none", "pending", "approved", "rejected"], default: "none" },
    proofRejectionReason: { type: String, default: "", trim: true },
  },
  schedule: { date: { type: Date, default: null }, startDate: { type: Date, default: null }, finishDate: { type: Date, default: null }, notes: { type: String, default: "", trim: true } },
  completion: { notes: { type: String, default: "", trim: true }, amountPaid: { type: Number, min: 0, default: null }, evidenceUrls: { type: [String], default: [] }, completedAt: { type: Date, default: null } },
  invoiceNumber: { type: String, default: "", trim: true },
  history: { type: [RepairEventSchema], default: [] },
}, { timestamps: true });

RepairRequestSchema.index({ customer: 1, updatedAt: -1 });
RepairRequestSchema.index({ workflowType: 1, status: 1, updatedAt: -1 });

export default mongoose.model("RepairRequest", RepairRequestSchema);
