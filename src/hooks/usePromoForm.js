import { useState } from "react";

function getInitialBulkColumn(promoType) {
  if (promoType === "Precio fijo") return "precioAhora";
  if (promoType === "Descuento") return "descuento";
  return "sku";
}

export function usePromoForm({ initialComprador = "", initialTipoPromo = "Descuento" } = {}) {
  const initialPromoType = initialTipoPromo || "Descuento";
  const [comprador, setComprador] = useState(initialComprador || "");
  const [tipoActivo, setTipoActivo] = useState(initialPromoType);
  const [search, setSearch] = useState("");
  const [bulkColumn, setBulkColumn] = useState(getInitialBulkColumn(initialPromoType));
  const [bulkText, setBulkText] = useState("");
  const [bulkPreview, setBulkPreview] = useState([]);
  const [segmentMode, setSegmentMode] = useState(false);
  const [selectedSegments, setSelectedSegments] = useState([]);
  const [comboDraft, setComboDraft] = useState({ group: "", role: "principal", sku: "", cantidad: 1, beneficio: "descuento", valor: "" });
  const [showActivityComment, setShowActivityComment] = useState(false);
  const [activityCommentDraft, setActivityCommentDraft] = useState("");
  const segmentText = segmentMode && selectedSegments.length ? selectedSegments.join(" | ") : "";

  return {
    comprador,
    setComprador,
    tipoActivo,
    setTipoActivo,
    search,
    setSearch,
    bulkColumn,
    setBulkColumn,
    bulkText,
    setBulkText,
    bulkPreview,
    setBulkPreview,
    segmentMode,
    setSegmentMode,
    selectedSegments,
    setSelectedSegments,
    comboDraft,
    setComboDraft,
    showActivityComment,
    setShowActivityComment,
    activityCommentDraft,
    setActivityCommentDraft,
    segmentText,
  };
}
