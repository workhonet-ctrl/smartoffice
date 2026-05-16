import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, Upload, CheckCircle, XCircle, AlertCircle, Search, X } from 'lucide-react';
import * as XLSX from 'xlsx';

export type { CodFileState };
export { EMPTY_COD_STATE };

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Types ─────────────────────────────────────────────────────
type CodRow = {
  tracking: string; name: string; tel: string; date: string; amount: number;
  status: 'รอจับคู่' | 'ชำระแล้ว' | 'ไม่พบ';
  orderId?: string; orderNo?: string;
};
type CodFileState = {
  fileName: string; rows: CodRow[]; columns: string[];
  rawRows: Record<string, any>[];
  mapTracking: string; mapAmount: string; mapName: string; mapDate: string;
  imported: boolean; matched: boolean;
};
const EMPTY_COD_STATE: CodFileState = {
  fileName: '', rows: [], columns: [], rawRows: [],
  mapTracking: '', mapAmount: '', mapName: '', mapDate: '',
  imported: false, matched: false,
};

// ══════════════════════════════════════════════════════════════
// Tab 2: จับคู่ COD (Flash + ไปรษณีย์)
// ══════════════════════════════════════════════════════════════
function CodFilePanel({ state, setState }: {
  state: CodFileState;
  setState: (s: CodFileState) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving]   = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
  const [showMap, setShowMap] = useState(false);
  const [delSelected, setDelSelected] = useState<Set<number>>(new Set());

  const toggleDel = (i: number) => setDelSelected(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const allDelSel = state.rows.length > 0 && state.rows.every((_, i) => delSelected.has(i));
  const toggleAllDel = () => setDelSelected(allDelSel ? new Set() : new Set(state.rows.map((_, i) => i)));
  const deleteSelected = () => { setState({ ...state, rows: state.rows.filter((_, i) => !delSelected.has(i)) }); setDelSelected(new Set()); };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb   = XLSX.read(ev.target?.result, { type: 'binary' });
        const ws   = wb.Sheets['COD Detail'] || wb.Sheets['Matching Tracking Number'] || wb.Sheets[wb.SheetNames[0]];
        const json: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!json.length) return;
        const cols = Object.keys(json[0]);
        const auto = (re: RegExp, ex?: RegExp) => cols.find(c => re.test(c) && (!ex || !ex.test(c))) || '';
        setState({
          ...state, fileName: file.name, columns: cols, rawRows: json,
          mapTracking: auto(/tracking/i),
          mapAmount:   auto(/amount|cod/i, /order|sub/i),
          mapName:     auto(/recipient|name/i),
          mapDate:     auto(/destination|date|วันที่/i),
          rows: [], imported: false, matched: false,
        });
        setShowMap(true);
      } catch(err) { console.error('XLSX error', err); }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleImport = () => {
    const { rawRows, mapTracking, mapAmount, mapName, mapDate, columns } = state;
    const dIdx = columns.indexOf(mapDate);
    const rows: CodRow[] = rawRows
      .map(r => ({
        tracking: String(r[mapTracking] || '').trim(),
        name:     String(r[mapName] || '').trim(),
        tel: '',
        date: dIdx >= 0 ? String(r[columns[dIdx]] || '').trim() : manualDate,
        amount: parseFloat(String(r[mapAmount] || '0').replace(/[^0-9.]/g, '')) || 0,
        status: 'รอจับคู่' as const,
      }))
      .filter(r => r.tracking.length > 4);
    setState({ ...state, rows, imported: true, matched: false });
    setShowMap(false);
  };

  const handleMatch = async () => {
    const trackings = state.rows.map(r => r.tracking);
    const { data } = await supabase.from('orders')
      .select('id, order_no, tracking_no, payment_status, customers(name, tel)')
      .in('tracking_no', trackings);
    const oMap: Record<string, any> = {};
    (data || []).forEach((o: any) => { oMap[o.tracking_no] = o; });
    const rows = state.rows.map(r => {
      const o = oMap[r.tracking];
      if (!o) return { ...r, status: 'ไม่พบ' as const };
      return {
        ...r, orderId: o.id, orderNo: o.order_no,
        name: (o.customers as any)?.name || r.name,
        tel:  (o.customers as any)?.tel || '',
        status: o.payment_status === 'ชำระแล้ว' ? 'ชำระแล้ว' as const : 'รอจับคู่' as const,
      };
    });
    setState({ ...state, rows, matched: true });
  };

  const handleSave = async () => {
    const toUpdate = state.rows.filter(r => r.status === 'รอจับคู่' && r.orderId);
    if (!toUpdate.length) return;
    setSaving(true);
    await supabase.from('orders').update({ payment_status: 'ชำระแล้ว' }).in('id', toUpdate.map(r => r.orderId!));
    setState({ ...state, rows: state.rows.map(r => r.status === 'รอจับคู่' && r.orderId ? { ...r, status: 'ชำระแล้ว' as const } : r) });
    setSaveMsg(`✓ อัพเดต ${toUpdate.length} รายการ`);
    setSaving(false);
    setTimeout(() => setSaveMsg(''), 4000);
  };

  const statusColor = (s: string) =>
    s === 'ชำระแล้ว' ? 'bg-green-100 text-green-700' :
    s === 'ไม่พบ'    ? 'bg-red-100 text-red-500'     :
                        'bg-yellow-100 text-yellow-700';

  const cntPaid     = state.rows.filter(r => r.status === 'ชำระแล้ว').length;
  const cntNotFound = state.rows.filter(r => r.status === 'ไม่พบ').length;
  const cntPending  = state.rows.filter(r => r.status === 'รอจับคู่').length;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      {/* Upload zone */}
      <div className="shrink-0 border-2 border-dashed border-slate-200 rounded-xl p-5 flex items-center gap-4 hover:border-blue-400 hover:bg-blue-50 transition cursor-pointer"
        onClick={() => fileRef.current?.click()}>
        <Upload size={22} className="text-slate-400 shrink-0"/>
        <div>
          <p className="font-medium text-slate-600 text-sm">
            {state.fileName ? `📄 ${state.fileName}` : 'คลิกเพื่ออัพโหลดไฟล์ COD จาก Flash / ไปรษณีย์'}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">รองรับ .xlsx, .xls · Flash: CODRemittance · ไปรษณีย์: Matching Tracking</p>
        </div>
        {state.rows.length > 0 && <span className="ml-auto text-xs text-slate-500 shrink-0">{state.rows.length} รายการ</span>}
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile}/>
      </div>

      {/* Column mapping modal */}
      {showMap && state.columns.length > 0 && (
        <div className="shrink-0 bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle size={14} className="text-orange-400"/>
            <span className="text-sm font-semibold text-slate-700">เลือก Column ให้ตรงกับข้อมูล</span>
          </div>
          {[
            { label: 'Tracking No.', val: state.mapTracking, key: 'mapTracking' },
            { label: 'ยอด COD',      val: state.mapAmount,   key: 'mapAmount'   },
            { label: 'ชื่อลูกค้า',   val: state.mapName,     key: 'mapName'     },
            { label: 'วันที่',        val: state.mapDate,     key: 'mapDate'     },
          ].map(({ label, val, key }) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-600 w-24 shrink-0">{label}</span>
              <select value={val} onChange={e => setState({ ...state, [key]: e.target.value })}
                className="flex-1 border rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-300">
                <option value="">— ไม่เลือก —</option>
                {state.columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-600 w-24 shrink-0">วันที่ (ตั้งเอง)</span>
            <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300"/>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setShowMap(false)} className="px-4 py-2 bg-slate-200 rounded-lg text-xs hover:bg-slate-300">ยกเลิก</button>
            <button onClick={handleImport} disabled={!state.mapTracking || !state.mapAmount}
              className="px-5 py-2 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 disabled:opacity-40">
              ✓ Import
            </button>
          </div>
        </div>
      )}

      {/* Stats + Actions */}
      {state.imported && state.rows.length > 0 && (
        <div className="shrink-0 flex items-center gap-3 flex-wrap">
          <div className="flex gap-2">
            <span className="px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-lg text-xs font-bold">รอจับคู่ {cntPending}</span>
            <span className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-bold">✓ ชำระแล้ว {cntPaid}</span>
            <span className="px-3 py-1.5 bg-red-100 text-red-500 rounded-lg text-xs font-bold">ไม่พบ {cntNotFound}</span>
          </div>
          <div className="flex gap-2 ml-auto">
            {delSelected.size > 0 && (
              <button onClick={deleteSelected} className="px-3 py-2 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600">
                🗑 ลบที่เลือก ({delSelected.size})
              </button>
            )}
            {!state.matched && (
              <button onClick={handleMatch} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600">
                🔍 จับคู่ Tracking
              </button>
            )}
            {state.matched && cntPending > 0 && (
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600 disabled:opacity-50">
                ✓ บันทึกรับเงิน ({cntPending} รายการ)
              </button>
            )}
            {saveMsg && <span className="text-xs text-green-600 font-medium self-center">{saveMsg}</span>}
          </div>
        </div>
      )}

      {/* Table */}
      {state.rows.length > 0 && (
        <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
          <table className="text-xs w-full" style={{ minWidth: '700px' }}>
            <thead className="bg-slate-800 text-slate-200 sticky top-0">
              <tr>
                <th className="p-3 w-8 text-center">
                  <input type="checkbox" checked={allDelSel} onChange={toggleAllDel} className="rounded cursor-pointer"/>
                </th>
                <th className="p-3 text-left">Tracking No.</th>
                <th className="p-3 text-left">ชื่อลูกค้า</th>
                <th className="p-3 text-left">เบอร์</th>
                <th className="p-3 text-right">ยอด COD</th>
                <th className="p-3 text-left">วันที่</th>
                <th className="p-3 text-center">สถานะ</th>
                {state.matched && <th className="p-3 text-left">เลขออเดอร์</th>}
              </tr>
            </thead>
            <tbody>
              {state.rows.map((r, i) => (
                <tr key={i} className={`border-b hover:bg-slate-50 ${r.status === 'ชำระแล้ว' ? 'bg-green-50/40' : r.status === 'ไม่พบ' ? 'bg-red-50/40' : ''}`}>
                  <td className="p-3 text-center">
                    <input type="checkbox" checked={delSelected.has(i)} onChange={() => toggleDel(i)} className="rounded cursor-pointer"/>
                  </td>
                  <td className="p-3 font-mono text-blue-600">{r.tracking}</td>
                  <td className="p-3 font-medium">{r.name || '-'}</td>
                  <td className="p-3 text-slate-500">{r.tel || '-'}</td>
                  <td className="p-3 text-right font-bold text-emerald-600">฿{fmt(r.amount)}</td>
                  <td className="p-3 text-slate-400">{r.date}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor(r.status)}`}>{r.status}</span>
                  </td>
                  {state.matched && <td className="p-3 font-mono text-[11px] text-slate-500">{r.orderNo || '-'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!state.imported && !showMap && (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-3">
          <Upload size={40}/>
          <div className="text-center">
            <p className="font-medium text-slate-400">อัพโหลดไฟล์ COD</p>
            <p className="text-xs text-slate-300 mt-1">Flash: CODRemittance.xlsx</p>
            <p className="text-xs text-slate-300">ไปรษณีย์: Matching Tracking</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════
export default function FinanceIncome() {
  const [tab, setTab] = useState<'orders' | 'cod-file'>('orders');

  // ── COD File state (persist เมื่อสลับ tab) ──────────────────
  const [codState, setCodState] = useState<CodFileState>(EMPTY_COD_STATE);

  // ── Orders state ─────────────────────────────────────────────
  const [orders, setOrders]       = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState('');
  const [search, setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [filterType, setFilterType]     = useState(''); // '' | 'cod' | 'transfer'

  // ── Date filter ───────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(today);

  // ── Pagination ────────────────────────────────────────────────
  const PAGE_SIZE = 100;
  const [pageView, setPageView] = useState<number | 'all'>(0);

  const loadOrders = async () => {
    setLoading(true); setSelected(new Set()); setPageView(0);
    const allOrders: any[] = [];
    let page = 0;
    while (true) {
      let q = supabase.from('orders')
        .select('id, order_no, order_date, total_thb, payment_method, payment_status, order_status, customers(name, tel, facebook_name), raw_prod, tracking_no, slip_image')
        .gte('order_date', dateFrom).lte('order_date', dateTo)
        .order('order_date', { ascending: false })
        .range(page * 1000, (page + 1) * 1000 - 1);
      const { data, error } = await q;
      if (error || !data || data.length === 0) break;
      allOrders.push(...data);
      if (data.length < 1000) break;
      page++;
    }
    setOrders(allOrders);
    setLoading(false);
  };

  useEffect(() => { loadOrders(); }, [dateFrom, dateTo]);
  useEffect(() => { setPageView(0); }, [search, filterStatus, filterMethod, filterType]);

  // ── Slip image ─────────────────────────────────────────────────
  const [slipModal, setSlipModal] = useState<{ orderId: string; image: string | null } | null>(null);
  const [slipUploading, setSlipUploading] = useState(false);

  const handleSlipUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) { alert('ไฟล์ต้องไม่เกิน 1.5 MB'); return; }
    setSlipUploading(true);
    const reader = new FileReader();
    reader.onload = async ev => {
      const base64 = ev.target?.result as string;
      await supabase.from('orders').update({ slip_image: base64 }).eq('id', slipModal!.orderId);
      setSlipModal(m => m ? { ...m, image: base64 } : m);
      setOrders(prev => prev.map(o => o.id === slipModal!.orderId ? { ...o, slip_image: base64 } : o));
      setSlipUploading(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const deleteSlip = async () => {
    await supabase.from('orders').update({ slip_image: null }).eq('id', slipModal!.orderId);
    setOrders(prev => prev.map(o => o.id === slipModal!.orderId ? { ...o, slip_image: null } : o));
    setSlipModal(m => m ? { ...m, image: null } : m);
  };

  const toggle    = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSel    = orders.length > 0 && orders.every(o => selected.has(o.id));
  const toggleAll = () => setSelected(allSel ? new Set() : new Set(orders.map(o => o.id)));

  const markPaid = async () => {
    if (!selected.size) return;
    setSaving(true);
    await supabase.from('orders').update({ payment_status: 'ชำระแล้ว' }).in('id', Array.from(selected));
    setMsg(`✓ รับเงินแล้ว ${selected.size} รายการ`);
    setTimeout(() => setMsg(''), 3000);
    await loadOrders();
    setSaving(false);
  };

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    if (q && !(
      (o.customers?.name || '').toLowerCase().includes(q) ||
      (o.customers?.facebook_name || '').toLowerCase().includes(q) ||
      (o.raw_prod || '').toLowerCase().includes(q) ||
      (o.order_no || '').toLowerCase().includes(q) ||
      (o.tracking_no || '').toLowerCase().includes(q)
    )) return false;
    if (filterStatus && o.payment_status !== filterStatus) return false;
    if (filterMethod && o.payment_method !== filterMethod) return false;
    if (filterType === 'cod'      && o.payment_method !== 'COD')  return false;
    if (filterType === 'transfer' && o.payment_method === 'COD')  return false;
    return true;
  });

  const totalPages  = Math.ceil(filtered.length / PAGE_SIZE);
  const pagedOrders = pageView === 'all'
    ? filtered
    : filtered.slice((pageView as number) * PAGE_SIZE, ((pageView as number) + 1) * PAGE_SIZE);

  // ── KPI ───────────────────────────────────────────────────────
  const totAll      = filtered.reduce((s, o) => s + Number(o.total_thb || 0), 0);
  const totPaid     = filtered.filter(o => o.payment_status === 'ชำระแล้ว').reduce((s, o) => s + Number(o.total_thb || 0), 0);
  const totWaiting  = filtered.filter(o => o.payment_status !== 'ชำระแล้ว').reduce((s, o) => s + Number(o.total_thb || 0), 0);
  const cntPaid     = filtered.filter(o => o.payment_status === 'ชำระแล้ว').length;
  const cntWaiting  = filtered.filter(o => o.payment_status !== 'ชำระแล้ว').length;

  return (
    <div className="flex flex-col h-full gap-4">

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">💰 รายรับ</h2>
          <p className="text-xs text-slate-400 mt-0.5">จัดการรายรับและสถานะการชำระเงิน</p>
        </div>
        {/* Tab switcher */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {([
            { key: 'orders',   label: '📋 รายการออเดอร์' },
            { key: 'cod-file', label: '📂 จับคู่ COD' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition ${tab === t.key ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: จับคู่ COD ── */}
      {tab === 'cod-file' && <CodFilePanel state={codState} setState={setCodState}/>}

      {/* ── Tab: รายการออเดอร์ ── */}
      {tab === 'orders' && (
        <>
          {/* KPI cards */}
          <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="text-xs text-blue-700 font-semibold mb-1">รายรับรวม</div>
              <div className="text-xl font-bold text-blue-800">฿{fmt(totAll)}</div>
              <div className="text-xs text-blue-500 mt-0.5">{filtered.length} รายการ</div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <div className="text-xs text-yellow-700 font-semibold mb-1">รอรับเงิน</div>
              <div className="text-xl font-bold text-yellow-800">฿{fmt(totWaiting)}</div>
              <div className="text-xs text-yellow-500 mt-0.5">{cntWaiting} รายการ</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="text-xs text-green-700 font-semibold mb-1">รับเงินแล้ว</div>
              <div className="text-xl font-bold text-green-800">฿{fmt(totPaid)}</div>
              <div className="text-xs text-green-500 mt-0.5">{cntPaid} รายการ</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500 font-semibold mb-1">อัตรารับเงิน</div>
              <div className="text-xl font-bold text-slate-700">
                {filtered.length > 0 ? Math.round(cntPaid / filtered.length * 100) : 0}%
              </div>
              <div className="text-xs text-slate-400 mt-0.5">ของทั้งหมด</div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="shrink-0 flex items-center gap-2 flex-wrap">
            {/* Date filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 whitespace-nowrap">📅 วันที่</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 w-[120px]"/>
              <span className="text-slate-300 text-xs">—</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 w-[120px]"/>
            </div>
            {/* Search */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหา ชื่อ / สินค้า / tracking..."
                className="pl-8 pr-3 py-2 border rounded-lg text-xs w-52 focus:outline-none focus:ring-2 focus:ring-blue-300"/>
              {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={12}/></button>}
            </div>
            {/* Filter วิธีชำระ */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg text-xs">
              {[
                { k: '',         l: 'ทั้งหมด' },
                { k: 'cod',      l: '💵 COD' },
                { k: 'transfer', l: '🏦 โอนเงิน' },
              ].map(({ k, l }) => (
                <button key={k} onClick={() => setFilterType(k)}
                  className={`px-3 py-1.5 rounded-md font-medium transition ${filterType === k ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>
                  {l}
                </button>
              ))}
            </div>
            {/* Filter สถานะ */}
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className={`border rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 ${filterStatus ? 'border-blue-400 bg-blue-50' : ''}`}>
              <option value="">สถานะ: ทั้งหมด</option>
              <option value="ชำระแล้ว">✓ รับเงินแล้ว</option>
              <option value="รอชำระเงิน">รอรับเงิน</option>
            </select>
            {/* ล้าง */}
            {(search || filterStatus || filterType) && (
              <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterType(''); setFilterMethod(''); }}
                className="px-2 py-2 bg-slate-100 text-slate-500 rounded-lg text-xs hover:bg-slate-200">✕ ล้าง</button>
            )}
            <span className="text-xs text-slate-400">{filtered.length} รายการ</span>
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

          {/* Pagination */}
          {filtered.length > PAGE_SIZE && (
            <div className="shrink-0 flex items-center gap-1 flex-wrap">
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} onClick={() => setPageView(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    pageView === i ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}>
                  หน้า {i + 1}
                </button>
              ))}
              <button onClick={() => setPageView('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  pageView === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                แสดงทั้งหมด
              </button>
              <span className="text-xs text-slate-400 ml-1">
                {pageView === 'all' ? `แสดง ${filtered.length}` : `แสดง ${pagedOrders.length} / ${filtered.length}`}
              </span>
            </div>
          )}

          {/* Table */}
          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm w-full" style={{ minWidth: '900px' }}>
              <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
                <tr>
                  <th className="p-3 w-8">
                    <input type="checkbox" checked={allSel}
                      ref={el => { if (el) el.indeterminate = selected.size > 0 && !allSel; }}
                      onChange={toggleAll} className="rounded cursor-pointer"/>
                  </th>
                  <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                  <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
                  <th className="p-3 text-left whitespace-nowrap">Tracking</th>
                  <th className="p-3 text-left">ลูกค้า</th>
                  <th className="p-3 text-left">สินค้า</th>
                  <th className="p-3 text-center whitespace-nowrap">วิธีชำระ</th>
                  <th className="p-3 text-right whitespace-nowrap">ยอด (฿)</th>
                  <th className="p-3 text-center whitespace-nowrap">สถานะ</th>
                  <th className="p-3 text-center whitespace-nowrap">สลิป</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={10} className="p-8 text-center text-slate-400">
                    <RefreshCw size={16} className="animate-spin inline mr-2"/>กำลังโหลด...
                  </td></tr>
                )}
                {!loading && pagedOrders.length === 0 && (
                  <tr><td colSpan={10} className="p-8 text-center text-slate-400">ไม่พบข้อมูล</td></tr>
                )}
                {pagedOrders.map(o => {
                  const isPaid  = o.payment_status === 'ชำระแล้ว';
                  const isCOD   = o.payment_method === 'COD';
                  return (
                    <tr key={o.id} className={`border-b hover:bg-slate-50 transition ${isPaid ? 'bg-green-50/30' : ''} ${selected.has(o.id) ? 'bg-blue-50' : ''}`}>
                      <td className="p-3 text-center">
                        <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} className="rounded cursor-pointer"/>
                      </td>
                      <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                        {o.order_date ? o.order_date.split('-').reverse().join('/') : '-'}
                      </td>
                      <td className="p-3 font-mono text-xs text-blue-600 whitespace-nowrap">{o.order_no}</td>
                      <td className="p-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">{o.tracking_no || '-'}</td>
                      <td className="p-3">
                        <div className="font-medium text-slate-800 text-xs">{o.customers?.name || '-'}</div>
                        {o.customers?.facebook_name && o.customers.facebook_name !== o.customers?.name && (
                          <div className="text-[11px] text-blue-500">{o.customers.facebook_name}</div>
                        )}
                        <div className="text-[11px] text-slate-400 font-mono">{o.customers?.tel || ''}</div>
                      </td>
                      <td className="p-3 text-xs text-slate-500 max-w-[200px] truncate">{o.raw_prod || '-'}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isCOD ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                          {o.payment_method || '-'}
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold text-emerald-600">฿{fmt(o.total_thb || 0)}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer ${isPaid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'}`}
                          onClick={async () => {
                            if (isPaid) return;
                            await supabase.from('orders').update({ payment_status: 'ชำระแล้ว' }).eq('id', o.id);
                            setOrders(prev => prev.map(x => x.id === o.id ? { ...x, payment_status: 'ชำระแล้ว' } : x));
                          }}>
                          {isPaid ? '✓ รับแล้ว' : 'รอรับเงิน'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button onClick={() => setSlipModal({ orderId: o.id, image: o.slip_image || null })}
                          className={`text-[11px] px-2 py-0.5 rounded border transition ${o.slip_image ? 'bg-green-50 text-green-600 border-green-200' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'}`}>
                          {o.slip_image ? '🖼 ดู' : '+ สลิป'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {pagedOrders.length > 0 && (
                <tfoot className="bg-slate-50 border-t-2 sticky bottom-0">
                  <tr>
                    <td colSpan={7} className="p-3 text-xs text-slate-500 font-medium">
                      รวม {pagedOrders.length} รายการ (หน้านี้)
                    </td>
                    <td className="p-3 text-right font-bold text-emerald-700">
                      ฿{fmt(pagedOrders.reduce((s, o) => s + Number(o.total_thb || 0), 0))}
                    </td>
                    <td colSpan={2}/>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}

      {/* Slip Modal */}
      {slipModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setSlipModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <span className="font-semibold text-slate-700">สลิปการโอนเงิน</span>
              <button onClick={() => setSlipModal(null)} className="text-slate-400 hover:text-slate-600"><X size={18}/></button>
            </div>
            <div className="p-4">
              {slipModal.image ? (
                <img src={slipModal.image} alt="slip" className="w-full rounded-lg object-contain max-h-80"/>
              ) : (
                <div className="flex flex-col items-center gap-3 py-6 text-slate-400">
                  <span className="text-4xl">📄</span>
                  <p className="text-sm">ยังไม่มีสลิป</p>
                </div>
              )}
            </div>
            <div className="p-4 border-t flex gap-2">
              {slipModal.image && (
                <button onClick={deleteSlip} className="px-3 py-2 bg-red-100 text-red-600 rounded-lg text-xs hover:bg-red-200">
                  🗑 ลบ
                </button>
              )}
              <label className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-xs font-medium text-center hover:bg-blue-600 cursor-pointer">
                {slipUploading ? 'กำลังบันทึก...' : slipModal.image ? '🔄 เปลี่ยนสลิป' : '📷 อัพโหลดสลิป'}
                <input type="file" accept="image/*" className="hidden" onChange={handleSlipUpload} disabled={slipUploading}/>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
