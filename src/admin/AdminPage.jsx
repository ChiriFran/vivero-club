import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase/admin";
import AdminLogin from "./AdminLogin";
import AdminDashboard from "./AdminDashboard";
import { adminLogout } from "../utils/admin";
import "../styles/admin.css";

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setReady(true);
    });

    const handleUnauthorized = () => {
      adminLogout();
    };
    window.addEventListener("admin-unauthorized", handleUnauthorized);

    return () => {
      unsubscribe();
      window.removeEventListener("admin-unauthorized", handleUnauthorized);
    };
  }, []);

  if (!ready) return <div className="adm-loading">Cargando panel...</div>;

  if (!user) {
    return <AdminLogin onLogin={() => {}} />;
  }

  return <AdminDashboard onLogout={() => adminLogout()} />;
}
