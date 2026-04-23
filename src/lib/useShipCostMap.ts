// ============================================================
// useShipCostMap.ts — hook ดึงค่าส่งจริงจาก shipping tables
// ============================================================
import { useState, useEffect } from 'react';
import { supabase } from './supabase';

// tracking_no → ค่าส่งจริง (บาท)
export type ShipCostMap = Record<string, number>;

export function useShipCostMap(): {
  shipCostMap: ShipCostMap;
  loadingShipCost: boolean;
  reloadShipCost: () => Promise<void>;
} {
  const [shipCostMap, setShipCostMap] = useState<ShipCostMap>({});
  const [loadingShipCost, setLoadingShipCost] = useState(false);

  const reloadShipCost = async () => {
    setLoadingShipCost(true);
    try {
      const [{ data: flash }, { data: myorder }] = await Promise.all([
        supabase.from('shipping_flash').select('tracking, total_thb'),
        supabase.from('shipping_myorder').select('tracking, total_thb'),
      ]);
      const map: ShipCostMap = {};
      [...(flash || []), ...(myorder || [])].forEach((r: any) => {
        if (r.tracking) map[r.tracking] = Number(r.total_thb || 0);
      });
      setShipCostMap(map);
    } finally {
      setLoadingShipCost(false);
    }
  };

  useEffect(() => { reloadShipCost(); }, []);

  return { shipCostMap, loadingShipCost, reloadShipCost };
}
