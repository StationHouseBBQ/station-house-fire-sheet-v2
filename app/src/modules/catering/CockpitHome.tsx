import { DirectorCockpit } from "./DirectorCockpit";
import { CateringOrders } from "./CateringOrders";

/**
 * Director Cockpit home — the KPI cockpit stacked above the unified catering
 * lifecycle board (quote → invoice → kitchen). One landing screen: see the
 * numbers, then work the orders.
 */
export function CockpitHome() {
  return (
    <div className="space-y-8">
      <DirectorCockpit />
      <div className="border-t border-ink-800 pt-2" />
      <CateringOrders />
    </div>
  );
}
