import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getShipmentsApi } from "./shipmentsApi.js";
import { autoStageAfterTick, isActive } from "./shipmentsLogic.js";

// Shared shipments state. `api` can be injected (tests, mock); otherwise the real/mock API is used.
// `source` is the server's data source ("sheet" | "postgres", null while unknown); with "sheet" the
// shipments live in this browser and need no admin token.
export function useShipments({ items = [], api: injectedApi, source = "postgres" } = {}) {
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const local = !injectedApi && source === "sheet";
  const api = useMemo(
    () => injectedApi || (source ? getShipmentsApi(() => itemsRef.current.map(toMockItem), source) : null),
    [injectedApi, source]
  );
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    if (!api) return;
    try {
      setError("");
      setShipments(await api.list("all"));
    } catch (err) {
      setError(err.status === 503 ? "Shipments are unavailable: the database is not configured." : err.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Browser shipments are read once the inventory is in, so old lines can be matched to it.
  const inventoryReady = items.length > 0;
  useEffect(() => {
    reload();
  }, [reload, local && inventoryReady]);

  // Runs a write, then refreshes. Returns {ok, error}. Errors never throw into the UI.
  const run = useCallback(
    async (operation) => {
      setNotice("");
      if (!api) return { ok: false, error: "Shipments are still loading." };
      try {
        const result = await operation(api);
        await reload();
        return { ok: true, result };
      } catch (err) {
        const message = err.status === 403 || err.status === 401 ? "Enter the admin token to edit shipments." : err.message;
        setNotice(message);
        return { ok: false, error: message, status: err.status };
      }
    },
    [api, reload]
  );

  const actions = useMemo(
    () => ({
      create: (body) => run((a) => a.create(body)),
      patch: (id, body) => run((a) => a.patch(id, body)),
      setLines: (id, lines) => run((a) => a.putLines(id, lines)),
      // Tick a line, then move the stage if the ticks imply a different active stage.
      tick: (shipment, line, flags) =>
        run(async (a) => {
          const updated = await a.patchLine(shipment.id, line.id, flags);
          const lines = (updated?.lines || shipment.lines).map((l) => (l.id === line.id ? { ...l, ...flags } : l));
          const target = isActive(shipment) ? autoStageAfterTick(shipment, lines) : null;
          if (target) {
            await a.patch(shipment.id, { stage: target });
          }
        }),
      importOld: (body) => run((a) => a.importOld(body)),
    }),
    [run]
  );

  return { shipments, loading, error, notice, setNotice, reload, local, ...actions };
}

function toMockItem(item) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    unit_value: item.unit_value,
    expiration_date: item.expiration_date,
    lot_number: item.lot_number,
    pallet_number: item.pallet_number,
    category_box: item.category_box,
    box_number: item.box_number,
  };
}
