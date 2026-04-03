import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { FileText, Plus, Trash2, RefreshCw, CheckCircle, Printer } from 'lucide-react';

type ReqItem = {
  key: string;
  name: string;
  qty: number;
  unit: string;
  type: 'product' | 'box' | 'bubble' | 'other';
};

function extractQty(name: string): number {
  const t = name.match(/(\d+)\s*แถม\s*(\d+)/);
  if (t) return parseInt(t[1]) + parseInt(t[2]);
  const u = name.match(/\(?\s*(\d+)\s*(?:กระป๋อง|ชิ้น|แพ็ค|ซอง|กล่อง|ขวด|ถุง|อัน)/i);
  if (u) return parseInt(u[1]);
  const f = name.match(/(\d+)/);
  return f ? parseInt(f[1]) : 1;
}

export default function Requisition() {
  const [docDate, setDocDate] = useState(new Date().toISOString().split('T')[0]);
  const [docNo, setDocNo]     = useState('');
  const [items, setItems]     = useState<ReqItem[]>([]);
  const [note, setNote]       = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [orderCount, setOrderCount] = useState(0);
  const [multiCount, setMultiCount] = useState(0);
  const [toast, setToast]     = useState<{ msg: string; type: 'success'|'error' } | null>(null);

  useEffect(() => { initDocNo(); loadAndAggregate(); }, []);

  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const initDocNo = async () => {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const { count } = await supabase.from('requisitions')
      .select('*', { count: 'exact', head: true }).like('doc_no', `PRR-${dateStr}%`);
    setDocNo(`PRR-${dateStr}-${String((count || 0) + 1).padStart(3, '0')}`);
  };

  const loadAndAggregate = async () => {
    setLoading(true);
    try {
      const { data: orders } = await supabase
        .from('orders').select('id, raw_prod, quantities, quantity, promo_ids')
        .eq('order_status', 'กำลังแพ็ค');

      if (!orders || orders.length === 0) { setItems([]); setOrderCount(0); return; }
      setOrderCount(orders.length);

      const masterMap: Record<string, { name: string; qty: number }> = {};
      const boxMap:    Record<string, { name: string; qty: number }> = {};
      const bubbleMap: Record<string, { name: string; qty: number }> = {};
      let multiCnt = 0;

      for (const order of orders) {
        const rawProds = (order.raw_prod || '').split('|').map((s: string) => s.trim()).filter(Boolean);
        const isMulti  = rawProds.length > 1;
        if (isMulti) multiCnt++;

        let orderBoxKey   = '';
        let orderBoxName  = '';
        let orderBubKey   = '';
        let orderBubName  = '';

        for (let i = 0; i < rawProds.length; i++) {
          const pid = order.promo_ids?.[i];
          if (!pid) continue;

          const { data: promo } = await supabase.from('products_promo')
            .select('id, name, box_id, bubble_id, boxes(id,name), bubbles(id,name,length_cm), products_master(id,name)')
            .eq('id', pid).maybeSingle();
          if (!promo) continue;

          // รวมสินค้าตาม master
          const master = (promo as any).products_master;
          if (master?.id) {
            const qty = extractQty(promo.name);
            if (masterMap[master.id]) masterMap[master.id].qty += qty;
            else masterMap[master.id] = { name: master.name, qty };
          }

          // กล่อง+บั้บเบิ้ลจาก promo แรก (single product เท่านั้น)
          if (!isMulti && i === 0) {
            const box = (promo as any).boxes;
            const bub = (promo as any).bubbles;
            if (promo.box_id && box)  { orderBoxKey = promo.box_id; orderBoxName = box.name; }
            // กรอง: บั้บเบิ้ล 0 cm = ไม่มี ไม่ต้องเบิก
            if (promo.bubble_id && bub && Number(bub.length_cm) > 0) {
              orderBubKey  = promo.bubble_id;
              orderBubName = `ยาว ${Number(bub.length_cm)} cm`;
            }
          }
        }

        if (orderBoxKey) {
          if (boxMap[orderBoxKey]) boxMap[orderBoxKey].qty++;
          else boxMap[orderBoxKey] = { name: orderBoxName, qty: 1 };
        }
        if (orderBubKey) {
          if (bubbleMap[orderBubKey]) bubbleMap[orderBubKey].qty++;
          else bubbleMap[orderBubKey] = { name: orderBubName, qty: 1 };
        }
      }

      setMultiCount(multiCnt);

      const result: ReqItem[] = [
        ...Object.entries(masterMap).map(([id, { name, qty }]) => ({
          key: `p-${id}`, name, qty, unit: 'ชิ้น', type: 'product' as const,
        })),
        ...Object.entries(boxMap).map(([id, { name, qty }]) => ({
          key: `box-${id}`, name: `กล่อง ${name}`, qty, unit: 'อัน', type: 'box' as const,
        })),
        ...Object.entries(bubbleMap).map(([id, { name, qty }]) => ({
          key: `bub-${id}`, name: `บั้บเบิ้ล ${name}`, qty, unit: 'แผ่น', type: 'bubble' as const,
        })),
      ];
      setItems(result);
    } finally {
      setLoading(false);
    }
  };

  const updateQty  = (key: string, qty: number) => setItems(p => p.map(it => it.key===key ? {...it, qty: Math.max(1,qty)} : it));
  const updateName = (key: string, name: string) => setItems(p => p.map(it => it.key===key ? {...it, name} : it));
  const updateUnit = (key: string, unit: string) => setItems(p => p.map(it => it.key===key ? {...it, unit} : it));
  const removeItem = (key: string) => setItems(p => p.filter(it => it.key !== key));
  const addItem    = () => setItems(p => [...p, { key: `c-${Date.now()}`, name: '', qty: 1, unit: 'ชิ้น', type: 'other' }]);

  const handleSave = async () => {
    if (!docNo) return;
    setSaving(true);
    try {
      const validItems = items.filter(it => it.name.trim());

      // 1. บันทึกใบเบิก
      const { error } = await supabase.from('requisitions').insert([{
        doc_no: docNo, doc_date: docDate,
        items: validItems, note: note || null,
      }]);
      if (error) throw error;

      // 2. ตัดสต็อกอัตโนมัติ — หา stock_item จาก name แล้ว insert transaction
      for (const item of validItems) {
        const { data: si } = await supabase.from('stock_items')
          .select('id').ilike('name', item.name.trim()).maybeSingle();
        if (si?.id) {
          await supabase.from('stock_transactions').insert([{
            stock_item_id: si.id, txn_type: 'out', qty: item.qty,
            ref_type: 'requisition', ref_id: docNo, note: `ใบเบิก ${docNo}`,
          }]);
        }
      }

      showToast('✅ อนุมัติใบเบิกและตัดสต็อกสำเร็จ เลขที่ ' + docNo);
    } catch (err: any) {
      showToast('❌ ' + (err.message || 'เกิดข้อผิดพลาด'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    const today = new Date(docDate).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const rows = items.filter(it => it.name.trim()).map((it, i) => `
      <tr>
        <td style="padding:8px 12px;text-align:center;border-bottom:1px solid #e2e8f0;color:#64748b">${i+1}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:500;color:#1e293b">${it.name}</td>
        <td style="padding:8px 12px;text-align:center;border-bottom:1px solid #e2e8f0;font-weight:700;font-size:16px;color:#0f172a">${it.qty}</td>
        <td style="padding:8px 12px;text-align:center;border-bottom:1px solid #e2e8f0;color:#475569">${it.unit}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8">
<title>ใบเบิกสินค้า ${docNo}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Sarabun',sans-serif; font-size:14px; color:#1e293b; background:#fff; padding:32px; }
  .header { text-align:right; margin-bottom:24px; }
  .header h1 { font-size:28px; font-weight:700; color:#1e293b; }
  .header p { font-size:13px; color:#64748b; }
  .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:24px; border:1px solid #e2e8f0; border-radius:8px; padding:16px; }
  .info-box { }
  .info-label { font-size:11px; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:.05em; margin-bottom:4px; }
  .info-value { font-size:14px; font-weight:700; color:#1e293b; }
  .doc-box { background:#f8fafc; border-radius:8px; padding:12px 16px; text-align:right; }
  .doc-no { font-size:18px; font-weight:700; color:#3b82f6; font-family:monospace; }
  table { width:100%; border-collapse:collapse; margin-bottom:16px; }
  thead th { background:#1e293b; color:#f1f5f9; padding:10px 12px; text-align:left; font-size:12px; font-weight:600; letter-spacing:.05em; }
  thead th:nth-child(1) { text-align:center; width:48px; }
  thead th:nth-child(3), thead th:nth-child(4) { text-align:center; width:80px; }
  tfoot td { padding:10px 12px; background:#f8fafc; font-weight:700; }
  .total-row { text-align:right; font-size:13px; color:#64748b; }
  .total-val { text-align:center; font-size:18px; color:#0f172a; }
  .total-unit { text-align:center; font-size:12px; color:#94a3b8; }
  .sig-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; margin-top:40px; }
  .sig-box { border-top:2px solid #e2e8f0; padding-top:8px; text-align:center; }
  .sig-label { font-size:11px; color:#94a3b8; }
  .sig-name { font-size:13px; font-weight:600; color:#475569; margin-top:4px; }
  .sig-date { font-size:11px; color:#94a3b8; }
  .note-box { border:1px solid #e2e8f0; border-radius:6px; padding:10px 14px; margin-bottom:24px; }
  .note-label { font-size:11px; font-weight:600; color:#94a3b8; margin-bottom:4px; }
  @media print { body { padding:16px; } }
</style>
</head><body>
<div class="header">
  <p style="color:#94a3b8;font-size:12px;">(ต้นฉบับ)</p>
  <h1>ใบเบิกสินค้า</h1>
</div>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
  <div style="flex:1;">
    <p style="font-size:13px;color:#64748b;">ร้าน Online Shop</p>
    <p style="font-size:12px;color:#94a3b8;margin-top:4px;">สาเหตุการเบิก: ส่งเสริมการขายและการตลาด</p>
    ${note ? `<p style="font-size:12px;color:#64748b;margin-top:2px;">หมายเหตุ: ${note}</p>` : ''}
  </div>
  <div class="doc-box">
    <div style="font-size:11px;color:#94a3b8;margin-bottom:2px;">เลขที่เอกสาร</div>
    <div class="doc-no">${docNo}</div>
    <div style="font-size:12px;color:#475569;margin-top:4px;">วันที่ออก: ${today}</div>
  </div>
</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>สินค้าที่ต้องการเบิก</th>
      <th style="text-align:center">จำนวน</th>
      <th style="text-align:center">หน่วย</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr>
      <td class="total-row" colspan="2">จำนวนทั้งสิ้น</td>
      <td class="total-val">${items.filter(it=>it.name.trim()).reduce((s,it)=>s+it.qty,0)}</td>
      <td class="total-unit">${items.filter(it=>it.name.trim()).length} รายการ</td>
    </tr>
  </tfoot>
</table>
<div class="sig-grid">
  <div class="sig-box">
    <div class="sig-label">รับรอง</div>
    <div class="sig-name">________________________</div>
    <div class="sig-date">${today}</div>
  </div>
  <div class="sig-box">
    <div class="sig-label">ผู้ออกเอกสาร</div>
    <div class="sig-name">________________________</div>
    <div class="sig-date">${today}</div>
  </div>
  <div class="sig-box">
    <div class="sig-label">ผู้อนุมัติเอกสาร</div>
    <div class="sig-name">________________________</div>
    <div class="sig-date">${today}</div>
  </div>
</div>
</body></html>`;

    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  };

  const typeColor = (type: string) => {
    if (type === 'product') return 'bg-cyan-50 border-l-4 border-cyan-400';
    if (type === 'box')     return 'bg-amber-50 border-l-4 border-amber-400';
    if (type === 'bubble')  return 'bg-purple-50 border-l-4 border-purple-400';
    return 'bg-white border-l-4 border-slate-300';
  };
  const typeBadge = (type: string) => {
    if (type === 'product') return <span className="px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded text-[10px] font-bold">สินค้า</span>;
    if (type === 'box')     return <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold">กล่อง</span>;
    if (type === 'bubble')  return <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-bold">บั้บเบิ้ล</span>;
    return <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">อื่นๆ</span>;
  };

  return (
    <div className="flex flex-col h-screen p-6 pb-2 bg-slate-50">
      {/* Header */}
      <div className="shrink-0 flex items-start justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center">
            <FileText size={20} className="text-white"/>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">สร้างใบเบิกสินค้า</h2>
            <p className="text-sm text-slate-500">ออเดอร์กำลังแพ็ค {orderCount} รายการ{multiCount > 0 ? ` · แพ็คพิเศษ ${multiCount} รายการ (กล่อง/บั้บเบิ้ลเพิ่มเองด้านล่าง)` : ''}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { loadAndAggregate(); }} disabled={loading}
            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 flex items-center gap-2 text-sm">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> รีโหลด
          </button>
          <button onClick={handlePrint} disabled={items.length === 0}
            className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 flex items-center gap-2 text-sm disabled:opacity-50">
            <Printer size={14}/> ปริ้น / PDF
          </button>
          <button onClick={handleSave} disabled={saving || items.length === 0}
            className="px-5 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2 font-medium disabled:opacity-50">
            <CheckCircle size={16}/> {saving ? 'กำลังบันทึก...' : 'อนุมัติใบเบิกสินค้า'}
          </button>
        </div>
      </div>

      {/* Document Info */}
      <div className="shrink-0 bg-white rounded-xl shadow-sm border border-slate-100 p-5 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">เลขที่เอกสาร <span className="text-red-400">*</span></label>
            <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-slate-50">
              <span className="font-mono text-sm font-bold text-blue-700">{docNo || '...'}</span>
              <span className="text-xs text-slate-400 ml-auto">อัตโนมัติ</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">วันที่ออก <span className="text-red-400">*</span></label>
            <input type="date" value={docDate} onChange={e => setDocDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-blue-600 font-medium"/>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">หมายเหตุ</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder="ระบุหมายเหตุ (ถ้ามี)"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="shrink-0 mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-slate-700 flex items-center gap-2">
          สินค้าที่ต้องการเบิก
          <span className="px-2 py-0.5 bg-slate-100 rounded-full text-xs text-slate-500">{items.length} รายการ</span>
        </h3>
        <button onClick={addItem} className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 flex items-center gap-1.5">
          <Plus size={14}/> เพิ่มรายการ
        </button>
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-100 overflow-auto min-h-0">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
            <RefreshCw size={16} className="animate-spin"/> กำลังคำนวณ...
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-400">ไม่มีออเดอร์กำลังแพ็ค หรือยังไม่มีสินค้า</div>
        ) : (
          <table className="w-full text-sm" style={{minWidth:'650px'}}>
            <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
              <tr>
                <th className="p-3 text-center w-10">#</th>
                <th className="p-3 text-left w-20">ประเภท</th>
                <th className="p-3 text-left">สินค้า / รายการ</th>
                <th className="p-3 text-center w-36">จำนวน</th>
                <th className="p-3 text-center w-28">หน่วย</th>
                <th className="p-3 text-center w-12">ลบ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.key} className={`border-b ${typeColor(item.type)}`}>
                  <td className="p-3 text-center text-slate-500 font-bold">{idx + 1}</td>
                  <td className="p-3">{typeBadge(item.type)}</td>
                  <td className="p-3">
                    {item.type === 'other' ? (
                      <input type="text" value={item.name} onChange={e => updateName(item.key, e.target.value)}
                        placeholder="ชื่อสินค้า/รายการ..."
                        className="w-full border-b border-dashed border-slate-300 focus:outline-none focus:border-blue-400 bg-transparent text-sm px-1"/>
                    ) : (
                      <span className="font-medium text-slate-800">{item.name}</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => updateQty(item.key, item.qty - 1)}
                        className="w-7 h-7 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold text-sm flex items-center justify-center">−</button>
                      <input type="number" value={item.qty} min={1}
                        onChange={e => updateQty(item.key, Number(e.target.value))}
                        className="w-14 text-center border rounded-lg py-1 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-300"/>
                      <button onClick={() => updateQty(item.key, item.qty + 1)}
                        className="w-7 h-7 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold text-sm flex items-center justify-center">+</button>
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <input type="text" value={item.unit} onChange={e => updateUnit(item.key, e.target.value)}
                      className="w-full text-center border-b border-dashed border-slate-300 focus:outline-none focus:border-blue-400 bg-transparent text-sm"/>
                  </td>
                  <td className="p-3 text-center">
                    <button onClick={() => removeItem(item.key)} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50">
                      <Trash2 size={14}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-200 sticky bottom-0">
              <tr>
                <td colSpan={3} className="p-3 text-right text-sm font-semibold text-slate-600">จำนวนทั้งสิ้น</td>
                <td className="p-3 text-center font-bold text-slate-800">{items.reduce((s,it) => s+it.qty, 0)}</td>
                <td colSpan={2} className="p-3 text-center text-xs text-slate-400">{items.length} รายการ</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl text-white text-sm font-medium ${toast.type==='success'?'bg-emerald-500':'bg-red-500'}`} style={{minWidth:'280px'}}>
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
