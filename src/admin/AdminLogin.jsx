import { useState } from "react";
import { adminLogin } from "../utils/admin";

export default function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await adminLogin(email, password);
      onLogin();
    } catch (err) {
      setError(traducirError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="adm-login">
      <form className="adm-login-card" onSubmit={handleSubmit}>
        <h1 className="adm-login-title">Panel de administración</h1>
        <p className="adm-login-sub">Ingresá con tu cuenta de Firebase</p>

        {error && <div className="adm-alert adm-alert-error">{error}</div>}

        <label className="adm-field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            placeholder="admin@gmail.com"
          />
        </label>

        <label className="adm-field">
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </label>

        <button type="submit" className="adm-btn adm-btn-primary" disabled={loading}>
          {loading ? "Ingresando..." : "Ingresar"}
        </button>

        <a className="adm-login-back" href="/">
          Volver al sitio
        </a>
      </form>
    </div>
  );
}

function traducirError(err) {
  const code = err?.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password")) {
    return "Email o contraseña incorrectos.";
  }
  if (code.includes("user-not-found")) {
    return "No existe una cuenta con ese email.";
  }
  if (code.includes("too-many-requests")) {
    return "Demasiados intentos. Probá más tarde.";
  }
  if (code.includes("invalid-email")) {
    return "El email no es válido.";
  }
  return err?.message || "No se pudo iniciar sesión.";
}
