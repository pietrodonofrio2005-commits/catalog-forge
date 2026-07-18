import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Layers, Package, Upload, History, LogOut, Menu, X, Sparkles, FileSpreadsheet } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/app/upload", label: "Carica prodotto", icon: Upload, testid: "nav-upload" },
  { to: "/app/import", label: "Importa Excel/CSV", icon: FileSpreadsheet, testid: "nav-import" },
  { to: "/app/products", label: "Gestisci prodotti", icon: Package, testid: "nav-products" },
  { to: "/app/catalog", label: "Crea nuovo catalogo", icon: Sparkles, testid: "nav-catalog" },
  { to: "/app/history", label: "Cronologia", icon: History, testid: "nav-history" },
];

const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex">
      {/* Sidebar */}
      <aside
        data-testid="dashboard-sidebar"
        className={`${open ? "w-64" : "w-16"} shrink-0 border-r border-zinc-200 bg-white flex flex-col transition-all duration-200`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-zinc-200">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 rounded-md bg-[#0047AB] text-white flex items-center justify-center shrink-0">
              <Layers size={18} />
            </div>
            {open && <span className="font-display font-bold text-lg tracking-tight">Catalog Forge</span>}
          </div>
          <button data-testid="sidebar-toggle" onClick={() => setOpen(!open)} className="p-1.5 rounded hover:bg-zinc-100">
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                data-testid={item.testid}
                className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
              >
                <Icon size={18} className="shrink-0" />
                {open && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-zinc-200">
          {open && (
            <div className="px-2 mb-2">
              <div data-testid="user-name" className="text-sm font-medium text-zinc-900 truncate">{user?.name}</div>
              <div className="text-xs text-zinc-500 truncate">{user?.email}</div>
            </div>
          )}
          <Button
            data-testid="logout-btn"
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start"
          >
            <LogOut size={16} className="mr-2" />
            {open && "Esci"}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
};

export default DashboardLayout;
