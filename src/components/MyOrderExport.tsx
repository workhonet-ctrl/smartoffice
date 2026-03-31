import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Order } from '../lib/types';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function MyOrderExport() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { loadOrders(); }, []);

  const loadOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, customers(*)')
        .eq('route', 'C')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) setOrders(data);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportData = [];

      for (const order of orders) {
        // FIX: ใช้ promo_ids[] แทน promo_code
        const promoId = order.promo_ids?.[0];
        let promo: any = null;
        if (promoId) {
          const { data } = await supabase
            .from('products_promo')
            .select('*, products_master(*), boxes(*), bubbles(*)')
            .eq('id', promoId)   // ← .eq('id', ...) ไม่ใช่ .eq('code', ...)
            .maybeSingle();
          promo = data;
        }

        const paymentType = order.payment_status === 'ชำระแล้ว' ? 'BANK' : 'COD';

        exportData.push([
          order.customers?.name          || '',
          order.customers?.tel           || '',    // ← tel
          order.customers?.address       || '',
          order.customers?.subdistrict   || '',
          order.customers?.district      || '',
          order.customers?.province      || '',
          order.customers?.postal_code   || '',
          '',
          order.raw_prod                 || '',
          promo?.products_master?.name   || '',
          promo?.short_name              || '',
          promo?.color                   || 'ไม่มี',
          promo?.boxes?.width_cm         || '',
          promo?.boxes?.length_cm        || '',
          promo?.boxes?.height_cm        || '',
          (order.weight_kg ?? 0).toFixed(2),      // ← weight_kg
          paymentType,
          order.total_thb,                         // ← total_thb
          '', '', '',
          order.channel || '',
        ]);
      }

      const headers = [
        'ชื่อผู้รับ','เบอร์โทร','ที่อยู่','ตำบล','อำเภอ','จังหวัด',
        'รหัสไปรษณีย์','อีเมล','หมายเหตุ','ชื่อสินค้า',
        'ชื่อสินค้า (สำหรับขนส่ง)','สีสินค้า','ความกว้างของสินค้า',
        'ความยาวของสินค้า','ความสูงของสินค้า','น้ำหนัก(กก.)',
        'ประเภทการชำระ','จำนวนเงิน','วันที่โอนเงิน',
        'เวลาที่โอน','ผู้รับเงิน','ช่องทางการจำหน่าย',
      ];

      const ws  = XLSX.utils.aoa_to_sheet([headers, ...exportData]);
      const wb  = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Template ใหม่_New102024');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob  = new Blob([wbout], { type: 'application/octet-stream' });
      const url   = URL.createObjectURL(blob);
      const link  = document.createElement('a');
      link.href     = url;
      link.download = 'MyOrder_Export_' + new Date().toISOString().split('T')[0] + '.xlsx';
      link.click();
      URL.revokeObjectURL(url);

      // อัพเดต order_status = 'ส่งไปรษณีย์' ทุกออเดอร์ในครั้งเดียว (bulk update)
      const ids = orders.map((o: any) => o.id);
      await supabase
        .from('orders')
        .update({ order_status: 'ส่งไปรษณีย์' })
        .in('id', ids);

      // ล้างหน้าทันที แล้วค่อยโหลดใหม่
      setOrders([]);
      await loadOrders();
    } catch (error) {
      console.error('Error exporting:', error);
      alert('เกิดข้อผิดพลาดในการส่งออก');
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <div className="p-6">กำลังโหลด...</div>;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800 mb-4">MyOrder Export</h2>
        <p className="text-sm text-slate-600 mb-4">
          ส่งออกออเดอร์พื้นที่ท่องเที่ยว (เส้นทาง C)
        </p>
        <button
          onClick={handleExport}
          disabled={orders.length === 0 || exporting}
          className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download size={20} />
          {exporting ? 'กำลังส่งออก...' : `ส่งออก MyOrder (${orders.length} รายการ)`}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3 text-left">เลขออเดอร์</th>
                <th className="p-3 text-left">ลูกค้า</th>
                <th className="p-3 text-left">สินค้า</th>
                <th className="p-3 text-right">ยอด (฿)</th>
                <th className="p-3 text-left">จังหวัด</th>
                <th className="p-3 text-left">รหัสไปรษณีย์</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} className="border-b hover:bg-slate-50">
                  <td className="p-3 font-mono text-xs">{o.order_no}</td>
                  <td className="p-3">{o.customers?.name || '-'}</td>
                  <td className="p-3 max-w-xs truncate text-xs">{o.raw_prod}</td>
                  <td className="p-3 text-right font-bold">฿{Number(o.total_thb).toLocaleString()}</td>  {/* ← total_thb */}
                  <td className="p-3">{o.customers?.province}</td>
                  <td className="p-3">
                    <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">
                      {o.customers?.postal_code}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {orders.length === 0 && (
        <div className="text-center py-12 text-slate-500">ไม่มีออเดอร์สำหรับ MyOrder Export</div>
      )}
    </div>
  );
}
