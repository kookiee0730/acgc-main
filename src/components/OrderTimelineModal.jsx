import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clipboard, Copy, X } from "lucide-react";
import { formatDateToMMMDDYYYY } from "@/lib/dateUtils";
import { isAdminModalRoute } from "@/lib/globalModalBehavior";
import ItemCard from "./ItemCard";
import { formatOrderItemMeasurements } from "./OrderProgressTimeline";
import {
  buildCustomerOrderTimelineSteps,
  getOrderItemImageSource,
  normalizeOrderImageUrl,
} from "./OrderProgressTimeline";
import {
  getTimelineCurrentStage,
  getTimelineFocusStage,
} from "./orderTimelineUtils";

const getItemKey = (item, index) => String(item?._id || item?.id || `item-${index}`);
const EMPTY_ITEMS = [];

const getItemRows = (order, items, getItemImage, fallbackImage) => items.map((item, index) => {
  const stages = Array.isArray(item?.stages) && item.stages.length > 0
    ? item.stages
    : buildCustomerOrderTimelineSteps(order, item, index);
  const imageSource = getItemImage?.(item) || item?.imageUrl || getOrderItemImageSource(item) || fallbackImage;

  return {
    key: getItemKey(item, index),
    item,
    index,
    image: normalizeOrderImageUrl(imageSource),
    stages: stages.map((stage) => ({
      ...stage,
      completedAt: stage.completedAt || stage.date,
      note: stage.note || stage.notes,
      photos: stage.photos || stage.images,
    })),
  };
});

const groupSharedStages = (rows) => {
  const stageGroups = new Map();
  rows.forEach((row) => {
    const activeStage = getTimelineCurrentStage(row.stages);
    if (!activeStage) return;
    const groupKey = String(activeStage.batchStageKey || activeStage.key || activeStage.label || "")
      .replace(/^batch_\d+_/, "")
      .toLowerCase();
    if (!stageGroups.has(groupKey)) stageGroups.set(groupKey, []);
    stageGroups.get(groupKey).push({ row, stage: activeStage });
  });

  const groupedRows = new Map();
  stageGroups.forEach((members, stageKey) => {
    if (members.length < 5) return;
    const groupKey = `stage-group-${stageKey}`;
    const firstIndex = rows.findIndex((row) => row.key === members[0].row.key);
    groupedRows.set(firstIndex, {
      key: groupKey,
      groupItems: members.map(({ row }) => row),
      stageLabel: members[0].stage.label || members[0].stage.name || "Current stage",
    });
  });

  const groupedItemKeys = new Set(
    [...groupedRows.values()].flatMap((group) => group.groupItems.map((row) => row.key))
  );

  return rows.reduce((entries, row, index) => {
    if (groupedRows.has(index)) entries.push(groupedRows.get(index));
    if (!groupedItemKeys.has(row.key)) entries.push(row);
    return entries;
  }, []);
};

const getSummaryStage = (row) => getTimelineCurrentStage(row.stages) || getTimelineFocusStage(row.stages);

const formatStageSummary = (rows) => {
  const counts = new Map();
  rows.forEach((row) => {
    const stage = getTimelineCurrentStage(row.stages);
    if (stage) {
      const label = stage.label || stage.name || "In progress";
      counts.set(label, (counts.get(label) || 0) + 1);
    }
  });
  if (counts.size === 0) return "No stages currently in progress";
  return [...counts].map(([label, count]) => `${count} at ${label}`).join(", ");
};

const getAllExpandedKeys = (entries) => entries.flatMap((entry) => entry.groupItems
  ? [entry.key, ...entry.groupItems.map((row) => row.key)]
  : [entry.key]);
const normalizeNotificationStageKey = (value) => String(value || "")
  .replace(/^batch_\d+_/, "")
  .toLowerCase()
  .replace(/[\s-]+/g, "_");

function LoadingRows({ darkMode }) {
  return (
    <div className="space-y-3" aria-label="Loading order progress" role="status">
      {[0, 1, 2].map((row) => (
        <div key={row} className={`animate-pulse rounded-xl border p-4 ${darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
          <div className="flex items-center gap-3">
            <div className={`h-11 w-11 rounded-lg ${darkMode ? "bg-slate-700" : "bg-slate-200"}`} />
            <div className="flex-1 space-y-2">
              <div className={`h-3 w-2/5 rounded ${darkMode ? "bg-slate-700" : "bg-slate-200"}`} />
              <div className={`h-2.5 w-3/5 rounded ${darkMode ? "bg-slate-800" : "bg-slate-100"}`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OrderTimelineModal({
  order,
  onClose,
  darkMode = false,
  loading = false,
  getItemImage,
  getItemDimension = formatOrderItemMeasurements,
  fallbackImage = "",
  onContactSupport,
  onUploadProgressPhoto,
  notificationTarget = null,
}) {
  const items = Array.isArray(order?.items) ? order.items : EMPTY_ITEMS;
  const rows = useMemo(
    () => getItemRows(order, items, getItemImage, fallbackImage),
    [order, items, getItemImage, fallbackImage]
  );
  const entries = useMemo(() => groupSharedStages(rows), [rows]);
  const allKeys = useMemo(() => getAllExpandedKeys(entries), [entries]);
  const [expandedKeys, setExpandedKeys] = useState(() => {
    const firstEntry = entries[0];
    const initialKeys = new Set(firstEntry ? [firstEntry.key] : []);
    if (firstEntry?.groupItems?.[0]) initialKeys.add(firstEntry.groupItems[0].key);
    else if (items.length > 1 && rows[0]) initialKeys.add(rows[0].key);
    return initialKeys;
  });
  const [stageFilter, setStageFilter] = useState("all");
  const [photoGallery, setPhotoGallery] = useState(null);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const copyTimerRef = useRef(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(copyTimerRef.current);
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, []);

  useEffect(() => {
    if (!notificationTarget?.stageKey && !notificationTarget?.stageName) return undefined;

    const requestedItemIndex = Number.isInteger(notificationTarget.itemIndex)
      ? notificationTarget.itemIndex
      : null;
    const matchesStage = (stage) => (
      (notificationTarget.stageKey && normalizeNotificationStageKey(stage?.key) === normalizeNotificationStageKey(notificationTarget.stageKey)) ||
      (notificationTarget.stageName && String(stage?.label || stage?.name || "").toLowerCase() === String(notificationTarget.stageName).toLowerCase())
    );
    const targetRow = rows.find((row) => (
      (requestedItemIndex === null || row.index === requestedItemIndex) && row.stages.some(matchesStage)
    ));
    const targetEntry = targetRow && entries.find((entry) => (
      entry.key === targetRow.key || entry.groupItems?.some((row) => row.key === targetRow.key)
    ));

    if (targetRow) {
      setExpandedKeys((current) => {
        const next = new Set(current);
        if (targetEntry) next.add(targetEntry.key);
        next.add(targetRow.key);
        return next;
      });
    }

    let attempts = 0;
    const scrollToStage = () => {
      const target = Array.from(dialogRef.current?.querySelectorAll("[data-notification-stage-key]") || [])
        .find((element) => (
          matchesStage({ key: element.dataset.notificationStageKey, label: element.dataset.notificationStageName }) &&
          (requestedItemIndex === null || Number(element.dataset.notificationItemIndex) === requestedItemIndex)
        ));
      if (target) {
        window.clearInterval(scrollInterval);
        target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      } else if (attempts >= 30) {
        window.clearInterval(scrollInterval);
      }
      attempts += 1;
    };
    const scrollInterval = window.setInterval(scrollToStage, 100);
    const frame = window.requestAnimationFrame(scrollToStage);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(scrollInterval);
    };
  }, [notificationTarget, rows, entries]);

  const trackingId = order?.trackingId || order?.tracking || order?._id || order?.id || "Order";
  const placedDate = order?.createdAt || order?.created_at;
  const dateLabel = placedDate ? formatDateToMMMDDYYYY(placedDate) : "Date unavailable";
  const expandAll = () => setExpandedKeys(new Set(allKeys));
  const collapseAll = () => setExpandedKeys(new Set());
  const allExpanded = allKeys.length > 0 && allKeys.every((key) => expandedKeys.has(key));
  const stageOptions = [...new Set(rows.map((row) => getSummaryStage(row)?.label || getSummaryStage(row)?.name).filter(Boolean))];
  const visibleEntries = stageFilter === "all"
    ? entries
    : entries.filter((entry) => {
        const matchingRows = entry.groupItems || [entry];
        return matchingRows.some((row) => {
          const stage = getSummaryStage(row);
          return (stage?.label || stage?.name) === stageFilter;
        });
      });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(String(trackingId));
      setCopied(true);
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const handleDialogKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (photoGallery) setPhotoGallery(null);
      else onClose();
      return;
    }

    if (photoGallery && event.key === "ArrowRight") {
      event.preventDefault();
      setPhotoGallery((gallery) => ({ ...gallery, index: (gallery.index + 1) % gallery.photos.length }));
      return;
    }
    if (photoGallery && event.key === "ArrowLeft") {
      event.preventDefault();
      setPhotoGallery((gallery) => ({ ...gallery, index: (gallery.index - 1 + gallery.photos.length) % gallery.photos.length }));
      return;
    }

    if (event.key === "Tab") {
      const focusable = [...(dialogRef.current?.querySelectorAll(
        "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      ) || [])].filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const toggleKey = (key) => setExpandedKeys((previous) => {
    const next = new Set(previous);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const isEmpty = items.length === 0 || rows.every((row) => row.stages.length === 0);

  return (
    <div
      className={`${isAdminModalRoute() ? "" : "customer-modal-overlay"} mobile-fullscreen-overlay fixed inset-0 z-[70] flex items-stretch justify-center bg-black/45 p-0 lg:items-center lg:p-4`}
      role="presentation"
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-timeline-title"
        onKeyDown={handleDialogKeyDown}
        className={`mobile-fullscreen-dialog flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col overflow-hidden rounded-none border shadow-2xl lg:h-auto lg:max-h-[90vh] lg:max-w-[560px] lg:rounded-2xl ${darkMode ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}
      >
        <header className={`grid shrink-0 grid-cols-[minmax(0,1fr)_2.25rem] items-start gap-x-3 gap-y-2 border-b px-4 py-3.5 sm:px-5 ${darkMode ? "border-slate-700" : "border-slate-200"}`}>
          <div className="min-w-0">
            <h2 id="order-timeline-title" className="text-base font-semibold">Order timeline</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
              <span className={`min-w-0 break-all font-mono ${darkMode ? "text-slate-300" : "text-slate-600"}`}>{trackingId}</span>
              <button
                type="button"
                onClick={handleCopy}
                aria-label={copied ? "Tracking ID copied" : "Copy tracking ID"}
                title={copied ? "Copied" : "Copy tracking ID"}
                className={`inline-flex h-6 items-center gap-1 rounded-md px-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${darkMode ? "text-slate-400 hover:bg-slate-800" : "text-slate-500 hover:bg-slate-100"}`}
              >
                {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                {copied && <span>Copied</span>}
              </button>
              <span className={`break-words ${darkMode ? "text-slate-500" : "text-slate-400"}`}>· Placed {dateLabel}</span>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${darkMode ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            aria-label="Close order timeline"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3.5 lg:max-h-[70vh] lg:px-5 ${darkMode ? "bg-slate-950/40" : "bg-slate-50/70"}`}>
          {order?.project_delay?.is_delayed && (
            <section className={`mb-3 rounded-xl border p-3 ${darkMode ? "border-amber-800 bg-amber-950/40" : "border-amber-200 bg-amber-50"}`} aria-label="Project delay update">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">Project delayed</span>
                {order.project_delay.proposed_revised_installation_date && <span className={`text-xs ${darkMode ? "text-amber-200" : "text-amber-900"}`}>Proposed date (pending confirmation): {new Date(order.project_delay.proposed_revised_installation_date).toLocaleDateString()}</span>}
              </div>
              <p className={`mt-2 text-sm ${darkMode ? "text-slate-200" : "text-slate-700"}`}>{order.project_delay.reason}</p>
            </section>
          )}
          {items.length > 1 && !loading && !isEmpty && (
            <div className={`mb-3 flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between ${darkMode ? "border-slate-700" : "border-slate-200"}`}>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{items.length} items</p>
                <p className={`mt-0.5 break-words text-xs sm:truncate ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{formatStageSummary(rows)}</p>
              </div>
              <div className="grid w-full gap-2 sm:flex sm:w-auto sm:shrink-0 sm:items-center">
                {items.length >= 10 && (
                  <label className="sr-only" htmlFor="timeline-stage-filter">Filter items by stage</label>
                )}
                {items.length >= 10 && (
                  <select
                    id="timeline-stage-filter"
                    value={stageFilter}
                    onChange={(event) => setStageFilter(event.target.value)}
                    className={`w-full rounded-lg border px-2 py-2 text-xs sm:w-32 sm:py-1.5 ${darkMode ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-300 bg-white text-slate-700"}`}
                  >
                    <option value="all">All stages</option>
                    {stageOptions.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                  </select>
                )}
                <button
                  type="button"
                  onClick={allExpanded ? collapseAll : expandAll}
                  className={`w-full rounded-lg border px-3 py-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:w-auto sm:py-1.5 ${darkMode ? "border-slate-700 text-slate-200 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-white"}`}
                >
                  {allExpanded ? "Collapse all" : "Expand all"}
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <LoadingRows darkMode={darkMode} />
          ) : isEmpty ? (
            <div className={`rounded-xl border border-dashed px-5 py-10 text-center ${darkMode ? "border-slate-700" : "border-slate-300"}`}>
              <Clipboard size={22} className={`mx-auto ${darkMode ? "text-slate-500" : "text-slate-400"}`} aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold">No progress updates yet</p>
              <p className={`mt-1 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Updates will appear here as your order moves forward.</p>
            </div>
          ) : items.length === 1 ? (
            <ItemCard
              row={rows[0]}
              isSingle
              darkMode={darkMode}
              getItemDimension={getItemDimension}
              fallbackImage={fallbackImage}
              onPhotoOpen={setPhotoGallery}
                onUploadProgressPhoto={onUploadProgressPhoto}
                notificationTarget={notificationTarget}
            />
          ) : (
            <div className="space-y-2.5">
              {visibleEntries.map((entry) => (
                <ItemCard
                  key={entry.key}
                  row={entry}
                  isExpanded={expandedKeys.has(entry.key)}
                  onToggle={() => toggleKey(entry.key)}
                  darkMode={darkMode}
                  getItemDimension={getItemDimension}
                  fallbackImage={fallbackImage}
                  expandedKeys={expandedKeys}
                  onToggleKey={toggleKey}
                  onPhotoOpen={setPhotoGallery}
                  onUploadProgressPhoto={onUploadProgressPhoto}
                  notificationTarget={notificationTarget}
                />
              ))}
            </div>
          )}
        </div>

        <footer className={`flex shrink-0 items-center justify-end gap-3 border-t px-4 py-3 sm:px-5 ${darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${darkMode ? "border-slate-600 text-slate-200 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
          >
            Close
          </button>
        </footer>

        {photoGallery && (
          <div
            className={`${isAdminModalRoute() ? "" : "customer-modal-overlay"} fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4`}
            role="dialog"
            aria-modal="true"
            aria-label={`${photoGallery.title} photos`}
          >
            <div className="flex max-h-[90vh] w-full max-w-3xl flex-col items-center gap-3">
              <div className="flex w-full items-center justify-between text-sm text-white">
                <span>{photoGallery.title} · {photoGallery.index + 1} of {photoGallery.photos.length}</span>
                <button type="button" onClick={() => setPhotoGallery(null)} className="rounded-lg p-2 text-white hover:bg-white/10" aria-label="Close photo viewer">
                  <X size={19} aria-hidden="true" />
                </button>
              </div>
              <img
                src={photoGallery.photos[photoGallery.index]}
                alt={`${photoGallery.title} photo ${photoGallery.index + 1}`}
                className="max-h-[76vh] max-w-full rounded-xl object-contain"
              />
              {photoGallery.photos.length > 1 && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPhotoGallery((gallery) => ({ ...gallery, index: (gallery.index - 1 + gallery.photos.length) % gallery.photos.length }))}
                    className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft size={19} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoGallery((gallery) => ({ ...gallery, index: (gallery.index + 1) % gallery.photos.length }))}
                    className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
                    aria-label="Next photo"
                  >
                    <ChevronRight size={19} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
