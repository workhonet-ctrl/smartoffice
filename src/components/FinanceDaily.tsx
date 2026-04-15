import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

type DailyOrder = {
  id: string; order_no: string; channel: string | null;
  total_thb: number; raw_prod: string | null;
  promo_ids: string[] | null; quantities: string | null; quantity: number | null;
  customers: { name: string } | null;
  _cost?: number;
  _items?: { name: string; qty: number; cost: number }[];
};

type DaySummary = {
  date: string;
  orders: DailyOrder[];
  revenue: number; cost: number; profit: number;
  cost_ad: number; cost_other: number;
};

const fmt  = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = (d: string) => {
  const dt = new Date(d);
  return dt.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' });
};

function extractPieces(name: string) {
  const t = name.match(/(\d+)\s*แถม\s*(\d+)/);
  if (t) return parseInt(t[1]) + parseInt(t[2]);
  const u = name.match(/\(?\s*(\d+)\s*(?:กระป๋อง|ชิ้น|แพ็ค|ซอง|กล่อง|ขวด|ถุง|อัน)/i);
  if (u) return parseInt(u[1]);
  return 1;
}

export default function FinanceDaily() {
  const today = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().split('T')[0];
  });
  const [dateTo,   setDateTo]   = useState(today);
  const [summaries, setSummaries] = useState<DaySummary[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set());

  useEffect(() => { loadData(); }, [dateFrom, dateTo]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [{ data: orders }, { data: adCosts }, { data: otherExp }] = await Promise.all([
        supabase.from('orders')
          .select('id, order_no, order_date, channel, total_thb, raw_prod, promo_ids, quantities, quantity, customers(name)')
          .gte('order_date', dateFrom).lte('order_date', dateTo).order('order_date'),
        supabase.from('finance_expense')
          .select('expense_date, amount_thb')
          .eq('category', 'ค่าโฆษณา')
          .gte('expense_date', dateFrom).lte('expense_date', dateTo),
        supabase.from('finance_expense')
          .select('expense_date, amount_thb')
          .neq('category', 'ค่าโฆษณา')
          .gte('expense_date', dateFrom).lte('expense_date', dateTo),
      ]);

      // load promos
      const allIds = [...new Set((orders||[]).flatMap((o:any) => o.promo_ids||[]).filter(Boolean))];
      const promoMap: Record<string, any> = {};
      if (allIds.length > 0) {
        const { data: promos } = await supabase.from('products_promo')
          .select('id, name, boxes(price_thb), bubbles(price_thb, length_cm), products_master(cost_thb, name)')
          .in('id', allIds);
        (promos||[]).forEach((p:any) => { promoMap[p.id] = p; });
      }

      // build date range
      const dates: string[] = [];
      let cur = new Date(dateFrom), end = new Date(dateTo);
      while (cur <= end) { dates.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate()+1); }

      const result: DaySummary[] = dates.map(date => {
        const dayOrders = (orders||[]).filter((o:any) => String(o.order_date||'').split('T')[0] === date) as DailyOrder[];
        let totalCost = 0;
        for (const o of dayOrders) {
          if (!o.promo_ids?.length) continue;
          const qtys = String(o.quantities||o.quantity||'1').split('|');
          let oCost = 0;
          const items: {name:string;qty:number;cost:number}[] = [];
          for (let i = 0; i < o.promo_ids.length; i++) {
            const promo = promoMap[o.promo_ids[i]]; if (!promo) continue;
            const qty = Number(qtys[i]?.trim())||1;
            const pieces = extractPieces(promo.name) * qty;
            const master = promo.products_master;
            const box = promo.boxes; const bub = promo.bubbles;
            const goodsCost = master?.cost_thb ? Number(master.cost_thb)*pieces : 0;
            const boxCost   = i===0 && box?.price_thb ? Number(box.price_thb) : 0;
            const bubCost   = i===0 && bub?.price_thb && bub?.length_cm>0 ? Number(bub.price_thb) : 0;
            oCost += goodsCost + boxCost + bubCost;
            items.push({ name: master?.name||'-', qty: pieces, cost: goodsCost });
          }
          o._cost = oCost; o._items = items;
          totalCost += oCost;
        }
        const revenue    = dayOrders.reduce((s,o) => s+Number(o.total_thb), 0);
        const cost_ad    = (adCosts||[]).filter((a:any) => String(a.expense_date).split('T')[0]===date).reduce((s:number,a:any)=>s+Number(a.amount_thb),0);
        const cost_other = (otherExp||[]).filter((e:any) => String(e.expense_date).split('T')[0]===date).reduce((s:number,e:any)=>s+Number(e.amount_thb),0);
        const cost = totalCost + cost_ad + cost_other;
        return { date, orders: dayOrders, revenue, cost, profit: revenue-cost, cost_ad, cost_other };
      }).filter(d => d.orders.length > 0 || d.cost_ad > 0 || d.cost_other > 0);

      setSummaries(result);
    } finally { setLoading(false); }
  };

  const totRevenue = summaries.reduce((s,d) => s+d.revenue, 0);
  const totCost    = summaries.reduce((s,d) => s+d.cost, 0);
  const totProfit  = summaries.reduce((s,d) => s+d.profit, 0);
  const totOrders  = summaries.reduce((s,d) => s+d.orders.length, 0);

  const toggleExpand = (date: string) =>
    setExpanded(s => { const n = new Set(s); n.has(date) ? n.delete(date) : n.add(date); return n; });

  // shortcut buttons
  const setRange = (days: number) => {
    const d = new Date(); d.setDate(d.getDate() - (days-1));
    setDateFrom(d.toISOString().split('T')[0]); setDateTo(today);
  };
  const setMonth = (offset: number) => {
    const d = new Date(); d.setMonth(d.getMonth()+offset);
    const y = d.getFullYear(), m = d.getMonth();
    setDateFrom(`${y}-${String(m+1).padStart(2,'0')}-01`);
    setDateTo(`${y}-${String(m+1).padStart(2,'0')}-${new Date(y,m+1,0).getDate()}`);
  };

  return (
    <div className="flex flex-col h-screen p-6 pb-2 gap-4">

      {/* ── Header ── */}
      <div className="shrink-0">
        <h2 className="text-2xl font-bold text-slate-800 mb-3">📊 บัญชีรายวัน</h2>

        {/* Date controls */}
        <div className="flex flex-wrap gap-2 items-center">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
          <span className="text-slate-400">–</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
          <div className="flex gap-1 ml-1">
            {[
              { label: 'วันนี้', action: () => { setDateFrom(today); setDateTo(today); } },
              { label: '7 วัน',  action: () => setRange(7) },
              { label: '30 วัน', action: () => setRange(30) },
              { label: 'เดือนนี้',action: () => setMonth(0) },
              { label: 'เดือนที่แล้ว', action: () => setMonth(-1) },
            ].map(b => (
              <button key={b.label} onClick={b.action}
                className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs hover:bg-slate-200 whitespace-nowrap">
                {b.label}
              </button>
            ))}
          </div>
          <button onClick={loadData} disabled={loading}
            className="px-3 py-2 bg-white border rounded-lg text-xs flex items-center gap-1.5 hover:bg-slate-50">
            <RefreshCw size={12} className={loading?'animate-spin':''}/> โหลด
          </button>
        </div>
      </div>

      {/* ── KPI Summary ── */}
      {summaries.length > 0 && (
        <div className="shrink-0 grid grid-cols-4 gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="text-xs text-emerald-600 font-semibold mb-1">รายรับรวม</div>
            <div className="text-2xl font-bold text-emerald-700">฿{fmt(totRevenue)}</div>
            <div className="text-xs text-emerald-500 mt-0.5">{totOrders} ออเดอร์</div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500 font-semibold mb-1">ต้นทุนรวม</div>
            <div className="text-2xl font-bold text-slate-700">฿{fmt(totCost)}</div>
          </div>
          <div className={`rounded-xl p-4 border ${totProfit>=0?'bg-teal-50 border-teal-200':'bg-red-50 border-red-200'}`}>
            <div className={`text-xs font-semibold mb-1 ${totProfit>=0?'text-teal-600':'text-red-500'}`}>
              {totProfit>=0?'กำไรสุทธิ':'ขาดทุน'}
            </div>
            <div className={`text-2xl font-bold ${totProfit>=0?'text-teal-700':'text-red-600'}`}>
              {totProfit<0?'-':''}฿{fmt(Math.abs(totProfit))}
            </div>
            <div className={`text-xs mt-0.5 ${totProfit>=0?'text-teal-500':'text-red-400'}`}>
              {totRevenue>0?((totProfit/totRevenue)*100).toFixed(1):0}% margin
            </div>
          </div>
          <div className="bg-white border rounded-xl p-4">
            <div className="text-xs text-slate-500 font-semibold mb-1">เฉลี่ย / วัน</div>
            <div className="text-2xl font-bold text-slate-700">
              ฿{fmt(summaries.length > 0 ? totRevenue/summaries.length : 0)}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{summaries.length} วัน</div>
          </div>
        </div>
      )}

      {/* ── Timeline ── */}
      <div className="flex-1 overflow-auto min-h-0 space-y-3">
        {loading && (
          <div className="flex items-center justify-center h-40 text-slate-400">
            <RefreshCw size={18} className="animate-spin mr-2"/> กำลังโหลด...
          </div>
        )}
        {!loading && summaries.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-slate-300 gap-2">
            <span className="text-4xl">📭</span>
            <p className="text-sm">ไม่มีข้อมูลในช่วงวันที่นี้</p>
          </div>
        )}

        {summaries.map(day => {
          const isOpen = expanded.has(day.date);
          const margin = day.revenue > 0 ? (day.profit/day.revenue*100) : 0;
          const profitColor = day.profit >= 0 ? 'text-teal-600' : 'text-red-500';
          return (
            <div key={day.date} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">

              {/* Day header — คลิกขยาย */}
              <button className="w-full px-5 py-4 flex items-center gap-4 hover:bg-slate-50 transition text-left"
                onClick={() => toggleExpand(day.date)}>

                {/* วันที่ */}
                <div className="shrink-0 w-28">
                  <div className="font-bold text-slate-800 text-sm">{fmtD(day.date)}</div>
                  <div className="text-xs text-slate-400">{day.orders.length} ออเดอร์</div>
                </div>

                {/* เมตริก */}
                <div className="flex-1 grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-[10px] text-slate-400 mb-0.5">รายรับ</div>
                    <div className="font-bold text-emerald-600 text-sm">฿{fmt(day.revenue)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 mb-0.5">ต้นทุน</div>
                    <div className="font-medium text-slate-600 text-sm">฿{fmt(day.cost)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 mb-0.5">กำไร</div>
                    <div className={`font-bold text-sm ${profitColor}`}>
                      {day.profit < 0 ? '-' : ''}฿{fmt(Math.abs(day.profit))}
                      <span className="text-[10px] font-normal ml-1 opacity-70">({margin.toFixed(0)}%)</span>
                    </div>
                  </div>
                </div>

                {/* Profit bar */}
                <div className="shrink-0 w-24 hidden sm:block">
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${day.profit>=0?'bg-teal-400':'bg-red-400'}`}
                      style={{width:`${Math.min(Math.abs(margin),100)}%`}}/>
                  </div>
                </div>

                {/* chevron */}
                <div className="shrink-0 text-slate-400">
                  {isOpen ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                </div>
              </button>

              {/* Expanded: order list */}
              {isOpen && (
                <div className="border-t border-slate-100">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 text-[10px]">
                        <th className="px-5 py-2 text-left font-semibold">เลขออเดอร์</th>
                        <th className="px-3 py-2 text-left font-semibold">ลูกค้า</th>
                        <th className="px-3 py-2 text-left font-semibold">สินค้า</th>
                        <th className="px-3 py-2 text-right font-semibold">รายรับ</th>
                        <th className="px-3 py-2 text-right font-semibold">ต้นทุน</th>
                        <th className="px-5 py-2 text-right font-semibold">กำไร</th>
                      </tr>
                    </thead>
                    <tbody>
                      {day.orders.map(o => {
                        const oProfit = Number(o.total_thb) - (o._cost||0);
                        return (
                          <tr key={o.id} className="border-t border-slate-50 hover:bg-slate-50">
                            <td className="px-5 py-2.5 font-mono text-blue-600 whitespace-nowrap">{o.order_no}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">{o.customers?.name||'-'}</td>
                            <td className="px-3 py-2.5 text-slate-500 max-w-[200px] truncate">{o.raw_prod||'-'}</td>
                            <td className="px-3 py-2.5 text-right text-emerald-600 font-medium">฿{fmt(Number(o.total_thb))}</td>
                            <td className="px-3 py-2.5 text-right text-slate-500">฿{fmt(o._cost||0)}</td>
                            <td className={`px-5 py-2.5 text-right font-bold ${oProfit>=0?'text-teal-600':'text-red-500'}`}>
                              {oProfit<0?'-':''}฿{fmt(Math.abs(oProfit))}
                            </td>
                          </tr>
                        );
                      })}
                      {/* ค่าใช้จ่ายวันนั้น */}
                      {(day.cost_ad > 0 || day.cost_other > 0) && (
                        <tr className="border-t border-slate-100 bg-orange-50">
                          <td className="px-5 py-2 text-orange-500 font-medium" colSpan={2}>💸 ค่าใช้จ่าย</td>
                          <td className="px-3 py-2 text-orange-400 text-[10px]">
                            {day.cost_ad>0 && `โฆษณา ฿${fmt(day.cost_ad)}`}
                            {day.cost_ad>0 && day.cost_other>0 && ' · '}
                            {day.cost_other>0 && `อื่นๆ ฿${fmt(day.cost_other)}`}
                          </td>
                          <td className="px-3 py-2"/>
                          <td className="px-3 py-2 text-right text-orange-500 font-medium">-฿{fmt(day.cost_ad+day.cost_other)}</td>
                          <td className="px-5 py-2"/>
                        </tr>
                      )}
                      {/* สรุปวัน */}
                      <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-xs">
                        <td className="px-5 py-2.5 text-slate-500" colSpan={3}>รวมวันที่ {fmtD(day.date)}</td>
                        <td className="px-3 py-2.5 text-right text-emerald-600">฿{fmt(day.revenue)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-500">฿{fmt(day.cost)}</td>
                        <td className={`px-5 py-2.5 text-right ${day.profit>=0?'text-teal-600':'text-red-500'}`}>
                          {day.profit<0?'-':''}฿{fmt(Math.abs(day.profit))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
