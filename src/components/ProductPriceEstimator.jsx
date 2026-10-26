import { ClipboardList, Ruler } from "lucide-react";
import { calculateEstimate, toSquareFeet } from "@/lib/estimator";
import { getBladePriceOverrideRate, getDefaultExtraChargeSelections, getProductLineBreakdown, getProductLineTotal, getProductOverrideBaseSubtotal } from "@/lib/productPricing";

const currency = (value) =>
  `PHP ${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const isBladePricingProduct = (product) =>
  ["blade", "per_blade"].includes(String(product?.pricing_method || product?.unit || "").toLowerCase());

export const isMeterPricingProduct = (product) =>
  ["per_meter", "meter"].includes(String(product?.pricing_method || product?.unit || "").toLowerCase());

export const isPiecePricingProduct = (product) =>
  ["per_piece", "piece", "per_set", "set"].includes(String(product?.pricing_method || product?.unit || "").toLowerCase());

export const getDefaultProductEstimatorForm = (product = {}) => {
  const glassTypes = Array.isArray(product.blade_glass_types) ? product.blade_glass_types : [];
  const frameTypes = Array.isArray(product.blade_frame_types) ? product.blade_frame_types : [];
  const defaultFrame = frameTypes.find((frame) => frame.name === product.default_frame_type) || frameTypes[0];
  const sellBladesOnly = product.sell_blades_only !== false;
  const defaultSaleMode = product.default_sale_mode || (sellBladesOnly ? "blades_only" : "frame");
  const saleMode = defaultSaleMode === "frame" && !product.sell_with_frame ? "blades_only" : defaultSaleMode;

  const defaultBladeCount = saleMode === "frame"
    ? Number(defaultFrame?.blade_count) || Number(product.minimum_blades) || 1
    : Number(product.minimum_blades) || Number(product.blade_count) || 1;

  return {
    unit: product.custom_frame_size_unit || product.measurement_unit || "in",
    width: isMeterPricingProduct(product) ? String(product.width || "") : "0",
    height: "0",
    blade_glass_type: product.default_blade_glass_type || glassTypes[0]?.name || "",
    sale_mode: saleMode,
    frame_type: defaultFrame?.name || "",
    custom_frame_size: saleMode === "frame" && frameTypes.length === 0 && Boolean(product.allow_custom_frame_size),
    blade_count: product.customer_can_choose_blade_count ? "" : defaultBladeCount,
    extra_charges: getDefaultExtraChargeSelections(product),
  };
};

const getProductEstimateRate = (product, form) => {
  const pricingMethod = String(product?.pricing_method || "").toLowerCase();
  const legacyUnit = String(product?.unit || "").toLowerCase();
  const override = Number(product?.estimated_price_override) || 0;
  if (override > 0) {
    const overrideBaseSubtotal = getProductOverrideBaseSubtotal(product);
    if (isBladePricingProduct(product)) {
      return getBladePriceOverrideRate(product);
    }
    if (isPiecePricingProduct(product) || pricingMethod === "fixed") return overrideBaseSubtotal;
    if (["sqft", "per_sqft"].includes(pricingMethod) || legacyUnit === "per_sqft") {
      const standardArea = Number(product?.estimated_area)
        || (Number(product?.width) > 0 && Number(product?.height) > 0
          ? toSquareFeet(product.width, product.height, product.measurement_unit || "in")
          : 0);
      return standardArea > 0 ? overrideBaseSubtotal / standardArea : overrideBaseSubtotal;
    }
    if (["per_meter", "meter"].includes(pricingMethod) || legacyUnit === "per_meter") {
      const length = Number(product?.length ?? product?.width) || 0;
      const unit = product?.measurement_unit || product?.unit || "m";
      const meters = length * ({ in: 0.0254, ft: 0.3048, cm: 0.01, m: 1 }[unit] || 1);
      return meters > 0 ? overrideBaseSubtotal / meters : overrideBaseSubtotal;
    }
    return overrideBaseSubtotal;
  }
  if (["sqft", "per_sqft"].includes(pricingMethod) || legacyUnit === "per_sqft") return Number(product?.price_per_sqft) || undefined;
  if (["per_meter", "meter"].includes(pricingMethod) || legacyUnit === "per_meter") return Number(product?.unit_price) || undefined;
  if (isPiecePricingProduct(product)) return Number(product?.base_price || product?.unit_price) || undefined;
  if (isBladePricingProduct(product)) {
    const selectedGlass = (product?.blade_glass_types || []).find((glass) => glass.name === form.blade_glass_type);
    return Number(selectedGlass?.price_per_blade ?? product?.price_per_blade) || undefined;
  }
  return Number(product?.unit_price || product?.base_price || product?.estimated_price_override) || undefined;
};

export const getProductEstimatorState = (product, form = {}) => {
  if (!product) {
    return {
      isBladeEstimator: false,
      isMeterEstimator: false,
      isPieceEstimator: false,
      needsDimensions: true,
      hasEstimate: false,
      result: null,
      bladeCount: 0,
      minimumBlades: 1,
      maximumBlades: 0,
      bladeCountMinimum: 1,
      selectedGlass: null,
      selectedFrame: null,
    };
  }

  const isBladeEstimator = isBladePricingProduct(product);
  const isMeterEstimator = isMeterPricingProduct(product);
  const isPieceEstimator = isPiecePricingProduct(product);
  const glassTypes = Array.isArray(product.blade_glass_types) ? product.blade_glass_types : [];
  const frameTypes = Array.isArray(product.blade_frame_types) ? product.blade_frame_types : [];
  const selectedGlass = glassTypes.find((glass) => glass.name === form.blade_glass_type) || glassTypes[0] || null;
  const selectedFrame = frameTypes.find((frame) => frame.name === form.frame_type) || frameTypes[0] || null;
  const width = Number(form.width) || 0;
  const height = Number(form.height) || 0;
  const quantity = Math.max(1, Number(form.quantity) || 1);
  const minimumBlades = Math.max(1, Number(product.minimum_blades) || 1);
  const maximumBlades = Number(product.maximum_blades) || 0;
  const selectedFrameBladeCount = Number(selectedFrame?.blade_count) || 0;
  const bladeCountMinimum = form.sale_mode === "frame" && !form.custom_frame_size && selectedFrameBladeCount > 0
    ? selectedFrameBladeCount
    : minimumBlades;
  const hasBladeCountInput = form.blade_count !== "" && form.blade_count !== null && form.blade_count !== undefined;
  const requestedBladeCount = Number(form.blade_count);
  const bladeLimitContext = form.sale_mode === "frame"
    ? form.custom_frame_size
      ? "custom frame"
      : selectedFrame?.name
        ? `${selectedFrame.name} frame`
        : "selected frame"
    : "blades only";
  const bladeCountError = isBladeEstimator && hasBladeCountInput
    ? !Number.isInteger(requestedBladeCount)
      ? "Enter a whole number of blades."
      : requestedBladeCount < bladeCountMinimum
        ? `Minimum for ${bladeLimitContext} is ${bladeCountMinimum} blade${bladeCountMinimum === 1 ? "" : "s"}.`
        : maximumBlades > 0 && requestedBladeCount > maximumBlades
          ? `Maximum for ${bladeLimitContext} is ${maximumBlades} blade${maximumBlades === 1 ? "" : "s"}.`
          : ""
    : "";
  const bladeCount = Number(form.blade_count) || bladeCountMinimum;
  const needsDimensions = isMeterEstimator || (!isBladeEstimator && !isPieceEstimator) || (form.sale_mode === "frame" && Boolean(form.custom_frame_size));
  const item = {
    width,
    height,
    measurement_unit: form.unit || product.measurement_unit || "in",
    quantity,
    customized: true,
    blade_glass_type: selectedGlass?.name || form.blade_glass_type,
    sale_mode: form.sale_mode || product.default_sale_mode || "blades_only",
    frame_type: selectedFrame?.name || form.frame_type,
    custom_frame_size: Boolean(form.custom_frame_size),
    blade_count: bladeCount,
    extra_charges: form.extra_charges?.length ? form.extra_charges : getDefaultExtraChargeSelections(product),
  };
  const rawResult = calculateEstimate({
    productName: product.product_name || product.name,
    categoryKey: product.product_type || product.category,
    variantName: product.variant,
    width,
    height,
    measurementUnit: item.measurement_unit,
    quantity,
    blade_count: bladeCount || product.blade_count || 0,
    base_price: product.base_price || undefined,
    overrideRate: getProductEstimateRate(product, form),
    customization: product.customization || false,
    customization_fee: product.customization_fee || 0,
  });
  const estimatedPrice = getProductLineTotal(product, item);
  const result = {
    ...rawResult,
    estimated_price: estimatedPrice,
    rate: isBladeEstimator
      ? Number(product.estimated_price_override) > 0
        ? getBladePriceOverrideRate(product)
        : Number(selectedGlass?.price_per_blade ?? product.price_per_blade) || 0
      : Number(product.estimated_price_override) > 0 || isMeterEstimator || isPieceEstimator
        ? Number(getProductEstimateRate(product, form)) || 0
        : rawResult.rate || 0,
    areaDisplay: isBladeEstimator
      ? `${bladeCount} blade${bladeCount === 1 ? "" : "s"}`
      : isMeterEstimator ? `${width} ${item.measurement_unit}` : isPieceEstimator ? "1 piece" : rawResult.areaDisplay,
  };
  const hasBladeEstimate = Boolean(
    isBladeEstimator &&
    selectedGlass &&
    (Number(product.estimated_price_override) > 0 || Number(selectedGlass.price_per_blade ?? product.price_per_blade) > 0) &&
    !bladeCountError &&
    bladeCount >= bladeCountMinimum &&
    (maximumBlades <= 0 || bladeCount <= maximumBlades) &&
    (item.sale_mode === "blades_only"
      ? product.sell_blades_only !== false
      : product.sell_with_frame && (item.custom_frame_size ? product.allow_custom_frame_size && width > 0 && height > 0 : Boolean(selectedFrame))) &&
    Number(result.estimated_price) > 0
  );
  const hasEstimate = isBladeEstimator
    ? hasBladeEstimate
    : isMeterEstimator
      ? width > 0 && Number(result.estimated_price) > 0
      : isPieceEstimator
        ? Number(result.estimated_price) > 0
      : width > 0 && height > 0 && Number(result.estimated_price) > 0;
  return {
    isBladeEstimator,
    isMeterEstimator,
    isPieceEstimator,
    needsDimensions,
    hasEstimate,
    result,
    item,
    bladeCount,
    minimumBlades,
    maximumBlades,
    bladeCountMinimum,
    bladeCountError,
    selectedGlass,
    selectedFrame,
    glassTypes,
    frameTypes,
  };
};

function ProductPriceEstimator({ product, form, onFormChange, darkMode = false, formatCurrency = currency, compact = false, defaultMeasurements = null }) {
  const state = getProductEstimatorState(product, form);
  const hasExactPriceOverride = Number(product?.estimated_price_override) > 0;
  const priceBreakdown = getProductLineBreakdown(product, state.item);
  const {
    isBladeEstimator,
    isMeterEstimator,
    isPieceEstimator,
    needsDimensions,
    hasEstimate,
    result,
    bladeCount,
    minimumBlades,
    maximumBlades,
    bladeCountMinimum,
    bladeCountError,
    selectedGlass,
    selectedFrame,
    glassTypes,
    frameTypes,
  } = state;
  const fieldClass = `h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/15 ${darkMode ? "border-slate-600 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`;
  const labelClass = `mb-1 block text-[10px] font-bold uppercase tracking-wide ${darkMode ? "text-slate-400" : "text-slate-500"}`;
  const textClass = darkMode ? "text-slate-300" : "text-slate-600";
  const strongClass = darkMode ? "text-white" : "text-slate-900";
  const bladeLimitContext = form.sale_mode === "frame"
    ? form.custom_frame_size
      ? "custom frame"
      : selectedFrame?.name
        ? `${selectedFrame.name} frame`
        : "selected frame"
    : "blades only";
  const showMaximumBlades = maximumBlades > 0 && maximumBlades >= bladeCountMinimum;

  const updateForm = (patch) => onFormChange({ ...form, ...patch });
  const hasDefaultMeasurements = Boolean(defaultMeasurements);
  const isShowingDefaultMeasurements = hasDefaultMeasurements
    && Number(form.width) === Number(defaultMeasurements.width)
    && (isMeterEstimator || Number(form.height) === Number(defaultMeasurements.height))
    && String(form.unit || "in") === String(defaultMeasurements.unit || "in");
  return (
    <section className={`overflow-hidden rounded-xl border border-t-2 p-3.5 ${darkMode ? "border-slate-700 border-t-red-500 bg-slate-900" : "border-slate-200 border-t-red-600 bg-white"}`} aria-labelledby="product-estimator-title">
      <div className="flex items-center gap-2">
        <ClipboardList size={15} className="text-red-600" aria-hidden="true" />
        <h4 id="product-estimator-title" className={`text-sm font-bold ${strongClass}`}>Price Estimator</h4>
        {hasDefaultMeasurements && <span className={`ml-auto rounded-full px-2.5 py-1 text-[10px] font-semibold ${isShowingDefaultMeasurements
          ? darkMode ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"
          : darkMode ? "bg-red-950/60 text-red-200" : "bg-red-50 text-red-700"}`}>{isShowingDefaultMeasurements ? "Default measurements" : "Customize measurements"}</span>}
      </div>

      {needsDimensions && (isMeterEstimator ? (
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(88px,0.8fr)] gap-2">
          <label className="min-w-0">
            <span className={labelClass}>Length</span>
            <input type="number" min="0" step="any" value={form.width || ""} onChange={(event) => updateForm({ width: event.target.value })} className={fieldClass} />
          </label>
          <label className="min-w-0">
            <span className={labelClass}>Unit</span>
            <select value={form.unit || "in"} onChange={(event) => updateForm({ unit: event.target.value })} className={fieldClass}>
              <option value="in">in</option>
              <option value="ft">ft</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
            </select>
          </label>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(88px,0.8fr)]">
          <label className="min-w-0">
            <span className={labelClass}>Width</span>
            <input type="number" min="0" step="any" value={form.width || ""} onChange={(event) => updateForm({ width: event.target.value })} className={fieldClass} />
          </label>
          <span className={`mt-6 text-sm ${darkMode ? "text-slate-500" : "text-slate-400"}`} aria-hidden="true">x</span>
          <label className="min-w-0">
            <span className={labelClass}>Height</span>
            <input type="number" min="0" step="any" value={form.height || ""} onChange={(event) => updateForm({ height: event.target.value })} className={fieldClass} />
          </label>
          <label className="col-span-3 min-w-0 sm:col-span-1">
            <span className={labelClass}>Unit</span>
            <select value={form.unit || "in"} onChange={(event) => updateForm({ unit: event.target.value })} className={fieldClass}>
              <option value="in">in</option>
              <option value="ft">ft</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
            </select>
          </label>
        </div>
      ))}

      <div className={isBladeEstimator ? "mt-4 grid gap-4 sm:grid-cols-2 sm:items-stretch" : "contents"}>
      <div className={isBladeEstimator ? "min-w-0 space-y-3" : "contents"}>
      <label className={isBladeEstimator ? "block" : "mt-4 block"}>
        <span className={labelClass}>Quantity</span>
        <input
          type="number"
          min="1"
          step="1"
          value={form.quantity ?? 1}
          onChange={(event) => updateForm({ quantity: event.target.value })}
          className={fieldClass}
        />
      </label>

      {isBladeEstimator && (
        <div className={compact ? "space-y-3" : `${isBladeEstimator ? "" : "mt-4 "}space-y-3 rounded-lg border p-3 ${darkMode ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50"}`}>
          <label className="block">
            <span className={labelClass}>Glass type</span>
            <select value={form.blade_glass_type || selectedGlass?.name || ""} onChange={(event) => updateForm({ blade_glass_type: event.target.value })} className={fieldClass}>
              <option value="">Choose glass type</option>
              {glassTypes.map((glass) => <option key={glass.name} value={glass.name}>{glass.name} - {formatCurrency(glass.price_per_blade)} / blade</option>)}
            </select>
          </label>

          <div>
            <span className={labelClass}>Frame</span>
            <div className={`space-y-1.5 text-[11px] ${textClass}`}>
              {product?.sell_blades_only !== false && (
                <label className="flex items-center gap-2">
                  <input type="radio" checked={(form.sale_mode || "blades_only") === "blades_only"} onChange={() => updateForm({ sale_mode: "blades_only", custom_frame_size: false, frame_type: "", blade_count: product.customer_can_choose_blade_count ? "" : minimumBlades })} className="accent-red-700" />
                  <span>Blades only (no frame)</span>
                </label>
              )}
              {frameTypes.map((frame) => (
                <label key={frame.name} className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={form.sale_mode === "frame" && !form.custom_frame_size && (form.frame_type || selectedFrame?.name) === frame.name}
                    onChange={() => updateForm({ sale_mode: "frame", custom_frame_size: false, frame_type: frame.name, blade_count: product.customer_can_choose_blade_count ? "" : Number(frame.blade_count) || minimumBlades })}
                    className="accent-red-700"
                  />
                  <span>{frame.name} - {Number(frame.blade_count) || 0} blades - +{formatCurrency(frame.price)}</span>
                </label>
              ))}
              {product?.allow_custom_frame_size && (
                <label className="flex items-center gap-2">
                  <input type="radio" checked={form.sale_mode === "frame" && Boolean(form.custom_frame_size)} onChange={() => updateForm({ sale_mode: "frame", custom_frame_size: true, frame_type: "", blade_count: product.customer_can_choose_blade_count ? "" : minimumBlades, unit: product.custom_frame_size_unit || form.unit || "in" })} className="accent-red-700" />
                  <span>Custom size - +{formatCurrency(product.custom_frame_price)}</span>
                </label>
              )}
            </div>
          </div>

          <label className="block">
            <span className={labelClass}>Number of blades (optional)</span>
            <input
              type="number"
              min={bladeCountMinimum}
              max={maximumBlades || undefined}
              step="1"
              value={form.blade_count ?? ""}
              onChange={(event) => updateForm({ blade_count: event.target.value })}
              aria-invalid={Boolean(bladeCountError)}
              aria-describedby={bladeCountError ? "product-blade-count-error" : "product-blade-count-help"}
              className={fieldClass}
              placeholder={`min ${bladeCountMinimum}`}
            />
            <span id="product-blade-count-help" className={`mt-1 block text-[10px] ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
              Minimum for {bladeLimitContext}: <strong>{bladeCountMinimum} blade{bladeCountMinimum === 1 ? "" : "s"}</strong>. {showMaximumBlades ? <>Maximum: <strong>{maximumBlades} blade{maximumBlades === 1 ? "" : "s"}</strong>. </> : null}Final count is confirmed by our team.
            </span>
            {bladeCountError && <span id="product-blade-count-error" role="alert" className="mt-1 block text-[11px] font-semibold text-red-600">{bladeCountError}</span>}
          </label>

        </div>
      )}

      </div>
      <div className={isBladeEstimator ? "min-w-0 flex h-full flex-col gap-4" : "contents"}>

      {(product.extra_charges || []).some((charge) => charge.is_optional && charge.is_active !== false) && (
        <div className={`${isBladeEstimator ? "" : "mt-4 "}space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3`}>
          <p className={labelClass}>Optional charges</p>
          {(product.extra_charges || []).map((charge, index) => {
            if (!charge.is_optional || charge.is_active === false) return null;
            const selectedCharge = form.extra_charges?.[index];
            const checked = selectedCharge?.is_selected ?? false;
            return (
              <label key={`${charge.name || charge.label}-${index}`} className={`flex items-center justify-between gap-2 text-xs ${textClass}`}>
                <span className="flex min-w-0 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const charges = (form.extra_charges?.length ? form.extra_charges : getDefaultExtraChargeSelections(product)).map((item, itemIndex) => (
                        itemIndex === index ? { ...item, is_selected: event.target.checked } : item
                      ));
                      updateForm({ extra_charges: charges });
                    }}
                    className="accent-red-700"
                  />
                  <span className="truncate">{charge.name || charge.label}</span>
                </span>
                <strong className={strongClass}>{currency(charge.amount)}</strong>
              </label>
            );
          })}
        </div>
      )}

      {hasEstimate ? (
        <div className={`${isBladeEstimator ? "flex flex-1 flex-col justify-between " : "mt-4 "}space-y-3 text-sm ${textClass}`} aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2"><Ruler size={13} aria-hidden="true" />{isBladeEstimator ? "Blades" : isMeterEstimator ? "Length" : isPieceEstimator ? "Quantity" : "Area"}</span>
            <span className={`font-bold ${strongClass}`}>{isBladeEstimator ? bladeCount : result?.areaDisplay || "N/A"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>{hasExactPriceOverride ? "Product price override" : "Base Rate"}</span>
            <span className={`font-bold ${strongClass}`}>{hasExactPriceOverride
              ? formatCurrency(product.estimated_price_override)
              : Number(result?.rate) > 0 ? `${formatCurrency(result.rate)} / ${isBladeEstimator ? "blade" : isMeterEstimator ? "meter" : isPieceEstimator ? "piece" : "sq ft"}` : "Contact us"}</span>
          </div>
          {priceBreakdown.extraCharges.map((charge, index) => (
            <div key={`${charge.name}-${index}`} className="flex items-center justify-between gap-3 text-xs">
              <span>{charge.name}</span><strong className={strongClass}>{formatCurrency(charge.total)}</strong>
            </div>
          ))}
          <div className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-3 ${darkMode ? "border-red-900 bg-slate-800 text-red-300" : "border-red-100 bg-red-50 text-red-800"}`}>
            <span className="font-bold">Estimated Total</span>
            <span className="text-base font-black">{formatCurrency(result.estimated_price)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 px-1">
            <span>50% Downpayment</span>
            <span className={`font-bold ${darkMode ? "text-red-300" : "text-red-800"}`}>{formatCurrency(result.estimated_price * 0.5)}</span>
          </div>
        </div>
      ) : (
        <div className={`mt-3 flex min-h-12 items-center justify-center rounded-lg px-3 py-2.5 text-center text-xs ${darkMode ? "bg-slate-800 text-slate-300" : "bg-slate-50 text-slate-500"}`}>
          {isBladeEstimator ? "Choose a glass type and valid blade or frame option to estimate." : isMeterEstimator ? "Enter a length to calculate your estimate." : isPieceEstimator ? "A configured piece price is required to calculate your estimate." : "Enter width and height to calculate your estimate."}
        </div>
      )}

      <p className={`${isBladeEstimator ? "" : "mt-2 "}text-[11px] font-medium leading-4 ${darkMode ? "text-slate-500" : "text-slate-500"}`}>
        Final pricing is subject to negotiation during shop discussion or on-site inspection.
      </p>
      </div>
      </div>
    </section>
  );
}

export default ProductPriceEstimator;
