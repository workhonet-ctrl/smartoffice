import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { extractQty } from '../lib/utils';
import { Order } from '../lib/types';
import { Download, Eye, X, Trash2, Edit2 } from 'lucide-react';
import * as XLSX from 'xlsx';

type PreviewRow = {
  order_no: string; name: string; address: string; postal_code: string;
  phone: string; cod: string | number; item_desc: string;
  item_type: string; weight_kg: string; box_lwh: string; product_type: string;
};

// สินค้าแต่ละรายการใน order ที่แก้ได้
type OrderItem = { rawProd: string; qty: number; selected: boolean; };
type OrderSelections = Record<string, OrderItem[]>; // orderId → items


// สร้าง default items จาก order
function makeItems(order: Order): OrderItem[] {
  const prods = (order.raw_prod || '').split('|').map(s => s.trim()).filter(Boolean);
  const qtys  = String((order as any).quantities || order.quantity || '1').split('|');
  if (prods.length === 0) return [{ rawProd: order.raw_prod || '-', qty: 1, selected: true }];
  return prods.map((p, i) => ({ rawProd: p, qty: Number(qtys[i]?.trim()) || 1, selected: true }));
}

export default function FlashExport() {
  const [orders, setOrders]               = useState<Order[]>([]);
  const [exportedOrders, setExportedOrders] = useState<Order[]>([]);
  const [printedOrders, setPrintedOrders]   = useState<Order[]>([]);
  const [loading, setLoading]             = useState(true);
  const [exporting, setExporting]         = useState(false);
  const [reExporting, setReExporting]     = useState(false);
  const [previewing, setPreviewing]       = useState(false);
  const [previewRows, setPreviewRows]     = useState<PreviewRow[]>([]);
  const [showPreview, setShowPreview]     = useState(false);
  const [tab, setTab] = useState<'pending' | 'pack' | 'exported' | 'printed'>('pending');
  // คืนสต็อก popup
  const [returnOrder, setReturnOrder]     = useState<Order | null>(null);
  const [returnType, setReturnType]       = useState<'no_send' | 'returned' | ''>('');
  const [returnNote, setReturnNote]       = useState('');
  const [returnSaving, setReturnSaving]   = useState(false);
  const [selectedPending,  setSelectedPending]  = useState<Set<string>>(new Set());
  const [selectedExported, setSelectedExported] = useState<Set<string>>(new Set());
  const [selectedPrinted,  setSelectedPrinted]  = useState<Set<string>>(new Set());
  const [orderSelections, setOrderSelections] = useState<OrderSelections>({});
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [searchProduct, setSearchProduct]   = useState('');
  const [searchExported, setSearchExported] = useState('');
  const [minAmount, setMinAmount]           = useState('');
  const [maxAmount, setMaxAmount]           = useState('');
  const [minAmountExp, setMinAmountExp]     = useState('');
  const [maxAmountExp, setMaxAmountExp]     = useState('');
  // upload tracking file
  const [uploadResult, setUploadResult] = useState<{ matched: number; notFound: number; conflicts: number; duplicate?: number } | null>(null);
  const [uploading, setUploading] = useState(false);

  // ── Conflict resolution ──────────────────────────────────────────────
  type ConflictItem = {
    tracking: string; name: string; tel: string;
    cod: string; size: string; time: string;
    candidates: { id: string; raw_prod: string | null; order_date: string | null; total_thb: number }[];
    chosen: string | null; // order id ที่เลือก
  };
  const [conflicts, setConflicts]   = useState<ConflictItem[]>([]);
  const [showConflict, setShowConflict] = useState(false);

  useEffect(() => { loadOrders(); loadPackReady(); loadPrintedOrders(); loadExportedOrders(); }, []);

  // รอแพ็ค = export แล้ว ยังไม่มี tracking
  const [packReadyOrders, setPackReadyOrders] = useState<Order[]>([]);
  const loadPackReady = async () => {
    const { data } = await supabase.from('orders').select('*, customers(*)')
      .eq('route', 'B').eq('order_status', 'รอแพ็ค').is('tracking_no', null)
      .order('updated_at', { ascending: false });
    if (data) setPackReadyOrders(data);
  };

  // ปริ้นแล้ว → กำลังแพ็ค = กำลังแพ็ค + แพ็คสินค้า (อนุมัติใบเบิกแล้ว รอส่ง), route B
  const loadPrintedOrders = async () => {
    const { data } = await supabase.from('orders').select('*, customers(*)')
      .eq('route', 'B').in('order_status', ['กำลังแพ็ค', 'แพ็คสินค้า'])
      .order('updated_at', { ascending: false });
    if (data) setPrintedOrders(data);
  };

  const loadOrders = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('orders').select('*, customers(*)')
        .eq('route', 'B').eq('order_status', 'รอคีย์ออเดอร์').order('created_at', { ascending: false });
      if (data) {
        setOrders(data);
        // initialize selections
        const sel: OrderSelections = {};
        data.forEach((o: Order) => { sel[o.id] = makeItems(o); });
        setOrderSelections(sel);
      }
    } finally { setLoading(false); }
  };

  // ส่งสำเร็จ = ส่งสินค้าแล้ว (มี tracking + ยืนยันส่ง), ทุก route
  // helper: bulk update เป็น chunk ป้องกัน URL เกิน limit
  // ── คืนสต็อก ───────────────────────────────────────────────────────────
  const handleReturnOrder = async () => {
    if (!returnOrder || !returnType) return;
    setReturnSaving(true);
    try {
      const orderNo = (returnOrder as any).order_no;
      const custName = returnOrder.customers?.name || orderNo;
      const promoIds: string[] = (returnOrder as any).promo_ids || [];
      const quantities = String((returnOrder as any).quantities || '1').split('|');

      // 1. หา stock_items จาก promo_ids → products_promo → products_master → stock_items
      const txns: any[] = [];
      for (let i = 0; i < promoIds.length; i++) {
        const pid = promoIds[i];
        const qty = Number(quantities[i] || 1);
        const { data: promo } = await supabase
          .from('products_promo').select('id, name, short_name, master_id').eq('id', pid).maybeSingle();
        if (!promo) continue;

        // หา stock_item จากชื่อ short_name หรือ name
        const searchName = promo.short_name || promo.name;
        const { data: si } = await supabase
          .from('stock_items').select('id, name')
          .or(`name.ilike.%${searchName}%`)
          .maybeSingle();

        if (si) {
          const noteText = returnType === 'no_send'
            ? `คืนสต็อก(ไม่ได้ส่ง) ออเดอร์ ${orderNo} - ${custName}${returnNote ? ' | ' + returnNote : ''}`
            : `คืนสต็อก(ตีกลับ) ออเดอร์ ${orderNo} - ${custName}${returnNote ? ' | ' + returnNote : ''}`;
          txns.push({
            stock_item_id: si.id,
            txn_type: 'in',
            qty,
            ref_type: returnType === 'no_send' ? 'return_no_send' : 'return_rejected',
            ref_id: orderNo,
            note: noteText,
          });
        }
      }

      // 2. insert stock transactions
      if (txns.length > 0) {
        const { error: txnErr } = await supabase.from('stock_transactions').insert(txns);
        if (txnErr) throw txnErr;
      }

      // 3. อัพเดต order_status
      const newStatus = returnType === 'no_send' ? 'รอแพ็ค' : 'ตีกลับ';
      await supabase.from('orders')
        .update({ order_status: newStatus, parcel_status: 'ยังไม่มีเลขพัสดุ' })
        .eq('id', returnOrder.id);

      const label = returnType === 'no_send' ? 'ไม่ได้ส่ง' : 'ตีกลับ';
      showToast(`✓ คืนสต็อก (${label}) ออเดอร์ ${orderNo} แล้ว — ย้ายกลับ ${newStatus}`);
      setReturnOrder(null);
      setReturnType('');
      setReturnNote('');
      await Promise.all([loadPrintedOrders(), loadOrders()]);
    } catch (err: any) {
      showToast('❌ ' + (err.message || 'unknown'), 'error');
    } finally { setReturnSaving(false); }
  };

  const bulkUpdate = async (ids: string[], payload: Record<string, string>) => {
    const CHUNK = 200;
    for (let i = 0; i < ids.length; i += CHUNK) {
      await supabase.from('orders').update(payload).in('id', ids.slice(i, i + CHUNK));
    }
  };

  const loadExportedOrders = async () => {
    const { data } = await supabase.from('orders').select('*, customers(*)')
      .in('order_status', ['ส่งสินค้าแล้ว', 'ส่งสินค้าแล้ว'])
      .order('updated_at', { ascending: false });
    if (data) {
      setExportedOrders(data);
      const sel: any = {};
      data.forEach((o: Order) => { sel[o.id] = makeItems(o); });
      setOrderSelections(s => ({ ...s, ...sel }));
    }
  };

  // build rows สำหรับ export/preview — รับ targetOrders
  const buildExportRows = async (targetOrders: Order[]) => {
    const rows: any[] = [];
    const previews: PreviewRow[] = [];

    for (const order of targetOrders) {
      const isCOD     = order.payment_method === 'COD' || (order.payment_method !== 'BANK' && order.payment_status !== 'ชำระแล้ว');
      const codAmount = isCOD ? Math.floor(order.total_thb) : '';
      const address = [
        order.customers?.address,
        order.customers?.subdistrict ? `ตำบล${order.customers.subdistrict}` : null,
        order.customers?.district    ? `อำเภอ${order.customers.district}` : null,
        order.customers?.province    ? `จังหวัด${order.customers.province}` : null,
      ].filter(Boolean).join(' ');
      const orderNoWithName = `${order.order_no} ${order.raw_prod || ''}`.trim();

      // ใช้ selections ที่ผู้ใช้เลือกไว้ (กรองเฉพาะ selected=true)
      const items = (orderSelections[order.id] || makeItems(order)).filter(it => it.selected);
      const rawProds = items.map(it => it.rawProd);
      const rawQtys  = items.map(it => it.qty);

      const itemDescs: string[] = [];
      let totalWeightKg = 0, flashItemType = 'พัสดุ', boxL = 1, boxW = 1, boxH = 1;

      for (let i = 0; i < Math.min(rawProds.length, 5); i++) {
        const qtyFromSel = rawQtys[i] || 1;
        // หา index ใน promo_ids จาก rawProd ต้นฉบับ
        const origProds = (order.raw_prod || '').split('|').map((s: string) => s.trim());
        const origIdx   = origProds.indexOf(rawProds[i]);
        const pid = origIdx >= 0 ? order.promo_ids?.[origIdx] : order.promo_ids?.[i];
        let p: any = null;
        if (pid) {
          const { data } = await supabase.from('products_promo')
            .select('*, boxes(*), bubbles(*), products_master(*)').eq('id', pid).maybeSingle();
          p = data;
        }
        const shortName = p?.short_name || p?.name || rawProds[i];
        const qty    = qtyFromSel; // จำนวน pack ที่ user กำหนด
        const pieces = p?.name ? extractQty(p.name) * qty : qty; // จำนวนชิ้นจริง เช่น 1แถม1 × 1 = 2 ชิ้น
        itemDescs.push(`${shortName}|-|-|${qty}`);
        if (p?.products_master?.weight_g) totalWeightKg += (Number(p.products_master.weight_g) * pieces) / 1000;
        if (i === 0) { boxL = Number(p?.boxes?.length_cm)||1; boxW = Number(p?.boxes?.width_cm)||1; boxH = Number(p?.boxes?.height_cm)||1; flashItemType = p?.item_type||'พัสดุ'; }
      }
      if (totalWeightKg === 0) totalWeightKg = Math.max(Number(order.weight_kg ?? 0), 0.1);
      // ปัดน้ำหนักตามเกณฑ์ Flash: < 0.5 kg → 1.0, >= 0.5 kg → ปัดขึ้นทีละ 0.5
      const roundedWeight = totalWeightKg < 0.5
        ? 1.0
        : Math.ceil(totalWeightKg / 0.5) * 0.5 + 0.5;
      const weightKgStr = roundedWeight.toFixed(2);
      const [d1='',d2='',d3='',d4='',d5=''] = [...itemDescs,'','','','',''];
      const phone = (order.customers?.tel||'').replace(/[^0-9]/g,'');

      rows.push([orderNoWithName, order.customers?.name||'', address, order.customers?.postal_code||'', phone, '', codAmount, d1,d2,d3,d4,d5, flashItemType, weightKgStr, boxL,boxW,boxH,'','','','Happy Return','','','']);
      previews.push({ order_no: orderNoWithName, name: order.customers?.name||'-', address, postal_code: order.customers?.postal_code||'-', phone, cod: codAmount, item_desc: itemDescs.join(' | ')||'-', item_type: flashItemType, weight_kg: weightKgStr, box_lwh: `${boxL}×${boxW}×${boxH}`, product_type: 'Happy Return' });
    }
    return { rows, previews };
  };

  const doExport = async (targetOrders: Order[], filename: string, updateStatus: boolean) => {
    const { rows } = await buildExportRows(targetOrders);
    const headers = ['Customer_order_number\n(เลขออเดอร์ของลูกค้า)','*Consignee_name\n(ชื่อผู้รับ)','*Address\n(ที่อยู่)','*Postal_code\n(รหัสไปรษณีย์)','*Phone_number\n(เบอร์โทรศัพท์)','Phone_number2\n(เบอร์โทรศัพท์)','COD\n(ยอดเรียกเก็บ)','Item description1(Name|Size/Weight|color|quantity)','Item description2(Name|Size/Weight|color|quantity)','Item description3(Name|Size/Weight|color|quantity)','Item description4(Name|Size/Weight|color|quantity)','Item description5(Name|Size/Weight|color|quantity)','Item_type\n(ประเภทสินค้า)','*Weight_kg\n(น้ำหนัก)','*Length\n(ยาว)','*Width\n(กว้าง)','*Height\n(สูง)','Flash_care','Declared_value\n(มูลค่าสินค้าที่ระบุโดยลูกค้า)','Box_shield','*Product_type         (ประเภทสินค้า）','Remark1\n(หมายเหตุ1)','Remark2\n(หมายเหตุ2)','Remark3\n(หมายเหตุ3)'];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Flash Export');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob  = new Blob([wbout], { type: 'application/octet-stream' });
    const url   = URL.createObjectURL(blob);
    const link  = document.createElement('a');
    link.href = url; link.download = filename; link.click();
    URL.revokeObjectURL(url);
    if (updateStatus) {
      const ids = targetOrders.map(o => o.id);
      await bulkUpdate(ids, { order_status: 'รอแพ็ค' });
      setOrders([]); setSelectedPending(new Set());
      await Promise.all([loadOrders(), loadPackReady()]);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const target = selectedPending.size > 0 ? orders.filter(o => selectedPending.has(o.id)) : orders;
      await doExport(target, `Flash_Export_${new Date().toISOString().split('T')[0]}.xlsx`, true);
    } catch(e) { console.error(e); alert('เกิดข้อผิดพลาด'); }
    finally { setExporting(false); }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const target = selectedPending.size > 0 ? orders.filter(o => selectedPending.has(o.id)) : orders;
      const { previews } = await buildExportRows(target);
      setPreviewRows(previews); setShowPreview(true);
    } finally { setPreviewing(false); }
  };

  const handleReExport = async () => {
    setReExporting(true);
    try {
      const target = selectedExported.size > 0
        ? exportedOrders.filter(o => selectedExported.has(o.id))
        : filteredExportedOrders;
      await doExport(target, `Flash_ReExport_${new Date().toISOString().split('T')[0]}.xlsx`, false);
    } catch(e) { console.error(e); alert('เกิดข้อผิดพลาด'); }
    finally { setReExporting(false); }
  };

  // ลบ = reset กลับเป็น รอแพ็ค
  const handleDeleteExported = async (ids: string[]) => {
    if (!confirm(`ยืนยันลบ ${ids.length} รายการออกจากส่งออกแล้ว?`)) return;
    await bulkUpdate(ids, { order_status: 'รอคีย์ออเดอร์' });
    setSelectedExported(new Set());
    await Promise.all([loadOrders(), loadExportedOrders()]);
  };

  // ── ย้าย route B → A เพื่อส่งผ่าน MyOrder Export ─────────────────────
  const [movingToMyOrder, setMovingToMyOrder] = useState(false);
  const handleMoveToMyOrder = async () => {
    const targets = selectedPrinted.size > 0
      ? printedOrders.filter(o => selectedPrinted.has(o.id))
      : printedOrders;
    if (targets.length === 0) return;
    if (!confirm(`ย้าย ${targets.length} ออเดอร์ไปยัง MyOrder Export?\nออเดอร์จะเปลี่ยน route เป็น MyOrder และกลับไปที่ "รอคีย์ออเดอร์"`)) return;
    setMovingToMyOrder(true);
    try {
      await supabase.from('orders')
        .update({ route: 'A', order_status: 'รอคีย์ออเดอร์' })

      setSelectedPrinted(new Set());
      await Promise.all([loadOrders(), loadExportedOrders(), loadPrintedOrders()]);
    } finally { setMovingToMyOrder(false); }
  };

  const handleFlashUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      let matched = 0; let notFound = 0; let conflictCount = 0;
      let duplicateTracking = 0;
      const newConflicts: ConflictItem[] = [];

      // โหลดออเดอร์ route B ที่ยังไม่มี tracking
      const { data: allOrders } = await supabase
        .from('orders')
        .select('id, order_date, order_status, total_thb, raw_prod, customers(name, tel)')
        .eq('route', 'B')
        .or('tracking_no.is.null,tracking_no.eq.');

      // ── Pre-check: โหลด tracking ทั้งหมดที่มีในระบบ เพื่อตรวจซ้ำก่อน assign ──
      const trackingsInFile = rows.slice(1)
        .map(r => String(r[1] || '').trim())
        .filter(Boolean);
      const existingTrackSet = new Set<string>();
      if (trackingsInFile.length > 0) {
        const CHUNK = 500;
        for (let i = 0; i < trackingsInFile.length; i += CHUNK) {
          const chunk = trackingsInFile.slice(i, i + CHUNK);
          const { data: existing } = await supabase
            .from('orders').select('tracking_no')
            .in('tracking_no', chunk);
          (existing || []).forEach((o: any) => {
            if (o.tracking_no) existingTrackSet.add(o.tracking_no);
          });
        }
      }

      for (let i = 1; i < rows.length; i++) {
        const row      = rows[i];
        const tracking = String(row[1] || '').trim();
        const name     = String(row[10] || '').trim();
        const tel      = String(row[11] || '').replace(/\D/g, '');
        const cod      = String(row[17] || '');
        const size     = String(row[16] || '');
        const time     = String(row[0] || '').substring(0, 16);

        if (!tracking || (!name && !tel)) continue;

        // ⚠ ข้าม tracking ที่มีอยู่แล้วในระบบ (ป้องกัน 409 unique violation)
        if (existingTrackSet.has(tracking)) {
          duplicateTracking++;
          continue;
        }

        // หา orders ที่ตรงกับ name หรือ tel ทั้งหมด
        const matches = (allOrders || []).filter((o: any) => {
          const cTel  = String((o.customers as any)?.tel || '').replace(/\D/g, '');
          const cName = String((o.customers as any)?.name || '').trim();
          return cTel === tel || cName === name;
        });

        if (matches.length === 0) {
          notFound++;
        } else if (matches.length === 1) {
          // ตรงเดียว → assign ทันที
          await supabase.from('orders')
            .update({ tracking_no: tracking, order_status: 'กำลังแพ็ค' })
            .eq('id', matches[0].id);
          matched++;
        } else {
          // ซ้ำ → เพิ่มเข้า conflict queue ให้ user เลือก
          conflictCount++;
          newConflicts.push({
            tracking, name, tel, cod, size, time,
            candidates: matches.map((o: any) => ({
              id: o.id,
              raw_prod: o.raw_prod,
              order_date: o.order_date,
              total_thb: o.total_thb,
            })),
            chosen: null,
          });
        }
      }

      setUploadResult({ matched, notFound, conflicts: conflictCount, duplicate: duplicateTracking });
      if (newConflicts.length > 0) {
        setConflicts(newConflicts);
        setShowConflict(true);
      }
      await Promise.all([loadOrders(), loadPackReady(), loadPrintedOrders()]);
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการอ่านไฟล์');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // ── บันทึก conflict ที่ user เลือกแล้ว ──────────────────────────────────
  const handleConflictSave = async () => {
    for (const c of conflicts) {
      if (!c.chosen) continue;
      await supabase.from('orders')
        .update({ tracking_no: c.tracking, order_status: 'กำลังแพ็ค' })
        .eq('id', c.chosen);
    }
    setShowConflict(false);
    setConflicts([]);
    await Promise.all([loadOrders(), loadPrintedOrders()]);
  };

  const togglePending  = (id: string) => setSelectedPending(s  => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleExported = (id: string) => setSelectedExported(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const filteredOrders = orders.filter(o => {
    if (searchProduct.trim() && !(o.raw_prod || '').toLowerCase().includes(searchProduct.toLowerCase())) return false;
    if (minAmount !== '' && Number(o.total_thb) < Number(minAmount)) return false;
    if (maxAmount !== '' && Number(o.total_thb) > Number(maxAmount)) return false;
    return true;
  });

  const filteredExportedOrders = exportedOrders.filter(o => {
    if (searchExported.trim() && !(o.raw_prod || '').toLowerCase().includes(searchExported.toLowerCase())) return false;
    if (minAmountExp !== '' && Number(o.total_thb) < Number(minAmountExp)) return false;
    if (maxAmountExp !== '' && Number(o.total_thb) > Number(maxAmountExp)) return false;
    return true;
  });

  const allPendingSelected  = filteredOrders.length > 0 && filteredOrders.every(o => selectedPending.has(o.id));
  const allExportedSelected = filteredExportedOrders.length > 0 && filteredExportedOrders.every(o => selectedExported.has(o.id));

  const pendingCount  = selectedPending.size  > 0 ? selectedPending.size  : filteredOrders.length;
  const exportedCount = selectedExported.size > 0 ? selectedExported.size : filteredExportedOrders.length;

  if (loading) return <div className="p-6">กำลังโหลด...</div>;

  return (
    <div className="flex flex-col h-screen p-6 pb-2">
      <h2 className="text-2xl font-bold text-slate-800 mb-4 shrink-0">Flash Export</h2>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-4 shrink-0">
        <button onClick={() => setTab('pending')} className={`px-5 py-2 rounded-lg text-sm font-medium transition ${tab==='pending'?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
          รอส่งออก <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab==='pending'?'bg-yellow-100 text-yellow-700':'bg-slate-200 text-slate-500'}`}>{orders.length}</span>
        </button>
        <button onClick={() => setTab('pack')} className={`px-5 py-2 rounded-lg text-sm font-medium transition ${tab==='pack'?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
          รอแพ็ค <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab==='pack'?'bg-teal-100 text-teal-700':'bg-slate-200 text-slate-500'}`}>{packReadyOrders.length}</span>
        </button>
        <button onClick={() => setTab('printed')} className={`px-5 py-2 rounded-lg text-sm font-medium transition ${tab==='printed'?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
          กำลังแพ็ค <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab==='printed'?'bg-orange-100 text-orange-700':'bg-slate-200 text-slate-500'}`}>{printedOrders.length}</span>
        </button>
        <button onClick={() => setTab('exported')} className={`px-5 py-2 rounded-lg text-sm font-medium transition ${tab==='exported'?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
          ส่งสำเร็จ <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab==='exported'?'bg-green-100 text-green-700':'bg-slate-200 text-slate-500'}`}>{exportedOrders.length}</span>
        </button>
      </div>

      {/* ── Tab: รอส่งออก ── */}
      {tab === 'pending' && (
        <>
          <div className="flex gap-3 mb-3 shrink-0 flex-wrap items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input type="text" value={searchProduct} onChange={e => setSearchProduct(e.target.value)}
                placeholder="ค้นหาชื่อสินค้า เช่น ครีม Secret Rose(1 แถม 1)..."
                className="w-full pl-8 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"/>
            </div>
            {/* Filter ยอด (฿) */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-slate-500 whitespace-nowrap">ยอด ฿</span>
              <input type="number" min={0} value={minAmount} onChange={e => setMinAmount(e.target.value)}
                placeholder="ต่ำสุด"
                className="border rounded-lg px-2 py-2 text-xs w-24 focus:outline-none focus:ring-2 focus:ring-yellow-300"/>
              <span className="text-slate-400 text-xs">—</span>
              <input type="number" min={0} value={maxAmount} onChange={e => setMaxAmount(e.target.value)}
                placeholder="สูงสุด"
                className="border rounded-lg px-2 py-2 text-xs w-24 focus:outline-none focus:ring-2 focus:ring-yellow-300"/>
              {(minAmount || maxAmount) && (
                <button onClick={() => { setMinAmount(''); setMaxAmount(''); }}
                  className="text-slate-400 hover:text-red-500 text-xs px-1">✕</button>
              )}
            </div>
            {(searchProduct || minAmount || maxAmount) && (
              <span className="text-xs text-slate-500 shrink-0">พบ {filteredOrders.length} รายการ</span>
            )}
            <button onClick={handlePreview} disabled={orders.length===0||previewing}
              className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 flex items-center gap-2 disabled:opacity-50 text-sm">
              <Eye size={16}/> {previewing?'กำลังโหลด...':'ดูตัวอย่าง'}{selectedPending.size>0?` (${selectedPending.size})`:''}
            </button>
            <button onClick={handleExport} disabled={orders.length===0||exporting}
              className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 flex items-center gap-2 disabled:opacity-50 text-sm">
              <Download size={16}/> {exporting?'กำลังส่งออก...':`ส่งออก Flash (${pendingCount} รายการ)`}
            </button>
            {selectedPending.size>0 && <span className="self-center text-xs text-slate-500">เลือก {selectedPending.size} จาก {orders.length}</span>}
          </div>

          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm" style={{minWidth:'700px', width:'100%'}}>
              <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0">
                <tr>
                  <th className="p-3 w-8">
                    <input type="checkbox" checked={allPendingSelected}
                      onChange={e => setSelectedPending(e.target.checked ? new Set(filteredOrders.map(o=>o.id)) : new Set())}
                      className="rounded"/>
                  </th>
                  <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                  <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
                  <th className="p-3 text-left">ลูกค้า</th>
                  <th className="p-3 text-left">สินค้า</th>
                  <th className="p-3 text-center w-10">แก้</th>
                  <th className="p-3 text-center whitespace-nowrap">ชำระ</th>
                  <th className="p-3 text-right whitespace-nowrap">ยอด (฿)</th>
                  <th className="p-3 text-left">ที่อยู่</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length===0 && <tr><td colSpan={9} className="p-8 text-center text-slate-400">{searchProduct ? `ไม่พบสินค้า "${searchProduct}"` : 'ไม่มีออเดอร์รอส่งออก'}</td></tr>}
                {filteredOrders.map(o => {
                  const isCOD = o.payment_method === 'COD' || (o.payment_method !== 'BANK' && o.payment_status !== 'ชำระแล้ว');
                  return (
                  <tr key={o.id} className={`border-b hover:bg-slate-50 ${selectedPending.has(o.id)?'bg-yellow-50':''}`}>
                    <td className="p-3 text-center">
                      <input type="checkbox" checked={selectedPending.has(o.id)} onChange={()=>togglePending(o.id)} className="rounded"/>
                    </td>
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                      {o.order_date ? o.order_date.split('-').reverse().join('-') : '-'}
                      {(o as any).order_time && <div className="text-slate-400">{(o as any).order_time}</div>}
                    </td>
                    <td className="p-3 font-mono text-xs text-blue-600 whitespace-nowrap">{o.order_no}</td>
                    <td className="p-3 whitespace-nowrap">{o.customers?.name||'-'}</td>
                    <td className="p-3 text-xs text-slate-500 max-w-[160px]">
                      {/* แสดงสินค้าที่เลือก */}
                      <div className="space-y-0.5">
                        {(orderSelections[o.id] || makeItems(o)).map((item, idx) => (
                          <div key={idx} className={`flex items-center gap-1 ${!item.selected ? 'opacity-30 line-through' : ''}`}>
                            <span className="truncate text-slate-700">{item.rawProd}</span>
                            <span className="shrink-0 text-xs text-slate-400">×{item.qty}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <button onClick={() => setEditingOrder(o)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="แก้ไขสินค้า">
                        <Edit2 size={14}/>
                      </button>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isCOD ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                        {isCOD ? 'COD' : 'โอน'}
                      </span>
                    </td>
                    <td className="p-3 text-right font-bold">฿{Number(o.total_thb).toLocaleString()}</td>
                    <td className="p-3 text-xs text-slate-400 max-w-[200px] truncate">{[o.customers?.address,o.customers?.district,o.customers?.province].filter(Boolean).join(' ')}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Tab: ส่งออกแล้ว ── */}
      {/* ── Tab: รอแพ็ค (export แล้ว ยังไม่มี tracking) ── */}
      {tab === 'pack' && (
        <>
          <div className="shrink-0 flex gap-2 mb-3 items-center flex-wrap">
            <span className="text-xs text-teal-700 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
              📦 ออเดอร์รอแพ็ค {packReadyOrders.length} รายการ · หน้าแพ็คสินค้าดึงข้อมูลจากนี้
            </span>
            <button onClick={handleMoveToMyOrder} disabled={movingToMyOrder || packReadyOrders.length === 0}
              className="px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 text-xs font-medium disabled:opacity-50">
              📦 {movingToMyOrder ? 'กำลังย้าย...' : `ย้ายไป MyOrder${selectedPrinted.size > 0 ? ` (${selectedPrinted.size})` : ''}`}
            </button>
          </div>
          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm w-full" style={{minWidth:'750px'}}>
              <thead className="bg-teal-800 text-teal-100 text-xs sticky top-0 z-10">
                <tr>
                  <th className="p-3 w-8"><input type="checkbox"
                    checked={packReadyOrders.length > 0 && packReadyOrders.every(o => selectedPrinted.has(o.id))}
                    onChange={e => setSelectedPrinted(e.target.checked ? new Set(packReadyOrders.map(o => o.id)) : new Set())}
                    className="rounded"/></th>
                  <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                  <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
                  <th className="p-3 text-left whitespace-nowrap">ลูกค้า</th>
                  <th className="p-3 text-left whitespace-nowrap">เบอร์โทร</th>
                  <th className="p-3 text-left">สินค้า</th>
                  <th className="p-3 text-left whitespace-nowrap">Tracking</th>
                  <th className="p-3 text-center whitespace-nowrap">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {packReadyOrders.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-slate-400">ยังไม่มีออเดอร์รอแพ็ค</td></tr>
                )}
                {packReadyOrders.map(o => (
                  <tr key={o.id} className={`border-b hover:bg-teal-50 ${selectedPrinted.has(o.id) ? 'bg-indigo-50' : ''}`}>
                    <td className="p-3"><input type="checkbox" checked={selectedPrinted.has(o.id)}
                      onChange={() => setSelectedPrinted(s => { const n = new Set(s); n.has(o.id) ? n.delete(o.id) : n.add(o.id); return n; })}
                      className="rounded"/></td>
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{o.order_date || '-'}</td>
                    <td className="p-3 font-mono text-xs text-teal-700 whitespace-nowrap">{o.order_no}</td>
                    <td className="p-3 font-medium whitespace-nowrap">{o.customers?.name || '-'}</td>
                    <td className="p-3 font-mono text-xs whitespace-nowrap">{o.customers?.tel || '-'}</td>
                    <td className="p-3 text-xs text-slate-500 max-w-[160px] truncate">{o.raw_prod || '-'}</td>
                    <td className="p-3 font-mono text-xs text-blue-600 whitespace-nowrap">{(o as any).tracking_no || <span className="text-slate-300 text-xs">รอ Tracking</span>}</td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded-full text-xs font-bold">รอแพ็ค</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'exported' && (
        <>
          <div className="shrink-0 flex gap-2 mb-3 items-center flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input type="text" value={searchExported} onChange={e => setSearchExported(e.target.value)}
                placeholder="ค้นหาชื่อลูกค้า / สินค้า..."
                className="w-full pl-8 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-300"/>
            </div>
            {/* Filter ยอด (฿) */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-slate-500 whitespace-nowrap">ยอด ฿</span>
              <input type="number" min={0} value={minAmountExp} onChange={e => setMinAmountExp(e.target.value)}
                placeholder="ต่ำสุด"
                className="border rounded-lg px-2 py-2 text-xs w-24 focus:outline-none focus:ring-2 focus:ring-green-300"/>
              <span className="text-slate-400 text-xs">—</span>
              <input type="number" min={0} value={maxAmountExp} onChange={e => setMaxAmountExp(e.target.value)}
                placeholder="สูงสุด"
                className="border rounded-lg px-2 py-2 text-xs w-24 focus:outline-none focus:ring-2 focus:ring-green-300"/>
              {(minAmountExp || maxAmountExp) && (
                <button onClick={() => { setMinAmountExp(''); setMaxAmountExp(''); }}
                  className="text-slate-400 hover:text-red-500 text-xs px-1">✕</button>
              )}
            </div>
            {(searchExported || minAmountExp || maxAmountExp) && <span className="text-xs text-slate-500 shrink-0">พบ {filteredExportedOrders.length} รายการ</span>}
            <span className="text-xs bg-green-50 border border-green-100 text-green-700 rounded-lg px-3 py-2">
              ✅ ส่งสำเร็จ {exportedOrders.length} รายการ
            </span>
          </div>
          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm w-full" style={{minWidth:'800px'}}>
              <thead className="bg-green-800 text-green-100 text-xs sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                  <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
                  <th className="p-3 text-left whitespace-nowrap">ลูกค้า</th>
                  <th className="p-3 text-left whitespace-nowrap">เบอร์โทร</th>
                  <th className="p-3 text-left">สินค้า</th>
                  <th className="p-3 text-left whitespace-nowrap">Tracking</th>
                  <th className="p-3 text-right whitespace-nowrap">ยอด (฿)</th>
                  <th className="p-3 text-center whitespace-nowrap">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {filteredExportedOrders.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-slate-400">
                    {searchExported ? `ไม่พบ "${searchExported}"` : 'ยังไม่มีออเดอร์ส่งสำเร็จ'}
                  </td></tr>
                )}
                {filteredExportedOrders.map(o => (
                  <tr key={o.id} className="border-b hover:bg-green-50">
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                      {o.order_date ? o.order_date.split('-').reverse().join('-') : '-'}
                    </td>
                    <td className="p-3 font-mono text-xs text-green-700 whitespace-nowrap">{o.order_no}</td>
                    <td className="p-3 font-medium whitespace-nowrap">{o.customers?.name || '-'}</td>
                    <td className="p-3 font-mono text-xs whitespace-nowrap">{o.customers?.tel || '-'}</td>
                    <td className="p-3 text-xs text-slate-500 max-w-[180px] truncate">{o.raw_prod || '-'}</td>
                    <td className="p-3 font-mono text-xs whitespace-nowrap">
                      {(o as any).tracking_no
                        ? <span className="text-blue-600 font-bold">{(o as any).tracking_no}</span>
                        : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="p-3 text-right font-bold">฿{Number(o.total_thb).toLocaleString()}</td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">
                        {o.order_status || 'ส่งแล้ว'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Modal แก้ไขสินค้า ── */}

      {/* ── Tab: กำลังแพ็ค ── */}
      {tab === 'printed' && (
        <>
          {/* Tracking Upload */}
          <div className="shrink-0 bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-slate-700">อัพโหลดไฟล์ Tracking จาก Flash</h3>
                <p className="text-xs text-slate-400 mt-0.5">จับคู่ชื่อ + เบอร์ → ใส่ Tracking อัตโนมัติ</p>
              </div>
              <label className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer flex items-center gap-2 ${uploading ? 'bg-slate-200 text-slate-400' : 'bg-green-500 text-white hover:bg-green-600'}`}>
                <Download size={14}/> {uploading ? 'กำลังประมวลผล...' : 'อัพโหลดไฟล์ Flash (.xlsx)'}
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFlashUpload} disabled={uploading}/>
              </label>
            </div>
            {uploadResult && (
              <div className={`mt-3 p-3 rounded-lg text-sm flex items-center gap-3 flex-wrap
                ${uploadResult.conflicts > 0 ? 'bg-orange-50 text-orange-700' : uploadResult.matched > 0 ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                <span>✓ จับคู่สำเร็จ <strong>{uploadResult.matched}</strong> ออเดอร์</span>
                {uploadResult.notFound > 0 && <span className="text-slate-500">· ไม่พบ {uploadResult.notFound} รายการ</span>}
                {uploadResult.duplicate && uploadResult.duplicate > 0 && <span className="text-amber-600">· Tracking ซ้ำ {uploadResult.duplicate} รายการ (ข้าม)</span>}
                {uploadResult.conflicts > 0 && (
                  <span className="flex items-center gap-2">
                    · ⚠ ชื่อ+เบอร์ซ้ำ <strong>{uploadResult.conflicts}</strong> รายการ
                    <button onClick={() => setShowConflict(true)} className="px-2.5 py-1 bg-orange-500 text-white text-xs rounded-lg hover:bg-orange-600 font-bold">เลือก Tracking</button>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Toolbar */}
          <div className="shrink-0 flex gap-2 mb-3 flex-wrap items-center">
            <span className="px-3 py-2 bg-orange-50 border border-orange-100 rounded-lg text-xs text-orange-700">
              📦 กำลังแพ็ค {printedOrders.length} รายการ · ออเดอร์ที่มี Tracking กดยืนยันส่งได้เลย
            </span>
            {printedOrders.some(o => (o as any).tracking_no) && (
              <button
                onClick={async () => {
                  const withTracking = printedOrders.filter(o => (o as any).tracking_no);
                  if (!confirm(`ยืนยันส่งแล้ว ${withTracking.length} ออเดอร์ที่มี Tracking?\nจะย้ายไปแท็บ ส่งสำเร็จ`)) return;
                  // แบ่ง chunk 200 ป้องกัน URL เกิน limit
                  const ids = withTracking.map(o => o.id).filter(Boolean);
                  const CHUNK = 200;
                  for (let i = 0; i < ids.length; i += CHUNK) {
                    await supabase.from('orders')
                      .update({ order_status: 'ส่งสินค้าแล้ว', parcel_status: 'อยู่ระหว่างจัดส่ง' })
                      .in('id', ids.slice(i, i + CHUNK));
                  }
                  await Promise.all([loadPrintedOrders(), loadExportedOrders()]);
                }}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm font-medium flex items-center gap-2">
                ✓ ยืนยันส่งแล้ว ({printedOrders.filter(o => (o as any).tracking_no).length} ออเดอร์มี Tracking)
              </button>
            )}
          </div>
          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm w-full" style={{minWidth:'750px'}}>
              <thead className="bg-orange-700 text-orange-100 text-xs sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                  <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
                  <th className="p-3 text-left whitespace-nowrap">ลูกค้า</th>
                  <th className="p-3 text-left whitespace-nowrap">เบอร์โทร</th>
                  <th className="p-3 text-left">สินค้า</th>
                  <th className="p-3 text-left whitespace-nowrap">Tracking</th>
                  <th className="p-3 text-center whitespace-nowrap">สถานะ</th>
                  <th className="p-3 text-center whitespace-nowrap">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {printedOrders.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-slate-400">
                    ยังไม่มีออเดอร์กำลังแพ็ค — สร้างใบเบิกจากหน้าแพ็คสินค้าก่อน
                  </td></tr>
                )}
                {printedOrders.map(o => {
                  const hasTracking = !!(o as any).tracking_no;
                  return (
                    <tr key={o.id} className={`border-b ${hasTracking ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-orange-50'}`}>
                      <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{o.order_date || '-'}</td>
                      <td className="p-3 font-mono text-xs text-orange-700 whitespace-nowrap">{o.order_no}</td>
                      <td className="p-3 font-medium whitespace-nowrap">{o.customers?.name || '-'}</td>
                      <td className="p-3 font-mono text-xs whitespace-nowrap">{o.customers?.tel || '-'}</td>
                      <td className="p-3 text-xs text-slate-500 max-w-[160px] truncate">{o.raw_prod || '-'}</td>
                      <td className="p-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <input
                            defaultValue={(o as any).tracking_no || ''}
                            placeholder="กรอก Tracking..."
                            className={`border rounded px-2 py-1 text-xs font-mono w-40 focus:outline-none focus:ring-1 ${hasTracking ? 'border-blue-300 focus:ring-blue-300 text-blue-700' : 'border-slate-200 focus:ring-orange-300'}`}
                            onBlur={async (e) => {
                              const val = e.target.value.trim();
                              if (!val || val === ((o as any).tracking_no || '')) return;
                              await supabase.from('orders')
                                .update({ tracking_no: val })
                                .eq('id', o.id);
                              await Promise.all([loadPrintedOrders(), loadExportedOrders()]);
                            }}
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter') {
                                const val = (e.target as HTMLInputElement).value.trim();
                                if (!val) return;
                                await supabase.from('orders')
                                  .update({ tracking_no: val })
                                  .eq('id', o.id);
                                await Promise.all([loadPrintedOrders(), loadExportedOrders()]);
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                          />
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${hasTracking ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          {hasTracking ? 'พร้อมส่ง' : 'กำลังแพ็ค'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {hasTracking && (
                            <button
                              onClick={async () => {
                                await supabase.from('orders')
                                  .update({ order_status: 'ส่งสินค้าแล้ว', parcel_status: 'อยู่ระหว่างจัดส่ง' }).eq('id', o.id);
                                await Promise.all([loadPrintedOrders(), loadExportedOrders()]);
                              }}
                              className="px-3 py-1 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 font-bold whitespace-nowrap">
                              ✓ ส่งแล้ว
                            </button>
                          )}
                          <button
                            onClick={() => { setReturnOrder(o); setReturnType(''); setReturnNote(''); }}
                            className="px-2.5 py-1 bg-amber-100 text-amber-700 text-xs rounded-lg hover:bg-amber-200 font-medium whitespace-nowrap">
                            ↩ คืนสต็อก
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {editingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">แก้ไขสินค้าในออเดอร์</h3>
                <p className="text-sm text-slate-500 font-mono">{editingOrder.order_no}</p>
              </div>
              <button onClick={() => setEditingOrder(null)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>

            <div className="space-y-3 mb-5">
              {(orderSelections[editingOrder.id] || makeItems(editingOrder)).map((item, idx) => (
                <div key={idx} className={`flex items-center gap-3 p-3 rounded-lg border transition ${item.selected ? 'border-cyan-200 bg-cyan-50' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
                  {/* checkbox */}
                  <input type="checkbox" checked={item.selected}
                    onChange={e => {
                      const cur = orderSelections[editingOrder.id] || makeItems(editingOrder);
                      const next = cur.map((it, i) => i === idx ? { ...it, selected: e.target.checked } : it);
                      setOrderSelections(s => ({ ...s, [editingOrder.id]: next }));
                    }}
                    className="w-4 h-4 rounded accent-cyan-500"/>
                  {/* ชื่อสินค้า */}
                  <span className="flex-1 text-sm text-slate-700 min-w-0 truncate">{item.rawProd}</span>
                  {/* จำนวน */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => {
                        const cur = orderSelections[editingOrder.id] || makeItems(editingOrder);
                        const next = cur.map((it, i) => i === idx ? { ...it, qty: Math.max(1, it.qty - 1) } : it);
                        setOrderSelections(s => ({ ...s, [editingOrder.id]: next }));
                      }}
                      className="w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center font-bold text-sm">−</button>
                    <span className="w-6 text-center text-sm font-bold text-slate-800">{item.qty}</span>
                    <button
                      onClick={() => {
                        const cur = orderSelections[editingOrder.id] || makeItems(editingOrder);
                        const next = cur.map((it, i) => i === idx ? { ...it, qty: it.qty + 1 } : it);
                        setOrderSelections(s => ({ ...s, [editingOrder.id]: next }));
                      }}
                      className="w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center font-bold text-sm">+</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-3 border-t">
              <button onClick={() => {
                // reset กลับค่าเดิม
                setOrderSelections(s => ({ ...s, [editingOrder.id]: makeItems(editingOrder) }));
              }} className="text-sm text-slate-400 hover:text-slate-600">รีเซ็ต</button>
              <div className="flex gap-2">
                <button onClick={() => setEditingOrder(null)} className="px-4 py-2 bg-slate-200 rounded-lg text-sm hover:bg-slate-300">ยกเลิก</button>
                <button onClick={() => setEditingOrder(null)} className="px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm hover:bg-cyan-600">บันทึก</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h3 className="text-lg font-bold text-slate-800">ตัวอย่างข้อมูลที่จะส่งออก</h3>
                <p className="text-sm text-slate-500">{previewRows.length} รายการ</p>
              </div>
              <button onClick={() => setShowPreview(false)} className="text-slate-400 hover:text-slate-600"><X size={22}/></button>
            </div>
            <div className="overflow-auto flex-1 p-2">
              <table className="w-full text-xs border-collapse" style={{minWidth:'900px'}}>
                <thead className="sticky top-0 bg-slate-800 text-white">
                  <tr>
                    <th className="px-2 py-2 text-left whitespace-nowrap">A: เลขออเดอร์+สินค้า</th>
                    <th className="px-2 py-2 text-left whitespace-nowrap">B: ชื่อผู้รับ</th>
                    <th className="px-2 py-2 text-left whitespace-nowrap">C: ที่อยู่</th>
                    <th className="px-2 py-2 text-left whitespace-nowrap">D: ไปรษณีย์</th>
                    <th className="px-2 py-2 text-left whitespace-nowrap">E: เบอร์โทร</th>
                    <th className="px-2 py-2 text-right whitespace-nowrap">G: COD</th>
                    <th className="px-2 py-2 text-left whitespace-nowrap">H: Item Desc</th>
                    <th className="px-2 py-2 text-left whitespace-nowrap">M: ประเภท</th>
                    <th className="px-2 py-2 text-right whitespace-nowrap">N: น้ำหนัก</th>
                    <th className="px-2 py-2 text-center whitespace-nowrap">O-Q: กล่อง</th>
                    <th className="px-2 py-2 text-left whitespace-nowrap">U: Product Type</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className={`border-b ${i%2===0?'bg-white':'bg-slate-50'} hover:bg-yellow-50`}>
                      <td className="px-2 py-1.5 font-mono text-blue-700 whitespace-nowrap max-w-[200px] truncate">{row.order_no}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{row.name}</td>
                      <td className="px-2 py-1.5 max-w-[160px] truncate text-slate-500">{row.address}</td>
                      <td className="px-2 py-1.5 font-mono text-center">{row.postal_code}</td>
                      <td className="px-2 py-1.5 font-mono">{row.phone}</td>
                      <td className="px-2 py-1.5 text-right font-bold text-orange-600">{row.cod!==''?`฿${Number(row.cod).toLocaleString()}`:<span className="text-slate-300">โอน</span>}</td>
                      <td className="px-2 py-1.5 font-mono text-cyan-700 max-w-[200px] truncate">{row.item_desc}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{row.item_type}</td>
                      <td className="px-2 py-1.5 text-right font-bold">{row.weight_kg} kg</td>
                      <td className="px-2 py-1.5 text-center text-slate-500">{row.box_lwh}</td>
                      <td className="px-2 py-1.5 text-green-700 font-medium whitespace-nowrap">{row.product_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t flex justify-between items-center">
              <p className="text-sm text-slate-500">ตรวจสอบแล้วกดส่งออกได้เลย</p>
              <div className="flex gap-3">
                <button onClick={() => setShowPreview(false)} className="px-4 py-2 bg-slate-200 rounded-lg text-sm hover:bg-slate-300">ปิด</button>
                <button onClick={() => { setShowPreview(false); handleExport(); }} disabled={exporting}
                  className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 flex items-center gap-2 text-sm">
                  <Download size={16}/> ส่งออก Flash
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Conflict Resolution Modal ─────────────────────────────────────── */}
      {showConflict && conflicts.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b shrink-0">
              <h3 className="text-lg font-bold text-slate-800">⚠ พบออเดอร์ที่ชื่อ + เบอร์ซ้ำกัน — เลือก Tracking เอง</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                {conflicts.length} รายการ · กรุณาเลือกว่า Tracking ไหน ตรงกับออเดอร์ไหน
              </p>
            </div>
            <div className="overflow-auto flex-1 p-4 space-y-4">
              {conflicts.map((c, ci) => (
                <div key={ci} className="border rounded-xl p-4 bg-orange-50 border-orange-200">
                  {/* Tracking info */}
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <span className="font-mono font-bold text-orange-700 text-sm">{c.tracking}</span>
                    <span className="text-xs text-slate-500">ผู้รับ: <strong>{c.name}</strong> {c.tel}</span>
                    <span className="text-xs text-slate-400">COD ฿{c.cod}</span>
                    <span className="text-xs text-slate-400">ขนาด {c.size}</span>
                    <span className="text-xs text-slate-400">เวลา {c.time}</span>
                  </div>
                  <p className="text-xs text-slate-600 mb-2 font-medium">เลือกออเดอร์ที่ตรงกับ Tracking นี้:</p>
                  <div className="grid grid-cols-1 gap-2">
                    {c.candidates.map(order => {
                      // เช็คว่าออเดอร์นี้ถูกเลือกให้ conflict อื่นแล้วหรือไม่
                      const takenBy = conflicts.findIndex((x, xi) => xi !== ci && x.chosen === order.id);
                      const isTaken = takenBy >= 0;
                      const isChosen = c.chosen === order.id;
                      return (
                        <button key={order.id}
                          disabled={isTaken}
                          onClick={() => setConflicts(prev => prev.map((x, xi) =>
                            xi === ci ? { ...x, chosen: isChosen ? null : order.id } : x
                          ))}
                          className={`w-full text-left px-4 py-3 rounded-lg border-2 transition text-sm
                            ${isTaken ? 'border-slate-200 bg-slate-100 opacity-40 cursor-not-allowed' :
                              isChosen ? 'border-green-500 bg-green-50' :
                              'border-slate-200 bg-white hover:border-orange-400 cursor-pointer'}`}>
                          <div className="flex items-center gap-3 flex-wrap">
                            {isChosen && <span className="text-green-600 font-bold">✓</span>}
                            <span className="font-medium text-slate-700">{order.raw_prod || '-'}</span>
                            <span className="text-slate-400 text-xs">วันที่ {order.order_date || '-'}</span>
                            <span className="text-slate-600 text-xs font-bold ml-auto">฿{Number(order.total_thb).toLocaleString()}</span>
                            {isTaken && <span className="text-[10px] text-slate-400">(เลือกใน #{takenBy + 1} แล้ว)</span>}
                          </div>
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setConflicts(prev => prev.map((x, xi) =>
                        xi === ci ? { ...x, chosen: 'skip' } : x
                      ))}
                      className={`w-full text-left px-4 py-2 rounded-lg border-2 transition text-xs
                        ${c.chosen === 'skip' ? 'border-slate-500 bg-slate-100 text-slate-700 font-bold' : 'border-dashed border-slate-300 text-slate-400 hover:border-slate-400'}`}>
                      ข้ามรายการนี้ (ไม่ assign tracking)
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t flex justify-between items-center shrink-0">
              <p className="text-xs text-slate-400">
                เลือกแล้ว {conflicts.filter(c => c.chosen && c.chosen !== 'skip').length} / {conflicts.length} รายการ
              </p>
              <div className="flex gap-2">
                <button onClick={() => { setShowConflict(false); }}
                  className="px-4 py-2 bg-slate-200 rounded-lg text-sm hover:bg-slate-300">ปิด</button>
                <button
                  onClick={handleConflictSave}
                  disabled={conflicts.some(c => !c.chosen)}
                  className="px-5 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm font-bold disabled:opacity-50">
                  บันทึก Tracking ที่เลือก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: คืนสต็อก ── */}
      {returnOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-base font-bold text-slate-800">↩ คืนสต็อก</h2>
                <p className="text-xs text-slate-400 mt-0.5">{returnOrder.customers?.name || returnOrder.order_no}</p>
              </div>
              <button onClick={() => setReturnOrder(null)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400">✕</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* สินค้า */}
              <div className="bg-slate-50 rounded-xl p-3 text-sm">
                <div className="text-xs text-slate-400 mb-1">รายการสินค้า</div>
                <div className="font-medium text-slate-800">{(returnOrder as any).raw_prod || '-'}</div>
              </div>

              {/* เลือกประเภทการคืน */}
              <div>
                <div className="text-xs font-semibold text-slate-500 mb-2">ประเภทการคืน *</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setReturnType('no_send')}
                    className={`p-3 rounded-xl border-2 text-left transition ${returnType === 'no_send' ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="text-sm font-bold text-amber-700">📦 ไม่ได้ส่ง</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">คืนสต็อก + ย้ายกลับ "รอแพ็ค"</div>
                  </button>
                  <button
                    onClick={() => setReturnType('returned')}
                    className={`p-3 rounded-xl border-2 text-left transition ${returnType === 'returned' ? 'border-red-400 bg-red-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="text-sm font-bold text-red-700">🔄 สินค้าตีกลับ</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">คืนสต็อก + เปลี่ยนสถานะ "ตีกลับ"</div>
                  </button>
                </div>
              </div>

              {/* หมายเหตุ */}
              <div>
                <div className="text-xs font-semibold text-slate-500 mb-1">หมายเหตุ (เพิ่มเติม)</div>
                <input value={returnNote} onChange={e => setReturnNote(e.target.value)}
                  placeholder="เช่น สินค้าหมด, ลูกค้ายกเลิก..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"/>
              </div>

              {/* แสดง flow */}
              {returnType && (
                <div className={`rounded-xl p-3 text-xs ${returnType === 'no_send' ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  {returnType === 'no_send'
                    ? '✓ คืนสต็อกยาสีฟัน SP4 → สถานะออเดอร์กลับเป็น "รอแพ็ค" → จะปรากฏใน Flash Export "รอส่งออก" อีกครั้ง'
                    : '✓ คืนสต็อกยาสีฟัน SP4 → สถานะออเดอร์เป็น "ตีกลับ" → ไม่ปรากฏในรายการส่งออก'}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t flex gap-2 justify-end">
              <button onClick={() => setReturnOrder(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-medium">
                ยกเลิก
              </button>
              <button onClick={handleReturnOrder} disabled={!returnType || returnSaving}
                className={`px-5 py-2 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2
                  ${returnType === 'returned' ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'}`}>
                {returnSaving ? 'กำลังบันทึก...' : '↩ ยืนยันคืนสต็อก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
