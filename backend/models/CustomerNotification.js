import mongoose from "mongoose";

const CustomerNotificationSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
  eventKey: { type: String, required: true },
  type: { type: String, enum: ["installation_up_next", "installation_completed", "site_inspection_today", "order_cancellation_warning", "order_cancellation_cooldown", "overdue_payment", "installation_payment_reminder", "feedback_response"], required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  tracking: { type: String, default: "" },
  stageKey: { type: String, required: true },
  stageName: { type: String, required: true },
  itemIndex: { type: Number, default: null },
  productName: { type: String, default: "" },
  completedAt: { type: Date, default: null },
  paymentBalance: { type: Number, min: 0, default: null },
  emailStatus: { type: String, enum: ["not_sent", "pending", "sending", "sent", "failed"], default: "pending" },
  emailAttempts: { type: Number, min: 0, default: 0 },
  emailSentAt: { type: Date, default: null },
  emailLastAttemptAt: { type: Date, default: null },
  emailNextRetryAt: { type: Date, default: null },
  emailError: { type: String, trim: true, default: "" },
}, { timestamps: true });

CustomerNotificationSchema.index({ order: 1, eventKey: 1 }, { unique: true });
CustomerNotificationSchema.index({ customer: 1, createdAt: -1 });

export default mongoose.model("CustomerNotification", CustomerNotificationSchema);
