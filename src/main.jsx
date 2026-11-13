import React from "react";
import { createRoot } from "react-dom/client";
import PromoMVP from "./App.jsx";
import "./styles.css";
import { reloadOnceForNewVersion } from "./utils/lazyWithRetry";

// Vite emite este evento cuando falla la precarga de un chunk (p. ej. tras un nuevo deploy).
window.addEventListener("vite:preloadError", (event) => {
  if (reloadOnceForNewVersion()) event.preventDefault();
});

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PromoMVP />
  </React.StrictMode>
);
