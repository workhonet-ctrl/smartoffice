import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  ShoppingBag, Plus, Trash2, Search, X, ChevronDown,
  CheckCircle, FileText, RefreshCw, User, Save, Pencil, Printer
} from 'lucide-react';

type Supplier = { id: string; name: string; tel: string | null; address: string | null; note: string | null };
type StockItem = { id: string; name: string; unit: string; type: string };
type POItem    = { key: string; stock_item_id: string | null; name: string; qty: number; unit: string; price: number };
type PO        = {
  id: string; po_no: string; po_date: string;
  supplier_id: string | null; supplier_name: string | null;
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
  const [editingPO, setEditingPO] = useState<PO | null>(null); // PO ที่กำลัง edit
  const [editSup, setEditSup]   = useState<Supplier | null>(null);
  const [supSearch, setSupSearch] = useState('');
  const [showSupListModal, setShowSupListModal] = useState(false);
  const [poStatusFilter, setPoStatusFilter] = useState<'all'|'pending_approval'|'approved'|'received'|'rejected'>('all');
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showSubmitSuccess, setShowSubmitSuccess] = useState(false);
  const [approveTarget, setApproveTarget] = useState<PO | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PO | null>(null);
  const [detailTarget, setDetailTarget] = useState<PO | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PO | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<PO | null>(null);
  const [blockedDeleteTarget, setBlockedDeleteTarget] = useState<PO | null>(null);

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

  const generateUniquePoNo = async () => {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g,'');
    const prefix = `PO-${dateStr}-`;

    const { data } = await supabase
      .from('purchase_orders')
      .select('po_no')
      .like('po_no', `${prefix}%`)
      .order('po_no', { ascending: false })
      .limit(1);

    const lastNo = data?.[0]?.po_no || '';
    const lastSeq = Number(lastNo.replace(prefix, '')) || 0;
    return `${prefix}${String(lastSeq + 1).padStart(3, '0')}`;
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
    if (editSup) {
      // แก้ไข
      const { data } = await supabase.from('suppliers').update(newSup).eq('id', editSup.id).select().single();
      if (data) {
        setSuppliers(p => p.map(s => s.id === editSup.id ? data : s));
        showToast('✓ แก้ไขผู้ขายสำเร็จ');
      }
    } else {
      // เพิ่มใหม่
      const { data } = await supabase.from('suppliers').insert([newSup]).select().single();
      if (data) {
        setSuppliers(p => [...p, data]);
        setSupplierId(data.id); setSupplierName(data.name);
        showToast('✓ เพิ่มผู้ขายสำเร็จ');
      }
    }
    setNewSup({ name:'', tel:'', address:'', note:'' });
    setEditSup(null);
    setShowSupModal(false);
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!confirm('ยืนยันลบผู้ขายนี้?')) return;
    await supabase.from('suppliers').update({ active: false }).eq('id', id);
    setSuppliers(p => p.filter(s => s.id !== id));
    showToast('✓ ลบผู้ขายแล้ว');
  };

  // ── load PO เข้า form สำหรับแก้ไข ──────────────────────────────────
  const startEditPO = (po: PO) => {
    if (po.status === 'approved' || po.status === 'received') {
      showToast('PO ที่อนุมัติแล้วหรือรับเข้าแล้ว ไม่สามารถแก้ไขได้ เพื่อป้องกันข้อมูลผิดพลาด', 'error');
      return;
    }
    setEditingPO(po);
    setPoDate(po.po_date || new Date().toISOString().split('T')[0]);
    setPoNo(po.po_no || '');
    setSupplierId(po.supplier_id || '');
    setSupplierName(po.supplier_name || '');
    setNote(po.note || '');
    const items = (po.items as POItem[]) || [];
    setPoItems(items.length > 0
      ? items.map((it, i) => ({ ...it, key: String(i+1) }))
      : [{ key:'1', stock_item_id:null, name:'', qty:1, unit:'ชิ้น', price:0 }]
    );
    setTab('create');
  };

  const cancelEditPO = () => {
    setEditingPO(null);
    setPoItems([{ key:'1', stock_item_id:null, name:'', qty:1, unit:'ชิ้น', price:0 }]);
    setSupplierId(''); setSupplierName(''); setNote('');
    setTab('list');
  };

  const validateEditPO = () => {
    if (!editingPO) return null;
    const validItems = poItems.filter(it => it.name.trim() && it.qty > 0);
    if (!validItems.length) { showToast('กรุณาเพิ่มรายการสินค้า', 'error'); return null; }
    if (editingPO.status === 'approved' || editingPO.status === 'received') {
      showToast('PO ที่อนุมัติแล้วหรือรับเข้าแล้ว ไม่สามารถแก้ไขได้', 'error');
      return null;
    }
    return validItems;
  };

  const openUpdateConfirm = () => {
    const validItems = validateEditPO();
    if (!validItems) return;
    setShowEditConfirm(true);
  };

  const handleUpdatePO = async () => {
    if (!editingPO) return;
    const validItems = validateEditPO();
    if (!validItems) return;

    const nextStatus = editingPO.status === 'rejected' ? 'pending_approval' : editingPO.status;

    setSaving(true);
    try {
      const { error } = await supabase.from('purchase_orders').update({
        po_date:       poDate,
        supplier_id:   supplierId || null,
        supplier_name: supplierName || null,
        items:         validItems,
        total_thb:     total,
        note:          note || null,
        status:        nextStatus,
      }).eq('id', editingPO.id);
      if (error) throw error;

      showToast(editingPO.status === 'rejected'
        ? '✓ บันทึกการแก้ไข และส่งกลับไปรออนุมัติแล้ว'
        : '✓ บันทึกการแก้ไขสำเร็จ');

      setShowEditConfirm(false);
      setEditingPO(null);
      setPoItems([{ key:'1', stock_item_id:null, name:'', qty:1, unit:'ชิ้น', price:0 }]);
      setSupplierId(''); setSupplierName(''); setNote('');
      await Promise.all([initPoNo(), loadData()]);
      setTab('list');
      setPoStatusFilter(nextStatus === 'pending_approval' ? 'pending_approval' : poStatusFilter);
    } catch (err: any) {
      showToast('❌ ' + (err.message||'เกิดข้อผิดพลาด'), 'error');
    } finally { setSaving(false); }
  };

  const handleDeletePO = async (po: PO) => {
    setSaving(true);
    try {
      // ถ้า approved → สร้าง transactions 'out' ย้อนคืนสต็อก
      // ปกติ approved/received จะไม่ควรลบง่าย ๆ แต่คง logic เดิมไว้เพื่อไม่กระทบของเก่า
      if (po.status === 'approved') {
        const itemsWithStock = ((po.items as any[]) || [])
          .filter(it => it.stock_item_id && it.qty > 0);

        if (itemsWithStock.length > 0) {
          const { data: validItems } = await supabase
            .from('stock_items')
            .select('id')
            .in('id', itemsWithStock.map((it: any) => it.stock_item_id));
          const validIds = new Set((validItems || []).map((v: any) => v.id));

          const reversals = itemsWithStock
            .filter((it: any) => validIds.has(it.stock_item_id))
            .map((it: any) => ({
              stock_item_id: it.stock_item_id,
              txn_type: 'out',
              qty: it.qty,
              ref_type: 'purchase_cancel',
              ref_id: po.po_no,
              note: `ยกเลิก PO ${po.po_no} - ${it.name}`,
            }));

          if (reversals.length > 0) {
            const { error: txnErr } = await supabase
              .from('stock_transactions').insert(reversals);
            if (txnErr) throw txnErr;
          }
        }
      }

      const { error } = await supabase.from('purchase_orders').delete().eq('id', po.id);
      if (error) throw error;

      const msg = po.status === 'approved'
        ? `✓ ลบ ${po.po_no} และย้อน transaction สต็อกแล้ว`
        : `✓ ลบ ${po.po_no} แล้ว`;
      showToast(msg);
      setDeleteTarget(null);
      await loadData();
    } catch (err: any) {
      showToast('❌ ลบไม่สำเร็จ: ' + (err.message || 'unknown'), 'error');
    } finally { setSaving(false); }
  };

  const validatePOForm = () => {
    const validItems = poItems.filter(it => it.name.trim() && it.qty > 0);
    if (!validItems.length) { showToast('กรุณาเพิ่มรายการสินค้า', 'error'); return null; }
    if (!supplierId && !supplierName.trim()) { showToast('กรุณาเลือกผู้ขายก่อนส่งอนุมัติ', 'error'); return null; }
    return validItems;
  };

  const openSubmitApproval = () => {
    const validItems = validatePOForm();
    if (!validItems) return;
    setShowSubmitConfirm(true);
  };

  const handleSubmitApproval = async () => {
    const validItems = validatePOForm();
    if (!validItems) return;
    setSaving(true);
    try {
      // สร้างเลข PO ใหม่ตอนกดยืนยันจริง เพื่อกันเลขซ้ำจากเลขที่ค้างอยู่บนหน้าฟอร์ม
      const nextPoNo = await generateUniquePoNo();

      let { error } = await supabase.from('purchase_orders').insert([{
        po_no: nextPoNo, po_date: poDate,
        supplier_id: supplierId || null,
        supplier_name: supplierName || null,
        items: validItems, total_thb: total,
        status: 'pending_approval', note: note || null,
      }]).select().single();

      // กันกรณีมีคนสร้างพร้อมกันพอดีจนเลขชน ให้ขอเลขใหม่แล้วลองอีกครั้ง
      if (error && String(error.message || '').includes('duplicate key')) {
        const retryPoNo = await generateUniquePoNo();
        const retry = await supabase.from('purchase_orders').insert([{
          po_no: retryPoNo, po_date: poDate,
          supplier_id: supplierId || null,
          supplier_name: supplierName || null,
          items: validItems, total_thb: total,
          status: 'pending_approval', note: note || null,
        }]).select().single();
        error = retry.error;
      }

      if (error) throw error;

      setShowSubmitConfirm(false);
      setShowSubmitSuccess(true);

      // reset form
      setPoItems([{ key:'1', stock_item_id:null, name:'', qty:1, unit:'ชิ้น', price:0 }]);
      setSupplierId(''); setSupplierName(''); setNote('');
      await Promise.all([initPoNo(), loadData()]);
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

  const handleApprovePendingPO = async () => {
    if (!approveTarget || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: 'approved' })
        .eq('id', approveTarget.id);
      if (error) throw error;

      showToast(`✓ อนุมัติ ${approveTarget.po_no} แล้ว`);
      setApproveTarget(null);
      setPoStatusFilter('approved');
      await loadData();
    } catch (err: any) {
      showToast('❌ อนุมัติไม่สำเร็จ: ' + (err.message || 'unknown'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRejectPO = async () => {
    if (!rejectTarget || saving) return;
    if (!rejectReason.trim()) {
      showToast('กรุณาระบุเหตุผลที่ไม่อนุมัติ', 'error');
      return;
    }
    setSaving(true);
    try {
      const nextNote = [
        rejectTarget.note || '',
        `ไม่อนุมัติ: ${rejectReason.trim()}`,
      ].filter(Boolean).join('\n');

      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: 'rejected', note: nextNote })
        .eq('id', rejectTarget.id);
      if (error) throw error;

      showToast(`✓ ไม่อนุมัติ ${rejectTarget.po_no} แล้ว`);
      setRejectTarget(null);
      setRejectReason('');
      setPoStatusFilter('rejected');
      await loadData();
    } catch (err: any) {
      showToast('❌ ไม่อนุมัติไม่สำเร็จ: ' + (err.message || 'unknown'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const printPurchaseOrder = (po: PO) => {
    const statusText =
      po.status === 'pending_approval' ? 'รออนุมัติ' :
      po.status === 'approved' ? 'อนุมัติแล้ว' :
      po.status === 'received' ? 'รับเข้าแล้ว' :
      po.status === 'rejected' ? 'ไม่อนุมัติ' : 'ร่าง';

    const supplier = suppliers.find(s => s.id === po.supplier_id);
    const items = (po.items || []) as POItem[];

    const itemRows = items.map((it, idx) => `
      <tr>
        <td class="center">${idx + 1}</td>
        <td>
          <div class="item-name">${escHtml(it.name || '-')}</div>
        </td>
        <td class="center">${escHtml(String(it.qty || 0))}</td>
        <td class="center">${escHtml(it.unit || '-')}</td>
        <td class="right">฿${Number(it.price || 0).toLocaleString()}</td>
        <td class="right strong">฿${Number((it.qty || 0) * (it.price || 0)).toLocaleString()}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>ใบสั่งซื้อ ${escHtml(po.po_no)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Sarabun',system-ui,sans-serif;color:#0f172a;background:white;padding:24px;font-size:13px}
    .sheet{max-width:900px;margin:0 auto;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden}
    .hero{background:linear-gradient(135deg,#111827,#7c3aed,#ec4899);color:white;padding:26px 30px;position:relative}
    .hero:after{content:"";position:absolute;right:-50px;top:-50px;width:160px;height:160px;border-radius:999px;background:rgba(255,255,255,.12)}
    h1{font-size:26px;margin-bottom:6px}
    .sub{opacity:.86;font-size:12px}
    .status{display:inline-block;margin-top:10px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:6px 12px;font-weight:800}
    .content{padding:24px 30px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}
    .card{border:1px solid #e2e8f0;border-radius:16px;padding:14px;background:#f8fafc}
    .label{font-size:11px;color:#64748b;margin-bottom:4px}
    .value{font-weight:800;color:#1e293b}
    table{width:100%;border-collapse:collapse;margin-top:12px;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden}
    th{background:#1e293b;color:white;text-align:left;padding:10px;font-size:12px}
    td{border-bottom:1px solid #e2e8f0;padding:10px;vertical-align:top}
    tr:last-child td{border-bottom:0}
    .center{text-align:center}
    .right{text-align:right}
    .strong{font-weight:900}
    .item-name{font-weight:800;color:#1e293b}
    .total-box{margin-top:16px;display:flex;justify-content:flex-end}
    .total{min-width:260px;border-radius:18px;background:linear-gradient(135deg,#fdf2f8,#eef2ff);border:1px solid #fbcfe8;padding:16px}
    .total-row{display:flex;justify-content:space-between;align-items:center}
    .total .amount{font-size:24px;font-weight:900;color:#be185d}
    .note{margin-top:16px;border-radius:16px;background:#fffbeb;border:1px solid #fde68a;padding:12px;color:#92400e;white-space:pre-wrap}
    .footer{margin-top:32px;display:flex;justify-content:space-between;gap:40px}
    .sig{flex:1;text-align:center;border-top:1px solid #94a3b8;padding-top:8px;color:#64748b;font-size:12px}
    @media print{
      body{padding:0}
      .sheet{border:0;border-radius:0;max-width:none}
      .hero{border-radius:0}
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="hero">
      <h1>ใบสั่งซื้อ (Purchase Order)</h1>
      <div class="sub">เลขที่เอกสาร: ${escHtml(po.po_no)} · วันที่: ${new Date(po.po_date).toLocaleDateString('th-TH')}</div>
      <div class="status">${escHtml(statusText)}</div>
    </div>

    <div class="content">
      <div class="grid">
        <div class="card">
          <div class="label">ผู้ขาย</div>
          <div class="value">${escHtml(po.supplier_name || '-')}</div>
          ${supplier?.tel ? `<div class="label" style="margin-top:8px">เบอร์โทร</div><div>${escHtml(supplier.tel)}</div>` : ''}
          ${supplier?.address ? `<div class="label" style="margin-top:8px">ที่อยู่</div><div>${escHtml(supplier.address)}</div>` : ''}
        </div>
        <div class="card">
          <div class="label">ข้อมูลเอกสาร</div>
          <div class="value">${escHtml(po.po_no)}</div>
          <div class="label" style="margin-top:8px">วันที่ออกเอกสาร</div>
          <div>${new Date(po.po_date).toLocaleDateString('th-TH')}</div>
          <div class="label" style="margin-top:8px">สถานะ</div>
          <div>${escHtml(statusText)}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:50px" class="center">#</th>
            <th>รายการสินค้า</th>
            <th style="width:90px" class="center">จำนวน</th>
            <th style="width:90px" class="center">หน่วย</th>
            <th style="width:120px" class="right">ราคา/หน่วย</th>
            <th style="width:130px" class="right">รวม</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div class="total-box">
        <div class="total">
          <div class="total-row">
            <div>
              <div class="label">ยอดรวมสุทธิ</div>
              <div style="font-size:12px;color:#64748b">รวม ${items.length} รายการ</div>
            </div>
            <div class="amount">฿${Number(po.total_thb || 0).toLocaleString()}</div>
          </div>
        </div>
      </div>

      ${po.note ? `<div class="note"><b>หมายเหตุ:</b><br/>${escHtml(po.note)}</div>` : ''}

      <div class="footer">
        <div class="sig">ผู้จัดทำ / ผู้สั่งซื้อ</div>
        <div class="sig">ผู้อนุมัติ</div>
        <div class="sig">ผู้รับสินค้า</div>
      </div>
    </div>
  </div>
  <script>window.onload=()=>window.print()</script>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=1000,height=700');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const handleReceivePO = async () => {
    if (!receiveTarget || saving) return;

    const itemsWithStock = ((receiveTarget.items as any[]) || [])
      .filter(it => it.stock_item_id && Number(it.qty) > 0);

    if (itemsWithStock.length === 0) {
      showToast('PO นี้ไม่มีรายการสินค้าที่ผูกกับสต็อก จึงรับเข้าไม่ได้', 'error');
      return;
    }

    setSaving(true);
    try {
      // ตรวจว่ารายการ stock_item_id ยังมีอยู่จริง
      const { data: validItems } = await supabase
        .from('stock_items')
        .select('id')
        .in('id', itemsWithStock.map((it: any) => it.stock_item_id));
      const validIds = new Set((validItems || []).map((v: any) => v.id));

      const transactions = itemsWithStock
        .filter((it: any) => validIds.has(it.stock_item_id))
        .map((it: any) => ({
          stock_item_id: it.stock_item_id,
          txn_type: 'in',
          qty: Number(it.qty),
          ref_type: 'purchase',
          ref_id: receiveTarget.po_no,
          note: `รับเข้า PO ${receiveTarget.po_no} - ${it.name}`,
        }));

      if (transactions.length === 0) {
        showToast('ไม่พบรายการสินค้าที่สามารถรับเข้าสต็อกได้', 'error');
        setSaving(false);
        return;
      }

      const { error: txnErr } = await supabase
        .from('stock_transactions')
        .insert(transactions);
      if (txnErr) throw txnErr;

      const { error: poErr } = await supabase
        .from('purchase_orders')
        .update({ status: 'received' })
        .eq('id', receiveTarget.id);
      if (poErr) throw poErr;

      showToast(`✓ รับเข้าสินค้า ${receiveTarget.po_no} แล้ว`);
      setReceiveTarget(null);
      setPoStatusFilter('received');
      await loadData();
    } catch (err: any) {
      showToast('❌ รับเข้าสินค้าไม่สำเร็จ: ' + (err.message || 'unknown'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const statusTabs = [
    { key: 'all' as const, label: 'ทั้งหมด' },
    { key: 'pending_approval' as const, label: 'รออนุมัติ' },
    { key: 'approved' as const, label: 'อนุมัติแล้ว' },
    { key: 'received' as const, label: 'รับเข้าแล้ว' },
    { key: 'rejected' as const, label: 'ไม่อนุมัติ' },
  ];

  const filteredPOList = poStatusFilter === 'all'
    ? poList
    : poList.filter(po => po.status === poStatusFilter);

  const statusCount = (status: typeof poStatusFilter) =>
    status === 'all' ? poList.length : poList.filter(po => po.status === status).length;

  const statusBadge = (s: string) => {
    if (s === 'pending_approval') {
      return <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-bold">⏳ รออนุมัติ</span>;
    }
    if (s === 'approved') {
      return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">✓ อนุมัติแล้ว</span>;
    }
    if (s === 'received') {
      return <span className="px-2 py-0.5 bg-cyan-100 text-cyan-700 rounded-full text-xs font-bold">📦 รับเข้าแล้ว</span>;
    }
    if (s === 'rejected') {
      return <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-xs font-bold">ไม่อนุมัติ</span>;
    }
    return <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold">ร่าง</span>;
  };


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
          <button onClick={() => setShowSupListModal(true)}
            className="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 flex items-center gap-2 text-sm">
            <User size={13}/> จัดการผู้ขาย
          </button>
          <button onClick={() => {
              setEditingPO(null);
              setPoItems([{ key:'1', stock_item_id:null, name:'', qty:1, unit:'ชิ้น', price:0 }]);
              setSupplierId(''); setSupplierName(''); setNote('');
              initPoNo();
              setTab('create');
            }} disabled={tab==='create' && !editingPO}
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
          {/* banner เมื่อ edit mode */}
          {editingPO && (
            <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
              <Pencil size={15}/>
              <span>
                กำลังแก้ไข <strong>{editingPO.po_no}</strong>
                {editingPO.status === 'rejected'
                  ? ' — เมื่อบันทึกแล้วจะส่งกลับไปรออนุมัติ'
                  : ' — กดบันทึกการแก้ไขเมื่อเสร็จสิ้น'}
              </span>
              <button onClick={cancelEditPO} className="ml-auto text-xs text-amber-500 hover:text-amber-700 flex items-center gap-1">
                <X size={12}/> ยกเลิก
              </button>
            </div>
          )}
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
            {editingPO ? (
              <>
                <button onClick={cancelEditPO} disabled={saving}
                  className="px-5 py-2.5 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-300 font-medium flex items-center gap-2 disabled:opacity-50">
                  <X size={16}/> ยกเลิก
                </button>
                <button onClick={openUpdateConfirm} disabled={saving}
                  className="px-6 py-2.5 bg-gradient-to-r from-amber-400 to-pink-500 text-white rounded-xl hover:from-amber-500 hover:to-pink-600 font-semibold flex items-center gap-2 disabled:opacity-50 shadow">
                  <Save size={18}/> {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </button>
              </>
            ) : (
              <>
                <button onClick={openSubmitApproval} disabled={saving}
                  className="px-6 py-2.5 bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white rounded-xl hover:from-fuchsia-600 hover:to-indigo-600 font-semibold flex items-center gap-2 disabled:opacity-50 shadow">
                  <CheckCircle size={18}/> {saving ? 'กำลังส่ง...' : 'ส่งอนุมัติ'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: รายการ PO ── */}
      {tab === 'list' && (
        <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
          <div className="sticky top-0 z-20 bg-white border-b px-4 py-3">
            <div className="flex items-center gap-2 overflow-x-auto">
              {statusTabs.map(t => (
                <button key={t.key} onClick={() => setPoStatusFilter(t.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                    poStatusFilter === t.key
                      ? 'bg-indigo-500 text-white shadow'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}>
                  {t.label}
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
                    poStatusFilter === t.key ? 'bg-white/20 text-white' : 'bg-white text-slate-500'
                  }`}>
                    {statusCount(t.key)}
                  </span>
                </button>
              ))}
            </div>
          </div>
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
              {filteredPOList.length===0 && <tr><td colSpan={7} className="p-8 text-center text-slate-400">ยังไม่มีใบสั่งซื้อในสถานะนี้</td></tr>}
              {filteredPOList.map(po => (
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
                    <div className="flex items-center justify-center gap-1.5">
                      {(po.status === 'pending_approval' || po.status === 'rejected' || po.status === 'draft') && (
                        <button onClick={() => startEditPO(po)}
                          className="flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs hover:bg-amber-200 font-medium">
                          <Pencil size={11}/> แก้ไข
                        </button>
                      )}
                      <button onClick={() => setDetailTarget(po)}
                        className="flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs hover:bg-slate-200 font-medium">
                        <FileText size={11}/> ดูรายละเอียด
                      </button>
                      <button onClick={() => printPurchaseOrder(po)}
                        className="flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs hover:bg-indigo-200 font-medium">
                        <Printer size={11}/> พิมพ์
                      </button>
                      {po.status === 'pending_approval' && (
                        <>
                          <button onClick={() => setApproveTarget(po)}
                            className="px-3 py-1 bg-green-500 text-white rounded-lg text-xs hover:bg-green-600 font-bold">
                            อนุมัติ
                          </button>
                          <button onClick={() => { setRejectTarget(po); setRejectReason(''); }}
                            className="px-3 py-1 bg-rose-100 text-rose-600 rounded-lg text-xs hover:bg-rose-200 font-bold">
                            ไม่อนุมัติ
                          </button>
                        </>
                      )}
                      {po.status === 'approved' && (
                        <button onClick={() => setReceiveTarget(po)}
                          className="px-3 py-1 bg-cyan-500 text-white rounded-lg text-xs hover:bg-cyan-600 font-bold">
                          รับเข้าสินค้า
                        </button>
                      )}
                      <button onClick={() => po.status === 'received' ? setBlockedDeleteTarget(po) : setDeleteTarget(po)}
                        className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium ${
                          po.status === 'received'
                            ? 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            : 'bg-red-100 text-red-600 hover:bg-red-200'
                        }`}>
                        <Trash2 size={11}/> ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Popup: รับเข้าสินค้า */}
      {receiveTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border-2 border-cyan-100 overflow-hidden">
            <div className="bg-gradient-to-br from-cyan-50 via-emerald-50 to-lime-50 px-6 py-6 border-b border-cyan-100 relative">
              <div className="absolute right-5 top-5 text-3xl">✨</div>
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-cyan-400 via-emerald-500 to-lime-400 text-white flex items-center justify-center text-3xl shadow-lg mb-3">
                📦
              </div>
              <h3 className="text-xl font-extrabold text-slate-800">ยืนยันรับเข้าสินค้า</h3>
              <p className="text-sm text-slate-500 mt-2 leading-6">
                เมื่อยืนยัน ระบบจะบันทึกรายการสินค้าเข้าสต็อก และเปลี่ยนสถานะ PO เป็น <b className="text-cyan-700">รับเข้าแล้ว</b>
              </p>
            </div>

            <div className="px-6 py-4">
              <div className="rounded-2xl bg-cyan-50/70 border border-cyan-100 p-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-slate-400">เลขที่เอกสาร</span><b className="font-mono text-cyan-700">{receiveTarget.po_no}</b></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-slate-400">ผู้ขาย</span><b>{receiveTarget.supplier_name || '-'}</b></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-slate-400">ยอดรวม</span><b>฿{Number(receiveTarget.total_thb).toLocaleString()}</b></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-slate-400">จำนวนรายการ</span><b>{receiveTarget.items.length} รายการ</b></div>
              </div>

              <div className="mt-3 rounded-2xl border border-slate-100 overflow-hidden max-h-44 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800 text-white sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">สินค้า</th>
                      <th className="px-3 py-2 text-center">จำนวน</th>
                      <th className="px-3 py-2 text-center">หน่วย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiveTarget.items.map((it, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium text-slate-700">{it.name}</td>
                        <td className="px-3 py-2 text-center font-bold">{it.qty}</td>
                        <td className="px-3 py-2 text-center text-slate-500">{it.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
                ⚠️ หลังรับเข้าแล้ว ไม่ควรแก้ไขรายการ PO เพื่อป้องกันยอดสต็อกคลาดเคลื่อน
              </div>
            </div>

            <div className="px-6 pb-6 flex justify-end gap-2">
              <button onClick={() => setReceiveTarget(null)} disabled={saving}
                className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold disabled:opacity-50">
                ยกเลิก
              </button>
              <button onClick={handleReceivePO} disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-white hover:from-cyan-600 hover:to-emerald-600 font-bold shadow disabled:opacity-50">
                {saving ? 'กำลังรับเข้า...' : 'ยืนยันรับเข้า'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup: ห้ามลบ PO ที่รับเข้าแล้ว */}
      {blockedDeleteTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl border border-fuchsia-200 overflow-hidden relative">
            <div className="absolute -top-16 -right-16 w-40 h-40 bg-fuchsia-300/30 rounded-full blur-2xl"></div>
            <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-amber-300/30 rounded-full blur-2xl"></div>

            <div className="relative bg-gradient-to-br from-slate-950 via-fuchsia-900 to-rose-800 px-6 py-7 text-white">
              <div className="absolute right-5 top-5 text-3xl">💎</div>
              <div className="w-16 h-16 rounded-3xl bg-white/15 border border-white/20 backdrop-blur text-white flex items-center justify-center text-3xl shadow-xl mb-4">
                👑
              </div>
              <h3 className="text-xl font-extrabold">ไม่สามารถลบ PO ที่รับเข้าแล้วได้</h3>
              <p className="text-sm text-white/80 mt-2 leading-6">
                ใบสั่งซื้อนี้ถูกบันทึกรับเข้าสต็อกแล้ว เพื่อป้องกันยอดสต็อกผิดพลาดและป้องกันการแก้ไขย้อนหลัง ระบบจึงไม่อนุญาตให้ลบรายการนี้
              </p>
            </div>

            <div className="relative px-6 py-5 bg-gradient-to-br from-white via-fuchsia-50 to-amber-50">
              <div className="rounded-2xl bg-white/90 border border-fuchsia-100 shadow-sm p-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-slate-400">เลขที่เอกสาร</span><b className="font-mono text-fuchsia-700">{blockedDeleteTarget.po_no}</b></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-slate-400">ผู้ขาย</span><b>{blockedDeleteTarget.supplier_name || '-'}</b></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-slate-400">ยอดรวม</span><b>฿{Number(blockedDeleteTarget.total_thb).toLocaleString()}</b></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-slate-400">สถานะ</span><span>{statusBadge(blockedDeleteTarget.status)}</span></div>
              </div>

              <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                ✨ ถ้ารับเข้าผิด ควรใช้ขั้นตอน “ปรับสต็อก/คืนรายการ” แยกต่างหาก เพื่อให้มีประวัติการเคลื่อนไหวครบถ้วน
              </div>
            </div>

            <div className="relative px-6 pb-6 flex justify-end">
              <button onClick={() => setBlockedDeleteTarget(null)}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-rose-500 text-white hover:from-fuchsia-600 hover:to-rose-600 font-bold shadow">
                เข้าใจแล้ว
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup: ยืนยันลบ PO */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border-2 border-rose-100 overflow-hidden">
            <div className="bg-gradient-to-br from-rose-50 via-pink-50 to-amber-50 px-6 py-6 border-b border-rose-100 relative">
              <div className="absolute right-5 top-5 text-3xl">🌟</div>
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-rose-400 via-pink-500 to-orange-400 text-white flex items-center justify-center text-3xl shadow-lg mb-3">
                🧸
              </div>
              <h3 className="text-xl font-extrabold text-slate-800">แน่ใจหรือไม่ที่จะลบใบสั่งซื้อนี้?</h3>
              <p className="text-sm text-slate-500 mt-2 leading-6">
                หากกดยืนยัน ระบบจะลบใบสั่งซื้อนี้ออกจากรายการ
                {deleteTarget.status === 'approved'
                  ? ' และจะทำรายการย้อนสต็อกตาม logic เดิมของระบบ'
                  : ''}
              </p>
            </div>

            <div className="px-6 py-4">
              <div className="rounded-2xl bg-rose-50/70 border border-rose-100 p-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-slate-400">เลขที่เอกสาร</span><b className="font-mono text-rose-700">{deleteTarget.po_no}</b></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-slate-400">ผู้ขาย</span><b>{deleteTarget.supplier_name || '-'}</b></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-slate-400">ยอดรวม</span><b>฿{Number(deleteTarget.total_thb).toLocaleString()}</b></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-slate-400">สถานะ</span><span>{statusBadge(deleteTarget.status)}</span></div>
              </div>
              <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
                ⚠️ การลบเป็นการนำรายการออกจากระบบ ควรใช้เฉพาะกรณีสร้างผิดหรือไม่ต้องการเอกสารนี้แล้ว
              </div>
            </div>

            <div className="px-6 pb-6 flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} disabled={saving}
                className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold disabled:opacity-50">
                ยกเลิก
              </button>
              <button onClick={() => handleDeletePO(deleteTarget)} disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-white hover:from-rose-600 hover:to-pink-600 font-bold shadow disabled:opacity-50">
                {saving ? 'กำลังลบ...' : 'ยืนยันลบ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup: ยืนยันบันทึกการแก้ไข */}
      {showEditConfirm && editingPO && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border-2 border-pink-100 overflow-hidden">
            <div className="bg-gradient-to-br from-pink-50 via-amber-50 to-fuchsia-50 px-6 py-6 border-b border-pink-100 relative">
              <div className="absolute right-5 top-5 text-3xl">🌈</div>
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-pink-400 via-fuchsia-500 to-indigo-500 text-white flex items-center justify-center text-3xl shadow-lg mb-3">
                🎀
              </div>
              <h3 className="text-xl font-extrabold text-slate-800">
                {editingPO.status === 'rejected' ? 'ส่งกลับไปรออนุมัติอีกครั้ง' : 'บันทึกการแก้ไขใบสั่งซื้อ'}
              </h3>
              <p className="text-sm text-slate-500 mt-2 leading-6">
                {editingPO.status === 'rejected'
                  ? 'แก้ไขข้อมูลใบสั่งซื้อเรียบร้อยแล้วใช่ไหม? หากกดยืนยัน ใบสั่งซื้อนี้จะถูกส่งกลับไปที่แท็บ “รออนุมัติ” เพื่อให้ตรวจสอบใหม่อีกครั้ง'
                  : 'ตรวจสอบข้อมูลที่แก้ไขเรียบร้อยแล้วใช่ไหม? หากกดยืนยัน ระบบจะบันทึกข้อมูลล่าสุดของใบสั่งซื้อนี้'}
              </p>
            </div>

            <div className="px-6 py-4">
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-slate-400">เลขที่เอกสาร</span><b className="font-mono text-indigo-700">{editingPO.po_no}</b></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-slate-400">ผู้ขาย</span><b>{supplierName || '-'}</b></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-slate-400">ยอดรวม</span><b>฿{total.toLocaleString()}</b></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-slate-400">สถานะหลังบันทึก</span><b className={editingPO.status === 'rejected' ? 'text-orange-600' : 'text-slate-700'}>
                  {editingPO.status === 'rejected' ? 'รออนุมัติ' : 'ยังอยู่รออนุมัติ'}
                </b></div>
              </div>
            </div>

            <div className="px-6 pb-6 flex justify-end gap-2">
              <button onClick={() => setShowEditConfirm(false)} disabled={saving}
                className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold disabled:opacity-50">
                ยกเลิก
              </button>
              <button onClick={handleUpdatePO} disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-indigo-500 text-white hover:from-pink-600 hover:to-indigo-600 font-bold shadow disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : (editingPO.status === 'rejected' ? 'ยืนยันส่งกลับรออนุมัติ' : 'ยืนยันบันทึก')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup: ส่งอนุมัติ */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border-2 border-pink-100 overflow-hidden">
            <div className="bg-gradient-to-br from-pink-50 via-fuchsia-50 to-indigo-50 px-6 py-5 border-b border-pink-100">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-400 to-indigo-500 text-white flex items-center justify-center text-2xl shadow mb-3">
                💌
              </div>
              <h3 className="text-xl font-extrabold text-slate-800">ส่งใบสั่งซื้อเพื่อรออนุมัติ</h3>
              <p className="text-sm text-slate-500 mt-1 leading-6">
                ตรวจสอบข้อมูลเรียบร้อยแล้วใช่ไหม? หากกดยืนยัน ใบสั่งซื้อนี้จะถูกส่งไปที่แท็บ <b className="text-orange-600">รออนุมัติ</b>
              </p>
            </div>
            <div className="px-6 py-4 bg-white">
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-slate-400">เลขที่เอกสาร</span><b className="font-mono text-indigo-700">{poNo}</b></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-slate-400">ผู้ขาย</span><b>{supplierName || '-'}</b></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-slate-400">ยอดรวม</span><b>฿{total.toLocaleString()}</b></div>
              </div>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-2">
              <button onClick={() => setShowSubmitConfirm(false)} disabled={saving}
                className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold disabled:opacity-50">
                ยกเลิก
              </button>
              <button onClick={handleSubmitApproval} disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-indigo-500 text-white hover:from-pink-600 hover:to-indigo-600 font-bold shadow disabled:opacity-50">
                {saving ? 'กำลังส่ง...' : 'ยืนยันส่งอนุมัติ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup: ส่งอนุมัติสำเร็จ */}
      {showSubmitSuccess && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl border-2 border-emerald-100 overflow-hidden text-center">
            <div className="bg-gradient-to-br from-emerald-50 via-cyan-50 to-pink-50 px-6 py-7">
              <div className="text-5xl mb-3">🎉</div>
              <h3 className="text-xl font-extrabold text-slate-800">ส่งอนุมัติเรียบร้อยแล้ว</h3>
              <p className="text-sm text-slate-500 mt-2">ใบสั่งซื้อถูกส่งไปที่แท็บ “รออนุมัติ” แล้ว</p>
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => setShowSubmitSuccess(false)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold">
                ปิด
              </button>
              <button onClick={() => { setShowSubmitSuccess(false); setTab('list'); setPoStatusFilter('pending_approval'); }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:from-emerald-600 hover:to-cyan-600 font-bold shadow">
                ไปที่รออนุมัติ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup: ดูรายละเอียด PO */}
      {detailTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border-2 border-indigo-100 overflow-hidden">
            <div className="bg-gradient-to-br from-indigo-50 via-cyan-50 to-pink-50 px-6 py-5 border-b border-indigo-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-3xl mb-2">📄</div>
                  <h3 className="text-xl font-extrabold text-slate-800">รายละเอียดใบสั่งซื้อ</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    {detailTarget.po_no} · {statusBadge(detailTarget.status)}
                  </p>
                </div>
                <button onClick={() => setDetailTarget(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={22}/>
                </button>
              </div>
            </div>

            <div className="p-6 max-h-[65vh] overflow-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
                  <div className="text-xs text-slate-400">ผู้ขาย</div>
                  <div className="font-bold text-slate-800">{detailTarget.supplier_name || '-'}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
                  <div className="text-xs text-slate-400">วันที่</div>
                  <div className="font-bold text-slate-800">{new Date(detailTarget.po_date).toLocaleDateString('th-TH')}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
                  <div className="text-xs text-slate-400">ยอดรวม</div>
                  <div className="font-bold text-indigo-700">฿{Number(detailTarget.total_thb).toLocaleString()}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800 text-white text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left">รายการ</th>
                      <th className="px-3 py-2 text-center">จำนวน</th>
                      <th className="px-3 py-2 text-center">หน่วย</th>
                      <th className="px-3 py-2 text-right">ราคา/หน่วย</th>
                      <th className="px-3 py-2 text-right">รวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailTarget.items.map((it, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium text-slate-800">{it.name}</td>
                        <td className="px-3 py-2 text-center">{it.qty}</td>
                        <td className="px-3 py-2 text-center">{it.unit}</td>
                        <td className="px-3 py-2 text-right">฿{Number(it.price).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-bold">฿{Number(it.qty * it.price).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {detailTarget.note && (
                <div className="mt-4 rounded-2xl bg-amber-50 border border-amber-100 p-3 text-sm text-amber-800 whitespace-pre-wrap">
                  <div className="font-bold mb-1">หมายเหตุ</div>
                  {detailTarget.note}
                </div>
              )}
            </div>

            <div className="px-6 pb-6 flex justify-end">
              <button onClick={() => setDetailTarget(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold">
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup: อนุมัติ PO */}
      {approveTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border-2 border-emerald-100 overflow-hidden">
            <div className="bg-gradient-to-br from-emerald-50 via-cyan-50 to-lime-50 px-6 py-6 border-b border-emerald-100">
              <div className="text-5xl mb-3">✅</div>
              <h3 className="text-xl font-extrabold text-slate-800">อนุมัติใบสั่งซื้อนี้ใช่ไหม</h3>
              <p className="text-sm text-slate-500 mt-2 leading-6">
                เมื่ออนุมัติแล้ว ใบสั่งซื้อนี้จะย้ายไปที่แท็บ <b className="text-emerald-600">อนุมัติแล้ว</b><br/>
                และจะยัง <b className="text-rose-500">ไม่รับเข้าสต็อก</b> จนกว่าจะทำขั้นตอนรับสินค้าในรอบถัดไป
              </p>
            </div>
            <div className="px-6 py-4">
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-slate-400">เลขที่เอกสาร</span><b className="font-mono text-indigo-700">{approveTarget.po_no}</b></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-slate-400">ผู้ขาย</span><b>{approveTarget.supplier_name || '-'}</b></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-slate-400">ยอดรวม</span><b>฿{Number(approveTarget.total_thb).toLocaleString()}</b></div>
              </div>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-2">
              <button onClick={() => setApproveTarget(null)} disabled={saving}
                className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold disabled:opacity-50">
                ยกเลิก
              </button>
              <button onClick={handleApprovePendingPO} disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:from-emerald-600 hover:to-cyan-600 font-bold shadow disabled:opacity-50">
                {saving ? 'กำลังอนุมัติ...' : 'อนุมัติ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup: ไม่อนุมัติ PO */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border-2 border-rose-100 overflow-hidden">
            <div className="bg-gradient-to-br from-rose-50 via-pink-50 to-amber-50 px-6 py-6 border-b border-rose-100">
              <div className="text-5xl mb-3">💬</div>
              <h3 className="text-xl font-extrabold text-slate-800">ไม่อนุมัติใบสั่งซื้อนี้ใช่ไหม</h3>
              <p className="text-sm text-slate-500 mt-2 leading-6">
                กรุณาระบุเหตุผล เพื่อให้ผู้สร้างแก้ไขได้ถูกต้อง รายการจะย้ายไปแท็บ <b className="text-rose-600">ไม่อนุมัติ</b>
              </p>
            </div>
            <div className="px-6 py-4">
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 text-sm mb-3">
                <div className="flex justify-between gap-3"><span className="text-slate-400">เลขที่เอกสาร</span><b className="font-mono text-indigo-700">{rejectTarget.po_no}</b></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-slate-400">ผู้ขาย</span><b>{rejectTarget.supplier_name || '-'}</b></div>
              </div>
              <label className="text-xs font-bold text-slate-500 block mb-1.5">เหตุผลที่ไม่อนุมัติ</label>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                placeholder="เช่น ราคาไม่ตรง / จำนวนไม่ถูก / ขอแก้ไขรายการ..."
                className="w-full min-h-[110px] rounded-2xl border border-rose-100 bg-rose-50/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"/>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-2">
              <button onClick={() => { setRejectTarget(null); setRejectReason(''); }} disabled={saving}
                className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold disabled:opacity-50">
                ยกเลิก
              </button>
              <button onClick={handleRejectPO} disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-white hover:from-rose-600 hover:to-pink-600 font-bold shadow disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : 'ยืนยันไม่อนุมัติ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: จัดการผู้ขาย */}
      {showSupListModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <User size={18} className="text-indigo-500"/> รายชื่อผู้ขาย
                <span className="text-sm font-normal text-slate-400">{suppliers.length} ราย</span>
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={() => { setEditSup(null); setNewSup({ name:'', tel:'', address:'', note:'' }); setShowSupModal(true); }}
                  className="px-3 py-1.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 flex items-center gap-1.5 text-sm">
                  <Plus size={13}/> เพิ่มผู้ขายใหม่
                </button>
                <button onClick={() => setShowSupListModal(false)} className="text-slate-400 hover:text-slate-600 ml-1"><X size={20}/></button>
              </div>
            </div>
            {/* Search */}
            <div className="px-6 py-3 border-b shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input value={supSearch} onChange={e => setSupSearch(e.target.value)}
                  placeholder="ค้นหาชื่อผู้ขาย..."
                  className="w-full pl-8 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"/>
              </div>
            </div>
            {/* List */}
            <div className="flex-1 overflow-auto">
              <table className="text-sm w-full">
                <thead className="bg-slate-50 text-slate-500 text-xs sticky top-0 border-b">
                  <tr>
                    <th className="px-4 py-3 text-center w-10">#</th>
                    <th className="px-4 py-3 text-left">ชื่อบริษัท / ผู้ขาย</th>
                    <th className="px-4 py-3 text-left whitespace-nowrap">เบอร์โทร</th>
                    <th className="px-4 py-3 text-left">ที่อยู่</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">PO</th>
                    <th className="px-4 py-3 text-center w-28">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.filter(s => !supSearch || s.name.toLowerCase().includes(supSearch.toLowerCase())).length === 0 && (
                    <tr><td colSpan={6} className="p-8 text-center text-slate-400">ยังไม่มีผู้ขาย</td></tr>
                  )}
                  {suppliers
                    .filter(s => !supSearch || s.name.toLowerCase().includes(supSearch.toLowerCase()))
                    .map((s, idx) => {
                      const poCount = poList.filter(p => p.supplier_id === s.id || p.supplier_name === s.name).length;
                      return (
                        <tr key={s.id} className="border-b hover:bg-slate-50">
                          <td className="px-4 py-3 text-center text-slate-400 text-xs">{idx + 1}</td>
                          <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{s.name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{s.tel || <span className="text-slate-300">-</span>}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px] truncate">{s.address || <span className="text-slate-300">-</span>}</td>
                          <td className="px-4 py-3 text-center">
                            {poCount > 0
                              ? <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold">{poCount} PO</span>
                              : <span className="text-slate-300 text-xs">-</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={() => {
                                setEditSup(s);
                                setNewSup({ name:s.name, tel:s.tel||'', address:s.address||'', note:s.note||'' });
                                setShowSupModal(true);
                              }} className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg">
                                แก้ไข
                              </button>
                              <button onClick={() => handleDeleteSupplier(s.id)}
                                className="px-2.5 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-500 rounded-lg">
                                ลบ
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal เพิ่ม/แก้ไขผู้ขาย */}
      {showSupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">{editSup ? 'แก้ไขผู้ขาย' : 'เพิ่มผู้ขายใหม่'}</h3>
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
                {editSup ? 'บันทึกการแก้ไข' : 'เพิ่มผู้ขาย'}
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
