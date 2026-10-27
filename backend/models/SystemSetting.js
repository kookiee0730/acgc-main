import mongoose from "mongoose";

const SystemSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    maintenance_mode: { type: Boolean, default: false },
    global_permissions: { type: mongoose.Schema.Types.Mixed, default: {} },
    business_hours: { type: mongoose.Schema.Types.Mixed, default: { open: "08:00", close: "18:00", timezone: "Asia/Manila" } },
    backup_schedule: { type: String, default: "weekly" },
    backup_schedule_time: { type: String, default: "00:00" },
    backup_status: { type: String, default: "Success" },
    last_backup_at: { type: Date, default: null },
    last_scheduled_backup_key: { type: String, default: null },
    scheduled_backup_lock: { type: mongoose.Schema.Types.Mixed, default: null },
    backup_history: { type: [mongoose.Schema.Types.Mixed], default: [] },
    backup_recovery_password_salt: { type: String, default: null, select: false },
    backup_recovery_password_hash: { type: String, default: null, select: false },
    backup_recovery_password_display: { type: String, default: null, select: false },
    backup_recovery_password_set_at: { type: Date, default: null },
    backup_recovery_password_reset_code_hash: { type: String, default: null, select: false },
    backup_recovery_password_reset_expires_at: { type: Date, default: null, select: false },
    backup_recovery_password_reset_sent_at: { type: Date, default: null, select: false },
    backup_recovery_password_reset_attempts: { type: Number, default: 0, select: false },
    backup_recovery_password_reset_window_started_at: { type: Date, default: null, select: false },
    backup_recovery_password_reset_request_count: { type: Number, default: 0, select: false },
    backup_recovery_password_reset_lock_until: { type: Date, default: null, select: false },
    backup_restore_lock: { type: mongoose.Schema.Types.Mixed, default: null, select: false },
    backup_create_lock: { type: mongoose.Schema.Types.Mixed, default: null, select: false },
  },
  { timestamps: true }
);

export default mongoose.model("SystemSetting", SystemSettingSchema);
