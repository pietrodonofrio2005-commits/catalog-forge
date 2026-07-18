import React, { useRef, useState } from "react";
import ReactCrop, { centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import api, { API } from "@/lib/api";
import { Crop as CropIcon } from "lucide-react";

/**
 * ImageCropDialog
 * Props:
 *   - open: bool
 *   - imagePath: current storage path (loaded via API)
 *   - onClose: () => void
 *   - onCropped: (newPath) => void   -- called with the storage path of the cropped image
 *   - aspect: optional aspect ratio (e.g., 1 for square, 4/3, 16/9); undefined for free
 */
export default function ImageCropDialog({ open, imagePath, onClose, onCropped, aspect }) {
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState(null);
  const [saving, setSaving] = useState(false);
  const imgRef = useRef(null);

  const onImageLoad = (e) => {
    const { width, height } = e.currentTarget;
    if (aspect) {
      const c = centerCrop(
        makeAspectCrop({ unit: "%", width: 80 }, aspect, width, height),
        width, height
      );
      setCrop(c);
    } else {
      setCrop({ unit: "%", x: 10, y: 10, width: 80, height: 80 });
    }
  };

  const applyCrop = async () => {
    if (!completedCrop || !imgRef.current) {
      toast.error("Seleziona un'area da ritagliare");
      return;
    }
    setSaving(true);
    try {
      const img = imgRef.current;
      const scaleX = img.naturalWidth / img.width;
      const scaleY = img.naturalHeight / img.height;
      const cropX = completedCrop.x * scaleX;
      const cropY = completedCrop.y * scaleY;
      const cropW = completedCrop.width * scaleX;
      const cropH = completedCrop.height * scaleY;

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(cropW);
      canvas.height = Math.round(cropH);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      const fd = new FormData();
      fd.append("file", blob, "cropped.jpg");
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onCropped(data.path);
      toast.success("Immagine ritagliata");
      onClose();
    } catch (err) {
      toast.error("Errore durante il ritaglio: " + (err.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const src = imagePath ? `${API}/files/${imagePath}` : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CropIcon size={18} /> Ritaglia immagine</DialogTitle>
        </DialogHeader>

        {src && (
          <div className="flex justify-center bg-zinc-100 rounded-md p-2 max-h-[60vh] overflow-auto">
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={aspect}
              keepSelection
            >
              <img
                ref={imgRef}
                src={src}
                alt="crop-source"
                crossOrigin="anonymous"
                onLoad={onImageLoad}
                style={{ maxHeight: "50vh", display: "block" }}
              />
            </ReactCrop>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button data-testid="apply-crop" onClick={applyCrop} disabled={saving} className="bg-[#0047AB] hover:bg-[#003380]">
            {saving ? "Ritaglio…" : "Applica ritaglio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
