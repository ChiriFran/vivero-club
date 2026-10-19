import { lazy, Suspense } from "react";
import SubscriptionLanding from "./components/SubscriptionLanding";

const AdminPage = lazy(() => import("./admin/AdminPage"));

function isAdminRoute() {
  const path = window.location.pathname.replace(/\/+$/, "");
  return path.endsWith("/admin");
}

export default function App() {
  if (isAdminRoute()) {
    return (
      <Suspense fallback={<div className="adm-loading">Cargando panel...</div>}>
        <AdminPage />
      </Suspense>
    );
  }
  return <SubscriptionLanding />;
}
