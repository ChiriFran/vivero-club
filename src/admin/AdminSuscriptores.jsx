import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchHistorial,
  fetchSubscribers,
  updateSubscriber,
} from "../utils/admin";
import {
  cancelarSuscripcion,
  pausarSuscripcion,
  reactivarSuscripcion,
  sincronizarPagos,
} from "../utils/mercadopago";

const ESTADOS = [
  { id: "todos", label: "Todos" },
  { id: "activos", label: "Activos" },
  { id: "sinPago", label: "Sin pago" },
  { id: "pendientes", label: "Pendientes" },
  { id: "abandonados", label: "Abandonados" },
  { id: "cancelados", label: "Cancelados" },
];

const PREF_LABELS = {
  suculentas: "Suculentas",
  interior: "Plantas de interior",
  exterior: "Plantas resistentes",
  macetas: "Macetas cerámicas",
  aromaticas: "Hierbas aromáticas",
  mix: "Mix sorpresa",
};

const HORARIO_LABELS = { manana: "Mañana", tarde: "Tarde" };

const PAGO_LABELS = {
  approved: "Aprobado",
  authorized: "Autorizado",
  processed: "Procesado",
  pending: "Pendiente",
  in_process: "En proceso",
  rejected: "Rechazado",
  refunded: "Reembolsado",
  charged_back: "Contracargo",
  cancelled: "Cancelado",
};

const BATCH_SIZE = 5;

function formatFecha(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-AR");
}

function formatFechaHora(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoneda(monto, moneda) {
  const value = Number(monto);
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: moneda || "ARS",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `$${value.toLocaleString("es-AR")}`;
  }
}

function pagoVigente(sub) {
  if (!sub.fechaUltimoPago) return false;
  const date = new Date(sub.fechaUltimoPago);
  if (Number.isNaN(date.getTime())) return false;
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000);
  return diffDays >= 0 && diffDays <= 31;
}

function estadoDe(sub) {
  const cancelado = sub.mercadopago_status === "cancelled";

  if (sub.activo && pagoVigente(sub)) {
    return { id: "activoReal", label: "Activo", tone: "activo" };
  }
  if (sub.activo && !pagoVigente(sub)) {
    return { id: "activoSinPago", label: "Activo sin pago", tone: "sinpago" };
  }
  if (cancelado) {
    return { id: "cancelado", label: "Cancelado", tone: "cancelado" };
  }
  if (
    sub.pendiente &&
    (sub.mercadopago_status === "pending" ||
      !sub.mercadopago_preapproval_id)
  ) {
    return { id: "abandonado", label: "Abandonado", tone: "abandonado" };
  }
  if (sub.pendiente) {
    return { id: "pendiente", label: "Pendiente", tone: "pendiente" };
  }
  if (sub.mercadopago_status === "pending") {
    return { id: "abandonado", label: "Abandonado", tone: "abandonado" };
  }
  return { id: "otro", label: "Sin estado", tone: "otro" };
}

function prioridadEstado(sub) {
  switch (estadoDe(sub).id) {
    case "activoReal":
      return 5;
    case "activoSinPago":
      return 4;
    case "pendiente":
      return 3;
    case "abandonado":
      return 2;
    case "cancelado":
      return 1;
    default:
      return 0;
  }
}

function dedupeSubscribers(subscribers) {
  const map = new Map();

  subscribers.forEach((sub) => {
    const dni = String(sub.dni || "").replace(/\D/g, "");
    const key = dni || String(sub.correo || sub.id || "").trim().toLowerCase();
    if (!key) return;

    const current = map.get(key);
    if (!current) {
      map.set(key, sub);
      return;
    }

    const priority = prioridadEstado(sub);
    const currentPriority = prioridadEstado(current);
    const fecha = String(sub.fechaAlta || "");
    const currentFecha = String(current.fechaAlta || "");

    if (
      priority > currentPriority ||
      (priority === currentPriority && fecha > currentFecha)
    ) {
      map.set(key, sub);
    }
  });

  return Array.from(map.values()).sort((a, b) =>
    String(b.fechaAlta || "").localeCompare(String(a.fechaAlta || ""))
  );
}

function limpiarHistorial(rows) {
  const seen = new Set();

  return rows
    .filter((row) => !String(row.id || "").startsWith("preapproval_"))
    .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")))
    .filter((row) => {
      const key =
        row.mercadopago_payment_id ||
        row.mercadopago_authorized_payment_id ||
        row.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function syncResultError(result) {
  if (!result) return true;
  if (["error", "mp_error", "not_found"].includes(result.status)) return true;
  if (Array.isArray(result.results)) {
    return result.results.some((item) =>
      ["error", "mp_error", "not_found"].includes(item.status)
    );
  }
  return false;
}

function HistorialPanel({ state }) {
  if (!state || state.loading) {
    return <div className="adm-hist-loading">Cargando historial...</div>;
  }

  if (state.error) {
    return <div className="adm-hist-error">{state.error}</div>;
  }

  const historial = limpiarHistorial(state.data || []);

  return (
    <div className="adm-hist">
      <div className="adm-hist-head">
        <h4>Historial de pagos</h4>
        <span className="adm-hist-count">
          {historial.length} {historial.length === 1 ? "registro" : "registros"}
        </span>
      </div>

      {historial.length === 0 ? (
        <p className="adm-hist-empty">
          Todavía no hay pagos registrados. Los cobros aparecen acá cuando
          MercadoPago confirma la acreditación.
        </p>
      ) : (
        <ul className="adm-hist-list">
          {historial.map((pago) => (
            <li className="adm-hist-item" key={pago.id}>
              <div className="adm-hist-main">
                <span
                  className={`adm-hist-estado adm-hist-estado-${pago.estado || "otro"}`}
                >
                  {PAGO_LABELS[pago.estado] || pago.estado || "Sin estado"}
                </span>
                <span className="adm-hist-monto">
                  {formatMoneda(pago.monto, pago.moneda)}
                </span>
                <span className="adm-hist-fecha">
                  {formatFechaHora(pago.fecha)}
                </span>
              </div>
              <div className="adm-hist-ids">
                {pago.mercadopago_payment_id && (
                  <span>Pago: {pago.mercadopago_payment_id}</span>
                )}
                {pago.mercadopago_authorized_payment_id && (
                  <span>Autorizado: {pago.mercadopago_authorized_payment_id}</span>
                )}
                {pago.mercadopago_preapproval_id && (
                  <span>Preapproval: {pago.mercadopago_preapproval_id}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminSuscriptores() {
  const [subscribers, setSubscribers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [busy, setBusy] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [histories, setHistories] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchSubscribers();
      setSubscribers(result.suscriptores || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los suscriptores.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unique = useMemo(() => dedupeSubscribers(subscribers), [subscribers]);

  const stats = useMemo(() => {
    const counts = {
      total: unique.length,
      activos: 0,
      sinPago: 0,
      pendientes: 0,
      abandonados: 0,
      cancelados: 0,
    };

    unique.forEach((sub) => {
      switch (estadoDe(sub).id) {
        case "activoReal":
          counts.activos += 1;
          break;
        case "activoSinPago":
          counts.activos += 1;
          counts.sinPago += 1;
          break;
        case "pendiente":
          counts.pendientes += 1;
          break;
        case "abandonado":
          counts.abandonados += 1;
          break;
        case "cancelado":
          counts.cancelados += 1;
          break;
        default:
          break;
      }
    });

    return counts;
  }, [unique]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return unique.filter((sub) => {
      const estado = estadoDe(sub).id;

      if (filtro === "activos" && !["activoReal", "activoSinPago"].includes(estado)) {
        return false;
      }
      if (filtro === "sinPago" && estado !== "activoSinPago") return false;
      if (filtro === "pendientes" && estado !== "pendiente") return false;
      if (filtro === "abandonados" && estado !== "abandonado") return false;
      if (filtro === "cancelados" && estado !== "cancelado") return false;

      if (!q) return true;

      const searchable = [
        sub.nombre,
        sub.correo,
        sub.dni,
        sub.telefono,
        sub.instagram,
        sub.direccion,
        sub.ciudad,
        sub.codigoPostal,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");

      return searchable.includes(q);
    });
  }, [unique, query, filtro]);

  const loadHistorial = useCallback(async (email) => {
    setHistories((prev) => ({
      ...prev,
      [email]: { loading: true, data: [], error: "" },
    }));

    try {
      const data = await fetchHistorial(email);
      setHistories((prev) => ({
        ...prev,
        [email]: { loading: false, data, error: "" },
      }));
    } catch (err) {
      setHistories((prev) => ({
        ...prev,
        [email]: {
          loading: false,
          data: [],
          error: err.message || "No se pudo cargar el historial.",
        },
      }));
    }
  }, []);

  const toggleHistorial = (sub) => {
    const email = sub.correo;
    const isOpen = expanded.has(email);

    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });

    if (!isOpen && !histories[email]) {
      loadHistorial(email);
    }
  };

  const resetHistorial = (email) => {
    setHistories((prev) => {
      const next = { ...prev };
      delete next[email];
      return next;
    });
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(email);
      return next;
    });
  };

  const handleAction = async (sub, action) => {
    const confirmaciones = {
      cancelar: `¿Cancelar la suscripción de ${sub.correo}? También se cancela en MercadoPago.`,
      eliminar: `¿Eliminar definitivamente a ${sub.correo}? Si tiene una suscripción activa, también se cancela en MercadoPago. Esta acción no se puede deshacer.`,
    };
    if (confirmaciones[action] && !window.confirm(confirmaciones[action])) return;

    setBusy(sub.correo);
    setError("");
    setInfo("");

    try {
      const mock = import.meta.env.VITE_MOCK_MP === "true";

      if (action === "cancelar") {
        if (mock) await updateSubscriber(sub.correo, "cancelar");
        else await cancelarSuscripcion(sub.correo);
      } else if (action === "pausar") {
        if (mock) await updateSubscriber(sub.correo, "pausar");
        else await pausarSuscripcion(sub.correo);
      } else if (
        action === "activar" &&
        !mock &&
        sub.mercadopago_preapproval_id &&
        sub.mercadopago_status === "paused"
      ) {
        await reactivarSuscripcion(sub.correo);
      } else if (action === "eliminar") {
        if (!mock && sub.mercadopago_preapproval_id) {
          await cancelarSuscripcion(sub.correo);
        }
        await updateSubscriber(sub.correo, "eliminar");
      } else {
        await updateSubscriber(sub.correo, action);
      }

      resetHistorial(sub.correo);
      await load();
    } catch (err) {
      setError(err.message || "No se pudo realizar la acción.");
    } finally {
      setBusy("");
    }
  };

  const handleSyncOne = async (sub) => {
    setBusy(sub.correo);
    setError("");
    setInfo("");

    try {
      const result = await sincronizarPagos(sub.correo);
      if (syncResultError(result)) {
        throw new Error(
          result.message || "MercadoPago devolvió un error al sincronizar."
        );
      }
      resetHistorial(sub.correo);
      await load();
      setInfo(`Pagos actualizados para ${sub.correo}.`);
    } catch (err) {
      setError(err.message || "No se pudieron sincronizar los pagos.");
    } finally {
      setBusy("");
    }
  };

  const handleSyncAll = async () => {
    const targets = unique.filter((sub) => sub.mercadopago_preapproval_id);

    if (!targets.length) {
      setInfo("No hay suscripciones con preapproval_id para sincronizar.");
      return;
    }

    setSyncing(true);
    setError("");
    setInfo("");
    setSyncProgress({ done: 0, total: targets.length });

    let errors = 0;

    try {
      for (let index = 0; index < targets.length; index += BATCH_SIZE) {
        const batch = targets.slice(index, index + BATCH_SIZE);
        const results = await Promise.all(
          batch.map((sub) =>
            sincronizarPagos(sub.correo).catch((err) => ({
              status: "error",
              message: err.message,
            }))
          )
        );

        errors += results.filter(syncResultError).length;
        setSyncProgress({
          done: Math.min(index + BATCH_SIZE, targets.length),
          total: targets.length,
        });
      }

      setHistories({});
      setExpanded(new Set());
      await load();
      setInfo(
        `Sincronización completa: ${targets.length - errors}/${targets.length} actualizados${
          errors ? ` · ${errors} con error` : ""
        }.`
      );
    } catch (err) {
      setError(err.message || "No se pudieron sincronizar los pagos.");
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  };

  const handleExport = async () => {
    try {
      const XLSX = await import("xlsx");

      const rows = filtered.map((sub) => {
        const estado = estadoDe(sub);
        return {
          Nombre: sub.nombre,
          Instagram: sub.instagram,
          DNI: sub.dni,
          Email: sub.correo,
          Teléfono: sub.telefono,
          Dirección: sub.direccion,
          Departamento: sub.departamento,
          Ciudad: sub.ciudad,
          "Código postal": sub.codigoPostal,
          "Horario de entrega":
            HORARIO_LABELS[sub.horarioEntrega] || sub.horarioEntrega,
          Preferencias: (sub.preferencias || [])
            .map((pref) => PREF_LABELS[pref] || pref)
            .join(" / "),
          Estado: estado.label,
          Activo: sub.activo ? "Sí" : "No",
          Pendiente: sub.pendiente ? "Sí" : "No",
          "Estado MercadoPago": sub.mercadopago_status || "",
          "Plan ID": sub.mercadopago_plan_id || "",
          "Preapproval ID": sub.mercadopago_preapproval_id || "",
          "Fecha de alta": formatFecha(sub.fechaAlta),
          "Primer pago": formatFecha(sub.fechaPrimerPago),
          "Último pago": formatFecha(sub.fechaUltimoPago),
          "Próximo cobro": formatFecha(sub.fechaProximoCobro),
          "Fecha de cancelación": formatFecha(sub.fechaCancelacion),
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 20 }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Suscriptores");
      XLSX.writeFile(
        workbook,
        `club-suscriptores-${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch (err) {
      setError(err.message || "No se pudo generar el Excel.");
    }
  };

  return (
    <div className="adm-panel">
      <div className="adm-panel-head">
        <h2>Suscriptores</h2>
        <div className="adm-panel-actions">
          <button
            type="button"
            className="adm-btn adm-btn-ghost"
            onClick={load}
            disabled={loading || syncing}
          >
            Recargar
          </button>
          <button
            type="button"
            className="adm-btn adm-btn-ghost"
            onClick={handleSyncAll}
            disabled={syncing || loading}
          >
            {syncing ? "Sincronizando..." : "Actualizar pagos"}
          </button>
          <button
            type="button"
            className="adm-btn adm-btn-primary"
            onClick={handleExport}
            disabled={!filtered.length}
          >
            Exportar Excel
          </button>
        </div>
      </div>

      {error && <div className="adm-alert adm-alert-error">{error}</div>}
      {info && <div className="adm-alert adm-alert-ok">{info}</div>}

      {syncProgress && (
        <div className="adm-sync-progress">
          <div className="adm-sync-track">
            <span
              className="adm-sync-fill"
              style={{
                width: `${
                  syncProgress.total
                    ? Math.round((syncProgress.done / syncProgress.total) * 100)
                    : 0
                }%`,
              }}
            />
          </div>
          <span className="adm-sync-label">
            Sincronizando {syncProgress.done}/{syncProgress.total}
          </span>
        </div>
      )}

      <div className="adm-stats adm-stats-6">
        <div className="adm-stat">
          <span className="adm-stat-num">{stats.total}</span>
          <span className="adm-stat-label">Total</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-num">{stats.activos}</span>
          <span className="adm-stat-label">Activos</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-num">{stats.sinPago}</span>
          <span className="adm-stat-label">Sin pago</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-num">{stats.pendientes}</span>
          <span className="adm-stat-label">Pendientes</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-num">{stats.abandonados}</span>
          <span className="adm-stat-label">Abandonados</span>
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
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre, email, DNI, teléfono o ciudad..."
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
                <th>Contacto</th>
                <th>Envío</th>
                <th>Preferencias</th>
                <th>Estado</th>
                <th>Pagos</th>
                <th>Alta</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((sub) => {
                const estado = estadoDe(sub);
                const abierto = expanded.has(sub.correo);
                const isBusy = busy === sub.correo || syncing;

                return (
                  <Fragment key={sub.correo}>
                    <tr>
                      <td>
                        <div className="adm-cell-strong">
                          {sub.nombre || "—"}
                        </div>
                        <div className="adm-cell-sub">
                          {sub.instagram
                            ? `@${sub.instagram.replace(/^@/, "")}`
                            : `DNI ${sub.dni || "—"}`}
                        </div>
                      </td>
                      <td>
                        <div className="adm-cell-strong">{sub.correo}</div>
                        <div className="adm-cell-sub">
                          {sub.telefono || "Sin teléfono"}
                        </div>
                      </td>
                      <td>
                        <div>{sub.direccion || "—"}</div>
                        <div className="adm-cell-sub">
                          {[sub.departamento, sub.ciudad, sub.codigoPostal]
                            .filter(Boolean)
                            .join(", ") || "Sin dirección"}
                        </div>
                        <div className="adm-cell-sub">
                          {HORARIO_LABELS[sub.horarioEntrega] || "—"}
                        </div>
                      </td>
                      <td>
                        {(sub.preferencias || [])
                          .map((pref) => PREF_LABELS[pref] || pref)
                          .join(", ") || "—"}
                      </td>
                      <td>
                        <span className={`adm-badge adm-badge-${estado.tone}`}>
                          {estado.label}
                        </span>
                        <div className="adm-cell-sub">
                          MP: {sub.mercadopago_status || "—"}
                        </div>
                      </td>
                      <td>
                        <div className="adm-pago-line">
                          <span>Último:</span> {formatFecha(sub.fechaUltimoPago)}
                        </div>
                        <div className="adm-pago-line">
                          <span>Próximo:</span>{" "}
                          {formatFecha(sub.fechaProximoCobro)}
                        </div>
                      </td>
                      <td>{formatFecha(sub.fechaAlta)}</td>
                      <td>
                        <div className="adm-row-actions">
                          <button
                            type="button"
                            className="adm-mini"
                            onClick={() => toggleHistorial(sub)}
                          >
                            {abierto ? "Ocultar" : "Historial"}
                          </button>
                          {sub.mercadopago_preapproval_id && (
                            <button
                              type="button"
                              className="adm-mini"
                              disabled={isBusy}
                              onClick={() => handleSyncOne(sub)}
                            >
                              Sync
                            </button>
                          )}
                          {!sub.activo &&
                            sub.mercadopago_status !== "authorized" && (
                              <button
                                type="button"
                                className="adm-mini adm-mini-ok"
                                disabled={isBusy}
                                onClick={() => handleAction(sub, "activar")}
                              >
                                Activar
                              </button>
                            )}
                          {sub.activo &&
                            sub.mercadopago_status !== "manual" &&
                            sub.mercadopago_preapproval_id && (
                            <button
                              type="button"
                              className="adm-mini"
                              disabled={isBusy}
                              onClick={() => handleAction(sub, "pausar")}
                            >
                              Pausar
                            </button>
                          )}
                          <button
                            type="button"
                            className="adm-mini adm-mini-danger"
                            disabled={isBusy}
                            onClick={() => handleAction(sub, "cancelar")}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            className="adm-mini adm-mini-danger"
                            disabled={isBusy}
                            onClick={() => handleAction(sub, "eliminar")}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>

                    {abierto && (
                      <tr className="adm-expand-row">
                        <td colSpan={8}>
                          <div className="adm-hist-resumen">
                            <span>
                              <strong>Primer pago:</strong>{" "}
                              {formatFecha(sub.fechaPrimerPago)}
                            </span>
                            <span>
                              <strong>Último pago:</strong>{" "}
                              {formatFecha(sub.fechaUltimoPago)}
                            </span>
                            <span>
                              <strong>Próximo cobro:</strong>{" "}
                              {formatFecha(sub.fechaProximoCobro)}
                            </span>
                            <span>
                              <strong>Cancelación:</strong>{" "}
                              {formatFecha(sub.fechaCancelacion)}
                            </span>
                          </div>
                          <HistorialPanel state={histories[sub.correo]} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
