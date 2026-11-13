import { useEffect, useState } from "react";
import { catalogToday } from "./catalogSchedule";

export function useCatalogToday() {
  const [today, setToday] = useState(catalogToday);
  useEffect(() => {
    const refresh = () => setToday(catalogToday());
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return today;
}
