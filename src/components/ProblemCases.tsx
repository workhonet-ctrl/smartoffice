import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, Search, ChevronDown, ChevronRight, Send, CheckCircle, RotateCcw, Truck, MessageSquare } from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────
type ProblemOrder = {
  id: string;
  order_no: string;
  order_date: string;
  raw_prod: string | null;
  total_thb: number;
  tracking_no: string | null;
  parcel_status: string | null;
  order_status: string | null;
  followed_at: string | null;
  followed_by: string | null;
  customer_id: string;
  customers: { id: string; name: string; tel: string; facebook_name: string | null; tag: string | null } | null;
};

type Followup = {
  id: string;
  order_id: string;
  note: string;
  created_by: string | null;
  created_at: string;
};

// ตีกลับ และ ส่งคืน ไม่ดึงมา — สินค้ากลับมาแล้ว ติดตามไม่ได้
const PROBLEM_STATUSES = ['ค้างอยู่คลัง', 'ไม่มีคนรับ', 'ปัญหา'];

const STATUS_STYLE: Record<string, string> = {
  'ตีกลับ':        'bg-red-100 text-red-700',
  'ส่งคืน':        'bg-red-100 text-red-700',
  'ไม่มีคนรับ':   'bg-amber-100 text-amber-700',
  'ค้างอยู่คลัง': 'bg-amber-100 text-amber-700',
  'ปัญหา':         'bg-orange-100 text-orange-700',
};

const TAG_STYLE: Record<string, string> = {
  'VIP':   'bg-amber-100 text-amber-800',
  'ประจำ': 'bg-purple-100 text-purple-700',
  'ใหม่':  'bg-blue-100 text-blue-700',
};

function fmtDT(iso: string) {
  return new Date(iso).toLocaleString('th-TH', {
    day:'2-digit', month:'2-digit', year:'2-digit',
    hour:'2-digit', minute:'2-digit',
  });
}

// ─── Component ─────────────────────────────────────────────
export default function ProblemCases() {
  const [orders,      setOrders]      = useState<ProblemOrder[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [filterStatus,setFilterStatus]= useState('');
  const [filterFollowed, setFilterFollowed] = useState<'all'|'yes'|'no'>('all');
  const [expanded,    setExpanded]    = useState<string | null>(null);
  const [followups,   setFollowups]   = useState<Record<string, Followup[]>>({});
  const [noteInput,   setNoteInput]   = useState<Record<string, string>>({});
  const [saving,      setSaving]      = useState<string | null>(null);
  const [toast,       setToast]       = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  // ─── Load problem orders ──────────────────────────────────
  const loadOrders = useCallback(async () => {
    setLoading(true);
    const [{ data: byParcel }, { data: byOrder }] = await Promise.all([
      supabase.from('orders')
        .select('id, order_no, order_date, raw_prod, total_thb, tracking_no, parcel_status, order_status, followed_at, followed_by, customer_id, customers(id,name,tel,facebook_name,tag)')
        .in('parcel_status', PROBLEM_STATUSES)
        .order('order_date', { ascending: false }),
      supabase.from('orders')
        .select('id, order_no, order_date, raw_prod, total_thb, tracking_no, parcel_status, order_status, followed_at, followed_by, customer_id, customers(id,name,tel,facebook_name,tag)')
        .in('order_status', PROBLEM_STATUSES)
        .not('parcel_status', 'in', `(${PROBLEM_STATUSES.map(s => `"${s}"`).join(',')})`)
        .order('order_date', { ascending: false }),
    ]);
    const merged = [...(byParcel || []), ...(byOrder || [])];
    // dedup by id
    const seen = new Set<string>();
    const unique = merged.filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return true; });
    setOrders(unique as ProblemOrder[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // ─── Load followups เมื่อกด expand ───────────────────────
  const loadFollowups = async (orderId: string) => {
    if (followups[orderId]) return;
    const { data } = await supabase
      .from('case_followups')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });
    setFollowups(prev => ({ ...prev, [orderId]: data || [] }));
  };

  const handleExpand = (orderId: string) => {
    if (expanded === orderId) { setExpanded(null); return; }
    setExpanded(orderId);
    loadFollowups(orderId);
  };

  // ─── เพิ่ม followup entry ─────────────────────────────────
  const handleAddNote = async (order: ProblemOrder) => {
    const note = (noteInput[order.id] || '').trim();
    if (!note) return;
    setSaving(order.id);
    const { data, error } = await supabase.from('case_followups').insert([{
      order_id: order.id,
      customer_id: order.customer_id,
      note,
      created_by: 'admin',
    }]).select().single();
    if (error) { showToast('บันทึกไม่สำเร็จ', false); }
    else {
      setFollowups(prev => ({ ...prev, [order.id]: [...(prev[order.id] || []), data] }));
      setNoteInput(prev => ({ ...prev, [order.id]: '' }));
      // mark followed_at
      await supabase.from('orders').update({ followed_at: new Date().toISOString(), followed_by: 'admin' }).eq('id', order.id);
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, followed_at: new Date().toISOString() } : o));
    }
    setSaving(null);
  };

  // ─── อัพเดตสถานะ (รับ / ตีกลับยืนยัน / นัดส่งใหม่) ────────
  const handleUpdateStatus = async (order: ProblemOrder, action: 'received' | 'returned' | 'reschedule') => {
    const map = {
      received:   { parcel_status: 'ส่งสำเร็จ',     order_status: 'ส่งสินค้าแล้ว' },
      returned:   { parcel_status: 'ตีกลับยืนยัน', order_status: 'ตีกลับ' },
      reschedule: { parcel_status: 'นัดส่งใหม่',    order_status: 'นัดส่งใหม่' },
    };
    const update = map[action];
    setSaving(order.id + action);
    await supabase.from('orders').update(update).eq('id', order.id);
    // เพิ่ม followup auto-entry
    const autoNote = action === 'received'   ? '✓ ลูกค้ารับสินค้าแล้ว'
                   : action === 'returned'   ? '✗ ยืนยันตีกลับ — คืนสินค้าแล้ว'
                   : '↻ นัดส่งใหม่';
    await supabase.from('case_followups').insert([{
      order_id: order.id, customer_id: order.customer_id,
      note: autoNote, created_by: 'system',
    }]);
    // ถ้า resolved → ลบออกจาก list
    if (action === 'received' || action === 'returned') {
      setOrders(prev => prev.filter(o => o.id !== order.id));
      showToast(action === 'received' ? '✓ อัพเดตเป็น "รับสินค้าแล้ว" แล้ว' : '✓ อัพเดตเป็น "ตีกลับยืนยัน" แล้ว');
    } else {
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, ...update } : o));
      showToast('✓ อัพเดตเป็น "นัดส่งใหม่" แล้ว');
    }
    setSaving(null);
  };

  // ─── Filter ───────────────────────────────────────────────
  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    if (q && !(
      (o.customers?.name || '').toLowerCase().includes(q) ||
      (o.customers?.tel || '').includes(q) ||
      (o.tracking_no || '').toLowerCase().includes(q) ||
      (o.order_no || '').toLowerCase().includes(q)
    )) return false;
    if (filterStatus && o.parcel_status !== filterStatus && o.order_status !== filterStatus) return false;
    if (filterFollowed === 'yes' && !o.followed_at) return false;
    if (filterFollowed === 'no'  && !!o.followed_at) return false;
    return true;
  });

  const totalFollowed   = orders.filter(o => !!o.followed_at).length;
  const totalUnfollowed = orders.filter(o => !o.followed_at).length;

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen p-3 sm:p-6 pb-2 gap-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            ⚠ เคสมีปัญหา
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            พัสดุที่ยังไม่ได้รับ / ค้างคลัง / ไม่มีคนรับ — ติดตามและอัพเดตสถานะได้ที่นี่
          </p>
        </div>
        <button onClick={loadOrders} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
        {[
          { label: 'เคสทั้งหมด',  val: orders.length,    color: 'text-red-600',    bg: 'bg-red-50 border-red-100' },
          { label: 'ยังไม่ตาม',   val: totalUnfollowed,  color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-100' },
          { label: 'ตามแล้ว',     val: totalFollowed,    color: 'text-green-600',  bg: 'bg-green-50 border-green-100' },
          { label: 'VIP / ประจำ', val: orders.filter(o => o.customers?.tag === 'VIP' || o.customers?.tag === 'ประจำ').length, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
        ].map(k => (
          <div key={k.label} className={`rounded-xl border p-4 ${k.bg}`}>
            <div className="text-xs font-medium text-slate-500 mb-1">{k.label}</div>
            <div className={`text-2xl font-bold ${k.color}`}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ / เบอร์ / Tracking / เลขออเดอร์..."
            className="w-full pl-8 pr-3 h-9 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="h-9 px-3 border border-slate-200 rounded-xl text-sm text-slate-600 bg-white focus:outline-none">
          <option value="">ทุกสถานะ</option>
          {PROBLEM_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
          {(['all','no','yes'] as const).map(v => (
            <button key={v} onClick={() => setFilterFollowed(v)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${filterFollowed === v ? 'bg-white shadow text-slate-700' : 'text-slate-500 hover:text-slate-700'}`}>
              {v === 'all' ? 'ทั้งหมด' : v === 'no' ? 'ยังไม่ตาม' : 'ตามแล้ว'}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400 ml-1">{filtered.length} เคส</span>
      </div>


      {/* ─── Mobile Card View ────────────────── */}
      <div className="lg:hidden flex-1 overflow-auto space-y-2 pb-4">
        {loading && <div className="bg-white rounded-xl p-8 text-center text-slate-400 text-sm">กำลังโหลด...</div>}
        {!loading && filtered.length === 0 && (
          <div className="bg-white rounded-xl p-8 text-center text-slate-400 text-sm">ไม่พบเคสที่ตรงกัน</div>
        )}
        {!loading && filtered.map(order => (
          <div key={order.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div onClick={() => handleExpand(order.id)} className="p-3 cursor-pointer">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800 truncate">{order.customers?.name || '-'}</div>
                  {order.customers?.facebook_name && order.customers.facebook_name !== order.customers.name && (
                    <div className="text-xs text-blue-600 truncate">{order.customers.facebook_name}</div>
                  )}
                  <div className="text-xs text-slate-500 font-mono mt-0.5">{order.customers?.tel || '-'}</div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLE[order.parcel_status || order.order_status || ''] || 'bg-slate-100 text-slate-500'}`}>
                    {order.parcel_status || order.order_status}
                  </span>
                  {order.followed_at ? (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>ตามแล้ว
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300"/>ยังไม่ตาม
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono text-cyan-600 truncate flex-1">{order.tracking_no || '-'}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${TAG_STYLE[order.customers?.tag || ''] || 'bg-slate-100 text-slate-500'}`}>
                  {order.customers?.tag || 'ใหม่'}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1 truncate">{order.raw_prod || '-'}</div>
            </div>

            {/* Expanded actions */}
            {expanded === order.id && (
              <div className="border-t bg-cyan-50/50 px-3 py-3 space-y-3">
                {/* Followups */}
                <div>
                  <div className="text-[10px] font-semibold text-slate-600 mb-1.5">ประวัติการติดตาม</div>
                  <div className="space-y-1.5 max-h-32 overflow-auto mb-2">
                    {(followups[order.id] || []).length === 0 && (
                      <div className="text-xs text-slate-400 italic">ยังไม่มีบันทึก</div>
                    )}
                    {(followups[order.id] || []).map(f => (
                      <div key={f.id} className="bg-white rounded px-2 py-1.5 border border-slate-100">
                        <div className="text-[9px] text-slate-400">{fmtDT(f.created_at)}</div>
                        <div className="text-xs text-slate-700">{f.note}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      value={noteInput[order.id] || ''}
                      onChange={e => setNoteInput(prev => ({ ...prev, [order.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleAddNote(order)}
                      placeholder="พิมพ์บันทึก..."
                      className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 bg-white"/>
                    <button onClick={() => handleAddNote(order)} disabled={saving === order.id}
                      className="px-3 py-1.5 bg-cyan-600 text-white rounded-lg text-xs font-medium hover:bg-cyan-700 disabled:opacity-50">
                      <Send size={11}/>
                    </button>
                  </div>
                </div>
                {/* Action buttons */}
                <div className="flex gap-1.5">
                  <button onClick={() => handleUpdateStatus(order, 'received')} disabled={!!saving}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-2 bg-green-600 text-white rounded-lg text-[11px] font-medium hover:bg-green-700 disabled:opacity-50">
                    <CheckCircle size={12}/> รับแล้ว
                  </button>
                  <button onClick={() => handleUpdateStatus(order, 'returned')} disabled={!!saving}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-2 bg-red-600 text-white rounded-lg text-[11px] font-medium hover:bg-red-700 disabled:opacity-50">
                    <RotateCcw size={12}/> ตีกลับ
                  </button>
                  <button onClick={() => handleUpdateStatus(order, 'reschedule')} disabled={!!saving}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-2 bg-blue-600 text-white rounded-lg text-[11px] font-medium hover:bg-blue-700 disabled:opacity-50">
                    <Truck size={12}/> ส่งใหม่
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Table — Desktop only */}
      <div className="hidden lg:flex flex-1 overflow-auto rounded-2xl border border-slate-200">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-slate-800 text-white z-10">
            <tr>
              <th className="p-3 text-left text-xs font-medium w-8"></th>
              <th className="p-3 text-left text-xs font-medium">ชื่อลูกค้า</th>
              <th className="p-3 text-left text-xs font-medium">ชื่อเฟสบุ๊ก</th>
              <th className="p-3 text-left text-xs font-medium">เบอร์โทร</th>
              <th className="p-3 text-left text-xs font-medium">Tracking</th>
              <th className="p-3 text-left text-xs font-medium">สินค้า</th>
              <th className="p-3 text-left text-xs font-medium">สถานะ</th>
              <th className="p-3 text-left text-xs font-medium">ตามแล้ว</th>
              <th className="p-3 text-left text-xs font-medium">tag</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} className="p-8 text-center text-slate-400 text-sm">กำลังโหลด...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={9} className="p-8 text-center text-slate-400 text-sm">ไม่พบเคสที่ตรงกัน</td></tr>
            )}
            {filtered.map(order => (
              <>
                <tr key={order.id}
                  onClick={() => handleExpand(order.id)}
                  className={`cursor-pointer border-b hover:bg-cyan-50 transition ${expanded === order.id ? 'bg-cyan-50' : ''}`}>
                  <td className="p-3 text-slate-400">
                    {expanded === order.id ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                  </td>
                  <td className="p-3">
                    <div className="font-medium text-slate-800 text-sm">{order.customers?.name || '-'}</div>
                  </td>
                  <td className="p-3">
                    {order.customers?.facebook_name && order.customers.facebook_name !== order.customers.name
                      ? <span className="text-xs text-blue-600 font-medium">{order.customers.facebook_name}</span>
                      : <span className="text-xs text-slate-300">-</span>}
                  </td>
                  <td className="p-3 font-mono text-xs text-slate-600">{order.customers?.tel || '-'}</td>
                  <td className="p-3 font-mono text-xs text-cyan-600">{order.tracking_no || '-'}</td>
                  <td className="p-3 text-xs text-slate-600 max-w-[160px] truncate">{order.raw_prod || '-'}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLE[order.parcel_status || order.order_status || ''] || 'bg-slate-100 text-slate-500'}`}>
                      {order.parcel_status || order.order_status}
                    </span>
                  </td>
                  <td className="p-3">
                    {order.followed_at ? (
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0"/>
                        <span className="text-[10px] text-slate-500">{fmtDT(order.followed_at)}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0"/>
                        <span className="text-[10px] text-slate-400">ยังไม่ตาม</span>
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${TAG_STYLE[order.customers?.tag || ''] || 'bg-slate-100 text-slate-500'}`}>
                      {order.customers?.tag || 'ใหม่'}
                    </span>
                  </td>
                </tr>

                {/* ─ Expanded Detail ─ */}
                {expanded === order.id && (
                  <tr key={`${order.id}-detail`}>
                    <td colSpan={9} className="bg-cyan-50 border-b">
                      <div className="px-6 py-4 border-l-4 border-cyan-400">

                        {/* Order info */}
                        <div className="flex items-center gap-4 mb-4 flex-wrap text-xs text-slate-500">
                          <span className="font-mono text-cyan-700 font-medium">{order.order_no}</span>
                          <span>{order.order_date}</span>
                          <span className="font-bold text-emerald-600">฿{Number(order.total_thb).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLE[order.parcel_status || order.order_status || ''] || ''}`}>
                            {order.parcel_status || order.order_status}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                          {/* ─ Follow-up history ─ */}
                          <div>
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-2">
                              <MessageSquare size={12}/> ประวัติการติดตาม
                            </div>
                            <div className="space-y-2 max-h-48 overflow-auto mb-3">
                              {(followups[order.id] || []).length === 0 && (
                                <div className="text-xs text-slate-400 italic">ยังไม่มีบันทึก</div>
                              )}
                              {(followups[order.id] || []).map(f => (
                                <div key={f.id} className="bg-white rounded-lg px-3 py-2 border border-slate-100">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-[10px] text-slate-400">{fmtDT(f.created_at)}</span>
                                    {f.created_by && (
                                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 rounded">{f.created_by}</span>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-700">{f.note}</div>
                                </div>
                              ))}
                            </div>
                            {/* Add note input */}
                            <div className="flex gap-2">
                              <input
                                value={noteInput[order.id] || ''}
                                onChange={e => setNoteInput(prev => ({ ...prev, [order.id]: e.target.value }))}
                                onKeyDown={e => e.key === 'Enter' && handleAddNote(order)}
                                placeholder="พิมพ์บันทึก เช่น โทรแล้ว ลูกค้าบอก..."
                                className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 bg-white"
                              />
                              <button
                                onClick={() => handleAddNote(order)}
                                disabled={saving === order.id}
                                className="px-3 py-1.5 bg-cyan-600 text-white rounded-lg text-xs font-medium hover:bg-cyan-700 transition flex items-center gap-1 disabled:opacity-50">
                                <Send size={11}/> บันทึก
                              </button>
                            </div>
                          </div>

                          {/* ─ Action buttons ─ */}
                          <div>
                            <div className="text-xs font-semibold text-slate-600 mb-2">อัพเดตสถานะ</div>
                            <div className="text-xs text-slate-400 mb-3">
                              การกดปุ่มด้านล่างจะอัพเดตทั้ง <span className="font-medium text-slate-500">หน้าออเดอร์</span> และ <span className="font-medium text-slate-500">หน้าลูกค้า</span> พร้อมกัน
                              และเคสนี้จะหายออกจากรายการหลัง resolve
                            </div>
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => handleUpdateStatus(order, 'received')}
                                disabled={!!saving}
                                className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl text-xs font-medium hover:bg-green-700 transition disabled:opacity-50">
                                <CheckCircle size={14}/> รับสินค้าแล้ว
                                <span className="ml-auto text-green-200 text-[10px]">→ ส่งสำเร็จ · ส่งสินค้าแล้ว</span>
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(order, 'returned')}
                                disabled={!!saving}
                                className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl text-xs font-medium hover:bg-red-700 transition disabled:opacity-50">
                                <RotateCcw size={14}/> ยืนยันตีกลับ
                                <span className="ml-auto text-red-200 text-[10px]">→ ตีกลับยืนยัน · ตีกลับ</span>
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(order, 'reschedule')}
                                disabled={!!saving}
                                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-medium hover:bg-blue-700 transition disabled:opacity-50">
                                <Truck size={14}/> นัดส่งใหม่
                                <span className="ml-auto text-blue-200 text-[10px]">→ นัดส่งใหม่ (ยังอยู่ในรายการ)</span>
                              </button>
                            </div>
                          </div>

                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
