import { useState } from "react";
import { Link } from "react-router-dom";
import logo from "../../assets/images/ACGCLOGO1.png";
import { ChevronDown, ChevronUp, CircleAlert, CircleCheck, CircleX, LoaderCircle, Truck } from "lucide-react";
import OrderProgressTimeline from "@/components/OrderProgressTimeline";
import { getPaymentSummary } from "@/pages/Transactions/paymentProofUtils";
import { getPaymentStatusBadgeClassName, getPaymentStatusLabel, statusBadgeBaseClassName } from "@/lib/statusBadgeStyles";
import { getFinalProjectCost } from "@/lib/orderPricing";
import { trackOrder } from "../../api/orders";
import { useCustomerPermissions } from "@/hooks/useCustomerPermissions";

function TrackOrder() {
  const customerPermissions = useCustomerPermissions();
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingResult, setTrackingResult] = useState(null);
  const [trackingError, setTrackingError] = useState("");
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [showAllTrackedItems, setShowAllTrackedItems] = useState(false);
  const trackingPaymentSummary = trackingResult ? getPaymentSummary(trackingResult) : null;

  const handleTrackOrder = async (event) => {
    event.preventDefault();
    if (!customerPermissions.can_track_products) {
      setTrackingError("Order tracking is disabled by the system administrator.");
      setTrackingResult(null);
      return;
    }
    const tracking = trackingNumber.trim();
    if (!tracking) {
      setTrackingError("Please enter your tracking number.");
      setTrackingResult(null);
      return;
    }

    setTrackingLoading(true);
    setTrackingError("");
    setTrackingResult(null);
    setShowAllTrackedItems(false);
    try {
      const response = await trackOrder(tracking);
      setTrackingResult(response.order || response);
    } catch (error) {
      setTrackingError(error.data?.message || error.message || "No order found with that tracking number.");
    } finally {
      setTrackingLoading(false);
    }
  };

  const statusLabel = (status) => String(status || "Unknown").replace(/_/g, " ");

  const getStatusBadgeClass = (status) => {
    const normalized = String(status || "").toLowerCase();
    if (normalized.includes("complete") || normalized === "delivered") return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
    if (normalized.includes("cancel") || normalized.includes("declin") || normalized.includes("reject")) return "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200";
    if (normalized.includes("process") || normalized.includes("install")) return "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200";
    return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
  };

  const getStatusBadgeIcon = (status) => {
    const normalized = String(status || "").toLowerCase();
    if (normalized.includes("complete") || normalized === "delivered") return CircleCheck;
    if (normalized.includes("cancel") || normalized.includes("declin") || normalized.includes("reject")) return CircleX;
    return CircleAlert;
  };

  const formatCurrency = (value) => {
    const amount = Number(value || 0);
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDateText = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("en-PH", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const getOrderCustomerName = (order) => {
    if (!order) return "—";
    if (order.customer_name) return order.customer_name;
    const customer = order.customer || {};
    return `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "—";
  };

  const getOrderShippingAddress = (order) => {
    if (!order) return "—";
    const shippingAddress = order.shipping_address || order.customer?.shipping_address;
    if (typeof shippingAddress === "string" && shippingAddress.trim()) return shippingAddress.trim();

    const shipping = shippingAddress && typeof shippingAddress === "object" ? shippingAddress : {};
    const addressParts = [
      shipping.street_address || shipping.street || shipping.address_line || shipping.line1,
      shipping.city,
      shipping.province || shipping.state,
      shipping.zip_code || shipping.postal_code,
    ].filter(Boolean);

    if (addressParts.length > 0) return addressParts.join(", ");
    const customer = order.customer || {};
    const customerAddress = [customer.street_address, customer.city, customer.province, customer.zip_code]
      .filter(Boolean)
      .join(", ");
    return customerAddress || "—";
  };

  const getTrackedItemAmount = (item) => {
    const savedLineTotal = Number(item?.line_total);
    if (savedLineTotal > 0) return savedLineTotal;

    const legacyTotal = Number(item?.total_amount || item?.amount);
    if (legacyTotal > 0) return legacyTotal;

    if (item?.is_estimate) {
      const estimatedTotal = Number(item.estimated_price || item.manual_estimated_total || 0);
      if (estimatedTotal > 0) return estimatedTotal;
    }

    const quantity = Math.max(1, Number(item?.quantity || item?.qty) || 1);
    const area = Number(item?.area || item?.dimensions?.area || 0);
    const pricePerSqft = Number(
      item?.price_per_sqft || item?.product_id?.price_per_sqft || item?.product?.price_per_sqft || 0
    );
    if (area > 0 && pricePerSqft > 0) return area * pricePerSqft;

    const unitPrice = Number(
      item?.unit_price || item?.product_id?.unit_price || item?.product?.unit_price || 0
    );
    return unitPrice * quantity;
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground flex flex-col">

      {/* NAVBAR */}

      <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/95 backdrop-blur-2xl">

        <div className="flex w-full items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-5">

          <Link to="/" className="flex min-w-0 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-4" aria-label="Go to ACGC Services home">

            <img
              src={logo}
              alt="logo"
              className="h-10 w-10 shrink-0 object-contain sm:h-20 sm:w-20"
            />

            <div className="min-w-0">

              <h1 className="truncate text-base font-medium text-brand dark:text-brand-dark-text sm:text-2xl">
                ACGC Services
              </h1>

              <p className="hidden truncate text-sm font-medium text-muted-foreground sm:block sm:text-xl">
                Aluminum & Glass Services
              </p>

            </div>

          </Link>

          <nav className="hidden lg:flex items-center gap-10">

            <Link
              to="/"
              className="relative font-medium text-foreground transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              Browse Products
            </Link>

            <Link
              to="/"
              className="relative font-medium text-foreground transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              About Us
            </Link>
            
            <Link
              to="/track-order"
              className="relative font-medium text-brand dark:text-brand-dark-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Track Order
            </Link>

          </nav>

          <div className="hidden lg:flex items-center gap-4">

            <Link
              to="/login"
              className="rounded-xl border border-border bg-background px-5 py-2 font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              Login
            </Link>

            <Link
              to="/signup"
              className="rounded-xl bg-brand px-6 py-2 font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
            >
              Sign Up
            </Link>

          </div>

        </div>

      </header>

      {/* TRACK FORM */}

      <main className="flex-grow px-4 pb-12 pt-24 !pb-[calc(10rem+env(safe-area-inset-bottom))] sm:px-6 sm:!pb-[calc(10rem+env(safe-area-inset-bottom))] sm:pt-36 lg:!pb-16">

        <div className="mx-auto max-w-7xl">

          <div className="rounded-[20px] border border-border bg-card p-6 text-card-foreground max-[560px]:p-4">
            <div className="border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300">
                  <Truck size={20} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-[18px] font-medium leading-tight text-foreground">Track an Order</h2>
                  <p className="mt-1 text-[13px] text-muted-foreground">Enter your Order ID to see current order status.</p>
                </div>
              </div>

              <form className="mt-3.5 flex w-full items-center gap-2" onSubmit={handleTrackOrder}>
                <label className="min-w-0 flex-1">
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(event) => setTrackingNumber(event.target.value)}
                    placeholder="Enter Order ID"
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                  />
                </label>
                <button
                  type="submit"
                  disabled={trackingLoading || !customerPermissions.can_track_products}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
                >
                  {trackingLoading && <LoaderCircle size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
                  {trackingLoading ? "Searching..." : customerPermissions.can_track_products ? "Track" : "Tracking Disabled"}
                </button>
              </form>
              {!customerPermissions.can_track_products && (
                <p className="mt-2 text-sm text-muted-foreground" role="status">Order tracking is currently unavailable.</p>
              )}
            </div>

            {trackingError && (
              <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                {trackingError}
              </div>
            )}

            {trackingResult && (
            <>
              <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium tracking-[0.1em] text-brand uppercase dark:text-brand-dark-text">Order status</p>
                  <h3 className="mt-1 text-[21px] font-medium leading-tight text-foreground">Tracking Details</h3>
                </div>
                {(() => {
                  const StatusIcon = getStatusBadgeIcon(trackingResult.status);
                  return (
                    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium capitalize ${getStatusBadgeClass(trackingResult.status)}`}>
                      <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-full bg-current" />
                      <StatusIcon size={15} aria-hidden="true" />
                      {statusLabel(trackingResult.status)}
                    </span>
                  );
                })()}
              </div>

              <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
                <section className="rounded-2xl border border-border bg-card p-[18px]">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand dark:bg-brand-dark-fill/20 dark:text-brand-dark-text">
                      <Truck size={19} aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-[11px] font-medium tracking-[0.1em] text-brand uppercase dark:text-brand-dark-text">Progress</p>
                      <h4 className="text-[19px] font-medium leading-tight text-foreground">Order Timeline</h4>
                    </div>
                  </div>
                  <OrderProgressTimeline order={trackingResult} />
                  <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl border border-border bg-muted/30 px-3 py-3.5 sm:gap-4 sm:py-4 xl:grid-cols-4">
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">GRAND TOTAL</p>
                      <p className="mt-1 text-[18px] font-medium text-brand dark:text-brand-dark-text">{formatCurrency(trackingPaymentSummary.totalAmount)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">AMOUNT PAID</p>
                      <p className="mt-1 text-[18px] font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(trackingPaymentSummary.paidAmount)}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">Required downpayment: {formatCurrency(trackingPaymentSummary.requiredAmount)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">BALANCE</p>
                      <p className="mt-1 text-[18px] font-medium text-foreground">{formatCurrency(trackingPaymentSummary.remainingAmount)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">PAYMENT STATUS</p>
                      <span className={`mt-1 ${statusBadgeBaseClassName} min-h-8 w-full px-3 text-center text-xs ${getPaymentStatusBadgeClassName(trackingPaymentSummary.status.key, true)}`}>
                        {getPaymentStatusLabel(trackingPaymentSummary.status)}
                      </span>
                    </div>
                  </div>
                </section>

                <aside className="rounded-2xl border border-border bg-muted/50 p-[18px] lg:sticky lg:top-4 dark:bg-card">
                  <h4 className="text-[17px] font-medium text-foreground">Order Summary</h4>
                  <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3.5">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Tracking ID</p>
                      <p className="break-all font-mono text-[13px] font-medium text-foreground">{trackingResult.tracking || trackingResult._id || "—"}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Customer</p>
                      <p className="break-words text-sm font-medium text-foreground">{getOrderCustomerName(trackingResult)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="break-words text-sm font-medium text-foreground">{trackingResult.customer_phone || trackingResult.customer?.phone || "—"}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Order Date</p>
                      <p className="break-words text-sm font-medium text-foreground">{formatDateText(trackingResult.createdAt || trackingResult.created_at)}</p>
                    </div>
                    <div className="col-span-2 min-w-0">
                      <p className="text-xs text-muted-foreground">Address</p>
                      <p className="break-words text-sm font-medium text-foreground">{getOrderShippingAddress(trackingResult)}</p>
                    </div>
                  </div>

                  <p className="mt-4.5 text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase">Products ({trackingResult.items?.length || 0})</p>
                  <div>
                    {trackingResult.items?.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setShowAllTrackedItems((visible) => !visible)}
                        aria-expanded={showAllTrackedItems}
                        className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-brand transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none dark:text-brand-dark-text"
                      >
                        {showAllTrackedItems ? "Show less" : `Show all ${trackingResult.items.length}`}
                        {showAllTrackedItems ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
                      </button>
                    )}
                    {(trackingResult.items || []).slice(0, showAllTrackedItems ? undefined : 3).map((item, index) => {
                      const itemName = item?.name || item?.product_name || `Product ${index + 1}`;
                      const itemQty = Number(item?.quantity || item?.qty || 1);
                      const itemTotal = getTrackedItemAmount(item);

                      return (
                        <div key={`${item?.product_id || itemName}-${index}`} className="flex items-center justify-between gap-2.5 border-t border-border py-2.5 first:mt-2.5">
                          <div className="min-w-0">
                            <p className="break-words text-sm font-medium text-foreground">{itemName}</p>
                            <p className="text-xs text-muted-foreground">Qty: {itemQty}</p>
                          </div>
                          <span className="shrink-0 text-sm font-medium text-foreground">{formatCurrency(itemTotal)}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex items-end justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Items</p>
                      <p className="text-[15px] font-medium text-foreground">{Array.isArray(trackingResult.items) ? trackingResult.items.length : 0}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="text-[22px] font-medium leading-tight text-brand dark:text-brand-dark-text">{formatCurrency(getFinalProjectCost(trackingResult))}</p>
                    </div>
                  </div>
                </aside>
              </div>
            </>
            )}

          </div>

        </div>

      </main>

      {/* FOOTER */}

<footer className="mt-10 border-t border-border bg-muted/50 py-8 text-foreground dark:bg-card">

  <div className="max-w-7xl mx-auto px-6 py-14">

    <div className="grid lg:grid-cols-3 gap-14">

      <div>

        <div className="flex items-center gap-4">

          <img
            src={logo}
            alt="logo"
            className="w-20 h-14 object-contain"
          />

          <div>

            <h3 className="text-xl font-medium text-foreground">

              ACGC Aluminum Services

            </h3>

            <p className="text-sm text-muted-foreground">

              Premium Glass & Aluminum Solutions

            </p>

          </div>

        </div>

      </div>

      <div>

        <h4 className="mb-6 font-medium text-foreground">

          Quick Links

        </h4>

        <div className="space-y-4 text-muted-foreground">

          <p>Home</p>
          <p>Browse Products</p>
          <p>Track Order</p>
          <p>About Us</p>

        </div>

      </div>

      <div>

        <h4 className="mb-6 font-medium text-foreground">

          Contact

        </h4>

        <div className="space-y-4 text-muted-foreground">

          <p>Email: acgc.services00@email.com</p>

          <p>Phone: +63 900 000 0000</p>

          <p>Philippines</p>

        </div>

      </div>

    </div>

    <div className="mt-12 border-t border-border pt-8 text-center text-sm text-muted-foreground">

      © 2026 ACGC Aluminum Services — All Rights Reserved.

    </div>

  </div>

</footer>

</div>
  );
}
export default TrackOrder;
