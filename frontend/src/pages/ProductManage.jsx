import React, { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import api, { formatApiErrorDetail, API } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Search, Trash2, Pencil, Filter, PackageOpen, ImagePlus, X, Crop as CropIcon } from "lucide-react";
import ImageCropDialog from "@/components/ImageCropDialog";

const buildImageUrl = (path) => path ? `${API}/files/${path}` : null;

export default function ProductManage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState({});
  const [selectedCat, setSelectedCat] = useState("");
  const [selectedSub, setSelectedSub] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // product being edited
  const [uploadingEditImage, setUploadingEditImage] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);

  const load = async () => {
    try {
      const [pRes, cRes] = await Promise.all([
        api.get("/products"),
        api.get("/products/categories"),
      ]);
      setProducts(pRes.data);
      setCategories(cRes.data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (selectedCat && p.category !== selectedCat) return false;
      if (selectedSub && p.subcategory !== selectedSub) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [products, selectedCat, selectedSub, search]);

  const remove = async (id) => {
    if (!confirm("Sei sicuro di voler eliminare questo prodotto?")) return;
    try {
      await api.delete(`/products/${id}`);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      toast.success("Prodotto eliminato");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const saveEdit = async () => {
    try {
      const { id, ...body } = editing;
      body.price = parseFloat(body.price) || 0;
      body.discount = parseFloat(body.discount) || 0;
      const { data } = await api.put(`/products/${id}`, body);
      setProducts((prev) => prev.map((p) => (p.id === id ? data : p)));
      setEditing(null);
      toast.success("Prodotto aggiornato");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const handleEditImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    setUploadingEditImage(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setEditing((prev) => ({ ...prev, image_path: data.path }));
      toast.success("Immagine caricata");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setUploadingEditImage(false);
      // Reset input so same file can be re-selected
      if (e.target) e.target.value = "";
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Filter sidebar */}
      <aside className="w-64 shrink-0 border-r border-zinc-200 bg-white p-4 hidden md:block">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={16} />
          <h3 className="font-display font-semibold">Filtri</h3>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-zinc-500">Ricerca</Label>
            <div className="relative mt-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <Input data-testid="search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca prodotto…" className="pl-8" />
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider text-zinc-500">Categorie</Label>
            <div className="mt-2 space-y-1">
              <button
                data-testid="filter-all"
                onClick={() => { setSelectedCat(""); setSelectedSub(""); }}
                className={`w-full text-left px-2.5 py-1.5 rounded text-sm transition-colors ${!selectedCat ? "bg-zinc-900 text-white" : "hover:bg-zinc-100"}`}
              >
                Tutte ({products.length})
              </button>
              {Object.keys(categories).map((cat) => (
                <div key={cat}>
                  <button
                    data-testid={`filter-cat-${cat}`}
                    onClick={() => { setSelectedCat(cat); setSelectedSub(""); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-sm transition-colors ${selectedCat === cat ? "bg-zinc-900 text-white" : "hover:bg-zinc-100"}`}
                  >
                    {cat}
                  </button>
                  {selectedCat === cat && categories[cat].length > 0 && (
                    <div className="ml-4 mt-1 space-y-1">
                      {categories[cat].map((sub) => (
                        <button
                          key={sub}
                          data-testid={`filter-sub-${sub}`}
                          onClick={() => setSelectedSub(selectedSub === sub ? "" : sub)}
                          className={`w-full text-left px-2.5 py-1 rounded text-xs transition-colors ${selectedSub === sub ? "bg-[#0047AB] text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
                        >
                          {sub}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Grid */}
      <div className="flex-1 p-6 lg:p-8">
        <div className="mb-6">
          <h1 className="font-display text-3xl tracking-tight" data-testid="page-title">Gestisci prodotti</h1>
          <p className="text-sm text-zinc-500 mt-1">{filtered.length} prodotti {selectedCat && `in ${selectedCat}`}</p>
        </div>

        {loading ? (
          <div className="text-center py-16 text-zinc-500">Caricamento…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-zinc-200 rounded-lg">
            <PackageOpen size={40} className="mx-auto text-zinc-300" />
            <p className="mt-4 text-zinc-500">Nessun prodotto trovato</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="products-grid">
            {filtered.map((p) => (
              <div key={p.id} data-testid={`product-card-${p.id}`} className="border border-zinc-200 bg-white rounded-lg overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all">
                <div className="aspect-square bg-zinc-100 overflow-hidden">
                  {p.image_path ? (
                    <img src={buildImageUrl(p.image_path)} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-300"><PackageOpen size={48} /></div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{p.name}</h3>
                      <p className="text-xs text-zinc-500 truncate">{p.category}{p.subcategory && ` • ${p.subcategory}`}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-semibold">€{Number(p.price).toFixed(2)}</div>
                      {p.discount > 0 && <div className="text-xs text-red-600">-{p.discount}%</div>}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button data-testid={`edit-${p.id}`} size="sm" variant="outline" className="flex-1" onClick={() => setEditing({ ...p })}>
                      <Pencil size={14} className="mr-1" /> Modifica
                    </Button>
                    <Button data-testid={`delete-${p.id}`} size="sm" variant="outline" onClick={() => remove(p.id)} className="text-red-600 hover:bg-red-50">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Modifica prodotto</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              {/* Image editor */}
              <div className="space-y-2">
                <Label>Immagine</Label>
                <div className="flex items-start gap-3">
                  <div className="w-24 h-24 rounded-md border border-zinc-200 bg-zinc-50 overflow-hidden shrink-0 flex items-center justify-center">
                    {editing.image_path ? (
                      <img
                        data-testid="edit-image-preview"
                        src={buildImageUrl(editing.image_path)}
                        alt="preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <PackageOpen size={28} className="text-zinc-300" />
                    )}
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    <label className="cursor-pointer">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-zinc-300 rounded-md text-sm hover:border-[#0047AB] transition-colors">
                        <ImagePlus size={14} />
                        {uploadingEditImage
                          ? "Caricamento…"
                          : editing.image_path ? "Cambia immagine" : "Aggiungi immagine"}
                      </div>
                      <input
                        data-testid="edit-image-upload"
                        type="file"
                        accept="image/*"
                        onChange={handleEditImageUpload}
                        className="hidden"
                      />
                    </label>
                    {editing.image_path && (
                      <>
                        <button
                          data-testid="edit-image-crop"
                          type="button"
                          onClick={() => setCropOpen(true)}
                          className="inline-flex items-center gap-1 text-xs text-[#0047AB] hover:underline w-fit"
                        >
                          <CropIcon size={12} /> Ritaglia immagine
                        </button>
                        <button
                          data-testid="edit-image-remove"
                          type="button"
                          onClick={() => setEditing({ ...editing, image_path: null })}
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline w-fit"
                        >
                          <X size={12} /> Rimuovi immagine
                        </button>
                      </>
                    )}
                    <p className="text-[11px] text-zinc-500">
                      Utile per prodotti importati da Excel senza immagine.
                    </p>
                  </div>
                </div>
              </div>

              <div><Label>Nome</Label><Input data-testid="edit-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>Descrizione</Label><Textarea rows={2} value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Categoria</Label><Input value={editing.category || ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} /></div>
                <div><Label>Sottocategoria</Label><Input value={editing.subcategory || ""} onChange={(e) => setEditing({ ...editing, subcategory: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Prezzo</Label><Input type="number" step="0.01" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} /></div>
                <div><Label>Sconto (%)</Label><Input type="number" value={editing.discount || 0} onChange={(e) => setEditing({ ...editing, discount: e.target.value })} /></div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-zinc-500">Dicitura IVA (affianco al prezzo in catalogo)</Label>
                <div className="flex flex-wrap gap-2">
                  <label
                    className={`flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer text-sm transition-colors ${(!editing.price_label) ? "border-[#0047AB] bg-blue-50 text-[#0047AB]" : "border-zinc-200 hover:border-zinc-400"}`}
                  >
                    <input
                      type="radio"
                      name="edit_price_label"
                      checked={!editing.price_label}
                      onChange={() => setEditing({ ...editing, price_label: "" })}
                      className="accent-[#0047AB]"
                    />
                    Nessuna
                  </label>
                  <label
                    className={`flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer text-sm transition-colors ${editing.price_label === "included" ? "border-[#0047AB] bg-blue-50 text-[#0047AB]" : "border-zinc-200 hover:border-zinc-400"}`}
                  >
                    <input
                      type="checkbox"
                      data-testid="edit-vat-included"
                      checked={editing.price_label === "included"}
                      onChange={(e) => setEditing({ ...editing, price_label: e.target.checked ? "included" : "" })}
                      className="accent-[#0047AB]"
                    />
                    iva inclusa
                  </label>
                  <label
                    className={`flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer text-sm transition-colors ${editing.price_label === "plus" ? "border-[#0047AB] bg-blue-50 text-[#0047AB]" : "border-zinc-200 hover:border-zinc-400"}`}
                  >
                    <input
                      type="checkbox"
                      data-testid="edit-vat-plus"
                      checked={editing.price_label === "plus"}
                      onChange={(e) => setEditing({ ...editing, price_label: e.target.checked ? "plus" : "", vat_rate: e.target.checked ? editing.vat_rate : null })}
                      className="accent-[#0047AB]"
                    />
                    + iva
                  </label>
                </div>

                {editing.price_label === "plus" && (
                  <div className="pt-2 flex items-center gap-3" data-testid="edit-vat-rate-row">
                    <Label className="text-xs shrink-0">Aliquota IVA (%)</Label>
                    <Input
                      data-testid="edit-product-vat-rate"
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={editing.vat_rate ?? ""}
                      onChange={(e) => setEditing({ ...editing, vat_rate: e.target.value === "" ? null : parseFloat(e.target.value) })}
                      placeholder="es. 22"
                      className="max-w-32"
                    />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>SKU / Codice</Label><Input data-testid="edit-sku" value={editing.sku || ""} onChange={(e) => setEditing({ ...editing, sku: e.target.value })} /></div>
                <div><Label>Quantità</Label><Input data-testid="edit-quantity" type="number" min="0" value={editing.quantity ?? ""} onChange={(e) => setEditing({ ...editing, quantity: e.target.value === "" ? null : parseInt(e.target.value, 10) })} /></div>
              </div>
              <div><Label>Colori (virgola separata)</Label><Input value={(editing.colors || []).join(", ")} onChange={(e) => setEditing({ ...editing, colors: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></div>
              <div><Label>Taglie (virgola separata)</Label><Input value={(editing.sizes || []).join(", ")} onChange={(e) => setEditing({ ...editing, sizes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Annulla</Button>
            <Button data-testid="save-edit" onClick={saveEdit} className="bg-[#0047AB] hover:bg-[#003380]">Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {cropOpen && editing?.image_path && (
        <ImageCropDialog
          open={cropOpen}
          imagePath={editing.image_path}
          onClose={() => setCropOpen(false)}
          onCropped={(newPath) => setEditing((prev) => ({ ...prev, image_path: newPath }))}
        />
      )}
    </div>
  );
}
