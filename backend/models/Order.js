import mongoose from "mongoose";

const OrderItemSchema = new mongoose.Schema(
  {
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    unit_price: {
      type: Number,
      required: true,
      default: 0,
    },
    pricing_method: {
      type: String,
      trim: true,
      default: "",
    },
    price_per_sqft: {
      type: Number,
      default: 0,
      min: 0,
    },
    price_per_blade: {
      type: Number,
      default: 0,
      min: 0,
    },
    blade_glass_type: { type: String, trim: true, default: "" },
    sale_mode: { type: String, enum: ["blades_only", "frame", ""], default: "" },
    frame_type: { type: String, trim: true, default: "" },
    frame_price: { type: Number, min: 0, default: 0 },
    custom_frame_size: { type: Boolean, default: false },
    blade_glass_types: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    sell_blades_only: {
      type: Boolean,
      default: true,
    },
    sell_with_frame: {
      type: Boolean,
      default: false,
    },
    blade_frame_types: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    allow_custom_frame_size: {
      type: Boolean,
      default: false,
    },
    custom_frame_size_unit: {
      type: String,
      enum: ["in", "ft", "cm", "m"],
      default: "in",
    },
    minimum_blades: {
      type: Number,
      default: 1,
      min: 1,
    },
    maximum_blades: {
      type: Number,
      default: 0,
      min: 0,
    },
    customer_can_choose_blade_count: {
      type: Boolean,
      default: false,
    },
    default_blade_glass_type: { type: String, trim: true, default: "" },
    default_sale_mode: { type: String, enum: ["blades_only", "frame", ""], default: "" },
    default_frame_type: { type: String, trim: true, default: "" },
    show_price_per_blade: {
      type: Boolean,
      default: true,
    },
    base_price: {
      type: Number,
      default: 0,
      min: 0,
    },
    blade_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    estimated_price_override: {
      type: Number,
      default: 0,
      min: 0,
    },
    customization_fee: {
      type: Number,
      default: 0,
      min: 0,
    },
    customization: {
      type: Boolean,
      default: false,
    },
    extra_charges: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    size_limits: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    line_total: {
      type: Number,
      default: 0,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      default: 1,
    },
    unit: {
      type: String,
      default: "piece",
    },
    category: {
      type: String,
      trim: true,
      default: "",
    },
    product_type: {
      type: String,
      trim: true,
      default: "",
    },
    width: {
      type: Number,
      default: 0,
      min: 0,
    },
    height: {
      type: Number,
      default: 0,
      min: 0,
    },
    measurement_unit: {
      type: String,
      default: "in",
    },
    area: {
      type: Number,
      default: 0,
      min: 0,
    },
    estimation_mode: {
      type: String,
      enum: ["auto", "manual"],
      default: "auto",
    },
    manual_estimated_total: {
      type: Number,
      default: 0,
      min: 0,
    },
    estimated_price: {
      type: Number,
      default: 0,
      min: 0,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    warranty_period: {
      type: String,
      trim: true,
      default: "",
    },
    custom_warranty_days: {
      type: Number,
      default: null,
    },
    warranty_start_date: {
      type: Date,
      default: null,
    },
    warranty_expiry_date: {
      type: Date,
      default: null,
    },
    warranty_status: {
      type: String,
      trim: true,
      default: "",
    },
    customized: {
      type: Boolean,
      default: false,
    },
    dimensions: {
      width: {
        type: Number,
        default: 0,
        min: 0,
      },
      height: {
        type: Number,
        default: 0,
        min: 0,
      },
      unit: {
        type: String,
        trim: true,
        default: "in",
      },
      quantity: {
        type: Number,
        default: 1,
        min: 0,
      },
      customized: {
        type: Boolean,
        default: false,
      },
    },
    is_estimate: {
      type: Boolean,
      default: false,
    },
    review: {
      rating: { type: Number, min: 1, max: 5, default: null },
      title: { type: String, trim: true, default: "" },
      comment: { type: String, trim: true, default: "" },
      tags: { type: [String], default: [] },
      photos: { type: [String], default: [] },
      hiddenFromCustomers: { type: Boolean, default: false },
      submittedAt: { type: Date, default: null },
      updatedAt: { type: Date, default: null },
    },
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    progress_stages: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  { _id: false }
);

const PaymentAmountChangeSchema = new mongoose.Schema({
  previous_amount: { type: Number, min: 0, required: true },
  new_amount: { type: Number, min: 0, required: true },
  reason: { type: String, trim: true, required: true },
  changed_at: { type: Date, default: Date.now },
  changed_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  changed_by_name: { type: String, trim: true, default: "" },
  changed_by_role: { type: String, trim: true, default: "" },
}, { _id: false });

const DownpaymentExceptionSchema = new mongoose.Schema({
  status: { type: String, enum: ["pending", "approved", "rejected", "cancelled"], required: true },
  accepted_amount: { type: Number, min: 0, required: true },
  required_amount: { type: Number, min: 0, required: true },
  shortfall: { type: Number, min: 0, required: true },
  total_paid_at_approval: { type: Number, min: 0, required: true },
  reason: { type: String, trim: true, default: "" },
  seller_approval_party: { type: String, trim: true, maxlength: 200, default: "" },
  seller_approval_confirmed_at: { type: Date, default: null },
  seller_approval_confirmed_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  requested_at: { type: Date, default: null },
  requested_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  approved_at: { type: Date, default: null },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { _id: false });

const PaymentSupportingDocumentSchema = new mongoose.Schema({
  client_upload_id: { type: String, trim: true, required: true },
  original_name: { type: String, trim: true, required: true, maxlength: 255 },
  public_id: { type: String, trim: true, default: "" },
  resource_type: { type: String, enum: ["image", "raw"], default: "raw" },
  format: { type: String, trim: true, required: true },
  storage: { type: String, enum: ["cloudinary", "local"], required: true },
  storage_key: { type: String, trim: true, default: "" },
  uploaded_by: { type: mongoose.Schema.Types.ObjectId, required: true },
  uploaded_by_role: { type: String, enum: ["admin", "super_admin"], required: true },
  uploaded_by_name: { type: String, trim: true, default: "" },
  uploaded_at: { type: Date, default: Date.now },
}, { timestamps: false });

const PaymentDiscrepancyStatusChangeSchema = new mongoose.Schema({
  status: { type: String, enum: ["pending_review", "under_review", "resolved"], required: true },
  note: { type: String, trim: true, default: "" },
  changed_at: { type: Date, default: Date.now },
  changed_by: { type: mongoose.Schema.Types.ObjectId, default: null },
  changed_by_name: { type: String, trim: true, default: "" },
  changed_by_role: { type: String, trim: true, default: "" },
}, { _id: false });

const PaymentDiscrepancySchema = new mongoose.Schema({
  customer_reported_amount: { type: Number, min: 0, required: true },
  admin_recorded_amount: { type: Number, min: 0, required: true },
  difference: { type: Number, min: 0, required: true },
  status: { type: String, enum: ["pending_review", "under_review", "resolved"], default: "pending_review" },
  reason: { type: String, trim: true, default: "" },
  detected_at: { type: Date, default: Date.now },
  detected_by: { type: mongoose.Schema.Types.ObjectId, default: null },
  detected_by_name: { type: String, trim: true, default: "" },
  detected_by_role: { type: String, trim: true, default: "" },
  resolution_note: { type: String, trim: true, default: "" },
  resolved_at: { type: Date, default: null },
  resolved_by: { type: mongoose.Schema.Types.ObjectId, default: null },
  resolved_by_name: { type: String, trim: true, default: "" },
  resolved_by_role: { type: String, trim: true, default: "" },
  status_history: { type: [PaymentDiscrepancyStatusChangeSchema], default: [] },
}, { timestamps: false });

const PaymentRecordSchema = new mongoose.Schema({
  request_id: { type: String, trim: true, default: "" },
  record_source: { type: String, enum: ["customer_submitted", "admin_recorded"], default: "customer_submitted" },
  submitted_amount: { type: Number, min: 0, default: null },
  verified_amount: { type: Number, min: 0, default: null },
  status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending", index: true },
  payment_method: { type: String, trim: true, default: "Cash" },
  transaction_number: { type: String, trim: true, default: "" },
  proof_file_name: { type: String, trim: true, default: "" },
  proof_file_url: { type: String, trim: true, default: "" },
  supporting_documents: { type: [PaymentSupportingDocumentSchema], default: [] },
  discrepancies: { type: [PaymentDiscrepancySchema], default: [] },
  submitted_at: { type: Date, default: Date.now },
  payment_date: { type: Date, default: null },
  recorded_at: { type: Date, default: null },
  recorded_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  verified_at: { type: Date, default: null },
  rejected_at: { type: Date, default: null },
  verified_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  admin_reason: { type: String, trim: true, default: "" },
  downpayment_exception: { type: DownpaymentExceptionSchema, default: null },
  amount_history: { type: [PaymentAmountChangeSchema], default: [] },
}, { timestamps: true });

const OrderSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    cart_item_ids: {
      type: [String],
      default: [],
    },
    customer_name: {
      type: String,
      trim: true,
      default: "",
    },
    customer_phone: {
      type: String,
      trim: true,
      default: "",
    },
    items: {
      type: [OrderItemSchema],
      default: [],
    },
    payment_terms: {
      type: String,
      trim: true,
      default: "",
    },
    agreed_payment_date: {
      type: Date,
      default: null,
    },
    has_account_on_website: {
      type: Boolean,
      default: false,
    },
    downpayment_received: {
      type: Boolean,
      default: false,
    },
    manual_override: {
      type: Number,
      default: 0,
    },
    estimated_cost: {
      type: Number,
      min: 0,
      default: 0,
    },
    final_project_cost: {
      type: Number,
      min: 0,
      default: 0,
    },
    attachments: {
      type: [String],
      default: [],
    },
    total_amount: {
      type: Number,
      required: true,
      default: 0,
    },
    payment_proof_amount: {
      type: Number,
      default: 0,
    },
    payment_records: {
      type: [PaymentRecordSchema],
      default: [],
    },
    payment_ledger_initialized: {
      type: Boolean,
      default: false,
    },
    legacy_verified_amount: {
      type: Number,
      min: 0,
      default: 0,
    },
    amount_paid: {
      type: Number,
      min: 0,
    },
    payment_proof_submitted_at: {
      type: Date,
      default: null,
    },
    payment_proof_confirmed_at: {
      type: Date,
      default: null,
    },
    payment_proof_file_name: {
      type: String,
      trim: true,
      default: "",
    },
    payment_proof_file_url: {
      type: String,
      trim: true,
      default: "",
    },
    payment_method: {
      type: String,
      trim: true,
      default: "",
    },
    transaction_number: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: [
        "order_submitted",
        "admin_review",
        "site_inspection",
        "contract_sent",
        "contract_accepted",
        "approved",
        "contract_declined",
        "processing",
        "completed",
        "cancelled",
      ],
      default: "order_submitted",
    },
    cancellation_reason: {
      type: String,
      trim: true,
      default: "",
    },
    customer_cancellation_count_at_cancel: {
      type: Number,
      min: 0,
      default: null,
    },
    is_rush_order: {
      type: Boolean,
      default: false,
      index: true,
    },
    order_type: {
      type: String,
      enum: ["online_order", "walk_in_customer"],
      default: "online_order",
    },
    contract_status: {
      type: String,
      enum: ["pending", "sent", "accepted", "declined"],
      default: "pending",
    },
    payment_status: {
      type: String,
      enum: ["not_paid", "pending", "partial_downpayment", "downpayment", "partial", "paid"],
      default: "pending",
    },
    tracking: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    customer_email: {
      type: String,
      trim: true,
      default: "",
    },
    shipping_address: {
      type: String,
      default: "",
    },
    inspection_status: {
      type: String,
      enum: ["pending", "scheduled", "completed", "failed"],
      default: "pending",
    },
    inspection_completed_at: {
      type: Date,
      default: null,
    },
    inspection_date: {
      type: Date,
      default: null,
    },
    estimated_installation_date: {
      type: Date,
      default: null,
    },
    inspection_notes: {
      type: String,
      trim: true,
      default: "",
    },
    issues_found: {
      type: Boolean,
      default: false,
    },
    // Progress tracking
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    progress_stages: {
      type: [
        new mongoose.Schema(
          {
            key: { type: String, trim: true, default: "" },
            name: { type: String, trim: true, default: "" },
            status: {
              type: String,
              enum: ["pending", "in_progress", "done", "delayed", "on_hold"],
              default: "pending",
            },
            completed: { type: Boolean, default: false },
            date: { type: Date, default: null },
            delayReason: { type: String, trim: true, default: "" },
            delayExpectedResolution: { type: Date, default: null },
            delayNotes: { type: String, trim: true, default: "" },
            delayReportedAt: { type: Date, default: null },
            delayReportedBy: { type: String, trim: true, default: "" },
            installationStartedAt: { type: Date, default: null },
            installationCompletedAt: { type: Date, default: null },
            proposedInstallationDate: { type: Date, default: null },
            proposedInstallationTime: { type: String, trim: true, default: "" },
            customerResponse: {
              type: String,
              enum: ["pending", "accepted", "declined", "reschedule_requested"],
              default: "pending",
            },
            customerResponseAt: { type: Date, default: null },
            customerDeclineReason: { type: String, trim: true, default: "" },
            customerPreferredInstallationDate: { type: Date, default: null },
            customerPreferredInstallationTime: { type: String, trim: true, default: "" },
            customerRescheduleNotes: { type: String, trim: true, default: "" },
            delayHistory: {
              type: [
                new mongoose.Schema(
                  {
                    reason: { type: String, trim: true, default: "" },
                    expectedResolution: { type: Date, default: null },
                    notes: { type: String, trim: true, default: "" },
                    reportedAt: { type: Date, default: null },
                    reportedBy: { type: String, trim: true, default: "" },
                    status: { type: String, trim: true, default: "delayed" },
                    resolvedAt: { type: Date, default: null },
                  },
                  { _id: false }
                ),
              ],
              default: [],
            },
            images: { type: [String], default: [] },
            subStages: {
              type: [
                new mongoose.Schema(
                  {
                    name: { type: String, trim: true, default: "" },
                    description: { type: String, trim: true, default: "" },
                    status: {
                      type: String,
                      enum: ["pending", "in_progress", "done", "delayed", "on_hold"],
                      default: "pending",
                    },
                    completed: { type: Boolean, default: false },
                    date: { type: Date, default: null },
                    images: { type: [String], default: [] },
                  },
                  { _id: false }
                ),
              ],
              default: [],
            },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    contract_terms: {
      type: String,
      trim: true,
      default: "",
    },
    contract_amount: {
      type: Number,
      default: 0,
    },
    downpayment_amount: {
      type: Number,
      default: 0,
    },
    required_downpayment_amount: {
      type: Number,
      min: 0,
    },
    contractGenerated: {
      type: Boolean,
      default: false,
    },
    contractId: {
      type: String,
      trim: true,
      default: "",
    },
    contractVersion: {
      type: Number,
      default: 0,
    },
    currentContractVersion: {
      type: Number,
      default: 0,
    },
    contractGeneratedAt: {
      type: Date,
      default: null,
    },
    contractNeedsRegeneration: {
      type: Boolean,
      default: false,
    },
    contractStatus: {
      type: String,
      trim: true,
      default: "Not Generated",
    },
    contractSentAt: {
      type: Date,
      default: null,
    },
    contract_email_status: {
      type: String,
      enum: ["not_sent", "queued", "sent", "failed"],
      default: "not_sent",
    },
    contract_email_queued_at: {
      type: Date,
      default: null,
    },
    contract_email_sent_at: {
      type: Date,
      default: null,
    },
    contract_email_error: {
      type: String,
      trim: true,
      default: "",
    },
    contractDeclineReason: {
      type: String,
      trim: true,
      default: "",
    },
    contractDeclinedAt: {
      type: Date,
      default: null,
    },
    acceptedByCustomer: {
      type: Boolean,
      default: false,
    },
    acceptanceMethod: {
      type: String,
      trim: true,
      default: "",
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    transactionCreated: {
      type: Boolean,
      default: false,
    },
    transactionCreatedAt: {
      type: Date,
      default: null,
    },
    transaction_approved: {
      type: Boolean,
      default: false,
    },
    transaction_approved_at: {
      type: Date,
      default: null,
    },
    transaction_approved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    contractSnapshot: {
      type: Object,
      default: {},
    },
    contractHistory: {
      type: [
        new mongoose.Schema(
          {
            version: { type: Number, default: 1 },
            contractId: { type: String, trim: true, default: "" },
            generatedAt: { type: Date, default: null },
            status: { type: String, trim: true, default: "Current" },
            acceptedAt: { type: Date, default: null },
            acceptanceMethod: { type: String, trim: true, default: "" },
            snapshot: { type: Object, default: {} },
          },
          { _id: false }
        )
      ],
      default: [],
    },
    price_change_history: {
      type: [
        new mongoose.Schema(
          {
            changed_at: { type: Date, default: Date.now },
            changed_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
            changed_by_name: { type: String, trim: true, default: "" },
            reason: { type: String, trim: true, default: "" },
            previous_total: { type: Number, min: 0, default: 0 },
            new_total: { type: Number, min: 0, default: 0 },
            optional_charge_changes: { type: [mongoose.Schema.Types.Mixed], default: [] },
          },
          { _id: false }
        )
      ],
      default: [],
    },
    warranty_assignment_mode: {
      type: String,
      enum: ["same", "per_product"],
      default: "same",
    },
    warranty_period: {
      type: String,
      trim: true,
      default: "",
    },
    custom_warranty_days: {
      type: Number,
      default: null,
    },
    warranty_start_date: {
      type: Date,
      default: null,
    },
    warranty_expiry_date: {
      type: Date,
      default: null,
    },
    warranty_status: {
      type: String,
      trim: true,
      default: "",
    },
    warranty_terms: {
      type: String,
      trim: true,
      default: "",
    },
    review: {
      rating: {
        type: Number,
        min: 1,
        max: 5,
        default: null,
      },
      title: {
        type: String,
        trim: true,
        default: "",
      },
      comment: {
        type: String,
        trim: true,
        default: "",
      },
      tags: {
        type: [String],
        default: [],
      },
      photos: {
        type: [String],
        default: [],
      },
      hiddenFromCustomers: {
        type: Boolean,
        default: false,
      },
      submittedAt: {
        type: Date,
        default: null,
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
    // Walk-in customer specific fields
    acceptance_method: {
      type: String,
      enum: ["online", "walk_in_signed_contract", "walk_in_pending_contract"],
      default: "online",
    },
    signed_contract_url: {
      type: String,
      trim: true,
      default: "",
    },
    contract_number: {
      type: String,
      trim: true,
      default: "",
    },
    contract_signed_date: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

OrderSchema.index({ customer: 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ contract_status: 1, createdAt: -1 });
OrderSchema.index({ payment_proof_submitted_at: -1 });
OrderSchema.index({ updatedAt: -1 });
OrderSchema.index({ customer_email: 1 });

export default mongoose.model("Order", OrderSchema);
