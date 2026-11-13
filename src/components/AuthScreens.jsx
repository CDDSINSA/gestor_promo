import React, { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import sinsaLogo from "../assets/sinsa.webp";
import { classNames } from "../utils/common";
import { Button } from "./ui";

const BRAND_BENEFITS = [
  "Carga y validación de promociones por campaña.",
  "Aprobación de diseños.",
  "Diseño de catálogos y anaslisis de márgenes.",
];

function AuthBrandPanel() {
  return <section className="login-brand-panel" aria-hidden="true">
    <div className="login-brand-header">
      <img className="login-brand-logo" src={sinsaLogo} alt="" />
      <span className="login-brand-name">Gestor Comercial</span>
    </div>
    <div className="login-brand-content">
      <span className="login-brand-eyebrow">Gestión comercial SINSA</span>
      <h1>Datos Consolidados<br /></h1>
      <p>Gestione la carga, validación y seguimiento de las promociones de cada campaña con trazabilidad entre todas las áreas.</p>
      <div className="login-benefits">
        {BRAND_BENEFITS.map((text, index) => <div className="login-benefit" key={text}><span>{String(index + 1).padStart(2, "0")}</span>{text}</div>)}
      </div>
    </div>
  </section>;
}

function AuthHeading({ kicker, title, description }) {
  return <div className="login-heading">
    {kicker && <span className="login-kicker">{kicker}</span>}
    <h2>{title}</h2>
    {description && <p>{description}</p>}
  </div>;
}

function AuthLayout({ kicker, title, description, children, help = "¿Problemas para ingresar? Contacte al administrador del sistema." }) {
  return <main className="login-main">
    <div className="login-layout">
      <AuthBrandPanel />
      <section className="login-form-panel">
        <div className="login-card">
          <div className="login-mobile-logo"><img src={sinsaLogo} alt="SINSA" /></div>
          <AuthHeading kicker={kicker} title={title} description={description} />
          {children}
          {help && <p className="login-help">{help}</p>}
        </div>
      </section>
    </div>
  </main>;
}

function AuthStatusLayout({ title, description, children }) {
  return <main className="login-main login-status-main">
    <div className="login-card">
      <div className="login-status-logo"><img src={sinsaLogo} alt="SINSA" /></div>
      <AuthHeading kicker="Gestor Comercial" title={title} description={description} />
      {children}
    </div>
  </main>;
}

function StatusMessages({ connectionStatus, status }) {
  return <>
    {connectionStatus && <p className="login-status">{connectionStatus}</p>}
    {status?.message && <p className={classNames("login-status", status.type === "error" && "error", status.type === "success" && "success")}>{status.message}</p>}
  </>;
}

export function LoginPage({ onLogin, onForgotPassword, loginStatus, connectionStatus }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const isLoading = loginStatus.type === "loading";
  const submit = (event) => {
    event.preventDefault();
    onLogin(email, password);
  };

  return <AuthLayout kicker="Acceso" title="Iniciar sesión" description="Ingrese con su correo y contraseña.">
    <form className="login-form" onSubmit={submit}>
      <label className="field"><span>Correo</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="nombre@sinsa.com.ni" /></label>
      <label className="field"><span>Contraseña</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
      <StatusMessages connectionStatus={connectionStatus} status={loginStatus} />
      <Button type="submit" disabled={isLoading}><LogIn size={16} /> {isLoading ? "Ingresando..." : "Ingresar"}</Button>
      <button type="button" className="login-link" onClick={onForgotPassword} disabled={isLoading}><KeyRound size={14} /> ¿Olvidó su contraseña?</button>
    </form>
  </AuthLayout>;
}

export function ForgotPasswordPage({ onSubmit, onBack, recoveryStatus, connectionStatus }) {
  const [email, setEmail] = useState("");
  const isLoading = recoveryStatus.type === "loading";
  const submit = (event) => {
    event.preventDefault();
    onSubmit(email);
  };

  return <AuthLayout kicker="Recuperación" title="Recuperar acceso" description="Ingrese su correo corporativo y le enviaremos un enlace para crear una nueva contraseña.">
    <form className="login-form" onSubmit={submit}>
      <label className="field"><span>Correo</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="nombre@sinsa.com.ni" /></label>
      <p className="login-note"><Mail size={14} /> Revise también su bandeja de correo no deseado.</p>
      <StatusMessages connectionStatus={connectionStatus} status={recoveryStatus} />
      <Button type="submit" disabled={isLoading}><RefreshCw size={16} /> {isLoading ? "Enviando..." : "Enviar enlace"}</Button>
      <button type="button" className="login-link" onClick={onBack} disabled={isLoading}><ArrowLeft size={14} /> Volver a iniciar sesión</button>
    </form>
  </AuthLayout>;
}

export function ResetPasswordPage({ mode = "recovery", recoverySession, recoveryUser, onSubmit, onBack, recoveryStatus, connectionStatus }) {
  const isInvite = mode === "invite";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const isLoading = recoveryStatus.type === "loading";
  const email = recoveryUser?.email || recoverySession?.user_email || "";
  const submit = (event) => {
    event.preventDefault();
    onSubmit(password, confirmPassword);
  };

  return <AuthLayout
    kicker={isInvite ? "Activación" : "Seguridad"}
    title={isInvite ? "Crear contraseña" : "Cambiar contraseña"}
    description={isInvite ? "Bienvenido. Defina su contraseña para ingresar." : "Defina una nueva contraseña para continuar."}
  >
    <form className="login-form" onSubmit={submit}>
      <div className="recovery-info"><ShieldAlert size={16} /> {isInvite
        ? (email ? `Activando acceso para ${email}` : "Activando acceso con su invitación.")
        : (email ? `Restableciendo acceso para ${email}` : "Restableciendo acceso con enlace de recuperación.")}</div>
      <label className="field"><span>{isInvite ? "Contraseña" : "Nueva contraseña"}</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label>
      <label className="field"><span>Confirmar contraseña</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></label>
      <StatusMessages connectionStatus={connectionStatus} status={recoveryStatus} />
      <Button type="submit" disabled={isLoading}><KeyRound size={16} /> {isLoading ? "Guardando..." : isInvite ? "Crear contraseña" : "Actualizar contraseña"}</Button>
      <button type="button" className="login-link" onClick={onBack} disabled={isLoading}><ArrowLeft size={14} /> Volver a iniciar sesión</button>
    </form>
  </AuthLayout>;
}

export function AuthLoadingPage({ message = "Cargando permisos..." }) {
  return <AuthStatusLayout title="Un momento" description={message}>
    <p className="login-note"><RefreshCw size={14} className="login-spin" /> Preparando su sesión.</p>
  </AuthStatusLayout>;
}

export function DataLoadingScreen({ message = "Cargando datos operativos..." }) {
  return <AuthStatusLayout title="Cargando información" description={message}>
    <p className="login-note"><RefreshCw size={14} className="login-spin" /> Espere mientras se valida la información de Supabase.</p>
  </AuthStatusLayout>;
}

export function DataLoadErrorScreen({ message, onRetry, onLogout, isRetrying }) {
  return <AuthStatusLayout title="No se pudieron cargar los datos" description="Ocurrió un problema al cargar los datos operativos.">
    <div className="data-state-alert"><AlertTriangle size={18} /><p>{message || "Revise la conexión y vuelva a intentar."}</p></div>
    <div className="login-status-actions">
      <Button type="button" variant="outline" onClick={onLogout} disabled={isRetrying}><LogOut size={16} /> Cerrar sesión</Button>
      <Button type="button" onClick={onRetry} disabled={isRetrying}><RefreshCw size={16} /> {isRetrying ? "Reintentando..." : "Reintentar"}</Button>
    </div>
  </AuthStatusLayout>;
}
