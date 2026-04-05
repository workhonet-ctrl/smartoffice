import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Package, ClipboardList, FileText, AlertCircle } from 'lucide-react';

type PackOrder = {
  id: string; order_no: string; order_date: string | null; order_time: string | null;
  raw_prod: string | null; quantities: string | null; quantity: number | null;
  promo_ids: string[] | null;
  customers: { name: string; tel: string } | null;
  promos: PromoDetail[];
};
type PromoDetail = { id: string; name: string; short_name: string | null; qty: number; box_name: string; box_id: string; bubble_name: string; bubble_id: string; };
type Override = Record<string, { box_id: string; bubble_id: string }>;

function extractQty(name: string): number {
  const t = name.match(/(\d+)\s*แถม\s*(\d+)/);
  if (t) return parseInt(t[1]) + parseInt(t[2]);
  const u = name.match(/\(?\s*(\d+)\s*(?:กระป๋อง|ชิ้น|แพ็ค|ซอง|กล่อง|ขวด|ถุง|อัน)/i);
  if (u) return parseInt(u[1]);
  const f = name.match(/(\d+)/);
  return f ? parseInt(f[1]) : 1;
}

export default function Packaging({
  orderIds, onCreateRequisition,
}: {
  orderIds: string[];
  onDone: () => void;
  onCreateRequisition?: (historyId: string) => void;
}) {
  const [orders, setOrders]     = useState<PackOrder[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<'prep' | 'summary'>('prep');
  const [override, setOverride] = useState<Override>({});
  const [boxes, setBoxes]       = useState<{ id: string; name: string }[]>([]);
  const [bubbles, setBubbles]   = useState<{ id: string; name: string; length_cm: number }[]>([]);
  const [responsible, setResponsible] = useState(''); // ช่องเดียวท้ายใบสรุป
  const [saving, setSaving]     = useState(false);
  const [packDate]              = useState(new Date().toLocaleDateString('th-TH', { day:'2-digit', month:'2-digit', year:'numeric' }));

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const query = orderIds.length > 0
        ? supabase.from('orders').select('*, customers(name, tel)').in('id', orderIds)
        : supabase.from('orders').select('*, customers(name, tel)').eq('order_status', 'กำลังแพ็ค');
      const { data: ordersData } = await query.order('created_at', { ascending: true });
      if (!ordersData) return;

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
          const qty = promoData?.name ? extractQty(promoData.name) : (Number(qtys[i]?.trim()) || 1);
          promos.push({
            id: pid || `raw-${i}`, name: promoData?.name || rawProds[i],
            short_name: promoData?.short_name || null, qty,
            box_id:     promoData?.box_id || '', box_name: promoData?.boxes?.name || '-',
            bubble_id:  promoData?.bubble_id || '',
            bubble_name: promoData?.bubbles ? `ยาว ${Number(promoData.bubbles.length_cm)} cm` : '-',
          });
        }
        enriched.push({ ...o, promos });
      }
      setOrders(enriched);

      const [{ data: boxData }, { data: bubData }] = await Promise.all([
        supabase.from('boxes').select('id, name').order('id'),
        supabase.from('bubbles').select('id, name, length_cm').order('id'),
      ]);
      if (boxData) setBoxes(boxData);
      if (bubData) setBubbles(bubData);
    } finally { setLoading(false); }
  };

  const isMulti = (o: PackOrder) => o.promos.length > 1;

  // validate กล่อง/บั้บเบิ้ล — multi-product orders ต้องเลือกครบ
  const multiOrders        = orders.filter(isMulti);
  const multiIncomplete    = multiOrders.filter(o => !override[o.id]?.box_id);
  const canGoToSummary     = multiIncomplete.length === 0;

  // validate ผู้รับผิดชอบ
  const canCreateRequisition = responsible.trim().length > 0;

  // ── summary groups ──
  const summaryGroups = (() => {
    const singleOrders = orders.filter(o => !isMulti(o));
    const grouped: Record<string, { promoId: string; short_name: string; promo_name: string; box_name: string; bubble_name: string; count: number }> = {};
    for (const o of singleOrders) {
      const p = o.promos[0]; if (!p) continue;
      if (grouped[p.id]) grouped[p.id].count++;
      else grouped[p.id] = { promoId: p.id, short_name: p.short_name||'', promo_name: p.name, box_name: p.box_name, bubble_name: p.bubble_name, count: 1 };
    }
    return { grouped: Object.values(grouped), multiOrders };
  })();

  const handleCreateRequisition = async () => {
    if (!canCreateRequisition || !onCreateRequisition) return;
    setSaving(true);
    try {
      const ordersSnapshot = orders.map(o => ({
        order_no: o.order_no, customer: o.customers?.name,
        promos: o.promos.map(p => ({ name: p.short_name||p.name, qty: p.qty })),
        is_multi: isMulti(o),
      }));
      const summarySnapshot = [
        ...summaryGroups.grouped.map(g => ({ name: g.short_name||g.promo_name, count: g.count, box: g.box_name, type:'single' })),
        ...summaryGroups.multiOrders.map(o => ({
          name: o.promos.map(p => `${p.short_name||p.name}×${p.qty}`).join(', '),
          count: 1, box: boxes.find(b => b.id === override[o.id]?.box_id)?.name || '', type:'multi'
        })),
      ];
      const { data: ph } = await supabase.from('pack_history').insert([{
        pack_date: new Date().toISOString().split('T')[0],
        responsible_person: responsible,
        order_count: orders.length,
        orders_snapshot: ordersSnapshot,
        summary_snapshot: summarySnapshot,
        status: 'pending',
      }]).select('id').single();

      if (ph?.id) onCreateRequisition(ph.id);
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-6 flex items-center gap-2 text-slate-500"><Package size={18} className="animate-bounce"/> กำลังโหลด...</div>;

  return (
    <div className="flex flex-col h-screen p-6 pb-2">
      {/* Header — ไม่มีปุ่ม สร้างใบเบิก / เสร็จสิ้น ที่นี่ */}
      <div className="shrink-0 mb-4">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Package size={24} className="text-cyan-600"/> แพ็คสินค้า
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">วันที่ {packDate} · {orders.length} ออเดอร์</p>
      </div>

      {/* Tabs — ปุ่มใบสรุป disabled ถ้ากล่องยังไม่ครบ */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-4 shrink-0">
        <button onClick={() => setTab('prep')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${tab==='prep'?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
          <ClipboardList size={15}/> จัดเตรียมสินค้า
        </button>
        <button
          onClick={() => canGoToSummary && setTab('summary')}
          disabled={!canGoToSummary}
          title={!canGoToSummary ? `ยังเลือกกล่องไม่ครบ ${multiIncomplete.length} รายการ` : ''}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2
            ${tab==='summary'?'bg-white shadow text-slate-800':''}
            ${!canGoToSummary?'opacity-40 cursor-not-allowed text-slate-400':'text-slate-500 hover:text-slate-700'}`}>
          <Package size={15}/> ใบสรุป
          {!canGoToSummary && <AlertCircle size={13} className="text-orange-400"/>}
        </button>
      </div>

      {/* hint เมื่อ disabled */}
      {tab === 'prep' && !canGoToSummary && (
        <div className="shrink-0 mb-3 flex items-center gap-2 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
          <AlertCircle size={14}/> กรุณาเลือกกล่องให้ครบก่อน — ยังขาดอีก {multiIncomplete.length} รายการ (แพ็คพิเศษ)
        </div>
      )}

      {/* ── Tab: จัดเตรียมสินค้า ── */}
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
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-400">ไม่มีออเดอร์</td></tr>}
              {orders.map((o, idx) => {
                const multi    = isMulti(o);
                const totalQty = o.promos.reduce((s, p) => s + p.qty, 0);
                const missingBox = multi && !override[o.id]?.box_id;
                return (
                  <tr key={o.id} className={`border-b align-top hover:bg-cyan-50 ${missingBox ? 'bg-orange-50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                    <td className="p-3 text-center font-bold text-slate-500 whitespace-nowrap">{idx + 1}</td>
                    <td className="p-3 text-xs text-slate-600 whitespace-nowrap">{packDate}{o.order_time && <div className="text-slate-400">{o.order_time}</div>}</td>
                    <td className="p-3 font-medium whitespace-nowrap">{o.customers?.name || '-'}</td>
                    <td className="p-3 font-mono text-xs whitespace-nowrap">{o.customers?.tel || '-'}</td>
                    <td className="p-3 min-w-[200px]">
                      {multi ? (
                        <div className="space-y-2">
                          {o.promos.map((p, pi) => (
                            <div key={pi} className="flex items-start gap-2">
                              <span className="w-5 h-5 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{pi+1}</span>
                              <div>
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
                    <td className="p-3 text-center whitespace-nowrap">
                      <div className="font-bold text-slate-700 text-sm">{totalQty}</div>
                      {multi && <div className="text-[10px] text-slate-400">{o.promos.length} รายการ</div>}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {multi ? (
                        <select value={override[o.id]?.box_id || ''}
                          onChange={e => setOverride(p => ({ ...p, [o.id]: { ...p[o.id], box_id: e.target.value } }))}
                          className={`border rounded px-2 py-1.5 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-cyan-300 ${!override[o.id]?.box_id ? 'border-orange-400 bg-orange-50' : ''}`}>
                          <option value="">เลือกกล่อง... *</option>
                          {boxes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      ) : (
                        <span className="text-sm text-slate-700">{o.promos[0]?.box_name || '-'}</span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {multi ? (
                        <select value={override[o.id]?.bubble_id || ''}
                          onChange={e => setOverride(p => ({ ...p, [o.id]: { ...p[o.id], bubble_id: e.target.value } }))}
                          className="border rounded px-2 py-1.5 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-cyan-300">
                          <option value="">เลือกบั้บเบิ้ล...</option>
                          {bubbles.map(b => <option key={b.id} value={b.id}>ยาว {Number(b.length_cm)} cm</option>)}
                        </select>
                      ) : (
                        <span className="text-sm text-slate-700">{o.promos[0]?.bubble_name || '-'}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab: ใบสรุป ── */}
      {tab === 'summary' && (
        <>
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
                </tr>
              </thead>
              <tbody>
                {summaryGroups.grouped.map((g, idx) => (
                  <tr key={g.promoId} className={`border-b align-top hover:bg-cyan-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                    <td className="p-3 text-center font-bold text-slate-500 whitespace-nowrap">{idx + 1}</td>
                    <td className="p-3 text-xs text-slate-600 whitespace-nowrap">{packDate}</td>
                    <td className="p-3 min-w-[160px]">
                      {g.short_name && <div className="font-semibold text-slate-800 whitespace-nowrap">{g.short_name}</div>}
                      <div className="text-xs text-slate-500 whitespace-nowrap">{g.promo_name}</div>
                      <div className="text-xs text-cyan-600 font-bold mt-0.5">จำนวน {g.count} ออเดอร์</div>
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <span className="px-3 py-0.5 bg-cyan-100 text-cyan-800 rounded-full text-sm font-bold">{g.count} ออเดอร์</span>
                    </td>
                    <td className="p-3 text-sm text-slate-600 whitespace-nowrap">{g.box_name}</td>
                    <td className="p-3 text-sm text-slate-600 whitespace-nowrap">{g.bubble_name}</td>
                  </tr>
                ))}
                {summaryGroups.multiOrders.map((o, idx) => {
                  const rowIdx = summaryGroups.grouped.length + idx;
                  const selBox = override[o.id]?.box_id;
                  const selBub = override[o.id]?.bubble_id;
                  return (
                    <tr key={o.id} className="border-b align-top bg-amber-50 hover:bg-amber-100">
                      <td className="p-3 text-center font-bold text-amber-600 whitespace-nowrap">{rowIdx + 1}</td>
                      <td className="p-3 text-xs text-slate-600 whitespace-nowrap">{packDate}</td>
                      <td className="p-3 min-w-[180px]">
                        <div className="space-y-1.5 mb-1">
                          {o.promos.map((p, pi) => (
                            <div key={pi} className="flex items-start gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{pi+1}</span>
                              <div>
                                {p.short_name && <div className="font-semibold text-slate-800 text-sm whitespace-nowrap">{p.short_name}</div>}
                                <div className="text-xs text-slate-500 whitespace-nowrap">{p.name}</div>
                                <div className="text-xs text-cyan-600 font-bold">จำนวน {p.qty} ชิ้น</div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <span className="text-xs text-amber-600 font-semibold bg-amber-100 px-2 py-0.5 rounded-full">⭐ แพ็คพิเศษ · 1 ออเดอร์</span>
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <span className="px-3 py-0.5 bg-amber-100 text-amber-800 rounded-full text-sm font-bold">1 ออเดอร์</span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <select value={selBox || ''} onChange={e => setOverride(p => ({ ...p, [o.id]: { ...p[o.id], box_id: e.target.value } }))}
                          className="border rounded px-2 py-1.5 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-amber-300 bg-white">
                          <option value="">เลือกกล่อง...</option>
                          {boxes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <select value={selBub || ''} onChange={e => setOverride(p => ({ ...p, [o.id]: { ...p[o.id], bubble_id: e.target.value } }))}
                          className="border rounded px-2 py-1.5 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-amber-300 bg-white">
                          <option value="">เลือกบั้บเบิ้ล...</option>
                          {bubbles.map(b => <option key={b.id} value={b.id}>ยาว {Number(b.length_cm)} cm</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── ผู้รับผิดชอบ + ปุ่มสร้างใบเบิก (ท้ายสุด) ── */}
          <div className="shrink-0 mt-4 bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">
                ผู้รับผิดชอบ <span className="text-red-400">*</span>
              </label>
              <input value={responsible} onChange={e => setResponsible(e.target.value)}
                placeholder="กรอกชื่อผู้รับผิดชอบก่อนสร้างใบเบิก..."
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${responsible.trim() ? 'border-green-400 focus:ring-green-300' : 'border-slate-300 focus:ring-cyan-300'}`}/>
            </div>
            {canCreateRequisition && (
              <button onClick={handleCreateRequisition} disabled={saving}
                className="px-6 py-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 font-semibold flex items-center gap-2 shadow disabled:opacity-50 shrink-0">
                <FileText size={16}/> {saving ? 'กำลังบันทึก...' : 'สร้างใบเบิก'}
              </button>
            )}
            {!canCreateRequisition && (
              <div className="text-xs text-slate-400 flex items-center gap-1 shrink-0">
                <AlertCircle size={13}/> กรอกผู้รับผิดชอบเพื่อสร้างใบเบิก
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
