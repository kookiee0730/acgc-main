const isInstallationStage = (stage) => {
  const key = String(stage?.key || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const name = String(stage?.name || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return [key, name].some((value) => value === "installation" || value.startsWith("installation_"));
};

const isStageInProgress = (stage) =>
  ["in_progress", "in-progress", "active", "current"].includes(String(stage?.status || "").toLowerCase());

export const isProgressStageCompleted = (stage) =>
  (stage?.completed === true || ["done", "completed"].includes(String(stage?.status || "").toLowerCase())) &&
  (Array.isArray(stage?.subStages) ? stage.subStages : []).every((subStage) =>
    subStage?.completed === true || ["done", "completed"].includes(String(subStage?.status || "").toLowerCase())
  );

const isStageCompleted = isProgressStageCompleted;

const getStageIdentity = (stage, index) => String(stage?.key || stage?.name || index).toLowerCase();

export const isInstallationProgressStage = (stage) => {
  const key = String(stage?.key || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const name = String(stage?.name || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return [key, name].some((value) => value === "installation" || value.startsWith("installation_"));
};

export const buildInstallationNotificationEvents = (stages, { itemIndex = null, productName = "" } = {}) => {
  const progressStages = Array.isArray(stages) ? stages : [];
  const installationIndex = progressStages.findIndex(isInstallationProgressStage);
  if (installationIndex < 0) return [];

  const installationStage = progressStages[installationIndex];
  const precedingStagesCompleted = progressStages.slice(0, installationIndex).every(isStageCompleted);
  const installationCompleted = isStageCompleted(installationStage);
  const installationStatus = String(installationStage.status || "").toLowerCase();
  const installationEligible = precedingStagesCompleted && !installationCompleted && !["delayed", "on_hold"].includes(installationStatus);
  const stageKey = String(installationStage.key || installationStage.name || "installation").toLowerCase().replace(/[\s-]+/g, "_");
  const eventScope = itemIndex === null ? "order" : `item:${itemIndex}`;
  const events = [];

  if (installationEligible) {
    events.push({
      eventKey: `installation_up_next:${stageKey}:${eventScope}`,
      type: "installation_up_next",
      title: "Installation Coming Up",
      message: "Your ACGC order is up next for installation. Our team will begin the installation stage soon. Please stay tuned for updates.",
      stageKey: installationStage.key || stageKey,
      stageName: installationStage.name || "Installation",
      installationDate: installationStage.proposedInstallationDate || installationStage.date || null,
      itemIndex,
      productName,
    });
  }

  if (installationCompleted) {
    events.push({
      eventKey: `installation_completed:${stageKey}:${eventScope}`,
      type: "installation_completed",
      title: "Installation Completed",
      message: "The installation for your ACGC order has been completed. Thank you for choosing ACGC Aluminum Services!",
      stageKey: installationStage.key || stageKey,
      stageName: installationStage.name || "Installation",
      itemIndex,
      productName,
      completedAt: installationStage.installationCompletedAt || installationStage.date || null,
    });
  }

  return events;
};

export const applyInstallationNotificationTimestamps = (previousStages, targetStages, now = () => new Date()) => {
  const previousStageByIdentity = new Map(
    (Array.isArray(previousStages) ? previousStages : []).map((stage, index) => [getStageIdentity(stage, index), stage])
  );

  return targetStages.map((stage, index) => {
    if (!isInstallationStage(stage)) return stage;

    const previousStage = previousStageByIdentity.get(getStageIdentity(stage, index));
    const isInProgress = isStageInProgress(stage);
    const isCompleted = isStageCompleted(stage);
    const previousStartedAt = previousStage?.installationStartedAt || null;
    const previousCompletedAt = previousStage?.installationCompletedAt || null;
    const needsEventDate = (!previousStartedAt && (isInProgress || isCompleted)) || (!previousCompletedAt && isCompleted);
    const eventDate = needsEventDate ? now() : null;

    return {
      ...stage,
      installationStartedAt: previousStartedAt || (isInProgress || isCompleted ? eventDate : null),
      installationCompletedAt: previousCompletedAt || (isCompleted ? eventDate : null),
    };
  });
};
