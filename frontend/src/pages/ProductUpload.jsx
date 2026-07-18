import React, { useState } from "react";
import { toast } from "sonner";
import api, { formatApiErrorDetail, API } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Plus, X, ImageIcon, Crop as CropIcon } from "lucide-react";
import ImageCropDialog from "@/components/ImageCropDialog";

const CATEGORIE = ["Abbigliamento", "Calzature", "Accessori", "Casa", "Bellezza", "Altro"];

export default function ProductUpload() {
  const [form, setForm] = useState({
    name: "",
    description: "",
    product_type: "",
    category: "",
    subcategory: "",
    price: "",
    discount: "",
    sku: "",
    quantity: "",
    price_label: "",
    vat_rate: "",
  });
  const [colors, setColors] = useState([]);
  const [colorInput, setColorInput] = useState("");
  const [sizes, setSizes] = useState([]);
  const [sizeInput, setSizeInput] = useState("");
  const [imagePath, setImagePath] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const addTag = (list, setList, input, setInput) => {
    const v = input.trim();
    if (v && !list.includes(v)) setList([...list, v]);
    setInput("");
  };

  const removeTag = (list, setList, v) => setList(list.filter((x) => x !== v));

  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setImagePath(data.path);
      setImagePreview(URL.createObjectURL(file));
      toast.success("Immagine caricata");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Il nome è obbligatorio");
    setSaving(true);
    try {
      await api.post("/products", {
        ...form,
        price: parseFloat(form.price) || 0,
        discount: parseFloat(form.discount) || 0,
        quantity: form.quantity === "" ? null : parseInt(form.quantity, 10),
        vat_rate: form.price_label === "plus" && form.vat_rate !== "" ? parseFloat(form.vat_rate) : null,
        colors,
        sizes,
        image_path: imagePath,
      });
      toast.success("Prodotto salvato");
      // reset
      setForm({ name: "", description: "", product_type: "", category: "", subcategory: "", price: "", discount: "", sku: "", quantity: "", price_label: "", vat_rate: "" });
      setColors([]); setSizes([]); setImagePath(null); setImagePreview(null);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl tracking-tight" data-testid="page-title">Carica prodotto</h1>
        <p className="text-sm text-zinc-500 mt-1">Aggiungi un nuovo prodotto al tuo inventario.</p>
      </div>

      <form onSubmit={submit} className="grid lg:grid-cols-3 gap-6" data-testid="product-upload-form">
        {/* Image */}
        <div className="lg:col-span-1">
          <div className="border border-zinc-200 bg-white rounded-lg p-4">
            <Label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3 block">Immagine</Label>
            <label className="block aspect-square border-2 border-dashed border-zinc-300 rounded-md hover:border-[#0047AB] transition-colors cursor-pointer overflow-hidden bg-zinc-50">
              {imagePreview || imagePath ? (
                <img
                  src={imagePreview || `${API}/files/${imagePath}`}
                  alt="preview"
                  className="w-full h-full object-cover"
                  data-testid="image-preview"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400">
                  <ImageIcon size={40} />
                  <span className="text-sm mt-2">{uploading ? "Caricamento…" : "Clicca per caricare"}</span>
                </div>
              )}
              <input type="file" accept="image/*" onChange={handleImage} className="hidden" data-testid="image-upload-input" />
            </label>
            {imagePath && (
              <Button
                data-testid="crop-image-btn"
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCropOpen(true)}
                className="w-full mt-3"
              >
                <CropIcon size={14} className="mr-2" /> Ritaglia immagine
              </Button>
            )}
          </div>
        </div>

        {/* Fields */}
        <div className="lg:col-span-2 space-y-6">
          <div className="border border-zinc-200 bg-white rounded-lg p-6 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label>Nome prodotto *</Label>
                <Input data-testid="input-name" value={form.name} onChange={(e) => update("name", e.target.value)} required />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Descrizione</Label>
                <Textarea data-testid="input-description" rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Tipo prodotto</Label>
                <Input data-testid="input-type" value={form.product_type} onChange={(e) => update("product_type", e.target.value)} placeholder="es. T-shirt" />
              </div>
              <div className="space-y-2">
                <Label>SKU / Codice</Label>
                <Input data-testid="input-sku" value={form.sku} onChange={(e) => update("sku", e.target.value)} placeholder="TS-001" />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Input list="cat-list" data-testid="input-category" value={form.category} onChange={(e) => update("category", e.target.value)} placeholder="Abbigliamento" />
                <datalist id="cat-list">{CATEGORIE.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div className="space-y-2">
                <Label>Sottocategoria</Label>
                <Input data-testid="input-subcategory" value={form.subcategory} onChange={(e) => update("subcategory", e.target.value)} placeholder="Magliette" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Quantità in stock</Label>
                <Input data-testid="input-quantity" type="number" step="1" min="0" value={form.quantity} onChange={(e) => update("quantity", e.target.value)} placeholder="es. 25" />
              </div>
            </div>
          </div>

          <div className="border border-zinc-200 bg-white rounded-lg p-6 space-y-4">
            <h3 className="font-display text-lg">Varianti</h3>

            {/* Colors */}
            <div className="space-y-2">
              <Label>Colori disponibili</Label>
              <div className="flex gap-2">
                <Input data-testid="input-color" value={colorInput} onChange={(e) => setColorInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(colors, setColors, colorInput, setColorInput); } }}
                  placeholder="Nero, Bianco, Rosso…" />
                <Button data-testid="add-color" type="button" variant="outline" onClick={() => addTag(colors, setColors, colorInput, setColorInput)}><Plus size={16} /></Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {colors.map((c) => (
                  <span key={c} data-testid={`color-tag-${c}`} className="inline-flex items-center gap-1 px-2.5 py-1 bg-zinc-100 rounded-full text-sm">
                    {c}
                    <button type="button" onClick={() => removeTag(colors, setColors, c)} className="hover:text-red-600"><X size={12} /></button>
                  </span>
                ))}
              </div>
            </div>

            {/* Sizes */}
            <div className="space-y-2">
              <Label>Taglie disponibili</Label>
              <div className="flex gap-2">
                <Input data-testid="input-size" value={sizeInput} onChange={(e) => setSizeInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(sizes, setSizes, sizeInput, setSizeInput); } }}
                  placeholder="S, M, L, XL…" />
                <Button data-testid="add-size" type="button" variant="outline" onClick={() => addTag(sizes, setSizes, sizeInput, setSizeInput)}><Plus size={16} /></Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => (
                  <span key={s} data-testid={`size-tag-${s}`} className="inline-flex items-center gap-1 px-2.5 py-1 bg-zinc-100 rounded-full text-sm">
                    {s}
                    <button type="button" onClick={() => removeTag(sizes, setSizes, s)} className="hover:text-red-600"><X size={12} /></button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="border border-zinc-200 bg-white rounded-lg p-6 space-y-4">
            <h3 className="font-display text-lg">Prezzo</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prezzo (€)</Label>
                <Input data-testid="input-price" type="number" step="0.01" value={form.price} onChange={(e) => update("price", e.target.value)} placeholder="19.90" />
              </div>
              <div className="space-y-2">
                <Label>Sconto (%)</Label>
                <Input data-testid="input-discount" type="number" step="1" min="0" max="100" value={form.discount} onChange={(e) => update("discount", e.target.value)} placeholder="0" />
              </div>
            </div>

            <div className="pt-2 border-t space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-500">Dicitura IVA (mostrata affianco al prezzo in catalogo)</Label>
              <div className="flex flex-wrap gap-2">
                <label
                  data-testid="label-vat-none"
                  className={`flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer text-sm transition-colors ${form.price_label === "" ? "border-[#0047AB] bg-blue-50 text-[#0047AB]" : "border-zinc-200 hover:border-zinc-400"}`}
                >
                  <input
                    type="radio"
                    name="price_label"
                    checked={form.price_label === ""}
                    onChange={() => update("price_label", "")}
                    className="accent-[#0047AB]"
                  />
                  Nessuna
                </label>
                <label
                  data-testid="label-vat-included"
                  className={`flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer text-sm transition-colors ${form.price_label === "included" ? "border-[#0047AB] bg-blue-50 text-[#0047AB]" : "border-zinc-200 hover:border-zinc-400"}`}
                >
                  <input
                    type="checkbox"
                    data-testid="checkbox-vat-included"
                    checked={form.price_label === "included"}
                    onChange={(e) => update("price_label", e.target.checked ? "included" : "")}
                    className="accent-[#0047AB]"
                  />
                  iva inclusa
                </label>
                <label
                  data-testid="label-vat-plus"
                  className={`flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer text-sm transition-colors ${form.price_label === "plus" ? "border-[#0047AB] bg-blue-50 text-[#0047AB]" : "border-zinc-200 hover:border-zinc-400"}`}
                >
                  <input
                    type="checkbox"
                    data-testid="checkbox-vat-plus"
                    checked={form.price_label === "plus"}
                    onChange={(e) => update("price_label", e.target.checked ? "plus" : "")}
                    className="accent-[#0047AB]"
                  />
                  + iva
                </label>
              </div>

              {form.price_label === "plus" && (
                <div className="pt-2 flex items-center gap-3" data-testid="vat-rate-row">
                  <Label className="text-xs shrink-0">Aliquota IVA (%)</Label>
                  <Input
                    data-testid="input-product-vat-rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={form.vat_rate}
                    onChange={(e) => update("vat_rate", e.target.value)}
                    placeholder="es. 22"
                    className="max-w-32"
                  />
                  <span className="text-xs text-zinc-500">Sarà mostrata come "+ iva ({form.vat_rate || "%"}%)"</span>
                </div>
              )}
            </div>
          </div>

          <Button data-testid="submit-product" type="submit" className="w-full bg-[#0047AB] hover:bg-[#003380]" disabled={saving}>
            <Upload size={16} className="mr-2" />
            {saving ? "Salvataggio…" : "Salva prodotto"}
          </Button>
        </div>
      </form>

      {cropOpen && imagePath && (
        <ImageCropDialog
          open={cropOpen}
          imagePath={imagePath}
          onClose={() => setCropOpen(false)}
          onCropped={(newPath) => {
            setImagePath(newPath);
            setImagePreview(null); // will fall back to server URL if no preview
          }}
        />
      )}
    </div>
  );
}
