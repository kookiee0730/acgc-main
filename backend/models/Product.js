import mongoose from "mongoose";

const ExtraChargeSchema = new mongoose.Schema({
  name: { type: String, trim: true, required: true },
  type: { type: String, enum: ["fixed", "per_sqft", "per_blade", "percentage"], default: "fixed" },
  amount: { type: Number, min: 0, default: 0 },
  is_active: { type: Boolean, default: true },
  is_optional: { type: Boolean, default: false },
  is_default_selected: { type: Boolean, default: false },
}, { _id: false });

const SizeLimitsSchema = new mongoose.Schema({
  min_width: { type: Number, min: 0, default: 0 },
  max_width: { type: Number, min: 0, default: 0 },
  min_height: { type: Number, min: 0, default: 0 },
  max_height: { type: Number, min: 0, default: 0 },
  unit: { type: String, enum: ["in", "ft", "cm", "m"], default: "in" },
}, { _id: false });

const BladeGlassTypeSchema = new mongoose.Schema({
  name: { type: String, trim: true, required: true },
  price_per_blade: { type: Number, min: 0, required: true },
}, { _id: false });

const BladeFrameTypeSchema = new mongoose.Schema({
  name: { type: String, trim: true, required: true },
  blade_count: { type: Number, min: 1, required: true },
  price: { type: Number, min: 0, required: true },
}, { _id: false });

const ProductSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    sku: {
      type: String,
      trim: true,
      default: "",
    },
    category: {
      type: String,
      required: true,
      default: "glass",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    unit_price: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    // ERP fields
    product_type: {
      type: String,
      trim: true,
      default: "",
    },
    product_name: {
      type: String,
      trim: true,
      default: "",
    },
    pricing_method: {
      type: String,
      trim: true,
      enum: ["sqft", "blade", "fixed", "per_piece", "per_meter", ""],
      default: "",
    },
    variant: {
      type: String,
      trim: true,
      default: "",
    },
    base_price: {
      type: Number,
      default: 0,
      min: 0,
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
    customization: {
      type: Boolean,
      default: false,
    },
    customization_fee: {
      type: Number,
      default: 0,
      min: 0,
    },
    extra_charges: {
      type: [ExtraChargeSchema],
      default: [],
    },
    size_limits: {
      type: SizeLimitsSchema,
      default: () => ({}),
    },
    standard_size: {
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
    blade_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    blade_glass_types: {
      type: [BladeGlassTypeSchema],
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
      type: [BladeFrameTypeSchema],
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
    custom_frame_price: {
      type: Number,
      min: 0,
      default: 0,
    },
    minimum_blades: {
      type: Number,
      min: 1,
      default: 1,
    },
    maximum_blades: {
      type: Number,
      min: 0,
      default: 0,
    },
    customer_can_choose_blade_count: {
      type: Boolean,
      default: false,
    },
    default_blade_glass_type: {
      type: String,
      trim: true,
      default: "",
    },
    default_sale_mode: {
      type: String,
      enum: ["blades_only", "frame"],
      default: "blades_only",
    },
    default_frame_type: {
      type: String,
      trim: true,
      default: "",
    },
    show_price_per_blade: {
      type: Boolean,
      default: true,
    },
    estimated_area: {
      type: Number,
      default: 0,
      min: 0,
    },
    estimated_price: {
      type: Number,
      default: 0,
      min: 0,
    },
    estimated_price_override: {
      type: Number,
      default: 0,
      min: 0,
    },
    images: {
      type: Object,
      default: {},
    },
    unit: {
      type: String,
      required: true,
      enum: ["per_sqft", "per_blade", "per_piece", "per_meter", "per_set"],
      default: "per_piece",
    },
    measurement_unit: {
      type: String,
      enum: ["in", "ft", "cm", "m"],
      default: "in",
    },
    stock_quantity: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    is_featured: {
      type: Boolean,
      default: false,
    },
    image_url: {
      type: String,
      trim: true,
      default: "",
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

ProductSchema.index({ is_featured: -1, createdAt: -1 });

export default mongoose.model("Product", ProductSchema);
