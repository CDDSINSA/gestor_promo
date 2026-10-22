import React from "react";
import { Home } from "lucide-react";
import { Button, Card, CardContent, Header } from "../../../components/ui";

// Se muestra si se llega a Promociones sin haber elegido una campaña comercial en Inicio.
export default function PromosCampaignRequired({ onGoHome }) {
  return (
    <div>
      <Header title="Carga de promociones" subtitle="Primero elija la campaña comercial en la que va a trabajar." />
      <Card>
        <CardContent className="data-state-card">
          <div className="empty-state">
            No hay una campaña comercial seleccionada. Vaya a Inicio y use "Trabajar catalogo" en la campaña correcta
            para cargar sus promociones.
          </div>
          <div className="button-row">
            <Button type="button" onClick={onGoHome}><Home size={16}/> Ir a Inicio</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
