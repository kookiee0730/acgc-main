import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Search, Star, StarHalf, X } from "lucide-react";
import { getProducts } from "../../api/products";
import { getProductReviews } from "../../api/orders";
import ProductPriceEstimator, { getDefaultProductEstimatorForm, isBladePricingProduct } from "@/components/ProductPriceEstimator";
import logo from "../../assets/images/ACGCLOGO1.png";
import { resolveBackendImageUrl } from "../../lib/resolveBackendImageUrl";

const getImage = (product) => {
  const candidates = [
    product?.image_url,
    product?.image,
    ...(Array.isArray(product?.images) ? product.images : []),
  ];
  const imageUrl = candidates.find((value) => typeof value === "string" && value.trim() && !value.startsWith("blob:") && !value.startsWith("file:")) || "";
  return resolveBackendImageUrl(imageUrl);
};

const getPrice = (product) => {
  if (isBladePricingProduct(product) && product?.show_price_per_blade !== false) {
    const rates = (product?.blade_glass_types || [])
      .map((glass) => Number(glass.price_per_blade) || 0)
      .filter((rate) => rate > 0);
    const lowestRate = rates.length ? Math.min(...rates) : Number(product?.price_per_blade || product?.unit_price) || 0;
    if (lowestRate > 0) return `PHP ${lowestRate.toLocaleString()}/blade`;
  }
  const pricePerSqft = Number(product?.price_per_sqft || 0);
  const unitPrice = Number(product?.unit_price || 0);
  if (pricePerSqft > 0) return `PHP ${pricePerSqft.toLocaleString()}/sqft`;
  if (unitPrice > 0) return `PHP ${unitPrice.toLocaleString()}`;
  return "Contact us";
};

function RatingStars({ rating }) {
  const value = Number(rating) || 0;
  const fullStars = Math.floor(value);
  const halfStar = value - fullStars >= 0.5;
  return Array.from({ length: 5 }, (_, index) => {
    if (index < fullStars) return <Star key={index} size={15} fill="currentColor" />;
    if (index === fullStars && halfStar) return <StarHalf key={index} size={15} fill="currentColor" />;
    return <Star key={index} size={15} />;
  });
}

function BrowseProducts() {
  const [products, setProducts] = useState([]);
  const [ratings, setRatings] = useState({});
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [estimatorForm, setEstimatorForm] = useState(getDefaultProductEstimatorForm());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const openProduct = (product) => {
    setSelectedProduct(product);
    setEstimatorForm(getDefaultProductEstimatorForm(product));
  };

  const formatCurrency = (value) =>
    `PHP ${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  useEffect(() => {
    let active = true;
    const loadProducts = async () => {
      try {
        const response = await getProducts();
        const activeProducts = (response.products || []).filter((product) => product.is_active !== false);
        const ratingEntries = await Promise.all(activeProducts.map(async (product) => {
          try {
            const response = await getProductReviews(product._id || product.id);
            const reviews = (response.reviews || []).filter((review) => Number(review.rating) > 0);
            const average = reviews.length ? reviews.reduce((sum, review) => sum + Number(review.rating), 0) / reviews.length : 0;
            return [product._id || product.id, { average, count: reviews.length }];
          } catch {
            return [product._id || product.id, { average: 0, count: 0 }];
          }
        }));
        if (active) {
          setProducts(activeProducts);
          setRatings(Object.fromEntries(ratingEntries));
        }
      } catch (loadError) {
        if (active) setError(loadError?.message || "Unable to load products.");
      } finally {
        if (active) setLoading(false);
      }
    };
    loadProducts();
    return () => { active = false; };
  }, []);

  const visibleProducts = products.filter((product) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return `${product.name || ""} ${product.product_name || ""} ${product.category || ""} ${product.description || ""}`.toLowerCase().includes(query);
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3" aria-label="Go to ACGC Services home">
            <img src={logo} alt="ACGC Services" className="h-14 w-14 object-contain" />
            <div className="leading-tight">
              <p className="text-xl font-black text-red-600">ACGC Services</p>
              <p className="text-sm font-bold text-slate-700">Aluminum &amp; Glass Services</p>
            </div>
          </Link>
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-red-600">
            <ArrowLeft size={16} /> Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-14 !pb-[calc(10rem+env(safe-area-inset-bottom))] lg:!pb-14">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-red-600">ACGC Catalog</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Browse Products</h1>
            <p className="mt-4 max-w-2xl text-slate-600">Explore the complete collection of aluminum and glass products created in the system.</p>
          </div>
          <label className="relative w-full md:max-w-xs">
            <Search size={18} className="absolute left-4 top-3.5 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products" className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 outline-none focus:border-red-500" />
          </label>
        </div>

        {loading && <p className="py-20 text-center text-slate-500">Loading products...</p>}
        {!loading && error && <p className="mt-10 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">{error}</p>}
        {!loading && !error && visibleProducts.length === 0 && <p className="mt-10 rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-500">No products match your search.</p>}

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProducts.map((product) => {
            const productId = product._id || product.id;
            const rating = ratings[productId] || { average: 0, count: 0 };
            const image = getImage(product);
            return (
              <article key={productId} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
                <div className="h-64 bg-slate-100">
                  {image ? <img src={image} alt={product.product_name || product.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-slate-400">No image available</div>}
                </div>
                <div className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-red-700">{product.category || "General"}</span>
                    <span className="font-bold text-emerald-600">{getPrice(product)}</span>
                  </div>
                  <div>
                    <h2 className="text-2xl font-black">{product.product_name || product.name || "Unnamed Product"}</h2>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{product.description || "Premium aluminum and glass product crafted for reliability and style."}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-amber-500">
                    <div className="flex items-center gap-1"><RatingStars rating={rating.average} /><span className="ml-1 text-xs font-semibold text-slate-500">{rating.count ? `${rating.average.toFixed(1)} (${rating.count})` : "No reviews"}</span></div>
                    <button type="button" onClick={() => openProduct(product)} className="inline-flex items-center gap-1 rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700">Estimate <ArrowRight size={14} /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>

      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4">
          <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-red-600">Product Estimate</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">{selectedProduct.product_name || selectedProduct.name || "Product"}</h2>
              </div>
              <button type="button" onClick={() => setSelectedProduct(null)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100" aria-label="Close product estimate">
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-6 p-5 lg:grid-cols-[1fr_360px]">
              <div>
                <div className="overflow-hidden rounded-xl bg-slate-100">
                  {getImage(selectedProduct)
                    ? <img src={getImage(selectedProduct)} alt={selectedProduct.product_name || selectedProduct.name || "Product"} className="h-80 w-full object-cover" />
                    : <div className="flex h-80 items-center justify-center text-sm text-slate-400">No image available</div>}
                </div>
                <div className="mt-4">
                  <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">{selectedProduct.category || selectedProduct.product_type || "General"}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{selectedProduct.description || "Premium aluminum and glass product crafted for reliability and style."}</p>
                </div>
              </div>
              <aside className="space-y-4">
                <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Starting from</p>
                  <p className="mt-1 text-2xl font-black text-red-700">{getPrice(selectedProduct)}</p>
                </div>
                <ProductPriceEstimator
                  product={selectedProduct}
                  form={estimatorForm}
                  onFormChange={setEstimatorForm}
                  formatCurrency={formatCurrency}
                />
                <Link to="/login" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700">
                  Login to Order <ArrowRight size={16} />
                </Link>
              </aside>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BrowseProducts;
