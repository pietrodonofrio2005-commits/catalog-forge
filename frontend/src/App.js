import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import DashboardLayout from "@/components/DashboardLayout";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ProductUpload from "@/pages/ProductUpload";
import ProductsImport from "@/pages/ProductsImport";
import ProductManage from "@/pages/ProductManage";
import CatalogCreate from "@/pages/CatalogCreate";
import CatalogHistory from "@/pages/CatalogHistory";
import PublicCatalog from "@/pages/PublicCatalog";

const RootRedirect = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? "/app/products" : "/login"} replace />;
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="top-right" richColors />
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="products" replace />} />
              <Route path="upload" element={<ProductUpload />} />
              <Route path="import" element={<ProductsImport />} />
              <Route path="products" element={<ProductManage />} />
              <Route path="catalog" element={<CatalogCreate />} />
              <Route path="catalog/edit/:catalogId" element={<CatalogCreate />} />
              <Route path="history" element={<CatalogHistory />} />
            </Route>
            <Route path="/c/:token" element={<PublicCatalog />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
