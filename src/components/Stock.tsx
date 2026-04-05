import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Package, Plus, RefreshCw, ArrowDown, ArrowUp, AlertTriangle, Search, X, ShoppingBag } from 'lucide-react';

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
  const [toast, setToast]     = useState<{ msg: string; type: 'success'|'error' } | null>(null);

  // รับเข้าสต็อก form
  const [rcvItemId,   setRcvItemId]   = useState('');
  const [rcvQty,      setRcvQty]      = useState(1);
  const [rcvNote,     setRcvNote]     = useState('');
  const [rcvRefId,    setRcvRefId]    = useState('');
  const [rcvDate,     setRcvDate]     = useState(new Date().toISOString().split('T')[0]);
  const [rcvReceiver, setRcvReceiver] = useState('');
  const [rcvApprover, setRcvApprover] = useState('');
  const [saving, setSaving]           = useState(false);

  // เพิ่มรายการใหม่
  const [showAddItem, setShowAddItem] = useState(false);
  const [newName, setNewName]   = useState('');
  const [newUnit, setNewUnit]   = useState('ชิ้น');
  const [newType, setNewType]   = useState('product');
  const [newMin, setNewMin]     = useState(0);

  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [{ data: s }, { data: t }, { data: po }] = await Promise.all([
        supabase.from('stock_current').select('*').order('type').order('name'),
        supabase.from('stock_transactions').select('*, stock_items(name,unit)')
          .order('created_at', { ascending: false }).limit(200),
        supabase.from('purchase_orders').select('*').eq('status', 'approved')
          .order('po_date', { ascending: false }),
      ]);
      if (s) setItems(s as StockItem[]);
      if (t) setTxns(t as Transaction[]);

      // แปลง PO → รายการรับเข้าทีละ item
      if (po) {
        const rows: StockInRow[] = [];
        for (const p of po) {
          for (const item of (p.items || [])) {
            rows.push({
              po_no: p.po_no, po_date: p.po_date,
              supplier_name: p.supplier_name,
              item_name: item.name, qty: item.qty,
              unit: item.unit, price: item.price,
              total: item.qty * item.price,
            });
          }
        }
        setReceivedRows(rows);
      }
    } finally { setLoading(false); }
  };

  // sync จาก products_master + boxes + bubbles
  const handleSync = async () => {
    setLoading(true);
    try {
      const [{ data: masters }, { data: boxes }, { data: bubbles }] = await Promise.all([
        supabase.from('products_master').select('id, name'),
        supabase.from('boxes').select('id, name'),
        supabase.from('bubbles').select('id, name, length_cm').gt('length_cm', 0),
      ]);

      const toUpsert: any[] = [];
      for (const m of masters || []) {
        const exists = items.find(i => i.ref_id === m.id && i.type === 'product');
        if (!exists) toUpsert.push({ name: m.name, unit: 'ชิ้น', type: 'product', ref_id: m.id, min_qty: 0 });
      }
      for (const b of boxes || []) {
        const exists = items.find(i => i.ref_id === b.id && i.type === 'box');
        if (!exists) toUpsert.push({ name: b.name, unit: 'อัน', type: 'box', ref_id: b.id, min_qty: 0 });
      }
      for (const b of bubbles || []) {
        const exists = items.find(i => i.ref_id === b.id && i.type === 'bubble');
        if (!exists) toUpsert.push({ name: `บั้บเบิ้ล ยาว ${Number(b.length_cm)} cm`, unit: 'แผ่น', type: 'bubble', ref_id: b.id, min_qty: 0 });
      }

      if (toUpsert.length > 0) {
        await supabase.from('stock_items').insert(toUpsert);
        showToast(`✓ ซิงค์แล้ว ${toUpsert.length} รายการใหม่`);
      } else {
        showToast('ไม่มีรายการใหม่ที่ต้องซิงค์', 'success');
      }
      await loadAll();
    } finally { setLoading(false); }
  };

  const handleReceive = async () => {
    if (!rcvItemId || rcvQty <= 0) return;
    setSaving(true);
    try {
      const noteStr = [
        rcvNote,
        rcvReceiver ? `ผู้รับเข้า: ${rcvReceiver}` : '',
        rcvApprover ? `ผู้อนุมัติ: ${rcvApprover}` : '',
      ].filter(Boolean).join(' | ');

      await supabase.from('stock_transactions').insert([{
        stock_item_id: rcvItemId, txn_type: 'in', qty: rcvQty,
        ref_type: 'manual', ref_id: rcvRefId || null,
        note: noteStr || null,
        created_at: new Date(rcvDate).toISOString(),
      }]);
      showToast('✓ รับเข้าสต็อกสำเร็จ');
      setRcvQty(1); setRcvNote(''); setRcvRefId('');
      setRcvReceiver(''); setRcvApprover('');
      setRcvDate(new Date().toISOString().split('T')[0]);
      await loadAll();
    } finally { setSaving(false); }
  };

  const handleUpdateMin = async (id: string, min: number) => {
    await supabase.from('stock_items').update({ min_qty: min }).eq('id', id);
    setItems(p => p.map(i => i.id === id ? { ...i, min_qty: min } : i));
  };

  const handleAddItem = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    await supabase.from('stock_items').insert([{ name: newName, unit: newUnit, type: newType, min_qty: newMin }]);
    setNewName(''); setNewUnit('ชิ้น'); setNewType('product'); setNewMin(0);
    setShowAddItem(false);
    showToast('✓ เพิ่มรายการสำเร็จ');
    await loadAll();
    setSaving(false);
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
    <div className="flex flex-col h-screen p-6 pb-2">
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
          <button onClick={handleSync} disabled={loading}
            className="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 flex items-center gap-2 text-sm">
            <RefreshCw size={13} className={loading?'animate-spin':''}/> ซิงค์จากสินค้า
          </button>
          <button onClick={onGoToPO}
            className="px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 flex items-center gap-2 text-sm">
            <ShoppingBag size={13}/> ใบสั่งซื้อ (PO)
          </button>
          <button onClick={() => setShowAddItem(true)}
            className="px-3 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 flex items-center gap-2 text-sm">
            <Plus size={13}/> เพิ่มรายการ
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
              รายการรับเข้าทั้งหมด <span className="font-semibold text-slate-700">{receivedRows.length}</span> รายการ
              (จาก PO ที่อนุมัติแล้ว)
            </p>
            <button onClick={onGoToPO}
              className="px-3 py-1.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 flex items-center gap-1.5 text-sm font-medium">
              <ShoppingBag size={13}/> สร้าง PO ใหม่
            </button>
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
                {receivedRows.length === 0 && (
                  <tr><td colSpan={8} className="p-10 text-center text-slate-400">
                    ยังไม่มีการรับเข้าสต็อก — อนุมัติ PO เพื่อรับเข้าสต็อก
                  </td></tr>
                )}
                {receivedRows.map((row, idx) => (
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
              {receivedRows.length > 0 && (
                <tfoot className="bg-slate-50 border-t-2 border-slate-200 sticky bottom-0">
                  <tr>
                    <td colSpan={4} className="p-3 text-right text-sm font-semibold text-slate-600">รวมทั้งสิ้น</td>
                    <td className="p-3 text-center font-bold text-green-600">
                      {receivedRows.reduce((s, r) => s + r.qty, 0)}
                    </td>
                    <td/>
                    <td/>
                    <td className="p-3 text-right font-bold text-slate-800">
                      ฿{receivedRows.reduce((s, r) => s + r.total, 0).toLocaleString()}
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
              {txns.length===0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">ยังไม่มีการเคลื่อนไหว</td></tr>}
              {txns.map(t => (
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
      )}

      {/* Modal เพิ่มรายการ */}
      {showAddItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">เพิ่มรายการสต็อก</h3>
              <button onClick={() => setShowAddItem(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">ชื่อ</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="ชื่อสินค้า/วัสดุ"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ประเภท</label>
                  <select value={newType} onChange={e => setNewType(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300">
                    {Object.entries(TYPE_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">หน่วย</label>
                  <input value={newUnit} onChange={e => setNewUnit(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">จำนวนขั้นต่ำ (แจ้งเตือน)</label>
                <input type="number" min={0} value={newMin} onChange={e => setNewMin(Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowAddItem(false)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm hover:bg-slate-300">ยกเลิก</button>
              <button onClick={handleAddItem} disabled={!newName.trim()||saving}
                className="flex-1 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 disabled:opacity-50 font-medium">
                เพิ่มรายการ
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
