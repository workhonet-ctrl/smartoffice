import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle, Package, ClipboardList } from 'lucide-react';

type PackOrder = {
  id: string;
  order_no: string;
  order_date: string | null;
  order_time: string | null;
  raw_prod: string | null;
  quantities: string | null;
  quantity: number | null;
  promo_ids: string[] | null;
  customers: { name: string; tel: string } | null;
  promos: PromoDetail[];
};

type PromoDetail = {
  id: string;
  name: string;
  short_name: string | null;
  qty: number;
  box_name: string;
  box_id: string;
  bubble_name: string;
  bubble_id: string;
};

// สำหรับ multi-product override
type BoxBubbleOverride = Record<string, { box_id: string; bubble_id: string }>;

function extractQty(name: string): number {
  const t = name.match(/(\d+)\s*แถม\s*(\d+)/);
  if (t) return parseInt(t[1]) + parseInt(t[2]);
  const u = name.match(/\(?\s*(\d+)\s*(?:กระป๋อง|ชิ้น|แพ็ค|ซอง|กล่อง|ขวด|ถุง|อัน)/i);
  if (u) return parseInt(u[1]);
  const f = name.match(/(\d+)/);
  return f ? parseInt(f[1]) : 1;
}

export default function Packaging({ orderIds, onDone }: { orderIds: string[]; onDone: () => void }) {
  const [orders, setOrders] = useState<PackOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'prep' | 'summary'>('prep');
  const [responsible, setResponsible] = useState<Record<string, string>>({});
  const [override, setOverride] = useState<BoxBubbleOverride>({});
  const [boxes, setBoxes] = useState<{ id: string; name: string }[]>([]);
  const [bubbles, setBubbles] = useState<{ id: string; name: string; length_cm: number }[]>([]);
  const [finishing, setFinishing] = useState(false);
  const [packDate] = useState(new Date().toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' }));

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // โหลด orders
      const query = orderIds.length > 0
        ? supabase.from('orders').select('*, customers(name, tel)').in('id', orderIds)
        : supabase.from('orders').select('*, customers(name, tel)').eq('order_status', 'รอแพ็ค').eq('order_date', new Date().toISOString().split('T')[0]);

      const { data: ordersData } = await query.order('created_at', { ascending: true });
      if (!ordersData) return;

      // โหลด promo details สำหรับแต่ละ order
      const enriched: PackOrder[] = [];
      for (const o of ordersData) {
        const rawProds = (o.raw_prod || '').split('|').map((s: string) => s.trim()).filter(Boolean);
        const qtys     = String(o.quantities || o.quantity || '1').split('|');
        const promos: PromoDetail[] = [];

        for (let i = 0; i < rawProds.length; i++) {
          const pid = o.promo_ids?.[i];
          let promoData: any = null;
          if (pid) {
            const { data } = await supabase.from('products_promo')
              .select('id, name, short_name, box_id, bubble_id, boxes(name), bubbles(name, length_cm)')
              .eq('id', pid).maybeSingle();
            promoData = data;
          }
          const qtyFromFile = Number(qtys[i]?.trim()) || 1;
          const qty = promoData?.name ? extractQty(promoData.name) : qtyFromFile;
          promos.push({
            id: pid || `raw-${i}`,
            name: promoData?.name || rawProds[i],
            short_name: promoData?.short_name || null,
            qty,
            box_id:     promoData?.box_id || '',
            box_name:   promoData?.boxes?.name || '-',
            bubble_id:  promoData?.bubble_id || '',
            bubble_name: promoData?.bubbles ? `ยาว ${Number(promoData.bubbles.length_cm)} cm` : '-',
          });
        }
        enriched.push({ ...o, promos });
      }
      setOrders(enriched);

      // โหลด boxes และ bubbles
      const [{ data: boxData }, { data: bubData }] = await Promise.all([
        supabase.from('boxes').select('id, name').order('id'),
        supabase.from('bubbles').select('id, name, length_cm').order('id'),
      ]);
      if (boxData) setBoxes(boxData);
      if (bubData) setBubbles(bubData);
    } finally {
      setLoading(false);
    }
  };

  const isMultiProduct = (o: PackOrder) => o.promos.length > 1;

  // ── ใบสรุป: รวมสินค้าเดียวข้ามออเดอร์ ──
  const summaryGroups = (() => {
    // แยก single vs multi
    const singleOrders = orders.filter(o => !isMultiProduct(o));
    const multiOrders  = orders.filter(o => isMultiProduct(o));

    // รวม single orders ที่มีสินค้าเดียวกัน
    const grouped: Record<string, { promoId: string; name: string; box_name: string; box_id: string; bubble_name: string; bubble_id: string; count: number }> = {};
    for (const o of singleOrders) {
      const p = o.promos[0];
      if (!p) continue;
      const key = p.id;
      if (grouped[key]) {
        grouped[key].count++;
      } else {
        grouped[key] = { promoId: p.id, name: p.short_name || p.name, box_name: p.box_name, box_id: p.box_id, bubble_name: p.bubble_name, bubble_id: p.bubble_id, count: 1 };
      }
    }

    return { grouped: Object.values(grouped), multiOrders };
  })();

  const handleFinish = async () => {
    setFinishing(true);
    const ids = orders.map(o => o.id);
    await supabase.from('orders').update({ order_status: 'ปริ้นแล้ว' }).in('id', ids);
    setFinishing(false);
    onDone();
  };

  if (loading) return <div className="p-6 flex items-center gap-2 text-slate-500"><Package size={18} className="animate-bounce"/> กำลังโหลดรายการแพ็คสินค้า...</div>;

  return (
    <div className="flex flex-col h-screen p-6 pb-2">
      {/* Header */}
      <div className="shrink-0 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Package size={24} className="text-cyan-600"/> แพ็คสินค้า
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">วันที่ {packDate} · {orders.length} ออเดอร์</p>
        </div>
        <button onClick={handleFinish} disabled={finishing}
          className="px-6 py-2.5 bg-green-500 text-white rounded-xl hover:bg-green-600 font-semibold flex items-center gap-2 disabled:opacity-50 shadow">
          <CheckCircle size={18}/> {finishing ? 'กำลังบันทึก...' : 'เสร็จสิ้น — ปริ้นแล้ว'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-4 shrink-0">
        <button onClick={() => setTab('prep')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${tab==='prep'?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
          <ClipboardList size={15}/> จัดเตรียมสินค้า
        </button>
        <button onClick={() => setTab('summary')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${tab==='summary'?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
          <Package size={15}/> ใบสรุป
        </button>
      </div>

      {/* ── Tab 1: จัดเตรียมสินค้า ── */}
      {tab === 'prep' && (
        <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
          <table className="text-sm w-full" style={{minWidth:'1000px'}}>
            <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
              <tr>
                <th className="p-3 text-center w-10 whitespace-nowrap">#</th>
                <th className="p-3 text-left whitespace-nowrap">วันที่แพ็ค</th>
                <th className="p-3 text-left whitespace-nowrap">รายชื่อ</th>
                <th className="p-3 text-left whitespace-nowrap">เบอร์โทร</th>
                <th className="p-3 text-left whitespace-nowrap">ชื่อสินค้า / โปรโมชั่น</th>
                <th className="p-3 text-center whitespace-nowrap">จำนวน</th>
                <th className="p-3 text-left whitespace-nowrap">กล่อง</th>
                <th className="p-3 text-left whitespace-nowrap">บั้บเบิ้ล</th>
                <th className="p-3 text-left whitespace-nowrap">ผู้รับผิดชอบ</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-400">ไม่มีออเดอร์</td></tr>}
              {orders.map((o, idx) => {
                const multi = isMultiProduct(o);
                const totalQty = o.promos.reduce((s, p) => s + p.qty, 0);
                return (
                  <tr key={o.id} className={`border-b align-top ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-cyan-50`}>
                    <td className="p-3 text-center font-bold text-slate-500 whitespace-nowrap">{idx + 1}</td>
                    <td className="p-3 text-xs text-slate-600 whitespace-nowrap">
                      {packDate}
                      {o.order_time && <div className="text-slate-400">{o.order_time}</div>}
                    </td>
                    <td className="p-3 font-medium whitespace-nowrap">{o.customers?.name || '-'}</td>
                    <td className="p-3 font-mono text-xs whitespace-nowrap">{o.customers?.tel || '-'}</td>

                    {/* สินค้า — แสดง short_name + ชื่อโปร */}
                    <td className="p-3 min-w-[200px]">
                      {multi ? (
                        <div className="space-y-2">
                          {o.promos.map((p, pi) => (
                            <div key={pi} className="flex items-start gap-2">
                              <span className="w-5 h-5 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{pi+1}</span>
                              <div className="min-w-0">
                                {p.short_name && <div className="font-medium text-slate-800 text-sm">{p.short_name}</div>}
                                <div className="text-xs text-slate-500">{p.name}</div>
                                <div className="text-xs text-cyan-600 font-bold">จำนวน {p.qty} ชิ้น</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div>
                          {o.promos[0]?.short_name && <div className="font-medium text-slate-800">{o.promos[0].short_name}</div>}
                          <div className="text-xs text-slate-500">{o.promos[0]?.name || o.raw_prod || '-'}</div>
                        </div>
                      )}
                    </td>

                    {/* จำนวนรวม */}
                    <td className="p-3 text-center whitespace-nowrap">
                      <div className="font-bold text-slate-700 text-sm">{totalQty}</div>
                      {multi && <div className="text-[10px] text-slate-400">{o.promos.length} รายการ</div>}
                    </td>

                    {/* กล่อง */}
                    <td className="p-3 whitespace-nowrap">
                      {multi ? (
                        <select value={override[o.id]?.box_id || ''}
                          onChange={e => setOverride(prev => ({ ...prev, [o.id]: { ...prev[o.id], box_id: e.target.value } }))}
                          className="border rounded px-2 py-1.5 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-cyan-300">
                          <option value="">เลือกกล่อง...</option>
                          {boxes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      ) : (
                        <span className="text-sm text-slate-700">{o.promos[0]?.box_name || '-'}</span>
                      )}
                    </td>

                    {/* บั้บเบิ้ล */}
                    <td className="p-3 whitespace-nowrap">
                      {multi ? (
                        <select value={override[o.id]?.bubble_id || ''}
                          onChange={e => setOverride(prev => ({ ...prev, [o.id]: { ...prev[o.id], bubble_id: e.target.value } }))}
                          className="border rounded px-2 py-1.5 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-cyan-300">
                          <option value="">เลือกบั้บเบิ้ล...</option>
                          {bubbles.map(b => <option key={b.id} value={b.id}>ยาว {Number(b.length_cm)} cm</option>)}
                        </select>
                      ) : (
                        <span className="text-sm text-slate-700">{o.promos[0]?.bubble_name || '-'}</span>
                      )}
                    </td>

                    {/* ผู้รับผิดชอบ */}
                    <td className="p-3 whitespace-nowrap">
                      <input type="text" value={responsible[o.id] || ''}
                        onChange={e => setResponsible(prev => ({ ...prev, [o.id]: e.target.value }))}
                        placeholder="ชื่อ..."
                        className="border-b border-dashed border-slate-300 text-sm w-28 focus:outline-none focus:border-cyan-400 bg-transparent px-1"/>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab 2: ใบสรุป ── */}
      {tab === 'summary' && (
        <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
          <table className="text-sm w-full" style={{minWidth:'900px'}}>
            <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
              <tr>
                <th className="p-3 text-center w-10 whitespace-nowrap">#</th>
                <th className="p-3 text-left whitespace-nowrap">วันที่แพ็ค</th>
                <th className="p-3 text-left whitespace-nowrap">รายการสินค้า</th>
                <th className="p-3 text-center whitespace-nowrap">จำนวน (ออเดอร์)</th>
                <th className="p-3 text-left whitespace-nowrap">กล่อง</th>
                <th className="p-3 text-left whitespace-nowrap">บั้บเบิ้ล</th>
                <th className="p-3 text-left whitespace-nowrap">ผู้รับผิดชอบ</th>
              </tr>
            </thead>
            <tbody>
              {/* Single-product groups */}
              {summaryGroups.grouped.map((g, idx) => (
                <tr key={g.promoId} className={`border-b align-top ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-cyan-50`}>
                  <td className="p-3 text-center font-bold text-slate-500 whitespace-nowrap">{idx + 1}</td>
                  <td className="p-3 text-xs text-slate-600 whitespace-nowrap">{packDate}</td>
                  <td className="p-3 min-w-[160px]">
                    <div className="font-semibold text-slate-800 whitespace-nowrap">{g.name}</div>
                  </td>
                  <td className="p-3 text-center whitespace-nowrap">
                    <span className="px-3 py-0.5 bg-cyan-100 text-cyan-800 rounded-full text-sm font-bold">{g.count} ออเดอร์</span>
                  </td>
                  <td className="p-3 text-sm text-slate-600 whitespace-nowrap">{g.box_name}</td>
                  <td className="p-3 text-sm text-slate-600 whitespace-nowrap">{g.bubble_name}</td>
                  <td className="p-3 whitespace-nowrap">
                    <input type="text" value={responsible[`sum-${g.promoId}`] || ''}
                      onChange={e => setResponsible(prev => ({ ...prev, [`sum-${g.promoId}`]: e.target.value }))}
                      placeholder="ชื่อ..."
                      className="border-b border-dashed border-slate-300 text-sm w-28 focus:outline-none focus:border-cyan-400 bg-transparent px-1"/>
                  </td>
                </tr>
              ))}

              {/* Multi-product orders — แพ็คพิเศษ */}
              {summaryGroups.multiOrders.map((o, idx) => {
                const rowIdx = summaryGroups.grouped.length + idx;
                const selBox = override[o.id]?.box_id;
                const selBub = override[o.id]?.bubble_id;
                return (
                  <tr key={o.id} className={`border-b align-top bg-amber-50 hover:bg-amber-100`}>
                    <td className="p-3 text-center font-bold text-amber-600 whitespace-nowrap">{rowIdx + 1}</td>
                    <td className="p-3 text-xs text-slate-600 whitespace-nowrap">{packDate}</td>
                    <td className="p-3 min-w-[180px]">
                      <div className="space-y-1.5 mb-1">
                        {o.promos.map((p, pi) => (
                          <div key={pi} className="flex items-start gap-1.5">
                            <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{pi+1}</span>
                            <div>
                              {p.short_name && <div className="font-medium text-slate-800 text-sm whitespace-nowrap">{p.short_name}</div>}
                              <div className="text-xs text-slate-500 whitespace-nowrap">{p.name} <span className="text-amber-600 font-bold">×{p.qty}</span></div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <span className="text-xs text-amber-600 font-semibold bg-amber-100 px-2 py-0.5 rounded-full">⭐ แพ็คพิเศษ</span>
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <span className="px-3 py-0.5 bg-amber-100 text-amber-800 rounded-full text-sm font-bold">1 ออเดอร์</span>
                    </td>
                    {/* กล่อง — เลือกเองได้ */}
                    <td className="p-3 whitespace-nowrap">
                      <select value={selBox || ''}
                        onChange={e => setOverride(prev => ({ ...prev, [o.id]: { ...prev[o.id], box_id: e.target.value } }))}
                        className="border rounded px-2 py-1.5 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-amber-300 bg-white">
                        <option value="">เลือกกล่อง...</option>
                        {boxes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </td>
                    {/* บั้บเบิ้ล — เลือกเองได้ */}
                    <td className="p-3 whitespace-nowrap">
                      <select value={selBub || ''}
                        onChange={e => setOverride(prev => ({ ...prev, [o.id]: { ...prev[o.id], bubble_id: e.target.value } }))}
                        className="border rounded px-2 py-1.5 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-amber-300 bg-white">
                        <option value="">เลือกบั้บเบิ้ล...</option>
                        {bubbles.map(b => <option key={b.id} value={b.id}>ยาว {Number(b.length_cm)} cm</option>)}
                      </select>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <input type="text" value={responsible[`sum-multi-${o.id}`] || ''}
                        onChange={e => setResponsible(prev => ({ ...prev, [`sum-multi-${o.id}`]: e.target.value }))}
                        placeholder="ชื่อ..."
                        className="border-b border-dashed border-slate-300 text-sm w-28 focus:outline-none focus:border-amber-400 bg-transparent px-1"/>
                    </td>
                  </tr>
                );
              })}

              {orders.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-400">ไม่มีออเดอร์</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
