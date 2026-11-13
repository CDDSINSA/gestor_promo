import React from "react";
import ActivityCombobox from "../../components/ActivityCombobox";

// Márgenes usa el autocompletado compartido con su estilo propio.
export default function MarginActivityCombobox(props) {
  return <ActivityCombobox className="margin-activity-combobox" {...props}/>;
}
