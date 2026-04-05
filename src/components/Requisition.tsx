import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { FileText, Plus, Trash2, RefreshCw, CheckCircle, Printer, History, Search } from 'lucide-react';

type ReqItem = { key: string; name: string; qty: number; unit: string; type: 'product'|'box'|'bubble'|'other' };
type HistoryDoc = { id: string; doc_no: string; doc_date: string; items: any[]; note: string|null; created_at: string; created_by?: string; approved_by?: string };

function extractQty(name: string): number {
  const t = name.match(/(\d+)\s*แถม\s*(\d+)/);
  if (t) return parseInt(t[1]) + parseInt(t[2]);
  const u = name.match(/\(?\s*(\d+)\s*(?:กระป๋อง|ชิ้น|แพ็ค|ซอง|กล่อง|ขวด|ถุง|อัน)/i);
  if (u) return parseInt(u[1]);
  const f = name.match(/(\d+)/);
  return f ? parseInt(f[1]) : 1;
}

function printDoc(docNo: string, docDate: string, items: any[], note: string) {
  const dateStr = new Date(docDate).toLocaleDateString('th-TH', { day:'2-digit', month:'2-digit', year:'numeric' });
  const rows = items.filter(it => it.name?.trim()).map((it, i) => `
    <tr>
      <td style="padding:8px 12px;text-align:center;border-bottom:1px solid #e2e8f0;color:#64748b">${i+1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:500;color:#1e293b">${it.name}</td>
      <td style="padding:8px 12px;text-align:center;border-bottom:1px solid #e2e8f0;font-weight:700;font-size:16px;color:#0f172a">${it.qty}</td>
      <td style="padding:8px 12px;text-align:center;border-bottom:1px solid #e2e8f0;color:#475569">${it.unit}</td>
    </tr>`).join('');
  const total = items.filter(it => it.name?.trim()).reduce((s, it) => s + Number(it.qty), 0);
  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
<title>ใบเบิกสินค้า ${docNo}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Sarabun',sans-serif;font-size:14px;color:#1e293b;background:#fff;padding:32px}
  h1{font-size:28px;font-weight:700;text-align:right}
  .doc-no{font-size:18px;font-weight:700;color:#3b82f6;font-family:monospace}
  table{width:100%;border-collapse:collapse;margin-top:16px}
  thead th{background:#1e293b;color:#f1f5f9;padding:10px 12px;text-align:left;font-size:12px}
  tfoot td{padding:10px 12px;background:#f8fafc;font-weight:700}
  .sig-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:40px}
  .sig-box{border-top:2px solid #e2e8f0;padding-top:8px;text-align:center}
  .sig-label{font-size:11px;color:#94a3b8}
  @media print{body{padding:16px}}
</style></head><body>
<p style="color:#94a3b8;font-size:12px;text-align:right">(ต้นฉบับ)</p>
<h1>ใบเบิกสินค้า</h1>
<div style="display:flex;justify-content:space-between;margin:16px 0 20px">
  <div>
    <p style="font-size:13px;color:#64748b">ร้าน Online Shop</p>
    ${note ? `<p style="font-size:12px;color:#64748b;margin-top:4px">หมายเหตุ: ${note}</p>` : ''}
  </div>
  <div style="text-align:right;background:#f8fafc;border-radius:8px;padding:12px 16px">
    <div style="font-size:11px;color:#94a3b8">เลขที่เอกสาร</div>
    <div class="doc-no">${docNo}</div>
    <div style="font-size:12px;color:#475569;margin-top:4px">วันที่ออก: ${dateStr}</div>
  </div>
</div>
<table>
  <thead><tr>
    <th style="text-align:center;width:48px">#</th>
    <th>สินค้าที่ต้องการเบิก</th>
    <th style="text-align:center;width:80px">จำนวน</th>
    <th style="text-align:center;width:80px">หน่วย</th>
  </tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr>
    <td colspan="2" style="text-align:right;font-size:13px;color:#64748b">จำนวนทั้งสิ้น</td>
    <td style="text-align:center;font-size:18px;color:#0f172a">${total}</td>
    <td style="text-align:center;font-size:12px;color:#94a3b8">${items.filter(it=>it.name?.trim()).length} รายการ</td>
  </tr></tfoot>
</table>
<div class="sig-grid">
  <div class="sig-box"><div class="sig-label">รับรอง</div><div style="margin-top:32px;font-size:12px">________________________</div><div class="sig-label" style="margin-top:4px">${dateStr}</div></div>
  <div class="sig-box"><div class="sig-label">ผู้ออกเอกสาร</div><div style="margin-top:32px;font-size:12px">________________________</div><div class="sig-label" style="margin-top:4px">${dateStr}</div></div>
  <div class="sig-box"><div class="sig-label">ผู้อนุมัติเอกสาร</div><div style="margin-top:32px;font-size:12px">________________________</div><div class="sig-label" style="margin-top:4px">${dateStr}</div></div>
</div>
</body></html>`;
  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}

export default function Requisition({ packHistoryId }: { packHistoryId?: string }) {
  const [tab, setTab]           = useState<'create'|'history'>('create');
  const [docDate, setDocDate]   = useState(new Date().toISOString().split('T')[0]);
  const [docNo, setDocNo]       = useState('');
  const [items, setItems]       = useState<ReqItem[]>([]);
  const [note, setNote]         = useState('');
  const [createdBy, setCreatedBy]   = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [orderCount, setOrderCount] = useState(0);
  const [multiCount, setMultiCount] = useState(0);
  // ประวัติ
  const [history, setHistory]   = useState<HistoryDoc[]>([]);
  const [hSearch, setHSearch]   = useState('');
  const [hDateFrom, setHDateFrom] = useState('');
  const [hDateTo, setHDateTo]   = useState('');
  const [hLoading, setHLoading] = useState(false);
  const [toast, setToast]       = useState<{msg:string;type:'success'|'error'}|null>(null);

  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => { initDocNo(); loadAndAggregate(); }, []);
  useEffect(() => { if (tab === 'history') loadHistory(); }, [tab]);

  const initDocNo = async () => {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const { count } = await supabase.from('requisitions')
      .select('*', { count:'exact', head:true }).like('doc_no', `PRR-${dateStr}%`);
    setDocNo(`PRR-${dateStr}-${String((count || 0) + 1).padStart(3, '0')}`);
  };

  const loadAndAggregate = async () => {
    setLoading(true);
    try {
      const { data: orders } = await supabase.from('orders').select('id, raw_prod, quantities, quantity, promo_ids').eq('order_status', 'กำลังแพ็ค');
      if (!orders || orders.length === 0) { setItems([]); setOrderCount(0); setLoading(false); return; }
      setOrderCount(orders.length);

      const masterMap: Record<string, {name:string;qty:number}> = {};
      const boxMap:    Record<string, {name:string;qty:number}> = {};
      const bubbleMap: Record<string, {name:string;qty:number}> = {};
      let multiCnt = 0;

      for (const order of orders) {
        const rawProds = (order.raw_prod || '').split('|').map((s:string) => s.trim()).filter(Boolean);
        const isMulti  = rawProds.length > 1;
        if (isMulti) multiCnt++;
        let orderBoxKey = '', orderBoxName = '', orderBubKey = '', orderBubName = '';

        for (let i = 0; i < rawProds.length; i++) {
          const pid = order.promo_ids?.[i];
          if (!pid) continue;
          const { data: promo } = await supabase.from('products_promo')
            .select('id, name, box_id, bubble_id, boxes(id,name), bubbles(id,name,length_cm), products_master(id,name)')
            .eq('id', pid).maybeSingle();
          if (!promo) continue;
          const master = (promo as any).products_master;
          if (master?.id) {
            const qty = extractQty(promo.name);
            if (masterMap[master.id]) masterMap[master.id].qty += qty;
            else masterMap[master.id] = { name: master.name, qty };
          }
          if (!isMulti && i === 0) {
            const box = (promo as any).boxes;
            const bub = (promo as any).bubbles;
            if (promo.box_id && box) { orderBoxKey = promo.box_id; orderBoxName = box.name; }
            if (promo.bubble_id && bub && Number(bub.length_cm) > 0) { orderBubKey = promo.bubble_id; orderBubName = `ยาว ${Number(bub.length_cm)} cm`; }
          }
        }
        if (orderBoxKey) { if (boxMap[orderBoxKey]) boxMap[orderBoxKey].qty++; else boxMap[orderBoxKey] = { name: orderBoxName, qty: 1 }; }
        if (orderBubKey) { if (bubbleMap[orderBubKey]) bubbleMap[orderBubKey].qty++; else bubbleMap[orderBubKey] = { name: orderBubName, qty: 1 }; }
      }

      setMultiCount(multiCnt);
      const result: ReqItem[] = [
        ...Object.entries(masterMap).map(([id, {name, qty}]) => ({ key:`p-${id}`, name, qty, unit:'ชิ้น', type:'product' as const })),
        ...Object.entries(boxMap).map(([id, {name, qty}])    => ({ key:`box-${id}`, name:`กล่อง ${name}`, qty, unit:'อัน', type:'box' as const })),
        ...Object.entries(bubbleMap).map(([id, {name, qty}]) => ({ key:`bub-${id}`, name:`บั้บเบิ้ล ${name}`, qty, unit:'แผ่น', type:'bubble' as const })),
      ];
      setItems(result);
    } finally { setLoading(false); }
  };

  const loadHistory = async () => {
    setHLoading(true);
    let q = supabase.from('requisitions').select('*').order('created_at', { ascending: false }).limit(100);
    if (hDateFrom) q = q.gte('doc_date', hDateFrom);
    if (hDateTo)   q = q.lte('doc_date', hDateTo);
    const { data } = await q;
    if (data) setHistory(data as HistoryDoc[]);
    setHLoading(false);
  };

  const handleSave = async () => {
    if (!docNo) return;
    setSaving(true);
    try {
      const validItems = items.filter(it => it.name.trim());
      const { error } = await supabase.from('requisitions').insert([{
        doc_no: docNo, doc_date: docDate, items: validItems, note: note || null,
        created_by: createdBy || null, approved_by: approvedBy || null,
      }]);
      if (error) throw error;

      for (const item of validItems) {
        const { data: si } = await supabase.from('stock_items').select('id').ilike('name', item.name.trim()).maybeSingle();
        if (si?.id) {
          await supabase.from('stock_transactions').insert([{
            stock_item_id: si.id, txn_type: 'out', qty: item.qty,
            ref_type: 'requisition', ref_id: docNo, note: `ใบเบิก ${docNo}`,
          }]);
        }
      }

      showToast('✅ อนุมัติใบเบิกและตัดสต็อกสำเร็จ เลขที่ ' + docNo);

      // อัพเดต pack_history ถ้ามาจากหน้าแพ็คสินค้า
      if (packHistoryId) {
        // ดึง orders_snapshot จาก pack_history
        const { data: ph } = await supabase
          .from('pack_history')
          .select('orders_snapshot')
          .eq('id', packHistoryId)
          .maybeSingle();

        // อัพเดต status = approved + link req_doc_no
        await supabase.from('pack_history')
          .update({ status: 'approved', req_doc_no: docNo })
          .eq('id', packHistoryId);

        // อัพเดต order_status = 'แพ็คสินค้า' สำหรับออเดอร์ทั้งหมดในชุดนี้
        if (ph?.orders_snapshot?.length > 0) {
          const orderNos = (ph.orders_snapshot as any[]).map((o: any) => o.order_no).filter(Boolean);
          if (orderNos.length > 0) {
            await supabase.from('orders')
              .update({ order_status: 'แพ็คสินค้า' })
              .in('order_no', orderNos);
          }
        }
      }

      // ── Reset ทุกอย่าง — ไม่โหลดออเดอร์ใหม่ ──
      setItems([]);
      setNote('');
      setCreatedBy('');
      setApprovedBy('');
      setDocDate(new Date().toISOString().split('T')[0]);
      setOrderCount(0);
      await initDocNo(); // อัพเดตเลขที่เอกสารถัดไปอย่างเดียว

    } catch (err: any) {
      showToast('❌ ' + (err.message || 'เกิดข้อผิดพลาด'), 'error');
    } finally { setSaving(false); }
  };

  const updateQty  = (key: string, qty: number) => setItems(p => p.map(it => it.key===key ? {...it, qty: Math.max(1,qty)} : it));
  const updateName = (key: string, name: string) => setItems(p => p.map(it => it.key===key ? {...it, name} : it));
  const updateUnit = (key: string, unit: string) => setItems(p => p.map(it => it.key===key ? {...it, unit} : it));
  const removeItem = (key: string) => setItems(p => p.filter(it => it.key !== key));
  const addItem    = () => setItems(p => [...p, { key:`c-${Date.now()}`, name:'', qty:1, unit:'ชิ้น', type:'other' }]);

  const typeColor  = (type: string) => ({ product:'bg-cyan-50 border-l-4 border-cyan-400', box:'bg-amber-50 border-l-4 border-amber-400', bubble:'bg-purple-50 border-l-4 border-purple-400', other:'bg-white border-l-4 border-slate-300' }[type] || '');
  const typeBadge  = (type: string) => ({ product:<span className="px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded text-[10px] font-bold">สินค้า</span>, box:<span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold">กล่อง</span>, bubble:<span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-bold">บั้บเบิ้ล</span>, other:<span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">อื่นๆ</span> }[type]);

  const filteredHistory = history.filter(h => {
    if (hSearch && !h.doc_no.toLowerCase().includes(hSearch.toLowerCase()) && !(h.created_by||'').toLowerCase().includes(hSearch.toLowerCase()) && !(h.approved_by||'').toLowerCase().includes(hSearch.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-screen p-6 pb-2 bg-slate-50">
      {/* Header */}
      <div className="shrink-0 flex items-start justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center"><FileText size={20} className="text-white"/></div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">ใบเบิกสินค้า</h2>
            {tab === 'create' && <p className="text-sm text-slate-500">ออเดอร์กำลังแพ็ค {orderCount} รายการ{multiCount > 0 ? ` · แพ็คพิเศษ ${multiCount} รายการ` : ''}</p>}
          </div>
        </div>
        {tab === 'create' && (
          <div className="flex gap-2">
            <button onClick={() => { loadAndAggregate(); }} disabled={loading}
              className="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 flex items-center gap-2 text-sm">
              <RefreshCw size={13} className={loading?'animate-spin':''}/> รีโหลด
            </button>
            <button onClick={() => printDoc(docNo, docDate, items.filter(it=>it.name.trim()), note)} disabled={items.length===0}
              className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 flex items-center gap-2 text-sm disabled:opacity-50">
              <Printer size={14}/> ปริ้น / PDF
            </button>
            <button onClick={handleSave} disabled={saving || items.length===0 || !createdBy.trim() || !approvedBy.trim()}
              className="px-5 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2 font-medium disabled:opacity-50">
              <CheckCircle size={16}/> {saving ? 'กำลังบันทึก...' : 'อนุมัติใบเบิกสินค้า'}
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-4 shrink-0">
        <button onClick={() => setTab('create')} className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${tab==='create'?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
          <FileText size={14}/> สร้างใบเบิก
        </button>
        <button onClick={() => setTab('history')} className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${tab==='history'?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
          <History size={14}/> ประวัติใบเบิก
        </button>
      </div>

      {/* ── Tab: สร้างใบเบิก ── */}
      {tab === 'create' && (
        <>
          {/* Document Info */}
          <div className="shrink-0 bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">เลขที่เอกสาร</label>
                <div className="border rounded-lg px-3 py-2 bg-slate-50 flex justify-between">
                  <span className="font-mono text-sm font-bold text-blue-700">{docNo||'...'}</span>
                  <span className="text-xs text-slate-400">อัตโนมัติ</span>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">วันที่ออก <span className="text-red-400">*</span></label>
                <input type="date" value={docDate} onChange={e => setDocDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-blue-600 font-medium"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">ผู้สร้างใบเบิก <span className="text-red-400">*</span></label>
                <input value={createdBy} onChange={e => setCreatedBy(e.target.value)} placeholder="ชื่อผู้สร้าง..."
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${!createdBy.trim() ? 'border-red-300 bg-red-50' : 'border-green-400'}`}/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">ผู้อนุมัติ <span className="text-red-400">*</span></label>
                <input value={approvedBy} onChange={e => setApprovedBy(e.target.value)} placeholder="ชื่อผู้อนุมัติ..."
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${!approvedBy.trim() ? 'border-red-300 bg-red-50' : 'border-green-400'}`}/>
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs font-semibold text-slate-500 block mb-1">หมายเหตุ</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="ระบุหมายเหตุ (ถ้ามี)"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
            </div>
          </div>

          {/* Items */}
          <div className="shrink-0 mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-slate-700 flex items-center gap-2">
              สินค้าที่ต้องการเบิก
              <span className="px-2 py-0.5 bg-slate-100 rounded-full text-xs text-slate-500">{items.length} รายการ</span>
            </h3>
            <button onClick={addItem} className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 flex items-center gap-1.5">
              <Plus size={13}/> เพิ่มรายการ
            </button>
          </div>

          <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-100 overflow-auto min-h-0">
            {loading ? (
              <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw size={16} className="animate-spin"/> กำลังคำนวณ...
              </div>
            ) : items.length === 0 ? (
              <div className="p-12 text-center text-slate-400">ไม่มีออเดอร์กำลังแพ็ค</div>
            ) : (
              <table className="w-full text-sm" style={{minWidth:'600px'}}>
                <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
                  <tr>
                    <th className="p-3 text-center w-10">#</th>
                    <th className="p-3 text-left w-20">ประเภท</th>
                    <th className="p-3 text-left">สินค้า / รายการ</th>
                    <th className="p-3 text-center w-36">จำนวน</th>
                    <th className="p-3 text-center w-24">หน่วย</th>
                    <th className="p-3 text-center w-12">ลบ</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.key} className={`border-b ${typeColor(item.type)}`}>
                      <td className="p-3 text-center text-slate-500 font-bold">{idx+1}</td>
                      <td className="p-3">{typeBadge(item.type)}</td>
                      <td className="p-3">
                        {item.type === 'other' ? (
                          <input value={item.name} onChange={e => updateName(item.key, e.target.value)} placeholder="ชื่อสินค้า/รายการ..."
                            className="w-full border-b border-dashed border-slate-300 focus:outline-none focus:border-blue-400 bg-transparent text-sm px-1"/>
                        ) : <span className="font-medium text-slate-800">{item.name}</span>}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => updateQty(item.key, item.qty-1)} className="w-7 h-7 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold flex items-center justify-center">−</button>
                          <input type="number" value={item.qty} min={1} onChange={e => updateQty(item.key, Number(e.target.value))}
                            className="w-14 text-center border rounded-lg py-1 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-300"/>
                          <button onClick={() => updateQty(item.key, item.qty+1)} className="w-7 h-7 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold flex items-center justify-center">+</button>
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <input value={item.unit} onChange={e => updateUnit(item.key, e.target.value)}
                          className="w-full text-center border-b border-dashed border-slate-300 focus:outline-none focus:border-blue-400 bg-transparent text-sm"/>
                      </td>
                      <td className="p-3 text-center">
                        <button onClick={() => removeItem(item.key)} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50"><Trash2 size={14}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-200 sticky bottom-0">
                  <tr>
                    <td colSpan={3} className="p-3 text-right text-sm font-semibold text-slate-600">จำนวนทั้งสิ้น</td>
                    <td className="p-3 text-center font-bold text-slate-800">{items.reduce((s,it)=>s+it.qty,0)}</td>
                    <td colSpan={2} className="p-3 text-center text-xs text-slate-400">{items.length} รายการ</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── Tab: ประวัติใบเบิก ── */}
      {tab === 'history' && (
        <>
          {/* Filter bar */}
          <div className="shrink-0 bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input value={hSearch} onChange={e => setHSearch(e.target.value)}
                  placeholder="ค้นหาเลขที่เอกสาร / ผู้สร้าง / ผู้อนุมัติ..."
                  className="w-full pl-8 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
              </div>
              <div>
                <input type="date" value={hDateFrom} onChange={e => setHDateFrom(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="จากวันที่"/>
              </div>
              <div className="flex gap-2">
                <input type="date" value={hDateTo} onChange={e => setHDateTo(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                <button onClick={loadHistory} disabled={hLoading}
                  className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm flex items-center gap-1.5 shrink-0">
                  <Search size={13}/> ค้นหา
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-100 overflow-auto min-h-0">
            <table className="w-full text-sm" style={{minWidth:'800px'}}>
              <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                  <th className="p-3 text-left whitespace-nowrap">เลขที่เอกสาร</th>
                  <th className="p-3 text-left">รายการสินค้า</th>
                  <th className="p-3 text-center whitespace-nowrap">จำนวน (รวม)</th>
                  <th className="p-3 text-left whitespace-nowrap">ผู้สร้าง</th>
                  <th className="p-3 text-left whitespace-nowrap">ผู้อนุมัติ</th>
                  <th className="p-3 text-left whitespace-nowrap">หมายเหตุ</th>
                  <th className="p-3 text-center whitespace-nowrap">ปริ้น</th>
                </tr>
              </thead>
              <tbody>
                {hLoading && <tr><td colSpan={8} className="p-8 text-center text-slate-400">กำลังโหลด...</td></tr>}
                {!hLoading && filteredHistory.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-400">ไม่พบข้อมูล</td></tr>}
                {filteredHistory.map(h => {
                  const itemList = (h.items||[]).filter((it:any) => it.name?.trim());
                  const totalQty = itemList.reduce((s:number, it:any) => s + Number(it.qty), 0);
                  return (
                    <tr key={h.id} className="border-b hover:bg-slate-50">
                      <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(h.doc_date).toLocaleDateString('th-TH')}
                        <div className="text-slate-400 text-[10px]">{new Date(h.created_at).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}</div>
                      </td>
                      <td className="p-3 font-mono text-sm text-blue-700 font-bold whitespace-nowrap">{h.doc_no}</td>
                      <td className="p-3 text-xs text-slate-600">
                        <div className="space-y-0.5">
                          {itemList.slice(0,3).map((it:any,i:number) => (
                            <div key={i}>{it.name} <span className="text-slate-400">×{it.qty} {it.unit}</span></div>
                          ))}
                          {itemList.length > 3 && <div className="text-slate-400">+{itemList.length-3} รายการ</div>}
                        </div>
                      </td>
                      <td className="p-3 text-center font-bold text-slate-800">{totalQty}</td>
                      <td className="p-3 text-xs text-slate-600 whitespace-nowrap">{(h as any).created_by || <span className="text-slate-300">-</span>}</td>
                      <td className="p-3 text-xs text-slate-600 whitespace-nowrap">{(h as any).approved_by || <span className="text-slate-300">-</span>}</td>
                      <td className="p-3 text-xs text-slate-500 max-w-[120px] truncate">{h.note || <span className="text-slate-300">-</span>}</td>
                      <td className="p-3 text-center">
                        <button onClick={() => printDoc(h.doc_no, h.doc_date, itemList, h.note||'')}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="ปริ้น PDF">
                          <Printer size={15}/>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl text-white text-sm font-medium ${toast.type==='success'?'bg-emerald-500':'bg-red-500'}`} style={{minWidth:'280px'}}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
