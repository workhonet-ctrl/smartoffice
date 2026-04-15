import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, Upload, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type IncomeTab = 'cod' | 'transfer' | 'all' | 'cod-file';

// ── COD File Import ───────────────────────────────────────────
type ImportRow  = { tracking: string; amount: number; name: string; raw: Record<string, any> };
type MatchResult = { tracking: string; amount: number; name: string; orderId?: string; orderNo?: string; customer?: string; status: 'matched' | 'not_found' };

function CodFilePanel() {
  const fileRef = useRef<HTMLInputElement>(null);

  // raw import state
  const [columns,    setColumns]    = useState<string[]>([]);
  const [rawRows,    setRawRows]    = useState<Record<string, any>[]>([]);
  const [fileName,   setFileName]   = useState('');

  // mapping
  const [mapTracking, setMapTracking] = useState('');
  const [mapAmount,   setMapAmount]   = useState('');
  const [mapName,     setMapName]     = useState('');
  const [showMapping, setShowMapping] = useState(false);

  // results
  const [results,   setResults]   = useState<MatchResult[]>([]);
  const [matching,  setMatching]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [saveMsg,   setSaveMsg]   = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResults([]); setSaveMsg('');

    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf);

    // หา sheet ที่มีข้อมูล tracking — ลอง COD Detail ก่อน แล้ว sheet แรก
    let sheet = wb.Sheets['COD Detail'] || wb.Sheets['Matching Tracking Number'] || wb.Sheets[wb.SheetNames[0]];
    const json: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (json.length === 0) return;
    const cols = Object.keys(json[0]);
    setColumns(cols);
    setRawRows(json);

    // auto-detect columns
    const trackCol = cols.find(c => /tracking/i.test(c)) || '';
    const amtCol   = cols.find(c => /amount|cod/i.test(c) && !/order|sub/i.test(c)) || '';
    const nameCol  = cols.find(c => /recipient|name/i.test(c)) || '';
    setMapTracking(trackCol);
    setMapAmount(amtCol);
    setMapName(nameCol);
    setShowMapping(true);
  };

  const handleMatch = async () => {
    if (!mapTracking) return;
    setMatching(true); setResults([]);

    // parse rows
    const parsed: ImportRow[] = rawRows
      .map(r => ({
        tracking: String(r[mapTracking] || '').trim(),
        amount:   parseFloat(String(r[mapAmount] || '0').replace(/[^0-9.]/g, '')) || 0,
        name:     String(r[mapName] || '').trim(),
        raw:      r,
      }))
      .filter(r => r.tracking.length > 4);

    // query orders by tracking
    const trackings = parsed.map(p => p.tracking);
    const { data: orders } = await supabase.from('orders')
      .select('id, order_no, tracking_no, customers(name)')
      .in('tracking_no', trackings);

    const orderMap: Record<string, any> = {};
    (orders || []).forEach((o: any) => { orderMap[o.tracking_no] = o; });

    const res: MatchResult[] = parsed.map(p => {
      const o = orderMap[p.tracking];
      return {
        tracking: p.tracking, amount: p.amount, name: p.name,
        orderId:  o?.id,
        orderNo:  o?.order_no,
        customer: (o?.customers as any)?.name,
        status:   o ? 'matched' : 'not_found',
      };
    });

    setResults(res);
    setMatching(false);
  };

  const handleSave = async () => {
    const matched = results.filter(r => r.status === 'matched');
    if (!matched.length) return;
    setSaving(true);
    const ids = matched.map(r => r.orderId!);
    await supabase.from('orders').update({ payment_status: 'ชำระแล้ว' }).in('id', ids);
    setSaveMsg(`✓ อัพเดต ${matched.length} รายการ เป็น "ชำระแล้ว"`);
    setSaving(false);
  };

  const matched   = results.filter(r => r.status === 'matched').length;
  const notFound  = results.filter(r => r.status === 'not_found').length;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">

      {/* Upload zone */}
      <div className="shrink-0 border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-blue-400 hover:bg-blue-50 transition cursor-pointer"
        onClick={() => fileRef.current?.click()}>
        <Upload size={28} className="mx-auto text-slate-400 mb-2"/>
        <p className="font-medium text-slate-600">คลิกเพื่ออัพโหลดไฟล์ COD จาก Flash / ไปรษณีย์</p>
        <p className="text-xs text-slate-400 mt-1">รองรับ .xlsx, .xls</p>
        {fileName && <p className="text-xs text-blue-600 mt-2 font-medium">📄 {fileName}</p>}
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile}/>
      </div>

      {/* Column mapping modal */}
      {showMapping && columns.length > 0 && (
        <div className="shrink-0 bg-white rounded-xl shadow border p-4">
          <div className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <AlertCircle size={15} className="text-orange-500"/> เลือก Column ที่ตรงกัน
            <span className="text-xs text-slate-400 font-normal ml-1">({rawRows.length} แถว)</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Tracking No. *', val: mapTracking, set: setMapTracking },
              { label: 'ยอดเงิน (COD)',  val: mapAmount,   set: setMapAmount },
              { label: 'ชื่อลูกค้า',      val: mapName,     set: setMapName },
            ].map(f => (
              <div key={f.label}>
                <label className="text-xs font-semibold text-slate-500 block mb-1">{f.label}</label>
                <select value={f.val} onChange={e => f.set(e.target.value)}
                  className="w-full border rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="">— ไม่ระบุ —</option>
                  {columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ))}
          </div>

          {/* Preview */}
          {rawRows.length > 0 && mapTracking && (
            <div className="mt-3 bg-slate-50 rounded-lg p-2 text-xs text-slate-500">
              ตัวอย่าง: Tracking = <span className="font-mono text-blue-600">{String(rawRows[0][mapTracking] || '-')}</span>
              {mapAmount && <> · ยอด = <span className="font-semibold text-green-600">{rawRows[0][mapAmount]}</span></>}
              {mapName   && <> · ชื่อ = <span className="text-slate-700">{rawRows[0][mapName]}</span></>}
            </div>
          )}

          <button onClick={handleMatch} disabled={!mapTracking || matching}
            className="mt-3 px-5 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2">
            <RefreshCw size={13} className={matching ? 'animate-spin' : ''}/>
            {matching ? 'กำลังจับคู่...' : `จับคู่ ${rawRows.length} รายการ`}
          </button>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <>
          {/* Summary */}
          <div className="shrink-0 grid grid-cols-3 gap-3">
            <div className="bg-slate-50 border rounded-xl p-3 text-center">
              <div className="text-xs text-slate-500 mb-0.5">ทั้งหมด</div>
              <div className="text-2xl font-bold text-slate-700">{results.length}</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <div className="text-xs text-green-600 mb-0.5">จับคู่ได้</div>
              <div className="text-2xl font-bold text-green-700">{matched}</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
              <div className="text-xs text-red-500 mb-0.5">ไม่พบในระบบ</div>
              <div className="text-2xl font-bold text-red-600">{notFound}</div>
            </div>
          </div>

          {/* Action */}
          <div className="shrink-0 flex items-center gap-3">
            {saveMsg && <span className="text-sm text-green-600 font-medium">{saveMsg}</span>}
            {matched > 0 && !saveMsg && (
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 disabled:opacity-50 flex items-center gap-2">
                <CheckCircle size={14}/>
                {saving ? 'กำลังบันทึก...' : `บันทึก "${matched}" รายการ → ชำระแล้ว`}
              </button>
            )}
          </div>

          {/* Table */}
          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm w-full" style={{minWidth:'700px'}}>
              <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-center w-8">#</th>
                  <th className="p-3 text-center whitespace-nowrap">สถานะ</th>
                  <th className="p-3 text-left whitespace-nowrap">Tracking</th>
                  <th className="p-3 text-left whitespace-nowrap">ชื่อในไฟล์</th>
                  <th className="p-3 text-left whitespace-nowrap">ลูกค้าในระบบ</th>
                  <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
                  <th className="p-3 text-right whitespace-nowrap">ยอด (บาท)</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={r.tracking} className={`border-b ${r.status === 'matched' ? 'hover:bg-green-50' : 'bg-red-50'}`}>
                    <td className="p-3 text-center text-xs text-slate-400">{i + 1}</td>
                    <td className="p-3 text-center">
                      {r.status === 'matched'
                        ? <span className="flex items-center justify-center gap-1 text-green-600 text-xs"><CheckCircle size={13}/> พบ</span>
                        : <span className="flex items-center justify-center gap-1 text-red-500 text-xs"><XCircle size={13}/> ไม่พบ</span>
                      }
                    </td>
                    <td className="p-3 font-mono text-xs text-blue-600 whitespace-nowrap">{r.tracking}</td>
                    <td className="p-3 text-xs text-slate-500">{r.name || '-'}</td>
                    <td className="p-3 font-medium text-xs">{r.customer || '-'}</td>
                    <td className="p-3 font-mono text-xs text-slate-500">{r.orderNo || '-'}</td>
                    <td className="p-3 text-right font-bold text-xs">
                      {r.amount > 0 ? `฿${fmt(r.amount)}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main FinanceIncome ────────────────────────────────────────
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
      .order('order_date', { ascending: false });

    if (tab === 'cod') {
      q = q.eq('payment_method', 'COD')
           .in('order_status', ['ส่งสินค้าแล้ว', 'ส่งไปรษณีย์', 'กำลังแพ็ค', 'แพ็คสินค้า']);
    } else if (tab === 'transfer') {
      q = q.neq('payment_method', 'COD')
           .in('order_status', ['ส่งสินค้าแล้ว', 'ส่งไปรษณีย์', 'กำลังแพ็ค', 'แพ็คสินค้า']);
    } else {
      return;
    }

    const { data } = await q;
    setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => { if (tab !== 'cod-file') loadOrders(); }, [tab]);

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
      {tab === 'cod-file' && <CodFilePanel />}

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
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={9} className="p-8 text-center text-slate-400">กำลังโหลด...</td></tr>}
                {!loading && orders.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-400">ไม่มีข้อมูล</td></tr>}
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
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isTransfer || paid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {isTransfer || paid ? '✓ รับเงินแล้ว' : 'รอรับเงิน'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
