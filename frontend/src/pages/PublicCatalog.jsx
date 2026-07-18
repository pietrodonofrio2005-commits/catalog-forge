import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Layers, FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const buildPublicImageUrl = (path, token) => path ? `${API}/files/${path}?share=${encodeURIComponent(token)}` : null;

export default function PublicCatalog() {
  const { token } = useParams();
  const [catalog, setCatalog] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    axios.get(`${API}/public/catalogs/${token}`)
      .then((r) => {
        setCatalog(r.data.catalog);
        setProducts(r.data.products);
      })
      .catch((err) => {
        setError(err.response?.status === 404 ? "Catalogo non disponibile o rimosso." : "Errore di caricamento.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-[#0047AB]" size={32} />
      </div>
    );
  }

  if (error || !catalog) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center gap-3">
        <div className="text-red-600 font-medium" data-testid="public-error">{error || "Errore"}</div>
        <a href="/" className="text-sm text-[#0047AB] hover:underline">← Torna alla home</a>
      </div>
    );
  }

  const s = catalog.settings || {};
  const fontFamily = s.font || "'Cabinet Grotesk', sans-serif";
  const background = s.background || "#FFFFFF";
  const textColor = s.textColor || "#0A0A0A";
  const accentColor = s.accentColor || "#0047AB";
  const columns = s.columns || 3;
  const showPrice = s.showPrice !== false;
  const showDiscount = s.showDiscount !== false;
  const showColors = s.showColors !== false;
  const showSizes = s.showSizes !== false;
  const showSku = !!s.showSku;
  const showQuantity = !!s.showQuantity;
  const showCover = s.showCover !== false;
  const priceLabel = s.priceLabel || "none";
  const vatRate = s.vatRate ?? 22;
  const customPagesMap = new Map((s.customPages || []).map((p) => [p.id, p]));
  const pageOrder = s.pageOrder && s.pageOrder.length ? s.pageOrder : ["cover", "index", "about", "products", "contact"];

  // Group by category if enabled
  const groups = (() => {
    if (!s.groupByCategory) return { "": products };
    const g = {};
    for (const p of products) {
      const cat = p.category || "Senza categoria";
      const sub = p.subcategory || "";
      const key = sub ? `${cat} — ${sub}` : cat;
      g[key] = g[key] || [];
      g[key].push(p);
    }
    return g;
  })();

  // Build ordered section list
  const sections = [];
  for (const key of pageOrder) {
    if (key === "cover" && showCover) sections.push({ type: "cover" });
    else if (key === "index" && s.showIndex) sections.push({ type: "index" });
    else if (key === "about" && s.aboutEnabled) sections.push({ type: "about" });
    else if (key === "products") {
      for (const [group, items] of Object.entries(groups)) {
        sections.push({ type: "products", group, items });
      }
    }
    else if (key === "contact" && s.contactEnabled) sections.push({ type: "contact" });
    else if (key.startsWith("custom-")) {
      const id = key.slice("custom-".length);
      const cp = customPagesMap.get(id);
      if (cp) sections.push({ type: "custom", customPage: cp });
    }
  }

  // Build TOC entries
  const tocEntries = [];
  sections.forEach((sec) => {
    if (sec.type === "about") tocEntries.push(s.aboutTitle || "Chi Siamo");
    else if (sec.type === "contact") tocEntries.push(s.contactTitle || "Contatti");
    else if (sec.type === "products") tocEntries.push(sec.group || "Prodotti");
    else if (sec.type === "custom") tocEntries.push(sec.customPage.title || "Pagina");
  });

  return (
    <div className="min-h-screen" style={{ background, color: textColor, fontFamily }} data-testid="public-catalog">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 backdrop-blur-xl border-b" style={{ background: `${background}CC`, borderColor: accentColor + "20" }}>
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {s.logoPath ? (
              <img src={buildPublicImageUrl(s.logoPath, token)} alt="logo" className="h-8 w-auto object-contain" />
            ) : (
              <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: accentColor, color: "white" }}>
                <Layers size={16} />
              </div>
            )}
            <div>
              <div className="font-semibold text-sm">{s.companyName || catalog.name}</div>
              <div className="text-[10px] opacity-60 uppercase tracking-widest">{catalog.name}</div>
            </div>
          </div>
          <Button
            data-testid="public-print"
            variant="outline"
            size="sm"
            onClick={() => window.print()}
          >
            <FileDown size={14} className="mr-1" /> Stampa / PDF
          </Button>
        </div>
      </header>

      {/* Cover */}
      {sections.map((sec, idx) => {
        if (sec.type === "cover") {
          return (
            <section key={idx} className="max-w-6xl mx-auto px-6 py-16 md:py-24 relative overflow-hidden">
              {s.coverStyle === "image" && s.coverImagePath && (
                <img
                  src={buildPublicImageUrl(s.coverImagePath, token)}
                  alt="cover"
                  className="absolute inset-0 w-full h-full object-cover -z-10"
                />
              )}
              {s.coverStyle === "hybrid" && s.coverImagePath && (
                <div className="mb-8 -mx-6 h-64 md:h-96 overflow-hidden">
                  <img src={buildPublicImageUrl(s.coverImagePath, token)} alt="cover" className="w-full h-full object-cover" />
                </div>
              )}
              <div className={s.coverStyle === "image" && s.coverImagePath ? "relative text-white bg-black/40 p-8 rounded-lg" : ""}>
                <div className="w-24 h-1 mb-6" style={{ background: accentColor }} />
                <div className="text-xs uppercase tracking-widest opacity-70">{s.companyName || ""}</div>
                <h1 className="font-display text-4xl md:text-6xl mt-3 leading-tight tracking-tighter">
                  {s.coverTitle || catalog.name}
                </h1>
                {s.coverSubtitle && <div className="mt-3 text-lg opacity-80">{s.coverSubtitle}</div>}
              </div>
            </section>
          );
        }
        if (sec.type === "index") {
          return (
            <section key={idx} className="max-w-6xl mx-auto px-6 py-12">
              <div className="w-24 h-1 mb-4" style={{ background: accentColor }} />
              <h2 className="font-display text-3xl md:text-4xl mb-6">{s.indexTitle || "Indice"}</h2>
              <ol className="space-y-2">
                {tocEntries.map((title, i) => (
                  <li key={i} className="flex items-baseline gap-3 max-w-md">
                    <span className="text-sm font-medium">{String(i + 1).padStart(2, "0")}</span>
                    <a href={`#sec-${i}`} className="text-base hover:underline">{title}</a>
                    <span className="flex-1 border-b border-dashed" style={{ borderColor: textColor + "30", marginBottom: "4px" }} />
                  </li>
                ))}
              </ol>
            </section>
          );
        }
        if (sec.type === "about") {
          return (
            <section key={idx} id={`sec-${tocEntries.indexOf(s.aboutTitle || "Chi Siamo")}`} className="max-w-6xl mx-auto px-6 py-12">
              <div className="w-24 h-1 mb-4" style={{ background: accentColor }} />
              <h2 className="font-display text-3xl md:text-4xl mb-4">{s.aboutTitle || "Chi Siamo"}</h2>
              {s.aboutDescription && <p className="text-base opacity-80 whitespace-pre-wrap max-w-3xl leading-relaxed">{s.aboutDescription}</p>}
              {(s.aboutImages || []).length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-8">
                  {(s.aboutImages || []).map((path, i) => (
                    <img key={i} src={buildPublicImageUrl(path, token)} alt={`about-${i}`} className="w-full aspect-[4/3] object-cover rounded-lg" />
                  ))}
                </div>
              )}
            </section>
          );
        }
        if (sec.type === "contact") {
          return (
            <section key={idx} id={`sec-${tocEntries.indexOf(s.contactTitle || "Contatti")}`} className="max-w-6xl mx-auto px-6 py-12">
              <div className="w-24 h-1 mb-4" style={{ background: accentColor }} />
              <h2 className="font-display text-3xl md:text-4xl mb-4">{s.contactTitle || "Contatti"}</h2>
              {s.contactDescription && <p className="text-base opacity-80 whitespace-pre-wrap max-w-3xl leading-relaxed mb-6">{s.contactDescription}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl">
                {s.contactEmail && <div><div className="text-xs uppercase tracking-widest opacity-60 mb-1">Email</div><div className="font-medium">{s.contactEmail}</div></div>}
                {s.contactPhone && <div><div className="text-xs uppercase tracking-widest opacity-60 mb-1">Telefono</div><div className="font-medium">{s.contactPhone}</div></div>}
                {s.contactAddress && <div className="sm:col-span-2"><div className="text-xs uppercase tracking-widest opacity-60 mb-1">Indirizzo</div><div className="font-medium whitespace-pre-wrap">{s.contactAddress}</div></div>}
              </div>
              {(s.contactImages || []).length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-8">
                  {(s.contactImages || []).map((path, i) => (
                    <img key={i} src={buildPublicImageUrl(path, token)} alt={`contact-${i}`} className="w-full aspect-[4/3] object-cover rounded-lg" />
                  ))}
                </div>
              )}
            </section>
          );
        }
        if (sec.type === "products") {
          const secIndex = tocEntries.indexOf(sec.group || "Prodotti");
          return (
            <section key={idx} id={`sec-${secIndex}`} className="max-w-6xl mx-auto px-6 pb-12">
              {sec.group && (
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-0.5" style={{ background: accentColor }} />
                  <h2 className="font-display text-xl uppercase tracking-widest">{sec.group}</h2>
                </div>
              )}
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(180, 900 / columns)}px, 1fr))` }}
              >
                {sec.items.map((p) => (
                  <PublicProductCard
                    key={p.id}
                    product={p}
                    token={token}
                    accentColor={accentColor}
                    showPrice={showPrice}
                    showDiscount={showDiscount}
                    showColors={showColors}
                    showSizes={showSizes}
                    showSku={showSku}
                    showQuantity={showQuantity}
                    priceLabel={priceLabel}
                    vatRate={vatRate}
                  />
                ))}
              </div>
            </section>
          );
        }
        if (sec.type === "custom") {
          const cp = sec.customPage;
          const secIndex = tocEntries.indexOf(cp.title || "Pagina");
          return (
            <section key={idx} id={`sec-${secIndex}`} className="max-w-6xl mx-auto px-6 py-12">
              <div className="w-24 h-1 mb-4" style={{ background: accentColor }} />
              <h2 className="font-display text-3xl md:text-4xl mb-4">{cp.title || "Pagina"}</h2>
              {cp.description && <p className="text-base opacity-80 whitespace-pre-wrap max-w-3xl leading-relaxed">{cp.description}</p>}
              {(cp.images || []).length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-8">
                  {(cp.images || []).map((path, i) => (
                    <img key={i} src={buildPublicImageUrl(path, token)} alt={`custom-${i}`} className="w-full aspect-[4/3] object-cover rounded-lg" />
                  ))}
                </div>
              )}
            </section>
          );
        }
        return null;
      })}

      {products.length === 0 && !s.aboutEnabled && !s.contactEnabled && (
        <div className="text-center py-16 opacity-60">Nessun contenuto in questo catalogo.</div>
      )}

      {/* Footer */}
      <footer className="border-t py-6 text-center text-xs opacity-60" style={{ borderColor: accentColor + "20" }}>
        <div>{s.companyName || catalog.name} · Catalogo generato con Catalog Forge</div>
      </footer>
    </div>
  );
}

function PublicProductCard({ product, token, accentColor, showPrice, showDiscount, showColors, showSizes, showSku, showQuantity, priceLabel, vatRate }) {
  const finalPrice = showDiscount && product.discount > 0
    ? product.price * (1 - product.discount / 100)
    : product.price;

  return (
    <article
      data-testid={`public-product-${product.id}`}
      className="group flex flex-col bg-white border rounded-lg overflow-hidden hover:-translate-y-0.5 transition-transform"
      style={{ borderColor: accentColor + "20" }}
    >
      <div className="aspect-square bg-zinc-100 overflow-hidden">
        {product.image_path ? (
          <img
            src={buildPublicImageUrl(product.image_path, token)}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-300">
            <Layers size={32} />
          </div>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-semibold text-sm leading-tight">{product.name}</h3>
        {product.description && <p className="text-xs opacity-70 mt-1 line-clamp-2">{product.description}</p>}
        {showPrice && (
          <div className="mt-3 flex items-baseline gap-2 flex-wrap">
            <span className="font-bold text-base" style={{ color: accentColor }}>€{Number(finalPrice).toFixed(2)}</span>
            {showDiscount && product.discount > 0 && (
              <>
                <span className="text-xs line-through opacity-50">€{Number(product.price).toFixed(2)}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#DC2626", color: "white" }}>-{product.discount}%</span>
              </>
            )}
            {(() => {
              const label = product.price_label || priceLabel;
              if (label === "included") return <span className="text-[10px] italic opacity-70">iva inclusa</span>;
              if (label === "plus") {
                const rate = product.price_label === "plus" && product.vat_rate != null
                  ? product.vat_rate
                  : (priceLabel === "plus" ? vatRate : null);
                return <span className="text-[10px] italic opacity-70">+ iva{rate != null ? ` (${rate}%)` : ""}</span>;
              }
              return null;
            })()}
          </div>
        )}
        {showColors && product.colors?.length > 0 && (
          <div className="text-[10px] opacity-70 mt-2">Colori: {product.colors.join(", ")}</div>
        )}
        {showSizes && product.sizes?.length > 0 && (
          <div className="text-[10px] opacity-70">Taglie: {product.sizes.join(", ")}</div>
        )}
        {showSku && product.sku && (
          <div className="text-[10px] opacity-70 font-mono">Cod: {product.sku}</div>
        )}
        {showQuantity && product.quantity != null && (
          <div className="text-[10px] opacity-70">Q.tà: {product.quantity}</div>
        )}
      </div>
    </article>
  );
}
