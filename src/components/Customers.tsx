import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Customer } from '../lib/types';
import { Upload, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadCustomers(); }, []);

  const loadCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) setCustomers(data);
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as Array<Array<string | number>>;

      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row[6]) continue;

        // FIX: ใช้ tel, facebook_name ตาม Schema
        const customerData = {
          tel:           String(row[6] || '').trim(),   // ← tel (ไม่ใช่ phone)
          name:          String(row[4] || '').trim(),
          facebook_name: String(row[5] || '').trim(),   // ← facebook_name
          address:       String(row[7] || '').trim(),
          subdistrict:   String(row[8] || '').trim(),
          district:      String(row[9] || '').trim(),
          province:      String(row[10] || '').trim(),
          postal_code:   String(row[11] || '').trim(),
          channel:       String(row[2] || '').trim(),
        };

        const { data: existing } = await supabase
          .from('customers')
          .select('id')
          .eq('tel', customerData.tel)   // ← query ด้วย tel
          .maybeSingle();

        if (existing) {
          await supabase.from('customers').update(customerData).eq('tel', customerData.tel);
        } else {
          await supabase.from('customers').insert([customerData]);
        }
      }

      alert('นำเข้าข้อมูลสำเร็จ');
      loadCustomers();
    } catch (error) {
      console.error('Error importing:', error);
      alert('เกิดข้อผิดพลาดในการนำเข้าข้อมูล');
    }
  };

  const updateTag = async (customerId: string, newTag: string) => {
    try {
      await supabase.from('customers')
        .update({ tag: newTag, tag_manual: true })
        .eq('id', customerId);
      loadCustomers();
    } catch (error) {
      console.error('Error updating tag:', error);
    }
  };

  const deleteCustomer = async (id: string) => {
    if (!confirm('ยืนยันการลบลูกค้า?')) return;
    try {
      await supabase.from('customers').delete().eq('id', id);
      loadCustomers();
    } catch (error) {
      console.error('Error deleting customer:', error);
    }
  };

  if (loading) return <div className="p-6">กำลังโหลด...</div>;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800 mb-4">จัดการลูกค้า</h2>
        <div className="flex gap-3">
          <label className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2 cursor-pointer">
            <Upload size={20} /> นำเข้า Excel
            <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} className="hidden" />
          </label>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3 text-left">ชื่อ</th>
                <th className="p-3 text-left">เบอร์โทร</th>
                <th className="p-3 text-left">Facebook</th>
                <th className="p-3 text-left">ที่อยู่</th>
                <th className="p-3 text-left">ตำบล</th>
                <th className="p-3 text-left">อำเภอ</th>
                <th className="p-3 text-left">จังหวัด</th>
                <th className="p-3 text-left">ไปรษณีย์</th>
                <th className="p-3 text-left">ช่องทาง</th>
                <th className="p-3 text-left">แท็ก</th>
                <th className="p-3 text-center">ออเดอร์</th>
                <th className="p-3 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.id} className="border-b hover:bg-slate-50">
                  <td className="p-3">{c.name}</td>
                  <td className="p-3">{c.tel}</td>                       {/* ← tel */}
                  <td className="p-3">{c.facebook_name}</td>             {/* ← facebook_name */}
                  <td className="p-3 max-w-xs truncate">{c.address}</td>
                  <td className="p-3">{c.subdistrict}</td>
                  <td className="p-3">{c.district}</td>
                  <td className="p-3">{c.province}</td>
                  <td className="p-3">{c.postal_code}</td>
                  <td className="p-3">{c.channel}</td>
                  <td className="p-3">
                    <select
                      value={c.tag}
                      onChange={(e) => updateTag(c.id, e.target.value)}
                      className={'px-2 py-1 rounded text-xs ' +
                        (c.tag === 'VIP'    ? 'bg-purple-100 text-purple-800' :
                         c.tag === 'ประจำ' ? 'bg-blue-100 text-blue-800' :
                                             'bg-green-100 text-green-800')}
                    >
                      <option>ใหม่</option>
                      <option>ประจำ</option>
                      <option>VIP</option>
                    </select>
                  </td>
                  <td className="p-3 text-center">{c.order_count}</td>
                  <td className="p-3 text-center">
                    <button onClick={() => deleteCustomer(c.id)} className="text-red-600 hover:text-red-800">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {customers.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          ยังไม่มีข้อมูลลูกค้า กรุณานำเข้าข้อมูลจาก Excel
        </div>
      )}
    </div>
  );
}
