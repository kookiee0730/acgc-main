import { getFinalProjectCost, getRequiredDownpayment } from "@/lib/orderPricing";

export const getSavedPaymentTermsLabel = (paymentTerms) => {
  const terms = String(paymentTerms || "").trim().toLowerCase();
  const labels = {
    "50%_down_payment": "50% downpayment, 50% upon completion",
    full_payment: "Full payment",
    installment_3_months: "Installment (3 months)",
    installment_6_months: "Installment (6 months)",
    custom_arrangement: "Custom arrangement",
  };

  return labels[terms] || (terms ? terms.replace(/[_-]+/g, " ") : "Payment terms not specified");
};

export const formatCustomerPaymentAmountInput = (value) => {
  const sanitized = String(value ?? "").replace(/,/g, "").replace(/[^\d.]/g, "");
  const decimalIndex = sanitized.indexOf(".");
  const hasDecimal = decimalIndex !== -1;
  const integerPart = (hasDecimal ? sanitized.slice(0, decimalIndex) : sanitized).replace(/\./g, "");
  const decimalPart = hasDecimal ? sanitized.slice(decimalIndex + 1).replace(/\./g, "") : "";
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${formattedInteger}${hasDecimal ? `.${decimalPart}` : ""}`;
};

export const validateCustomerPaymentAmount = (value, remainingAmount, minimumAmount = 0) => {
  const input = String(value ?? "").trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(input)) {
    return { valid: false, amount: 0, message: "Enter a valid amount greater than zero, with up to two decimal places." };
  }

  const amount = Number(input.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, amount: 0, message: "Enter a valid amount greater than zero, with up to two decimal places." };
  }
  if (Math.round(amount * 100) > Math.round((Number(remainingAmount) || 0) * 100)) {
    return { valid: false, amount, message: `Payment cannot exceed the remaining balance of ${new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(remainingAmount) || 0)}.` };
  }
  if (Math.round(amount * 100) < Math.round((Number(minimumAmount) || 0) * 100)) {
    return { valid: false, amount, message: `Payment must be at least ${new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(minimumAmount) || 0)} to cover the required downpayment.` };
  }

  return { valid: true, amount, message: "" };
};

const amountInCents = (value) => Math.round((Number(value) || 0) * 100);

const hasMatchingVerifiedPayment = (pendingRecord, records) => {
  const amount = amountInCents(pendingRecord.submitted_amount);
  const proofUrl = String(pendingRecord.proof_file_url || "").trim();
  const transactionNumber = String(pendingRecord.transaction_number || "").trim().toLowerCase();
  const proofNames = [pendingRecord.proof_file_name, ...(pendingRecord.supporting_documents || []).map((document) => document.original_name)]
    .map((name) => String(name || "").trim().toLowerCase())
    .filter(Boolean);
  if (!amount || (!proofUrl && !transactionNumber && proofNames.length === 0)) return false;

  return records.some((record) => (
    record !== pendingRecord &&
    record.status === "verified" &&
    amountInCents(record.verified_amount) === amount &&
    (() => {
      const verifiedProofNames = [record.proof_file_name, ...(record.supporting_documents || []).map((document) => document.original_name)]
        .map((name) => String(name || "").trim().toLowerCase())
        .filter(Boolean);
      return (proofUrl && String(record.proof_file_url || "").trim() === proofUrl) ||
        (transactionNumber && String(record.transaction_number || "").trim().toLowerCase() === transactionNumber) ||
        proofNames.some((name) => verifiedProofNames.includes(name));
    })()
  ));
};

export const getUnresolvedPaymentProofRecords = (order) => {
  const records = Array.isArray(order?.payment_records) ? order.payment_records : [];
  return records.filter((record) => (
    record.status === "pending" && !hasMatchingVerifiedPayment(record, records)
  ));
};

export const getCustomerPaymentProof = (order) => {
  if (!order) {
    return {
      submitted: false,
      amount: 0,
      fileName: "",
      paymentMethod: "Cash",
      transactionNumber: "",
    };
  }

  const paymentRecords = Array.isArray(order.payment_records) ? order.payment_records : [];
  const unresolvedRecordIds = new Set(getUnresolvedPaymentProofRecords(order).map((record) => String(record._id || record.id || "")));
  const latestRecord = paymentRecords
    .filter((record) => record.status !== "pending" || unresolvedRecordIds.has(String(record._id || record.id || "")))
    .sort((first, second) => {
      const firstActivity = first.status === "verified"
        ? first.verified_at || first.recorded_at || first.submitted_at || first.createdAt
        : first.status === "rejected"
          ? first.rejected_at || first.submitted_at || first.createdAt
          : first.submitted_at || first.createdAt;
      const secondActivity = second.status === "verified"
        ? second.verified_at || second.recorded_at || second.submitted_at || second.createdAt
        : second.status === "rejected"
          ? second.rejected_at || second.submitted_at || second.createdAt
          : second.submitted_at || second.createdAt;
      return new Date(secondActivity || 0).getTime() - new Date(firstActivity || 0).getTime();
    })[0];
  const hasLedgerSubmission = latestRecord?.submitted_amount !== undefined && latestRecord?.submitted_amount !== null;
  const proofAmount = Number(hasLedgerSubmission
    ? latestRecord.submitted_amount
    : latestRecord?.verified_amount ?? order.payment_proof_amount ?? order.payment_amount ?? order.amount_paid ?? order.paid_amount ?? order.downpayment_amount ?? 0);
  const hasProofSubmission = Boolean(
    hasLedgerSubmission ||
    (paymentRecords.length === 0 && (
    order.payment_proof_file_name ||
    order.payment_proof_file_url ||
    order.payment_proof ||
    order.proof_of_payment ||
    order.proof_file ||
    proofAmount > 0
    ))
  );

  const normalizedMethod = order.payment_method || order.paymentMethod || (order.acceptance_method === "online" ? "Online" : "Cash");

  return {
    submitted: hasProofSubmission,
    recordId: latestRecord?._id || latestRecord?.id || "",
    amount: Number.isFinite(proofAmount) ? proofAmount : 0,
    submittedAmount: Number(latestRecord?.submitted_amount ?? proofAmount) || 0,
    verifiedAmount: Number(latestRecord?.verified_amount) || 0,
    status: hasLedgerSubmission
      ? latestRecord.status
      : latestRecord ? "none" : order.payment_proof_confirmed_at ? "verified" : hasProofSubmission ? "pending" : "none",
    adminReason: latestRecord?.admin_reason || "",
    verifiedAt: latestRecord?.verified_at || order.payment_proof_confirmed_at || null,
    amountHistory: latestRecord?.amount_history || [],
    downpaymentException: latestRecord?.downpayment_exception || null,
    fileName: latestRecord?.proof_file_name || order.payment_proof_file_name || order.payment_proof_file_url || order.payment_proof || order.proof_of_payment || order.proof_file || "",
    fileUrl: latestRecord?.proof_file_url || order.payment_proof_file_url || order.proof_file_url || order.payment_proof_url || order.proof_url || "",
    paymentMethod: latestRecord?.payment_method || normalizedMethod || "Cash",
    transactionNumber: latestRecord?.transaction_number || order.transaction_number || order.transactionNumber || "",
  };
};

export const isPaymentProofConfirmed = (order) => Boolean(order?.payment_proof_confirmed_at);

export const getPaymentSummary = (order = {}) => {
  const totalAmount = getFinalProjectCost(order);
  const requiredAmount = getRequiredDownpayment(order);
  const paymentTerms = String(order.payment_terms || "").toLowerCase();

  const explicitPaidAmount =
    order.amount_paid ?? order.payment_amount ?? order.paid_amount;
  let paidAmount = Number(explicitPaidAmount);
  const paymentRecords = Array.isArray(order.payment_records) ? order.payment_records : [];
  if (order.payment_ledger_initialized || paymentRecords.length > 0) {
    const recordsPaid = paymentRecords.reduce((sum, record) => (
      record.status === "verified" ? sum + Math.max(0, Number(record.verified_amount) || 0) : sum
    ), 0);
    paidAmount = Math.max(0, Number(order.legacy_verified_amount) || 0) + recordsPaid;
  } else if (explicitPaidAmount === undefined || explicitPaidAmount === null || !Number.isFinite(paidAmount)) {
    if (order.payment_proof_confirmed_at) {
      paidAmount = Number(order.payment_proof_amount) || 0;
    } else if (order.payment_status === "paid" && !order.payment_proof_submitted_at) {
      paidAmount = totalAmount;
    } else if (order.downpayment_received) {
      paidAmount = requiredAmount;
    } else {
      paidAmount = 0;
    }
  }
  paidAmount = Math.min(Math.max(paidAmount, 0), totalAmount);

  let status = { key: "pending", label: "Pending" };
  const paidCents = Math.round(paidAmount * 100);
  const requiredCents = Math.round(requiredAmount * 100);
  const totalCents = Math.round(totalAmount * 100);
  if (totalCents > 0 && paidCents >= totalCents) {
    status = { key: "paid", label: "Fully Paid" };
  } else if (paidAmount > 0) {
    const isFullPaymentPlan = paymentTerms === "full_payment";
    if (isFullPaymentPlan) {
      status = { key: "partial", label: "Partial Payment" };
    } else if (paidCents < requiredCents) {
      status = { key: "partial_downpayment", label: "Partial Downpayment" };
    } else if (paidCents <= requiredCents) {
      status = { key: "downpayment", label: "Downpayment Paid" };
    } else {
      status = { key: "partial", label: "Partial Payment" };
    }
  }

  const downpaymentRemaining = Math.max(requiredAmount - paidAmount, 0);
  return {
    totalAmount,
    requiredAmount,
    requiredPercentage: totalAmount > 0 ? Math.min(100, (requiredAmount / totalAmount) * 100) : 0,
    paidAmount,
    downpaymentRemaining,
    remainingAmount: Math.max(totalAmount - paidAmount, 0),
    status,
  };
};
