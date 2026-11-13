import { cleanText } from "./config";
import { selectAll, supabaseRequest } from "./http";

export const MAX_DESIGN_REPLIES = 2;

export function loadCatalogDesignReplies(connection, commentId) {
  return selectAll(connection, "catalogo_pagina_respuestas", {
    comentario_id: `eq.${commentId}`,
    order: "numero.asc",
  });
}

export async function addCatalogDesignReply(connection, commentId, text, replies) {
  const comentario = cleanText(text);
  if (!commentId || !comentario) throw new Error("Ingrese una respuesta antes de guardar.");
  const numero = [1, 2].find((slot) => !replies.some((reply) => reply.numero === slot));
  if (!numero) throw new Error("Este comentario ya tiene las dos respuestas permitidas.");
  const rows = await supabaseRequest(connection, "/rest/v1/catalogo_pagina_respuestas", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ comentario_id: commentId, comentario, numero }),
  });
  return rows[0];
}
