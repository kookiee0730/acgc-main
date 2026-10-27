import { useEffect, useState } from "react";
import {
  Camera,
  ClipboardCheck,
  Check,
  AlertTriangle,
  FileSignature,
  FileText,
  Package,
  Scissors,
  Star,
  Truck,
  Wrench,
  X,
} from "lucide-react";
import { API_BASE } from "@/api/client";
import { buildBatchProductTimelineStages, isInstallationDeadlineOverdue } from "@/lib/orderTimeline";

export const getOrderItemImageSource = (item) => {
  const product = item?.product_id && typeof item.product_id === "object"
    ? item.product_id
    : item?.product || {};
  const productImages = product?.images;
  const imageCollection = Array.isArray(productImages)
    ? productImages
    : productImages && typeof productImages === "object"
      ? Object.values(productImages)
      : [];
  const nestedImage = imageCollection
    .flatMap((image) => Array.isArray(image) ? image : [image])
    .map((image) => typeof image === "string" ? image : image?.url)
    .find(Boolean);

  return item?.image_url || item?.image || product?.image_url || product?.image || nestedImage || "";
};

export const normalizeOrderImageUrl = (url) => {
  if (!url || typeof url !== "string" || url.startsWith("file:")) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;

  const path = url.startsWith("/") ? url : `/${url}`;
  const apiOrigin = API_BASE.replace(/\/api\/?$/, "");
  if (apiOrigin) return `${apiOrigin}${path}`;

  if (import.meta.env.DEV && path.startsWith("/uploads/") && typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:5000${path}`;
  }

  return path;
};

export const formatOrderItemMeasurements = (item) => {
  const product = item?.product_id && typeof item.product_id === "object"
    ? item.product_id
    : item?.product || {};
  const dimensions = item?.dimensions || {};
  const productDimensions = product?.dimensions || {};
  const firstPositiveNumber = (...values) => values
    .map(Number)
    .find((value) => Number.isFinite(value) && value > 0) || 0;
  const pricingMethod = String(item?.pricing_method || item?.unit || product?.pricing_method || product?.unit || "").toLowerCase();
  const isBladeProduct = pricingMethod === "blade" || pricingMethod === "per_blade";
  const frameTypes = item?.blade_frame_types || product?.blade_frame_types || [];
  const frameName = item?.frame_type || item?.default_frame_type || product?.default_frame_type || "";
  const frame = frameTypes.find((entry) => entry.name === frameName);
  const saleMode = item?.sale_mode || item?.default_sale_mode || product?.default_sale_mode || "blades_only";
  const glassType = item?.blade_glass_type || item?.default_blade_glass_type || product?.default_blade_glass_type || "";
  const bladeCount = firstPositiveNumber(item?.blade_count, frame?.blade_count, item?.minimum_blades, product?.minimum_blades, product?.blade_count);
  const bladeSelection = isBladeProduct
    ? [
        glassType,
        saleMode === "frame" ? item?.custom_frame_size ? "Custom frame" : `${frameName || "Frame"} frame` : "Blades only",
        bladeCount > 0 ? `${bladeCount} blades` : "",
      ].filter(Boolean).join(" · ")
    : "";
  const width = firstPositiveNumber(dimensions.width, item?.width, productDimensions.width, product?.width);
  const height = firstPositiveNumber(dimensions.height, item?.height, productDimensions.height, product?.height);
  const standardSize = item?.standard_size || product?.standard_size || product?.size || "";

  if (!(width > 0 && height > 0)) {
    return bladeSelection || (standardSize ? `Size: ${standardSize}` : "Measurements not provided");
  }

  const unit = String(
    dimensions.unit || item?.measurementUnit || item?.measurement_unit ||
    productDimensions.unit || product?.measurementUnit || product?.measurement_unit || "in"
  ).toLowerCase();
  const quantity = Math.max(1, Number(item?.quantity || item?.qty || dimensions.quantity) || 1);
  const area = firstPositiveNumber(item?.area, dimensions.area) || (
    unit === "in"
      ? (width * height * quantity) / 144
      : unit === "ft"
        ? width * height * quantity
        : unit === "cm"
          ? (width * height * quantity) / 929.0304
          : unit === "m"
            ? width * height * quantity * 10.7639
            : width * height * quantity
  );
  const unitSymbol = unit === "in" ? '"' : unit;
  const formattedWidth = width.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const formattedHeight = height.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const formattedArea = area.toLocaleString(undefined, { maximumFractionDigits: 2 });

  const measurementText = `Size: ${formattedWidth}${unitSymbol} x ${formattedHeight}${unitSymbol} (${formattedArea} sq ft)`;
  return bladeSelection ? `${measurementText} · ${bladeSelection}` : measurementText;
};

export const getVisibleCompletedStageSubStages = (step) =>
  Array.isArray(step?.subStages) ? step.subStages : [];

export const buildCustomerOrderTimelineSteps = (order, item = null, itemIndex = 0) => {
  const itemForProgress = item ?? (Array.isArray(order?.items) ? order.items[0] : null);
  const hasItemProgressStages = Array.isArray(itemForProgress?.progress_stages) && itemForProgress.progress_stages.length > 0;
  const hasOrderProgressStages = Array.isArray(order?.progress_stages) && order.progress_stages.length > 0;
  const sourceProgressItem = itemForProgress && (hasItemProgressStages || hasOrderProgressStages)
    ? itemForProgress
    : hasOrderProgressStages
      ? { progress_stages: order.progress_stages }
      : null;

  if (sourceProgressItem) {
    return buildBatchProductTimelineStages(order, sourceProgressItem, itemIndex)
      .filter((step) => !step.key.endsWith("_admin_review"))
      .map((step) => ({
        ...step,
        done: step.status === "completed",
        active: ["in-progress", "delayed"].includes(step.status),
        future: !["completed", "cancelled", "in-progress", "delayed"].includes(step.status),
      }));
  }

  const contractAccepted = String(order?.contract_status || "").toLowerCase() === "accepted" || String(order?.status || "").toLowerCase() === "contract_accepted";
  const steps = contractAccepted
    ? [
        { key: "cutting", label: "Cutting" },
        { key: "assembly", label: "Assembly" },
        { key: "fabrication", label: "Fabrication" },
        { key: "installation", label: "Installation" },
        { key: "completed", label: "Completed" },
      ]
    : [
        { key: "order_submitted", label: "Order Submitted" },
        { key: "site_inspection", label: "Site Inspection" },
        { key: "contract_sent", label: "Contract Sent" },
        { key: "contract_accepted", label: "Contract Accepted" },
      ];

  const statusKey = String(order?.status || "").trim();
  const statusStepMap = {
    order_submitted: 0,
    admin_review: 0,
    site_inspection: 1,
    contract_sent: 2,
    contract_accepted: 3,
  };
  const activeIndex = contractAccepted ? 0 : statusStepMap[statusKey.toLowerCase()] ?? 0;

  if (statusKey === "cancelled") {
    return steps.map((step) => ({ ...step, done: false, active: false, future: true }));
  }

  return steps.map((step, index) => ({
    ...step,
    done: index < activeIndex,
    active: index === activeIndex && activeIndex < steps.length - 1,
    future: index > activeIndex,
  }));
};

const getStepIcon = (stepKey, isCompleted, isActive) => {
  const normalizedKey = String(stepKey || "").replace(/^batch_\d+_/, "").trim();
  const iconMap = {
    order_submitted: ClipboardCheck,
    admin_review: ClipboardCheck,
    site_inspection: Camera,
    contract_sent: FileText,
    contract_accepted: FileSignature,
    cutting: Scissors,
    assembly: Wrench,
    fabrication: Package,
    installation: Truck,
    completed: Star,
  };
  const Icon = iconMap[normalizedKey] || (isCompleted ? Star : ClipboardCheck);
  return <Icon size={16} aria-hidden="true" className={isActive || isCompleted ? "text-white" : "text-current"} />;
};

export default function OrderProgressTimeline({
  order,
  darkMode = false,
  getItemImage,
  getItemDimension,
  fallbackImage = "",
}) {
  const [photoGallery, setPhotoGallery] = useState(null);
  const [, setTimelineClock] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setTimelineClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const items = Array.isArray(order?.items) ? order.items : [];
  const normalizedStatus = String(order?.status || "").toLowerCase();

  if (items.length === 0) {
    return (
      <div className={`rounded-xl border border-dashed p-8 text-center text-sm ${darkMode ? "border-slate-700 text-slate-400" : "border-slate-300 text-slate-500"}`}>
        No items are listed for this order.
      </div>
    );
  }

  return (
    <div>
      {items.map((item, itemIndex) => {
        const productName = item?.name || item?.product_name || `Product ${itemIndex + 1}`;
        const productSize = getItemDimension?.(item) || formatOrderItemMeasurements(item);
        const isBatchOrder = items.length > 1;
        const progressSteps = buildCustomerOrderTimelineSteps(order, item, itemIndex);
        const delayedSteps = progressSteps.filter((step) => step.status === "delayed");
        const projectOverdue = isInstallationDeadlineOverdue(order);
        const image = normalizeOrderImageUrl(
          getItemImage?.(item) || getOrderItemImageSource(item) || fallbackImage
        );

        return (
          <article key={`${order?._id || order?.id || "order"}-detail-${itemIndex}`} className={`mb-2.5 rounded-[14px] border p-4 last:mb-0 ${darkMode ? "border-slate-700 bg-slate-800/50" : "border-border bg-muted/40"}`}>
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border ${darkMode ? "border-slate-700 bg-slate-900" : "border-border bg-card"}`}>
                  {image ? (
                    <img src={image} alt={productName} className="h-full w-full object-cover" onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = fallbackImage;
                    }} />
                  ) : (
                    <Package size={16} aria-hidden="true" className="text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-foreground">{productName}</p>
                  <p className="mt-0.5 break-words text-[13px] text-muted-foreground">{productSize}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 w-full">
              {projectOverdue && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200" role="status">
                  <AlertTriangle size={15} aria-hidden="true" className="shrink-0" />
                  <span>Project Overdue · estimated installation date has passed</span>
                </div>
              )}
              <ol className="flex w-full items-start gap-0 max-[560px]:flex-col">
                {progressSteps.map((step, stepIndex) => {
                  const isCompleted = step.done || (!isBatchOrder && normalizedStatus === "completed" && step.key === "completed");
                  const isCancelled = normalizedStatus === "cancelled";
                  const visibleSubStages = getVisibleCompletedStageSubStages(step);
                  const stagePhotos = Array.isArray(step.images)
                    ? step.images.map(normalizeOrderImageUrl).filter(Boolean)
                    : [];
                  const circleClass = isCancelled && stepIndex === 0
                    ? "border-rose-600 bg-rose-600 text-white"
                    : step.status === "delayed"
                      ? "border-rose-600 bg-rose-600 text-white"
                    : isCompleted
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : step.active
                        ? "border-amber-500 bg-amber-500 text-white ring-4 ring-amber-500/15"
                        : "border-border bg-card text-muted-foreground";
                  const labelClass = isCancelled && stepIndex === 0
                    ? "text-rose-700 dark:text-rose-300"
                    : step.status === "delayed"
                      ? "text-rose-700 dark:text-rose-300"
                    : isCompleted
                      ? "text-emerald-700 dark:text-emerald-300"
                      : step.active
                        ? "text-amber-800 dark:text-amber-300"
                        : "text-muted-foreground";
                  const connectorClass = step.status === "delayed"
                    ? "after:bg-rose-500"
                    : isCompleted
                      ? "after:bg-emerald-500"
                      : "after:bg-border";

                  return (
                    <li
                      key={`${productName}-${step.key}`}
                      aria-current={step.active ? "step" : undefined}
                      className={`relative flex min-w-0 flex-1 flex-col items-center gap-1.75 text-center after:absolute after:left-[calc(50%+22px)] after:right-[calc(-50%+22px)] after:top-[15px] after:z-0 after:h-0.5 after:rounded after:content-[''] last:after:hidden ${connectorClass} max-[560px]:flex-row max-[560px]:items-start max-[560px]:gap-3.5 max-[560px]:pb-[18px] max-[560px]:text-left max-[560px]:after:left-[15px] max-[560px]:after:right-auto max-[560px]:after:top-9 max-[560px]:after:h-[calc(100%-36px)] max-[560px]:after:w-0.5 max-[560px]:last:pb-0`}
                    >
                      <div className="flex min-w-0 flex-col items-center gap-1 max-[560px]:flex-row max-[560px]:items-center max-[560px]:gap-3.5 max-[560px]:text-left">
                        <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[9px] font-medium ${circleClass}`}>
                          {step.status === "delayed"
                            ? <AlertTriangle size={16} aria-hidden="true" className="text-white" />
                            : isCompleted
                              ? <Check size={16} aria-hidden="true" />
                              : getStepIcon(step.key, isCompleted, step.active)}
                        </span>
                        <span className={`max-w-full break-words text-[12.5px] font-medium leading-tight ${labelClass}`}>{step.label}</span>
                        {isCompleted && step.completionNote && (
                          <span className="max-w-full break-words text-[10px] leading-4 text-muted-foreground">
                            Completion note: {step.completionNote}
                          </span>
                        )}
                        {step.status === "delayed" && (
                          <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">Delayed</span>
                        )}
                        {stagePhotos.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setPhotoGallery({ title: step.label, images: stagePhotos })}
                            className="relative mt-1 h-9 w-9 shrink-0 overflow-hidden rounded-md border border-border bg-card transition-colors hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                            aria-label={`View ${stagePhotos.length} ${step.label} proof photo${stagePhotos.length === 1 ? "" : "s"}`}
                            title={`${stagePhotos.length} proof photo${stagePhotos.length === 1 ? "" : "s"}`}
                          >
                            <img src={stagePhotos[0]} alt={`${step.label} proof`} className="h-full w-full object-cover" />
                            {stagePhotos.length > 1 && (
                              <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[10px] font-medium text-white">
                                +{stagePhotos.length - 1}
                              </span>
                            )}
                          </button>
                        )}
                      </div>

                      {visibleSubStages.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-start justify-center gap-2 max-[560px]:justify-start">
                          {visibleSubStages.map((sub, subIndex) => {
                            const normalizedSubStatus = String(sub.status || "pending").toLowerCase();
                            const isSubCompleted = ["completed", "done"].includes(normalizedSubStatus);
                            const isSubDelayed = normalizedSubStatus === "delayed";
                            const subStatusClass = isSubCompleted
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : isSubDelayed
                                ? "border-rose-600 bg-rose-600 text-white"
                                : ["in-progress", "in_progress", "active"].includes(normalizedSubStatus)
                                  ? "border-amber-500 bg-amber-500 text-white"
                                  : "border-border bg-card text-muted-foreground";
                            const subPhotoUrls = Array.isArray(sub.images)
                              ? sub.images.map(normalizeOrderImageUrl).filter(Boolean)
                              : [];

                            return (
                              <div key={`${step.key}-sub-${subIndex}`} className="flex max-w-full shrink-0 flex-col items-center gap-1 text-center max-[560px]:items-start">
                                <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[8px] font-medium ${subStatusClass}`}>
                                  {isSubCompleted
                                    ? <Check size={10} aria-hidden="true" />
                                    : isSubDelayed
                                      ? <AlertTriangle size={10} aria-hidden="true" />
                                      : subIndex + 1}
                                </span>
                                <span className="text-[10px] leading-tight text-muted-foreground">
                                  {sub.name || `Sub-stage ${subIndex + 1}`}
                                </span>
                                {subPhotoUrls.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setPhotoGallery({ title: `${step.label} · ${sub.name || `Sub-stage ${subIndex + 1}`}`, images: subPhotoUrls })}
                                    className="relative mt-0.5 h-7 w-7 overflow-hidden rounded border border-border bg-card"
                                    aria-label={`View ${subPhotoUrls.length} ${sub.name || `sub-stage ${subIndex + 1}`} proof photo${subPhotoUrls.length === 1 ? "" : "s"}`}
                                  >
                                    <img src={subPhotoUrls[0]} alt="" className="h-full w-full object-cover" />
                                    {subPhotoUrls.length > 1 && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[8px] font-medium text-white">+{subPhotoUrls.length - 1}</span>}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              {delayedSteps.length > 0 && (
                <div className="mt-3 space-y-2">
                  {delayedSteps.map((step) => (
                    <div key={`${step.key}-delay`} className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-950 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
                      <AlertTriangle size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-rose-600" />
                      <div className="min-w-0">
                        <p className="font-medium">{step.label} is delayed</p>
                        <p className="mt-1 break-words dark:text-rose-200">{step.deadlineDelayed ? "The estimated installation date has passed." : step.delayReason || step.notes || "A delay has been reported."}</p>
                        {!step.deadlineDelayed && <p className="mt-1 dark:text-rose-300">Expected resolution: {step.delayExpectedResolution || "Not set"}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>
        );
      })}
      {photoGallery && (
        <div
          className="customer-modal-overlay mobile-fullscreen-overlay fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          role="presentation"
        >
          <div
            className="mobile-fullscreen-dialog max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border border-border bg-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-stage-gallery-title"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card p-4">
              <h3 id="order-stage-gallery-title" className="text-base font-medium text-foreground">
                {photoGallery.title} proof photos
              </h3>
              <button
                type="button"
                onClick={() => setPhotoGallery(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                aria-label="Close photo gallery"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
              {photoGallery.images.map((src, index) => (
                <img
                  key={`${photoGallery.title}-proof-${index}`}
                  src={src}
                  alt={`${photoGallery.title} proof photo ${index + 1}`}
                  className="max-h-[65vh] w-full rounded-lg border border-border bg-muted object-contain"
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
