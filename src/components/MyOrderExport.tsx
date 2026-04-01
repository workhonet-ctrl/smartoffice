import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Order } from '../lib/types';
import { Download, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function MyOrderExport() {
  const [orders, setOrders]               = useState<Order[]>([]);
  const [exportedOrders, setExportedOrders] = useState<Order[]>([]);
  const [loading, setLoading]             = useState(true);
  const [exporting, setExporting]         = useState(false);
  const [tab, setTab]                     = useState<'pending' | 'exported'>('pending');
  const [selectedPending,  setSelectedPending]  = useState<Set<string>>(new Set());
  const [selectedExported, setSelectedExported] = useState<Set<string>>(new Set());

  useEffect(() => { loadOrders(); loadExportedOrders(); }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('orders').select('*, customers(*)')
        .eq('route', 'C').neq('order_status', 'ส่งไปรษณีย์').order('created_at', { ascending: false });
      if (data) setOrders(data);
    } finally { setLoading(false); }
  };

  const loadExportedOrders = async () => {
    const { data } = await supabase.from('orders').select('*, customers(*)')
      .eq('route', 'C').eq('order_status', 'ส่งไปรษณีย์').order('updated_at', { ascending: false });
    if (data) setExportedOrders(data);
  };

  const handleExport = async (targetOrders: Order[]) => {
    setExporting(true);
    try {
      const exportData = [];
      for (const order of targetOrders) {
        const promoId = order.promo_ids?.[0];
        let promo: any = null;
        if (promoId) {
          const { data } = await supabase.from('products_promo')
            .select('*, products_master(*), boxes(*), bubbles(*)').eq('id', promoId).maybeSingle();
          promo = data;
        }
        const paymentType = order.payment_status === 'ชำระแล้ว' ? 'BANK' : 'COD';
        exportData.push([
          order.customers?.name||'', order.customers?.tel||'',
          order.customers?.address||'', order.customers?.subdistrict||'',
          order.customers?.district||'', order.customers?.province||'',
          order.customers?.postal_code||'', '',
          order.raw_prod||'', promo?.products_master?.name||'',
          promo?.short_name||'', promo?.color||'ไม่มี',
          promo?.boxes?.width_cm||'', promo?.boxes?.length_cm||'', promo?.boxes?.height_cm||'',
          (order.weight_kg??0).toFixed(2), paymentType, order.total_thb, '','','',
          order.channel||'',
        ]);
      }
      const headers = ['ชื่อผู้รับ','เบอร์โทร','ที่อยู่','ตำบล','อำเภอ','จังหวัด','รหัสไปรษณีย์','อีเมล','หมายเหตุ','ชื่อสินค้า','ชื่อสินค้า (สำหรับขนส่ง)','สีสินค้า','ความกว้างของสินค้า','ความยาวของสินค้า','ความสูงของสินค้า','น้ำหนัก(กก.)','ประเภทการชำระ','จำนวนเงิน','วันที่โอนเงิน','เวลาที่โอน','ผู้รับเงิน','ช่องทางการจำหน่าย'];
      const ws = XLSX.utils.aoa_to_sheet([headers, ...exportData]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Template ใหม่_New102024');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob  = new Blob([wbout], { type: 'application/octet-stream' });
      const url   = URL.createObjectURL(blob);
      const link  = document.createElement('a');
      link.href = url; link.download = `MyOrder_Export_${new Date().toISOString().split('T')[0]}.xlsx`; link.click();
      URL.revokeObjectURL(url);

      // อัพเดตเฉพาะ targetOrders
      const ids = targetOrders.map(o => o.id);
      await supabase.from('orders').update({ order_status: 'ส่งไปรษณีย์' }).in('id', ids);
      setOrders([]); setSelectedPending(new Set());
      await Promise.all([loadOrders(), loadExportedOrders()]);
    } catch(e) { console.error(e); alert('เกิดข้อผิดพลาด'); }
    finally { setExporting(false); }
  };

  const handleDeleteExported = async (ids: string[]) => {
    if (!confirm(`ยืนยันลบ ${ids.length} รายการออกจากส่งออกแล้ว?`)) return;
    await supabase.from('orders').update({ order_status: 'รอแพ็ค' }).in('id', ids);
    setSelectedExported(new Set());
    await Promise.all([loadOrders(), loadExportedOrders()]);
  };

  const togglePending  = (id: string) => setSelectedPending(s  => { const n = new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });
  const toggleExported = (id: string) => setSelectedExported(s => { const n = new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });
  const allPendingSelected  = orders.length>0 && orders.every(o => selectedPending.has(o.id));
  const allExportedSelected = exportedOrders.length>0 && exportedOrders.every(o => selectedExported.has(o.id));
  const pendingTarget  = selectedPending.size  > 0 ? orders.filter(o => selectedPending.has(o.id))  : orders;
  const exportedCount  = selectedExported.size > 0 ? selectedExported.size : exportedOrders.length;

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
          ส่งออกแล้ว <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab==='exported'?'bg-green-100 text-green-700':'bg-slate-200 text-slate-500'}`}>{exportedOrders.length}</span>
        </button>
      </div>

      {/* ── Tab: รอส่งออก ── */}
      {tab === 'pending' && (
        <>
          <div className="flex gap-3 mb-3 shrink-0 flex-wrap">
            <button onClick={() => handleExport(pendingTarget)} disabled={orders.length===0||exporting}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 flex items-center gap-2 disabled:opacity-50 text-sm">
              <Download size={16}/> {exporting?'กำลังส่งออก...':`ส่งออก MyOrder (${pendingTarget.length} รายการ)`}
            </button>
            {selectedPending.size>0 && <span className="self-center text-xs text-slate-500">เลือก {selectedPending.size} จาก {orders.length}</span>}
          </div>

          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm" style={{minWidth:'700px', width:'100%'}}>
              <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0">
                <tr>
                  <th className="p-3 w-8">
                    <input type="checkbox" checked={allPendingSelected}
                      onChange={e => setSelectedPending(e.target.checked ? new Set(orders.map(o=>o.id)) : new Set())}
                      className="rounded"/>
                  </th>
                  <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                  <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
                  <th className="p-3 text-left">ลูกค้า</th>
                  <th className="p-3 text-left">สินค้า</th>
                  <th className="p-3 text-right whitespace-nowrap">ยอด (฿)</th>
                  <th className="p-3 text-left whitespace-nowrap">จังหวัด</th>
                  <th className="p-3 text-left whitespace-nowrap">รหัสไปรษณีย์</th>
                </tr>
              </thead>
              <tbody>
                {orders.length===0 && <tr><td colSpan={8} className="p-8 text-center text-slate-400">ไม่มีออเดอร์รอส่งออก</td></tr>}
                {orders.map(o => (
                  <tr key={o.id} className={`border-b hover:bg-slate-50 ${selectedPending.has(o.id)?'bg-purple-50':''}`}>
                    <td className="p-3 text-center">
                      <input type="checkbox" checked={selectedPending.has(o.id)} onChange={()=>togglePending(o.id)} className="rounded"/>
                    </td>
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                      {o.order_date ? o.order_date.split('-').reverse().join('-') : '-'}
                      {(o as any).order_time && <div className="text-slate-400">{(o as any).order_time}</div>}
                    </td>
                    <td className="p-3 font-mono text-xs text-blue-600 whitespace-nowrap">{o.order_no}</td>
                    <td className="p-3 whitespace-nowrap">{o.customers?.name||'-'}</td>
                    <td className="p-3 text-xs text-slate-500 max-w-[200px] truncate">{o.raw_prod}</td>
                    <td className="p-3 text-right font-bold">฿{Number(o.total_thb).toLocaleString()}</td>
                    <td className="p-3 text-xs">{o.customers?.province||'-'}</td>
                    <td className="p-3"><span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs">{o.customers?.postal_code||'-'}</span></td>
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
          <div className="flex gap-3 mb-3 shrink-0 flex-wrap">
            <button onClick={() => handleExport(selectedExported.size>0 ? exportedOrders.filter(o=>selectedExported.has(o.id)) : exportedOrders)}
              disabled={exportedOrders.length===0||exporting}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 flex items-center gap-2 disabled:opacity-50 text-sm">
              <Download size={16}/> {exporting?'กำลังส่งออก...':`ส่งออกซ้ำ (${exportedCount} รายการ)`}
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
                      onChange={e => setSelectedExported(e.target.checked ? new Set(exportedOrders.map(o=>o.id)) : new Set())}
                      className="rounded"/>
                  </th>
                  <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                  <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
                  <th className="p-3 text-left">ลูกค้า</th>
                  <th className="p-3 text-left">สินค้า</th>
                  <th className="p-3 text-right whitespace-nowrap">ยอด (฿)</th>
                  <th className="p-3 text-left whitespace-nowrap">จังหวัด</th>
                  <th className="p-3 text-left whitespace-nowrap">รหัสไปรษณีย์</th>
                </tr>
              </thead>
              <tbody>
                {exportedOrders.length===0 && <tr><td colSpan={8} className="p-8 text-center text-slate-400">ยังไม่มีออเดอร์ที่ส่งออก</td></tr>}
                {exportedOrders.map(o => (
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
                    <td className="p-3 text-xs text-slate-500 max-w-[200px] truncate">{o.raw_prod}</td>
                    <td className="p-3 text-right font-bold">฿{Number(o.total_thb).toLocaleString()}</td>
                    <td className="p-3 text-xs">{o.customers?.province||'-'}</td>
                    <td className="p-3"><span className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs">{o.customers?.postal_code||'-'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
