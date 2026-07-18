import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Trash2, FileText, Calendar, Package, Pencil, Copy, Share2, Link as LinkIcon, EyeOff, Check } from "lucide-react";

export default function CatalogHistory() {
  const navigate = useNavigate();
  const [catalogs, setCatalogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(null); // catalog being shared (modal)
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/catalogs");
      setCatalogs(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    if (!confirm("Eliminare questo catalogo?")) return;
    try {
      await api.delete(`/catalogs/${id}`);
      setCatalogs((prev) => prev.filter((c) => c.id !== id));
      toast.success("Catalogo eliminato");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const duplicate = async (id) => {
    try {
      const { data } = await api.post(`/catalogs/${id}/duplicate`);
      setCatalogs((prev) => [data, ...prev]);
      toast.success("Catalogo duplicato");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const openShare = (catalog) => {
    setSharing(catalog);
    setCopied(false);
  };

  const enableShare = async () => {
    try {
      const { data } = await api.post(`/catalogs/${sharing.id}/share`);
      const updated = { ...sharing, is_public: true, share_token: data.share_token };
      setSharing(updated);
      setCatalogs((prev) => prev.map((c) => (c.id === updated.id ? { ...c, is_public: true, share_token: data.share_token } : c)));
      toast.success("Catalogo reso pubblico");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const disableShare = async () => {
    try {
      await api.delete(`/catalogs/${sharing.id}/share`);
      const updated = { ...sharing, is_public: false };
      setSharing(updated);
      setCatalogs((prev) => prev.map((c) => (c.id === updated.id ? { ...c, is_public: false } : c)));
      toast.success("Condivisione disattivata");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const shareUrl = sharing?.share_token
    ? `${window.location.origin}/c/${sharing.share_token}`
    : "";

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copiato");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossibile copiare, seleziona manualmente");
    }
  };

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl tracking-tight" data-testid="page-title">Cronologia cataloghi</h1>
        <p className="text-sm text-zinc-500 mt-1">Tutti i cataloghi che hai generato.</p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-zinc-500">Caricamento…</div>
      ) : catalogs.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-zinc-200 rounded-lg bg-white">
          <FileText size={40} className="mx-auto text-zinc-300" />
          <p className="mt-4 text-zinc-500">Nessun catalogo salvato</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="catalog-history-grid">
          {catalogs.map((c) => (
            <div key={c.id} data-testid={`catalog-item-${c.id}`} className="border border-zinc-200 bg-white rounded-lg p-5 hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className="w-full aspect-video mb-4 rounded flex items-center justify-center border border-zinc-100"
                style={{ background: c.settings?.background || "#ffffff", color: c.settings?.textColor || "#0A0A0A", fontFamily: c.settings?.font || "sans-serif" }}>
                <div className="text-center px-3">
                  <div className="w-12 h-1 mx-auto mb-2" style={{ background: c.settings?.accentColor || "#0047AB" }} />
                  <div className="font-display text-lg leading-tight truncate">{c.settings?.coverTitle || c.name}</div>
                  <div className="text-xs opacity-60 mt-1">{c.settings?.coverSubtitle || ""}</div>
                </div>
              </div>

              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold truncate">{c.name}</h3>
                  <div className="text-xs text-zinc-500 mt-1 flex items-center gap-3">
                    <span className="inline-flex items-center gap-1"><Calendar size={12} />{new Date(c.created_at).toLocaleDateString()}</span>
                    <span className="inline-flex items-center gap-1"><Package size={12} />{c.product_ids?.length || 0}</span>
                  </div>
                </div>
                {c.is_public && (
                  <span data-testid={`public-badge-${c.id}`} className="inline-flex items-center gap-1 shrink-0 text-[10px] font-medium px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full">
                    <LinkIcon size={10} /> Pubblico
                  </span>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  data-testid={`edit-catalog-${c.id}`}
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/app/catalog/edit/${c.id}`)}
                  className="text-[#0047AB] hover:bg-blue-50"
                >
                  <Pencil size={14} className="mr-1" /> Modifica
                </Button>
                <Button
                  data-testid={`duplicate-catalog-${c.id}`}
                  variant="outline"
                  size="sm"
                  onClick={() => duplicate(c.id)}
                >
                  <Copy size={14} className="mr-1" /> Duplica
                </Button>
                <Button
                  data-testid={`share-catalog-${c.id}`}
                  variant="outline"
                  size="sm"
                  onClick={() => openShare(c)}
                >
                  <Share2 size={14} className="mr-1" /> Condividi
                </Button>
                <Button
                  data-testid={`delete-catalog-${c.id}`}
                  variant="outline"
                  size="sm"
                  onClick={() => remove(c.id)}
                  className="text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} className="mr-1" /> Elimina
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Share dialog */}
      <Dialog open={!!sharing} onOpenChange={(o) => !o && setSharing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Share2 size={18} /> Condividi catalogo</DialogTitle>
            <DialogDescription>
              {sharing?.is_public
                ? "Chiunque abbia il link può visualizzare questo catalogo."
                : "Genera un link pubblico per condividere il catalogo con chiunque, senza richiedere login."}
            </DialogDescription>
          </DialogHeader>

          {sharing?.is_public ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wider text-zinc-500">Link pubblico</div>
                <div className="flex gap-2">
                  <Input data-testid="share-link" value={shareUrl} readOnly className="font-mono text-xs" />
                  <Button data-testid="copy-share-link" onClick={copyLink} variant="outline">
                    {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                  </Button>
                </div>
                <a
                  data-testid="open-share-link"
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#0047AB] hover:underline inline-flex items-center gap-1"
                >
                  <LinkIcon size={11} /> Apri anteprima pubblica
                </a>
              </div>
              <Button
                data-testid="disable-share"
                variant="outline"
                onClick={disableShare}
                className="w-full text-red-600 hover:bg-red-50"
              >
                <EyeOff size={14} className="mr-2" /> Disattiva condivisione
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Button
                data-testid="enable-share"
                onClick={enableShare}
                className="w-full bg-[#0047AB] hover:bg-[#003380]"
              >
                <LinkIcon size={14} className="mr-2" /> Genera link pubblico
              </Button>
              <p className="text-xs text-zinc-500 text-center">
                Puoi disattivare la condivisione in qualsiasi momento.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
