import { describe, it, expect } from "vitest";
import { formatCustomerPaymentAmountInput, getCustomerPaymentProof, getPaymentSummary, getSavedPaymentTermsLabel, getUnresolvedPaymentProofRecords, isPaymentProofConfirmed, validateCustomerPaymentAmount } from "@/pages/Transactions/paymentProofUtils";

describe("getSavedPaymentTermsLabel", () => {
  it.each([
    ["50%_down_payment", "50% downpayment, 50% upon completion"],
    ["full_payment", "Full payment"],
    ["installment_3_months", "Installment (3 months)"],
    ["installment_6_months", "Installment (6 months)"],
    ["custom_arrangement", "Custom arrangement"],
  ])("labels the saved Site Inspection term %s", (terms, label) => {
    expect(getSavedPaymentTermsLabel(terms)).toBe(label);
  });
});

describe("formatCustomerPaymentAmountInput", () => {
  it("adds thousands separators as the amount is entered", () => {
    expect(formatCustomerPaymentAmountInput("1000000")).toBe("1,000,000");
    expect(formatCustomerPaymentAmountInput("1234567.89")).toBe("1,234,567.89");
  });

  it("preserves a partially entered decimal amount", () => {
    expect(formatCustomerPaymentAmountInput("1000.")).toBe("1,000.");
  });
});

describe("getCustomerPaymentProof", () => {
  it("detects submitted proof and prefers customer proof fields", () => {
    const order = {
      payment_status: "paid",
      payment_proof_amount: 1250,
      payment_proof_file_name: "proof.png",
      payment_method: "Online",
      transaction_number: "TXN-123",
      payment_amount: 1000,
    };

    expect(getCustomerPaymentProof(order)).toMatchObject({
      submitted: true,
      amount: 1250,
      fileName: "proof.png",
      fileUrl: "",
      paymentMethod: "Online",
      transactionNumber: "TXN-123",
    });
  });

  it("returns no-submission state when no proof exists", () => {
    const order = {
      payment_status: "not_paid",
      payment_amount: 0,
      downpayment_amount: 0,
    };

    expect(getCustomerPaymentProof(order)).toMatchObject({
      submitted: false,
      amount: 0,
      fileName: "",
      fileUrl: "",
      paymentMethod: "Cash",
      transactionNumber: "",
    });
  });

  it("does not treat an admin-recorded payment as customer proof", () => {
    expect(getCustomerPaymentProof({
      payment_status: "paid",
      amount_paid: 1250,
      payment_proof_amount: 0,
    }).submitted).toBe(false);
  });

  it("clears an older pending proof when the same proof and amount are verified", () => {
    const proofUrl = "https://res.cloudinary.com/acgc/payment-proofs/receipt.png";
    const order = {
      payment_records: [
        {
          _id: "pending-proof",
          status: "pending",
          submitted_amount: 5000,
          proof_file_url: proofUrl,
          submitted_at: "2026-10-13T10:00:00.000Z",
        },
        {
          _id: "verified-payment",
          record_source: "admin_recorded",
          status: "verified",
          submitted_amount: null,
          verified_amount: 5000,
          proof_file_url: proofUrl,
          submitted_at: "2026-10-01T00:00:00.000Z",
          recorded_at: "2026-10-14T10:00:00.000Z",
          verified_at: "2026-10-14T10:00:00.000Z",
        },
      ],
    };

    expect(getUnresolvedPaymentProofRecords(order)).toEqual([]);
    expect(getCustomerPaymentProof(order)).toMatchObject({
      status: "none",
      recordId: "verified-payment",
      submitted: false,
    });
  });

  it("matches a customer proof to an admin-recorded payment with the same attached filename", () => {
    const order = {
      payment_records: [
        {
          _id: "pending-proof",
          status: "pending",
          submitted_amount: 5000,
          proof_file_name: "receipt-october.pdf",
        },
        {
          _id: "verified-payment",
          record_source: "admin_recorded",
          status: "verified",
          verified_amount: 5000,
          supporting_documents: [{ original_name: "receipt-october.pdf" }],
        },
      ],
    };

    expect(getUnresolvedPaymentProofRecords(order)).toEqual([]);
  });

  it("keeps an equal-amount pending proof unresolved when its reference differs", () => {
    const order = {
      payment_records: [
        { _id: "pending-proof", status: "pending", submitted_amount: 5000, transaction_number: "TX-1" },
        { _id: "verified-payment", record_source: "admin_recorded", status: "verified", verified_amount: 5000, transaction_number: "TX-2" },
      ],
    };

    expect(getUnresolvedPaymentProofRecords(order)).toEqual([order.payment_records[0]]);
  });
});

describe("isPaymentProofConfirmed", () => {
  it("returns true after an admin confirmation timestamp is saved", () => {
    expect(isPaymentProofConfirmed({ payment_proof_confirmed_at: "2026-09-29T12:00:00.000Z" })).toBe(true);
  });

  it("returns false while proof is unconfirmed", () => {
    expect(isPaymentProofConfirmed({ payment_proof_submitted_at: "2026-09-29T12:00:00.000Z" })).toBe(false);
  });
});

describe("validateCustomerPaymentAmount", () => {
  it.each(["20000", "50000", "60000", "100000"])("accepts a valid amount within the outstanding balance: %s", (amount) => {
    expect(validateCustomerPaymentAmount(amount, 100000).valid).toBe(true);
  });

  it("accepts a correctly grouped thousands amount and returns its numeric value", () => {
    expect(validateCustomerPaymentAmount("16,000", 16000)).toMatchObject({ valid: true, amount: 16000 });
  });

  it("rejects amounts below the remaining required downpayment", () => {
    expect(validateCustomerPaymentAmount("4,999.99", 10000, 5000)).toMatchObject({
      valid: false,
      amount: 4999.99,
      message: expect.stringContaining("₱5,000.00"),
    });
  });

  it("accepts amounts equal to or above the remaining required downpayment", () => {
    expect(validateCustomerPaymentAmount("5,000", 10000, 5000).valid).toBe(true);
    expect(validateCustomerPaymentAmount("6,000", 10000, 5000).valid).toBe(true);
  });

  it.each(["0", "-1", "abc", "1,00", "₱1000", "1.234", "100000.01"])("rejects invalid or over-balance input: %s", (amount) => {
    expect(validateCustomerPaymentAmount(amount, 100000).valid).toBe(false);
  });
});

describe("getPaymentSummary", () => {
  const order = {
    total_amount: 20000,
    required_downpayment_amount: 10000,
  };

  it("shows pending until any payment is confirmed", () => {
    expect(getPaymentSummary(order).status.label).toBe("Pending");
  });

  it("uses legacy verified totals when the payment-record list is empty", () => {
    const summary = getPaymentSummary({
      ...order,
      payment_records: [],
      amount_paid: 5000,
    });

    expect(summary.paidAmount).toBe(5000);
    expect(summary.status.label).toBe("Partial Downpayment");
  });

  it("does not count an unconfirmed payment proof as paid", () => {
    const summary = getPaymentSummary({
      ...order,
      payment_status: "paid",
      payment_proof_amount: 5000,
      payment_proof_submitted_at: "2026-10-03T12:00:00.000Z",
    });

    expect(summary.paidAmount).toBe(0);
    expect(summary.status.label).toBe("Pending");
  });

  it("shows partial downpayment below the required amount", () => {
    expect(getPaymentSummary({ ...order, amount_paid: 5000 }).status.label).toBe("Partial Downpayment");
  });

  it("shows downpayment once the required amount is met", () => {
    expect(getPaymentSummary({ ...order, amount_paid: 10000 }).status.label).toBe("Downpayment Paid");
  });

  it("shows partial after additional payment beyond the downpayment", () => {
    expect(getPaymentSummary({ ...order, amount_paid: 15000 }).status.label).toBe("Partial Payment");
  });

  it("deducts the actual confirmed amount above the required downpayment", () => {
    const summary = getPaymentSummary({
      total_amount: 50000,
      required_downpayment_amount: 10000,
      amount_paid: 12000,
    });

    expect(summary.paidAmount).toBe(12000);
    expect(summary.remainingAmount).toBe(38000);
  });

  it("shows fully paid when the project total is reached", () => {
    expect(getPaymentSummary({ ...order, amount_paid: 20000 }).status.label).toBe("Fully Paid");
  });

  it("uses total_amount when an online order has a zero contract_amount", () => {
    const summary = getPaymentSummary({
      ...order,
      contract_amount: 0,
      amount_paid: 10000,
    });

    expect(summary.totalAmount).toBe(20000);
    expect(summary.status.label).toBe("Downpayment Paid");
  });

  it("uses the default downpayment when legacy fields contain zero", () => {
    const summary = getPaymentSummary({
      total_amount: 40240,
      contract_amount: 40240,
      required_downpayment_amount: 0,
      downpayment_amount: 0,
    });

    expect(summary.requiredAmount).toBe(20120);
  });

  it("recalculates a percentage downpayment from the current final project cost", () => {
    const summary = getPaymentSummary({
      total_amount: 120000,
      contract_amount: 120000,
      payment_terms: "50%_down_payment",
      required_downpayment_amount: 50000,
      downpayment_amount: 50000,
    });

    expect(summary.totalAmount).toBe(120000);
    expect(summary.requiredAmount).toBe(60000);
    expect(summary.remainingAmount).toBe(120000);
  });
});
