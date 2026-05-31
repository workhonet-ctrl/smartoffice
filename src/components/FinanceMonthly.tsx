import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

type MonthRow = {
  month: string; label: string;
  orders: number; revenue: number;
  cost_goods: number; cost_ship: number;
  cost_box: number; cost_bubble: number;
  cost_ad: number; cost_other: number;
  cost_snapshot_orders: number; cost_master_orders: number;
  profit: number;
};

const fmt  = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// ── pre-fetch promo map (แก้ N+1) ─────────────────────────────
type PromoMeta = {
  ship_thb: number;
  cost_thb: number;    // จาก products_master
  box_price: number;
  bub_price: number;
  bub_len: number;
};

async function fetchPromoMap(): Promise<Record<string, PromoMeta>> {
  const { data } = await supabase
    .from('products_promo')
    .select('id, ship_thb, boxes(price_thb), bubbles(price_thb, length_cm), products_master(cost_thb)');
  const map: Record<string, PromoMeta> = {};
  for (const p of data || []) {
    map[(p as any).id] = {
      ship_thb:  Number((p as any).ship_thb || 0),
      cost_thb:  Number((p as any).products_master?.cost_thb || 0),
      box_price: Number((p as any).boxes?.price_thb || 0),
      bub_price: Number((p as any).bubbles?.price_thb || 0),
      bub_len:   Number((p as any).bubbles?.length_cm || 0),
    };
  }
  return map;
}

export default function FinanceMonthly() {
  const [year, setYear]       = useState(new Date().getFullYear());
  const [rows, setRows]       = useState<MonthRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadData(); }, [year]);

  const loadData = async () => {
    setLoading(true);
    const from = `${year}-01-01`, to = `${year}-12-31`;

    // ดึงทุกอย่างพร้อมกันใน 3 queries แทน N+1
    const [{ data: orders }, { data: expenses }, promoMap] = await Promise.all([
      supabase
        .from('orders')
        .select('id, order_date, total_thb, promo_ids, quantities, quantity, cost_locked, cost_total_thb')
        .gte('order_date', from).lte('order_date', to)
        .not('order_status', 'in', '(รอคีย์ออเดอร์)'),
      supabase
        .from('finance_expense')
        .select('expense_date, category, amount_thb')
        .gte('expense_date', from).lte('expense_date', to),
      fetchPromoMap(),   // ดึงครั้งเดียวทั้งหมด
    ]);

    const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
    const result: MonthRow[] = [];

    for (const m of months) {
      const mStr    = `${year}-${m}`;
      const mOrders = (orders || []).filter((o: any) => String(o.order_date || '').startsWith(mStr));
      const mExp    = (expenses || []).filter((e: any) => String(e.expense_date || '').startsWith(mStr));

      const revenue   = mOrders.reduce((s: number, o: any) => s + Number(o.total_thb), 0);
      const costAd    = mExp.filter((e: any) => e.category === 'ค่าโฆษณา').reduce((s: number, e: any) => s + Number(e.amount_thb), 0);
      const costOther = mExp.filter((e: any) => e.category !== 'ค่าโฆษณา').reduce((s: number, e: any) => s + Number(e.amount_thb), 0);

      let costShip = 0, costGoods = 0, costBox = 0, costBub = 0;
      let costSnapshotOrders = 0, costMasterOrders = 0;

      // คำนวณต้นทุนจาก cost snapshot ก่อน ถ้าออเดอร์ล็อกต้นทุนแล้ว
      // ถ้ายังไม่ล็อก จึง fallback ไปใช้ products_master.cost_thb แบบเดิม
      for (const o of mOrders) {
        const pids: string[] = (o as any).promo_ids || [];
        const qtys = String((o as any).quantities || (o as any).quantity || '1').split('|');

        if ((o as any).cost_locked && Number((o as any).cost_total_thb || 0) > 0) {
          costGoods += Number((o as any).cost_total_thb || 0);
          costSnapshotOrders++;
        } else {
          costMasterOrders++;
        }

        for (let i = 0; i < pids.length; i++) {
          const pm = promoMap[pids[i]];
          if (!pm) continue;
          const qty = Number(qtys[i]?.trim()) || 1;

          // ใช้ต้นทุน master เฉพาะออเดอร์ที่ยังไม่ล็อกต้นทุน
          if (!((o as any).cost_locked && Number((o as any).cost_total_thb || 0) > 0)) {
            costGoods += pm.cost_thb * qty;
          }

          costShip  += pm.ship_thb  * qty;
          if (i === 0) {
            costBox += pm.box_price;
            if (pm.bub_len > 0) costBub += pm.bub_price;
          }
        }
      }

      const profit   = revenue - costGoods - costShip - costBox - costBub - costAd - costOther;
      const thMonth  = new Date(year, Number(m) - 1, 1).toLocaleDateString('th-TH', { month: 'long' });
      result.push({
        month: mStr, label: thMonth,
        orders: mOrders.length, revenue,
        cost_goods: costGoods, cost_ship: costShip,
        cost_box: costBox, cost_bubble: costBub,
        cost_ad: costAd, cost_other: costOther,
        cost_snapshot_orders: costSnapshotOrders,
        cost_master_orders: costMasterOrders,
        profit,
      });
    }

    setRows(result);
    setLoading(false);
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(r => ({
      เดือน: r.label, ออเดอร์: r.orders, รายรับ: r.revenue,
      ต้นทุนสินค้า: r.cost_goods, ใช้_snapshot: r.cost_snapshot_orders, ยังไม่ล็อก: r.cost_master_orders,
      ขนส่ง: r.cost_ship, 'กล่อง+บั้บ': r.cost_box + r.cost_bubble, โฆษณา: r.cost_ad,
      อื่นๆ: r.cost_other, กำไร: r.profit,
    }))), `${year}`);
    XLSX.writeFile(wb, `Finance_Monthly_${year}.xlsx`);
  };

  const totals = rows.reduce(
    (s, r) => ({
      orders: s.orders + r.orders,
      revenue: s.revenue + r.revenue,
      profit: s.profit + r.profit,
      cost: s.cost + (r.revenue - r.profit),
      snapshot: s.snapshot + r.cost_snapshot_orders,
      master: s.master + r.cost_master_orders,
    }),
    { orders: 0, revenue: 0, profit: 0, cost: 0, snapshot: 0, master: 0 }
  );
  const maxRev = Math.max(...rows.map(r => r.revenue), 1);

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="shrink-0 flex gap-3 mb-4 items-center flex-wrap">
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300">
          {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
        </select>
        <button onClick={loadData} disabled={loading}
          className="px-3 py-2 bg-slate-200 rounded-lg hover:bg-slate-300 flex items-center gap-2 text-sm">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''}/> โหลด
        </button>
        <button onClick={exportExcel} disabled={loading}
          className="px-3 py-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 flex items-center gap-2 text-sm">
          <Download size={13}/> Export Excel
        </button>
        {loading && (
          <span className="text-xs text-slate-400">กำลังคำนวณ... (เร็วกว่าเดิมมาก ✓)</span>
        )}
      </div>

      {/* Cost source summary */}
      <div className="shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
          <div className="text-xs text-emerald-600 font-semibold">ใช้ต้นทุน snapshot</div>
          <div className="text-xl font-bold text-emerald-700">{totals.snapshot.toLocaleString()} ออเดอร์</div>
          <div className="text-[11px] text-emerald-500 mt-0.5">กำไรย้อนหลังไม่เปลี่ยน</div>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
          <div className="text-xs text-amber-600 font-semibold">ยังไม่ล็อกต้นทุน</div>
          <div className="text-xl font-bold text-amber-700">{totals.master.toLocaleString()} ออเดอร์</div>
          <div className="text-[11px] text-amber-500 mt-0.5">ยังใช้ต้นทุน master เดิม</div>
        </div>
        <div className="bg-white border border-slate-100 rounded-xl p-3">
          <div className="text-xs text-slate-500 font-semibold">ต้นทุนรวมทั้งปี</div>
          <div className="text-xl font-bold text-slate-700">฿{fmt(totals.cost)}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">รวมสินค้า/ขนส่ง/กล่อง/ค่าใช้จ่าย</div>
        </div>
      </div>

      {/* Bar chart */}
      <div className="shrink-0 bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-4">
        <div className="text-xs font-semibold text-slate-500 mb-3">รายรับ vs กำไร รายเดือน</div>
        <div className="flex items-end gap-1 h-28">
          {rows.map(r => (
            <div key={r.month} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="w-full flex gap-0.5 items-end" style={{ height: '80px' }}>
                <div className="flex-1 bg-emerald-400 rounded-t" style={{ height: `${(r.revenue / maxRev) * 80}px`, minHeight: r.revenue > 0 ? '4px' : '0' }}/>
                <div className={`flex-1 rounded-t ${r.profit >= 0 ? 'bg-teal-300' : 'bg-red-300'}`} style={{ height: `${(Math.abs(r.profit) / maxRev) * 80}px`, minHeight: r.profit !== 0 ? '2px' : '0' }}/>
              </div>
              <div className="text-[9px] text-slate-400">{r.label.slice(0, 3)}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-2 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-3 h-2 bg-emerald-400 rounded inline-block"/>รายรับ</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 bg-teal-300 rounded inline-block"/>กำไร</span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
        {loading ? (
          <div className="p-8 text-center text-slate-400">
            <RefreshCw size={16} className="animate-spin inline mr-2"/>คำนวณ...
          </div>
        ) : (
          <table className="text-sm w-full" style={{ minWidth: '800px' }}>
            <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0">
              <tr>
                <th className="p-3 text-left">เดือน</th>
                <th className="p-3 text-center">ออเดอร์</th>
                <th className="p-3 text-right">รายรับ</th>
                <th className="p-3 text-right">ต้นทุนสินค้า</th>
                <th className="p-3 text-center">แหล่งต้นทุน</th>
                <th className="p-3 text-right">ขนส่ง+กล่อง</th>
                <th className="p-3 text-right">โฆษณา</th>
                <th className="p-3 text-right">อื่นๆ</th>
                <th className="p-3 text-right">กำไร</th>
                <th className="p-3 text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.month} className={`border-b hover:bg-slate-50 ${r.orders === 0 ? 'opacity-40' : ''}`}>
                  <td className="p-3 font-medium">{r.label}</td>
                  <td className="p-3 text-center text-slate-500">{r.orders}</td>
                  <td className="p-3 text-right font-bold text-emerald-600">฿{fmt(r.revenue)}</td>
                  <td className="p-3 text-right text-slate-600">฿{fmt(r.cost_goods)}</td>
                  <td className="p-3 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      {r.cost_snapshot_orders > 0 && <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold">snapshot {r.cost_snapshot_orders}</span>}
                      {r.cost_master_orders > 0 && <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full text-[10px] font-bold">master {r.cost_master_orders}</span>}
                    </div>
                  </td>
                  <td className="p-3 text-right text-slate-600">฿{fmt(r.cost_ship + r.cost_box + r.cost_bubble)}</td>
                  <td className="p-3 text-right text-orange-600">฿{fmt(r.cost_ad)}</td>
                  <td className="p-3 text-right text-slate-500">฿{fmt(r.cost_other)}</td>
                  <td className={`p-3 text-right font-bold ${r.profit >= 0 ? 'text-teal-600' : 'text-red-500'}`}>
                    {r.profit < 0 ? '-' : ''}฿{fmt(Math.abs(r.profit))}
                  </td>
                  <td className={`p-3 text-right text-xs ${r.profit >= 0 ? 'text-teal-500' : 'text-red-400'}`}>
                    {r.revenue > 0 ? ((r.profit / r.revenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-300 sticky bottom-0">
              <tr>
                <td className="p-3 font-bold">รวมปี {year}</td>
                <td className="p-3 text-center font-bold">{totals.orders}</td>
                <td className="p-3 text-right font-bold text-emerald-600">฿{fmt(totals.revenue)}</td>
                <td colSpan={5} className="p-3 text-right text-slate-500">ต้นทุนรวม ฿{fmt(totals.cost)} · snapshot {totals.snapshot} / master {totals.master}</td>
                <td className={`p-3 text-right font-bold text-lg ${totals.profit >= 0 ? 'text-teal-600' : 'text-red-500'}`}>
                  {totals.profit < 0 ? '-' : ''}฿{fmt(Math.abs(totals.profit))}
                </td>
                <td className="p-3 text-right text-xs text-slate-500">
                  {totals.revenue > 0 ? ((totals.profit / totals.revenue) * 100).toFixed(1) : 0}%
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
