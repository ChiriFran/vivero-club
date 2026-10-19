export default function SubscriptionSuccess({ yaSuscrito, mock, clubNombre, onVolver }) {
  return (
    <div className="vc-page">
      <section className="vc-success">
        <div className="vc-success-card">
          <span className="vc-success-icon">
            {yaSuscrito ? "🌿" : mock ? "🧪" : "🎉"}
          </span>

          {yaSuscrito ? (
            <>
              <h1 className="vc-success-title">Ya sos parte del {clubNombre}</h1>
              <p className="vc-success-text">
                Tu suscripción está activa. Vas a recibir tu caja curada todos los
                meses. Si necesitás hacer cambios, escribinos por email.
              </p>
            </>
          ) : mock ? (
            <>
              <h1 className="vc-success-title">Modo demo activo</h1>
              <p className="vc-success-text">
                Simulamos la suscripción correctamente y guardamos tus datos, pero no
                te redirigimos a MercadoPago porque el modo demo está habilitado.
              </p>
              <p className="vc-success-text">
                Configurá <code>MP_ACCESS_TOKEN</code> y{" "}
                <code>MP_PREAPPROVAL_PLAN_ID</code> y poné{" "}
                <code>MOCK_MP</code>/<code>VITE_MOCK_MP</code> en <code>false</code>{" "}
                para activar el pago real.
              </p>
            </>
          ) : (
            <>
              <h1 className="vc-success-title">¡Gracias por suscribirte!</h1>
              <p className="vc-success-text">
                Te llevamos a MercadoPago para autorizar el pago. Una vez completado,
                activamos tu suscripción y te avisamos por email.
              </p>
              <p className="vc-success-text">
                Si no se abrió la pasarela, revisá tu email para finalizar el proceso.
              </p>
            </>
          )}

          {onVolver && (
            <button type="button" className="vc-btn-secondary" onClick={onVolver}>
              Volver al inicio
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
