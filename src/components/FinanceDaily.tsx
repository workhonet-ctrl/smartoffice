import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, ChevronDown, ChevronRight, X } from 'lucide-react';

type DailyOrder = {
  id: string; order_no: string; channel: string | null;
  total_thb: number; shipping_thb: number | null;
  raw_prod: string | null; promo_ids: string[] | null;
  quantities: string | null; quantity: number | null;
  customers: { name: string } | null;
  // ต้นทุนต่อออเดอร์ (คำนวณแล้ว)
  _cost_goods?: number; _cost_ship?: number;
  _cost_box?: number; _cost_bubble?: number;
  _items?: { name: string; qty: number; cost: number }[];
};

type DaySummary = {
  date: string;
  orders: DailyOrder[];
  revenue: number;
  cost_goods: number;
  cost_ship: number;
  cost_box: number;
  cost_bubble: number;
  cost_ad: number;
  cost_other: number;
  profit: number;
};

type AdCost = { id: string; expense_date: string; channel: string | null; amount_thb: number; description: string };

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// แยกจำนวนชิ้นจริงจากชื่อ promo เช่น "1 แถม 1" → 2, "2 แถม 2" → 4
function extractPieces(promoName: string): number {
  const t = promoName.match(/(\d+)\s*แถม\s*(\d+)/);
  if (t) return parseInt(t[1]) + parseInt(t[2]);
  const u = promoName.match(/\(?\s*(\d+)\s*(?:กระป๋อง|ชิ้น|แพ็ค|ซอง|กล่อง|ขวด|ถุง|อัน)/i);
  if (u) return parseInt(u[1]);
  return 1;
}

export default function FinanceDaily() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [summaries, setSummaries] = useState<DaySummary[]>([]);
  const [loading, setLoading]     = useState(false);
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());
  // Step 3: filter ลูกค้า
  const [filterCustomer, setFilterCustomer] = useState('');

  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  useEffect(() => { loadData(); }, [dateFrom, dateTo]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: orders } = await supabase.from('orders')
        .select('id, order_no, order_date, channel, total_thb, shipping_thb, raw_prod, promo_ids, quantities, quantity, customers(name)')
        .gte('order_date', dateFrom).lte('order_date', dateTo)
        .neq('order_status', 'รอคีย์ออเดอร์')
        .order('order_date');

      const { data: adCosts } = await supabase.from('finance_expense')
        .select('id, expense_date, channel, amount_thb, description')
        .eq('category', 'ค่าโฆษณา')
        .gte('expense_date', dateFrom).lte('expense_date', dateTo);

      const { data: otherExp } = await supabase.from('finance_expense')
        .select('id, expense_date, amount_thb')
        .neq('category', 'ค่าโฆษณา')
        .gte('expense_date', dateFrom).lte('expense_date', dateTo);

      // ── Batch load promos ครั้งเดียว ──
      const allPromoIds = [...new Set(
        (orders || []).flatMap((o: any) => o.promo_ids || []).filter(Boolean)
      )];
      const promoMap: Record<string, any> = {};
      if (allPromoIds.length > 0) {
        const { data: promos } = await supabase.from('products_promo')
          .select('id, name, ship_thb, box_id, bubble_id, boxes(price_thb), bubbles(price_thb, length_cm), products_master(cost_thb, name)')
          .in('id', allPromoIds);
        (promos || []).forEach((p: any) => { promoMap[p.id] = p; });
      }

      // สร้าง range วันที่
      const dates: string[] = [];
      let cur = new Date(dateFrom);
      const end = new Date(dateTo);
      while (cur <= end) {
        dates.push(cur.toISOString().split('T')[0]);
        cur.setDate(cur.getDate() + 1);
      }

      const result: DaySummary[] = [];
      for (const date of dates) {
        const dayOrders = (orders || []).filter((o: any) =>
          String(o.order_date || '').split('T')[0] === date
        ) as DailyOrder[];

        let costGoods = 0, costShip = 0, costBox = 0, costBubble = 0;
        for (const o of dayOrders) {
          if (!o.promo_ids?.length) continue;
          const qtys = String(o.quantities || o.quantity || '1').split('|');
          let oGoods = 0, oShip = 0, oBox = 0, oBub = 0;
          const items: { name: string; qty: number; cost: number }[] = [];
          for (let i = 0; i < o.promo_ids.length; i++) {
            const promo = promoMap[o.promo_ids[i]];
            if (!promo) continue;
            const qty    = Number(qtys[i]?.trim()) || 1;   // จำนวน promo packs
            const pieces = extractPieces(promo.name) * qty; // ชิ้นจริง
            const master = promo.products_master;
            const box    = promo.boxes;
            const bub    = promo.bubbles;
            const goodsCost = master?.cost_thb ? Number(master.cost_thb) * pieces : 0;
            const shipCost  = promo.ship_thb ? Number(promo.ship_thb) * qty : 0;
            if (goodsCost) oGoods += goodsCost;
            if (shipCost)  oShip  += shipCost;
            if (i === 0 && box?.price_thb) oBox += Number(box.price_thb);
            if (i === 0 && bub?.price_thb && bub?.length_cm > 0) oBub += Number(bub.price_thb);
            const promoName  = master?.name || (o.raw_prod||'').split('|')[i]?.trim() || '-';
            const unitCost   = master?.cost_thb ? Number(master.cost_thb) : 0;
            items.push({ name: promoName, qty: pieces, cost: unitCost * pieces });
          }
          o._cost_goods  = oGoods;
          o._cost_ship   = oShip;
          o._cost_box    = oBox;
          o._cost_bubble = oBub;
          o._items       = items;
          costGoods  += oGoods;
          costShip   += oShip;
          costBox    += oBox;
          costBubble += oBub;
        }

        const revenue   = dayOrders.reduce((s, o) => s + Number(o.total_thb), 0);
        const costAd    = (adCosts || []).filter((a: any) => String(a.expense_date).split('T')[0] === date)
          .reduce((s: number, a: any) => s + Number(a.amount_thb), 0);
        const costOther = (otherExp || []).filter((e: any) => String(e.expense_date).split('T')[0] === date)
          .reduce((s: number, e: any) => s + Number(e.amount_thb), 0);

        result.push({
          date, orders: dayOrders, revenue,
          cost_goods: costGoods, cost_ship: costShip,
          cost_box: costBox, cost_bubble: costBubble,
          cost_ad: costAd, cost_other: costOther,
          profit: revenue - costGoods - costShip - costBox - costBubble - costAd - costOther,
        });
      }
      setSummaries(result);
    } finally { setLoading(false); }
  };

  const toggle = (date: string) => setExpanded(p => { const n = new Set(p); n.has(date)?n.delete(date):n.add(date); return n; });

  // Step 3: กรองตามลูกค้า
  const filteredSummaries = filterCustomer.trim()
    ? summaries.map(day => ({
        ...day,
        orders: day.orders.filter(o =>
          (o.customers?.name || '').toLowerCase().includes(filterCustomer.toLowerCase())
        ),
      })).map(day => ({
        ...day,
        revenue:    day.orders.reduce((s, o) => s + Number(o.total_thb), 0),
        cost_goods: day.orders.reduce((s, o) => s + (o._cost_goods || 0), 0),
        cost_ship:  day.orders.reduce((s, o) => s + (o._cost_ship  || 0), 0),
        cost_box:   day.orders.reduce((s, o) => s + (o._cost_box   || 0), 0),
        cost_bubble:day.orders.reduce((s, o) => s + (o._cost_bubble|| 0), 0),
        profit: day.orders.reduce((s, o) => s + Number(o.total_thb), 0)
               - day.orders.reduce((s, o) => s + (o._cost_goods||0) + (o._cost_ship||0) + (o._cost_box||0) + (o._cost_bubble||0), 0)
               - day.cost_ad - day.cost_other,
      })).filter(day => day.orders.length > 0)
    : summaries;

  const totRevenue = filteredSummaries.reduce((s,d) => s+d.revenue, 0);
  const totProfit  = filteredSummaries.reduce((s,d) => s+d.profit, 0);
  const totOrders  = filteredSummaries.reduce((s,d) => s+d.orders.length, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="shrink-0 flex gap-2 mb-4 flex-wrap items-center">
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
        <span className="text-slate-400">–</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
        {/* Step 3: filter ลูกค้า */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">👤</span>
          <input type="text" value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)}
            placeholder="กรองตามลูกค้า (Step 3)..."
            className="pl-8 pr-4 py-2 border rounded-lg text-sm w-52 focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
        </div>
        {filterCustomer && (
          <button onClick={() => setFilterCustomer('')}
            className="px-2 py-2 bg-slate-100 text-slate-500 rounded-lg text-xs hover:bg-slate-200">✕ ล้าง</button>
        )}
        <button onClick={loadData} disabled={loading}
          className="px-3 py-2 bg-slate-200 rounded-lg hover:bg-slate-300 flex items-center gap-2 text-sm">
          <RefreshCw size={13} className={loading?'animate-spin':''}/> โหลด
        </button>
      </div>

      {/* KPI */}
      <div className="shrink-0 grid grid-cols-3 gap-3 mb-4">
        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
          <div className="text-xs text-emerald-600 font-semibold mb-1">รายรับรวม</div>
          <div className="text-xl font-bold text-emerald-700">฿{fmt(totRevenue)}</div>
          <div className="text-xs text-emerald-500">{totOrders} ออเดอร์</div>
        </div>
        <div className={`rounded-xl p-4 border ${totProfit>=0?'bg-teal-50 border-teal-200':'bg-red-50 border-red-200'}`}>
          <div className={`text-xs font-semibold mb-1 ${totProfit>=0?'text-teal-600':'text-red-600'}`}>
            {totProfit>=0?'กำไรสุทธิ':'ขาดทุน'}
          </div>
          <div className={`text-xl font-bold ${totProfit>=0?'text-teal-700':'text-red-700'}`}>
            {totProfit<0?'-':''}฿{fmt(Math.abs(totProfit))}
          </div>
          <div className={`text-xs ${totProfit>=0?'text-teal-500':'text-red-400'}`}>
            {totRevenue>0?((totProfit/totRevenue)*100).toFixed(1):0}% margin
          </div>
        </div>
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <div className="text-xs text-slate-500 font-semibold mb-1">ต้นทุนรวม</div>
          <div className="text-xl font-bold text-slate-700">฿{fmt(totRevenue - totProfit)}</div>
          <div className="text-xs text-slate-400">{summaries.length} วัน</div>
        </div>
      </div>

      {/* ตารางรายวัน */}
      <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
        <table className="text-sm w-full" style={{minWidth:'900px'}}>
          <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
            <tr>
              <th className="p-3 w-8"></th>
              <th className="p-3 text-left whitespace-nowrap">วันที่</th>
              <th className="p-3 text-center whitespace-nowrap">ออเดอร์</th>
              <th className="p-3 text-right whitespace-nowrap">รายรับ</th>
              <th className="p-3 text-right whitespace-nowrap">ต้นทุนสินค้า</th>
              <th className="p-3 text-right whitespace-nowrap">ขนส่ง</th>
              <th className="p-3 text-right whitespace-nowrap">กล่อง+บั้บ</th>
              <th className="p-3 text-right whitespace-nowrap">โฆษณา</th>
              <th className="p-3 text-right whitespace-nowrap">อื่นๆ</th>
              <th className="p-3 text-right whitespace-nowrap">กำไร</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} className="p-8 text-center text-slate-400"><RefreshCw size={16} className="animate-spin inline mr-2"/>คำนวณ...</td></tr>}
            {!loading && filteredSummaries.map(day => (
              <>
                <tr key={day.date}
                  onClick={() => day.orders.length > 0 && toggle(day.date)}
                  className={`border-b cursor-pointer hover:bg-slate-50 ${day.orders.length===0?'opacity-40':''}`}>
                  <td className="p-3 text-center text-slate-400">
                    {day.orders.length>0 ? (expanded.has(day.date)?<ChevronDown size={14}/>:<ChevronRight size={14}/>) : null}
                  </td>
                  <td className="p-3 text-sm font-medium whitespace-nowrap">
                    {new Date(day.date).toLocaleDateString('th-TH',{weekday:'short',day:'2-digit',month:'2-digit'})}
                  </td>
                  <td className="p-3 text-center">
                    <span className="px-2 py-0.5 bg-cyan-100 text-cyan-800 rounded-full text-xs font-bold">{day.orders.length}</span>
                  </td>
                  <td className="p-3 text-right font-bold text-emerald-600">฿{fmt(day.revenue)}</td>
                  <td className="p-3 text-right text-slate-600">฿{fmt(day.cost_goods)}</td>
                  <td className="p-3 text-right text-slate-600">฿{fmt(day.cost_ship)}</td>
                  <td className="p-3 text-right text-slate-600">฿{fmt(day.cost_box+day.cost_bubble)}</td>
                  <td className="p-3 text-right text-orange-600">฿{fmt(day.cost_ad)}</td>
                  <td className="p-3 text-right text-slate-600">฿{fmt(day.cost_other)}</td>
                  <td className={`p-3 text-right font-bold ${day.profit>=0?'text-teal-600':'text-red-600'}`}>
                    {day.profit<0?'-':''}฿{fmt(Math.abs(day.profit))}
                  </td>
                </tr>
                {expanded.has(day.date) && (
                  <>
                    {/* sub-header */}
                    <tr className="bg-slate-700 text-slate-300 text-[10px]">
                      <td className="py-1.5 pl-8 pr-2 whitespace-nowrap">เลขออเดอร์</td>
                      <td className="py-1.5 px-2 whitespace-nowrap">ลูกค้า</td>
                      <td className="py-1.5 px-2 whitespace-nowrap">ช่องทาง</td>
                      <td className="py-1.5 px-2 text-right whitespace-nowrap">รายรับ</td>
                      <td className="py-1.5 px-2">รายการสินค้า · จำนวน · ต้นทุน</td>
                      <td className="py-1.5 px-2 text-right whitespace-nowrap">ต้นทุนรวม</td>
                      <td className="py-1.5 px-2 text-right whitespace-nowrap">กล่อง+บั้บ</td>
                      <td className="py-1.5 px-2 text-right whitespace-nowrap">โฆษณา</td>
                      <td className="py-1.5 px-2 text-right whitespace-nowrap">อื่นๆ</td>
                      <td className="py-1.5 px-2 text-right whitespace-nowrap">กำไร</td>
                    </tr>
                    {day.orders.map(o => {
                      const itemsCost = (o._items||[]).reduce((s,it)=>s+it.cost,0);
                      const boxBub    = (o._cost_box||0)+(o._cost_bubble||0);
                      const oProfit   = Number(o.total_thb) - itemsCost - boxBub;
                      return (
                        <tr key={o.id} className="border-b bg-slate-50 hover:bg-cyan-50 text-xs">
                          <td className="py-2 pl-8 pr-2 font-mono text-cyan-700 whitespace-nowrap">{o.order_no}</td>
                          <td className="py-2 px-2 font-medium text-slate-700 whitespace-nowrap max-w-[120px] truncate">{o.customers?.name || '-'}</td>
                          <td className="py-2 px-2">
                            {o.channel
                              ? <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px] whitespace-nowrap">{o.channel}</span>
                              : <span className="text-slate-300">-</span>}
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-emerald-600 whitespace-nowrap">฿{fmt(Number(o.total_thb))}</td>
                          <td className="py-2 px-2 text-slate-600">
                            <div className="flex flex-col gap-0.5">
                              {(o._items && o._items.length > 0) ? o._items.map((item, i) => (
                                <div key={i} className="flex items-center gap-1 whitespace-nowrap">
                                  <span className="text-slate-700">{item.name}</span>
                                  <span className="text-slate-400">×{item.qty}</span>
                                  {item.cost > 0 && <span className="text-red-500 font-medium">฿{fmt(item.cost)}</span>}
                                </div>
                              )) : (
                                <span className="text-slate-400 text-[10px]">{(o.raw_prod||'').split('|').map(p=>p.trim()).filter(Boolean).join(', ')}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right text-slate-500 whitespace-nowrap">฿{fmt((o._items||[]).reduce((s,it)=>s+it.cost,0))}</td>
                          <td className="py-2 px-2 text-right text-slate-500 whitespace-nowrap">฿{fmt((o._cost_box||0)+(o._cost_bubble||0))}</td>
                          <td className="py-2 px-2 text-right text-orange-400 whitespace-nowrap">-</td>
                          <td className="py-2 px-2 text-right text-slate-400 whitespace-nowrap">-</td>
                          <td className={`py-2 px-2 text-right font-bold whitespace-nowrap ${oProfit>=0?'text-teal-600':'text-red-500'}`}>
                            {oProfit<0?'-':''}฿{fmt(Math.abs(oProfit))}
                          </td>
                        </tr>
                      );
                    })}
                  </>
                )}
              </>
            ))}
          </tbody>
          {!loading && filteredSummaries.length > 0 && (
            <tfoot className="bg-slate-50 border-t-2 border-slate-300 sticky bottom-0">
              <tr>
                <td colSpan={2} className="p-3 font-semibold text-slate-600 text-sm">
                  รวม {filteredSummaries.length} วัน
                  {filterCustomer && <span className="ml-2 text-emerald-600">· ลูกค้า: {filterCustomer}</span>}
                </td>
                <td className="p-3 text-center font-bold">{totOrders}</td>
                <td className="p-3 text-right font-bold text-emerald-600">฿{fmt(totRevenue)}</td>
                <td className="p-3 text-right font-bold">฿{fmt(filteredSummaries.reduce((s,d)=>s+d.cost_goods,0))}</td>
                <td className="p-3 text-right font-bold">฿{fmt(filteredSummaries.reduce((s,d)=>s+d.cost_ship,0))}</td>
                <td className="p-3 text-right font-bold">฿{fmt(filteredSummaries.reduce((s,d)=>s+d.cost_box+d.cost_bubble,0))}</td>
                <td className="p-3 text-right font-bold text-orange-600">฿{fmt(filteredSummaries.reduce((s,d)=>s+d.cost_ad,0))}</td>
                <td className="p-3 text-right font-bold">฿{fmt(filteredSummaries.reduce((s,d)=>s+d.cost_other,0))}</td>
                <td className={`p-3 text-right font-bold text-lg ${totProfit>=0?'text-teal-600':'text-red-600'}`}>
                  {totProfit<0?'-':''}฿{fmt(Math.abs(totProfit))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] px-5 py-4 rounded-xl shadow-2xl bg-emerald-500 text-white text-sm font-medium">
          {toast}
        </div>
      )}
    </div>
  );
}
