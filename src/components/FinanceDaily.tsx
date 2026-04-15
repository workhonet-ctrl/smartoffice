import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

const VAT_RATE = 0.05;   // 5%
const COM_RATE = 0.015;  // 1.5%

type DailyOrder = {
  id: string; order_no: string;
  total_thb: number; shipping_thb: number | null; raw_prod: string | null;
  promo_ids: string[] | null; quantities: string | null; quantity: number | null;
  customers: { name: string } | null;
  _cost_goods?: number;
  _vat?: number;
  _com?: number;
  _ship?: number;
};

type DaySummary = {
  date: string; orders: DailyOrder[];
  revenue: number;
  cost_goods: number;
  vat: number; com: number; ship: number;
  cost_ad: number; cost_other: number;
  profit: number;
};

const fmt  = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = (d: string) => new Date(d).toLocaleDateString('th-TH', { weekday:'short', day:'numeric', month:'short', year:'2-digit' });

function extractPieces(name: string) {
  const t = name.match(/(\d+)\s*แถม\s*(\d+)/);
  if (t) return parseInt(t[1]) + parseInt(t[2]);
  const u = name.match(/\(?\s*(\d+)\s*(?:กระป๋อง|ชิ้น|แพ็ค|ซอง|กล่อง|ขวด|ถุง|อัน)/i);
  if (u) return parseInt(u[1]);
  return 1;
}

export default function FinanceDaily() {
  const today = new Date().toISOString().split('T')[0];
  const [dateFrom,  setDateFrom]  = useState(() => { const d = new Date(); d.setDate(d.getDate()-6); return d.toISOString().split('T')[0]; });
  const [dateTo,    setDateTo]    = useState(today);
  const [summaries, setSummaries] = useState<DaySummary[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set());

  useEffect(() => { loadData(); }, [dateFrom, dateTo]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [{ data: orders }, { data: adCosts }, { data: otherExp }] = await Promise.all([
        supabase.from('orders')
          .select('id, order_no, order_date, total_thb, shipping_thb, raw_prod, promo_ids, quantities, quantity, customers(name)')
          .gte('order_date', dateFrom).lte('order_date', dateTo).order('order_date'),
        supabase.from('finance_expense').select('expense_date, amount_thb')
          .eq('category', 'ค่าโฆษณา').gte('expense_date', dateFrom).lte('expense_date', dateTo),
        supabase.from('finance_expense').select('expense_date, amount_thb')
          .neq('category', 'ค่าโฆษณา').gte('expense_date', dateFrom).lte('expense_date', dateTo),
      ]);

      const allIds = [...new Set((orders||[]).flatMap((o:any) => o.promo_ids||[]).filter(Boolean))];
      const promoMap: Record<string, any> = {};
      if (allIds.length > 0) {
        const { data: promos } = await supabase.from('products_promo')
          .select('id, name, boxes(price_thb), bubbles(price_thb, length_cm), products_master(cost_thb, name)')
          .in('id', allIds);
        (promos||[]).forEach((p:any) => { promoMap[p.id] = p; });
      }

      const dates: string[] = [];
      let cur = new Date(dateFrom), end = new Date(dateTo);
      while (cur <= end) { dates.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate()+1); }

      const result: DaySummary[] = dates.map(date => {
        const dayOrders = (orders||[]).filter((o:any) => String(o.order_date||'').split('T')[0] === date) as DailyOrder[];

        let sumCostGoods = 0, sumVat = 0, sumCom = 0, sumShip = 0;
        for (const o of dayOrders) {
          const rev = Number(o.total_thb) || 0;
          const vat = rev * VAT_RATE;
          const com = rev * COM_RATE;
          const ship = Number(o.shipping_thb) || 0;
          o._vat  = vat;
          o._com  = com;
          o._ship = ship;
          sumVat  += vat;
          sumCom  += com;
          sumShip += ship;

          if (o.promo_ids?.length) {
            const qtys = String(o.quantities||o.quantity||'1').split('|');
            let oGoods = 0;
            for (let i = 0; i < o.promo_ids.length; i++) {
              const promo = promoMap[o.promo_ids[i]]; if (!promo) continue;
              const qty = Number(qtys[i]?.trim())||1;
              const pieces = extractPieces(promo.name) * qty;
              const master = promo.products_master;
              const box = promo.boxes; const bub = promo.bubbles;
              oGoods += master?.cost_thb ? Number(master.cost_thb)*pieces : 0;
              if (i===0 && box?.price_thb) oGoods += Number(box.price_thb);
              if (i===0 && bub?.price_thb && bub?.length_cm>0) oGoods += Number(bub.price_thb);
            }
            o._cost_goods = oGoods;
            sumCostGoods += oGoods;
          }
        }

        const revenue   = dayOrders.reduce((s,o) => s+Number(o.total_thb), 0);
        const cost_ad   = (adCosts||[]).filter((a:any) => String(a.expense_date).split('T')[0]===date).reduce((s:number,a:any)=>s+Number(a.amount_thb),0);
        const cost_other= (otherExp||[]).filter((e:any) => String(e.expense_date).split('T')[0]===date).reduce((s:number,e:any)=>s+Number(e.amount_thb),0);
        const totalCost = sumCostGoods + sumVat + sumCom + sumShip + cost_ad + cost_other;
        return { date, orders: dayOrders, revenue, cost_goods: sumCostGoods, vat: sumVat, com: sumCom, ship: sumShip, cost_ad, cost_other, profit: revenue - totalCost };
      }).filter(d => d.orders.length > 0 || d.cost_ad > 0 || d.cost_other > 0);

      setSummaries(result);
    } finally { setLoading(false); }
  };

  const totRevenue    = summaries.reduce((s,d) => s+d.revenue, 0);
  const totCostGoods  = summaries.reduce((s,d) => s+d.cost_goods, 0);
  const totVat        = summaries.reduce((s,d) => s+d.vat, 0);
  const totCom        = summaries.reduce((s,d) => s+d.com, 0);
  const totShip       = summaries.reduce((s,d) => s+d.ship, 0);
  const totAd         = summaries.reduce((s,d) => s+d.cost_ad, 0);
  const totOther      = summaries.reduce((s,d) => s+d.cost_other, 0);
  const totProfit     = summaries.reduce((s,d) => s+d.profit, 0);
  const totOrders     = summaries.reduce((s,d) => s+d.orders.length, 0);

  const toggleExpand = (date: string) =>
    setExpanded(s => { const n = new Set(s); n.has(date) ? n.delete(date) : n.add(date); return n; });

  const setRange = (days: number) => {
    const d = new Date(); d.setDate(d.getDate()-(days-1));
    setDateFrom(d.toISOString().split('T')[0]); setDateTo(today);
  };
  const setMonth = (offset: number) => {
    const d = new Date(); d.setMonth(d.getMonth()+offset);
    const y = d.getFullYear(), m = d.getMonth();
    setDateFrom(`${y}-${String(m+1).padStart(2,'0')}-01`);
    setDateTo(`${y}-${String(m+1).padStart(2,'0')}-${new Date(y,m+1,0).getDate()}`);
  };

  const colClass = "px-3 py-2.5 text-right whitespace-nowrap";
  const thClass  = "px-3 py-2 text-right text-[10px] font-semibold text-slate-400 whitespace-nowrap";

  return (
    <div className="flex flex-col h-screen p-6 pb-2 gap-4">

      {/* Header */}
      <div className="shrink-0">
        <h2 className="text-2xl font-bold text-slate-800 mb-3">📊 บัญชีรายวัน</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
          <span className="text-slate-400">–</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
          <div className="flex gap-1">
            {[
              { l:'วันนี้',       a:() => { setDateFrom(today); setDateTo(today); } },
              { l:'7 วัน',        a:() => setRange(7)  },
              { l:'30 วัน',       a:() => setRange(30) },
              { l:'เดือนนี้',     a:() => setMonth(0)  },
              { l:'เดือนที่แล้ว', a:() => setMonth(-1) },
            ].map(b => <button key={b.l} onClick={b.a} className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs hover:bg-slate-200 whitespace-nowrap">{b.l}</button>)}
          </div>
          <button onClick={loadData} disabled={loading}
            className="px-3 py-2 bg-white border rounded-lg text-xs flex items-center gap-1.5 hover:bg-slate-50">
            <RefreshCw size={12} className={loading?'animate-spin':''}/> โหลด
          </button>
        </div>
      </div>

      {/* KPI Summary */}
      {summaries.length > 0 && (
        <div className="shrink-0 grid grid-cols-4 gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="text-xs text-emerald-600 font-semibold mb-1">รายรับรวม</div>
            <div className="text-xl font-bold text-emerald-700">฿{fmt(totRevenue)}</div>
            <div className="text-xs text-emerald-500 mt-0.5">{totOrders} ออเดอร์ · {summaries.length} วัน</div>
          </div>
          <div className="bg-slate-50 border rounded-xl p-4 space-y-1">
            <div className="text-xs text-slate-500 font-semibold mb-1.5">ต้นทุนรวม</div>
            <div className="flex justify-between text-[11px]"><span className="text-slate-400">สินค้า</span><span className="font-medium">฿{fmt(totCostGoods)}</span></div>
            <div className="flex justify-between text-[11px]"><span className="text-slate-400">VAT 5%</span><span className="font-medium">฿{fmt(totVat)}</span></div>
            <div className="flex justify-between text-[11px]"><span className="text-slate-400">COM 1.5%</span><span className="font-medium">฿{fmt(totCom)}</span></div>
            <div className="flex justify-between text-[11px]"><span className="text-slate-400">ขนส่ง</span><span className="font-medium">฿{fmt(totShip)}</span></div>
            {totAd > 0 && <div className="flex justify-between text-[11px]"><span className="text-slate-400">โฆษณา</span><span className="font-medium">฿{fmt(totAd)}</span></div>}
            {totOther > 0 && <div className="flex justify-between text-[11px]"><span className="text-slate-400">อื่นๆ</span><span className="font-medium">฿{fmt(totOther)}</span></div>}
          </div>
          <div className={`rounded-xl p-4 border ${totProfit>=0?'bg-teal-50 border-teal-200':'bg-red-50 border-red-200'}`}>
            <div className={`text-xs font-semibold mb-1 ${totProfit>=0?'text-teal-600':'text-red-500'}`}>{totProfit>=0?'กำไรสุทธิ':'ขาดทุน'}</div>
            <div className={`text-xl font-bold ${totProfit>=0?'text-teal-700':'text-red-600'}`}>{totProfit<0?'-':''}฿{fmt(Math.abs(totProfit))}</div>
            <div className={`text-xs mt-0.5 ${totProfit>=0?'text-teal-500':'text-red-400'}`}>{totRevenue>0?((totProfit/totRevenue)*100).toFixed(1):0}% margin</div>
          </div>
          <div className="bg-white border rounded-xl p-4">
            <div className="text-xs text-slate-500 font-semibold mb-1">เฉลี่ย / วัน</div>
            <div className="text-xl font-bold text-slate-700">฿{fmt(summaries.length>0?totRevenue/summaries.length:0)}</div>
            <div className="text-xs text-slate-400 mt-0.5">กำไร ฿{fmt(summaries.length>0?totProfit/summaries.length:0)}</div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-auto min-h-0 space-y-2">
        {loading && <div className="flex items-center justify-center h-40 text-slate-400"><RefreshCw size={18} className="animate-spin mr-2"/>กำลังโหลด...</div>}
        {!loading && summaries.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-slate-300 gap-2">
            <span className="text-4xl">📭</span><p className="text-sm">ไม่มีข้อมูลในช่วงวันที่นี้</p>
          </div>
        )}

        {summaries.map(day => {
          const isOpen = expanded.has(day.date);
          const margin = day.revenue > 0 ? (day.profit/day.revenue*100) : 0;
          const totalCost = day.cost_goods + day.vat + day.com + day.ship + day.cost_ad + day.cost_other;
          return (
            <div key={day.date} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">

              {/* Day header */}
              <button className="w-full px-5 py-3.5 flex items-center gap-4 hover:bg-slate-50 transition text-left"
                onClick={() => toggleExpand(day.date)}>
                <div className="shrink-0 w-28">
                  <div className="font-bold text-slate-800 text-sm">{fmtD(day.date)}</div>
                  <div className="text-xs text-slate-400">{day.orders.length} ออเดอร์</div>
                </div>
                <div className="flex-1 grid grid-cols-4 gap-3 text-xs">
                  <div><div className="text-[10px] text-slate-400 mb-0.5">รายรับ</div><div className="font-bold text-emerald-600">฿{fmt(day.revenue)}</div></div>
                  <div><div className="text-[10px] text-slate-400 mb-0.5">ต้นทุนรวม</div><div className="font-medium text-slate-600">฿{fmt(totalCost)}</div></div>
                  <div><div className="text-[10px] text-slate-400 mb-0.5">กำไร</div>
                    <div className={`font-bold ${day.profit>=0?'text-teal-600':'text-red-500'}`}>
                      {day.profit<0?'-':''}฿{fmt(Math.abs(day.profit))} <span className="text-[10px] font-normal opacity-70">({margin.toFixed(0)}%)</span>
                    </div>
                  </div>
                  <div className="hidden sm:block pt-1">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${day.profit>=0?'bg-teal-400':'bg-red-400'}`} style={{width:`${Math.min(Math.abs(margin),100)}%`}}/>
                    </div>
                  </div>
                </div>
                <div className="shrink-0 text-slate-400">{isOpen?<ChevronDown size={15}/>:<ChevronRight size={15}/>}</div>
              </button>

              {/* Expanded table */}
              {isOpen && (
                <div className="border-t border-slate-100 overflow-x-auto">
                  <table className="text-xs w-full" style={{minWidth:'900px'}}>
                    <thead>
                      <tr className="bg-slate-50 text-slate-400">
                        <th className="px-4 py-2 text-left text-[10px] font-semibold">เลขออเดอร์</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold">ลูกค้า</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold">สินค้า</th>
                        <th className={thClass}>รายรับ</th>
                        <th className={thClass}>ต้นทุนสินค้า</th>
                        <th className={thClass}>VAT 5%</th>
                        <th className={thClass}>COM 1.5%</th>
                        <th className={thClass}>ขนส่ง</th>
                        <th className={thClass}>โฆษณา</th>
                        <th className={thClass}>อื่นๆ</th>
                        <th className={thClass}>กำไร</th>
                      </tr>
                    </thead>
                    <tbody>
                      {day.orders.map(o => {
                        const vat  = o._vat  || 0;
                        const com  = o._com  || 0;
                        const ship = o._ship || 0;
                        const oProfit = Number(o.total_thb) - (o._cost_goods||0) - vat - com - ship;
                        return (
                          <tr key={o.id} className="border-t border-slate-50 hover:bg-slate-50">
                            <td className="px-4 py-2 font-mono text-blue-600 whitespace-nowrap">{o.order_no}</td>
                            <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{o.customers?.name||'-'}</td>
                            <td className="px-3 py-2 text-slate-500 max-w-[160px] truncate">{o.raw_prod||'-'}</td>
                            <td className={`${colClass} text-emerald-600 font-medium`}>฿{fmt(Number(o.total_thb))}</td>
                            <td className={`${colClass} text-slate-500`}>฿{fmt(o._cost_goods||0)}</td>
                            <td className={`${colClass} text-slate-500`}>฿{fmt(vat)}</td>
                            <td className={`${colClass} text-slate-500`}>฿{fmt(com)}</td>
                            <td className={`${colClass} text-slate-500`}>฿{fmt(ship)}</td>
                            <td className={`${colClass} text-slate-400`}>-</td>
                            <td className={`${colClass} text-slate-400`}>-</td>
                            <td className={`${colClass} font-bold ${oProfit>=0?'text-teal-600':'text-red-500'}`}>
                              {oProfit<0?'-':''}฿{fmt(Math.abs(oProfit))}
                            </td>
                          </tr>
                        );
                      })}

                      {/* แถวค่าโฆษณา/อื่นๆ ถ้ามี */}
                      {(day.cost_ad > 0 || day.cost_other > 0) && (
                        <tr className="border-t border-slate-100 bg-orange-50 text-[11px]">
                          <td className="px-4 py-2 text-orange-500 font-medium" colSpan={3}>💸 ค่าใช้จ่ายวัน</td>
                          <td className={colClass}/>
                          <td className={colClass}/>
                          <td className={colClass}/>
                          <td className={colClass}/>
                          <td className={colClass}/>
                          <td className={`${colClass} text-orange-500 font-medium`}>{day.cost_ad>0?`฿${fmt(day.cost_ad)}`:'-'}</td>
                          <td className={`${colClass} text-orange-500 font-medium`}>{day.cost_other>0?`฿${fmt(day.cost_other)}`:'-'}</td>
                          <td className={colClass}/>
                        </tr>
                      )}

                      {/* สรุปวัน */}
                      <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-[11px]">
                        <td className="px-4 py-2.5 text-slate-600" colSpan={3}>รวม {fmtD(day.date)}</td>
                        <td className={`${colClass} text-emerald-600`}>฿{fmt(day.revenue)}</td>
                        <td className={`${colClass} text-slate-600`}>฿{fmt(day.cost_goods)}</td>
                        <td className={`${colClass} text-slate-600`}>฿{fmt(day.vat)}</td>
                        <td className={`${colClass} text-slate-600`}>฿{fmt(day.com)}</td>
                        <td className={`${colClass} text-slate-600`}>฿{fmt(day.ship)}</td>
                        <td className={`${colClass} text-orange-500`}>{day.cost_ad>0?`฿${fmt(day.cost_ad)}`:'-'}</td>
                        <td className={`${colClass} text-orange-500`}>{day.cost_other>0?`฿${fmt(day.cost_other)}`:'-'}</td>
                        <td className={`${colClass} ${day.profit>=0?'text-teal-600':'text-red-500'}`}>
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
