import mongoose from "mongoose";

const CustomerNotificationSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
  eventKey: { type: String, required: true },
  type: { type: String, enum: ["installation_up_next", "installation_completed", "site_inspection_today", "order_cancellation_warning", "order_cancellation_cooldown"], required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  tracking: { type: String, default: "" },
  stageKey: { type: String, required: true },
  stageName: { type: String, required: true },
  itemIndex: { type: Number, default: null },
  productName: { type: String, default: "" },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

CustomerNotificationSchema.index({ order: 1, eventKey: 1 }, { unique: true });
CustomerNotificationSchema.index({ customer: 1, createdAt: -1 });

export default mongoose.model("CustomerNotification", CustomerNotificationSchema);
