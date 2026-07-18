import React, { useState, useRef } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet, Upload, Download, CheckCircle2, AlertCircle, X } from "lucide-react";

/**
 * Colonne accettate (case-insensitive, spazi/underscore ignorati):
 *  - name / nome
 *  - description / descrizione
 *  - product_type / tipo
 *  - category / categoria
 *  - subcategory / sottocategoria
 *  - colors / colori           (separati da , ; |)
 *  - sizes / taglie            (separati da , ; |)
 *  - price / prezzo
 *  - discount / sconto
 *  - sku / codice
 */
const FIELD_MAP = {
  name: ["name", "nome", "prodotto", "product"],
  description: ["description", "descrizione", "descr"],
  product_type: ["type", "tipo", "product_type", "tipologia"],
  category: ["category", "categoria", "cat"],
  subcategory: ["subcategory", "sottocategoria", "sotto"],
  colors: ["colors", "colori", "color"],
  sizes: ["sizes", "taglie", "size", "taglia"],
  price: ["price", "prezzo", "costo"],
  discount: ["discount", "sconto", "%"],
  sku: ["sku", "codice", "code"],
  quantity: ["quantity", "quantita", "quantità", "qty", "stock", "giacenza"],
};

const normKey = (k) => String(k).toLowerCase().replace(/[\s_-]/g, "");

function findField(headerKey) {
  const norm = normKey(headerKey);
  for (const [field, aliases] of Object.entries(FIELD_MAP)) {
    if (aliases.some((a) => normKey(a) === norm)) return field;
  }
  return null;
}

function parseList(v) {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (v == null || v === "") return [];
  return String(v).split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
}

function parseNumber(v) {
  if (v == null || v === "") return 0;
  const s = String(v).replace(/[€$£\s]/g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function mapRow(row) {
  const out = {
    name: "", description: "", product_type: "", category: "", subcategory: "",
    colors: [], sizes: [], price: 0, discount: 0, sku: "", quantity: null,
  };
  for (const [key, val] of Object.entries(row)) {
    const field = findField(key);
    if (!field) continue;
    if (field === "colors" || field === "sizes") out[field] = parseList(val);
    else if (field === "price" || field === "discount") out[field] = parseNumber(val);
    else if (field === "quantity") {
      if (val === "" || val == null) out.quantity = null;
      else { const n = parseInt(String(val).replace(/[^0-9-]/g, ""), 10); out.quantity = isNaN(n) ? null : n; }
    }
    else out[field] = val == null ? "" : String(val).trim();
  }
  return out;
}

export default function ProductsImport() {
  const [rows, setRows] = useState([]);
  const [detectedCols, setDetectedCols] = useState([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      if (!json.length) {
        toast.error("Il file è vuoto");
        return;
      }
      const cols = Object.keys(json[0]);
      const mapped = cols.map((c) => ({ raw: c, field: findField(c) }));
      setDetectedCols(mapped);
      const parsed = json.map(mapRow).filter((r) => r.name && r.name.trim().length > 0);
      setRows(parsed);
      if (parsed.length === 0) {
        toast.error("Nessuna riga valida. Assicurati di avere una colonna 'name' o 'nome'.");
      } else {
        toast.success(`${parsed.length} prodotti pronti per l'import`);
      }
    } catch (err) {
      toast.error("Errore lettura file: " + err.message);
    }
  };

  const doImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    try {
      const { data } = await api.post("/products/bulk", rows);
      toast.success(`${data.inserted} prodotti importati con successo!`);
      setRows([]);
      setDetectedCols([]);
      setFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setImporting(false);
    }
  };

  const clear = () => {
    setRows([]);
    setDetectedCols([]);
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const downloadTemplate = () => {
    const template = [
      { name: "T-Shirt Basic", description: "Cotone 100%", product_type: "T-shirt", category: "Abbigliamento", subcategory: "Magliette", colors: "Bianco, Nero, Blu", sizes: "S, M, L, XL", price: 19.90, discount: 10, sku: "TS-001" },
      { name: "Sneakers Runner", description: "Scarpe leggere per corsa", product_type: "Scarpe", category: "Calzature", subcategory: "Sneakers", colors: "Nero, Grigio", sizes: "40, 41, 42, 43", price: 79.00, discount: 0, sku: "SN-100" },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Prodotti");
    XLSX.writeFile(wb, "template-prodotti.xlsx");
  };

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl tracking-tight" data-testid="page-title">Importa da Excel / CSV</h1>
          <p className="text-sm text-zinc-500 mt-1">Carica in blocco decine di prodotti da un file .xlsx, .xls o .csv.</p>
        </div>
        <Button data-testid="download-template" variant="outline" onClick={downloadTemplate}>
          <Download size={14} className="mr-2" /> Scarica template
        </Button>
      </div>

      {rows.length === 0 ? (
        <label className="block border-2 border-dashed border-zinc-300 rounded-xl p-16 text-center cursor-pointer hover:border-[#0047AB] transition-colors bg-white">
          <input
            ref={fileInputRef}
            data-testid="import-file-input"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFile}
            className="hidden"
          />
          <FileSpreadsheet size={48} className="mx-auto text-zinc-400" />
          <div className="mt-4 font-display text-xl">Trascina o clicca per caricare</div>
          <div className="text-sm text-zinc-500 mt-1">Formati supportati: .xlsx .xls .csv</div>
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-[#0047AB] text-white rounded-md text-sm font-medium">
            <Upload size={14} /> Seleziona file
          </div>
        </label>
      ) : (
        <div className="space-y-6">
          {/* Detected columns */}
          <div className="bg-white border border-zinc-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm text-zinc-500">File</div>
                <div className="font-semibold" data-testid="file-name">{fileName}</div>
              </div>
              <Button variant="outline" size="sm" onClick={clear}><X size={14} className="mr-1" /> Ricomincia</Button>
            </div>

            <Label className="text-xs uppercase tracking-wider text-zinc-500 mb-2 block">Colonne rilevate</Label>
            <div className="flex flex-wrap gap-2">
              {detectedCols.map((c) => (
                <div key={c.raw} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${c.field ? "bg-green-50 text-green-700 border border-green-200" : "bg-zinc-100 text-zinc-500 border border-zinc-200"}`}>
                  {c.field ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                  <span className="font-mono">{c.raw}</span>
                  {c.field && <span className="opacity-60">→ {c.field}</span>}
                  {!c.field && <span className="opacity-60">ignorata</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-200 flex items-center justify-between">
              <div>
                <div className="font-semibold" data-testid="preview-count">{rows.length} prodotti pronti</div>
                <div className="text-xs text-zinc-500">Anteprima delle prime 10 righe</div>
              </div>
              <Button data-testid="do-import" onClick={doImport} disabled={importing} className="bg-[#0047AB] hover:bg-[#003380]">
                <Upload size={14} className="mr-2" /> {importing ? "Importazione…" : `Importa ${rows.length} prodotti`}
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 border-b border-zinc-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-zinc-500">Nome</th>
                    <th className="text-left px-3 py-2 font-medium text-zinc-500">Categoria</th>
                    <th className="text-left px-3 py-2 font-medium text-zinc-500">Sottocat.</th>
                    <th className="text-left px-3 py-2 font-medium text-zinc-500">Colori</th>
                    <th className="text-left px-3 py-2 font-medium text-zinc-500">Taglie</th>
                    <th className="text-right px-3 py-2 font-medium text-zinc-500">Prezzo</th>
                    <th className="text-right px-3 py-2 font-medium text-zinc-500">Sconto</th>
                  </tr>
                </thead>
                <tbody data-testid="preview-table">
                  {rows.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2 text-zinc-600">{r.category}</td>
                      <td className="px-3 py-2 text-zinc-600">{r.subcategory}</td>
                      <td className="px-3 py-2 text-zinc-600 truncate max-w-[140px]">{r.colors.join(", ")}</td>
                      <td className="px-3 py-2 text-zinc-600 truncate max-w-[140px]">{r.sizes.join(", ")}</td>
                      <td className="px-3 py-2 text-right font-mono">€{Number(r.price).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono text-red-600">{r.discount ? `-${r.discount}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 10 && (
                <div className="px-3 py-2 text-xs text-zinc-500 bg-zinc-50 border-t">+ altre {rows.length - 10} righe non mostrate</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Help */}
      <div className="mt-8 bg-blue-50 border border-blue-100 rounded-lg p-5">
        <h3 className="font-display text-lg mb-2">Come preparare il file</h3>
        <ul className="text-sm text-zinc-700 space-y-1.5">
          <li>• La prima riga deve contenere le intestazioni delle colonne.</li>
          <li>• Colonne accettate (italiano o inglese): <strong>nome/name</strong> (obbligatorio), descrizione, tipo, categoria, sottocategoria, colori, taglie, prezzo, sconto, sku.</li>
          <li>• Colori e taglie possono essere separati da virgola, punto e virgola o barra verticale (es. <code className="bg-white px-1 py-0.5 rounded">Rosso, Verde, Blu</code>).</li>
          <li>• Prezzi con simbolo <code className="bg-white px-1 py-0.5 rounded">€</code> o virgola decimale vengono normalizzati automaticamente.</li>
          <li>• Le immagini vanno aggiunte in seguito dalla pagina "Gestisci prodotti".</li>
        </ul>
      </div>
    </div>
  );
}
