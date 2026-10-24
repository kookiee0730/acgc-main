import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const AdminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    pending_email: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
    pending_email_verification_code: {
      type: String,
      default: null,
    },
    pending_email_verification_expires: {
      type: Date,
      default: null,
    },
    pending_email_verification_attempts: {
      type: Number,
      default: 0,
    },
    pending_email_verification_sent_at: {
      type: Date,
      default: null,
    },
    pending_username: { type: String, lowercase: true, trim: true, minlength: 6, maxlength: 12, default: null },
    pending_username_verification_code: { type: String, default: null },
    pending_username_verification_expires: { type: Date, default: null },
    pending_username_verification_attempts: { type: Number, default: 0 },
    pending_username_verification_sent_at: { type: Date, default: null },
    username_change_verified_until: { type: Date, default: null },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    first_name: {
      type: String,
      required: true,
      trim: true,
    },
    last_name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    street_address: {
      type: String,
      default: "",
      trim: true,
    },
    city: {
      type: String,
      default: "",
      trim: true,
    },
    province: {
      type: String,
      default: "",
      trim: true,
    },
    zip_code: {
      type: String,
      default: "",
      trim: true,
    },
    session_version: {
      type: Number,
      default: 0,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    password_reset_code: {
      type: String,
      default: null,
      select: false,
    },
    password_reset_expires: {
      type: Date,
      default: null,
    },
    password_reset_sent_at: {
      type: Date,
      default: null,
    },
    password_reset_attempts: {
      type: Number,
      default: 0,
    },
    password_reset_request_window_started_at: {
      type: Date,
      default: null,
    },
    password_reset_request_count: {
      type: Number,
      default: 0,
    },
    password_reset_request_lock_until: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

AdminSchema.index(
  { pending_email: 1 },
  { unique: true, partialFilterExpression: { pending_email: { $type: "string" } } },
);
AdminSchema.index(
  { pending_username: 1 },
  { unique: true, partialFilterExpression: { pending_username: { $type: "string" } } },
);

AdminSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

AdminSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

AdminSchema.methods.toJSON = function () {
  const admin = this.toObject();
  delete admin.password;
  delete admin.password_reset_code;
  delete admin.password_reset_expires;
  delete admin.password_reset_sent_at;
  delete admin.password_reset_attempts;
  delete admin.password_reset_request_window_started_at;
  delete admin.password_reset_request_count;
  delete admin.password_reset_request_lock_until;
  delete admin.pending_email;
  delete admin.pending_email_verification_code;
  delete admin.pending_email_verification_expires;
  delete admin.pending_email_verification_attempts;
  delete admin.pending_email_verification_sent_at;
  delete admin.pending_username;
  delete admin.pending_username_verification_code;
  delete admin.pending_username_verification_expires;
  delete admin.pending_username_verification_attempts;
  delete admin.pending_username_verification_sent_at;
  delete admin.username_change_verified_until;
  return admin;
};

export default mongoose.model("Admin", AdminSchema);
