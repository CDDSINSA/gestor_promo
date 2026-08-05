import { useState } from "react";

export function useNotifications() {
  const [pendingSaveAction, setPendingSaveAction] = useState(null);
  const [successToast, setSuccessToast] = useState(null);

  return {
    pendingSaveAction,
    setPendingSaveAction,
    successToast,
    setSuccessToast,
  };
}
