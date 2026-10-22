import { callRpc } from "./http";
import { validateBroadcast } from "../../features/notifications/broadcast";

export async function sendBroadcast(connection, { title, message, requestId }) {
  const error = validateBroadcast(title, message);
  if (error) throw new Error(error);
  return callRpc(connection, "send_admin_broadcast", {
    p_titulo: title.trim(), p_mensaje: message.trim(), p_request_id: requestId,
  });
}
