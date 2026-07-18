import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatApiErrorDetail } from "@/lib/api";
import { toast } from "sonner";
import { Layers } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(name, email, password);
      toast.success("Account creato con successo");
      navigate("/app/products");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex relative bg-zinc-950 text-white p-12 flex-col justify-between overflow-hidden grain">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-[#0047AB] flex items-center justify-center">
            <Layers size={20} />
          </div>
          <span className="font-display text-xl tracking-tight">Catalog Forge</span>
        </div>
        <div>
          <h1 className="font-display text-5xl leading-tight tracking-tighter mb-4">
            Crea il tuo<br /><span className="text-[#8AB4FF]">catalogo</span> in 3 click.
          </h1>
          <p className="text-zinc-400 max-w-md">Registrati gratis. Nessuna carta richiesta.</p>
        </div>
        <div className="text-xs text-zinc-500">© {new Date().getFullYear()} Catalog Forge</div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <form onSubmit={submit} className="w-full max-w-md space-y-6" data-testid="register-form">
          <div>
            <h2 className="font-display text-3xl tracking-tight">Crea account</h2>
            <p className="text-sm text-zinc-500 mt-1">Inizia gratis, aggiorna quando vuoi.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" data-testid="register-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" data-testid="register-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" data-testid="register-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>

          <Button data-testid="register-submit" type="submit" className="w-full bg-[#0047AB] hover:bg-[#003380]" disabled={loading}>
            {loading ? "Creazione…" : "Registrati"}
          </Button>

          <div className="text-sm text-zinc-600 text-center">
            Hai già un account?{" "}
            <Link to="/login" data-testid="link-login" className="text-[#0047AB] font-medium hover:underline">Accedi</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
