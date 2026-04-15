import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, Upload, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

export type { CodFileState };
export { EMPTY_COD_STATE };

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type IncomeTab = 'cod' | 'transfer' | 'all' | 'cod-file';

// ── COD File Import ───────────────────────────────────────────
type ImportRow  = { tracking: string; amount: number; name: string; raw: Record<string, any> };
type MatchResult = { tracking: string; amount: number; name: string; orderId?: string; orderNo?: string; customer?: string; status: 'matched' | 'not_found' };


// ── Types ─────────────────────────────────────────────────────
type CodRow = {
  tracking: string;
  name:     string;
  tel:      string;
  date:     string;
  amount:   number;
  status:   'รอจับคู่' | 'ชำระแล้ว' | 'ไม่พบ';
  orderId?: string;
  orderNo?: string;
};

type CodFileState = {
  fileName: string;
  rows: CodRow[];
  columns: string[];
  rawRows: Record<string, any>[];
  mapTracking: string;
  mapAmount: string;
  mapName: string;
  mapDate: string;
  imported: boolean;
  matched: boolean;
};

const EMPTY_COD_STATE: CodFileState = {
  fileName: '', rows: [], columns: [], rawRows: [],
  mapTracking: '', mapAmount: '', mapName: '', mapDate: '',
  imported: false, matched: false,
};

// ── COD File Panel (รับ state จาก parent เพื่อ persist) ───────
function CodFilePanel({ state, setState }: {
  state: CodFileState;
  setState: (s: CodFileState) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving,   setSaving]   = useState(false);
  const [saveMsg,  setSaveMsg]  = useState('');
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
  const [showMap,    setShowMap]    = useState(false);
  const [delSelected, setDelSelected] = useState<Set<number>>(new Set());

  const toggleDel = (i: number) => setDelSelected(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const allDelSel = state.rows.length > 0 && state.rows.every((_, i) => delSelected.has(i));
  const toggleAllDel = () => setDelSelected(allDelSel ? new Set() : new Set(state.rows.map((_, i) => i)));
  const deleteSelected = () => {
    setState({ ...state, rows: state.rows.filter((_, i) => !delSelected.has(i)) });
    setDelSelected(new Set());
  };

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
          ...state,
          fileName:    file.name,
          columns:     cols,
          rawRows:     json,
          mapTracking: auto(/tracking/i),
          mapAmount:   auto(/amount|cod/i, /order|sub/i),
          mapName:     auto(/recipient|name/i),
          mapDate:     auto(/destination|date|วันที่/i),
          rows:        [],
          imported:    false,
          matched:     false,
        });
        setShowMap(true);
      } catch(err) { console.error('XLSX error', err); }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleImport = () => {
    const { rawRows, mapTracking, mapAmount, mapName, mapDate } = state;
    const tIdx = state.columns.indexOf(mapTracking);
    const aIdx = state.columns.indexOf(mapAmount);
    const nIdx = state.columns.indexOf(mapName);
    const dIdx = state.columns.indexOf(mapDate);
    const rows: CodRow[] = rawRows
      .map(r => ({
        tracking: String(r[mapTracking] || '').trim(),
        name:     nIdx >= 0 ? String(r[state.columns[nIdx]] || '').trim() : '',
        tel:      '',
        date:     dIdx >= 0 ? String(r[state.columns[dIdx]] || '').trim() : manualDate,
        amount:   parseFloat(String(r[mapAmount] || '0').replace(/[^0-9.]/g, '')) || 0,
        status:   'รอจับคู่' as const,
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
        ...r,
        orderId:  o.id,
        orderNo:  o.order_no,
        name:     (o.customers as any)?.name || r.name,
        tel:      (o.customers as any)?.tel  || '',
        status:   o.payment_status === 'ชำระแล้ว' ? 'ชำระแล้ว' as const : 'รอจับคู่' as const,
      };
    });
    setState({ ...state, rows, matched: true });
  };

  const handleSave = async () => {
    const toUpdate = state.rows.filter(r => r.status === 'รอจับคู่' && r.orderId);
    if (!toUpdate.length) return;
    setSaving(true);
    await supabase.from('orders').update({ payment_status: 'ชำระแล้ว' })
      .in('id', toUpdate.map(r => r.orderId!));
    setState({ ...state, rows: state.rows.map(r =>
      r.status === 'รอจับคู่' && r.orderId ? { ...r, status: 'ชำระแล้ว' as const } : r
    )});
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
        {state.rows.length > 0 && (
          <span className="ml-auto text-xs text-slate-500 shrink-0">{state.rows.length} รายการ</span>
        )}
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile}/>
      </div>

      {/* Column mapping */}
      {showMap && state.columns.length > 0 && (
        <div className="shrink-0 bg-white rounded-xl shadow border p-4 space-y-3">
          <div className="font-semibold text-slate-700 text-sm flex items-center gap-2">
            <AlertCircle size={14} className="text-orange-400"/> เลือก Column ให้ตรงกับข้อมูล
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Tracking *</label>
              <select value={state.mapTracking} onChange={e => setState({ ...state, mapTracking: e.target.value })}
                className="w-full border rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                <option value="">— ไม่ระบุ —</option>
                {state.columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">ยอด COD</label>
              <select value={state.mapAmount} onChange={e => setState({ ...state, mapAmount: e.target.value })}
                className="w-full border rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                <option value="">— ไม่ระบุ —</option>
                {state.columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">ชื่อลูกค้า</label>
              <select value={state.mapName} onChange={e => setState({ ...state, mapName: e.target.value })}
                className="w-full border rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                <option value="">— ไม่ระบุ —</option>
                {state.columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">วันที่ (จากไฟล์)</label>
              <select value={state.mapDate} onChange={e => setState({ ...state, mapDate: e.target.value })}
                className="w-full border rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                <option value="">— กรอกเอง —</option>
                {state.columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {/* กรอกวันที่เองถ้าไม่มีใน column */}
            {!state.mapDate && (
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">กรอกวันที่เอง</label>
                <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"/>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowMap(false)}
              className="px-4 py-2 bg-slate-200 rounded-lg text-xs hover:bg-slate-300">ยกเลิก</button>
            <button onClick={handleImport} disabled={!state.mapTracking}
              className="px-5 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50">
              ✓ นำเข้าข้อมูล
            </button>
          </div>
        </div>
      )}

      {/* Summary + actions */}
      {state.imported && (
        <div className="shrink-0 flex gap-3 items-center flex-wrap">
          <div className="bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
            ทั้งหมด <span className="font-bold">{state.rows.length}</span>
          </div>
          {state.matched && <>
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-sm text-green-700">
              ✓ จับคู่ได้ <span className="font-bold">{state.rows.length - cntNotFound}</span>
            </div>
            {cntNotFound > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-600">
                ❌ ไม่พบ <span className="font-bold">{cntNotFound}</span>
              </div>
            )}
          </>}
          <div className="ml-auto flex gap-2 items-center">
            {saveMsg && <span className="text-xs text-green-600 font-medium">{saveMsg}</span>}
            {delSelected.size > 0 && (
              <button onClick={deleteSelected}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 flex items-center gap-1.5">
                🗑 ลบ ({delSelected.size})
              </button>
            )}
            {!state.matched && (
              <button onClick={handleMatch}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600">
                🔍 จับคู่ Tracking
              </button>
            )}
            {state.matched && cntPending > 0 && (
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 disabled:opacity-50">
                ✓ ยืนยันรับเงิน ({cntPending})
              </button>
            )}
            <button onClick={() => { setState(EMPTY_COD_STATE); setShowMap(false); setSaveMsg(''); setDelSelected(new Set()); }}
              className="px-3 py-2 bg-slate-200 text-slate-600 rounded-lg text-xs hover:bg-slate-300">
              ล้างทั้งหมด
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {state.imported && state.rows.length > 0 && (
        <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
          <table className="text-sm w-full" style={{minWidth:'750px'}}>
            <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
              <tr>
                <th className="p-3 w-8">
                  <input type="checkbox" checked={allDelSel} onChange={toggleAllDel} className="rounded"/>
                </th>
                <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                <th className="p-3 text-left whitespace-nowrap">ลูกค้า</th>
                <th className="p-3 text-left whitespace-nowrap">เบอร์</th>
                <th className="p-3 text-left whitespace-nowrap">Tracking</th>
                <th className="p-3 text-right whitespace-nowrap">ยอด (บาท)</th>
                <th className="p-3 text-center whitespace-nowrap">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((r, i) => (
                <tr key={i} className={`border-b ${delSelected.has(i) ? 'bg-red-50' : r.status === 'ชำระแล้ว' ? 'bg-green-50' : r.status === 'ไม่พบ' ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
                  <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={delSelected.has(i)} onChange={() => toggleDel(i)} className="rounded"/>
                  </td>
                  <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{r.date || '-'}</td>
                  <td className="p-3 font-medium whitespace-nowrap">{r.name || '-'}</td>
                  <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{r.tel || '-'}</td>
                  <td className="p-3 font-mono text-xs text-blue-600 whitespace-nowrap">{r.tracking}</td>
                  <td className="p-3 text-right font-bold">฿{fmt(r.amount)}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty */}
      {!state.imported && !showMap && (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-3">
          <Upload size={48} strokeWidth={1}/>
          <p className="text-sm">อัพโหลดไฟล์ Excel เพื่อเริ่มต้น</p>
          <div className="flex gap-2 text-xs">
            <span className="bg-orange-50 border border-orange-100 text-orange-500 px-3 py-1.5 rounded-lg">Flash: CODRemittance.xlsx</span>
            <span className="bg-purple-50 border border-purple-100 text-purple-500 px-3 py-1.5 rounded-lg">ไปรษณีย์: Matching Tracking.xlsx</span>
          </div>
        </div>
      )}
    </div>
  );
}


// ── Main FinanceIncome ────────────────────────────────────────
export default function FinanceIncome({
  codState, setCodState,
}: {
  codState: CodFileState;
  setCodState: (s: CodFileState) => void;
}) {
  const [tab, setTab] = useState<IncomeTab>('cod-file');
  const [orders, setOrders]     = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState('');

  const loadOrders = async () => {
    setLoading(true); setSelected(new Set());
    let q = supabase.from('orders')
      .select('id, order_no, order_date, total_thb, payment_method, payment_status, order_status, customers(name, tel, facebook_name), raw_prod, tracking_no, slip_image')
      .order('order_date', { ascending: false })
      .limit(200);

    if (tab === 'cod') {
      q = q.eq('payment_method', 'COD')
           .in('order_status', ['ส่งสินค้าแล้ว', 'ส่งไปรษณีย์', 'กำลังแพ็ค', 'แพ็คสินค้า']);
    } else if (tab === 'transfer') {
      q = q.neq('payment_method', 'COD')
           .in('order_status', ['ส่งสินค้าแล้ว', 'ส่งไปรษณีย์', 'กำลังแพ็ค', 'แพ็คสินค้า']);
    } else {
      // ทั้งหมด — เฉพาะที่ส่งแล้ว 200 รายการล่าสุด
      q = q.in('order_status', ['ส่งสินค้าแล้ว', 'ส่งไปรษณีย์']);
    }

    const { data } = await q;
    setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => { if (tab !== 'cod-file') loadOrders(); }, [tab]);

  // ── Slip image ──────────────────────────────────────────────
  const [slipModal, setSlipModal] = useState<{ orderId: string; image: string | null } | null>(null);
  const [slipUploading, setSlipUploading] = useState(false);

  const openSlip = (o: any) => setSlipModal({ orderId: o.id, image: o.slip_image || null });

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
  // ──────────────────────────────────────────────────────────────

  const toggle    = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSel    = orders.length > 0 && orders.every(o => selected.has(o.id));
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

  const TABS = [
    { key: 'cod-file' as IncomeTab, label: '📂 ไฟล์ COD' },
    { key: 'cod'      as IncomeTab, label: '💵 COD' },
    { key: 'transfer' as IncomeTab, label: '🏦 โอนเงิน' },
    { key: 'all'      as IncomeTab, label: '📋 ทั้งหมด' },
  ];

  return (
    <div className="flex flex-col h-screen p-6 pb-2">
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

      {/* COD File Tab */}
      {tab === 'cod-file' && <CodFilePanel state={codState} setState={setCodState} />}

      {/* COD / Transfer Tabs */}
      {tab !== 'cod-file' && (
        <>
          {/* Summary */}
          <div className="shrink-0 grid grid-cols-2 gap-3 mb-4">
            {tab === 'transfer' ? (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="text-xs text-blue-700 font-semibold mb-1">ยอดโอนรวม</div>
                  <div className="text-2xl font-bold text-blue-800">฿{fmt(orders.reduce((s, o) => s + (o.total_thb || 0), 0))}</div>
                  <div className="text-xs text-blue-600 mt-0.5">{orders.length} รายการ</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="text-xs text-green-700 font-semibold mb-1">สถานะ</div>
                  <div className="text-lg font-bold text-green-700">✓ ชำระแล้วทั้งหมด</div>
                  <div className="text-xs text-green-500 mt-0.5">read-only · ไม่ต้องดำเนินการ</div>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>

          {/* Toolbar */}
          <div className="shrink-0 flex items-center gap-2 mb-3 flex-wrap">
            <button onClick={loadOrders} disabled={loading}
              className="px-3 py-2 bg-white border rounded-lg text-xs hover:bg-slate-50 flex items-center gap-1.5 shadow-sm">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''}/> รีเฟรช
            </button>
            {tab === 'transfer' && <span className="text-xs text-slate-400">📖 ประวัติการโอนเงิน — read only</span>}
            {msg && <span className="text-xs text-green-600 font-medium">{msg}</span>}
            {selected.size > 0 && tab === 'cod' && (
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
                  {tab === 'cod' && <th className="p-3 w-8"><input type="checkbox" checked={allSel} onChange={toggleAll} className="rounded"/></th>}
                  <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                  <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
                  <th className="p-3 text-left whitespace-nowrap">ลูกค้า</th>
                  <th className="p-3 text-left whitespace-nowrap">เบอร์</th>
                  <th className="p-3 text-left">สินค้า</th>
                  <th className="p-3 text-center whitespace-nowrap">วิธีชำระ</th>
                  <th className="p-3 text-right whitespace-nowrap">ยอด (บาท)</th>
                  <th className="p-3 text-center whitespace-nowrap">สถานะ</th>
                  <th className="p-3 text-center whitespace-nowrap">สลิป</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={10} className="p-8 text-center text-slate-400">กำลังโหลด...</td></tr>}
                {!loading && orders.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-slate-400">ไม่มีข้อมูล</td></tr>}
                {orders.map(o => {
                  const paid = o.payment_status === 'ชำระแล้ว';
                  const isTransfer = tab === 'transfer';
                  return (
                    <tr key={o.id}
                      onClick={() => !paid && !isTransfer && toggle(o.id)}
                      className={`border-b ${isTransfer ? 'hover:bg-blue-50' : paid ? 'bg-green-50 opacity-70' : selected.has(o.id) ? 'bg-yellow-50' : 'hover:bg-slate-50 cursor-pointer'}`}>
                      {tab === 'cod' && (
                        <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                          {!paid && <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} className="rounded"/>}
                        </td>
                      )}
                      <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                        {o.order_date ? o.order_date.split('-').reverse().join('/') : '-'}
                      </td>
                      <td className="p-3 font-mono text-xs text-blue-600 whitespace-nowrap">{o.order_no}</td>
                      <td className="p-3 font-medium whitespace-nowrap">
                        <div>{o.customers?.name || '-'}</div>
                        {o.customers?.facebook_name && (
                          <div className="text-[11px] text-blue-500 mt-0.5">📘 {o.customers.facebook_name}</div>
                        )}
                      </td>
                      <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{o.customers?.tel || '-'}</td>
                      <td className="p-3 text-xs text-slate-500 max-w-[200px] truncate">{o.raw_prod || '-'}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${o.payment_method === 'COD' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                          {o.payment_method || '-'}
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold text-slate-800">฿{fmt(o.total_thb || 0)}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isTransfer || paid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {isTransfer || paid ? '✓ รับเงินแล้ว' : 'รอรับเงิน'}
                        </span>
                      </td>
                      <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                        <button onClick={() => openSlip(o)}
                          className={`text-lg transition hover:scale-110 ${o.slip_image ? 'opacity-100' : 'opacity-30 hover:opacity-60'}`}
                          title={o.slip_image ? 'ดูสลิป' : 'อัพโหลดสลิป'}>
                          🖼
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Slip Modal ── */}
      {slipModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
          onClick={() => setSlipModal(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800">🖼 สลิปการโอนเงิน</h3>
              <button onClick={() => setSlipModal(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            {slipModal.image ? (
              <div className="space-y-3">
                <img src={slipModal.image} alt="slip" className="w-full rounded-xl border object-contain max-h-80"/>
                <div className="flex gap-2">
                  <label className="flex-1 py-2 text-center bg-blue-50 text-blue-600 rounded-lg text-sm cursor-pointer hover:bg-blue-100 font-medium">
                    🔄 เปลี่ยนรูป
                    <input type="file" accept="image/*" className="hidden" onChange={handleSlipUpload}/>
                  </label>
                  <button onClick={deleteSlip}
                    className="px-4 py-2 bg-red-50 text-red-500 rounded-lg text-sm hover:bg-red-100">
                    🗑 ลบ
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400">
                  <div className="text-4xl mb-2">🖼</div>
                  <p className="text-sm">ยังไม่มีสลิป</p>
                </div>
                <label className="block w-full py-2.5 text-center bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600 font-medium">
                  {slipUploading ? 'กำลังอัพโหลด...' : '📷 อัพโหลดสลิป (ไม่เกิน 1.5 MB)'}
                  <input type="file" accept="image/*" className="hidden" onChange={handleSlipUpload} disabled={slipUploading}/>
                </label>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
