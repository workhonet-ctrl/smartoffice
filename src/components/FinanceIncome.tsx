import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw } from 'lucide-react';

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type IncomeTab = 'cod' | 'transfer' | 'all';

export default function FinanceIncome() {
  const [tab, setTab]           = useState<IncomeTab>('cod');
  const [orders, setOrders]     = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState('');

  const loadOrders = async () => {
    setLoading(true); setSelected(new Set());
    let q = supabase.from('orders')
      .select('id, order_no, order_date, total_thb, payment_method, payment_status, order_status, customers(name, tel), raw_prod, tracking_no')
      .in('order_status', ['ส่งสินค้าแล้ว', 'ส่งไปรษณีย์', 'กำลังแพ็ค', 'แพ็คสินค้า'])
      .order('order_date', { ascending: false });

    if (tab === 'cod')      q = q.eq('payment_method', 'COD');
    if (tab === 'transfer') q = q.neq('payment_method', 'COD');

    const { data } = await q;
    setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => { loadOrders(); }, [tab]);

  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSel = orders.length > 0 && orders.every(o => selected.has(o.id));
  const toggleAll = () => setSelected(allSel ? new Set() : new Set(orders.map(o => o.id)));

  const markPaid = async () => {
    if (!selected.size) return;
    setSaving(true);
    await supabase.from('orders').update({ payment_status: 'ชำระแล้ว' }).in('id', Array.from(selected));
    setMsg(`✓ อัพเดต ${selected.size} รายการ`);
    setTimeout(() => setMsg(''), 3000);
    await loadOrders();
    setSaving(false);
  };

  const totWaiting = orders.filter(o => o.payment_status !== 'ชำระแล้ว').reduce((s, o) => s + (o.total_thb || 0), 0);
  const totPaid    = orders.filter(o => o.payment_status === 'ชำระแล้ว').reduce((s, o) => s + (o.total_thb || 0), 0);
  const cntWaiting = orders.filter(o => o.payment_status !== 'ชำระแล้ว').length;
  const cntPaid    = orders.filter(o => o.payment_status === 'ชำระแล้ว').length;

  const TABS: { key: IncomeTab; label: string }[] = [
    { key: 'cod',      label: '💵 COD' },
    { key: 'transfer', label: '🏦 โอนเงิน' },
    { key: 'all',      label: '📋 ทั้งหมด' },
  ];

  return (
    <div className="flex flex-col h-screen p-6 pb-2">
      {/* Header */}
      <div className="shrink-0 mb-4">
        <h2 className="text-2xl font-bold text-slate-800">💰 รายรับ</h2>
        <p className="text-sm text-slate-400 mt-0.5">จัดการรายรับและสถานะการชำระเงิน</p>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-4">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition ${tab === t.key ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="shrink-0 grid grid-cols-2 gap-3 mb-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div className="text-xs text-yellow-700 font-semibold mb-1">รอรับเงิน</div>
          <div className="text-2xl font-bold text-yellow-800">฿{fmt(totWaiting)}</div>
          <div className="text-xs text-yellow-600 mt-0.5">{cntWaiting} รายการ</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="text-xs text-green-700 font-semibold mb-1">รับเงินแล้ว</div>
          <div className="text-2xl font-bold text-green-800">฿{fmt(totPaid)}</div>
          <div className="text-xs text-green-600 mt-0.5">{cntPaid} รายการ</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 mb-3 flex-wrap">
        <button onClick={loadOrders} disabled={loading}
          className="px-3 py-2 bg-white border rounded-lg text-xs hover:bg-slate-50 flex items-center gap-1.5 shadow-sm">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''}/> รีเฟรช
        </button>
        {msg && <span className="text-xs text-green-600 font-medium">{msg}</span>}
        {selected.size > 0 && (
          <button onClick={markPaid} disabled={saving}
            className="ml-auto px-5 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 disabled:opacity-50">
            ✓ รับเงินแล้ว ({selected.size} รายการ)
          </button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
        <table className="text-sm w-full" style={{minWidth:'800px'}}>
          <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
            <tr>
              <th className="p-3 w-8">
                <input type="checkbox" checked={allSel} onChange={toggleAll} className="rounded"/>
              </th>
              <th className="p-3 text-left whitespace-nowrap">วันที่</th>
              <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
              <th className="p-3 text-left whitespace-nowrap">ลูกค้า</th>
              <th className="p-3 text-left whitespace-nowrap">เบอร์</th>
              <th className="p-3 text-left">สินค้า</th>
              <th className="p-3 text-center whitespace-nowrap">วิธีชำระ</th>
              <th className="p-3 text-right whitespace-nowrap">ยอด (บาท)</th>
              <th className="p-3 text-center whitespace-nowrap">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="p-8 text-center text-slate-400">กำลังโหลด...</td></tr>}
            {!loading && orders.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-400">ไม่มีข้อมูล</td></tr>}
            {orders.map(o => {
              const paid = o.payment_status === 'ชำระแล้ว';
              return (
                <tr key={o.id} onClick={() => !paid && toggle(o.id)}
                  className={`border-b ${paid ? 'bg-green-50 opacity-70' : selected.has(o.id) ? 'bg-yellow-50' : 'hover:bg-slate-50 cursor-pointer'}`}>
                  <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                    {!paid && <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} className="rounded"/>}
                  </td>
                  <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                    {o.order_date ? o.order_date.split('-').reverse().join('/') : '-'}
                  </td>
                  <td className="p-3 font-mono text-xs text-blue-600 whitespace-nowrap">{o.order_no}</td>
                  <td className="p-3 font-medium whitespace-nowrap">{o.customers?.name || '-'}</td>
                  <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{o.customers?.tel || '-'}</td>
                  <td className="p-3 text-xs text-slate-500 max-w-[200px] truncate">{o.raw_prod || '-'}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${o.payment_method === 'COD' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                      {o.payment_method || '-'}
                    </span>
                  </td>
                  <td className="p-3 text-right font-bold text-slate-800">฿{fmt(o.total_thb || 0)}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${paid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {paid ? '✓ รับแล้ว' : 'รอรับเงิน'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
