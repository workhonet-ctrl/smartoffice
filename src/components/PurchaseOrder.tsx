import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  ShoppingBag, Plus, Trash2, Search, X, ChevronDown,
  CheckCircle, FileText, RefreshCw, User
} from 'lucide-react';

type Supplier = { id: string; name: string; tel: string | null; address: string | null; note: string | null };
type StockItem = { id: string; name: string; unit: string; type: string };
type POItem    = { key: string; stock_item_id: string | null; name: string; qty: number; unit: string; price: number };
type PO        = {
  id: string; po_no: string; po_date: string; supplier_name: string | null;
  items: POItem[]; total_thb: number; status: string; note: string | null;
};

// SearchableDropdown
function SearchDrop({ options, value, onChange, placeholder, onAdd }:
  { options: { id: string; label: string; sub?: string }[]; value: string;
    onChange: (id: string, label: string, sub?: string) => void;
    placeholder: string; onAdd?: () => void }) {
  const [open, setOpen]   = useState(false);
  const [q, setQ]         = useState('');
  const ref               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()) || (o.sub||'').toLowerCase().includes(q.toLowerCase()));
  const selected = options.find(o => o.id === value);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer hover:border-cyan-400 bg-white text-sm">
        <span className={`flex-1 ${selected ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        {value && <button onClick={e => { e.stopPropagation(); onChange('',''); setQ(''); }} className="text-slate-300 hover:text-slate-600"><X size={14}/></button>}
        <ChevronDown size={14} className="text-slate-400 shrink-0"/>
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b">
            <input autoFocus value={q} onChange={e => setQ(e.target.value)}
              placeholder="ค้นหา..." className="w-full px-2 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-300"/>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && <div className="p-3 text-center text-sm text-slate-400">ไม่พบรายการ</div>}
            {filtered.map(o => (
              <div key={o.id} onClick={() => { onChange(o.id, o.label, o.sub); setOpen(false); setQ(''); }}
                className="px-3 py-2 hover:bg-cyan-50 cursor-pointer">
                <div className="text-sm font-medium text-slate-800">{o.label}</div>
                {o.sub && <div className="text-xs text-slate-400">{o.sub}</div>}
              </div>
            ))}
          </div>
          {onAdd && (
            <div onClick={() => { setOpen(false); onAdd(); }}
              className="p-2 border-t flex items-center gap-2 text-cyan-600 hover:bg-cyan-50 cursor-pointer text-sm font-medium">
              <Plus size={14}/> เพิ่มผู้ขายใหม่
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PurchaseOrder() {
  const [tab, setTab]       = useState<'create'|'list'>('create');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [poList, setPoList] = useState<PO[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [poDate, setPoDate]     = useState(new Date().toISOString().split('T')[0]);
  const [poNo, setPoNo]         = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [note, setNote]         = useState('');
  const [poItems, setPoItems]   = useState<POItem[]>([{ key:'1', stock_item_id:null, name:'', qty:1, unit:'ชิ้น', price:0 }]);
  const [saving, setSaving]     = useState(false);

  // Supplier modal
  const [showSupModal, setShowSupModal] = useState(false);
  const [newSup, setNewSup]     = useState({ name:'', tel:'', address:'', note:'' });

  const [toast, setToast]       = useState<{ msg: string; type: 'success'|'error' } | null>(null);

  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => { loadData(); initPoNo(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [{ data: s }, { data: si }, { data: po }] = await Promise.all([
      supabase.from('suppliers').select('*').eq('active', true).order('name'),
      supabase.from('stock_items').select('id,name,unit,type').eq('active', true).order('name'),
      supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    if (s) setSuppliers(s);
    if (si) setStockItems(si);
    if (po) setPoList(po as PO[]);
    setLoading(false);
  };

  const initPoNo = async () => {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g,'');
    const { count } = await supabase.from('purchase_orders')
      .select('*', { count:'exact', head:true }).like('po_no', `PO-${dateStr}%`);
    setPoNo(`PO-${dateStr}-${String((count||0)+1).padStart('3','0')}`);
  };

  const supplierOpts = suppliers.map(s => ({ id: s.id, label: s.name, sub: s.tel || '' }));
  const stockOpts    = stockItems.map(s => ({ id: s.id, label: s.name, sub: s.unit }));

  const addRow    = () => setPoItems(p => [...p, { key: String(Date.now()), stock_item_id:null, name:'', qty:1, unit:'ชิ้น', price:0 }]);
  const removeRow = (key: string) => setPoItems(p => p.filter(it => it.key !== key));
  const updateRow = (key: string, field: keyof POItem, val: any) =>
    setPoItems(p => p.map(it => it.key===key ? {...it, [field]: val} : it));

  const total = poItems.reduce((s, it) => s + (it.qty * it.price), 0);

  const handleAddSupplier = async () => {
    if (!newSup.name.trim()) return;
    const { data } = await supabase.from('suppliers').insert([newSup]).select().single();
    if (data) {
      setSuppliers(p => [...p, data]);
      setSupplierId(data.id); setSupplierName(data.name);
      showToast('✓ เพิ่มผู้ขายสำเร็จ');
    }
    setNewSup({ name:'', tel:'', address:'', note:'' });
    setShowSupModal(false);
  };

  const handleApprove = async () => {
    const validItems = poItems.filter(it => it.name.trim() && it.qty > 0);
    if (!validItems.length) { showToast('กรุณาเพิ่มรายการสินค้า', 'error'); return; }
    setSaving(true);
    try {
      const { data: po, error } = await supabase.from('purchase_orders').insert([{
        po_no: poNo, po_date: poDate,
        supplier_id: supplierId || null,
        supplier_name: supplierName || null,
        items: validItems, total_thb: total,
        status: 'approved', note: note || null,
      }]).select().single();
      if (error) throw error;

      // รับเข้าสต็อกอัตโนมัติ
      for (const item of validItems) {
        if (item.stock_item_id) {
          await supabase.from('stock_transactions').insert([{
            stock_item_id: item.stock_item_id,
            txn_type: 'in', qty: item.qty,
            ref_type: 'purchase', ref_id: po.po_no,
            note: `PO ${po.po_no} - ${item.name}`,
          }]);
        }
      }

      showToast(`✓ อนุมัติ ${poNo} และรับเข้าสต็อกแล้ว`);
      // reset form
      setPoItems([{ key:'1', stock_item_id:null, name:'', qty:1, unit:'ชิ้น', price:0 }]);
      setSupplierId(''); setSupplierName(''); setNote('');
      await Promise.all([initPoNo(), loadData()]);
      setTab('list');
    } catch (err: any) {
      showToast('❌ ' + (err.message||'เกิดข้อผิดพลาด'), 'error');
    } finally { setSaving(false); }
  };

  const handleDraft = async () => {
    const validItems = poItems.filter(it => it.name.trim() && it.qty > 0);
    if (!validItems.length) { showToast('กรุณาเพิ่มรายการสินค้า', 'error'); return; }
    setSaving(true);
    try {
      await supabase.from('purchase_orders').insert([{
        po_no: poNo, po_date: poDate,
        supplier_id: supplierId || null, supplier_name: supplierName || null,
        items: validItems, total_thb: total, status: 'draft', note: note || null,
      }]);
      showToast('✓ บันทึกร่างสำเร็จ');
      setPoItems([{ key:'1', stock_item_id:null, name:'', qty:1, unit:'ชิ้น', price:0 }]);
      setSupplierId(''); setSupplierName(''); setNote('');
      await Promise.all([initPoNo(), loadData()]);
    } catch (err: any) {
      showToast('❌ ' + (err.message||'เกิดข้อผิดพลาด'), 'error');
    } finally { setSaving(false); }
  };

  // Approve draft PO
  const handleApproveDraft = async (po: PO) => {
    for (const item of po.items) {
      if (item.stock_item_id) {
        await supabase.from('stock_transactions').insert([{
          stock_item_id: item.stock_item_id, txn_type: 'in', qty: item.qty,
          ref_type: 'purchase', ref_id: po.po_no,
          note: `PO ${po.po_no} - ${item.name}`,
        }]);
      }
    }
    await supabase.from('purchase_orders').update({ status: 'approved' }).eq('id', po.id);
    showToast('✓ อนุมัติและรับเข้าสต็อกแล้ว');
    loadData();
  };

  const statusBadge = (s: string) => s === 'approved'
    ? <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">✓ อนุมัติแล้ว</span>
    : <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold">ร่าง</span>;

  return (
    <div className="flex flex-col h-screen p-6 pb-2">
      {/* Header */}
      <div className="shrink-0 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center">
            <ShoppingBag size={20} className="text-white"/>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">ใบสั่งซื้อ (PO)</h2>
            <p className="text-sm text-slate-500">{poList.length} รายการ · ผู้ขาย {suppliers.length} ราย</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowSupModal(true)}
            className="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 flex items-center gap-2 text-sm">
            <User size={13}/> จัดการผู้ขาย
          </button>
          <button onClick={() => { setTab('create'); }} disabled={tab==='create'}
            className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 flex items-center gap-2 text-sm disabled:opacity-50">
            <Plus size={13}/> สร้าง PO ใหม่
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-4 shrink-0">
        {([['create','สร้างใบสั่งซื้อ'],['list','รายการ PO']] as ['create'|'list',string][]).map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab===k?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ── Tab: สร้างใบสั่งซื้อ ── */}
      {tab === 'create' && (
        <div className="flex-1 overflow-auto min-h-0 space-y-4">
          {/* Info Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">เลขที่เอกสาร</label>
                <div className="border rounded-lg px-3 py-2 bg-slate-50 flex justify-between items-center">
                  <span className="font-mono text-sm font-bold text-indigo-700">{poNo}</span>
                  <span className="text-xs text-slate-400">อัตโนมัติ</span>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">วันที่ออก <span className="text-red-400">*</span></label>
                <input type="date" value={poDate} onChange={e => setPoDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 text-indigo-600 font-medium"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">หมายเหตุ</label>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="ระบุหมายเหตุ (ถ้ามี)"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"/>
              </div>
            </div>
          </div>

          {/* Supplier */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-700 flex items-center gap-2"><User size={15}/> ข้อมูลผู้ขาย</h3>
              <button onClick={() => setShowSupModal(true)} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                <Plus size={12}/> เพิ่มผู้ขายใหม่
              </button>
            </div>
            <SearchDrop
              options={supplierOpts} value={supplierId}
              onChange={(id, label) => { setSupplierId(id); setSupplierName(label); }}
              placeholder="ค้นหาหรือเลือกผู้ขาย..."
              onAdd={() => setShowSupModal(true)}
            />
            {supplierId && (() => {
              const s = suppliers.find(x => x.id === supplierId);
              if (!s) return null;
              return (
                <div className="mt-3 p-3 bg-indigo-50 rounded-lg text-xs text-slate-600 space-y-0.5">
                  {s.tel && <div>📞 {s.tel}</div>}
                  {s.address && <div>📍 {s.address}</div>}
                  {s.note && <div>📝 {s.note}</div>}
                </div>
              );
            })()}
          </div>

          {/* Items */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                <FileText size={15}/> รายการสินค้า
                <span className="text-xs text-slate-400 font-normal">{poItems.length} รายการ</span>
              </h3>
              <button onClick={addRow} className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 flex items-center gap-1.5">
                <Plus size={13}/> เพิ่มรายการ
              </button>
            </div>

            <div className="space-y-3">
              {/* Header */}
              <div className="grid text-xs font-semibold text-slate-500 uppercase px-1" style={{gridTemplateColumns:'2fr 90px 90px 120px 100px 32px'}}>
                <div>สินค้า / บริการ</div>
                <div className="text-center">จำนวน</div>
                <div className="text-center">หน่วย</div>
                <div className="text-right">ราคา/หน่วย</div>
                <div className="text-right">รวม</div>
                <div/>
              </div>

              {poItems.map((item, idx) => (
                <div key={item.key} className="grid gap-2 items-center" style={{gridTemplateColumns:'2fr 90px 90px 120px 100px 32px'}}>
                  {/* สินค้า */}
                  <div>
                    {item.stock_item_id ? (
                      <div className="flex items-center gap-1 border rounded-lg px-3 py-2 bg-cyan-50 border-cyan-200">
                        <span className="flex-1 text-sm font-medium text-slate-800 truncate">{item.name}</span>
                        <button onClick={() => updateRow(item.key, 'stock_item_id', null)} className="text-slate-300 hover:text-red-500"><X size={13}/></button>
                      </div>
                    ) : (
                      <SearchDrop
                        options={stockOpts} value={''}
                        onChange={(id, label, unit) => {
                          updateRow(item.key, 'stock_item_id', id||null);
                          updateRow(item.key, 'name', label);
                          if (unit) updateRow(item.key, 'unit', unit);
                        }}
                        placeholder={`รายการที่ ${idx+1}...`}
                      />
                    )}
                    {!item.stock_item_id && (
                      <input value={item.name} onChange={e => updateRow(item.key,'name',e.target.value)}
                        placeholder="หรือพิมพ์ชื่อสินค้าเอง..."
                        className="mt-1 w-full border-b border-dashed border-slate-300 text-xs px-1 focus:outline-none focus:border-indigo-400 bg-transparent"/>
                    )}
                  </div>
                  {/* จำนวน */}
                  <input type="number" min={1} value={item.qty} onChange={e => updateRow(item.key,'qty',Number(e.target.value))}
                    className="text-center border rounded-lg px-2 py-2 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-300"/>
                  {/* หน่วย */}
                  <input value={item.unit} onChange={e => updateRow(item.key,'unit',e.target.value)}
                    className="text-center border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"/>
                  {/* ราคา/หน่วย */}
                  <input type="number" min={0} value={item.price} onChange={e => updateRow(item.key,'price',Number(e.target.value))}
                    className="text-right border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"/>
                  {/* รวม */}
                  <div className="text-right text-sm font-bold text-slate-700">
                    ฿{(item.qty * item.price).toLocaleString()}
                  </div>
                  {/* ลบ */}
                  <button onClick={() => removeRow(item.key)} disabled={poItems.length===1}
                    className="text-red-400 hover:text-red-600 disabled:opacity-20 flex justify-center">
                    <Trash2 size={15}/>
                  </button>
                </div>
              ))}

              {/* Total */}
              <div className="border-t-2 border-slate-200 pt-3 flex justify-end items-center gap-4">
                <span className="text-sm text-slate-500 font-semibold">ยอดรวมทั้งสิ้น</span>
                <span className="text-2xl font-bold text-slate-800">฿{total.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pb-4">
            <button onClick={handleDraft} disabled={saving}
              className="px-5 py-2.5 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-300 font-medium flex items-center gap-2 disabled:opacity-50">
              <FileText size={16}/> บันทึกร่าง
            </button>
            <button onClick={handleApprove} disabled={saving}
              className="px-6 py-2.5 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 font-semibold flex items-center gap-2 disabled:opacity-50 shadow">
              <CheckCircle size={18}/> {saving ? 'กำลังบันทึก...' : 'อนุมัติ → รับเข้าสต็อก'}
            </button>
          </div>
        </div>
      )}

      {/* ── Tab: รายการ PO ── */}
      {tab === 'list' && (
        <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
          <table className="text-sm w-full" style={{minWidth:'750px'}}>
            <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
              <tr>
                <th className="p-3 text-left whitespace-nowrap">เลขที่</th>
                <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                <th className="p-3 text-left whitespace-nowrap">ผู้ขาย</th>
                <th className="p-3 text-left">สินค้า</th>
                <th className="p-3 text-right whitespace-nowrap">ยอดรวม</th>
                <th className="p-3 text-center whitespace-nowrap">สถานะ</th>
                <th className="p-3 text-center whitespace-nowrap">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {poList.length===0 && <tr><td colSpan={7} className="p-8 text-center text-slate-400">ยังไม่มีใบสั่งซื้อ</td></tr>}
              {poList.map(po => (
                <tr key={po.id} className="border-b hover:bg-slate-50">
                  <td className="p-3 font-mono text-xs text-indigo-700 whitespace-nowrap">{po.po_no}</td>
                  <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                    {new Date(po.po_date).toLocaleDateString('th-TH')}
                  </td>
                  <td className="p-3 font-medium whitespace-nowrap">{po.supplier_name || <span className="text-slate-300">-</span>}</td>
                  <td className="p-3 text-xs text-slate-500 max-w-[200px]">
                    <div className="space-y-0.5">
                      {po.items.slice(0,3).map((it, i) => (
                        <div key={i} className="truncate">{it.name} <span className="text-slate-400">×{it.qty} {it.unit}</span></div>
                      ))}
                      {po.items.length > 3 && <div className="text-slate-400">+{po.items.length-3} รายการ</div>}
                    </div>
                  </td>
                  <td className="p-3 text-right font-bold text-slate-800 whitespace-nowrap">
                    ฿{Number(po.total_thb).toLocaleString()}
                  </td>
                  <td className="p-3 text-center">{statusBadge(po.status)}</td>
                  <td className="p-3 text-center">
                    {po.status === 'draft' && (
                      <button onClick={() => handleApproveDraft(po)}
                        className="px-3 py-1 bg-green-500 text-white rounded-lg text-xs hover:bg-green-600 font-medium">
                        อนุมัติ
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal เพิ่มผู้ขาย */}
      {showSupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">เพิ่มผู้ขาย</h3>
              <button onClick={() => setShowSupModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            <div className="space-y-3">
              {[['name','ชื่อบริษัท/ผู้ขาย *','ชื่อผู้ขาย...'],['tel','เบอร์โทร','090-xxx-xxxx'],['address','ที่อยู่','ที่อยู่...'],['note','หมายเหตุ','บันทึกเพิ่มเติม...']] .map(([f,l,p]) => (
                <div key={f}>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">{l}</label>
                  <input value={(newSup as any)[f]} onChange={e => setNewSup(prev => ({...prev,[f]:e.target.value}))}
                    placeholder={p}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"/>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowSupModal(false)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm hover:bg-slate-300">ยกเลิก</button>
              <button onClick={handleAddSupplier} disabled={!newSup.name.trim()}
                className="flex-1 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 font-medium">
                เพิ่มผู้ขาย
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] px-5 py-4 rounded-xl shadow-2xl text-white text-sm font-medium ${toast.type==='success'?'bg-emerald-500':'bg-red-500'}`} style={{minWidth:'280px'}}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
