import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Package, Plus, RefreshCw, ArrowDown, ArrowUp, AlertTriangle, Search, X, ShoppingBag, PackagePlus } from 'lucide-react';

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

  // รับเข้าสต็อก form (simplified)
  const [rcvItemId, setRcvItemId] = useState('');
  const [rcvQty,    setRcvQty]    = useState(1);
  const [rcvNote,   setRcvNote]   = useState('');
  const [rcvRefId,  setRcvRefId]  = useState('');
  const [rcvDate,   setRcvDate]   = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving]       = useState(false);

  // Popup รับสต็อกเริ่มต้น
  const [showInitStock, setShowInitStock] = useState(false);
  const [initTab, setInitTab]   = useState<'box'|'bubble'|'product'>('product');
  const [initRows, setInitRows] = useState<Record<string, { qty: number; price: number; selected: boolean }>>({});
  const [bulkPrice, setBulkPrice] = useState('');
  const [initSaving, setInitSaving] = useState(false);

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

  // load PO (lazy — เฉพาะเมื่อเปิดแท็บ receive)
  const loadPO = async () => {
    setLoading(true);
    const { data: po } = await supabase.from('purchase_orders')
      .select('*').eq('status', 'approved')
      .order('po_date', { ascending: false });
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
    setLoading(false);
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
    if (tab === 'receive' && receivedRows.length === 0) loadPO();
  }, [tab]);

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
      await loadItems();
    } finally { setLoading(false); }
  };

  const handleReceive = async () => {
    if (!rcvItemId || rcvQty <= 0) return;
    setSaving(true);
    try {
      await supabase.from('stock_transactions').insert([{
        stock_item_id: rcvItemId, txn_type: 'in', qty: rcvQty,
        ref_type: 'manual', ref_id: rcvRefId || null,
        note: rcvNote || null,
        created_at: new Date(rcvDate).toISOString(),
      }]);
      showToast('✓ รับเข้าสต็อกสำเร็จ');
      setRcvQty(1); setRcvNote(''); setRcvRefId('');
      setRcvDate(new Date().toISOString().split('T')[0]);
      await loadItems(); // โหลดแค่ stock ไม่ต้องโหลด txn/PO ทั้งหมด
    } finally { setSaving(false); }
  };

  // ── เปิด popup รับสต็อกเริ่มต้น ──────────────────────────────
  const handleOpenInitStock = async () => {
    // ดึง promo quantities จาก orders เพื่อ pre-fill จำนวน
    const rows: Record<string, { qty: number; price: number; selected: boolean }> = {};
    items.forEach(it => { rows[it.id] = { qty: 0, price: 0, selected: false }; });

    try {
      // นับจาก orders แพ็คแล้วทั้งหมด via products_promo → stock_items
      const { data: promos } = await supabase
        .from('products_promo')
        .select('id, short_name')
        .eq('active', true);

      // นับ order_count ต่อ promo_id จาก orders
      const { data: orders } = await supabase
        .from('orders')
        .select('promo_ids, quantities')
        .in('order_status', ['แพ็คสินค้า', 'ส่งสินค้าแล้ว']);

      // สร้าง map: short_name → total qty ที่เบิกออกไปแล้ว
      const promoQtyMap: Record<string, number> = {};
      (orders || []).forEach((o: any) => {
        const ids = o.promo_ids || [];
        const qtys = String(o.quantities || '').split('|').map((q: string) => Number(q) || 1);
        ids.forEach((pid: string, i: number) => {
          promoQtyMap[pid] = (promoQtyMap[pid] || 0) + (qtys[i] || 1);
        });
      });

      // map promo → stock_item via short_name
      (promos || []).forEach((p: any) => {
        const si = items.find(it => it.type === 'product' && it.name === p.short_name);
        if (si && promoQtyMap[p.id]) {
          rows[si.id] = {
            ...rows[si.id],
            qty: (rows[si.id].qty || 0) + promoQtyMap[p.id],
            selected: true,
          };
        }
      });
    } catch (e) { /* ignore — ยังคงเปิด popup ได้ */ }

    setInitRows(rows);
    setBulkPrice('');
    setInitTab('product'); // เริ่มที่ tab สินค้าก่อนเพราะมี data
    setShowInitStock(true);
  };

  const handleSaveInitStock = async () => {
    const toInsert = items
      .filter(it => initRows[it.id]?.selected && (initRows[it.id]?.qty || 0) > 0)
      .map(it => ({
        stock_item_id: it.id,
        txn_type: 'in',
        qty: initRows[it.id].qty,
        ref_type: 'initial',
        ref_id: 'initial_stock',
        note: `สต็อกเริ่มต้น${initRows[it.id].price > 0 ? ` ราคา ฿${initRows[it.id].price}/หน่วย` : ''}`,
      }));

    if (toInsert.length === 0) { showToast('กรุณาเลือกรายการและกรอกจำนวน', 'error'); return; }

    setInitSaving(true);
    try {
      const { error } = await supabase.from('stock_transactions').insert(toInsert);
      if (error) throw error;
      showToast(`✓ บันทึกสต็อกเริ่มต้น ${toInsert.length} รายการแล้ว`);
      setShowInitStock(false);
      await loadItems();
    } catch (err: any) {
      showToast('❌ ' + (err.message || 'unknown'), 'error');
    } finally { setInitSaving(false); }
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
          <button onClick={handleSync} disabled={loading}
            className="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 flex items-center gap-2 text-sm">
            <RefreshCw size={13} className={loading?'animate-spin':''}/> ซิงค์จากสินค้า
          </button>
          <button onClick={onGoToPO}
            className="px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 flex items-center gap-2 text-sm">
            <ShoppingBag size={13}/> ใบสั่งซื้อ (PO)
          </button>
          <button onClick={handleOpenInitStock}
            className="px-3 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 flex items-center gap-2 text-sm">
            <PackagePlus size={13}/> รับสต็อกเริ่มต้น
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

      {/* ── Modal: รับสต็อกเริ่มต้น ─────────────────────────────────── */}
      {showInitStock && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <PackagePlus size={20} className="text-emerald-600"/> รับสต็อกเริ่มต้น
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  🧴 สินค้า: pre-filled จากออเดอร์ที่แพ็คไปแล้ว — 📦 กล่อง/บั้บเบิ้ล: กรอกเอง
                </p>
              </div>
              <button onClick={() => setShowInitStock(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X size={18}/>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-6 pt-4 shrink-0">
              {(['box','bubble','product'] as const).map(t => {
                const labels = { box: '📦 กล่อง', bubble: '🫧 บั้บเบิ้ล', product: '🧴 สินค้า' };
                const cnt = items.filter(it => it.type === t && initRows[it.id]?.selected).length;
                return (
                  <button key={t} onClick={() => setInitTab(t)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5
                      ${initTab === t ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {labels[t]}
                    {cnt > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${initTab===t?'bg-white text-emerald-700':'bg-emerald-100 text-emerald-700'}`}>{cnt}</span>}
                  </button>
                );
              })}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-slate-500">ราคาเดียวกัน:</span>
                <input type="number" min={0} step={0.1}
                  value={bulkPrice}
                  onChange={e => setBulkPrice(e.target.value)}
                  placeholder="ราคา/หน่วย"
                  className="border rounded-lg px-2 py-1.5 text-xs w-28 focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
                <button
                  onClick={() => {
                    const price = parseFloat(bulkPrice) || 0;
                    const tabItems = items.filter(it => it.type === initTab && initRows[it.id]?.selected);
                    if (tabItems.length === 0) { showToast('เลือกรายการก่อน', 'error'); return; }
                    setInitRows(prev => {
                      const next = { ...prev };
                      tabItems.forEach(it => { next[it.id] = { ...next[it.id], price }; });
                      return next;
                    });
                  }}
                  className="px-3 py-1.5 bg-slate-700 text-white rounded-lg text-xs hover:bg-slate-800 whitespace-nowrap">
                  ใส่ให้ที่เลือก
                </button>
              </div>
            </div>

            {/* Select all */}
            <div className="px-6 py-2 shrink-0 flex items-center gap-3 border-b">
              <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
                <input type="checkbox"
                  checked={items.filter(it => it.type === initTab).every(it => initRows[it.id]?.selected)}
                  onChange={e => {
                    const tabItems = items.filter(it => it.type === initTab);
                    setInitRows(prev => {
                      const next = { ...prev };
                      tabItems.forEach(it => { next[it.id] = { ...next[it.id], selected: e.target.checked }; });
                      return next;
                    });
                  }}
                  className="rounded cursor-pointer"/>
                เลือกทั้งหมดใน tab นี้
              </label>
              <span className="text-xs text-slate-400">
                เลือกแล้ว {Object.values(initRows).filter(r => r.selected).length} รายการ
                จากทั้งหมด {items.length} รายการ
              </span>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto px-6 py-2">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white border-b">
                  <tr>
                    <th className="py-2 w-8"/>
                    <th className="py-2 text-left text-xs text-slate-500 font-medium">ชื่อ</th>
                    <th className="py-2 text-center text-xs text-slate-500 font-medium w-24">หน่วย</th>
                    <th className="py-2 text-center text-xs text-slate-500 font-medium w-32">จำนวน *</th>
                    <th className="py-2 text-center text-xs text-slate-500 font-medium w-36">ราคา/หน่วย (฿)</th>
                  </tr>
                </thead>
                <tbody>
                  {items
                    .filter(it => it.type === initTab)
                    .map(it => {
                      const row = initRows[it.id] || { qty: 0, price: 0, selected: false };
                      return (
                        <tr key={it.id} className={`border-b transition ${row.selected ? 'bg-emerald-50/60' : 'hover:bg-slate-50'}`}>
                          <td className="py-2 text-center">
                            <input type="checkbox" checked={row.selected}
                              onChange={e => setInitRows(prev => ({
                                ...prev,
                                [it.id]: { ...prev[it.id], selected: e.target.checked }
                              }))}
                              className="rounded cursor-pointer"/>
                          </td>
                          <td className="py-2 font-medium text-slate-800">{it.name}</td>
                          <td className="py-2 text-center text-slate-500 text-xs">{it.unit}</td>
                          <td className="py-2 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <input type="number" min={0}
                                value={row.qty || ''}
                                onChange={e => setInitRows(prev => ({
                                  ...prev,
                                  [it.id]: { ...prev[it.id], qty: Number(e.target.value) || 0, selected: Number(e.target.value) > 0 ? true : prev[it.id].selected }
                                }))}
                                placeholder="0"
                                className={`border rounded-lg px-2 py-1 text-center text-sm w-24 focus:outline-none focus:ring-2 focus:ring-emerald-300
                                  ${row.selected && !row.qty ? 'border-red-300 bg-red-50' : row.qty > 0 && initTab === 'product' ? 'border-emerald-300 bg-emerald-50' : ''}`}/>
                              {initTab === 'product' && row.qty > 0 && (
                                <span className="text-[9px] text-emerald-600">จากออเดอร์</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 text-center">
                            <input type="number" min={0} step={0.01}
                              value={row.price || ''}
                              onChange={e => setInitRows(prev => ({
                                ...prev,
                                [it.id]: { ...prev[it.id], price: parseFloat(e.target.value) || 0 }
                              }))}
                              placeholder="0.00"
                              className="border rounded-lg px-2 py-1 text-center text-sm w-28 focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
                          </td>
                        </tr>
                      );
                    })
                  }
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex items-center justify-between shrink-0">
              <div className="text-sm text-slate-500">
                รายการที่กรอกจำนวนแล้ว:{' '}
                <span className="font-bold text-emerald-600">
                  {Object.values(initRows).filter(r => r.selected && r.qty > 0).length} รายการ
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowInitStock(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-medium">
                  ยกเลิก
                </button>
                <button onClick={handleSaveInitStock} disabled={initSaving}
                  className="px-6 py-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
                  <PackagePlus size={16}/>
                  {initSaving ? 'กำลังบันทึก...' : 'บันทึกสต็อกเริ่มต้น'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
