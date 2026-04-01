import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Order } from '../lib/types';
import { Download, Eye, X } from 'lucide-react';
import * as XLSX from 'xlsx';

// type สำหรับ preview row
type PreviewRow = {
  order_no: string;
  name: string;
  address: string;
  postal_code: string;
  phone: string;
  cod: string | number;
  item_desc: string;
  item_type: string;
  weight_kg: string;
  box_lwh: string;
  product_type: string;
};

function extractQty(promoName: string): number {
  const tamMatch = promoName.match(/(\d+)\s*แถม\s*(\d+)/);
  if (tamMatch) return parseInt(tamMatch[1]) + parseInt(tamMatch[2]);
  const unitMatch = promoName.match(/\(?\s*(\d+)\s*(?:กระป๋อง|ชิ้น|แพ็ค|ซอง|กล่อง|ขวด|ถุง|อัน)/i);
  if (unitMatch) return parseInt(unitMatch[1]);
  const firstNum = promoName.match(/(\d+)/);
  if (firstNum) return parseInt(firstNum[1]);
  return 1;
}

export default function FlashExport() {
  const [orders, setOrders]             = useState<Order[]>([]);
  const [exportedOrders, setExportedOrders] = useState<Order[]>([]);
  const [loading, setLoading]           = useState(true);
  const [exporting, setExporting]       = useState(false);
  const [reExporting, setReExporting]   = useState(false);
  const [previewing, setPreviewing]     = useState(false);
  const [previewRows, setPreviewRows]   = useState<PreviewRow[]>([]);
  const [showPreview, setShowPreview]   = useState(false);
  const [tab, setTab]                   = useState<'pending' | 'exported'>('pending');

  useEffect(() => { loadOrders(); loadExportedOrders(); }, []);

  // ออเดอร์ที่รอส่งออก (route B, ยังไม่ส่ง)
  const loadOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, customers(*)')
        .eq('route', 'B')
        .neq('order_status', 'ส่งแฟลช')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) setOrders(data);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  };

  // ออเดอร์ที่ส่งออกแล้ว (status = ส่งแฟลช)
  const loadExportedOrders = async () => {
    try {
      const { data } = await supabase
        .from('orders')
        .select('*, customers(*)')
        .eq('route', 'B')
        .eq('order_status', 'ส่งแฟลช')
        .order('updated_at', { ascending: false });
      if (data) setExportedOrders(data);
    } catch (error) {
      console.error('Error loading exported orders:', error);
    }
  };

  // ฟังก์ชันสร้าง row data (ใช้ร่วมกันระหว่าง preview และ export)
  const buildRows = async () => {
    const rows: any[] = [];
    const previews: PreviewRow[] = [];

    for (const order of orders) {
      const promoId = order.promo_ids?.[0];
      let promo: any = null;
      if (promoId) {
        const { data } = await supabase
          .from('products_promo')
          .select('*, boxes(*), bubbles(*), products_master(*)')
          .eq('id', promoId)
          .maybeSingle();
        promo = data;
      }

      const isCOD     = order.payment_status !== 'ชำระแล้ว';
      const codAmount = isCOD ? Math.floor(order.total_thb) : '';

      const address = [
        order.customers?.address,
        order.customers?.subdistrict ? `ต.${order.customers.subdistrict}` : null,
        order.customers?.district    ? `อ.${order.customers.district}`    : null,
        order.customers?.province    ? `จ.${order.customers.province}`    : null,
      ].filter(Boolean).join(' ');

      const itemShortName  = promo?.short_name || promo?.name || '';
      const itemQty        = promo?.name ? extractQty(promo.name) : (order.quantity || 1);
      const itemDesc       = `${itemShortName}|-|-|${itemQty}`;
      const orderNoWithName = itemShortName ? `${order.order_no} ${itemShortName}` : String(order.order_no);

      const masterWeightG = Number(promo?.products_master?.weight_g ?? 0);
      const totalWeightKg = masterWeightG > 0
        ? Math.max((masterWeightG * itemQty) / 1000, 0.1).toFixed(2)
        : Math.max(Number(order.weight_kg ?? 0), 0.1).toFixed(2);

      const boxL = Number(promo?.boxes?.length_cm) || 1;
      const boxW = Number(promo?.boxes?.width_cm)  || 1;
      const boxH = Number(promo?.boxes?.height_cm) || 1;
      const phone = (order.customers?.tel || '').replace(/[^0-9]/g, '');
      const flashItemType = promo?.item_type || 'พัสดุ';

      // Excel row
      rows.push([
        orderNoWithName,
        order.customers?.name || '',
        address,
        order.customers?.postal_code || '',
        phone,
        '',
        codAmount,
        itemDesc,
        '', '', '', '',
        flashItemType,
        totalWeightKg,
        boxL, boxW, boxH,
        '', '',
        '',
        'Happy Return',
        '', '', '',
      ]);

      // Preview row (เฉพาะคอลัมน์หลัก)
      previews.push({
        order_no:     orderNoWithName,
        name:         order.customers?.name || '-',
        address:      address,
        postal_code:  order.customers?.postal_code || '-',
        phone:        phone,
        cod:          codAmount,
        item_desc:    itemDesc,
        item_type:    flashItemType,
        weight_kg:    totalWeightKg,
        box_lwh:      `${boxL}×${boxW}×${boxH}`,
        product_type: 'Happy Return',
      });
    }
    return { rows, previews };
  };

  // Preview
  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const { previews } = await buildRows();
      setPreviewRows(previews);
      setShowPreview(true);
    } finally {
      setPreviewing(false);
    }
  };

  // Export
  const handleExport = async () => {
    setExporting(true);
    try {
      const { rows } = await buildRows();

      const headers = [
        'Customer_order_number\n(เลขออเดอร์ของลูกค้า)',
        '*Consignee_name\n(ชื่อผู้รับ)',
        '*Address\n(ที่อยู่)',
        '*Postal_code\n(รหัสไปรษณีย์)',
        '*Phone_number\n(เบอร์โทรศัพท์)',
        'Phone_number2\n(เบอร์โทรศัพท์)',
        'COD\n(ยอดเรียกเก็บ)',
        'Item description1(Name|Size/Weight|color|quantity)',
        'Item description2(Name|Size/Weight|color|quantity)',
        'Item description3(Name|Size/Weight|color|quantity)',
        'Item description4(Name|Size/Weight|color|quantity)',
        'Item description5(Name|Size/Weight|color|quantity)',
        'Item_type\n(ประเภทสินค้า)',
        '*Weight_kg\n(น้ำหนัก)',
        '*Length\n(ยาว)',
        '*Width\n(กว้าง)',
        '*Height\n(สูง)',
        'Flash_care',
        'Declared_value\n(มูลค่าสินค้าที่ระบุโดยลูกค้า)',
        'Box_shield',
        '*Product_type         (ประเภทสินค้า）',
        'Remark1\n(หมายเหตุ1)',
        'Remark2\n(หมายเหตุ2)',
        'Remark3\n(หมายเหตุ3)',
      ];

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Flash Export');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob  = new Blob([wbout], { type: 'application/octet-stream' });
      const url   = URL.createObjectURL(blob);
      const link  = document.createElement('a');
      link.href     = url;
      link.download = 'Flash_Export_' + new Date().toISOString().split('T')[0] + '.xlsx';
      link.click();
      URL.revokeObjectURL(url);

      // อัพเดต order_status = 'ส่งแฟลช' ทุกออเดอร์ในครั้งเดียว (bulk update)
      const ids = orders.map(o => o.id);
      await supabase
        .from('orders')
        .update({ order_status: 'ส่งแฟลช' })
        .in('id', ids);

      // ล้างหน้าทันที แล้วค่อยโหลดใหม่ทั้งสอง tab
      setOrders([]);
      setShowPreview(false);
      await Promise.all([loadOrders(), loadExportedOrders()]);
    } catch (error) {
      console.error('Error exporting:', error);
      alert('เกิดข้อผิดพลาดในการส่งออก');
    } finally {
      setExporting(false);
    }
  };

  // ส่งออกซ้ำจาก tab "ส่งออกแล้ว" โดยใช้ exportedOrders แทน orders
  const handleReExport = async (targetOrders: Order[]) => {
    setReExporting(true);
    try {
      const rows: any[] = [];
      for (const order of targetOrders) {
        const promoId = order.promo_ids?.[0];
        let promo: any = null;
        if (promoId) {
          const { data } = await supabase
            .from('products_promo')
            .select('*, boxes(*), bubbles(*), products_master(*)')
            .eq('id', promoId).maybeSingle();
          promo = data;
        }
        const isCOD      = order.payment_status !== 'ชำระแล้ว';
        const codAmount  = isCOD ? Math.floor(order.total_thb) : '';
        const address    = [order.customers?.address, order.customers?.subdistrict ? `ต.${order.customers.subdistrict}` : null, order.customers?.district ? `อ.${order.customers.district}` : null, order.customers?.province ? `จ.${order.customers.province}` : null].filter(Boolean).join(' ');
        const itemShortName = promo?.short_name || promo?.name || '';
        const itemQty       = promo?.name ? extractQty(promo.name) : (order.quantity || 1);
        const itemDesc      = `${itemShortName}|-|-|${itemQty}`;
        const orderNoWithName = itemShortName ? `${order.order_no} ${itemShortName}` : String(order.order_no);
        const masterWeightG = Number(promo?.products_master?.weight_g ?? 0);
        const totalWeightKg = masterWeightG > 0 ? Math.max((masterWeightG * itemQty) / 1000, 0.1).toFixed(2) : Math.max(Number(order.weight_kg ?? 0), 0.1).toFixed(2);
        const boxL = Number(promo?.boxes?.length_cm) || 1;
        const boxW = Number(promo?.boxes?.width_cm)  || 1;
        const boxH = Number(promo?.boxes?.height_cm) || 1;
        const phone = (order.customers?.tel || '').replace(/[^0-9]/g, '');
        rows.push([orderNoWithName, order.customers?.name || '', address, order.customers?.postal_code || '', phone, '', codAmount, itemDesc, '', '', '', '', promo?.item_type || 'พัสดุ', totalWeightKg, boxL, boxW, boxH, '', '', '', 'Happy Return', '', '', '']);
      }
      const headers = ['Customer_order_number\n(เลขออเดอร์ของลูกค้า)','*Consignee_name\n(ชื่อผู้รับ)','*Address\n(ที่อยู่)','*Postal_code\n(รหัสไปรษณีย์)','*Phone_number\n(เบอร์โทรศัพท์)','Phone_number2\n(เบอร์โทรศัพท์)','COD\n(ยอดเรียกเก็บ)','Item description1(Name|Size/Weight|color|quantity)','Item description2(Name|Size/Weight|color|quantity)','Item description3(Name|Size/Weight|color|quantity)','Item description4(Name|Size/Weight|color|quantity)','Item description5(Name|Size/Weight|color|quantity)','Item_type\n(ประเภทสินค้า)','*Weight_kg\n(น้ำหนัก)','*Length\n(ยาว)','*Width\n(กว้าง)','*Height\n(สูง)','Flash_care','Declared_value\n(มูลค่าสินค้าที่ระบุโดยลูกค้า)','Box_shield','*Product_type         (ประเภทสินค้า）','Remark1\n(หมายเหตุ1)','Remark2\n(หมายเหตุ2)','Remark3\n(หมายเหตุ3)'];
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Flash Export');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob  = new Blob([wbout], { type: 'application/octet-stream' });
      const url   = URL.createObjectURL(blob);
      const link  = document.createElement('a');
      link.href     = url;
      link.download = 'Flash_ReExport_' + new Date().toISOString().split('T')[0] + '.xlsx';
      link.click();
      URL.revokeObjectURL(url);
      alert(`ส่งออกซ้ำสำเร็จ ${targetOrders.length} รายการ`);
    } catch (error) {
      console.error('Re-export error:', error);
      alert('เกิดข้อผิดพลาด');
    } finally {
      setReExporting(false);
    }
  };

  if (loading) return <div className="p-6">กำลังโหลด...</div>;

  return (
    <div className="p-6">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-slate-800 mb-4">Flash Export</h2>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-5">
          <button onClick={() => setTab('pending')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition ${tab === 'pending' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            รอส่งออก <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-200 text-slate-500'}`}>{orders.length}</span>
          </button>
          <button onClick={() => setTab('exported')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition ${tab === 'exported' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            ส่งออกแล้ว <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab === 'exported' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>{exportedOrders.length}</span>
          </button>
        </div>

        {/* ── Tab: รอส่งออก ── */}
        {tab === 'pending' && (
          <>
            <p className="text-sm text-slate-500 mb-4">ออเดอร์ที่ยังไม่ได้ส่งออก {orders.length} รายการ</p>
            <div className="flex gap-3 mb-5">
              <button onClick={handlePreview} disabled={orders.length === 0 || previewing}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 flex items-center gap-2 disabled:opacity-50 text-sm">
                <Eye size={17}/> {previewing ? 'กำลังโหลด...' : 'ดูตัวอย่าง'}
              </button>
              <button onClick={handleExport} disabled={orders.length === 0 || exporting}
                className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 flex items-center gap-2 disabled:opacity-50 text-sm">
                <Download size={17}/> {exporting ? 'กำลังส่งออก...' : `ส่งออก Flash (${orders.length} รายการ)`}
              </button>
            </div>
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="p-3 text-left">เลขออเดอร์</th>
                      <th className="p-3 text-left">ลูกค้า</th>
                      <th className="p-3 text-left">สินค้า (raw)</th>
                      <th className="p-3 text-right">ยอด (฿)</th>
                      <th className="p-3 text-left">ที่อยู่</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">ไม่มีออเดอร์รอส่งออก</td></tr>}
                    {orders.map(o => (
                      <tr key={o.id} className="border-b hover:bg-slate-50">
                        <td className="p-3 font-mono text-xs text-blue-600">{o.order_no}</td>
                        <td className="p-3">{o.customers?.name || '-'}</td>
                        <td className="p-3 max-w-xs truncate text-xs text-slate-500">{o.raw_prod}</td>
                        <td className="p-3 text-right font-bold">฿{Number(o.total_thb).toLocaleString()}</td>
                        <td className="p-3 max-w-xs truncate text-xs">{[o.customers?.address, o.customers?.district, o.customers?.province].filter(Boolean).join(' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── Tab: ส่งออกแล้ว ── */}
        {tab === 'exported' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-500">ออเดอร์ที่ส่งออกแล้ว {exportedOrders.length} รายการ</p>
              <button onClick={() => handleReExport(exportedOrders)} disabled={exportedOrders.length === 0 || reExporting}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 flex items-center gap-2 disabled:opacity-50 text-sm">
                <Download size={17}/> {reExporting ? 'กำลังส่งออก...' : `ส่งออกซ้ำ (${exportedOrders.length} รายการ)`}
              </button>
            </div>
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-green-50">
                    <tr>
                      <th className="p-3 text-left">เลขออเดอร์</th>
                      <th className="p-3 text-left">ลูกค้า</th>
                      <th className="p-3 text-left">สินค้า</th>
                      <th className="p-3 text-right">ยอด (฿)</th>
                      <th className="p-3 text-left">ที่อยู่</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exportedOrders.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">ยังไม่มีออเดอร์ที่ส่งออก</td></tr>}
                    {exportedOrders.map(o => (
                      <tr key={o.id} className="border-b hover:bg-green-50">
                        <td className="p-3 font-mono text-xs text-green-700">{o.order_no}</td>
                        <td className="p-3">{o.customers?.name || '-'}</td>
                        <td className="p-3 max-w-xs truncate text-xs text-slate-500">{o.raw_prod}</td>
                        <td className="p-3 text-right font-bold">฿{Number(o.total_thb).toLocaleString()}</td>
                        <td className="p-3 max-w-xs truncate text-xs">{[o.customers?.address, o.customers?.district, o.customers?.province].filter(Boolean).join(' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
      {/* ======== Modal Preview ======== */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h3 className="text-lg font-bold text-slate-800">ตัวอย่างข้อมูลที่จะส่งออก</h3>
                <p className="text-sm text-slate-500">{previewRows.length} รายการ — ตรวจสอบก่อนกด Export</p>
              </div>
              <button onClick={() => setShowPreview(false)} className="text-slate-400 hover:text-slate-600">
                <X size={22} />
              </button>
            </div>

            {/* Table */}
            <div className="overflow-auto flex-1 p-2">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-800 text-white">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium whitespace-nowrap">A: เลขออเดอร์+ชื่อ</th>
                    <th className="px-2 py-2 text-left font-medium whitespace-nowrap">B: ชื่อผู้รับ</th>
                    <th className="px-2 py-2 text-left font-medium whitespace-nowrap">C: ที่อยู่</th>
                    <th className="px-2 py-2 text-left font-medium whitespace-nowrap">D: ไปรษณีย์</th>
                    <th className="px-2 py-2 text-left font-medium whitespace-nowrap">E: เบอร์โทร</th>
                    <th className="px-2 py-2 text-right font-medium whitespace-nowrap">G: COD</th>
                    <th className="px-2 py-2 text-left font-medium whitespace-nowrap">H: Item Desc</th>
                    <th className="px-2 py-2 text-left font-medium whitespace-nowrap">M: ประเภท</th>
                    <th className="px-2 py-2 text-right font-medium whitespace-nowrap">N: น้ำหนัก</th>
                    <th className="px-2 py-2 text-center font-medium whitespace-nowrap">O-Q: กล่อง</th>
                    <th className="px-2 py-2 text-left font-medium whitespace-nowrap">U: Product Type</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className={`border-b ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-yellow-50`}>
                      <td className="px-2 py-1.5 font-mono text-blue-700 whitespace-nowrap max-w-[180px] truncate">{row.order_no}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{row.name}</td>
                      <td className="px-2 py-1.5 max-w-[160px] truncate text-slate-500">{row.address}</td>
                      <td className="px-2 py-1.5 font-mono text-center">{row.postal_code}</td>
                      <td className="px-2 py-1.5 font-mono">{row.phone}</td>
                      <td className="px-2 py-1.5 text-right font-bold text-orange-600">
                        {row.cod !== '' ? `฿${Number(row.cod).toLocaleString()}` : <span className="text-slate-300">โอน</span>}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-cyan-700 whitespace-nowrap">{row.item_desc}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{row.item_type}</td>
                      <td className="px-2 py-1.5 text-right font-bold">{row.weight_kg} kg</td>
                      <td className="px-2 py-1.5 text-center text-slate-500">{row.box_lwh}</td>
                      <td className="px-2 py-1.5 text-green-700 font-medium whitespace-nowrap">{row.product_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex justify-between items-center">
              <p className="text-sm text-slate-500">ถ้าข้อมูลถูกต้องแล้ว กดส่งออกได้เลย</p>
              <div className="flex gap-3">
                <button onClick={() => setShowPreview(false)} className="px-4 py-2 bg-slate-200 rounded-lg text-sm hover:bg-slate-300">
                  ปิด
                </button>
                <button
                  onClick={() => { setShowPreview(false); handleExport(); }}
                  disabled={exporting}
                  className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 flex items-center gap-2 text-sm"
                >
                  <Download size={16} /> ส่งออก Flash
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
