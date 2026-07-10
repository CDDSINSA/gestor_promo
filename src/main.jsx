import React from "react";
import { createRoot } from "react-dom/client";
import PromoMVP from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PromoMVP />
  </React.StrictMode>
);
