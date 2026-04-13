import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Package, CheckCircle, XCircle, AlertCircle, Clock, RotateCcw } from 'lucide-react';

const STATUSES = [
  { v: 'รอรับพัสดุ',          color: 'bg-slate-100 text-slate-600',    dot: 'bg-slate-400' },
  { v: 'อยู่ระหว่างจัดส่ง',   color: 'bg-blue-100 text-blue-700',      dot: 'bg-blue-500'  },
  { v: 'ส่งสำเร็จ',            color: 'bg-green-100 text-green-700',    dot: 'bg-green-500' },
  { v: 'ไม่มีคนรับ',           color: 'bg-orange-100 text-orange-700',  dot: 'bg-orange-500'},
  { v: 'ส่งคืน',               color: 'bg-red-100 text-red-700',        dot: 'bg-red-500'   },
];

const CARRIER_LABEL: Record<string, string> = {
  B: 'Flash',
  A: 'ไปรษณีย์',
  C: 'ไปรษณีย์',
};

type ResultRow = {
  tracking_no: string;
  found: boolean;
  order_id?: string;
  order_no?: string;
  customer_name?: string;
  raw_prod?: string;
  route?: string;
  parcel_status?: string;
  newStatus?: string;
};

export default function ParcelTracking() {
  const [input, setInput]       = useState('');
  const [results, setResults]   = useState<ResultRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState('');

  const parseTrackings = (raw: string): string[] => {
    return raw
      .split(/[\n,;\s]+/)
      .map(s => s.trim())
      .filter(s => s.length > 4)
      .slice(0, 20); // max 20
  };

  const handleSearch = async () => {
    const trackings = parseTrackings(input);
    if (trackings.length === 0) return;
    setSearching(true); setSaveMsg('');

    const { data } = await supabase
      .from('orders')
      .select('id, order_no, raw_prod, route, tracking_no, parcel_status, customers(name)')
      .in('tracking_no', trackings);

    const rows: ResultRow[] = trackings.map(t => {
      const order = (data || []).find((o: any) => o.tracking_no === t);
      if (!order) return { tracking_no: t, found: false };
      return {
        tracking_no: t,
        found: true,
        order_id: order.id,
        order_no: order.order_no,
        customer_name: (order.customers as any)?.name || '-',
        raw_prod: order.raw_prod || '-',
        route: order.route,
        parcel_status: order.parcel_status || 'รอรับพัสดุ',
        newStatus: order.parcel_status || 'รอรับพัสดุ',
      };
    });

    setResults(rows);
    setSearching(false);
  };

  const updateStatus = (tracking: string, status: string) => {
    setResults(prev => prev.map(r => r.tracking_no === tracking ? { ...r, newStatus: status } : r));
  };

  const handleSaveAll = async () => {
    const toSave = results.filter(r => r.found && r.newStatus !== r.parcel_status);
    if (toSave.length === 0) { setSaveMsg('ไม่มีสถานะที่เปลี่ยนแปลง'); return; }
    setSaving(true);
    for (const r of toSave) {
      await supabase.from('orders')
        .update({ parcel_status: r.newStatus })
        .eq('id', r.order_id!);
    }
    // refresh
    const trackings = results.map(r => r.tracking_no);
    const { data } = await supabase
      .from('orders').select('tracking_no, parcel_status')
      .in('tracking_no', trackings);
    setResults(prev => prev.map(r => {
      const o = (data||[]).find((x:any) => x.tracking_no === r.tracking_no);
      return o ? { ...r, parcel_status: o.parcel_status, newStatus: o.parcel_status } : r;
    }));
    setSaving(false);
    setSaveMsg(`✓ บันทึกสำเร็จ ${toSave.length} รายการ`);
  };

  const statusInfo = (v: string) => STATUSES.find(s => s.v === v) || STATUSES[0];

  const found  = results.filter(r => r.found).length;
  const notFound = results.filter(r => !r.found).length;
  const changed = results.filter(r => r.found && r.newStatus !== r.parcel_status).length;

  return (
    <div className="flex flex-col h-full max-w-5xl mx-auto">
      {/* Header */}
      <div className="shrink-0 mb-4">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Package size={22} className="text-blue-500"/> ติดตามพัสดุ
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">วางเลข Tracking ได้สูงสุด 20 เลขต่อครั้ง</p>
      </div>

      {/* Input */}
      <div className="shrink-0 bg-white rounded-xl shadow-sm border p-4 mb-4">
        <label className="text-xs font-semibold text-slate-600 block mb-2">
          วางเลข Tracking (คั่นด้วย Enter, comma, หรือ space)
        </label>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={5}
          placeholder={'TH001234\nTH005678\nWA120121495TH\n...'}
          className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
        />
        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
          <span className="text-xs text-slate-400">
            {parseTrackings(input).length} เลข
            {parseTrackings(input).length >= 20 && <span className="text-orange-500 ml-1">(ครบ 20 แล้ว)</span>}
          </span>
          <button
            onClick={handleSearch}
            disabled={searching || parseTrackings(input).length === 0}
            className="px-5 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium flex items-center gap-2 disabled:opacity-50">
            <Search size={15}/>
            {searching ? 'กำลังค้นหา...' : `ค้นหา ${parseTrackings(input).length > 0 ? parseTrackings(input).length : ''} รายการ`}
          </button>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="shrink-0 flex gap-3 mb-3 flex-wrap">
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-green-700">
              <CheckCircle size={14}/> พบ {found} รายการ
            </div>
            {notFound > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-red-700">
                <XCircle size={14}/> ไม่พบ {notFound} รายการ
              </div>
            )}
            {changed > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-orange-700">
                <AlertCircle size={14}/> เปลี่ยนสถานะ {changed} รายการ
              </div>
            )}
            {saveMsg && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700">
                {saveMsg}
              </div>
            )}
          </div>

          {/* Table */}
          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm w-full" style={{minWidth:'780px'}}>
              <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-left whitespace-nowrap">Tracking No.</th>
                  <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
                  <th className="p-3 text-left whitespace-nowrap">ลูกค้า</th>
                  <th className="p-3 text-left">สินค้า</th>
                  <th className="p-3 text-center whitespace-nowrap">ขนส่ง</th>
                  <th className="p-3 text-center whitespace-nowrap" style={{minWidth:'200px'}}>สถานะพัสดุ</th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.tracking_no}
                    className={`border-b ${!r.found ? 'bg-red-50' : r.newStatus !== r.parcel_status ? 'bg-orange-50' : 'hover:bg-blue-50'}`}>
                    <td className="p-3 font-mono text-xs font-bold text-blue-600 whitespace-nowrap">{r.tracking_no}</td>
                    {!r.found ? (
                      <td colSpan={4} className="p-3 text-red-500 text-xs flex items-center gap-1.5">
                        <XCircle size={13}/> ไม่พบในระบบ
                      </td>
                    ) : (
                      <>
                        <td className="p-3 font-mono text-xs text-slate-500 whitespace-nowrap">{r.order_no}</td>
                        <td className="p-3 font-medium whitespace-nowrap">{r.customer_name}</td>
                        <td className="p-3 text-xs text-slate-500 max-w-[160px] truncate">{r.raw_prod}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            r.route === 'B' ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {CARRIER_LABEL[r.route || ''] || r.route || '-'}
                          </span>
                        </td>
                      </>
                    )}
                    <td className="p-3 text-center">
                      {r.found && (
                        <div className="flex items-center gap-1.5 justify-center">
                          <select
                            value={r.newStatus}
                            onChange={e => updateStatus(r.tracking_no, e.target.value)}
                            className={`border rounded-lg px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-300 ${statusInfo(r.newStatus || '').color}`}>
                            {STATUSES.map(s => (
                              <option key={s.v} value={s.v}>{s.v}</option>
                            ))}
                          </select>
                          {r.newStatus !== r.parcel_status && (
                            <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" title="มีการเปลี่ยนแปลง"/>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Save button */}
          <div className="shrink-0 flex justify-end gap-3 mt-3">
            <button
              onClick={() => { setResults([]); setInput(''); setSaveMsg(''); }}
              className="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-300 flex items-center gap-2">
              <RotateCcw size={14}/> ล้างทั้งหมด
            </button>
            <button
              onClick={handleSaveAll}
              disabled={saving || changed === 0}
              className="px-6 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium text-sm flex items-center gap-2 disabled:opacity-50">
              <CheckCircle size={15}/>
              {saving ? 'กำลังบันทึก...' : `บันทึกสถานะทั้งหมด${changed > 0 ? ` (${changed})` : ''}`}
            </button>
          </div>
        </>
      )}

      {/* Empty state */}
      {results.length === 0 && !searching && (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-3">
          <Package size={56} strokeWidth={1}/>
          <p className="text-sm">วางเลข Tracking แล้วกดค้นหา</p>
          <div className="flex gap-2 mt-1">
            {STATUSES.map(s => (
              <span key={s.v} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${s.color}`}>{s.v}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
