import { getFinalProjectCost, getRequiredDownpayment } from "@/lib/orderPricing";

export const getCustomerNameFromOrder = (order = {}) => {
  if (order.customer_name) return order.customer_name;
  const firstName = order.customer?.first_name || "";
  const lastName = order.customer?.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || "Customer";
};

export const getContractBladeDetails = (item = {}, sourceItem = {}) => {
  const pricingMethod = String(item.pricing_method || sourceItem.pricing_method || item.unit || sourceItem.unit || "").toLowerCase();
  const isBlade = pricingMethod === "blade" || pricingMethod === "per_blade";
  if (!isBlade) return { isBlade: false };

  const glassTypes = Array.isArray(item.blade_glass_types)
    ? item.blade_glass_types
    : Array.isArray(sourceItem.blade_glass_types) ? sourceItem.blade_glass_types : [];
  const glassName = item.blade_glass_type || sourceItem.blade_glass_type || "";
  const selectedGlass = glassTypes.find((glass) => String(glass.name).toLowerCase() === String(glassName).toLowerCase());
  const bladeRate = Number(selectedGlass?.price_per_blade)
    || Number(item.price_per_blade)
    || Number(sourceItem.price_per_blade)
    || Number(item.unitPrice)
    || Number(sourceItem.unit_price)
    || 0;
  const frameTypes = Array.isArray(item.blade_frame_types)
    ? item.blade_frame_types
    : Array.isArray(sourceItem.blade_frame_types) ? sourceItem.blade_frame_types : [];
  const saleMode = item.sale_mode || sourceItem.sale_mode || "blades_only";
  const frameName = item.frame_type || sourceItem.frame_type || "";
  const selectedFrame = frameTypes.find((frame) => String(frame.name).toLowerCase() === String(frameName).toLowerCase());
  const framePrice = saleMode === "frame"
    ? Number(item.frame_price) || Number(sourceItem.frame_price) || Number(selectedFrame?.price) || 0
    : 0;

  return {
    isBlade: true,
    hasPriceOverride: Number(item.estimated_price_override ?? sourceItem.estimated_price_override) > 0,
    glassName,
    bladeCount: Number(item.blade_count) || Number(sourceItem.blade_count) || Number(selectedFrame?.blade_count) || 0,
    bladeRate,
    saleMode,
    frameName,
    framePrice,
  };
};

export const hasExistingContract = (order = {}) => {
  const contractStatus = String(order.contract_status || order.contractStatus || "").trim().toLowerCase();
  const orderStatus = String(order.status || "").trim().toLowerCase();
  const snapshot = order.contractSnapshot;

  return Boolean(
    order.contractGenerated ||
    order.contractId ||
    order.contract_id ||
    order.contractVersion ||
    order.currentContractVersion ||
    order.contractGeneratedAt ||
    order.contractSentAt ||
    order.contract_sent_at ||
    order.acceptedByCustomer ||
    order.signed_contract_url ||
    ["sent", "accepted"].includes(contractStatus) ||
    ["contract_sent", "contract_accepted"].includes(orderStatus) ||
    (snapshot && Object.keys(snapshot).length > 0)
  );
};

export const buildContractSnapshot = (order = {}) => {
  const items = Array.isArray(order.items) ? order.items : [];
  const firstItem = items[0] || {};
  const width = Number(firstItem.width ?? firstItem.dimensions?.width ?? 0) || 0;
  const height = Number(firstItem.height ?? firstItem.dimensions?.height ?? 0) || 0;
  const quantity = Number(firstItem.quantity ?? firstItem.qty ?? 1) || 1;
  const projectCost = getFinalProjectCost(order);
  const downpayment = getRequiredDownpayment(order);
  const inspectionDate = order.inspection_date
    ? new Date(order.inspection_date).toISOString().slice(0, 10)
    : "";

  return {
    customerName: getCustomerNameFromOrder(order),
    email: order.customer_email || order.customer?.email || "",
    phone: order.customer_phone || order.customer?.phone || "",
    siteAddress: order.shipping_address || "",
    product: firstItem.name || firstItem.product_id?.name || firstItem.product_name || "Project Item",
    dimensions: `${width} x ${height} ${firstItem.unit || "in"}`.trim(),
    quantity,
    projectCost,
    downpayment,
    paymentTerms: order.payment_terms || "",
    inspectionDate,
  };
};

export const hasContractSnapshotChanged = (order = {}) => {
  const savedSnapshot = order.contractSnapshot || {};
  if (!savedSnapshot || Object.keys(savedSnapshot).length === 0) return false;

  return JSON.stringify(buildContractSnapshot(order)) !== JSON.stringify(savedSnapshot);
};
