import test from "node:test";
import assert from "node:assert/strict";
import { attachOrderScheduleOverdue, isOrderScheduleOverdue } from "./orderScheduleOverdue.js";

const dueDate = "2026-10-29T00:00:00.000Z";
const onDueDate = new Date("2026-10-29T04:00:00.000Z");
const incompleteStages = [
  { key: "cutting", status: "done", completed: true },
  { key: "assembly", status: "in_progress", completed: false },
  { key: "fabrication", status: "pending", completed: false },
  { key: "installation", status: "pending", completed: false },
];

test("installation deadline overdue uses the Asia/Manila calendar date inclusively", () => {
  const order = { status: "processing", estimated_installation_date: dueDate, progress_stages: incompleteStages };
  assert.equal(isOrderScheduleOverdue(order, new Date("2026-10-28T15:59:59.000Z")), false);
  assert.equal(isOrderScheduleOverdue(order, onDueDate), true);
  assert.equal(isOrderScheduleOverdue(order, new Date("2026-10-30T00:00:00.000Z")), true);
});

test("future deadline changes clear the derived overdue flag and past changes keep it", () => {
  const order = { status: "processing", progress_stages: incompleteStages };
  assert.equal(isOrderScheduleOverdue({ ...order, estimated_installation_date: "2026-11-05T00:00:00.000Z" }, onDueDate), false);
  assert.equal(isOrderScheduleOverdue({ ...order, estimated_installation_date: "2026-10-28T00:00:00.000Z" }, onDueDate), true);
});

test("completed and cancelled orders do not receive an active overdue flag", () => {
  assert.equal(isOrderScheduleOverdue({ status: "completed", estimated_installation_date: dueDate, progress_stages: incompleteStages }, onDueDate), false);
  assert.equal(isOrderScheduleOverdue({ status: "cancelled", estimated_installation_date: dueDate, progress_stages: incompleteStages }, onDueDate), false);
});

test("all completed stages and substages keep their actual completion dates and are not overdue", () => {
  const completedStages = incompleteStages.map((stage) => ({ ...stage, status: "done", completed: true, date: "2026-10-29T06:00:00.000Z" }));
  const order = { status: "processing", estimated_installation_date: dueDate, progress_stages: completedStages };
  const response = attachOrderScheduleOverdue(order, onDueDate);
  assert.equal(response.schedule_overdue, false);
  assert.equal(response.progress_stages[0].date, "2026-10-29T06:00:00.000Z");
});
