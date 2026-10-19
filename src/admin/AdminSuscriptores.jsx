import { useEffect, useMemo, useState } from "react";
import { fetchSubscribers, updateSubscriber } from "../utils/admin";

const ESTADOS = [
  { id: "todos", label: "Todos" },
  { id: "activos", label: "Activos" },
  { id: "pendientes", label: "Pendientes" },
  { id: "cancelados", label: "Cancelados" },
];

const PREF_LABELS = {
  suculentas: "Suculentas",
  interior: "Interior",
  exterior: "Resistentes",
  macetas: "Macetas",
  aromaticas: "Aromáticas",
  mix: "Mix",
};

const HORARIO_LABELS = { manana: "Mañana", tarde: "Tarde" };

function formatFecha(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("es-AR");
  } catch {
    return "—";
  }
}

function estadoDe(sub) {
  if (sub.activo) return { id: "activo", label: "Activo" };
  if (sub.mercadopago_status === "cancelled")
    return { id: "cancelado", label: "Cancelado" };
  return { id: "pendiente", label: "Pendiente" };
}

function toCsv(rows) {
  const headers = [
    "nombre",
    "correo",
    "telefono",
    "dni",
    "instagram",
    "direccion",
    "departamento",
    "ciudad",
    "codigoPostal",
    "horarioEntrega",
    "preferencias",
    "activo",
    "pendiente",
    "mercadopago_status",
    "fechaAlta",
  ];

  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

  const lines = rows.map((s) =>
    [
      s.nombre,
      s.correo,
      s.telefono,
      s.dni,
      s.instagram,
      s.direccion,
      s.departamento,
      s.ciudad,
      s.codigoPostal,
      HORARIO_LABELS[s.horarioEntrega] || s.horarioEntrega,
      (s.preferencias || []).join(" / "),
      s.activo,
      s.pendiente,
      s.mercadopago_status || "",
      s.fechaAlta || "",
    ]
      .map(escape)
      .join(",")
  );

  return [headers.join(","), ...lines].join("\n");
}

export default function AdminSuscriptores() {
  const [subscribers, setSubscribers] = useState([]);
  const [stats, setStats] = useState({ total: 0, activos: 0, pendientes: 0, cancelados: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [busy, setBusy] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchSubscribers();
      setSubscribers(result.suscriptores || []);
      setStats(result.stats || { total: 0, activos: 0, pendientes: 0, cancelados: 0 });
    } catch (err) {
      setError(err.message || "No se pudieron cargar los suscriptores.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return subscribers.filter((s) => {
      const estado = estadoDe(s).id;
      if (filtro === "activos" && estado !== "activo") return false;
      if (filtro === "pendientes" && estado !== "pendiente") return false;
      if (filtro === "cancelados" && estado !== "cancelado") return false;
      if (!q) return true;
      return (
        s.nombre.toLowerCase().includes(q) ||
        s.correo.toLowerCase().includes(q) ||
        s.ciudad.toLowerCase().includes(q)
      );
    });
  }, [subscribers, query, filtro]);

  const handleAction = async (sub, action) => {
    const confirmaciones = {
      cancelar: `¿Cancelar la suscripción de ${sub.correo}?`,
      eliminar: `¿Eliminar definitivamente a ${sub.correo}? Esta acción no se puede deshacer.`,
    };
    if (confirmaciones[action] && !window.confirm(confirmaciones[action])) return;

    setBusy(sub.correo);
    setError("");
    try {
      await updateSubscriber(sub.correo, action);
      await load();
    } catch (err) {
      setError(err.message || "No se pudo realizar la acción.");
    } finally {
      setBusy("");
    }
  };

  const handleExport = () => {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `suscriptores-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="adm-panel">
      <div className="adm-panel-head">
        <h2>Suscriptores</h2>
        <div className="adm-panel-actions">
          <button type="button" className="adm-btn adm-btn-ghost" onClick={load}>
            Recargar
          </button>
          <button type="button" className="adm-btn adm-btn-primary" onClick={handleExport}>
            Exportar CSV
          </button>
        </div>
      </div>

      {error && <div className="adm-alert adm-alert-error">{error}</div>}

      <div className="adm-stats">
        <div className="adm-stat">
          <span className="adm-stat-num">{stats.total}</span>
          <span className="adm-stat-label">Total</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-num">{stats.activos}</span>
          <span className="adm-stat-label">Activos</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-num">{stats.pendientes}</span>
          <span className="adm-stat-label">Pendientes</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-num">{stats.cancelados}</span>
          <span className="adm-stat-label">Cancelados</span>
        </div>
      </div>

      <div className="adm-toolbar">
        <input
          type="search"
          className="adm-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, email o ciudad..."
        />
        <div className="adm-filtros">
          {ESTADOS.map((estado) => (
            <button
              key={estado.id}
              type="button"
              className={`adm-chip ${filtro === estado.id ? "is-active" : ""}`}
              onClick={() => setFiltro(estado.id)}
            >
              {estado.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="adm-loading">Cargando suscriptores...</div>
      ) : filtered.length === 0 ? (
        <div className="adm-empty">No hay suscriptores para mostrar.</div>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Ciudad</th>
                <th>Entrega</th>
                <th>Preferencias</th>
                <th>Estado</th>
                <th>Alta</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((sub) => {
                const estado = estadoDe(sub);
                return (
                  <tr key={sub.correo}>
                    <td>
                      <div className="adm-cell-strong">{sub.nombre || "—"}</div>
                      {sub.instagram && (
                        <div className="adm-cell-sub">@{sub.instagram.replace(/^@/, "")}</div>
                      )}
                    </td>
                    <td>{sub.correo}</td>
                    <td>{sub.ciudad || "—"}</td>
                    <td>{HORARIO_LABELS[sub.horarioEntrega] || "—"}</td>
                    <td>
                      {(sub.preferencias || [])
                        .map((p) => PREF_LABELS[p] || p)
                        .join(", ") || "—"}
                    </td>
                    <td>
                      <span className={`adm-badge adm-badge-${estado.id}`}>
                        {estado.label}
                      </span>
                    </td>
                    <td>{formatFecha(sub.fechaAlta)}</td>
                    <td>
                      <div className="adm-row-actions">
                        {!sub.activo && (
                          <button
                            type="button"
                            className="adm-mini adm-mini-ok"
                            disabled={busy === sub.correo}
                            onClick={() => handleAction(sub, "activar")}
                          >
                            Activar
                          </button>
                        )}
                        {sub.activo && (
                          <button
                            type="button"
                            className="adm-mini"
                            disabled={busy === sub.correo}
                            onClick={() => handleAction(sub, "pausar")}
                          >
                            Pausar
                          </button>
                        )}
                        <button
                          type="button"
                          className="adm-mini adm-mini-danger"
                          disabled={busy === sub.correo}
                          onClick={() => handleAction(sub, "cancelar")}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="adm-mini adm-mini-danger"
                          disabled={busy === sub.correo}
                          onClick={() => handleAction(sub, "eliminar")}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
