import React from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "./ui";
import { isChunkLoadError } from "../utils/lazyWithRetry";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      const isNewVersion = isChunkLoadError(this.state.error);
      return (
        <div style={{ padding: "2rem", display: "flex", justifyContent: "center" }}>
          <div
            style={{
              maxWidth: "600px",
              width: "100%",
              background: "#fff",
              border: "1px solid #fed7aa",
              borderRadius: "0.75rem",
              padding: "1.75rem",
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "#c2410c", marginBottom: "1rem" }}>
              <AlertTriangle size={28} />
              <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>
                {isNewVersion ? "Hay una nueva versión disponible" : "Ocurrió un error en la vista"}
              </h2>
            </div>
            <p style={{ color: "#475569", fontSize: "0.9rem", marginBottom: "1rem" }}>
              {isNewVersion
                ? "La aplicación se actualizó mientras tenía esta pestaña abierta. Recargue la página para continuar."
                : "La aplicación encontró una inconsistencia inesperada al renderizar esta sección."}
            </p>
            {!isNewVersion && this.state.error?.message && (
              <pre
                style={{
                  background: "#fef3c7",
                  color: "#92400e",
                  padding: "0.75rem",
                  borderRadius: "0.5rem",
                  fontSize: "0.8rem",
                  overflowX: "auto",
                  marginBottom: "1.25rem",
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              {isNewVersion ? (
                <Button onClick={() => window.location.reload()}>
                  <RefreshCw size={15} /> Recargar página
                </Button>
              ) : (
                <Button onClick={this.handleReset}>
                  <RefreshCw size={15} /> Reintentar
                </Button>
              )}
              {this.props.onNavigateHome && (
                <Button variant="outline" onClick={this.props.onNavigateHome}>
                  <Home size={15} /> Volver al Inicio
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
