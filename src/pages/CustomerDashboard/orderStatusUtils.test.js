import { describe, expect, it } from "vitest";
import { getOrderStatusClasses, getOrderStatusLabel, getSiteInspectionNotificationMessage, isOrderStatusCompleted, normalizeOrderStatus } from "./orderStatusUtils";

describe("customer order status utils", () => {
  it("normalizes mixed-case order statuses before filtering and rendering", () => {
    expect(normalizeOrderStatus("Completed")).toBe("completed");
    expect(normalizeOrderStatus(" Site Inspection ")).toBe("site inspection");
    expect(normalizeOrderStatus("Installation")).toBe("installation");
  });

  it("keeps the status key stable for title-case and snake_case payloads", () => {
    expect(normalizeOrderStatus("Site Inspection")).toBe("site inspection");
    expect(normalizeOrderStatus("contract_sent")).toBe("contract sent");
    expect(getOrderStatusLabel("Completed")).toBe("Completed");
    expect(getOrderStatusLabel("Site Inspection")).toBe("Site Inspection");
    expect(getOrderStatusClasses("Completed")).toContain("text-emerald-700");
    expect(getOrderStatusClasses("Installation")).toContain("text-red-700");
    expect(getOrderStatusClasses("cancelled")).toContain("text-red-800");
  });

  it("classifies completed orders by status independently of review submission", () => {
    expect(isOrderStatusCompleted({ status: "Completed" })).toBe(true);
    expect(isOrderStatusCompleted({ status: "completed", review: { submittedAt: "2026-10-14" } })).toBe(true);
    expect(isOrderStatusCompleted({ status: "installation", review: { submittedAt: "2026-10-14" } })).toBe(false);
  });

  it("shows the correct inspection wording for pending, scheduled, and completed states", () => {
    expect(getSiteInspectionNotificationMessage({ status: "site_inspection" })).toBe(
      "Your order request has been received. Our team will contact you to arrange a site inspection."
    );
    expect(getSiteInspectionNotificationMessage({ status: "site_inspection", inspection_date: "2026-10-12" })).toBe(
      "Your site inspection has been scheduled for Oct 12, 2026."
    );
    expect(getSiteInspectionNotificationMessage({ status: "site_inspection", inspection_status: "completed" })).toBe(
      "Your site inspection has been completed."
    );
  });
});
