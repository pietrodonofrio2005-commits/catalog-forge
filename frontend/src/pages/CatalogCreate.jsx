import React, { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import api, { formatApiErrorDetail, API } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileDown, Save, Image as ImageIcon, FileText, FileCode, GripVertical, X as XIcon, Plus, Crop as CropIcon, Trash2, Pencil } from "lucide-react";
import ImageCropDialog from "@/components/ImageCropDialog";

const buildImageUrl = (path) => path ? `${API}/files/${path}` : null;

const LAYOUTS = [
  { value: "grid", label: "Griglia standard" },
  { value: "compact", label: "Compatto" },
  { value: "detailed", label: "Dettagliato" },
  { value: "minimal", label: "Minimal" },
];

const FONT_OPTIONS = [
  { value: "'Cabinet Grotesk', sans-serif", label: "Cabinet Grotesk" },
  { value: "'IBM Plex Sans', sans-serif", label: "IBM Plex Sans" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "'Courier New', monospace", label: "Courier" },
];

export default function CatalogCreate() {
  const { catalogId } = useParams();
  const navigate = useNavigate();
  const isEditMode = Boolean(catalogId);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const previewRef = useRef(null);

  // Interactive editor state
  const [order, setOrder] = useState([]);              // ordered product ids
  const [excludedIds, setExcludedIds] = useState([]);  // ids excluded from catalog
  const [productSearch, setProductSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("__all__");
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const [settings, setSettings] = useState({
    name: "Il mio catalogo",
    groupByCategory: true,
    columns: 3,
    rows: 4,
    layout: "grid",
    background: "#FFFFFF",
    textColor: "#0A0A0A",
    accentColor: "#0047AB",
    font: "'Cabinet Grotesk', sans-serif",
    showCover: true,
    coverTitle: "Catalogo Prodotti",
    coverSubtitle: "Collezione 2026",
    showPrice: true,
    showDiscount: true,
    showColors: true,
    showSizes: true,
    showHeader: true,
    showFooter: true,
    companyName: "La tua azienda",
    coverImagePath: null,
    logoPath: null,
    coverStyle: "text", // "text" | "image" | "hybrid"
    // Product card
    showSku: false,
    showQuantity: false,
    // Sections
    pageOrder: ["cover", "index", "about", "products", "contact"],
    showIndex: false,
    indexTitle: "Indice",
    aboutEnabled: false,
    aboutTitle: "Chi Siamo",
    aboutDescription: "",
    aboutImages: [],
    contactEnabled: false,
    contactTitle: "Contatti",
    contactDescription: "",
    contactEmail: "",
    contactPhone: "",
    contactAddress: "",
    contactImages: [],
    // VAT / price label
    priceLabel: "none",   // "none" | "included" | "plus"
    vatRate: 22,
    // Custom pages: [{ id, title, description, images: [] }]
    customPages: [],
  });

  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingAboutImg, setUploadingAboutImg] = useState(false);
  const [uploadingContactImg, setUploadingContactImg] = useState(false);

  const uploadAsset = async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
    return data.path;
  };

  const handleAboutImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAboutImg(true);
    try {
      const path = await uploadAsset(file);
      update("aboutImages", [...(settings.aboutImages || []), path]);
      toast.success("Immagine aggiunta");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setUploadingAboutImg(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleContactImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingContactImg(true);
    try {
      const path = await uploadAsset(file);
      update("contactImages", [...(settings.contactImages || []), path]);
      toast.success("Immagine aggiunta");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setUploadingContactImg(false);
      if (e.target) e.target.value = "";
    }
  };

  const removeAboutImage = (path) => update("aboutImages", (settings.aboutImages || []).filter((p) => p !== path));
  const removeContactImage = (path) => update("contactImages", (settings.contactImages || []).filter((p) => p !== path));

  // Page order drag
  const [pageDragId, setPageDragId] = useState(null);
  const handlePageDrop = (targetKey) => {
    if (!pageDragId || pageDragId === targetKey) { setPageDragId(null); return; }
    setSettings((s) => {
      const arr = [...(s.pageOrder || [])];
      const from = arr.indexOf(pageDragId);
      const to = arr.indexOf(targetKey);
      if (from === -1 || to === -1) return s;
      arr.splice(from, 1);
      arr.splice(to, 0, pageDragId);
      return { ...s, pageOrder: arr };
    });
    setPageDragId(null);
  };

  // Click-to-edit page dialog
  const [editingPage, setEditingPage] = useState(null); // { type: 'cover'|'index'|'about'|'contact'|'custom', customId? }

  // Image crop dialog
  const [cropping, setCropping] = useState(null); // { path, onApply: (newPath) => void, aspect? }

  const openCrop = (path, onApply, aspect) => setCropping({ path, onApply, aspect });

  // Custom pages helpers
  const addCustomPage = () => {
    const id = `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    setSettings((s) => ({
      ...s,
      customPages: [...(s.customPages || []), { id, title: "Nuova pagina", description: "", images: [] }],
      pageOrder: [...(s.pageOrder || []), `custom-${id}`],
    }));
    setEditingPage({ type: "custom", customId: id });
    toast.success("Pagina personalizzata aggiunta");
  };

  const removeCustomPage = (id) => {
    setSettings((s) => ({
      ...s,
      customPages: (s.customPages || []).filter((p) => p.id !== id),
      pageOrder: (s.pageOrder || []).filter((k) => k !== `custom-${id}`),
    }));
  };

  const updateCustomPage = (id, patch) => {
    setSettings((s) => ({
      ...s,
      customPages: (s.customPages || []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  };

  const handleCustomImageUpload = async (id, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const path = await uploadAsset(file);
      const page = (settings.customPages || []).find((p) => p.id === id);
      updateCustomPage(id, { images: [...(page?.images || []), path] });
      toast.success("Immagine aggiunta");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      if (e.target) e.target.value = "";
    }
  };

  const removeCustomImage = (id, path) => {
    const page = (settings.customPages || []).find((p) => p.id === id);
    if (!page) return;
    updateCustomPage(id, { images: page.images.filter((x) => x !== path) });
  };

  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const path = await uploadAsset(file, "cover");
      update("coverImagePath", path);
      toast.success("Copertina caricata");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setUploadingCover(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const path = await uploadAsset(file, "logo");
      update("logoPath", path);
      toast.success("Logo caricato");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setUploadingLogo(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const pRes = await api.get("/products");
        setProducts(pRes.data);
        const allIds = pRes.data.map((p) => p.id);

        if (isEditMode) {
          const cRes = await api.get(`/catalogs/${catalogId}`);
          const cat = cRes.data;
          setSettings((prev) => ({ ...prev, ...(cat.settings || {}), name: cat.name || prev.name }));
          const savedIds = cat.product_ids || [];
          // ordered = savedIds first, then any new products at the end
          const ordered = [...savedIds.filter((id) => allIds.includes(id)), ...allIds.filter((id) => !savedIds.includes(id))];
          setOrder(ordered);
          // Exclude products that are not part of the saved catalog
          setExcludedIds(allIds.filter((id) => !savedIds.includes(id)));
        } else {
          setOrder(allIds);
        }
      } catch (err) {
        toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [catalogId, isEditMode]);

  // Derived: products in the current catalog (ordered + not excluded)
  const activeProducts = useMemo(() => {
    const map = new Map(products.map((p) => [p.id, p]));
    const excluded = new Set(excludedIds);
    return order.map((id) => map.get(id)).filter((p) => p && !excluded.has(p.id));
  }, [products, order, excludedIds]);

  // Drag & drop handlers
  const handleDragStart = (id) => setDragId(id);
  const handleDragOver = (e, id) => { e.preventDefault(); setDragOverId(id); };
  const handleDragEnd = () => { setDragId(null); setDragOverId(null); };
  const handleDrop = (e, targetId) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) { handleDragEnd(); return; }
    setOrder((prev) => {
      const arr = [...prev];
      const from = arr.indexOf(dragId);
      const to = arr.indexOf(targetId);
      if (from === -1 || to === -1) return prev;
      arr.splice(from, 1);
      arr.splice(to, 0, dragId);
      return arr;
    });
    handleDragEnd();
  };

  const toggleExclude = (id) => {
    setExcludedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const includeAll = () => setExcludedIds([]);
  const excludeAll = () => setExcludedIds(products.map((p) => p.id));

  // Distinct categories from all products (for filter dropdown)
  const availableCategories = useMemo(() => {
    const set = new Set();
    for (const p of products) set.add(p.category || "Senza categoria");
    return Array.from(set).sort();
  }, [products]);

  const groups = useMemo(() => {
    if (!settings.groupByCategory) return { "": activeProducts };
    const g = {};
    for (const p of activeProducts) {
      const cat = p.category || "Senza categoria";
      const sub = p.subcategory || "";
      const key = sub ? `${cat} — ${sub}` : cat;
      g[key] = g[key] || [];
      g[key].push(p);
    }
    return g;
  }, [activeProducts, settings.groupByCategory]);

  const perPage = settings.columns * settings.rows;

  const update = (k, v) => setSettings((s) => ({ ...s, [k]: v }));

  // Save catalog (create new or update existing)
  const saveCatalog = async () => {
    try {
      const payload = {
        name: settings.name,
        settings,
        product_ids: activeProducts.map((p) => p.id),
      };
      if (isEditMode) {
        await api.put(`/catalogs/${catalogId}`, payload);
        toast.success("Catalogo aggiornato");
      } else {
        await api.post("/catalogs", payload);
        toast.success("Catalogo salvato nella cronologia");
      }
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  // Export PDF (all pages)
  const exportPDF = async () => {
    if (!previewRef.current) return;
    toast.info("Generazione PDF in corso…");
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageEls = previewRef.current.querySelectorAll(".catalog-page");
      for (let i = 0; i < pageEls.length; i++) {
        const canvas = await html2canvas(pageEls[i], { scale: 2, backgroundColor: settings.background, useCORS: true });
        const img = canvas.toDataURL("image/jpeg", 0.9);
        const w = pdf.internal.pageSize.getWidth();
        const h = pdf.internal.pageSize.getHeight();
        if (i > 0) pdf.addPage();
        pdf.addImage(img, "JPEG", 0, 0, w, h);
      }
      pdf.save(`${settings.name || "catalogo"}.pdf`);
      toast.success("PDF scaricato");
      await saveCatalog();
    } catch (err) {
      toast.error("Errore generazione PDF: " + err.message);
    }
  };

  const exportPNG = async () => {
    if (!previewRef.current) return;
    try {
      const pageEls = previewRef.current.querySelectorAll(".catalog-page");
      for (let i = 0; i < pageEls.length; i++) {
        const canvas = await html2canvas(pageEls[i], { scale: 2, backgroundColor: settings.background, useCORS: true });
        const url = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = `${settings.name || "catalogo"}-pagina-${i + 1}.png`;
        a.click();
      }
      toast.success("PNG scaricati");
      await saveCatalog();
    } catch (err) {
      toast.error("Errore generazione PNG");
    }
  };

  const exportHTML = () => {
    if (!previewRef.current) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${settings.name}</title>
<style>body{margin:0;background:${settings.background};font-family:${settings.font};color:${settings.textColor};}
.catalog-page{width:210mm;min-height:297mm;padding:15mm;box-sizing:border-box;page-break-after:always;background:${settings.background};}
img{max-width:100%;height:auto;}
</style></head><body>${previewRef.current.innerHTML}</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${settings.name || "catalogo"}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("HTML scaricato");
    saveCatalog();
  };

  // Render pages based on pageOrder
  const pages = useMemo(() => {
    const result = [];
    const order = settings.pageOrder && settings.pageOrder.length > 0
      ? settings.pageOrder
      : ["cover", "index", "about", "products", "contact"];

    const customMap = new Map((settings.customPages || []).map((p) => [p.id, p]));

    for (const section of order) {
      if (section === "cover") {
        if (settings.showCover) result.push({ type: "cover" });
      } else if (section === "index") {
        if (settings.showIndex) result.push({ type: "index" });
      } else if (section === "about") {
        if (settings.aboutEnabled) result.push({ type: "about" });
      } else if (section === "contact") {
        if (settings.contactEnabled) result.push({ type: "contact" });
      } else if (section === "products") {
        for (const [group, items] of Object.entries(groups)) {
          let i = 0;
          while (i < items.length) {
            const chunk = items.slice(i, i + perPage);
            result.push({ type: "content", group, items: chunk });
            i += perPage;
          }
        }
      } else if (section.startsWith("custom-")) {
        const id = section.slice("custom-".length);
        const cp = customMap.get(id);
        if (cp) result.push({ type: "custom", customPage: cp });
      }
    }

    if (result.length === 0) {
      result.push({ type: "empty" });
    }

    // Compute TOC entries and attach to index page(s)
    const tocEntries = [];
    let lastGroup = "__NONE__";
    result.forEach((p, idx) => {
      const pageNum = idx + 1;
      if (p.type === "about") tocEntries.push({ title: settings.aboutTitle || "Chi Siamo", page: pageNum });
      else if (p.type === "contact") tocEntries.push({ title: settings.contactTitle || "Contatti", page: pageNum });
      else if (p.type === "custom") tocEntries.push({ title: p.customPage.title || "Pagina", page: pageNum });
      else if (p.type === "content") {
        const g = p.group || "Prodotti";
        if (g !== lastGroup) {
          tocEntries.push({ title: g, page: pageNum });
          lastGroup = g;
        }
      }
    });
    for (const p of result) {
      if (p.type === "index") p.entries = tocEntries;
    }

    return result;
  }, [groups, perPage, settings.showCover, settings.showIndex, settings.aboutEnabled, settings.contactEnabled, settings.pageOrder, settings.aboutTitle, settings.contactTitle, settings.customPages]);

  return (
    <div className="flex min-h-screen">
      {/* Settings panel */}
      <aside className="w-96 shrink-0 border-r border-zinc-200 bg-white p-5 overflow-y-auto max-h-screen sticky top-0" data-testid="catalog-settings">
        <div className="mb-4">
          <h1 className="font-display text-2xl tracking-tight" data-testid="page-title">
            {isEditMode ? "Modifica catalogo" : "Crea nuovo catalogo"}
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {isEditMode ? "Modifica e salva le modifiche." : "Personalizza e scarica."}
          </p>
          {isEditMode && (
            <button
              data-testid="back-to-history"
              onClick={() => navigate("/app/history")}
              className="text-xs text-[#0047AB] hover:underline mt-1"
            >
              ← Torna alla cronologia
            </button>
          )}
        </div>

        <div className="space-y-2 mb-4">
          <Label>Nome catalogo</Label>
          <Input data-testid="catalog-name" value={settings.name} onChange={(e) => update("name", e.target.value)} />
        </div>

        <Tabs defaultValue="products">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="products" data-testid="tab-products" className="text-xs">Prodotti</TabsTrigger>
            <TabsTrigger value="pages" data-testid="tab-pages" className="text-xs">Pagine</TabsTrigger>
            <TabsTrigger value="layout" data-testid="tab-layout" className="text-xs">Layout</TabsTrigger>
            <TabsTrigger value="style" data-testid="tab-style" className="text-xs">Stile</TabsTrigger>
            <TabsTrigger value="content" data-testid="tab-content" className="text-xs">Contenuto</TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="space-y-3 pt-4">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-semibold" data-testid="active-count">{activeProducts.length}</span>
                <span className="text-zinc-500"> / {products.length} inclusi</span>
              </div>
              <div className="flex gap-1">
                <Button data-testid="include-all" type="button" size="sm" variant="outline" onClick={includeAll} className="text-xs h-7">Tutti</Button>
                <Button data-testid="exclude-all" type="button" size="sm" variant="outline" onClick={excludeAll} className="text-xs h-7">Nessuno</Button>
              </div>
            </div>

            <Input
              data-testid="product-search"
              placeholder="Cerca prodotto…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger data-testid="category-filter">
                <SelectValue placeholder="Tutte le categorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tutte le categorie</SelectItem>
                {availableCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="text-[10px] uppercase tracking-wider text-zinc-400 pt-1">
              Trascina per riordinare · Click sulla checkbox per includere/escludere
            </div>

            <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1" data-testid="product-picker-list">
              {order.map((id) => {
                const p = products.find((x) => x.id === id);
                if (!p) return null;
                if (productSearch && !p.name.toLowerCase().includes(productSearch.toLowerCase())) return null;
                if (categoryFilter !== "__all__" && (p.category || "Senza categoria") !== categoryFilter) return null;
                const excluded = excludedIds.includes(id);
                const isDragged = dragId === id;
                const isOver = dragOverId === id && dragId !== id;
                return (
                  <div
                    key={id}
                    data-testid={`picker-item-${id}`}
                    draggable
                    onDragStart={() => handleDragStart(id)}
                    onDragOver={(e) => handleDragOver(e, id)}
                    onDrop={(e) => handleDrop(e, id)}
                    onDragEnd={handleDragEnd}
                    className={`group flex items-center gap-2 p-2 rounded-md border transition-all cursor-grab active:cursor-grabbing
                      ${excluded ? "bg-zinc-50 border-zinc-200 opacity-50" : "bg-white border-zinc-200 hover:border-[#0047AB]/40"}
                      ${isDragged ? "opacity-30" : ""}
                      ${isOver ? "border-[#0047AB] border-2 -translate-y-0.5" : ""}
                    `}
                  >
                    <GripVertical size={14} className="text-zinc-300 shrink-0" />
                    <input
                      type="checkbox"
                      data-testid={`picker-check-${id}`}
                      checked={!excluded}
                      onChange={() => toggleExclude(id)}
                      className="h-4 w-4 rounded border-zinc-300 accent-[#0047AB] cursor-pointer"
                    />
                    <div className="w-8 h-8 rounded bg-zinc-100 overflow-hidden shrink-0">
                      {p.image_path && <img src={`${API}/files/${p.image_path}`} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{p.name}</div>
                      <div className="text-[10px] text-zinc-500 truncate">
                        {p.category || "—"}{p.subcategory ? ` · ${p.subcategory}` : ""} · €{Number(p.price).toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              })}
              {products.length === 0 && (
                <div className="text-center py-8 text-xs text-zinc-500">Nessun prodotto disponibile</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="pages" className="space-y-4 pt-4">
            <div>
              <Label className="text-xs uppercase tracking-wider text-zinc-500 mb-2 block">Ordine delle pagine</Label>
              <p className="text-[11px] text-zinc-500 mb-2">Trascina per riordinare. Attiva/disattiva ogni sezione con il toggle.</p>
              <div className="space-y-1" data-testid="page-order-list">
                {(settings.pageOrder || []).map((key) => {
                  let meta;
                  if (key.startsWith("custom-")) {
                    const id = key.slice("custom-".length);
                    const cp = (settings.customPages || []).find((p) => p.id === id);
                    if (!cp) return null;
                    meta = { label: cp.title || "Pagina personalizzata", enabledKey: null, locked: false, custom: true, customId: id };
                  } else {
                    meta = {
                      cover: { label: "Copertina", enabledKey: "showCover", locked: false },
                      index: { label: "Indice", enabledKey: "showIndex", locked: false },
                      about: { label: "Chi Siamo", enabledKey: "aboutEnabled", locked: false },
                      products: { label: "Prodotti", enabledKey: null, locked: true },
                      contact: { label: "Contatti", enabledKey: "contactEnabled", locked: false },
                    }[key];
                    if (!meta) return null;
                  }
                  const enabled = meta.locked || meta.custom || !!settings[meta.enabledKey];
                  const isOver = pageDragId && pageDragId !== key;
                  return (
                    <div
                      key={key}
                      data-testid={`page-order-${key}`}
                      draggable
                      onDragStart={() => setPageDragId(key)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handlePageDrop(key)}
                      onDragEnd={() => setPageDragId(null)}
                      className={`flex items-center gap-2 p-2 rounded-md border bg-white cursor-grab active:cursor-grabbing transition-all ${isOver ? "border-[#0047AB] border-2" : "border-zinc-200"} ${!enabled && !meta.locked ? "opacity-50" : ""}`}
                    >
                      <GripVertical size={14} className="text-zinc-300 shrink-0" />
                      <span className="text-sm flex-1 truncate">{meta.label}</span>
                      {meta.locked ? (
                        <span className="text-[10px] uppercase tracking-widest text-zinc-400">Sempre</span>
                      ) : meta.custom ? (
                        <>
                          <button
                            type="button"
                            data-testid={`edit-custom-${meta.customId}`}
                            onClick={() => setEditingPage({ type: "custom", customId: meta.customId })}
                            className="p-1 text-zinc-500 hover:text-[#0047AB]"
                            title="Modifica"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            data-testid={`remove-custom-${meta.customId}`}
                            onClick={() => removeCustomPage(meta.customId)}
                            className="p-1 text-zinc-500 hover:text-red-600"
                            title="Rimuovi"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      ) : (
                        <Switch
                          data-testid={`toggle-page-${key}`}
                          checked={enabled}
                          onCheckedChange={(v) => update(meta.enabledKey, v)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <Button
                data-testid="add-custom-page"
                type="button"
                variant="outline"
                size="sm"
                onClick={addCustomPage}
                className="w-full mt-2"
              >
                <Plus size={14} className="mr-1" /> Aggiungi pagina personalizzata
              </Button>
            </div>

            {/* Index section fields */}
            <div className="pt-3 border-t space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-500">Indice</Label>
              <Input
                data-testid="index-title"
                placeholder="Titolo dell'indice"
                value={settings.indexTitle || ""}
                onChange={(e) => update("indexTitle", e.target.value)}
                disabled={!settings.showIndex}
              />
              <p className="text-[11px] text-zinc-500">L'indice viene generato automaticamente in base alle sezioni e ai prodotti.</p>
            </div>

            {/* About section fields */}
            <div className="pt-3 border-t space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-500">Chi Siamo</Label>
              <Input
                data-testid="about-title"
                placeholder="Titolo (es. Chi Siamo)"
                value={settings.aboutTitle || ""}
                onChange={(e) => update("aboutTitle", e.target.value)}
                disabled={!settings.aboutEnabled}
              />
              <Textarea
                data-testid="about-description"
                rows={4}
                placeholder="Racconta la storia della tua azienda…"
                value={settings.aboutDescription || ""}
                onChange={(e) => update("aboutDescription", e.target.value)}
                disabled={!settings.aboutEnabled}
              />
              <div className="flex items-center gap-2 flex-wrap">
                {(settings.aboutImages || []).map((path) => (
                  <div key={path} className="relative">
                    <img src={`${API}/files/${path}`} alt="about" className="w-14 h-14 object-cover rounded border border-zinc-200" />
                    <button
                      type="button"
                      data-testid={`about-img-remove-${path}`}
                      onClick={() => removeAboutImage(path)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] hover:bg-red-700"
                    >×</button>
                  </div>
                ))}
                <label className="cursor-pointer">
                  <div className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-dashed border-zinc-300 rounded-md text-xs hover:border-[#0047AB]">
                    <ImageIcon size={12} /> {uploadingAboutImg ? "…" : "Aggiungi"}
                  </div>
                  <input
                    data-testid="about-image-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleAboutImageUpload}
                    className="hidden"
                    disabled={!settings.aboutEnabled}
                  />
                </label>
              </div>
            </div>

            {/* Contact section fields */}
            <div className="pt-3 border-t space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-500">Contatti</Label>
              <Input
                data-testid="contact-title"
                placeholder="Titolo (es. Contatti)"
                value={settings.contactTitle || ""}
                onChange={(e) => update("contactTitle", e.target.value)}
                disabled={!settings.contactEnabled}
              />
              <Textarea
                data-testid="contact-description"
                rows={2}
                placeholder="Descrizione breve"
                value={settings.contactDescription || ""}
                onChange={(e) => update("contactDescription", e.target.value)}
                disabled={!settings.contactEnabled}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  data-testid="contact-email"
                  placeholder="Email"
                  value={settings.contactEmail || ""}
                  onChange={(e) => update("contactEmail", e.target.value)}
                  disabled={!settings.contactEnabled}
                />
                <Input
                  data-testid="contact-phone"
                  placeholder="Telefono"
                  value={settings.contactPhone || ""}
                  onChange={(e) => update("contactPhone", e.target.value)}
                  disabled={!settings.contactEnabled}
                />
              </div>
              <Textarea
                data-testid="contact-address"
                rows={2}
                placeholder="Indirizzo"
                value={settings.contactAddress || ""}
                onChange={(e) => update("contactAddress", e.target.value)}
                disabled={!settings.contactEnabled}
              />
              <div className="flex items-center gap-2 flex-wrap">
                {(settings.contactImages || []).map((path) => (
                  <div key={path} className="relative">
                    <img src={`${API}/files/${path}`} alt="contact" className="w-14 h-14 object-cover rounded border border-zinc-200" />
                    <button
                      type="button"
                      data-testid={`contact-img-remove-${path}`}
                      onClick={() => removeContactImage(path)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] hover:bg-red-700"
                    >×</button>
                  </div>
                ))}
                <label className="cursor-pointer">
                  <div className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-dashed border-zinc-300 rounded-md text-xs hover:border-[#0047AB]">
                    <ImageIcon size={12} /> {uploadingContactImg ? "…" : "Aggiungi"}
                  </div>
                  <input
                    data-testid="contact-image-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleContactImageUpload}
                    className="hidden"
                    disabled={!settings.contactEnabled}
                  />
                </label>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="layout" className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <Label>Raggruppa per categoria</Label>
              <Switch data-testid="switch-group" checked={settings.groupByCategory} onCheckedChange={(v) => update("groupByCategory", v)} />
            </div>

            <div className="space-y-2">
              <Label>Colonne: {settings.columns}</Label>
              <Slider data-testid="slider-columns" value={[settings.columns]} min={1} max={5} step={1} onValueChange={([v]) => update("columns", v)} />
            </div>
            <div className="space-y-2">
              <Label>Righe: {settings.rows}</Label>
              <Slider data-testid="slider-rows" value={[settings.rows]} min={1} max={8} step={1} onValueChange={([v]) => update("rows", v)} />
            </div>
            <div className="space-y-2">
              <Label>Tipo di impaginazione</Label>
              <Select value={settings.layout} onValueChange={(v) => update("layout", v)}>
                <SelectTrigger data-testid="select-layout"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LAYOUTS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="style" className="space-y-4 pt-4">
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-xs">Sfondo</Label><Input type="color" value={settings.background} onChange={(e) => update("background", e.target.value)} className="h-10 p-1" /></div>
              <div><Label className="text-xs">Testo</Label><Input type="color" value={settings.textColor} onChange={(e) => update("textColor", e.target.value)} className="h-10 p-1" /></div>
              <div><Label className="text-xs">Accento</Label><Input type="color" value={settings.accentColor} onChange={(e) => update("accentColor", e.target.value)} className="h-10 p-1" /></div>
            </div>

            <div className="space-y-2">
              <Label>Font</Label>
              <Select value={settings.font} onValueChange={(v) => update("font", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label>Mostra copertina</Label>
              <Switch checked={settings.showCover} onCheckedChange={(v) => update("showCover", v)} />
            </div>
            {settings.showCover && (
              <>
                <Input placeholder="Titolo copertina" value={settings.coverTitle} onChange={(e) => update("coverTitle", e.target.value)} />
                <Input placeholder="Sottotitolo copertina" value={settings.coverSubtitle} onChange={(e) => update("coverSubtitle", e.target.value)} />
              </>
            )}
          </TabsContent>

          <TabsContent value="content" className="space-y-3 pt-4">
            <div className="flex items-center justify-between"><Label>Header</Label><Switch checked={settings.showHeader} onCheckedChange={(v) => update("showHeader", v)} /></div>
            <div className="flex items-center justify-between"><Label>Footer</Label><Switch checked={settings.showFooter} onCheckedChange={(v) => update("showFooter", v)} /></div>
            <div className="flex items-center justify-between"><Label>Prezzo</Label><Switch checked={settings.showPrice} onCheckedChange={(v) => update("showPrice", v)} /></div>
            <div className="flex items-center justify-between"><Label>Sconto</Label><Switch checked={settings.showDiscount} onCheckedChange={(v) => update("showDiscount", v)} /></div>
            <div className="flex items-center justify-between"><Label>Colori</Label><Switch checked={settings.showColors} onCheckedChange={(v) => update("showColors", v)} /></div>
            <div className="flex items-center justify-between"><Label>Taglie</Label><Switch checked={settings.showSizes} onCheckedChange={(v) => update("showSizes", v)} /></div>
            <div className="flex items-center justify-between"><Label>Codice (SKU)</Label><Switch data-testid="switch-sku" checked={settings.showSku} onCheckedChange={(v) => update("showSku", v)} /></div>
            <div className="flex items-center justify-between"><Label>Quantità</Label><Switch data-testid="switch-quantity" checked={settings.showQuantity} onCheckedChange={(v) => update("showQuantity", v)} /></div>

            {/* IVA / VAT label */}
            <div className="pt-3 border-t space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-500">Dicitura IVA</Label>
              <Select value={settings.priceLabel || "none"} onValueChange={(v) => update("priceLabel", v)}>
                <SelectTrigger data-testid="select-price-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuna</SelectItem>
                  <SelectItem value="included">IVA inclusa</SelectItem>
                  <SelectItem value="plus">+ IVA</SelectItem>
                </SelectContent>
              </Select>
              {settings.priceLabel === "plus" && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs shrink-0">Aliquota IVA (%)</Label>
                  <Input
                    data-testid="input-vat-rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={settings.vatRate ?? 22}
                    onChange={(e) => update("vatRate", parseFloat(e.target.value) || 0)}
                    className="max-w-24"
                  />
                </div>
              )}
            </div>

            <Input placeholder="Nome azienda" value={settings.companyName} onChange={(e) => update("companyName", e.target.value)} />

            {/* Logo upload */}
            <div className="space-y-2 pt-2 border-t">
              <Label className="text-xs uppercase tracking-wider text-zinc-500">Logo aziendale</Label>
              <div className="flex items-center gap-2">
                {settings.logoPath && (
                  <img
                    data-testid="logo-preview"
                    src={buildImageUrl(settings.logoPath)}
                    alt="logo"
                    className="w-12 h-12 object-contain rounded border border-zinc-200 bg-white"
                  />
                )}
                <label className="flex-1 cursor-pointer">
                  <div className="text-center px-3 py-2 border border-dashed border-zinc-300 rounded-md hover:border-[#0047AB] text-sm text-zinc-600">
                    {uploadingLogo ? "Caricamento…" : settings.logoPath ? "Cambia logo" : "Carica logo"}
                  </div>
                  <input data-testid="logo-upload-input" type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </label>
                {settings.logoPath && (
                  <Button data-testid="logo-remove" type="button" size="sm" variant="outline" onClick={() => update("logoPath", null)} className="text-red-600">✕</Button>
                )}
              </div>
            </div>

            {/* Cover image upload */}
            <div className="space-y-2 pt-2 border-t">
              <Label className="text-xs uppercase tracking-wider text-zinc-500">Immagine copertina</Label>
              <Select value={settings.coverStyle} onValueChange={(v) => update("coverStyle", v)}>
                <SelectTrigger data-testid="select-cover-style"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Solo testo</SelectItem>
                  <SelectItem value="image">Immagine a tutta pagina</SelectItem>
                  <SelectItem value="hybrid">Immagine + testo</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                {settings.coverImagePath && (
                  <img
                    data-testid="cover-preview"
                    src={buildImageUrl(settings.coverImagePath)}
                    alt="cover"
                    className="w-12 h-12 object-cover rounded border border-zinc-200"
                  />
                )}
                <label className="flex-1 cursor-pointer">
                  <div className="text-center px-3 py-2 border border-dashed border-zinc-300 rounded-md hover:border-[#0047AB] text-sm text-zinc-600">
                    {uploadingCover ? "Caricamento…" : settings.coverImagePath ? "Cambia copertina" : "Carica copertina"}
                  </div>
                  <input data-testid="cover-upload-input" type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
                </label>
                {settings.coverImagePath && (
                  <Button data-testid="cover-remove" type="button" size="sm" variant="outline" onClick={() => update("coverImagePath", null)} className="text-red-600">✕</Button>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-6 space-y-2 sticky bottom-0 bg-white pt-3 border-t">
          <Button data-testid="export-pdf" onClick={exportPDF} className="w-full bg-[#0047AB] hover:bg-[#003380]"><FileDown size={16} className="mr-2" /> Scarica PDF</Button>
          <div className="grid grid-cols-2 gap-2">
            <Button data-testid="export-png" onClick={exportPNG} variant="outline"><ImageIcon size={14} className="mr-1" /> PNG</Button>
            <Button data-testid="export-html" onClick={exportHTML} variant="outline"><FileCode size={14} className="mr-1" /> HTML</Button>
          </div>
          <Button data-testid="save-catalog" onClick={saveCatalog} variant="outline" className="w-full"><Save size={14} className="mr-2" /> Salva</Button>
        </div>
      </aside>

      {/* Preview */}
      <div className="flex-1 p-6 bg-zinc-100 overflow-auto">
        <div className="mb-4 text-sm text-zinc-500">Anteprima ({pages.length} pagine)</div>
        {loading ? (
          <div className="text-center py-16 text-zinc-500">Caricamento…</div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-zinc-300 rounded-lg bg-white">
            <p className="text-zinc-500">Nessun prodotto disponibile. Carica alcuni prodotti prima di creare un catalogo.</p>
          </div>
        ) : (
          <div ref={previewRef} className="space-y-6" data-testid="catalog-preview">
            {pages.map((page, idx) => {
              // Determine clickability + edit target
              let editTarget = null;
              if (page.type === "cover") editTarget = { type: "cover" };
              else if (page.type === "index") editTarget = { type: "index" };
              else if (page.type === "about") editTarget = { type: "about" };
              else if (page.type === "contact") editTarget = { type: "contact" };
              else if (page.type === "custom") editTarget = { type: "custom", customId: page.customPage.id };

              return (
                <div
                  key={idx}
                  data-testid={`preview-page-${idx}`}
                  className={`relative group/page ${editTarget ? "cursor-pointer" : ""}`}
                  onClick={editTarget ? () => setEditingPage(editTarget) : undefined}
                >
                  {editTarget && (
                    <div
                      data-html2canvas-ignore="true"
                      className="absolute top-3 right-3 z-20 opacity-0 group-hover/page:opacity-100 transition-opacity pointer-events-none"
                    >
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#0047AB] text-white text-xs rounded-full shadow-lg">
                        <Pencil size={12} /> Clicca per modificare
                      </div>
                    </div>
                  )}
                  <CatalogPage page={page} settings={settings} onRemoveProduct={toggleExclude} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Page Edit Dialog */}
      <PageEditDialog
        editingPage={editingPage}
        onClose={() => setEditingPage(null)}
        settings={settings}
        update={update}
        uploadingAboutImg={uploadingAboutImg}
        uploadingContactImg={uploadingContactImg}
        handleAboutImageUpload={handleAboutImageUpload}
        handleContactImageUpload={handleContactImageUpload}
        removeAboutImage={removeAboutImage}
        removeContactImage={removeContactImage}
        openCrop={openCrop}
        updateCustomPage={updateCustomPage}
        handleCustomImageUpload={handleCustomImageUpload}
        removeCustomImage={removeCustomImage}
      />

      {/* Image Crop Dialog */}
      {cropping && (
        <ImageCropDialog
          open={!!cropping}
          imagePath={cropping.path}
          aspect={cropping.aspect}
          onClose={() => setCropping(null)}
          onCropped={(newPath) => cropping.onApply(newPath)}
        />
      )}
    </div>
  );
}

function CatalogPage({ page, settings, onRemoveProduct }) {
  const style = {
    background: settings.background,
    color: settings.textColor,
    fontFamily: settings.font,
    width: "210mm",
    minHeight: "297mm",
    padding: "15mm",
    boxSizing: "border-box",
    margin: "0 auto",
  };

  if (page.type === "cover") {
    const coverImg = settings.coverImagePath ? `${API}/files/${settings.coverImagePath}` : null;
    const logoImg = settings.logoPath ? `${API}/files/${settings.logoPath}` : null;

    // Full-bleed image cover
    if (settings.coverStyle === "image" && coverImg) {
      return (
        <div className="catalog-page relative overflow-hidden" style={{ ...style, padding: 0 }}>
          <img src={coverImg} alt="cover" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.6) 100%)" }} />
          <div style={{ position: "absolute", inset: 0, padding: "15mm", display: "flex", flexDirection: "column", justifyContent: "space-between", color: "white" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {logoImg && <img src={logoImg} alt="logo" crossOrigin="anonymous" style={{ height: "40px", width: "auto", background: "white", padding: "4px", borderRadius: "4px" }} />}
              <div style={{ fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", opacity: 0.9 }}>{settings.companyName}</div>
            </div>
            <div>
              <div className="w-24 h-1 mb-4" style={{ background: settings.accentColor }} />
              <h1 style={{ fontSize: "56px", lineHeight: 1.05, fontWeight: 800, margin: 0 }}>{settings.coverTitle}</h1>
              <div style={{ marginTop: "12px", fontSize: "18px", opacity: 0.9 }}>{settings.coverSubtitle}</div>
            </div>
          </div>
        </div>
      );
    }

    // Hybrid: image on top half, text below
    if (settings.coverStyle === "hybrid" && coverImg) {
      return (
        <div className="catalog-page relative flex flex-col" style={{ ...style, padding: 0 }}>
          <div style={{ height: "55%", overflow: "hidden", position: "relative" }}>
            <img src={coverImg} alt="cover" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <div style={{ padding: "15mm", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {logoImg && <img src={logoImg} alt="logo" crossOrigin="anonymous" style={{ height: "36px", width: "auto", marginBottom: "16px", objectFit: "contain" }} />}
            <div className="w-24 h-1 mb-4" style={{ background: settings.accentColor }} />
            <div className="text-xs uppercase tracking-widest opacity-60">{settings.companyName}</div>
            <h1 style={{ fontSize: "48px", lineHeight: 1.05, marginTop: "12px", fontWeight: 800 }}>{settings.coverTitle}</h1>
            <div className="mt-3 text-lg opacity-80">{settings.coverSubtitle}</div>
          </div>
        </div>
      );
    }

    // Text-only cover (default)
    return (
      <div className="catalog-page relative flex flex-col justify-center items-start" style={style}>
        {logoImg && (
          <img src={logoImg} alt="logo" crossOrigin="anonymous" style={{ position: "absolute", top: "15mm", left: "15mm", height: "48px", width: "auto", objectFit: "contain" }} />
        )}
        <div className="w-24 h-1 mb-6" style={{ background: settings.accentColor }} />
        <div className="text-xs uppercase tracking-widest opacity-60">{settings.companyName}</div>
        <h1 style={{ fontSize: "56px", lineHeight: 1.05, marginTop: "16px", fontWeight: 800 }}>{settings.coverTitle}</h1>
        <div className="mt-3 text-lg opacity-80">{settings.coverSubtitle}</div>
        <div className="absolute bottom-[15mm] left-[15mm] right-[15mm] flex justify-between text-xs opacity-60">
          <span>{new Date().getFullYear()}</span>
          <span>{settings.companyName}</span>
        </div>
      </div>
    );
  }

  if (page.type === "empty") {
    return <div className="catalog-page flex items-center justify-center text-zinc-400" style={style}>Nessun prodotto</div>;
  }

  // Index (Table of Contents)
  if (page.type === "index") {
    return (
      <div className="catalog-page flex flex-col" style={style}>
        {settings.showHeader && (
          <div className="flex items-center justify-between border-b pb-3 mb-6" style={{ borderColor: settings.accentColor + "40" }}>
            <div className="flex items-center gap-2">
              {settings.logoPath && <img src={`${API}/files/${settings.logoPath}`} alt="logo" crossOrigin="anonymous" style={{ height: "24px", objectFit: "contain" }} />}
              <div className="text-sm font-semibold" style={{ color: settings.accentColor }}>{settings.companyName}</div>
            </div>
          </div>
        )}
        <div className="w-24 h-1 mb-4" style={{ background: settings.accentColor }} />
        <h2 className="font-display" style={{ fontSize: "42px", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "24px" }}>{settings.indexTitle || "Indice"}</h2>
        <div className="flex-1 space-y-1.5">
          {(page.entries || []).map((entry, i) => (
            <div key={i} className="flex items-baseline gap-3">
              <span className="text-sm font-medium">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-base">{entry.title}</span>
              <span className="flex-1 border-b border-dashed" style={{ borderColor: settings.textColor + "30", marginBottom: "4px" }} />
              <span className="text-sm font-mono" style={{ color: settings.accentColor }}>{entry.page}</span>
            </div>
          ))}
          {(page.entries || []).length === 0 && (
            <div className="text-sm opacity-50">Nessuna sezione da indicizzare</div>
          )}
        </div>
      </div>
    );
  }

  // About Us page
  if (page.type === "about") {
    const imgs = settings.aboutImages || [];
    return (
      <div className="catalog-page flex flex-col" style={style}>
        {settings.showHeader && (
          <div className="flex items-center justify-between border-b pb-3 mb-6" style={{ borderColor: settings.accentColor + "40" }}>
            <div className="flex items-center gap-2">
              {settings.logoPath && <img src={`${API}/files/${settings.logoPath}`} alt="logo" crossOrigin="anonymous" style={{ height: "24px", objectFit: "contain" }} />}
              <div className="text-sm font-semibold" style={{ color: settings.accentColor }}>{settings.companyName}</div>
            </div>
            <div className="text-xs uppercase tracking-widest opacity-60">{settings.aboutTitle || "Chi Siamo"}</div>
          </div>
        )}
        <div className="w-24 h-1 mb-4" style={{ background: settings.accentColor }} />
        <h2 className="font-display" style={{ fontSize: "42px", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "20px" }}>{settings.aboutTitle || "Chi Siamo"}</h2>
        <div style={{ fontSize: "14px", lineHeight: 1.7, whiteSpace: "pre-wrap", opacity: 0.85, marginBottom: "24px" }}>{settings.aboutDescription}</div>
        {imgs.length > 0 && (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(imgs.length, 3)}, 1fr)` }}>
            {imgs.map((path, i) => (
              <div key={i} style={{ aspectRatio: "4/3", overflow: "hidden", borderRadius: "4px", background: "#f4f4f5" }}>
                <img src={`${API}/files/${path}`} alt={`about-${i}`} crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Contact page
  if (page.type === "contact") {
    const imgs = settings.contactImages || [];
    return (
      <div className="catalog-page flex flex-col" style={style}>
        {settings.showHeader && (
          <div className="flex items-center justify-between border-b pb-3 mb-6" style={{ borderColor: settings.accentColor + "40" }}>
            <div className="flex items-center gap-2">
              {settings.logoPath && <img src={`${API}/files/${settings.logoPath}`} alt="logo" crossOrigin="anonymous" style={{ height: "24px", objectFit: "contain" }} />}
              <div className="text-sm font-semibold" style={{ color: settings.accentColor }}>{settings.companyName}</div>
            </div>
            <div className="text-xs uppercase tracking-widest opacity-60">{settings.contactTitle || "Contatti"}</div>
          </div>
        )}
        <div className="w-24 h-1 mb-4" style={{ background: settings.accentColor }} />
        <h2 className="font-display" style={{ fontSize: "42px", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "20px" }}>{settings.contactTitle || "Contatti"}</h2>
        {settings.contactDescription && (
          <div style={{ fontSize: "14px", lineHeight: 1.7, whiteSpace: "pre-wrap", opacity: 0.85, marginBottom: "24px" }}>{settings.contactDescription}</div>
        )}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {settings.contactEmail && (
            <div>
              <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1">Email</div>
              <div className="text-sm font-medium">{settings.contactEmail}</div>
            </div>
          )}
          {settings.contactPhone && (
            <div>
              <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1">Telefono</div>
              <div className="text-sm font-medium">{settings.contactPhone}</div>
            </div>
          )}
          {settings.contactAddress && (
            <div className="col-span-2">
              <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1">Indirizzo</div>
              <div className="text-sm font-medium" style={{ whiteSpace: "pre-wrap" }}>{settings.contactAddress}</div>
            </div>
          )}
        </div>
        {imgs.length > 0 && (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(imgs.length, 3)}, 1fr)` }}>
            {imgs.map((path, i) => (
              <div key={i} style={{ aspectRatio: "4/3", overflow: "hidden", borderRadius: "4px", background: "#f4f4f5" }}>
                <img src={`${API}/files/${path}`} alt={`contact-${i}`} crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Custom page
  if (page.type === "custom") {
    const cp = page.customPage;
    const imgs = cp.images || [];
    return (
      <div className="catalog-page flex flex-col" style={style}>
        {settings.showHeader && (
          <div className="flex items-center justify-between border-b pb-3 mb-6" style={{ borderColor: settings.accentColor + "40" }}>
            <div className="flex items-center gap-2">
              {settings.logoPath && <img src={`${API}/files/${settings.logoPath}`} alt="logo" crossOrigin="anonymous" style={{ height: "24px", objectFit: "contain" }} />}
              <div className="text-sm font-semibold" style={{ color: settings.accentColor }}>{settings.companyName}</div>
            </div>
            <div className="text-xs uppercase tracking-widest opacity-60">{cp.title || "Pagina"}</div>
          </div>
        )}
        <div className="w-24 h-1 mb-4" style={{ background: settings.accentColor }} />
        <h2 className="font-display" style={{ fontSize: "42px", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "20px" }}>{cp.title || "Pagina"}</h2>
        {cp.description && (
          <div style={{ fontSize: "14px", lineHeight: 1.7, whiteSpace: "pre-wrap", opacity: 0.85, marginBottom: "24px" }}>{cp.description}</div>
        )}
        {imgs.length > 0 && (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(imgs.length, 3)}, 1fr)` }}>
            {imgs.map((path, i) => (
              <div key={i} style={{ aspectRatio: "4/3", overflow: "hidden", borderRadius: "4px", background: "#f4f4f5" }}>
                <img src={`${API}/files/${path}`} alt={`custom-${i}`} crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="catalog-page flex flex-col" style={style}>
      {settings.showHeader && (
        <div className="flex items-center justify-between border-b pb-3 mb-4" style={{ borderColor: settings.accentColor + "40" }}>
          <div className="flex items-center gap-2">
            {settings.logoPath && (
              <img src={`${API}/files/${settings.logoPath}`} alt="logo" crossOrigin="anonymous" style={{ height: "24px", width: "auto", objectFit: "contain" }} />
            )}
            <div className="text-sm font-semibold" style={{ color: settings.accentColor }}>{settings.companyName}</div>
          </div>
          {page.group && <div className="text-xs uppercase tracking-widest opacity-60">{page.group}</div>}
        </div>
      )}

      <div className="flex-1 grid gap-3" style={{ gridTemplateColumns: `repeat(${settings.columns}, 1fr)` }}>
        {page.items.map((p) => (
          <ProductCard key={p.id} product={p} settings={settings} onRemove={onRemoveProduct} />
        ))}
      </div>

      {settings.showFooter && (
        <div className="mt-4 pt-3 border-t flex justify-between text-[10px] opacity-60" style={{ borderColor: settings.accentColor + "40" }}>
          <span>{settings.name}</span>
          <span>{settings.companyName}</span>
        </div>
      )}
    </div>
  );
}

function ProductCard({ product, settings, onRemove }) {
  const finalPrice = settings.showDiscount && product.discount > 0
    ? (product.price * (1 - product.discount / 100))
    : product.price;

  const layout = settings.layout;
  const minimal = layout === "minimal";
  const detailed = layout === "detailed";
  const compact = layout === "compact";

  return (
    <div
      data-testid={`preview-card-${product.id}`}
      data-html2canvas-ignore-children="false"
      className="relative flex flex-col group/card"
      style={{ border: `1px solid ${settings.accentColor}20`, background: "rgba(255,255,255,0.5)", borderRadius: "4px", overflow: "hidden" }}
    >
      {/* Remove button - hidden in PDF export via data-html2canvas-ignore */}
      {onRemove && (
        <button
          type="button"
          data-testid={`preview-remove-${product.id}`}
          data-html2canvas-ignore="true"
          onClick={(e) => { e.stopPropagation(); onRemove(product.id); }}
          title="Rimuovi dal catalogo"
          className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full bg-red-600 text-white opacity-0 group-hover/card:opacity-100 hover:bg-red-700 hover:scale-110 flex items-center justify-center shadow-md transition-all"
        >
          <XIcon size={12} />
        </button>
      )}
      {product.image_path && (
        <div style={{ aspectRatio: compact ? "3/2" : "1/1", background: "#f4f4f5", overflow: "hidden" }}>
          <img src={buildImageUrl(product.image_path)} alt={product.name} crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      )}
      <div style={{ padding: compact ? "6px 8px" : "10px 12px" }}>
        <div style={{ fontWeight: 600, fontSize: compact ? 11 : 13, lineHeight: 1.2 }}>{product.name}</div>
        {!minimal && product.description && detailed && (
          <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{product.description}</div>
        )}
        {settings.showPrice && (
          <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: compact ? 12 : 14, color: settings.accentColor }}>€{Number(finalPrice).toFixed(2)}</span>
            {settings.showDiscount && product.discount > 0 && (
              <>
                <span style={{ fontSize: 10, textDecoration: "line-through", opacity: 0.5 }}>€{Number(product.price).toFixed(2)}</span>
                <span style={{ fontSize: 9, background: "#DC2626", color: "white", padding: "1px 4px", borderRadius: 2 }}>-{product.discount}%</span>
              </>
            )}
            {(() => {
              // Per-product label wins; if empty, fall back to global setting
              const label = product.price_label || settings.priceLabel;
              if (label === "included") return <span style={{ fontSize: 9, opacity: 0.7, fontStyle: "italic" }}>iva inclusa</span>;
              if (label === "plus") {
                // Prefer per-product vat_rate; fall back to global vatRate when the label came from settings
                const rate = product.price_label === "plus" && product.vat_rate != null
                  ? product.vat_rate
                  : (settings.priceLabel === "plus" ? settings.vatRate : null);
                return (
                  <span style={{ fontSize: 9, opacity: 0.7, fontStyle: "italic" }}>
                    + iva{rate != null ? ` (${rate}%)` : ""}
                  </span>
                );
              }
              return null;
            })()}
          </div>
        )}
        {!minimal && (
          <>
            {settings.showColors && product.colors?.length > 0 && (
              <div style={{ fontSize: 9, opacity: 0.7, marginTop: 3 }}>Colori: {product.colors.join(", ")}</div>
            )}
            {settings.showSizes && product.sizes?.length > 0 && (
              <div style={{ fontSize: 9, opacity: 0.7 }}>Taglie: {product.sizes.join(", ")}</div>
            )}
            {settings.showSku && product.sku && (
              <div style={{ fontSize: 9, opacity: 0.7, fontFamily: "monospace" }}>Cod: {product.sku}</div>
            )}
            {settings.showQuantity && product.quantity != null && (
              <div style={{ fontSize: 9, opacity: 0.7 }}>Q.tà: {product.quantity}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---- PageEditDialog: click-to-edit each page ----
function PageEditDialog({
  editingPage, onClose, settings, update,
  uploadingAboutImg, uploadingContactImg,
  handleAboutImageUpload, handleContactImageUpload,
  removeAboutImage, removeContactImage,
  openCrop, updateCustomPage, handleCustomImageUpload, removeCustomImage,
}) {
  if (!editingPage) return null;

  const type = editingPage.type;
  const customPage = type === "custom"
    ? (settings.customPages || []).find((p) => p.id === editingPage.customId)
    : null;

  const titles = {
    cover: "Modifica copertina",
    index: "Modifica indice",
    about: "Modifica pagina 'Chi Siamo'",
    contact: "Modifica pagina 'Contatti'",
    custom: customPage ? `Modifica: ${customPage.title || "Pagina"}` : "Pagina",
  };

  return (
    <Dialog open={!!editingPage} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Pencil size={16} /> {titles[type]}</DialogTitle>
        </DialogHeader>

        {type === "cover" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Titolo</Label>
              <Input data-testid="dlg-cover-title" value={settings.coverTitle || ""} onChange={(e) => update("coverTitle", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Sottotitolo</Label>
              <Input data-testid="dlg-cover-subtitle" value={settings.coverSubtitle || ""} onChange={(e) => update("coverSubtitle", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Nome azienda</Label>
              <Input value={settings.companyName || ""} onChange={(e) => update("companyName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Stile copertina</Label>
              <Select value={settings.coverStyle || "text"} onValueChange={(v) => update("coverStyle", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Solo testo</SelectItem>
                  <SelectItem value="image">Immagine a tutta pagina</SelectItem>
                  <SelectItem value="hybrid">Immagine + testo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {settings.coverImagePath && (
              <div className="flex items-center gap-2 p-2 border rounded-md">
                <img src={`${API}/files/${settings.coverImagePath}`} alt="cover" className="w-16 h-16 object-cover rounded" />
                <div className="flex-1 text-xs text-zinc-600 truncate">Immagine copertina caricata</div>
                <Button
                  data-testid="dlg-crop-cover"
                  size="sm" variant="outline"
                  onClick={() => openCrop(settings.coverImagePath, (p) => update("coverImagePath", p))}
                >
                  <CropIcon size={12} className="mr-1" /> Ritaglia
                </Button>
              </div>
            )}
          </div>
        )}

        {type === "index" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Titolo dell'indice</Label>
              <Input data-testid="dlg-index-title" value={settings.indexTitle || ""} onChange={(e) => update("indexTitle", e.target.value)} />
            </div>
            <p className="text-xs text-zinc-500">L'elenco viene generato automaticamente in base alle sezioni attive e ai prodotti.</p>
          </div>
        )}

        {type === "about" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Titolo</Label>
              <Input data-testid="dlg-about-title" value={settings.aboutTitle || ""} onChange={(e) => update("aboutTitle", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrizione</Label>
              <Textarea data-testid="dlg-about-description" rows={5} value={settings.aboutDescription || ""} onChange={(e) => update("aboutDescription", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Immagini</Label>
              <div className="flex flex-wrap gap-2">
                {(settings.aboutImages || []).map((path) => (
                  <div key={path} className="relative group">
                    <img src={`${API}/files/${path}`} alt="about" className="w-16 h-16 object-cover rounded border border-zinc-200" />
                    <button
                      type="button"
                      onClick={() => openCrop(path, (newPath) => update("aboutImages", (settings.aboutImages || []).map((p) => (p === path ? newPath : p))))}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity"
                      title="Ritaglia"
                    >
                      <CropIcon size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAboutImage(path)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] hover:bg-red-700"
                    >×</button>
                  </div>
                ))}
                <label className="cursor-pointer">
                  <div className="w-16 h-16 border border-dashed border-zinc-300 rounded-md flex items-center justify-center hover:border-[#0047AB]">
                    <Plus size={16} className="text-zinc-400" />
                  </div>
                  <input type="file" accept="image/*" onChange={handleAboutImageUpload} className="hidden" />
                </label>
              </div>
              {uploadingAboutImg && <div className="text-xs text-zinc-500">Caricamento…</div>}
            </div>
          </div>
        )}

        {type === "contact" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Titolo</Label>
              <Input data-testid="dlg-contact-title" value={settings.contactTitle || ""} onChange={(e) => update("contactTitle", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrizione</Label>
              <Textarea rows={3} value={settings.contactDescription || ""} onChange={(e) => update("contactDescription", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Email</Label><Input value={settings.contactEmail || ""} onChange={(e) => update("contactEmail", e.target.value)} /></div>
              <div><Label>Telefono</Label><Input value={settings.contactPhone || ""} onChange={(e) => update("contactPhone", e.target.value)} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Indirizzo</Label>
              <Textarea rows={2} value={settings.contactAddress || ""} onChange={(e) => update("contactAddress", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Immagini</Label>
              <div className="flex flex-wrap gap-2">
                {(settings.contactImages || []).map((path) => (
                  <div key={path} className="relative group">
                    <img src={`${API}/files/${path}`} alt="contact" className="w-16 h-16 object-cover rounded border border-zinc-200" />
                    <button
                      type="button"
                      onClick={() => openCrop(path, (newPath) => update("contactImages", (settings.contactImages || []).map((p) => (p === path ? newPath : p))))}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity"
                    >
                      <CropIcon size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeContactImage(path)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] hover:bg-red-700"
                    >×</button>
                  </div>
                ))}
                <label className="cursor-pointer">
                  <div className="w-16 h-16 border border-dashed border-zinc-300 rounded-md flex items-center justify-center hover:border-[#0047AB]">
                    <Plus size={16} className="text-zinc-400" />
                  </div>
                  <input type="file" accept="image/*" onChange={handleContactImageUpload} className="hidden" />
                </label>
              </div>
              {uploadingContactImg && <div className="text-xs text-zinc-500">Caricamento…</div>}
            </div>
          </div>
        )}

        {type === "custom" && customPage && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Titolo</Label>
              <Input
                data-testid="dlg-custom-title"
                value={customPage.title || ""}
                onChange={(e) => updateCustomPage(customPage.id, { title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrizione</Label>
              <Textarea
                data-testid="dlg-custom-description"
                rows={5}
                value={customPage.description || ""}
                onChange={(e) => updateCustomPage(customPage.id, { description: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Immagini</Label>
              <div className="flex flex-wrap gap-2">
                {(customPage.images || []).map((path) => (
                  <div key={path} className="relative group">
                    <img src={`${API}/files/${path}`} alt="custom" className="w-16 h-16 object-cover rounded border border-zinc-200" />
                    <button
                      type="button"
                      onClick={() => openCrop(path, (newPath) => updateCustomPage(customPage.id, { images: customPage.images.map((p) => (p === path ? newPath : p)) }))}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity"
                    >
                      <CropIcon size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCustomImage(customPage.id, path)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] hover:bg-red-700"
                    >×</button>
                  </div>
                ))}
                <label className="cursor-pointer">
                  <div className="w-16 h-16 border border-dashed border-zinc-300 rounded-md flex items-center justify-center hover:border-[#0047AB]">
                    <Plus size={16} className="text-zinc-400" />
                  </div>
                  <input type="file" accept="image/*" onChange={(e) => handleCustomImageUpload(customPage.id, e)} className="hidden" />
                </label>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button data-testid="dlg-close" onClick={onClose} className="bg-[#0047AB] hover:bg-[#003380]">Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
