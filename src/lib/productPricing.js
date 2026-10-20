import { toSquareFeet } from "./estimator.js";

const toNonNegativeNumber = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(amount, 0) : 0;
};

const getQuantity = (item = {}) =>
  Math.max(1, Number(item.quantity ?? item.dimensions?.quantity) || 1);

const toMeters = (value, unit) => {
  const factors = { in: 0.0254, ft: 0.3048, cm: 0.01, m: 1 };
  return (Number(value) || 0) * (factors[unit] || 1);
};

export const getDefaultExtraChargeSelections = (product = {}) => (
  (Array.isArray(product.extra_charges) ? product.extra_charges : []).map((charge) => ({
    ...charge,
    is_selected: charge?.is_optional === true ? false : true,
  }))
);

const getPricingMethod = (product = {}, item = {}) => {
  const configuredMethod = String(product.pricing_method || item.pricing_method || "").toLowerCase();
  if (configuredMethod) return configuredMethod;
  const legacyUnit = String(product.unit || item.unit || "").toLowerCase();
  if (legacyUnit === "per_sqft" || legacyUnit === "sqft") return "sqft";
  if (legacyUnit === "per_blade" || legacyUnit === "blade") return "blade";
  if (legacyUnit === "per_meter" || legacyUnit === "meter") return "per_meter";
  if (["per_piece", "piece", "per_set", "set"].includes(legacyUnit)) return "per_piece";
  if (Number(product.price_per_sqft ?? item.price_per_sqft) > 0) return "sqft";
  if (Number(product.price_per_blade ?? item.price_per_blade) > 0) return "blade";
  return "fixed";
};

const getBladePricing = (product = {}, item = {}) => {
  const glassTypes = Array.isArray(product.blade_glass_types) ? product.blade_glass_types : [];
  const frameTypes = Array.isArray(product.blade_frame_types) ? product.blade_frame_types : [];
  const glassName = item.blade_glass_type || product.default_blade_glass_type || glassTypes[0]?.name || "";
  const glassType = glassTypes.find((glass) => String(glass.name).toLowerCase() === String(glassName).toLowerCase());
  const saleMode = item.sale_mode || product.default_sale_mode || "blades_only";
  const frameName = item.frame_type || product.default_frame_type || "";
  const frameType = frameTypes.find((frame) => String(frame.name).toLowerCase() === String(frameName).toLowerCase());
  const configuredBladeCount = Number(item.blade_count) || Number(frameType?.blade_count) || Number(product.blade_count) || Number(product.minimum_blades) || 0;
  const bladeCount = Math.max(0, configuredBladeCount);
  const hasPriceOverride = toNonNegativeNumber(product.estimated_price_override ?? item.estimated_price_override) > 0;
  const bladeRate = hasPriceOverride
    ? getBladePriceOverrideRate(product, item)
    : toNonNegativeNumber(glassType?.price_per_blade ?? product.price_per_blade ?? item.price_per_blade);
  const framePrice = saleMode === "frame"
    ? toNonNegativeNumber(item.frame_price ?? (item.custom_frame_size ? product.custom_frame_price : frameType?.price))
    : 0;

  return { glassTypes, frameTypes, glassName, saleMode, frameName, frameType, bladeCount, bladeRate, framePrice };
};

export const getDefaultBladeCount = (product = {}, selections = {}) => {
  const frameTypes = Array.isArray(product.blade_frame_types) ? product.blade_frame_types : [];
  const saleMode = selections.sale_mode || product.default_sale_mode || (product.sell_blades_only === false ? "frame" : "blades_only");
  const frameName = selections.frame_type || product.default_frame_type || "";
  const frame = frameTypes.find((candidate) => candidate.name === frameName) || frameTypes[0];
  const selectedCount = Number(selections.blade_count);
  const minimumBlades = Math.max(1, Number(product.minimum_blades) || 1);

  if (saleMode === "frame" && !selections.custom_frame_size) {
    const frameBladeCount = Number(frame?.blade_count) || minimumBlades;
    return Math.max(selectedCount || 0, frameBladeCount, minimumBlades);
  }

  if (selectedCount > 0) return selectedCount;
  return Number(product.blade_count) || minimumBlades;
};

export const getProductOverrideBaseSubtotal = (product = {}, item = {}) => {
  return toNonNegativeNumber(product.estimated_price_override ?? item.estimated_price_override);
};

// Treat the override as the product's base amount. Additional charges stay
// separate and are added only when required or selected by the customer.
export const getBladePriceOverrideRate = (product = {}, item = {}) => {
  if (toNonNegativeNumber(product.estimated_price_override ?? item.estimated_price_override) <= 0) return 0;

  const frameTypes = Array.isArray(product.blade_frame_types) ? product.blade_frame_types : [];
  const frame = frameTypes.find((candidate) => candidate.name === product.default_frame_type) || frameTypes[0];
  const saleMode = product.default_sale_mode || (product.sell_blades_only === false ? "frame" : "blades_only");
  const bladeCount = getDefaultBladeCount(product, {
    sale_mode: saleMode,
    frame_type: frame?.name || product.default_frame_type,
  });
  const framePrice = saleMode === "frame"
    ? toNonNegativeNumber(frame?.price ?? (product.allow_custom_frame_size ? product.custom_frame_price : 0))
    : 0;
  const coreSubtotal = getProductOverrideBaseSubtotal(product, item);

  return Math.max(0, coreSubtotal - framePrice) / Math.max(bladeCount, 1);
};

export const getProductLineTotal = (product = {}, item = {}, options = {}) => {
  const quantity = getQuantity(item);
  const exactPriceOverride = toNonNegativeNumber(product.estimated_price_override ?? item.estimated_price_override);
  if (exactPriceOverride > 0) {
    return Math.round(exactPriceOverride * quantity * 100) / 100;
  }
  const method = getPricingMethod(product, item);
  const bladePricing = ["blade", "per_blade"].includes(method) ? getBladePricing(product, item) : null;
  const productPriceOverride = toNonNegativeNumber(product.estimated_price_override ?? item.estimated_price_override);
  const overrideCoreSubtotal = productPriceOverride > 0
    ? getProductOverrideBaseSubtotal(product, item)
    : 0;
  const overridePrice = ["fixed", "per_piece", "per_set", "piece", "set"].includes(method)
    ? overrideCoreSubtotal
    : 0;
  const measuredPriceOverride = ["sqft", "per_sqft"].includes(method) ? overrideCoreSubtotal : 0;
  const lengthPriceOverride = ["per_meter", "meter"].includes(method) ? overrideCoreSubtotal : 0;

  const unit = item.measurement_unit || item.measurementUnit || item.dimensions?.unit || product.measurement_unit || "in";
  const width = Number(item.width ?? item.dimensions?.width ?? product.width) || 0;
  const height = Number(item.height ?? item.dimensions?.height ?? product.height) || 0;
  const productWidth = Number(product.width) || 0;
  const productHeight = Number(product.height) || 0;
  const standardArea = productWidth > 0 && productHeight > 0
    ? toSquareFeet(productWidth, productHeight, product.measurement_unit || "in")
    : toNonNegativeNumber(product.estimated_area);
  const measuredArea = width > 0 && height > 0 ? toSquareFeet(width, height, unit) : 0;
  const fixedOverrideRatio = method === "fixed" && standardArea > 0 && measuredArea > 0
    ? measuredArea / standardArea
    : 1;
  let subtotal = overridePrice > 0 ? overridePrice * fixedOverrideRatio * quantity : 0;

  if (measuredPriceOverride > 0) {
    const pricedArea = measuredArea || standardArea;
    subtotal = standardArea > 0 && pricedArea > 0
      ? measuredPriceOverride * pricedArea / standardArea * quantity
      : measuredPriceOverride * quantity;
  }

  if (lengthPriceOverride > 0) {
    const productLength = Number(product.length ?? product.width) || 0;
    const selectedLength = Number(item.length ?? item.dimensions?.length ?? item.width ?? item.dimensions?.width ?? productLength) || 0;
    const productLengthUnit = product.measurement_unit || product.unit || "m";
    const selectedLengthUnit = item.measurement_unit || item.measurementUnit || item.dimensions?.unit || productLengthUnit;
    const standardLengthMeters = toMeters(productLength, productLengthUnit);
    const selectedLengthMeters = toMeters(selectedLength, selectedLengthUnit);
    subtotal = standardLengthMeters > 0 && selectedLengthMeters > 0
      ? lengthPriceOverride * selectedLengthMeters / standardLengthMeters * quantity
      : lengthPriceOverride * quantity;
  }

  if (productPriceOverride <= 0 && (method === "sqft" || method === "per_sqft")) {
    const rate = toNonNegativeNumber(product.price_per_sqft ?? item.price_per_sqft);
    if (rate > 0 && width > 0 && height > 0) {
      const areaPerUnit = toSquareFeet(width, height, unit);
      subtotal = areaPerUnit * rate * quantity;
    }
  }

  if (method === "blade" || method === "per_blade") {
    const rate = bladePricing?.bladeRate ?? toNonNegativeNumber(product.price_per_blade ?? item.price_per_blade);
    const bladesPerUnit = bladePricing?.bladeCount ?? toNonNegativeNumber(product.blade_count ?? item.blade_count);
    if (rate > 0 && bladesPerUnit > 0) {
      subtotal = (rate * bladesPerUnit + (bladePricing?.framePrice || 0)) * quantity;
    }
  }

  if (productPriceOverride <= 0 && (method === "per_meter" || method === "meter")) {
    const length = Number(item.length ?? item.dimensions?.length ?? item.width ?? item.dimensions?.width ?? product.length ?? product.width) || 0;
    const rate = toNonNegativeNumber(product.price_per_meter ?? product.unit_price ?? item.price_per_meter ?? item.unit_price);
    subtotal = toMeters(length, unit) * rate * quantity;
  }

  if (productPriceOverride <= 0 && ["fixed", "per_piece", "per_set", "piece", "set"].includes(method)) {
    const savedEstimate = toNonNegativeNumber(product.estimated_price ?? item.estimated_price);
    const basePrice = toNonNegativeNumber(product.base_price ?? item.base_price);
    const fixedPrice = basePrice || toNonNegativeNumber(product.unit_price ?? item.unit_price) || savedEstimate;
    subtotal = fixedPrice * quantity;
  }

  if (subtotal <= 0 && productPriceOverride <= 0) {
    const basePrice = toNonNegativeNumber(product.base_price ?? item.base_price);
    if (basePrice > 0) subtotal = basePrice * quantity;
  }

  if (subtotal <= 0 && productPriceOverride <= 0) {
    const savedEstimate = toNonNegativeNumber(product.estimated_price ?? item.estimated_price);
    if (savedEstimate > 0) subtotal = savedEstimate * quantity;
  }

  if (subtotal <= 0 && productPriceOverride <= 0) {
    subtotal = toNonNegativeNumber(product.unit_price ?? item.unit_price) * quantity;
  }

  const areaPerUnit = width > 0 && height > 0 ? toSquareFeet(width, height, unit) : 0;
  const configuredCharges = Array.isArray(product.extra_charges ?? item.extra_charges)
    ? product.extra_charges ?? item.extra_charges
    : [];
  const itemCharges = Array.isArray(item.extra_charges) ? item.extra_charges : [];
  const charges = configuredCharges.map((charge, index) => ({
    ...charge,
    ...(itemCharges[index] || {}),
    is_optional: charge?.is_optional,
    is_active: charge?.is_active,
    type: itemCharges[index]?.type || charge?.type,
    label: itemCharges[index]?.label || charge?.label,
    name: itemCharges[index]?.name || charge?.name,
  })).filter((charge, index) => {
    if (charge?.is_active === false) return false;
    if (charge?.is_optional !== true) return true;
    const isSelected = itemCharges[index]?.is_selected;
    return typeof isSelected === "boolean" ? isSelected : false;
  });
  const additionalCharges = charges.reduce((total, charge) => {
    const amount = toNonNegativeNumber(charge.amount);
    if (charge.type === "percentage") return total + subtotal * amount / 100;
    if (charge.type === "per_sqft") return total + areaPerUnit * amount * quantity;
    if (charge.type === "per_blade") return total + (bladePricing?.bladeCount || 0) * amount * quantity;
    return total + amount * quantity;
  }, 0);
  const legacyCustomizationFee = productPriceOverride <= 0 && ["sqft", "per_sqft"].includes(method) && product.customization && item.customized
    ? toNonNegativeNumber(product.customization_fee ?? item.customization_fee)
    : 0;

  const includedCharges = options.includeExtraCharges === false ? 0 : additionalCharges;
  return Math.round((subtotal + includedCharges + legacyCustomizationFee) * 100) / 100;
};

export const getDefaultProductLineTotal = (product = {}) => {
  const method = getPricingMethod(product);
  const frameTypes = Array.isArray(product.blade_frame_types) ? product.blade_frame_types : [];
  const defaultFrame = frameTypes.find((frame) => frame.name === product.default_frame_type) || frameTypes[0];
  const defaultSaleMode = product.default_sale_mode || (product.sell_blades_only === false ? "frame" : "blades_only");
  const isBladePricing = method === "blade" || method === "per_blade";
  const bladeCount = getDefaultBladeCount(product, {
    sale_mode: defaultSaleMode,
    frame_type: defaultFrame?.name || product.default_frame_type,
  });

  return getProductLineTotal(product, {
    width: Number(product.width) || 0,
    height: Number(product.height) || 0,
    measurement_unit: product.measurement_unit || "in",
    blade_glass_type: product.default_blade_glass_type || product.blade_glass_types?.[0]?.name || "",
    sale_mode: defaultSaleMode,
    frame_type: defaultFrame?.name || product.default_frame_type || "",
    blade_count: isBladePricing ? bladeCount : Number(product.blade_count) || undefined,
    extra_charges: getDefaultExtraChargeSelections(product),
    quantity: 1,
  });
};

export const getProductLineBreakdown = (product = {}, item = {}) => {
  const baseTotal = getProductLineTotal(product, item, { includeExtraCharges: false });
  const configuredCharges = Array.isArray(product.extra_charges)
    ? product.extra_charges
    : Array.isArray(item.extra_charges) ? item.extra_charges : [];
  const itemCharges = Array.isArray(item.extra_charges) ? item.extra_charges : [];
  const quantity = getQuantity(item);
  const bladePricing = ["blade", "per_blade"].includes(getPricingMethod(product, item)) ? getBladePricing(product, item) : null;
  const unit = item.measurement_unit || item.measurementUnit || item.dimensions?.unit || product.measurement_unit || "in";
  const width = Number(item.width ?? item.dimensions?.width) || 0;
  const height = Number(item.height ?? item.dimensions?.height) || 0;
  const area = width > 0 && height > 0 ? toSquareFeet(width, height, unit) : 0;
  const extraCharges = configuredCharges.flatMap((charge, index) => {
    const selection = itemCharges[index] || {};
    if (charge?.is_active === false) return [];
    if (charge?.is_optional === true) {
      const selected = typeof selection.is_selected === "boolean"
        ? selection.is_selected
        : false;
      if (!selected) return [];
    }

    const amount = toNonNegativeNumber(charge.amount);
    const chargeTotal = charge.type === "percentage"
      ? baseTotal * amount / 100
      : charge.type === "per_sqft"
        ? area * amount * quantity
        : charge.type === "per_blade"
          ? (bladePricing?.bladeCount || 0) * amount * quantity
          : amount * quantity;
    return [{ name: charge.name || charge.label || `Extra charge ${index + 1}`, total: Math.max(0, Math.round(chargeTotal * 100) / 100) }];
  });

  return {
    baseTotal,
    extraCharges,
    total: getProductLineTotal(product, item),
  };
};

export const getProductSizeLimitWarnings = (product = {}, item = {}) => {
  const limits = product.size_limits || item.size_limits;
  if (!limits) return [];

  const itemUnit = item.measurement_unit || item.measurementUnit || item.dimensions?.unit || product.measurement_unit || "in";
  const limitUnit = limits.unit || product.measurement_unit || "in";
  const itemWidth = Number(item.width ?? item.dimensions?.width);
  const itemHeight = Number(item.height ?? item.dimensions?.height);
  if (!(itemWidth > 0) || !(itemHeight > 0)) return [];

  const toInchesFactor = { in: 1, ft: 12, cm: 1 / 2.54, m: 100 / 2.54 };
  const itemFactor = toInchesFactor[itemUnit] || 1;
  const limitFactor = toInchesFactor[limitUnit] || 1;
  const dimensions = [
    ["Width", itemWidth * itemFactor, "min_width", "max_width"],
    ["Height", itemHeight * itemFactor, "min_height", "max_height"],
  ];

  return dimensions.flatMap(([label, valueInches, minKey, maxKey]) => {
    const warnings = [];
    const minimum = Number(limits[minKey]);
    const maximum = Number(limits[maxKey]);
    if (minimum > 0 && valueInches < minimum * limitFactor) {
      warnings.push(`${label} is below the ${minimum} ${limitUnit} minimum.`);
    }
    if (maximum > 0 && valueInches > maximum * limitFactor) {
      warnings.push(`${label} is above the ${maximum} ${limitUnit} maximum.`);
    }
    return warnings;
  });
};

export const getMeasuredProductLineTotal = (product = {}, item = {}) => {
  if (toNonNegativeNumber(product.estimated_price_override ?? item.estimated_price_override) > 0) {
    return getProductLineTotal(product, item);
  }
  const method = getPricingMethod(product, item);
  if (["sqft", "per_sqft"].includes(method)
    && toNonNegativeNumber(product.estimated_price_override ?? item.estimated_price_override) > 0) {
    return getProductLineTotal(product, item);
  }
  const configuredFixedPrice = toNonNegativeNumber(product.base_price ?? item.base_price)
    || toNonNegativeNumber(product.unit_price ?? item.unit_price);
  const overridePrice = method === "fixed"
    ? toNonNegativeNumber(product.estimated_price_override ?? item.estimated_price_override)
    : 0;
  const overrideCorePrice = overridePrice > 0
    ? getProductOverrideBaseSubtotal(product, item)
    : 0;
  const measuredFixedPrice = overrideCorePrice
    || configuredFixedPrice
    || toNonNegativeNumber(product.estimated_price ?? item.estimated_price);
  const measuredPrice = overridePrice || measuredFixedPrice;
  const width = Number(item.width ?? item.dimensions?.width) || 0;
  const height = Number(item.height ?? item.dimensions?.height) || 0;
  const productWidth = Number(product.width) || 0;
  const productHeight = Number(product.height) || 0;

  if (!measuredPrice || width <= 0 || height <= 0) {
    return getProductLineTotal(product, item);
  }

  const itemUnit = item.measurement_unit || item.measurementUnit || item.dimensions?.unit || product.measurement_unit || "in";
  const productUnit = product.measurement_unit || "in";
  const measuredArea = toSquareFeet(width, height, itemUnit);
  const standardArea = productWidth > 0 && productHeight > 0
    ? toSquareFeet(productWidth, productHeight, productUnit)
    : toNonNegativeNumber(product.estimated_area);
  const isMeasuredOverride = ["sqft", "per_sqft"].includes(method);
  const isDimensionedFixedPrice = method === "fixed" && standardArea > 0;

  if (!isMeasuredOverride && !isDimensionedFixedPrice) {
    return getProductLineTotal(product, item);
  }

  if (standardArea > 0 && Math.abs(measuredArea - standardArea) <= 0.01) {
    return getProductLineTotal(product, item);
  }

  if (isDimensionedFixedPrice) {
    const quantity = getQuantity(item);
    const scaledUnitPrice = measuredPrice * measuredArea / standardArea;
    return getProductLineTotal({
      ...product,
      base_price: scaledUnitPrice,
      unit_price: scaledUnitPrice,
      estimated_price: scaledUnitPrice,
      estimated_price_override: 0,
    }, { ...item, quantity });
  }

  return getProductLineTotal(
    { ...product, estimated_price_override: 0 },
    { ...item, estimated_price_override: 0 },
  );
};

export const buildProductPriceSnapshot = (product, item) => {
  const lineTotal = getProductLineTotal(product, item);
  const method = getPricingMethod(product, item);
  const bladePricing = ["blade", "per_blade"].includes(method) ? getBladePricing(product, item) : null;
  const defaultExtraCharges = getDefaultExtraChargeSelections({
    extra_charges: product.extra_charges ?? item.extra_charges,
  });
  const extraCharges = defaultExtraCharges.map((charge, index) => ({
    ...charge,
    ...(item.extra_charges?.[index] || {}),
    is_selected: typeof item.extra_charges?.[index]?.is_selected === "boolean"
      ? item.extra_charges[index].is_selected
      : charge.is_selected,
  }));
  const overridePrice = toNonNegativeNumber(product.estimated_price_override ?? item.estimated_price_override);
  const overrideBaseSubtotal = overridePrice > 0
    ? getProductOverrideBaseSubtotal(product, item)
    : 0;
  const standardArea = Number(product.width) > 0 && Number(product.height) > 0
    ? toSquareFeet(product.width, product.height, product.measurement_unit || "in")
    : toNonNegativeNumber(product.estimated_area);
  const standardLengthMeters = toMeters(
    Number(product.length ?? product.width) || 0,
    product.measurement_unit || product.unit || "m",
  );
  const unitPrice = overridePrice > 0
    ? overridePrice
    : ["sqft", "per_sqft"].includes(method)
    ? toNonNegativeNumber(product.price_per_sqft)
      : ["blade", "per_blade"].includes(method)
      ? bladePricing.bladeRate
      : ["per_meter", "meter"].includes(method)
        ? toNonNegativeNumber(product.price_per_meter ?? product.unit_price)
      : toNonNegativeNumber(product.base_price || product.estimated_price || product.unit_price);

  return {
    pricing_method: method,
    unit_price: unitPrice,
    price_per_sqft: overridePrice > 0 && ["sqft", "per_sqft"].includes(method)
      ? standardArea > 0 ? overrideBaseSubtotal / standardArea : overrideBaseSubtotal
      : toNonNegativeNumber(product.price_per_sqft),
    price_per_blade: overridePrice > 0 && ["blade", "per_blade"].includes(method)
      ? bladePricing.bladeRate
      : toNonNegativeNumber(product.price_per_blade),
    base_price: toNonNegativeNumber(product.base_price),
    blade_count: toNonNegativeNumber(item.blade_count ?? product.blade_count),
    blade_glass_type: item.blade_glass_type || product.default_blade_glass_type || "",
    sale_mode: item.sale_mode || product.default_sale_mode || "blades_only",
    frame_type: item.frame_type || product.default_frame_type || "",
    frame_price: bladePricing?.framePrice || 0,
    blade_glass_types: Array.isArray(product.blade_glass_types) ? product.blade_glass_types : [],
    sell_blades_only: product.sell_blades_only !== false,
    sell_with_frame: Boolean(product.sell_with_frame),
    blade_frame_types: Array.isArray(product.blade_frame_types) ? product.blade_frame_types : [],
    allow_custom_frame_size: Boolean(product.allow_custom_frame_size),
    custom_frame_size_unit: product.custom_frame_size_unit || product.measurement_unit || item.measurement_unit || "in",
    custom_frame_price: toNonNegativeNumber(product.custom_frame_price),
    minimum_blades: Math.max(1, Number(product.minimum_blades) || 1),
    maximum_blades: toNonNegativeNumber(product.maximum_blades),
    customer_can_choose_blade_count: Boolean(product.customer_can_choose_blade_count),
    default_blade_glass_type: product.default_blade_glass_type || "",
    default_sale_mode: product.default_sale_mode || "blades_only",
    default_frame_type: product.default_frame_type || "",
    show_price_per_blade: product.show_price_per_blade !== false,
    estimated_price_override: toNonNegativeNumber(product.estimated_price_override),
    customization: Boolean(product.customization),
    customization_fee: toNonNegativeNumber(product.customization_fee),
    extra_charges: extraCharges,
    size_limits: product.size_limits || {},
    line_total: lineTotal,
  };
};
