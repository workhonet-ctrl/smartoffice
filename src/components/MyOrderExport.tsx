import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Order } from '../lib/types';
import { Download, Trash2, X } from 'lucide-react';
import * as XLSX from 'xlsx';

type OrderItem = { rawProd: string; qty: number; selected: boolean };
type OrderSelections = Record<string, OrderItem[]>;
type Tab = 'pending' | 'exported' | 'printed';

const HEADERS = [
  'ชื่อผู้รับ',
  'เบอร์โทร',
  'ที่อยู่',
  'ตำบล',
  'อำเภอ',
  'จังหวัด',
  'รหัสไปรษณีย์',
  'อีเมล',
  'หมายเหตุ',
  'ชื่อสินค้า',
  'ชื่อสินค้า (สำหรับขนส่ง)',
  'สีสินค้า',
  'ความกว้างของสินค้า',
  'ความยาวของสินค้า',
  'ความสูงของสินค้า',
  'น้ำหนัก(กก.)',
  'ประเภทการชำระ',
  'จำนวนเงิน',
  'วันที่โอนเงิน',
  'เวลาที่โอน',
  'ผู้รับเงิน',
  'ช่องทางการจำหน่าย',
];

const SHEET_NAME = 'Template ใหม่_New102024';

function makeItems(order: Order): OrderItem[] {
  const prods = (order.raw_prod || '').split('|').map(s => s.trim()).filter(Boolean);
  const qtys  = String((order as any).quantities || order.quantity || '1').split('|');
  if (prods.length === 0) return [{ rawProd: order.raw_prod || '-', qty: 1, selected: true }];
  return prods.map((p, i) => ({ rawProd: p, qty: Number(qtys[i]?.trim()) || 1, selected: true }));
}

function extractPieces(promoName: string, packQty: number): number {
  const t = promoName.match(/(\d+)\s*แถม\s*(\d+)/);
  if (t) return (parseInt(t[1]) + parseInt(t[2])) * packQty;
  const u = promoName.match(/\(?\s*(\d+)\s*(?:กระป๋อง|ชิ้น|แพ็ค|ซอง|กล่อง|ขวด|ถุง|อัน)/i);
  if (u) return parseInt(u[1]) * packQty;
  return packQty;
}

async function buildRow(order: Order, selections: OrderItem[]): Promise<string[]> {
  const c        = order.customers;
  const selected = selections.filter(it => it.selected);
  const origProds = (order.raw_prod || '').split('|').map(s => s.trim());

  let widthCm  = 1, lengthCm = 1, heightCm = 1, weightKg = 0;
  let color    = 'ไม่มี';
  const masterNames: string[] = [];
  const promoNames:  string[] = [];

  for (let i = 0; i < selected.length; i++) {
    const origIdx = origProds.indexOf(selected[i].rawProd);
    const pid = origIdx >= 0 ? order.promo_ids?.[origIdx] : order.promo_ids?.[i];

    if (pid) {
      const { data: promo } = await supabase
        .from('products_promo')
        .select('name, short_name, color, boxes(width_cm, length_cm, height_cm), products_master(name, weight_g)')
        .eq('id', pid).maybeSingle();

      if (promo) {
        const master = (promo as any).products_master;
        const box    = (promo as any).boxes;
        const pieces = extractPieces(promo.name, selected[i].qty);

        masterNames.push(master?.name || promo.short_name || promo.name);
        promoNames.push(promo.name);

        if (i === 0) {
          color    = promo.color || 'ไม่มี';
          widthCm  = Number(box?.width_cm  || 1);
          lengthCm = Number(box?.length_cm || 1);
          heightCm = Number(box?.height_cm || 1);
        }
        if (master?.weight_g) weightKg += (Number(master.weight_g) * pieces) / 1000;
      } else {
        masterNames.push(selected[i].rawProd);
        promoNames.push(selected[i].rawProd);
      }
    } else {
      masterNames.push(selected[i].rawProd);
      promoNames.push(selected[i].rawProd);
    }
  }

  if (weightKg === 0) weightKg = Math.max(Number((order as any).weight_kg ?? 0), 0.1);
  weightKg = Math.max(weightKg, 0.1);

  const isCOD   = order.payment_method === 'COD' || order.payment_status !== 'ชำระแล้ว';
  const payType = isCOD ? 'COD' : 'BANK';
  const amount  = String(Math.floor(order.total_thb));
  const payDate = isCOD ? '' : ((order as any).payment_date || '');

  // Map channel → ค่าที่ MyOrder รองรับ
  const channelMap: Record<string, string> = {
    'facebook': 'FACEBOOK', 'fb': 'FACEBOOK', 'เฟสบุ๊ก': 'FACEBOOK',
    'line':     'LINE',     'line oa': 'LINE',  'ไลน์': 'LINE',
    'shopee':   'SHOPEE',   'ช้อปปี้': 'SHOPEE',
    'lazada':   'LASADA',   'ลาซาด้า': 'LASADA', 'lasada': 'LASADA',
  };
  const rawChannel = (order.channel || '').toLowerCase().trim();
  const channel = channelMap[rawChannel] || 'FACEBOOK';

  return [
    c?.name        || '',                              // A ชื่อผู้รับ
    (c?.tel        || '').replace(/[^0-9]/g, ''),     // B เบอร์โทร
    c?.address     || '',                              // C ที่อยู่
    c?.subdistrict || '',                              // D ตำบล
    c?.district    || '',                              // E อำเภอ
    c?.province    || '',                              // F จังหวัด
    c?.postal_code || '',                              // G รหัสไปรษณีย์
    '',                                                // H อีเมล
    order.raw_prod || '',                              // I หมายเหตุ
    masterNames.join(' + ') || '-',                    // J ชื่อสินค้า (master.name)
    masterNames.join(' + ') || '-',                    // K ชื่อสินค้า (สำหรับขนส่ง) = master.name
    color,                                             // L สีสินค้า
    String(widthCm),                                   // M ความกว้าง
    String(lengthCm),                                  // N ความยาว
    String(heightCm),                                  // O ความสูง
    weightKg.toFixed(2),                               // P น้ำหนัก(กก.)
    payType,                                           // Q ประเภทการชำระ
    amount,                                            // R จำนวนเงิน
    payDate,                                           // S วันที่โอนเงิน
    '',                                                // T เวลาที่โอน
    '',                                                // U ผู้รับเงิน
    channel,                                           // V ช่องทางการจำหน่าย (FACEBOOK/LINE/SHOPEE/LASADA)
  ];
}

async function exportToExcel(targetOrders: Order[], selectionsMap: OrderSelections, filename: string) {
  const aoa: string[][] = [HEADERS];
  for (const order of targetOrders) {
    const sels = selectionsMap[order.id] || makeItems(order);
    aoa.push(await buildRow(order, sels));
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 20 }, { wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 18 },
    { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 35 }, { wch: 22 },
    { wch: 32 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 12 },
    { wch: 14 }, { wch: 20 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob  = new Blob([wbout], { type: 'application/octet-stream' });
  const url   = URL.createObjectURL(blob);
  const link  = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}

export default function MyOrderExport() {
  const [orders,         setOrders]         = useState<Order[]>([]);
  const [exportedOrders, setExportedOrders] = useState<Order[]>([]);
  const [printedOrders,  setPrintedOrders]  = useState<Order[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [exporting,      setExporting]      = useState(false);
  const [tab,            setTab]            = useState<Tab>('pending');
  const [selectedPending,  setSelectedPending]  = useState<Set<string>>(new Set());
  const [selectedExported, setSelectedExported] = useState<Set<string>>(new Set());
  const [orderSelections,  setOrderSelections]  = useState<OrderSelections>({});
  const [editingOrder,     setEditingOrder]     = useState<Order | null>(null);
  const [searchProduct,    setSearchProduct]    = useState('');
  const [searchExported,   setSearchExported]   = useState('');
  const [uploading,        setUploading]        = useState(false);
  const [uploadResult,     setUploadResult]     = useState<{ matched: number; notFound: number } | null>(null);

  useEffect(() => { loadOrders(); loadExportedOrders(); loadPrintedOrders(); }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('orders').select('*, customers(*)')
        .in('route', ['A', 'C']).eq('order_status', 'รอคีย์ออเดอร์').order('created_at', { ascending: false });
      if (data) {
        setOrders(data);
        const sel: OrderSelections = {};
        data.forEach((o: Order) => { sel[o.id] = makeItems(o); });
        setOrderSelections(sel);
      }
    } finally { setLoading(false); }
  };

  const loadExportedOrders = async () => {
    const { data } = await supabase.from('orders').select('*, customers(*)')
      .in('route', ['A', 'C']).eq('order_status', 'กำลังคีย์').order('updated_at', { ascending: false });
    if (data) {
      setExportedOrders(data);
      const sel: OrderSelections = {};
      data.forEach((o: Order) => { sel[o.id] = makeItems(o); });
      setOrderSelections(s => ({ ...s, ...sel }));
    }
  };

  const loadPrintedOrders = async () => {
    const { data } = await supabase.from('orders').select('*, customers(*)')
      .in('route', ['A', 'C']).eq('order_status', 'รอแพ็ค').order('updated_at', { ascending: false });
    if (data) setPrintedOrders(data);
  };

  const handleExport = async (targetOrders: Order[], updateStatus: boolean) => {
    if (targetOrders.length === 0) return;
    setExporting(true);
    try {
      await exportToExcel(targetOrders, orderSelections, `MyOrder_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
      if (updateStatus) {
        await supabase.from('orders').update({ order_status: 'กำลังคีย์' }).in('id', targetOrders.map(o => o.id));
        await Promise.all([loadOrders(), loadExportedOrders()]);
      }
    } catch (e) { console.error(e); alert('เกิดข้อผิดพลาดในการส่งออก'); }
    finally { setExporting(false); }
  };

  const handleDeleteExported = async (ids: string[]) => {
    if (!confirm(`ยืนยันลบ ${ids.length} รายการ?`)) return;
    await supabase.from('orders').update({ order_status: 'รอคีย์ออเดอร์' }).in('id', ids);
    setSelectedExported(new Set());
    await Promise.all([loadOrders(), loadExportedOrders()]);
  };

  const handleMyOrderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true); setUploadResult(null);
    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: 'array', cellDates: true });
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });

      const { data: allOrders } = await supabase.from('orders')
        .select('id, order_date, route, customers(name, tel)').in('route', ['A', 'C']);

      let matched = 0, notFound = 0;
      for (let i = 1; i < rows.length; i++) {
        const row      = rows[i];
        const rawDate  = row[3];
        const name     = String(row[4] || '').trim();
        const tel      = String(row[6] || '').replace(/\D/g, '');
        const rawTrack = String(row[17] || '').trim();
        if (!rawTrack || (!name && !tel)) continue;

        let dateStr = '';
        if (rawDate instanceof Date) dateStr = rawDate.toISOString().split('T')[0];
        else { const m = String(rawDate).match(/(\d{4}-\d{2}-\d{2})/); if (m) dateStr = m[1]; }
        if (!dateStr) continue;

        const tracking = rawTrack.split('(')[0].trim();

        const match = (allOrders || []).find((o: any) => {
          const oDate = String(o.order_date || '').split('T')[0];
          const cTel  = String((o.customers as any)?.tel  || '').replace(/\D/g, '');
          const cName = String((o.customers as any)?.name || '').trim();
          return oDate === dateStr && (cTel === tel || cName === name);
        });

        if (match) { await supabase.from('orders').update({ tracking_no: tracking, order_status: 'รอแพ็ค' }).eq('id', match.id); matched++; }
        else { notFound++; console.log(`ไม่พบ: วันที่=${dateStr} ชื่อ=${name} เบอร์=${tel}`); }
      }
      setUploadResult({ matched, notFound });
      await Promise.all([loadOrders(), loadExportedOrders(), loadPrintedOrders()]);
    } catch (err) { console.error(err); alert('เกิดข้อผิดพลาดในการอ่านไฟล์'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const togglePending  = (id: string) => setSelectedPending(s  => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleExported = (id: string) => setSelectedExported(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const filteredPending  = searchProduct.trim()  ? orders.filter(o => (o.raw_prod || '').toLowerCase().includes(searchProduct.toLowerCase()))  : orders;
  const filteredExported = searchExported.trim() ? exportedOrders.filter(o => (o.raw_prod || '').toLowerCase().includes(searchExported.toLowerCase())) : exportedOrders;

  const allPendingSelected  = filteredPending.length  > 0 && filteredPending.every(o  => selectedPending.has(o.id));
  const allExportedSelected = filteredExported.length > 0 && filteredExported.every(o => selectedExported.has(o.id));
  const pendingCount  = selectedPending.size  > 0 ? selectedPending.size  : filteredPending.length;
  const exportedCount = selectedExported.size > 0 ? selectedExported.size : filteredExported.length;

  if (loading) return <div className="p-6 text-slate-500">กำลังโหลด...</div>;

  return (
    <div className="flex flex-col h-screen p-6 pb-2">
      <h2 className="text-2xl font-bold text-slate-800 mb-4 shrink-0">MyOrder Export</h2>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-4 shrink-0">
        {([['pending','รอส่งออก',orders.length,'bg-purple-100 text-purple-700'],['exported','ส่งออกแล้ว',exportedOrders.length,'bg-indigo-100 text-indigo-700'],['printed','ปริ้นแล้ว',printedOrders.length,'bg-teal-100 text-teal-700']] as [Tab,string,number,string][]).map(([key,label,count,cls])=>(
          <button key={key} onClick={()=>setTab(key)} className={`px-5 py-2 rounded-lg text-sm font-medium transition ${tab===key?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
            {label} <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab===key?cls:'bg-slate-200 text-slate-500'}`}>{count}</span>
          </button>
        ))}
      </div>

      {tab === 'pending' && (
        <>
          <div className="flex gap-3 mb-2 shrink-0 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input value={searchProduct} onChange={e=>setSearchProduct(e.target.value)} placeholder="ค้นหาชื่อสินค้า..."
                className="w-full pl-8 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
            </div>
            <button onClick={()=>{const t=selectedPending.size>0?filteredPending.filter(o=>selectedPending.has(o.id)):filteredPending;handleExport(t,true);}}
              disabled={orders.length===0||exporting}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 flex items-center gap-2 disabled:opacity-50 text-sm">
              <Download size={16}/> {exporting?'กำลังดึงข้อมูล...':`ส่งออก MyOrder (${pendingCount} รายการ)`}
            </button>
          </div>
          <div className="shrink-0 mb-2 px-3 py-2 bg-purple-50 border border-purple-100 rounded-lg text-xs text-purple-700">
            📋 Sheet: <span className="font-mono font-bold">Template ใหม่_New102024</span> · 22 คอลัมน์ A–V · ดึงขนาดกล่อง + น้ำหนักจาก Promo อัตโนมัติ
          </div>
          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm" style={{minWidth:'800px',width:'100%'}}>
              <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
                <tr>
                  <th className="p-3 w-8"><input type="checkbox" checked={allPendingSelected} onChange={e=>setSelectedPending(e.target.checked?new Set(filteredPending.map(o=>o.id)):new Set())} className="rounded"/></th>
                  <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                  <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
                  <th className="p-3 text-left">ลูกค้า</th>
                  <th className="p-3 text-left">สินค้า</th>
                  <th className="p-3 text-right whitespace-nowrap">ยอด (฿)</th>
                  <th className="p-3 text-left whitespace-nowrap">จังหวัด</th>
                  <th className="p-3 text-center whitespace-nowrap">ชำระ</th>
                  <th className="p-3 text-center whitespace-nowrap">Route</th>
                </tr>
              </thead>
              <tbody>
                {filteredPending.length===0&&<tr><td colSpan={9} className="p-8 text-center text-slate-400">ไม่มีออเดอร์รอส่งออก</td></tr>}
                {filteredPending.map(o=>(
                  <tr key={o.id} className={`border-b hover:bg-purple-50 ${selectedPending.has(o.id)?'bg-purple-50':''}`}>
                    <td className="p-3"><input type="checkbox" checked={selectedPending.has(o.id)} onChange={()=>togglePending(o.id)} className="rounded"/></td>
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{o.order_date||'-'}{(o as any).order_time&&<div className="text-slate-400">{(o as any).order_time}</div>}</td>
                    <td className="p-3 font-mono text-xs text-purple-700 whitespace-nowrap">{o.order_no}</td>
                    <td className="p-3 whitespace-nowrap"><div className="font-medium">{o.customers?.name||'-'}</div><div className="text-xs text-slate-400">{o.customers?.tel||''}</div></td>
                    <td className="p-3 text-xs text-slate-500 max-w-[200px]">
                      {(orderSelections[o.id]||makeItems(o)).filter(it=>it.selected).map((it,i)=><div key={i}>{it.rawProd} ×{it.qty}</div>)}
                    </td>
                    <td className="p-3 text-right font-bold">฿{Number(o.total_thb).toLocaleString()}</td>
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{o.customers?.province||'-'}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${(o.payment_method==='COD'||o.payment_status!=='ชำระแล้ว')?'bg-orange-100 text-orange-700':'bg-green-100 text-green-700'}`}>
                        {(o.payment_method==='COD'||o.payment_status!=='ชำระแล้ว')?'COD':'BANK'}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${o.route==='A'?'bg-green-100 text-green-700':'bg-purple-100 text-purple-700'}`}>{o.route}</span>
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
          <div className="flex gap-3 mb-3 shrink-0 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input value={searchExported} onChange={e=>setSearchExported(e.target.value)} placeholder="ค้นหาชื่อสินค้า..."
                className="w-full pl-8 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"/>
            </div>
            <button onClick={()=>{const t=selectedExported.size>0?filteredExported.filter(o=>selectedExported.has(o.id)):filteredExported;handleExport(t,false);}}
              disabled={exportedOrders.length===0||exporting}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 flex items-center gap-2 disabled:opacity-50 text-sm">
              <Download size={16}/> ส่งออกซ้ำ ({exportedCount} รายการ)
            </button>
            {selectedExported.size>0&&<button onClick={()=>handleDeleteExported([...selectedExported])} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-2 text-sm"><Trash2 size={16}/> ลบที่เลือก ({selectedExported.size})</button>}
            <button onClick={()=>handleDeleteExported(exportedOrders.map(o=>o.id))} disabled={exportedOrders.length===0}
              className="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 flex items-center gap-2 text-sm disabled:opacity-50">
              <Trash2 size={16}/> ลบทั้งหมด
            </button>
          </div>
          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm" style={{minWidth:'700px',width:'100%'}}>
              <thead className="bg-indigo-800 text-indigo-100 text-xs sticky top-0 z-10">
                <tr>
                  <th className="p-3 w-8"><input type="checkbox" checked={allExportedSelected} onChange={e=>setSelectedExported(e.target.checked?new Set(filteredExported.map(o=>o.id)):new Set())} className="rounded"/></th>
                  <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                  <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
                  <th className="p-3 text-left">ลูกค้า</th>
                  <th className="p-3 text-left">สินค้า</th>
                  <th className="p-3 text-right whitespace-nowrap">ยอด (฿)</th>
                </tr>
              </thead>
              <tbody>
                {filteredExported.length===0&&<tr><td colSpan={6} className="p-8 text-center text-slate-400">ยังไม่มีออเดอร์ที่ส่งออกแล้ว</td></tr>}
                {filteredExported.map(o=>(
                  <tr key={o.id} className={`border-b hover:bg-indigo-50 ${selectedExported.has(o.id)?'bg-indigo-50':''}`}>
                    <td className="p-3"><input type="checkbox" checked={selectedExported.has(o.id)} onChange={()=>toggleExported(o.id)} className="rounded"/></td>
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{o.order_date||'-'}</td>
                    <td className="p-3 font-mono text-xs text-indigo-700 whitespace-nowrap">{o.order_no}</td>
                    <td className="p-3 whitespace-nowrap"><div className="font-medium">{o.customers?.name||'-'}</div><div className="text-xs text-slate-400">{o.customers?.tel||''}</div></td>
                    <td className="p-3 text-xs text-slate-500 max-w-[180px] truncate">{o.raw_prod||'-'}</td>
                    <td className="p-3 text-right font-bold">฿{Number(o.total_thb).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'printed' && (
        <>
          <div className="shrink-0 bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-slate-700">อัพโหลดไฟล์ Tracking จาก MyOrder</h3>
                <p className="text-xs text-slate-400 mt-0.5">จับคู่ Col D (วันที่) + Col E (ชื่อ) + Col G (เบอร์) → Col R (Tracking) → เปลี่ยนสถานะเป็น รอแพ็ค</p>
              </div>
              <label className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer flex items-center gap-2 ${uploading?'bg-slate-200 text-slate-400':'bg-teal-500 text-white hover:bg-teal-600'}`}>
                <Download size={14}/> {uploading?'กำลังประมวลผล...':'อัพโหลดไฟล์ MyOrder (.xlsx)'}
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleMyOrderUpload} disabled={uploading}/>
              </label>
            </div>
            {uploadResult&&(
              <div className={`mt-3 p-3 rounded-lg text-sm flex items-center gap-3 ${uploadResult.matched>0?'bg-green-50 text-green-700':'bg-yellow-50 text-yellow-700'}`}>
                <span>✓ จับคู่สำเร็จ <strong>{uploadResult.matched}</strong> ออเดอร์</span>
                {uploadResult.notFound>0&&<span className="text-orange-600">· ไม่พบ {uploadResult.notFound} รายการ</span>}
              </div>
            )}
          </div>
          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm w-full" style={{minWidth:'700px'}}>
              <thead className="bg-teal-800 text-teal-100 text-xs sticky top-0 z-10">
                <tr>
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
                {printedOrders.length===0&&<tr><td colSpan={7} className="p-8 text-center text-slate-400">ยังไม่มีออเดอร์ที่ปริ้นแล้ว — อัพโหลดไฟล์ MyOrder เพื่อจับคู่ tracking</td></tr>}
                {printedOrders.map(o=>(
                  <tr key={o.id} className="border-b hover:bg-teal-50">
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{o.order_date||'-'}</td>
                    <td className="p-3 font-mono text-xs text-teal-700 whitespace-nowrap">{o.order_no}</td>
                    <td className="p-3 font-medium whitespace-nowrap">{o.customers?.name||'-'}</td>
                    <td className="p-3 font-mono text-xs whitespace-nowrap">{o.customers?.tel||'-'}</td>
                    <td className="p-3 text-xs text-slate-500 max-w-[160px] truncate">{o.raw_prod||'-'}</td>
                    <td className="p-3 font-mono text-xs text-blue-600 whitespace-nowrap">{(o as any).tracking_no||'-'}</td>
                    <td className="p-3 text-center"><span className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded-full text-xs font-bold">รอแพ็ค</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editingOrder&&(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">แก้ไขสินค้า — {editingOrder.order_no}</h3>
              <button onClick={()=>setEditingOrder(null)}><X size={20}/></button>
            </div>
            <div className="space-y-3 mb-5">
              {(orderSelections[editingOrder.id]||makeItems(editingOrder)).map((item,idx)=>(
                <div key={idx} className={`flex items-center gap-3 p-3 rounded-lg border ${item.selected?'border-purple-200 bg-purple-50':'border-slate-100 bg-slate-50 opacity-60'}`}>
                  <input type="checkbox" checked={item.selected} onChange={e=>{const cur=orderSelections[editingOrder.id]||makeItems(editingOrder);setOrderSelections(s=>({...s,[editingOrder.id]:cur.map((it,i)=>i===idx?{...it,selected:e.target.checked}:it)}));}} className="w-4 h-4 rounded accent-purple-500"/>
                  <span className="flex-1 text-sm">{item.rawProd}</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={()=>{const cur=orderSelections[editingOrder.id]||makeItems(editingOrder);setOrderSelections(s=>({...s,[editingOrder.id]:cur.map((it,i)=>i===idx?{...it,qty:Math.max(1,it.qty-1)}:it)}));}} className="w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 font-bold flex items-center justify-center">−</button>
                    <span className="w-8 text-center font-bold text-sm">{item.qty}</span>
                    <button onClick={()=>{const cur=orderSelections[editingOrder.id]||makeItems(editingOrder);setOrderSelections(s=>({...s,[editingOrder.id]:cur.map((it,i)=>i===idx?{...it,qty:it.qty+1}:it)}));}} className="w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 font-bold flex items-center justify-center">+</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={()=>setEditingOrder(null)} className="w-full py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600">บันทึก</button>
          </div>
        </div>
      )}
    </div>
  );
}
