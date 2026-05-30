import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Package, RefreshCw, ArrowDown, ArrowUp, AlertTriangle, Search, ShoppingBag, Download } from 'lucide-react';

type StockItem = {
  id: string; name: string; unit: string; type: string;
  min_qty: number; ref_id: string | null; active: boolean;
  current_qty: number; total_in: number; total_out: number;
};

type Transaction = {
  id: string; stock_item_id: string; txn_type: string;
  qty: number; ref_type: string | null; ref_id: string | null;
  note: string | null; created_at: string;
  stock_items?: { name: string; unit: string };
};

// ข้อมูลรับเข้าจาก PO
type StockInRow = {
  po_no: string; po_date: string; supplier_name: string | null;
  item_name: string; qty: number; unit: string; price: number; total: number;
};

type Tab = 'stock' | 'receive' | 'history';

const TYPE_LABEL: Record<string, string> = {
  product: 'สินค้า', box: 'กล่อง', bubble: 'บั้บเบิ้ล', other: 'อื่นๆ'
};
const TYPE_COLOR: Record<string, string> = {
  product: 'bg-cyan-100 text-cyan-700',
  box:     'bg-amber-100 text-amber-700',
  bubble:  'bg-purple-100 text-purple-700',
  other:   'bg-slate-100 text-slate-600',
};

export default function Stock({ onGoToPO }: { onGoToPO?: () => void }) {
  const [tab, setTab]             = useState<Tab>('stock');
  const [items, setItems]         = useState<StockItem[]>([]);
  const [txns, setTxns]           = useState<Transaction[]>([]);
  const [receivedRows, setReceivedRows] = useState<StockInRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [receiveSearch, setReceiveSearch] = useState('');
  const [receiveDateFrom, setReceiveDateFrom] = useState('');
  const [receiveDateTo, setReceiveDateTo] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyType, setHistoryType] = useState<'all'|'in'|'out'>('all');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [toast, setToast]     = useState<{ msg: string; type: 'success'|'error' } | null>(null);

  const [saving, setSaving]       = useState(false);
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);


  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // load เฉพาะ stock ใช้บ่อย
  const loadItems = async () => {
    const { data } = await supabase.from('stock_current').select('*').order('type').order('name');
    if (data) setItems(data as StockItem[]);
  };

  // load transactions (lazy — เฉพาะเมื่อเปิดแท็บ history)
  const loadTxns = async () => {
    setLoading(true);
    const { data } = await supabase.from('stock_transactions')
      .select('*, stock_items(name,unit)')
      .order('created_at', { ascending: false }).limit(200);
    if (data) setTxns(data as Transaction[]);
    setLoading(false);
  };

  // load PO ที่รับเข้าแล้ว (lazy — เฉพาะเมื่อเปิดแท็บ receive)
  const loadPO = async () => {
    setLoading(true);
    try {
      // เดิมใช้ status = approved ทำให้พอกดรับเข้าแล้ว PO เปลี่ยนเป็น received
      // จึงไม่แสดงในแท็บ "รับเข้าสต็อก" ทั้งที่ประวัติการเคลื่อนไหวมี transaction แล้ว
      const { data: po, error } = await supabase.from('purchase_orders')
        .select('*')
        .eq('status', 'received')
        .order('po_date', { ascending: false });

      if (error) throw error;

      const rows: StockInRow[] = [];
      for (const p of (po || [])) {
        for (const item of (p.items || [])) {
          rows.push({
            po_no: p.po_no,
            po_date: p.updated_at || p.created_at || p.po_date,
            supplier_name: p.supplier_name,
            item_name: item.name,
            qty: Number(item.qty || 0),
            unit: item.unit || '',
            price: Number(item.price || 0),
            total: Number(item.qty || 0) * Number(item.price || 0),
          });
        }
      }

      setReceivedRows(rows);
    } catch (err: any) {
      showToast('❌ โหลดรายการรับเข้าสต็อกไม่สำเร็จ: ' + (err.message || 'unknown'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await loadItems();
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  // lazy load เมื่อสลับแท็บ
  useEffect(() => {
    if (tab === 'history' && txns.length === 0) loadTxns();
    if (tab === 'receive') loadPO();
  }, [tab]);

  const filteredReceivedRows = receivedRows.filter(row => {
    const q = receiveSearch.trim().toLowerCase();
    const haystack = [
      row.po_no,
      row.supplier_name || '',
      row.item_name,
      row.unit,
    ].join(' ').toLowerCase();

    const matchText = !q || haystack.includes(q);

    const rowDate = row.po_date ? new Date(row.po_date) : null;
    const fromOk = !receiveDateFrom || (rowDate && rowDate >= new Date(receiveDateFrom + 'T00:00:00'));
    const toOk = !receiveDateTo || (rowDate && rowDate <= new Date(receiveDateTo + 'T23:59:59'));

    return matchText && fromOk && toOk;
  });

  const clearReceiveFilters = () => {
    setReceiveSearch('');
    setReceiveDateFrom('');
    setReceiveDateTo('');
  };

  const csvCell = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`;

  const exportReceivedRowsCsv = () => {
    const header = ['วันที่รับเข้า', 'เลขที่เอกสาร', 'ผู้ขาย', 'รายการสินค้า', 'จำนวน', 'หน่วย', 'ราคา/หน่วย', 'รวม'];
    const rows = filteredReceivedRows.map(row => [
      row.po_date ? new Date(row.po_date).toLocaleDateString('th-TH') : '',
      row.po_no,
      row.supplier_name || '',
      row.item_name,
      row.qty,
      row.unit,
      row.price,
      row.total,
    ]);

    const csv = [header, ...rows]
      .map(r => r.map(csvCell).join(','))
      .join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `stock-receive-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`✓ Export รายการรับเข้า ${filteredReceivedRows.length} รายการแล้ว`);
  };

  const filteredHistoryRows = txns.filter(t => {
    const q = historySearch.trim().toLowerCase();
    const itemName = (t as any).stock_items?.name || '';
    const unit = (t as any).stock_items?.unit || '';
    const haystack = [
      itemName,
      unit,
      t.ref_type || '',
      t.ref_id || '',
      t.note || '',
      t.txn_type || '',
    ].join(' ').toLowerCase();

    const matchText = !q || haystack.includes(q);
    const matchType = historyType === 'all' || t.txn_type === historyType;

    const rowDate = t.created_at ? new Date(t.created_at) : null;
    const fromOk = !historyDateFrom || (rowDate && rowDate >= new Date(historyDateFrom + 'T00:00:00'));
    const toOk = !historyDateTo || (rowDate && rowDate <= new Date(historyDateTo + 'T23:59:59'));

    return matchText && matchType && fromOk && toOk;
  });

  const clearHistoryFilters = () => {
    setHistorySearch('');
    setHistoryType('all');
    setHistoryDateFrom('');
    setHistoryDateTo('');
  };

  const exportHistoryRowsCsv = () => {
    const header = ['วันที่', 'เวลา', 'ประเภท', 'รายการ', 'จำนวน', 'หน่วย', 'อ้างอิงประเภท', 'อ้างอิงเลขที่', 'หมายเหตุ'];
    const rows = filteredHistoryRows.map(t => {
      const dt = t.created_at ? new Date(t.created_at) : null;
      return [
        dt ? dt.toLocaleDateString('th-TH') : '',
        dt ? dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '',
        t.txn_type === 'in' ? 'รับเข้า' : 'เบิกออก',
        (t as any).stock_items?.name || '',
        Number(t.qty || 0),
        (t as any).stock_items?.unit || '',
        t.ref_type || '',
        t.ref_id || '',
        t.note || '',
      ];
    });

    const csv = [header, ...rows]
      .map(r => r.map(csvCell).join(','))
      .join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `stock-history-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`✓ Export ประวัติการเคลื่อนไหว ${filteredHistoryRows.length} รายการแล้ว`);
  };

  // sync จาก products_master + boxes + bubbles (ใช้ upsert + unique constraint แทน JS loop)
  const handleSync = async () => {
    setLoading(true);
    try {
      const [{ data: masters }, { data: boxes }, { data: bubbles }] = await Promise.all([
        supabase.from('products_master').select('id, name'),
        supabase.from('boxes').select('id, name'),
        supabase.from('bubbles').select('id, name, length_cm').gt('length_cm', 0),
      ]);

      const toUpsert: any[] = [
        ...(masters || []).map(m => ({ name: m.name, unit: 'ชิ้น', type: 'product', ref_id: m.id, min_qty: 0 })),
        ...(boxes   || []).map(b => ({ name: b.name, unit: 'อัน',  type: 'box',     ref_id: b.id, min_qty: 0 })),
        ...(bubbles || []).map(b => ({ name: `บั้บเบิ้ล ยาว ${Number(b.length_cm)} cm`, unit: 'แผ่น', type: 'bubble', ref_id: b.id, min_qty: 0 })),
      ];

      // upsert โดย unique constraint (name, type) — ของที่มีอยู่แล้วจะ skip
      const { count } = await supabase.from('stock_items')
        .upsert(toUpsert, { onConflict: 'name,type', ignoreDuplicates: true })
        .select('id', { count: 'exact', head: true });

      showToast(count && count > 0 ? `✓ ซิงค์แล้ว ${count} รายการใหม่` : 'ไม่มีรายการใหม่ที่ต้องซิงค์');
      setShowSyncConfirm(false);
      await loadItems();
    } finally { setLoading(false); }
  };

  const handleUpdateMin = async (id: string, min: number) => {
    await supabase.from('stock_items').update({ min_qty: min }).eq('id', id);
    setItems(p => p.map(i => i.id === id ? { ...i, min_qty: min } : i));
  };

  const filtered = items.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase())
  );

  const lowStock  = items.filter(i => i.active && i.min_qty > 0 && i.current_qty <= i.min_qty);
  const warnStock = items.filter(i => i.active && i.min_qty > 0 && i.current_qty > i.min_qty && i.current_qty <= i.min_qty * 1.5);

  const statusBadge = (item: StockItem) => {
    if (!item.active) return null;
    if (item.min_qty > 0 && item.current_qty <= 0)              return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold">หมด!</span>;
    if (item.min_qty > 0 && item.current_qty <= item.min_qty)   return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold">🔴 ต่ำ!</span>;
    if (item.min_qty > 0 && item.current_qty <= item.min_qty*1.5) return <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold">🟡 ใกล้หมด</span>;
    if (item.min_qty > 0) return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">🟢 ปกติ</span>;
    return <span className="text-slate-300 text-xs">-</span>;
  };

  return (
    <div className="flex flex-col h-screen p-3 sm:p-6 pb-2">
      {/* Header */}
      <div className="shrink-0 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Package size={22} className="text-cyan-600"/> จัดการสต็อก
          </h2>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-sm text-slate-500">{items.length} รายการ</span>
            {lowStock.length > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold">
                <AlertTriangle size={11}/> สต็อกต่ำ {lowStock.length} รายการ!
              </span>
            )}
            {warnStock.length > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold">
                ⚠ ใกล้หมด {warnStock.length} รายการ
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowSyncConfirm(true)} disabled={loading}
            className="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 flex items-center gap-2 text-sm">
            <RefreshCw size={13} className={loading?'animate-spin':''}/> ซิงค์จากสินค้า
          </button>
</div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-4 shrink-0">
        {([['stock','สต็อกคงเหลือ'],['receive','รับเข้าสต็อก'],['history','ประวัติการเคลื่อนไหว']] as [Tab,string][]).map(([key,label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab===key?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: สต็อกคงเหลือ ── */}
      {tab === 'stock' && (
        <>
          <div className="relative mb-3 shrink-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาสินค้า..."
              className="w-full pl-8 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
          </div>
          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm w-full" style={{minWidth:'750px'}}>
              <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-left whitespace-nowrap">ประเภท</th>
                  <th className="p-3 text-left whitespace-nowrap">รายการสินค้า</th>
                  <th className="p-3 text-center whitespace-nowrap">รับเข้า</th>
                  <th className="p-3 text-center whitespace-nowrap">เบิกออก</th>
                  <th className="p-3 text-center whitespace-nowrap">คงเหลือ</th>
                  <th className="p-3 text-center whitespace-nowrap">ขั้นต่ำ</th>
                  <th className="p-3 text-center whitespace-nowrap">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length===0 && <tr><td colSpan={7} className="p-8 text-center text-slate-400">ไม่มีรายการ</td></tr>}
                {filtered.map(item => (
                  <tr key={item.id} className={`border-b hover:bg-slate-50 ${item.current_qty <= 0 && item.min_qty > 0 ? 'bg-red-50' : item.min_qty > 0 && item.current_qty <= item.min_qty ? 'bg-red-50' : item.min_qty > 0 && item.current_qty <= item.min_qty*1.5 ? 'bg-yellow-50' : ''}`}>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${TYPE_COLOR[item.type]||TYPE_COLOR.other}`}>
                        {TYPE_LABEL[item.type]||'อื่นๆ'}
                      </span>
                    </td>
                    <td className="p-3 font-medium text-slate-800 whitespace-nowrap">{item.name}</td>
                    <td className="p-3 text-center text-green-600 font-bold">{Number(item.total_in)}</td>
                    <td className="p-3 text-center text-red-500 font-bold">{Number(item.total_out)}</td>
                    <td className="p-3 text-center">
                      <span className={`text-lg font-bold ${Number(item.current_qty) <= 0 ? 'text-red-600' : Number(item.current_qty) <= item.min_qty ? 'text-red-500' : 'text-slate-800'}`}>
                        {Number(item.current_qty)}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">{item.unit}</span>
                    </td>
                    <td className="p-3 text-center">
                      <input type="number" min={0} value={item.min_qty}
                        onChange={e => handleUpdateMin(item.id, Number(e.target.value))}
                        className="w-16 text-center border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-300"/>
                    </td>
                    <td className="p-3 text-center">{statusBadge(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Tab: รับเข้าสต็อก ── */}
      {tab === 'receive' && (
        <>
          <div className="flex items-center justify-between mb-3 shrink-0 flex-wrap gap-2">
            <p className="text-sm text-slate-500">
              รายการรับเข้าแสดง <span className="font-semibold text-slate-700">{filteredReceivedRows.length}</span> / {receivedRows.length} รายการ
              (จาก PO ที่รับเข้าแล้ว)
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={exportReceivedRowsCsv} disabled={filteredReceivedRows.length === 0}
                className="px-3 py-1.5 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 flex items-center gap-1.5 text-sm font-medium disabled:opacity-50">
                <Download size={13}/> Export Excel
              </button>
              <button onClick={onGoToPO}
                className="px-3 py-1.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 flex items-center gap-1.5 text-sm font-medium">
                <ShoppingBag size={13}/> สร้าง PO ใหม่
              </button>
            </div>
          </div>

          <div className="mb-3 bg-white rounded-2xl shadow-sm border border-slate-100 p-3 shrink-0">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_170px_170px_auto] gap-2">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input value={receiveSearch} onChange={e => setReceiveSearch(e.target.value)}
                  placeholder="ค้นหาเลข PO / ผู้ขาย / รายการสินค้า..."
                  className="w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
              </div>
              <input type="date" value={receiveDateFrom} onChange={e => setReceiveDateFrom(e.target.value)}
                className="border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
              <input type="date" value={receiveDateTo} onChange={e => setReceiveDateTo(e.target.value)}
                className="border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
              <button onClick={clearReceiveFilters}
                className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 text-sm font-semibold whitespace-nowrap">
                ล้างตัวกรอง
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="px-3 py-1 rounded-full bg-green-50 text-green-700 font-bold">
                รวมจำนวน {filteredReceivedRows.reduce((sum, r) => sum + Number(r.qty || 0), 0).toLocaleString()} ชิ้น
              </span>
              <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 font-bold">
                รวมมูลค่า ฿{filteredReceivedRows.reduce((sum, r) => sum + Number(r.total || 0), 0).toLocaleString()}
              </span>
            </div>
          </div>

          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm w-full" style={{minWidth:'850px'}}>
              <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-left whitespace-nowrap">วันที่รับเข้า</th>
                  <th className="p-3 text-left whitespace-nowrap">เลขที่เอกสาร</th>
                  <th className="p-3 text-left whitespace-nowrap">ผู้ขาย</th>
                  <th className="p-3 text-left">รายการสินค้า</th>
                  <th className="p-3 text-center whitespace-nowrap">จำนวน</th>
                  <th className="p-3 text-center whitespace-nowrap">หน่วย</th>
                  <th className="p-3 text-right whitespace-nowrap">ราคา/หน่วย</th>
                  <th className="p-3 text-right whitespace-nowrap">รวม</th>
                </tr>
              </thead>
              <tbody>
                {filteredReceivedRows.length === 0 && (
                  <tr><td colSpan={8} className="p-10 text-center text-slate-400">
                    ยังไม่มีการรับเข้าสต็อก — รับเข้า PO แล้วรายการจะแสดงที่นี่
                  </td></tr>
                )}
                {filteredReceivedRows.map((row, idx) => (
                  <tr key={idx} className="border-b hover:bg-slate-50">
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(row.po_date).toLocaleDateString('th-TH')}
                    </td>
                    <td className="p-3 font-mono text-xs text-indigo-700 whitespace-nowrap">{row.po_no}</td>
                    <td className="p-3 text-sm text-slate-700 whitespace-nowrap">
                      {row.supplier_name || <span className="text-slate-300">-</span>}
                    </td>
                    <td className="p-3 font-medium text-slate-800">{row.item_name}</td>
                    <td className="p-3 text-center font-bold text-green-600">{row.qty}</td>
                    <td className="p-3 text-center text-slate-500">{row.unit}</td>
                    <td className="p-3 text-right text-slate-600">
                      {row.price > 0 ? `฿${row.price.toLocaleString()}` : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="p-3 text-right font-bold text-slate-800">
                      {row.total > 0 ? `฿${row.total.toLocaleString()}` : <span className="text-slate-300">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              {filteredReceivedRows.length > 0 && (
                <tfoot className="bg-slate-50 border-t-2 border-slate-200 sticky bottom-0">
                  <tr>
                    <td colSpan={4} className="p-3 text-right text-sm font-semibold text-slate-600">รวมทั้งสิ้น</td>
                    <td className="p-3 text-center font-bold text-green-600">
                      {filteredReceivedRows.reduce((s, r) => s + r.qty, 0)}
                    </td>
                    <td/>
                    <td/>
                    <td className="p-3 text-right font-bold text-slate-800">
                      ฿{filteredReceivedRows.reduce((s, r) => s + r.total, 0).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}

      {/* ── Tab: ประวัติ ── */}
      {tab === 'history' && (
        <>
          <div className="mb-3 bg-white rounded-2xl shadow-sm border border-slate-100 p-3 shrink-0">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_160px_160px_auto_auto] gap-2">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input value={historySearch} onChange={e => setHistorySearch(e.target.value)}
                  placeholder="ค้นหารายการ / อ้างอิง / หมายเหตุ..."
                  className="w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
              </div>
              <select value={historyType} onChange={e => setHistoryType(e.target.value as any)}
                className="border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300">
                <option value="all">ทั้งหมด</option>
                <option value="in">รับเข้า</option>
                <option value="out">เบิกออก</option>
              </select>
              <input type="date" value={historyDateFrom} onChange={e => setHistoryDateFrom(e.target.value)}
                className="border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
              <input type="date" value={historyDateTo} onChange={e => setHistoryDateTo(e.target.value)}
                className="border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
              <button onClick={clearHistoryFilters}
                className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 text-sm font-semibold whitespace-nowrap">
                ล้างตัวกรอง
              </button>
              <button onClick={exportHistoryRowsCsv} disabled={filteredHistoryRows.length === 0}
                className="px-4 py-2.5 bg-cyan-500 text-white rounded-xl hover:bg-cyan-600 text-sm font-semibold whitespace-nowrap disabled:opacity-50 flex items-center justify-center gap-1.5">
                <Download size={13}/> Export Excel
              </button>
            </div>

            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="px-3 py-1 rounded-full bg-slate-50 text-slate-700 font-bold">
                แสดง {filteredHistoryRows.length} / {txns.length} รายการ
              </span>
              <span className="px-3 py-1 rounded-full bg-green-50 text-green-700 font-bold">
                รับเข้า +{filteredHistoryRows.filter(t => t.txn_type === 'in').reduce((sum, t) => sum + Number(t.qty || 0), 0).toLocaleString()}
              </span>
              <span className="px-3 py-1 rounded-full bg-red-50 text-red-700 font-bold">
                เบิกออก -{filteredHistoryRows.filter(t => t.txn_type !== 'in').reduce((sum, t) => sum + Number(t.qty || 0), 0).toLocaleString()}
              </span>
            </div>
          </div>

          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm w-full" style={{minWidth:'700px'}}>
              <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                  <th className="p-3 text-center whitespace-nowrap">ประเภท</th>
                  <th className="p-3 text-left whitespace-nowrap">รายการ</th>
                  <th className="p-3 text-center whitespace-nowrap">จำนวน</th>
                  <th className="p-3 text-left whitespace-nowrap">อ้างอิง</th>
                  <th className="p-3 text-left whitespace-nowrap">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistoryRows.length===0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">ยังไม่มีการเคลื่อนไหวตามตัวกรอง</td></tr>}
                {filteredHistoryRows.map(t => (
                  <tr key={t.id} className={`border-b hover:bg-slate-50 ${t.txn_type==='in'?'':'bg-red-50/30'}`}>
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(t.created_at).toLocaleDateString('th-TH')}
                      <div className="text-slate-400">{new Date(t.created_at).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}</div>
                    </td>
                    <td className="p-3 text-center">
                      {t.txn_type==='in'
                        ? <span className="flex items-center justify-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold"><ArrowDown size={10}/>รับเข้า</span>
                        : <span className="flex items-center justify-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold"><ArrowUp size={10}/>เบิกออก</span>
                      }
                    </td>
                    <td className="p-3 font-medium whitespace-nowrap">{(t as any).stock_items?.name || '-'}</td>
                    <td className="p-3 text-center font-bold">
                      <span className={t.txn_type==='in'?'text-green-600':' text-red-500'}>
                        {t.txn_type==='in'?'+':'-'}{Number(t.qty)}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">{(t as any).stock_items?.unit}</span>
                    </td>
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                      {t.ref_type && <span className="text-slate-400">{t.ref_type}: </span>}
                      {t.ref_id || '-'}
                    </td>
                    <td className="p-3 text-xs text-slate-500">{t.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Popup: ยืนยันซิงค์จากสินค้า */}
      {showSyncConfirm && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl border border-cyan-100 overflow-hidden relative">
            <div className="absolute -top-16 -right-16 w-40 h-40 bg-cyan-300/30 rounded-full blur-2xl"></div>
            <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-fuchsia-300/30 rounded-full blur-2xl"></div>

            <div className="relative bg-gradient-to-br from-cyan-50 via-indigo-50 to-fuchsia-50 px-6 py-6 border-b border-cyan-100">
              <div className="absolute right-5 top-5 text-3xl">✨</div>
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-cyan-400 via-indigo-500 to-fuchsia-500 text-white flex items-center justify-center text-3xl shadow-lg mb-3">
                🔄
              </div>
              <h3 className="text-xl font-extrabold text-slate-800">ซิงค์รายการสินค้าเข้าส Stock ใช่ไหม?</h3>
              <p className="text-sm text-slate-500 mt-2 leading-6">
                ระบบจะดึงรายการจากสินค้า / กล่อง / บั้บเบิ้ล มาเพิ่มในรายการสต็อก
                โดยรายการที่มีอยู่แล้วจะไม่เพิ่มซ้ำ
              </p>
            </div>

            <div className="relative px-6 py-4">
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 text-sm text-slate-600">
                <div className="font-bold text-slate-800 mb-1">สิ่งที่จะเกิดขึ้น</div>
                <div>✅ เพิ่มรายการใหม่ที่ยังไม่มีในสต็อก</div>
                <div>✅ ไม่ลบรายการเดิม</div>
                <div>✅ ไม่เปลี่ยนยอดคงเหลือเดิม</div>
                <div>✅ ไม่แตะประวัติการเคลื่อนไหว</div>
              </div>
              <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
                ⚠️ ควรใช้เมื่อมีสินค้า/กล่อง/บั้บเบิ้ลใหม่ และต้องการให้มาแสดงในหน้าจัดการสต็อก
              </div>
            </div>

            <div className="relative px-6 pb-6 flex justify-end gap-2">
              <button onClick={() => setShowSyncConfirm(false)} disabled={loading}
                className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold disabled:opacity-50">
                ยกเลิก
              </button>
              <button onClick={handleSync} disabled={loading}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-white hover:from-cyan-600 hover:to-fuchsia-600 font-bold shadow disabled:opacity-50 flex items-center gap-2">
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
                {loading ? 'กำลังซิงค์...' : 'ยืนยันซิงค์'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl text-white text-sm font-medium ${toast.type==='success'?'bg-emerald-500':'bg-red-500'}`} style={{minWidth:'260px'}}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
