import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
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

function extractQty(promoName: string): number {
  const t = promoName.match(/(\d+)\s*แถม\s*(\d+)/);
  if (t) return parseInt(t[1]) + parseInt(t[2]);
  const u = promoName.match(/\(?\s*(\d+)\s*(?:กระป๋อง|ชิ้น|แพ็ค|ซอง|กล่อง|ขวด|ถุง|อัน)/i);
  if (u) return parseInt(u[1]);
  const f = promoName.match(/(\d+)/);
  return f ? parseInt(f[1]) : 1;
}

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
  const [tab, setTab]                     = useState<'pending' | 'exported' | 'printed'>('pending');
  const [selectedPending,  setSelectedPending]  = useState<Set<string>>(new Set());
  const [selectedExported, setSelectedExported] = useState<Set<string>>(new Set());
  const [orderSelections, setOrderSelections] = useState<OrderSelections>({});
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [searchProduct, setSearchProduct]   = useState('');
  const [searchExported, setSearchExported] = useState('');
  // upload tracking file
  const [uploadResult, setUploadResult] = useState<{ matched: number; notFound: number } | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { loadOrders(); loadExportedOrders(); loadPrintedOrders(); }, []);

  const loadPrintedOrders = async () => {
    const { data } = await supabase.from('orders').select('*, customers(*)')
      .eq('route', 'B').eq('order_status', 'รอแพ็ค').order('updated_at', { ascending: false });
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

  const loadExportedOrders = async () => {
    const { data } = await supabase.from('orders').select('*, customers(*)')
      .eq('route', 'B').eq('order_status', 'กำลังคีย์').order('updated_at', { ascending: false });
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
      const isCOD     = order.payment_status !== 'ชำระแล้ว';
      const codAmount = isCOD ? Math.floor(order.total_thb) : '';
      const address = [
        order.customers?.address,
        order.customers?.subdistrict ? `ต.${order.customers.subdistrict}` : null,
        order.customers?.district    ? `อ.${order.customers.district}` : null,
        order.customers?.province    ? `จ.${order.customers.province}` : null,
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
        const qty = qtyFromSel; // ใช้จำนวนที่ผู้ใช้กำหนด
        itemDescs.push(`${shortName}|-|-|${qty}`);
        if (p?.products_master?.weight_g) totalWeightKg += (Number(p.products_master.weight_g) * qty) / 1000;
        if (i === 0) { boxL = Number(p?.boxes?.length_cm)||1; boxW = Number(p?.boxes?.width_cm)||1; boxH = Number(p?.boxes?.height_cm)||1; flashItemType = p?.item_type||'พัสดุ'; }
      }
      if (totalWeightKg === 0) totalWeightKg = Math.max(Number(order.weight_kg ?? 0), 0.1);
      const weightKgStr = Math.max(totalWeightKg, 0.1).toFixed(2);
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
      await supabase.from('orders').update({ order_status: 'กำลังคีย์' }).in('id', ids);
      setOrders([]); setSelectedPending(new Set());
      await Promise.all([loadOrders(), loadExportedOrders()]);
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
    await supabase.from('orders').update({ order_status: 'รอคีย์ออเดอร์' }).in('id', ids);
    setSelectedExported(new Set());
    await Promise.all([loadOrders(), loadExportedOrders()]);
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

      let matched = 0; let notFound = 0;

      // โหลดออเดอร์ทั้งหมดที่ route=B, status=กำลังคีย์ พร้อม customers ครั้งเดียว
      const { data: allOrders } = await supabase
        .from('orders')
        .select('id, order_date, customers(name, tel)')
        .eq('route', 'B')
        .eq('order_status', 'กำลังคีย์');

      for (let i = 1; i < rows.length; i++) {
        const row      = rows[i];
        const rawDate  = row[0];
        const tracking = String(row[1] || '').trim();
        const name     = String(row[10] || '').trim();
        const tel      = String(row[11] || '').replace(/\D/g, ''); // เบอร์เฉพาะตัวเลข

        if (!tracking || (!name && !tel)) continue;

        // parse วันที่
        let dateStr = '';
        if (rawDate instanceof Date) {
          dateStr = rawDate.toISOString().split('T')[0];
        } else {
          const m = String(rawDate).match(/(\d{4}-\d{2}-\d{2})/);
          if (m) dateStr = m[1];
        }
        if (!dateStr) continue;

        // จับคู่จาก orders ที่โหลดไว้แล้ว
        const match = (allOrders || []).find((o: any) => {
          const orderDate = String(o.order_date || '').split('T')[0];
          const cTel = String((o.customers as any)?.tel || '').replace(/\D/g, '');
          const cName = String((o.customers as any)?.name || '').trim();
          // ต้องตรงวันที่ + (เบอร์ หรือ ชื่อ)
          return orderDate === dateStr && (cTel === tel || cName === name);
        });

        if (match) {
          await supabase.from('orders')
            .update({ tracking_no: tracking, order_status: 'รอแพ็ค' })
            .eq('id', match.id);
          matched++;
        } else {
          notFound++;
        }
      }

      setUploadResult({ matched, notFound });
      await Promise.all([loadOrders(), loadPrintedOrders()]);
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการอ่านไฟล์');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const togglePending  = (id: string) => setSelectedPending(s  => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleExported = (id: string) => setSelectedExported(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const filteredOrders = searchProduct.trim()
    ? orders.filter(o => (o.raw_prod || '').toLowerCase().includes(searchProduct.toLowerCase()))
    : orders;

  const filteredExportedOrders = searchExported.trim()
    ? exportedOrders.filter(o => (o.raw_prod || '').toLowerCase().includes(searchExported.toLowerCase()))
    : exportedOrders;

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
        <button onClick={() => setTab('exported')} className={`px-5 py-2 rounded-lg text-sm font-medium transition ${tab==='exported'?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
          ปริ้นแล้ว <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab==='exported'?'bg-indigo-100 text-indigo-700':'bg-slate-200 text-slate-500'}`}>{exportedOrders.length}</span>
        </button>
        <button onClick={() => setTab('printed')} className={`px-5 py-2 rounded-lg text-sm font-medium transition ${tab==='printed'?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
          ส่งออกแล้ว <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab==='printed'?'bg-green-100 text-green-700':'bg-slate-200 text-slate-500'}`}>{printedOrders.length}</span>
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
            {searchProduct && (
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
                  <th className="p-3 text-right whitespace-nowrap">ยอด (฿)</th>
                  <th className="p-3 text-left">ที่อยู่</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length===0 && <tr><td colSpan={8} className="p-8 text-center text-slate-400">{searchProduct ? `ไม่พบสินค้า "${searchProduct}"` : 'ไม่มีออเดอร์รอส่งออก'}</td></tr>}
                {filteredOrders.map(o => (
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
                    <td className="p-3 text-right font-bold">฿{Number(o.total_thb).toLocaleString()}</td>
                    <td className="p-3 text-xs text-slate-400 max-w-[200px] truncate">{[o.customers?.address,o.customers?.district,o.customers?.province].filter(Boolean).join(' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Tab: ส่งออกแล้ว ── */}
      {tab === 'exported' && (
        <>
          <div className="flex gap-3 mb-3 shrink-0 flex-wrap items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input type="text" value={searchExported} onChange={e => setSearchExported(e.target.value)}
                placeholder="ค้นหาชื่อสินค้า เช่น ครีม Secret Rose(1 แถม 1)..."
                className="w-full pl-8 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-300"/>
            </div>
            {searchExported && <span className="text-xs text-slate-500 shrink-0">พบ {filteredExportedOrders.length} รายการ</span>}
            <button onClick={handleReExport} disabled={exportedOrders.length===0||reExporting}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 flex items-center gap-2 disabled:opacity-50 text-sm">
              <Download size={16}/> {reExporting?'กำลังส่งออก...':`ส่งออกซ้ำ (${exportedCount} รายการ)`}
            </button>
            {selectedExported.size > 0 && (
              <button onClick={() => handleDeleteExported([...selectedExported])}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-2 text-sm">
                <Trash2 size={16}/> ลบที่เลือก ({selectedExported.size})
              </button>
            )}
            <button onClick={() => handleDeleteExported(exportedOrders.map(o=>o.id))}
              disabled={exportedOrders.length===0}
              className="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 flex items-center gap-2 text-sm disabled:opacity-50">
              <Trash2 size={16}/> ลบทั้งหมด
            </button>
            {selectedExported.size>0 && <span className="self-center text-xs text-slate-500">เลือก {selectedExported.size} จาก {exportedOrders.length}</span>}
          </div>

          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm" style={{minWidth:'700px', width:'100%'}}>
              <thead className="bg-green-800 text-green-100 text-xs sticky top-0">
                <tr>
                  <th className="p-3 w-8">
                    <input type="checkbox" checked={allExportedSelected}
                      onChange={e => setSelectedExported(e.target.checked ? new Set(filteredExportedOrders.map(o=>o.id)) : new Set())}
                      className="rounded"/>
                  </th>
                  <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                  <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
                  <th className="p-3 text-left">ลูกค้า</th>
                  <th className="p-3 text-left">สินค้า</th>
                  <th className="p-3 text-center w-10">แก้</th>
                  <th className="p-3 text-right whitespace-nowrap">ยอด (฿)</th>
                  <th className="p-3 text-left">ที่อยู่</th>
                </tr>
              </thead>
              <tbody>
                {filteredExportedOrders.length===0 && <tr><td colSpan={8} className="p-8 text-center text-slate-400">{searchExported ? `ไม่พบสินค้า "${searchExported}"` : 'ยังไม่มีออเดอร์ที่ส่งออก'}</td></tr>}
                {filteredExportedOrders.map(o => (
                  <tr key={o.id} className={`border-b hover:bg-green-50 ${selectedExported.has(o.id)?'bg-green-50':''}`}>
                    <td className="p-3 text-center">
                      <input type="checkbox" checked={selectedExported.has(o.id)} onChange={()=>toggleExported(o.id)} className="rounded"/>
                    </td>
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                      {o.order_date ? o.order_date.split('-').reverse().join('-') : '-'}
                      {(o as any).order_time && <div className="text-slate-400">{(o as any).order_time}</div>}
                    </td>
                    <td className="p-3 font-mono text-xs text-green-700 whitespace-nowrap">{o.order_no}</td>
                    <td className="p-3 whitespace-nowrap">{o.customers?.name||'-'}</td>
                    <td className="p-3 text-xs text-slate-500 max-w-[160px]">
                      <div className="space-y-0.5">
                        {(orderSelections[o.id] || makeItems(o)).map((item, idx) => (
                          <div key={idx} className={`flex items-center gap-1 ${!item.selected?'opacity-30 line-through':''}`}>
                            <span className="truncate text-slate-700">{item.rawProd}</span>
                            <span className="shrink-0 text-xs text-slate-400">×{item.qty}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <button onClick={() => setEditingOrder(o)} className="p-1 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded" title="แก้ไขสินค้า">
                        <Edit2 size={14}/>
                      </button>
                    </td>
                    <td className="p-3 text-right font-bold">฿{Number(o.total_thb).toLocaleString()}</td>
                    <td className="p-3 text-xs text-slate-400 max-w-[200px] truncate">{[o.customers?.address,o.customers?.district,o.customers?.province].filter(Boolean).join(' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Modal แก้ไขสินค้า ── */}

      {/* ── Tab: ปริ้นแล้ว (กำลังคีย์) — upload tracking ── */}
      {tab === 'printed' && (
        <>
          <div className="shrink-0 bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-slate-700">อัพโหลดไฟล์ Tracking จาก Flash</h3>
                <p className="text-xs text-slate-400 mt-0.5">จับคู่ วันที่ + ชื่อ + เบอร์ → ใส่ Tracking → เปลี่ยนสถานะเป็น รอแพ็ค</p>
              </div>
              <label className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer flex items-center gap-2 ${uploading ? 'bg-slate-200 text-slate-400' : 'bg-indigo-500 text-white hover:bg-indigo-600'}`}>
                <Download size={14}/> {uploading ? 'กำลังประมวลผล...' : 'อัพโหลดไฟล์ Flash (.xlsx)'}
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFlashUpload} disabled={uploading}/>
              </label>
            </div>
            {uploadResult && (
              <div className={`mt-3 p-3 rounded-lg text-sm flex items-center gap-3 ${uploadResult.matched > 0 ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                <span>✓ จับคู่สำเร็จ <strong>{uploadResult.matched}</strong> ออเดอร์</span>
                {uploadResult.notFound > 0 && <span className="text-orange-600">· ไม่พบ {uploadResult.notFound} รายการ</span>}
              </div>
            )}
          </div>
          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm w-full" style={{minWidth:'700px'}}>
              <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                  <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
                  <th className="p-3 text-left whitespace-nowrap">ลูกค้า</th>
                  <th className="p-3 text-left whitespace-nowrap">เบอร์โทร</th>
                  <th className="p-3 text-left">สินค้า</th>
                  <th className="p-3 text-center whitespace-nowrap">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {printedOrders.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-400">ยังไม่มีออเดอร์ที่ปริ้นแล้ว — Export Flash เพื่อเพิ่มรายการ</td></tr>
                )}
                {printedOrders.map(o => (
                  <tr key={o.id} className="border-b hover:bg-indigo-50">
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{o.order_date || '-'}</td>
                    <td className="p-3 font-mono text-xs text-indigo-700 whitespace-nowrap">{o.order_no}</td>
                    <td className="p-3 font-medium whitespace-nowrap">{o.customers?.name || '-'}</td>
                    <td className="p-3 font-mono text-xs whitespace-nowrap">{o.customers?.tel || '-'}</td>
                    <td className="p-3 text-xs text-slate-500 max-w-[200px] truncate">{o.raw_prod || '-'}</td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">รอแพ็ค</span>
                    </td>
                  </tr>
                ))}
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
    </div>
  );
}
