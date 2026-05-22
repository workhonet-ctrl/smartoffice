// ============================================================
// useShipCostMap.ts — hooks ดึงค่าส่งจริงจาก shipping tables
// ============================================================
import { useState, useEffect } from 'react';
import { supabase } from './supabase';

// ── tracking_no → ค่าส่งจริง (บาท) ─────────────────────────
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

// ── promo_id → ค่าส่งจริงเฉลี่ย (บาท) ──────────────────────
// คำนวณจาก orders ที่มี tracking_no + promo_ids จับคู่กับ shipping tables
// ใช้ร่วมกันใน ProductKPI และ Marketing (AdsProductList)
export type PromoShipAvgMap = Record<string, number>;

export function usePromoShipAvg(): {
  promoShipAvg: PromoShipAvgMap;
  loadingPromoShip: boolean;
  reloadPromoShip: () => Promise<void>;
} {
  const [promoShipAvg, setPromoShipAvg] = useState<PromoShipAvgMap>({});
  const [loadingPromoShip, setLoadingPromoShip] = useState(false);

  const reloadPromoShip = async () => {
    setLoadingPromoShip(true);
    try {
      // 1) ดึงค่าส่งจาก Flash + MYORDER (tracking → cost)
      const [{ data: flash }, { data: myorder }] = await Promise.all([
        supabase.from('shipping_flash').select('tracking, total_thb'),
        supabase.from('shipping_myorder').select('tracking, total_thb'),
      ]);
      const trackMap: Record<string, number> = {};
      [...(flash || []), ...(myorder || [])].forEach((r: any) => {
        if (r.tracking) trackMap[r.tracking] = Number(r.total_thb || 0);
      });

      // 2) ดึง orders ที่มี tracking + promo_ids
      const { data: orders } = await supabase
        .from('orders')
        .select('tracking_no, promo_ids')
        .not('tracking_no', 'is', null);

      // 3) แจกค่าส่งให้ทุก promo ในออเดอร์นั้น (หาร promo จำนวน)
      const promoShip: Record<string, number[]> = {};
      (orders || []).forEach((o: any) => {
        const cost = trackMap[o.tracking_no];
        if (!cost) return;
        const promos = o.promo_ids || [];
        const perPromo = cost / Math.max(promos.length, 1);
        promos.forEach((pid: string) => {
          if (!promoShip[pid]) promoShip[pid] = [];
          promoShip[pid].push(perPromo);
        });
      });

      // 4) เฉลี่ยต่อ promo_id
      const avgMap: PromoShipAvgMap = {};
      Object.entries(promoShip).forEach(([pid, costs]) => {
        avgMap[pid] = costs.reduce((s, v) => s + v, 0) / costs.length;
      });

      setPromoShipAvg(avgMap);
    } finally {
      setLoadingPromoShip(false);
    }
  };

  useEffect(() => { reloadPromoShip(); }, []);

  return { promoShipAvg, loadingPromoShip, reloadPromoShip };
}
