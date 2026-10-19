import { useState } from "react";
import AdminAjustes from "./AdminAjustes";
import AdminSuscriptores from "./AdminSuscriptores";

const TABS = [
  { id: "suscriptores", label: "Suscriptores" },
  { id: "ajustes", label: "Ajustes de la landing" },
];

export default function AdminDashboard({ onLogout }) {
  const [tab, setTab] = useState("suscriptores");

  return (
    <div className="adm-shell">
      <header className="adm-topbar">
        <div className="adm-brand">
          <span className="adm-brand-dot" />
          <span>Panel · {import.meta.env.VITE_CLUB_NOMBRE || "Vivero Club"}</span>
        </div>
        <nav className="adm-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`adm-tab ${tab === t.id ? "is-active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="adm-topbar-actions">
          <a className="adm-link" href="/" target="_blank" rel="noreferrer">
            Ver sitio
          </a>
          <button type="button" className="adm-btn adm-btn-ghost" onClick={onLogout}>
            Salir
          </button>
        </div>
      </header>

      <main className="adm-main">
        {tab === "suscriptores" ? <AdminSuscriptores /> : <AdminAjustes />}
      </main>
    </div>
  );
}
