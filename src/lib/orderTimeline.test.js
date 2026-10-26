import { describe, expect, it } from "vitest";
import { buildBatchProductTimelineStages, buildOrderTimelineStages, calculateStageProgressPercent, isInstallationDeadlineOverdue } from "./orderTimeline";
import { buildCustomerOrderTimelineSteps, formatOrderItemMeasurements, getOrderItemImageSource, getVisibleCompletedStageSubStages } from "../components/OrderProgressTimeline";
import { buildStartedProgressStages, getProjectStatus } from "../pages/ProgressMonitor/ProgressMonitor";

const makeStages = (completedKeys = [], activeKey = "") =>
  ["cutting", "assembly", "fabrication", "installation"].map((key) => ({
    key,
    name: key[0].toUpperCase() + key.slice(1),
    status: completedKeys.includes(key) ? "done" : key === activeKey ? "in_progress" : "pending",
    completed: completedKeys.includes(key),
  }));

describe("buildBatchProductTimelineStages", () => {
  it("shows each batch item's own production stages", () => {
    const order = { status: "contract_accepted", contract_status: "accepted" };
    const firstProduct = {
      name: "Aluminum Door",
      progress_stages: makeStages(["cutting"], "assembly"),
    };
    const secondProduct = {
      name: "Glass Door",
      progress_stages: makeStages(["cutting", "assembly"], "fabrication"),
    };

    const firstStages = buildBatchProductTimelineStages(order, firstProduct, 0);
    const secondStages = buildBatchProductTimelineStages(order, secondProduct, 1);
    const findProductionStage = (steps, key) => steps.find((step) => step.batchStageKey === key);

    expect(findProductionStage(firstStages, "assembly").status).toBe("in-progress");
    expect(findProductionStage(secondStages, "assembly").status).toBe("completed");
    expect(findProductionStage(secondStages, "fabrication").status).toBe("in-progress");
    expect(firstStages.at(-1).status).toBe("pending");
    expect(secondStages.at(-1).status).toBe("pending");
  });

  it("hides pre-production milestones after the contract is accepted", () => {
    const order = { status: "contract_accepted", contract_status: "accepted" };
    const product = { progress_stages: makeStages(["cutting"], "assembly") };
    const stages = buildBatchProductTimelineStages(order, product, 0);

    expect(stages.some((step) => step.key.includes("order_submitted"))).toBe(false);
    expect(stages.some((step) => step.key.includes("site_inspection"))).toBe(false);
    expect(stages.some((step) => step.key.includes("contract_sent"))).toBe(false);
    expect(stages.some((step) => step.key.includes("contract_accepted"))).toBe(false);
    expect(stages.some((step) => step.batchStageKey === "cutting")).toBe(true);
    expect(stages.some((step) => step.batchStageKey === "assembly")).toBe(true);
  });

  it("hides production stages until the contract is accepted", () => {
    const order = { status: "contract_sent", contract_status: "sent" };
    const product = { progress_stages: makeStages([], "cutting") };
    const stages = buildBatchProductTimelineStages(order, product, 0);

    expect(stages.map((step) => step.label)).toEqual([
      "Order Submitted",
      "Admin Review",
      "Site Inspection",
      "Contract Sent",
      "Contract Accepted",
    ]);
    expect(stages.some((step) => step.batchStageKey)).toBe(false);
    expect(stages.some((step) => step.label === "Completed")).toBe(false);
  });

  it("starts the accepted-contract timeline at cutting when no production stages are saved yet", () => {
    const order = { status: "contract_accepted", contract_status: "accepted" };
    const stages = buildBatchProductTimelineStages(order, {}, 0);

    expect(stages[0].batchStageKey).toBe("cutting");
    expect(stages[0].label).toBe("Cutting");
    expect(stages.some((step) => step.key.includes("order_submitted"))).toBe(false);
  });

  it("marks a product complete only after all of its production stages are done", () => {
    const order = { status: "completed", contract_status: "accepted" };
    const allStagesComplete = { progress_stages: makeStages(["cutting", "assembly", "fabrication", "installation"]) };
    const installationPending = { progress_stages: makeStages(["cutting", "assembly", "fabrication"]) };

    expect(buildBatchProductTimelineStages(order, allStagesComplete).at(-1).status).toBe("completed");
    expect(buildBatchProductTimelineStages(order, installationPending).at(-1).status).toBe("pending");
  });

  it("preserves custom and installation scheduling stages in saved order", () => {
    const order = { status: "contract_accepted", contract_status: "accepted" };
    const item = {
      progress_stages: [
        { key: "cutting", name: "Cutting", status: "done", completed: true },
        { key: "custom_stage", name: "Frame Assembly", status: "in_progress", completed: false },
        { key: "installation_scheduling", name: "Installation Scheduling", status: "pending", completed: false },
        { key: "installation", name: "Installation", status: "pending", completed: false },
      ],
    };

    const steps = buildBatchProductTimelineStages(order, item);
    expect(steps.slice(0, 4).map((step) => step.batchStageKey)).toEqual([
      "cutting",
      "custom_stage",
      "installation_scheduling",
      "installation",
    ]);
    expect(steps[1]).toMatchObject({ label: "Frame Assembly", status: "in-progress" });
    expect(steps[3]).toMatchObject({ label: "Installation", status: "pending" });
  });

  it("does not complete a parent stage while a saved sub-stage is incomplete", () => {
    const steps = buildBatchProductTimelineStages(
      { status: "completed", contract_status: "accepted" },
      { progress_stages: [
        { key: "installation", name: "Installation", status: "done", completed: true, subStages: [{ name: "Final fit", status: "pending", completed: false }] },
      ] }
    );

    expect(steps[0]).toMatchObject({ batchStageKey: "installation", status: "pending" });
    expect(steps.at(-1).status).toBe("pending");
  });

  it("uses the first item progress stages when building a single order timeline", () => {
    const order = {
      status: "contract_accepted",
      contract_status: "accepted",
      items: [{
        progress_stages: makeStages(["cutting"], "assembly"),
      }],
      progress_stages: [],
    };

    const stages = buildOrderTimelineStages(order);
    const cutting = stages.find((stage) => (stage.key || "").toLowerCase() === "cutting");
    const assembly = stages.find((stage) => (stage.key || "").toLowerCase() === "assembly");

    expect(cutting?.status).toBe("completed");
    expect(assembly?.status).toBe("in-progress");
  });

  it("returns the active production stage name when the stage status uses hyphenated values", () => {
    const order = { status: "contract_accepted", contract_status: "accepted" };
    const stages = [
      { key: "cutting", name: "Cutting", status: "done", completed: true },
      { key: "assembly", name: "Assembly", status: "in-progress", completed: false },
      { key: "fabrication", name: "Fabrication", status: "pending", completed: false },
    ];

    expect(getProjectStatus(order, stages)).toBe("Assembly");
  });

  it("keeps Progress Monitor on a parent stage with an unfinished sub-stage", () => {
    const stages = [
      { key: "cutting", name: "Cutting", status: "done", completed: true },
      { key: "installation", name: "Installation", status: "done", completed: true, subStages: [{ name: "Final fit", status: "pending", completed: false }] },
    ];

    expect(getProjectStatus({ status: "completed" }, stages)).toBe("Installation");
  });

  it("starts a pending project at Cutting and leaves later stages pending", () => {
    const stages = buildStartedProgressStages([]);

    expect(stages.map(({ name, status }) => [name, status])).toEqual([
      ["Cutting", "in_progress"],
      ["Assembly", "pending"],
      ["Fabrication", "pending"],
      ["Installation", "pending"],
    ]);
    expect(getProjectStatus({ status: "approved" }, stages)).toBe("Cutting");
  });

  it("shares the customer's active stage state for admin order timelines", () => {
    const order = { status: "contract_accepted", contract_status: "accepted" };
    const item = { progress_stages: makeStages(["cutting"], "assembly") };
    const steps = buildCustomerOrderTimelineSteps(order, item, 0);

    expect(steps.find((step) => step.batchStageKey === "cutting")).toMatchObject({ done: true, active: false });
    expect(steps.find((step) => step.batchStageKey === "assembly")).toMatchObject({ done: false, active: true });
    expect(steps.find((step) => step.batchStageKey === "fabrication")).toMatchObject({ done: false, active: false, future: true });
  });

  it("passes delay reason and expected resolution into the customer/admin timeline", () => {
    const order = { status: "contract_accepted", contract_status: "accepted" };
    const item = {
      progress_stages: [{
        key: "cutting",
        name: "Cutting",
        status: "delayed",
        delayReason: "Waiting for supplier materials",
        delayExpectedResolution: "2026-10-05T00:00:00.000Z",
      }],
    };
    const cutting = buildCustomerOrderTimelineSteps(order, item, 0)
      .find((step) => step.batchStageKey === "cutting");

    expect(cutting).toMatchObject({
      status: "delayed",
      active: true,
      delayReason: "Waiting for supplier materials",
      delayExpectedResolution: "Oct-05-2026",
    });
  });

  it("keeps uploaded proof photos attached to their timeline stage", () => {
    const photoUrls = ["/uploads/cutting-proof-1.jpg", "/uploads/cutting-proof-2.jpg"];
    const steps = buildCustomerOrderTimelineSteps(
      { status: "contract_accepted", contract_status: "accepted" },
      { progress_stages: [{ key: "cutting", name: "Cutting", status: "in_progress", images: photoUrls }] },
      0
    );

    expect(steps.find((step) => step.batchStageKey === "cutting").images).toEqual(photoUrls);
  });

  it("shows saved sub-stage progress before the parent stage is completed", () => {
    const subStages = [{ name: "Cut glass", status: "completed" }];

    expect(getVisibleCompletedStageSubStages({ status: "in-progress", subStages })).toEqual(subStages);
    expect(getVisibleCompletedStageSubStages({ status: "completed", subStages })).toEqual(subStages);
  });

  it("does not mark installation or the project complete from order status alone", () => {
    const order = {
      status: "completed",
      contract_status: "accepted",
      progress_stages: [
        ...makeStages(["cutting", "assembly", "fabrication"], "installation"),
      ],
    };
    const stages = buildOrderTimelineStages(order);

    expect(stages.find((stage) => stage.key === "installation")?.status).toBe("in-progress");
    expect(stages.find((stage) => stage.key === "project_completed")?.status).toBe("pending");
  });

  it("shows exact order-item measurements instead of quantity", () => {
    expect(formatOrderItemMeasurements({
      quantity: 1,
      dimensions: { width: 30, height: 48, unit: "in" },
    })).toBe('Size: 30" x 48" (10 sq ft)');
  });

  it("uses populated product measurements and standard size when order dimensions are missing", () => {
    expect(formatOrderItemMeasurements({
      product_id: { width: 24, height: 36, measurement_unit: "in" },
      quantity: 1,
    })).toBe('Size: 24" x 36" (6 sq ft)');
    expect(formatOrderItemMeasurements({
      product_id: { standard_size: "24 x 36 inches" },
      quantity: 1,
    })).toBe("Size: 24 x 36 inches");
    expect(formatOrderItemMeasurements({ quantity: 1 })).toBe("Measurements not provided");
  });

  it("shows the selected blade glass, frame, and blade count without dimensions", () => {
    expect(formatOrderItemMeasurements({
      pricing_method: "blade",
      blade_glass_type: "Reflective",
      sale_mode: "frame",
      frame_type: "Large",
      blade_count: 8,
    })).toBe("Reflective · Large frame · 8 blades");
  });

  it("resolves product photos from item, populated product, and nested image fields", () => {
    expect(getOrderItemImageSource({
      product_id: { images: { main: "/uploads/product-main.png" } },
    })).toBe("/uploads/product-main.png");
    expect(getOrderItemImageSource({
      image_url: "/uploads/order-item.png",
      product_id: { image_url: "/uploads/product.png" },
    })).toBe("/uploads/order-item.png");
  });

  it("maps the fill width to the current active production stage instead of the final completed state", () => {
    const steps = [
      { key: "cutting", label: "Cutting", active: true, done: false },
      { key: "assembly", label: "Assembly", active: false, done: false },
      { key: "fabrication", label: "Fabrication", active: false, done: false },
      { key: "installation", label: "Installation", active: false, done: false },
      { key: "completed", label: "Completed", active: false, done: false },
    ];

    expect(calculateStageProgressPercent(steps)).toBe(20);

    const nextStage = steps.map((step, index) =>
      index === 1 ? { ...step, active: true } : { ...step, active: false }
    );

    expect(calculateStageProgressPercent(nextStage)).toBe(40);
  });

  it("shows 60 percent when three of five stages are done and Installation is next", () => {
    const order = { status: "processing", contract_status: "accepted" };
    const item = { progress_stages: makeStages(["cutting", "assembly", "fabrication"]) };
    const stages = buildBatchProductTimelineStages(order, item);

    expect(stages.map((stage) => stage.status)).toEqual([
      "completed",
      "completed",
      "completed",
      "pending",
      "pending",
    ]);
    expect(calculateStageProgressPercent(stages)).toBe(60);
  });
});

describe("automatic installation deadline delay", () => {
  const deadline = "2026-10-29T00:00:00.000Z";
  const dueDay = new Date("2026-10-29T04:00:00.000Z");
  const order = (overrides = {}) => ({
    status: "processing",
    contract_status: "accepted",
    estimated_installation_date: deadline,
    ...overrides,
  });

  it("marks every unfinished production stage delayed on the deadline without delaying Completed", () => {
    const stages = buildBatchProductTimelineStages(order(), { progress_stages: makeStages([], "fabrication") }, 0, { now: dueDay });
    expect(stages.map(({ status }) => status)).toEqual(["delayed", "delayed", "delayed", "delayed", "pending"]);
  });

  it("preserves completed stages and their dates while delaying unfinished stages", () => {
    const savedStages = makeStages(["cutting", "assembly"], "fabrication");
    savedStages[0].date = "2026-10-20T12:00:00.000Z";
    const stages = buildBatchProductTimelineStages(order(), { progress_stages: savedStages }, 0, { now: dueDay });
    expect(stages.slice(0, 2).map(({ status }) => status)).toEqual(["completed", "completed"]);
    expect(stages.slice(2, 4).map(({ status }) => status)).toEqual(["delayed", "delayed"]);
    expect(stages[0].date).toContain("Oct-20-2026");
  });

  it("removes derived delay when the deadline changes to a future date", () => {
    const updatedOrder = order({ estimated_installation_date: "2026-11-05T00:00:00.000Z" });
    expect(isInstallationDeadlineOverdue(updatedOrder, dueDay)).toBe(false);
    expect(buildBatchProductTimelineStages(updatedOrder, { progress_stages: makeStages([], "fabrication") }, 0, { now: dueDay })
      .map(({ status }) => status)).toEqual(["pending", "pending", "in-progress", "pending", "pending"]);
  });

  it("keeps unfinished stages delayed when the changed deadline is still past", () => {
    const updatedOrder = order({ estimated_installation_date: "2026-10-28T00:00:00.000Z" });
    expect(isInstallationDeadlineOverdue(updatedOrder, dueDay)).toBe(true);
  });

  it("clears active deadline delay when the project is complete", () => {
    expect(isInstallationDeadlineOverdue(order({ status: "completed" }), dueDay)).toBe(false);
  });

  it("derives the same deadline status after reloading and does not change actual progress", () => {
    const persistedOrder = order();
    const item = { progress_stages: makeStages([], "fabrication") };
    const firstView = buildBatchProductTimelineStages(persistedOrder, item, 0, { now: dueDay });
    const reloadedView = buildBatchProductTimelineStages({ ...persistedOrder }, { ...item }, 0, { now: dueDay });
    const progressStages = buildBatchProductTimelineStages(persistedOrder, item, 0, { now: dueDay, applyDeadlineDelay: false });
    expect(reloadedView.map(({ status }) => status)).toEqual(firstView.map(({ status }) => status));
    expect(calculateStageProgressPercent(firstView)).toBe(calculateStageProgressPercent(progressStages));
    expect(item.progress_stages.map(({ status }) => status)).toEqual(["pending", "pending", "in_progress", "pending"]);
  });
});
