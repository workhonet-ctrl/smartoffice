import { useState, useEffect, type ChangeEvent } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, ChevronDown, ChevronRight, Plus, X, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

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

  // Ad cost form
  const [showAdModal, setShowAdModal] = useState(false);
  const [adDate, setAdDate]   = useState(new Date().toISOString().split('T')[0]);
  const [adChannel, setAdChannel] = useState('');
  const [adAmount, setAdAmount] = useState('');
  const [adNote, setAdNote]   = useState('');
  const [savingAd, setSavingAd] = useState(false);
  const [uploading, setUploading] = useState(false);
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

  const handleAddAd = async () => {
    if (!adAmount) return;
    setSavingAd(true);
    await supabase.from('finance_expense').insert([{
      category: 'ค่าโฆษณา', description: adNote || `ค่าโฆษณา${adChannel ? ` ${adChannel}` : ''}`,
      amount_thb: Number(adAmount), expense_date: adDate,
      channel: adChannel || null,
    }]);
    showToast('✓ บันทึกค่าโฆษณาสำเร็จ');
    setSavingAd(false); setShowAdModal(false);
    setAdAmount(''); setAdNote(''); setAdChannel('');
    loadData();
  };

  // Upload ค่าโฆษณาจากไฟล์ Excel
  const handleAdUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type:'array', cellDates:true });
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:'' });
      let count = 0;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const date    = row[0] instanceof Date ? row[0].toISOString().split('T')[0] : String(row[0]).split('T')[0];
        const channel = String(row[1] || '').trim();
        const amount  = Number(row[2]);
        const note    = String(row[3] || '').trim();
        if (!date || !amount) continue;
        await supabase.from('finance_expense').insert([{
          category:'ค่าโฆษณา', description: note||`ค่าโฆษณา${channel?` ${channel}`:''}`,
          amount_thb: amount, expense_date: date, channel: channel||null,
        }]);
        count++;
      }
      showToast(`✓ นำเข้าค่าโฆษณา ${count} รายการ`);
      loadData();
    } finally { setUploading(false); e.target.value = ''; }
  };

  const toggle = (date: string) => setExpanded(p => { const n = new Set(p); n.has(date)?n.delete(date):n.add(date); return n; });

  const totRevenue = summaries.reduce((s,d) => s+d.revenue, 0);
  const totProfit  = summaries.reduce((s,d) => s+d.profit, 0);
  const totOrders  = summaries.reduce((s,d) => s+d.orders.length, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="shrink-0 flex gap-2 mb-4 flex-wrap items-center">
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
        <span className="text-slate-400">–</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
        <button onClick={loadData} disabled={loading}
          className="px-3 py-2 bg-slate-200 rounded-lg hover:bg-slate-300 flex items-center gap-2 text-sm">
          <RefreshCw size={13} className={loading?'animate-spin':''}/> โหลด
        </button>
        <button onClick={() => setShowAdModal(true)}
          className="px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 flex items-center gap-2 text-sm">
          <Plus size={13}/> เพิ่มค่าโฆษณา
        </button>
        <label className={`px-3 py-2 rounded-lg flex items-center gap-2 text-sm cursor-pointer ${uploading?'bg-slate-200 text-slate-400':'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}`}>
          <Upload size={13}/> {uploading?'กำลังนำเข้า...':'นำเข้าค่าโฆษณา (.xlsx)'}
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleAdUpload} disabled={uploading}/>
        </label>
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
            {!loading && summaries.map(day => (
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
          {!loading && summaries.length > 0 && (
            <tfoot className="bg-slate-50 border-t-2 border-slate-300 sticky bottom-0">
              <tr>
                <td colSpan={2} className="p-3 font-semibold text-slate-600 text-sm">รวม {summaries.length} วัน</td>
                <td className="p-3 text-center font-bold">{totOrders}</td>
                <td className="p-3 text-right font-bold text-emerald-600">฿{fmt(totRevenue)}</td>
                <td className="p-3 text-right font-bold">฿{fmt(summaries.reduce((s,d)=>s+d.cost_goods,0))}</td>
                <td className="p-3 text-right font-bold">฿{fmt(summaries.reduce((s,d)=>s+d.cost_ship,0))}</td>
                <td className="p-3 text-right font-bold">฿{fmt(summaries.reduce((s,d)=>s+d.cost_box+d.cost_bubble,0))}</td>
                <td className="p-3 text-right font-bold text-orange-600">฿{fmt(summaries.reduce((s,d)=>s+d.cost_ad,0))}</td>
                <td className="p-3 text-right font-bold">฿{fmt(summaries.reduce((s,d)=>s+d.cost_other,0))}</td>
                <td className={`p-3 text-right font-bold text-lg ${totProfit>=0?'text-teal-600':'text-red-600'}`}>
                  {totProfit<0?'-':''}฿{fmt(Math.abs(totProfit))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Modal ค่าโฆษณา */}
      {showAdModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-slate-800">เพิ่มค่าโฆษณา</h3>
              <button onClick={() => setShowAdModal(false)}><X size={20} className="text-slate-400"/></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">วันที่ *</label>
                  <input type="date" value={adDate} onChange={e=>setAdDate(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ยอด (฿) *</label>
                  <input type="number" value={adAmount} onChange={e=>setAdAmount(e.target.value)}
                    placeholder="0.00" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"/>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">เพจ / ช่องทาง</label>
                <input value={adChannel} onChange={e=>setAdChannel(e.target.value)}
                  placeholder="เช่น Facebook, TikTok..." className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">หมายเหตุ</label>
                <input value={adNote} onChange={e=>setAdNote(e.target.value)}
                  placeholder="รายละเอียด..." className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"/>
              </div>
              <div className="bg-indigo-50 rounded-lg p-3 text-xs text-indigo-600">
                <div className="font-semibold mb-1">รูปแบบไฟล์ Excel สำหรับนำเข้า:</div>
                <div>Col A: วันที่ | Col B: เพจ | Col C: ยอด | Col D: หมายเหตุ</div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowAdModal(false)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm hover:bg-slate-300">ยกเลิก</button>
              <button onClick={handleAddAd} disabled={!adAmount||savingAd}
                className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 font-medium">
                {savingAd?'กำลังบันทึก...':'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] px-5 py-4 rounded-xl shadow-2xl bg-emerald-500 text-white text-sm font-medium">
          {toast}
        </div>
      )}
    </div>
  );
}
