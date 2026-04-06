import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Order } from '../lib/types';
import { Download, Trash2, Edit2, X } from 'lucide-react';
import * as XLSX from 'xlsx';

type OrderItem = { rawProd: string; qty: number; selected: boolean; };
type OrderSelections = Record<string, OrderItem[]>;
type Tab = 'pending' | 'exported' | 'printed';

function makeItems(order: Order): OrderItem[] {
  const prods = (order.raw_prod || '').split('|').map(s => s.trim()).filter(Boolean);
  const qtys  = String((order as any).quantities || order.quantity || '1').split('|');
  if (prods.length === 0) return [{ rawProd: order.raw_prod || '-', qty: 1, selected: true }];
  return prods.map((p, i) => ({ rawProd: p, qty: Number(qtys[i]?.trim()) || 1, selected: true }));
}

export default function MyOrderExport() {
  const [orders, setOrders]               = useState<Order[]>([]);
  const [exportedOrders, setExportedOrders] = useState<Order[]>([]);
  const [printedOrders, setPrintedOrders]   = useState<Order[]>([]);
  const [loading, setLoading]             = useState(true);
  const [exporting, setExporting]         = useState(false);
  const [tab, setTab]                     = useState<Tab>('pending');
  const [selectedPending,  setSelectedPending]  = useState<Set<string>>(new Set());
  const [selectedExported, setSelectedExported] = useState<Set<string>>(new Set());
  const [orderSelections, setOrderSelections]   = useState<OrderSelections>({});
  const [editingOrder, setEditingOrder]         = useState<Order | null>(null);
  const [searchProduct, setSearchProduct]       = useState('');
  const [searchExported, setSearchExported]     = useState('');
  const [uploading, setUploading]               = useState(false);
  const [uploadResult, setUploadResult]         = useState<{matched:number;notFound:number}|null>(null);

  useEffect(() => { loadOrders(); loadExportedOrders(); loadPrintedOrders(); }, []);

  // Tab รอส่งออก: รอคีย์ออเดอร์
  const loadOrders = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('orders').select('*, customers(*)')
        .eq('route', 'A').eq('order_status', 'รอคีย์ออเดอร์').order('created_at', { ascending: false });
      if (data) {
        setOrders(data);
        const sel: OrderSelections = {};
        data.forEach((o: Order) => { sel[o.id] = makeItems(o); });
        setOrderSelections(sel);
      }
    } finally { setLoading(false); }
  };

  // Tab ส่งออกแล้ว: กำลังคีย์
  const loadExportedOrders = async () => {
    const { data } = await supabase.from('orders').select('*, customers(*)')
      .eq('route', 'A').eq('order_status', 'กำลังคีย์').order('updated_at', { ascending: false });
    if (data) {
      setExportedOrders(data);
      const sel: any = {};
      data.forEach((o: Order) => { sel[o.id] = makeItems(o); });
      setOrderSelections(s => ({ ...s, ...sel }));
    }
  };

  // Tab ปริ้นแล้ว: รอแพ็ค (route A หรือ C)
  const loadPrintedOrders = async () => {
    const { data } = await supabase.from('orders').select('*, customers(*)')
      .in('route', ['A', 'C']).eq('order_status', 'รอแพ็ค').order('updated_at', { ascending: false });
    if (data) setPrintedOrders(data);
  };

  const handleExport = async (targetOrders: Order[]) => {
    setExporting(true);
    try {
      const exportData = targetOrders.map((o, idx) => {
        const items = orderSelections[o.id] || makeItems(o);
        const selected = items.filter(it => it.selected);
        const itemDesc = selected.map(it => `${it.rawProd} (x${it.qty})`).join(', ');
        return {
          'No.': idx + 1,
          'Order No.': o.order_no,
          'ชื่อลูกค้า': o.customers?.name || '',
          'เบอร์โทร': o.customers?.tel || '',
          'ที่อยู่': [o.customers?.address, o.customers?.district, o.customers?.province, o.customers?.postal_code].filter(Boolean).join(' '),
          'สินค้า': itemDesc,
          'ยอด (฿)': o.total_thb,
        };
      });

      const wb  = XLSX.utils.book_new();
      const ws  = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(wb, ws, 'MyOrder');
      XLSX.writeFile(wb, `MyOrder_Export_${new Date().toISOString().split('T')[0]}.xlsx`);

      const ids = targetOrders.map(o => o.id);
      await supabase.from('orders').update({ order_status: 'กำลังคีย์' }).in('id', ids);
      await Promise.all([loadOrders(), loadExportedOrders()]);
    } catch(e) { console.error(e); } finally { setExporting(false); }
  };

  const handleDeleteExported = async (ids: string[]) => {
    if (!confirm(`ยืนยันลบ ${ids.length} รายการ?`)) return;
    await supabase.from('orders').update({ order_status: 'รอคีย์ออเดอร์' }).in('id', ids);
    setSelectedExported(new Set());
    await Promise.all([loadOrders(), loadExportedOrders()]);
  };

  // Upload ไฟล์ MyOrder tracking
  const handleMyOrderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadResult(null);
    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      // โหลดออเดอร์ที่ route A หรือ C (ไปรษณีย์) ทั้งหมด
      const { data: allOrders } = await supabase
        .from('orders')
        .select('id, order_date, order_status, route, customers(name, tel)')
        .in('route', ['A', 'C']);

      let matched = 0; let notFound = 0;
      // row 0 = header, row 1+ = data
      for (let i = 1; i < rows.length; i++) {
        const row      = rows[i];
        const rawDate  = row[3];   // Col D: วันที่สั่งซื้อ
        const name     = String(row[4] || '').trim();  // Col E: ชื่อลูกค้า
        const tel      = String(row[6] || '').replace(/\D/g, ''); // Col G: เบอร์โทร
        const rawTrack = String(row[17] || '').trim(); // Col R: TRACKING NO.

        if (!rawTrack || (!name && !tel)) continue;

        // parse วันที่ → YYYY-MM-DD
        let dateStr = '';
        if (rawDate instanceof Date) {
          dateStr = rawDate.toISOString().split('T')[0];
        } else {
          const m = String(rawDate).match(/(\d{4}-\d{2}-\d{2})/);
          if (m) dateStr = m[1];
        }
        if (!dateStr) continue;

        // parse tracking → เอาแค่เลขพัสดุ ตัด (THAI_POST) ออก
        const tracking = rawTrack.split('(')[0].trim();

        // จับคู่
        const match = (allOrders || []).find((o: any) => {
          const oDate = String(o.order_date || '').split('T')[0];
          const cTel  = String((o.customers as any)?.tel || '').replace(/\D/g, '');
          const cName = String((o.customers as any)?.name || '').trim();
          return oDate === dateStr && (cTel === tel || cName === name);
        });

        if (match) {
          await supabase.from('orders')
            .update({ tracking_no: tracking, order_status: 'รอแพ็ค' })
            .eq('id', match.id);
          matched++;
        } else {
          notFound++;
          console.log(`ไม่พบ: วันที่=${dateStr} ชื่อ=${name} เบอร์=${tel}`);
        }
      }
      setUploadResult({ matched, notFound });
      await Promise.all([loadOrders(), loadExportedOrders(), loadPrintedOrders()]);
    } catch (err) { console.error(err); alert('เกิดข้อผิดพลาดในการอ่านไฟล์'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const togglePending  = (id: string) => setSelectedPending(s  => { const n = new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });
  const toggleExported = (id: string) => setSelectedExported(s => { const n = new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });

  const filteredOrders         = searchProduct.trim() ? orders.filter(o=>(o.raw_prod||'').toLowerCase().includes(searchProduct.toLowerCase())) : orders;
  const filteredExportedOrders = searchExported.trim() ? exportedOrders.filter(o=>(o.raw_prod||'').toLowerCase().includes(searchExported.toLowerCase())) : exportedOrders;
  const allPendingSelected     = filteredOrders.length > 0 && filteredOrders.every(o=>selectedPending.has(o.id));
  const allExportedSelected    = filteredExportedOrders.length > 0 && filteredExportedOrders.every(o=>selectedExported.has(o.id));
  const pendingCount           = selectedPending.size > 0 ? selectedPending.size : filteredOrders.length;
  const exportedCount          = selectedExported.size > 0 ? selectedExported.size : filteredExportedOrders.length;

  if (loading) return <div className="p-6">กำลังโหลด...</div>;

  return (
    <div className="flex flex-col h-screen p-6 pb-2">
      <h2 className="text-2xl font-bold text-slate-800 mb-4 shrink-0">MyOrder Export</h2>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-4 shrink-0">
        <button onClick={() => setTab('pending')} className={`px-5 py-2 rounded-lg text-sm font-medium transition ${tab==='pending'?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
          รอส่งออก <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab==='pending'?'bg-purple-100 text-purple-700':'bg-slate-200 text-slate-500'}`}>{orders.length}</span>
        </button>
        <button onClick={() => setTab('exported')} className={`px-5 py-2 rounded-lg text-sm font-medium transition ${tab==='exported'?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
          ส่งออกแล้ว <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab==='exported'?'bg-indigo-100 text-indigo-700':'bg-slate-200 text-slate-500'}`}>{exportedOrders.length}</span>
        </button>
        <button onClick={() => setTab('printed')} className={`px-5 py-2 rounded-lg text-sm font-medium transition ${tab==='printed'?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
          ปริ้นแล้ว <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab==='printed'?'bg-teal-100 text-teal-700':'bg-slate-200 text-slate-500'}`}>{printedOrders.length}</span>
        </button>
      </div>

      {/* ── Tab: รอส่งออก ── */}
      {tab === 'pending' && (
        <>
          <div className="flex gap-3 mb-3 shrink-0 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input type="text" value={searchProduct} onChange={e => setSearchProduct(e.target.value)}
                placeholder="ค้นหาชื่อสินค้า..."
                className="w-full pl-8 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
            </div>
            <button onClick={() => {
              const target = selectedPending.size > 0 ? filteredOrders.filter(o=>selectedPending.has(o.id)) : filteredOrders;
              handleExport(target);
            }} disabled={orders.length===0||exporting}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 flex items-center gap-2 disabled:opacity-50 text-sm">
              <Download size={16}/> {exporting?'กำลังส่งออก...':`ส่งออก MyOrder (${pendingCount} รายการ)`}
            </button>
          </div>
          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm" style={{minWidth:'700px', width:'100%'}}>
              <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0">
                <tr>
                  <th className="p-3 w-8"><input type="checkbox" checked={allPendingSelected} onChange={e=>setSelectedPending(e.target.checked?new Set(filteredOrders.map(o=>o.id)):new Set())} className="rounded"/></th>
                  <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                  <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
                  <th className="p-3 text-left">ลูกค้า</th>
                  <th className="p-3 text-left">สินค้า</th>
                  <th className="p-3 text-right whitespace-nowrap">ยอด (฿)</th>
                  <th className="p-3 text-left">ที่อยู่</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length===0 && <tr><td colSpan={7} className="p-8 text-center text-slate-400">ไม่มีออเดอร์รอส่งออก</td></tr>}
                {filteredOrders.map(o => (
                  <tr key={o.id} className={`border-b hover:bg-purple-50 ${selectedPending.has(o.id)?'bg-purple-50':''}`}>
                    <td className="p-3"><input type="checkbox" checked={selectedPending.has(o.id)} onChange={()=>togglePending(o.id)} className="rounded"/></td>
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{o.order_date||'-'}<div className="text-slate-400">{(o as any).order_time||''}</div></td>
                    <td className="p-3 font-mono text-xs text-purple-700 whitespace-nowrap">{o.order_no}</td>
                    <td className="p-3 whitespace-nowrap"><div className="font-medium">{o.customers?.name||'-'}</div><div className="text-xs text-slate-400">{o.customers?.tel||''}</div></td>
                    <td className="p-3 text-xs text-slate-500 max-w-[180px]">
                      {(orderSelections[o.id]||makeItems(o)).filter(it=>it.selected).map((it,i)=><div key={i}>{it.rawProd} ×{it.qty}</div>)}
                    </td>
                    <td className="p-3 text-right font-bold">฿{Number(o.total_thb).toLocaleString()}</td>
                    <td className="p-3 text-xs text-slate-400 max-w-[160px] truncate">{[o.customers?.address,o.customers?.district,o.customers?.province].filter(Boolean).join(' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Tab: ส่งออกแล้ว (กำลังคีย์) — re-export / ลบ ── */}
      {tab === 'exported' && (
        <>
          <div className="flex gap-3 mb-3 shrink-0 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input value={searchExported} onChange={e=>setSearchExported(e.target.value)}
                placeholder="ค้นหาชื่อสินค้า..."
                className="w-full pl-8 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"/>
            </div>
            <button onClick={() => {
              const target = selectedExported.size > 0 ? filteredExportedOrders.filter(o=>selectedExported.has(o.id)) : filteredExportedOrders;
              handleExport(target);
            }} disabled={exportedOrders.length===0||exporting}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 flex items-center gap-2 disabled:opacity-50 text-sm">
              <Download size={16}/> ส่งออกซ้ำ ({exportedCount} รายการ)
            </button>
            {selectedExported.size > 0 && (
              <button onClick={() => handleDeleteExported([...selectedExported])}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-2 text-sm">
                <Trash2 size={16}/> ลบที่เลือก ({selectedExported.size})
              </button>
            )}
            <button onClick={() => handleDeleteExported(exportedOrders.map(o=>o.id))} disabled={exportedOrders.length===0}
              className="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 flex items-center gap-2 text-sm disabled:opacity-50">
              <Trash2 size={16}/> ลบทั้งหมด
            </button>
          </div>
          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm" style={{minWidth:'700px', width:'100%'}}>
              <thead className="bg-indigo-800 text-indigo-100 text-xs sticky top-0">
                <tr>
                  <th className="p-3 w-8"><input type="checkbox" checked={allExportedSelected} onChange={e=>setSelectedExported(e.target.checked?new Set(filteredExportedOrders.map(o=>o.id)):new Set())} className="rounded"/></th>
                  <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                  <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
                  <th className="p-3 text-left">ลูกค้า</th>
                  <th className="p-3 text-left">สินค้า</th>
                  <th className="p-3 text-right whitespace-nowrap">ยอด (฿)</th>
                </tr>
              </thead>
              <tbody>
                {filteredExportedOrders.length===0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">ยังไม่มีออเดอร์ที่ส่งออกแล้ว</td></tr>}
                {filteredExportedOrders.map(o => (
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

      {/* ── Tab: ปริ้นแล้ว — upload + แสดงรายการที่มี tracking ── */}
      {tab === 'printed' && (
        <>
          <div className="shrink-0 bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-slate-700">อัพโหลดไฟล์ Tracking จาก MyOrder</h3>
                <p className="text-xs text-slate-400 mt-0.5">จับคู่ วันที่ + ชื่อ + เบอร์ → ใส่ Tracking → เปลี่ยนสถานะเป็น รอแพ็ค</p>
              </div>
              <label className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer flex items-center gap-2 ${uploading?'bg-slate-200 text-slate-400':'bg-teal-500 text-white hover:bg-teal-600'}`}>
                <Download size={14}/> {uploading?'กำลังประมวลผล...':'อัพโหลดไฟล์ MyOrder (.xlsx)'}
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleMyOrderUpload} disabled={uploading}/>
              </label>
            </div>
            {uploadResult && (
              <div className={`mt-3 p-3 rounded-lg text-sm flex items-center gap-3 ${uploadResult.matched>0?'bg-green-50 text-green-700':'bg-yellow-50 text-yellow-700'}`}>
                <span>✓ จับคู่สำเร็จ <strong>{uploadResult.matched}</strong> ออเดอร์</span>
                {uploadResult.notFound > 0 && <span className="text-orange-600">· ไม่พบ {uploadResult.notFound} รายการ</span>}
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
                {printedOrders.length===0 && <tr><td colSpan={7} className="p-8 text-center text-slate-400">ยังไม่มีออเดอร์ที่ปริ้นแล้ว — อัพโหลดไฟล์ MyOrder เพื่อจับคู่ tracking</td></tr>}
                {printedOrders.map(o => (
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

      {/* Modal แก้ไขสินค้า */}
      {editingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">แก้ไขสินค้า — {editingOrder.order_no}</h3>
              <button onClick={()=>setEditingOrder(null)}><X size={20}/></button>
            </div>
            <div className="space-y-3 mb-5">
              {(orderSelections[editingOrder.id]||makeItems(editingOrder)).map((item,idx)=>(
                <div key={idx} className={`flex items-center gap-3 p-3 rounded-lg border ${item.selected?'border-purple-200 bg-purple-50':'border-slate-100 bg-slate-50 opacity-60'}`}>
                  <input type="checkbox" checked={item.selected} onChange={e=>{
                    const cur=orderSelections[editingOrder.id]||makeItems(editingOrder);
                    setOrderSelections(s=>({...s,[editingOrder.id]:cur.map((it,i)=>i===idx?{...it,selected:e.target.checked}:it)}));
                  }} className="w-4 h-4 rounded accent-purple-500"/>
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
