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
import { Button, Card, CardContent } from "./ui";

function AuthBrand({ message }) {
  return <div className="login-brand"><img className="brand-logo" src={sinsaLogo} alt="SINSA" /><div><h1>Gestor de Promociones</h1><p>{message}</p></div></div>;
}

export function LoginPage({ onLogin, onForgotPassword, loginStatus, connectionStatus }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const isLoading = loginStatus.type === "loading";
  const submit = (event) => {
    event.preventDefault();
    onLogin(email, password);
  };

  return <div className="login-shell"><Card className="login-card"><CardContent><AuthBrand message="Ingrese con su usuario autorizado." /><form className="login-form" onSubmit={submit}><label className="field"><span>Correo</span><input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label><label className="field"><span>Contraseña</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>{connectionStatus && <p className="login-status">{connectionStatus}</p>}{loginStatus.message && <p className={classNames("login-status", loginStatus.type === "error" && "error")}>{loginStatus.message}</p>}<div className="button-row"><Button type="submit" disabled={isLoading}><LogIn size={16}/> {isLoading ? "Ingresando..." : "Ingresar"}</Button><Button type="button" variant="outline" onClick={onForgotPassword} disabled={isLoading}><KeyRound size={16}/> Olvide mi contraseña</Button></div></form></CardContent></Card></div>;
}

export function ForgotPasswordPage({ onSubmit, onBack, recoveryStatus, connectionStatus }) {
  const [email, setEmail] = useState("");
  const isLoading = recoveryStatus.type === "loading";
  const submit = (event) => {
    event.preventDefault();
    onSubmit(email);
  };

  return <div className="login-shell"><Card className="login-card"><CardContent><AuthBrand message="Recupere el acceso con su correo corporativo." /><form className="login-form" onSubmit={submit}><label className="field"><span>Correo</span><input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label><p className="login-status"><Mail size={14}/> Se enviara un enlace para crear una nueva contraseña.</p>{connectionStatus && <p className="login-status">{connectionStatus}</p>}{recoveryStatus.message && <p className={classNames("login-status", recoveryStatus.type === "error" && "error", recoveryStatus.type === "success" && "success")}>{recoveryStatus.message}</p>}<div className="button-row"><Button type="button" variant="outline" onClick={onBack} disabled={isLoading}><ArrowLeft size={16}/> Volver</Button><Button type="submit" disabled={isLoading}><RefreshCw size={16}/> {isLoading ? "Enviando..." : "Enviar enlace"}</Button></div></form></CardContent></Card></div>;
}

export function ResetPasswordPage({ recoverySession, recoveryUser, onSubmit, onBack, recoveryStatus, connectionStatus }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const isLoading = recoveryStatus.type === "loading";
  const email = recoveryUser?.email || recoverySession?.user_email || "";
  const submit = (event) => {
    event.preventDefault();
    onSubmit(password, confirmPassword);
  };

  return <div className="login-shell"><Card className="login-card"><CardContent><AuthBrand message="Defina una nueva contraseña para continuar." /><form className="login-form" onSubmit={submit}><div className="recovery-info"><ShieldAlert size={16}/> {email ? `Restableciendo acceso para ${email}` : "Restableciendo acceso con enlace de recuperacion."}</div><label className="field"><span>Nueva contraseña</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label><label className="field"><span>Confirmar contraseña</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></label>{connectionStatus && <p className="login-status">{connectionStatus}</p>}{recoveryStatus.message && <p className={classNames("login-status", recoveryStatus.type === "error" && "error", recoveryStatus.type === "success" && "success")}>{recoveryStatus.message}</p>}<div className="button-row"><Button type="button" variant="outline" onClick={onBack} disabled={isLoading}><ArrowLeft size={16}/> Volver</Button><Button type="submit" disabled={isLoading}><KeyRound size={16}/> {isLoading ? "Guardando..." : "Actualizar contraseña"}</Button></div></form></CardContent></Card></div>;
}

export function AuthLoadingPage({ message = "Cargando permisos..." }) {
  return <div className="login-shell"><Card className="login-card"><CardContent><AuthBrand message={message} /></CardContent></Card></div>;
}

export function DataLoadingScreen({ message = "Cargando datos operativos..." }) {
  return <div className="login-shell"><Card className="login-card data-state-card"><CardContent><AuthBrand message={message} /><p className="login-status"><RefreshCw size={14}/> Espere mientras se valida la informacion de Supabase.</p></CardContent></Card></div>;
}

export function DataLoadErrorScreen({ message, onRetry, onLogout, isRetrying }) {
  return <div className="login-shell"><Card className="login-card data-state-card"><CardContent><AuthBrand message="No se pudieron cargar los datos operativos." /><div className="data-state-alert"><AlertTriangle size={18}/><p>{message || "Revise la conexion y vuelva a intentar."}</p></div><div className="button-row"><Button type="button" onClick={onRetry} disabled={isRetrying}><RefreshCw size={16}/> {isRetrying ? "Reintentando..." : "Reintentar"}</Button><Button type="button" variant="outline" onClick={onLogout} disabled={isRetrying}><LogOut size={16}/> Cerrar sesion</Button></div></CardContent></Card></div>;
}
