import mongoose from "mongoose";

const ScheduleReservationSchema = new mongoose.Schema({
  _id: { type: String },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
}, { timestamps: true, versionKey: false });

export default mongoose.model("ScheduleReservation", ScheduleReservationSchema);
