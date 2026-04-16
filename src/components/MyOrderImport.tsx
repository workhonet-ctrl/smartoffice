import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Upload, RefreshCw, X } from 'lucide-react';
import * as XLSX from 'xlsx';

// ── Constants ─────────────────────────────────────────────────

const SUPABASE_IN_LIMIT = 500;
const STORAGE_KEY       = 'myorder_import_state';

function readStorage(key: string) {
  try {
    const s = sessionStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────

type TrackingRow = {
  tracking:  string;
  page:      string;   // ชื่อเพจ/สินค้า (col E)
  consignee: string;   // ชื่อผู้รับ (col G)
  weight:    number;   // น้ำหนัก kg (col K)
  cod:       number;   // COD amount (col M)
  cod_fee:   number;   // Total COD Fee (col N)
  freight:   number;   // ค่าขนส่ง (col P)
  total:     number;   // Total Charge (col Q)
  // จากการจับคู่กับ orders
  order_no?: string;
  customer?: string;
  raw_prod?: string;
  matched:   boolean;
};

type FileInfo = {
  name: string;
  rows: number;
};

type ParseResult = {
  trackingMap: Record<string, TrackingRow>;
  fileInfo: FileInfo;
};

// ── Pure helpers ──────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parseNum(val: unknown): number {
  return Math.abs(parseFloat(String(val ?? '0').replace(/[^0-9.-]/g, '')) || 0);
}

/**
 * MYORDER format:
 *   Sheet "Total Charge Detail"
 *   Row 0  = header (ไม่ต้อง skip)
 *   Row 1+ = data
 *
 *   col[5]  F = Tracking No.
 *   col[4]  E = Page (ชื่อเพจ)
 *   col[6]  G = Consignee
 *   col[10] K = Weight (kg)
 *   col[12] M = COD Amount
 *   col[13] N = Total COD Fee
 *   col[15] P = Freight  ← ค่าขนส่งหลัก
 *   col[16] Q = Total Charge
 */
function parseSheet(buffer: ArrayBuffer, fileName: string): ParseResult {
  const wb    = XLSX.read(buffer, { type: 'array' });
  const ws    = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // skip header row (index 0); กรองแถวที่ไม่มี tracking
  const dataRows = rows.slice(1).filter(r => (r as unknown[])[5]);

  const trackingMap: Record<string, TrackingRow> = {};

  for (const r of dataRows as unknown[][]) {
    const tracking = String(r[5] ?? '').trim();
    if (!tracking) continue;

    if (!trackingMap[tracking]) {
      trackingMap[tracking] = {
        tracking,
        page:      String(r[4]  ?? '').trim(),
        consignee: String(r[6]  ?? '').trim(),
        weight:    parseNum(r[10]),
        cod:       parseNum(r[12]),
        cod_fee:   parseNum(r[13]),
        freight:   parseNum(r[15]),
        total:     parseNum(r[16]),
        matched:   false,
      };
    } else {
      // กรณีมี tracking ซ้ำ (พิเศษ) — บวกรวม
      trackingMap[tracking].freight += parseNum(r[15]);
      trackingMap[tracking].total   += parseNum(r[16]);
      trackingMap[tracking].cod     += parseNum(r[12]);
      trackingMap[tracking].cod_fee += parseNum(r[13]);
    }
  }

  return {
    trackingMap,
    fileInfo: { name: fileName, rows: Object.keys(trackingMap).length },
  };
}

function mergeResults(
  prev: Record<string, TrackingRow>,
  results: ParseResult[],
): Record<string, TrackingRow> {
  const merged = { ...prev };
  for (const result of results) {
    for (const [key, incoming] of Object.entries(result.trackingMap)) {
      if (!merged[key]) {
        merged[key] = { ...incoming };
      } else {
        merged[key] = {
          ...merged[key],
          freight:  merged[key].freight  + incoming.freight,
          total:    merged[key].total    + incoming.total,
          cod:      merged[key].cod      + incoming.cod,
          cod_fee:  merged[key].cod_fee  + incoming.cod_fee,
        };
      }
    }
  }
  return merged;
}

// ── Component ─────────────────────────────────────────────────

export default function MyOrderImport() {
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Session persistence ─────────────────────────────────────
  const _s = readStorage(STORAGE_KEY);
  const [trackingMap, setTrackingMap] = useState<Record<string, TrackingRow>>(() => _s?.trackingMap ?? {});
  const [fileInfos, setFileInfos]     = useState<FileInfo[]>(() => _s?.fileInfos ?? []);
  const [matched, setMatched]         = useState<boolean>(() => _s?.matched ?? false);
  const [matching, setMatching]       = useState(false);
  const [saving, setSaving]           = useState(false);
  const [loadingDB, setLoadingDB]     = useState(false);
  const [isSaved, setIsSaved]         = useState(false);
  const [search, setSearch]           = useState('');
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ trackingMap, fileInfos, matched }),
      );
    } catch {}
  }, [trackingMap, fileInfos, matched]);

  // ── File handling ───────────────────────────────────────────

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setError(null);

    const results: ParseResult[] = [];
    const errors: string[] = [];
    let pending = files.length;

    const finalize = () => {
      if (pending > 0) return;
      if (errors.length) setError(errors.join(' · '));
      if (results.length > 0) {
        setTrackingMap(prev => mergeResults(prev, results));
        setFileInfos(prev => [...prev, ...results.map(r => r.fileInfo)]);
        setMatched(false);
        setIsSaved(false);
      }
    };

    for (const file of files) {
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          results.push(parseSheet(ev.target!.result as ArrayBuffer, file.name));
        } catch (err) {
          console.error('Parse error:', file.name, err);
          errors.push(`อ่านไฟล์ "${file.name}" ไม่ได้`);
        } finally {
          pending--;
          finalize();
        }
      };
      reader.onerror = () => {
        errors.push(`เปิดไฟล์ "${file.name}" ล้มเหลว`);
        pending--;
        finalize();
      };
      reader.readAsArrayBuffer(file);
    }

    e.target.value = '';
  };

  // ── Save to Supabase ───────────────────────────────────────

  const handleSave = async () => {
    const rows = Object.values(trackingMap);
    if (!rows.length) return;
    setSaving(true);
    setError(null);

    try {
      const myorderRows = rows.map(r => ({
        tracking:    r.tracking,
        page:        r.page        || null,
        consignee:   r.consignee   || null,
        weight_kg:   r.weight,
        cod_thb:     r.cod,
        cod_fee_thb: r.cod_fee,
        freight_thb: r.freight,
        total_thb:   r.total,
        order_no:    r.order_no    ?? null,
        customer:    r.customer    ?? null,
        raw_prod:    r.raw_prod    ?? null,
        matched:     r.matched,
      }));

      const { error: e } = await supabase
        .from('shipping_myorder')
        .upsert(myorderRows, { onConflict: 'tracking' });
      if (e) throw e;

      setIsSaved(true);
    } catch (err: any) {
      setError(`บันทึกไม่สำเร็จ: ${err?.message ?? String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Load from Supabase ──────────────────────────────────────

  const handleLoad = async () => {
    setLoadingDB(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('shipping_myorder')
        .select('*')
        .order('imported_at', { ascending: false });
      if (e) throw e;

      const loaded: Record<string, TrackingRow> = {};
      for (const r of data ?? []) {
        loaded[r.tracking] = {
          tracking:  r.tracking,
          page:      r.page       ?? '',
          consignee: r.consignee  ?? '',
          weight:    Number(r.weight_kg),
          cod:       Number(r.cod_thb),
          cod_fee:   Number(r.cod_fee_thb),
          freight:   Number(r.freight_thb),
          total:     Number(r.total_thb),
          order_no:  r.order_no   ?? undefined,
          customer:  r.customer   ?? undefined,
          raw_prod:  r.raw_prod   ?? undefined,
          matched:   r.matched    ?? false,
        };
      }

      setTrackingMap(loaded);
      setFileInfos([{ name: '📂 โหลดจาก Supabase', rows: Object.keys(loaded).length }]);
      setMatched(Object.values(loaded).some(r => r.matched));
      setIsSaved(true);
    } catch (err: any) {
      setError(`โหลดไม่สำเร็จ: ${err?.message ?? String(err)}`);
    } finally {
      setLoadingDB(false);
    }
  };

  // ── Match with Supabase ─────────────────────────────────────

  const handleMatch = async () => {
    const trackings = Object.keys(trackingMap);
    if (!trackings.length) return;
    setMatching(true);
    setError(null);

    try {
      const batches: string[][] = [];
      for (let i = 0; i < trackings.length; i += SUPABASE_IN_LIMIT) {
        batches.push(trackings.slice(i, i + SUPABASE_IN_LIMIT));
      }

      const allData: any[] = [];
      for (const batch of batches) {
        const { data, error: qErr } = await supabase
          .from('orders')
          .select('tracking_no, order_no, customers(name), raw_prod')
          .in('tracking_no', batch);
        if (qErr) throw qErr;
        allData.push(...(data ?? []));
      }

      setTrackingMap(prev => {
        const updated = { ...prev };
        for (const o of allData) {
          if (updated[o.tracking_no]) {
            updated[o.tracking_no] = {
              ...updated[o.tracking_no],
              order_no: o.order_no,
              customer: o.customers?.name,
              raw_prod: o.raw_prod,
              matched:  true,
            };
          }
        }
        return updated;
      });

      setMatched(true);
      setIsSaved(false);
    } catch (err: any) {
      setError(`จับคู่ไม่สำเร็จ: ${err?.message ?? String(err)}`);
    } finally {
      setMatching(false);
    }
  };

  const resetMatch = () => {
    setMatched(false);
    setIsSaved(false);
    setTrackingMap(prev => {
      const reset = { ...prev };
      for (const k of Object.keys(reset)) {
        reset[k] = {
          ...reset[k],
          matched:  false,
          order_no: undefined,
          customer: undefined,
          raw_prod: undefined,
        };
      }
      return reset;
    });
  };

  const clearAll = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setTrackingMap({});
    setFileInfos([]);
    setMatched(false);
    setIsSaved(false);
    setSearch('');
    setError(null);
  };

  // ── Derived values ──────────────────────────────────────────

  const rows = Object.values(trackingMap);

  const filteredRows = rows.filter(r => {
    const q = search.toLowerCase();
    return (
      !q ||
      r.tracking.toLowerCase().includes(q) ||
      r.page.toLowerCase().includes(q) ||
      (r.order_no ?? '').toLowerCase().includes(q) ||
      (r.customer ?? '').toLowerCase().includes(q) ||
      (r.raw_prod ?? '').toLowerCase().includes(q)
    );
  });

  const totalFreight  = rows.reduce((s, r) => s + r.freight,  0);
  const totalCod      = rows.reduce((s, r) => s + r.cod,      0);
  const totalCodFee   = rows.reduce((s, r) => s + r.cod_fee,  0);
  const totalCharge   = rows.reduce((s, r) => s + r.total,    0);
  const cntMatched    = rows.filter(r => r.matched).length;
  const cntNotFound   = rows.filter(r => !r.matched).length;

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full gap-3">

      {/* Upload zone */}
      <div
        className="shrink-0 border-2 border-dashed border-slate-200 rounded-xl p-4 flex items-center gap-4
                   hover:border-purple-400 hover:bg-purple-50 transition cursor-pointer"
        onClick={() => fileRef.current?.click()}
      >
        <Upload size={22} className="text-slate-400 shrink-0" />
        <div className="flex-1">
          <p className="font-medium text-slate-600 text-sm">
            อัพโหลดไฟล์ MYORDER Excel (เลือกได้หลายไฟล์พร้อมกัน)
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            รองรับ: Total Charge Detail report · Sheet แรกของไฟล์
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          className="hidden"
          onChange={handleFiles}
        />
      </div>

      {/* Error banner */}
      {error && (
        <div className="shrink-0 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 flex items-center gap-2">
          <span className="font-medium">⚠</span>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="hover:text-red-900">
            <X size={12} />
          </button>
        </div>
      )}

      {/* File tags */}
      {fileInfos.length > 0 && (
        <div className="shrink-0 flex flex-wrap gap-2">
          {fileInfos.map((f, i) => (
            <span key={i}
              className="px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5
                         bg-purple-100 text-purple-700">
              📋 {f.name} · {f.rows} tracking
            </span>
          ))}
          <button
            onClick={clearAll}
            className="px-3 py-1.5 rounded-full text-xs bg-slate-100 text-slate-500
                       hover:bg-red-100 hover:text-red-600 flex items-center gap-1"
          >
            <X size={11} /> ล้างทั้งหมด
          </button>
        </div>
      )}

      {/* Summary cards */}
      {rows.length > 0 && (
        <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
            <div className="text-xs text-purple-700 font-semibold mb-1">🚚 ค่าขนส่ง (Freight)</div>
            <div className="text-lg font-bold text-purple-800">฿{fmt(totalFreight)}</div>
            <div className="text-xs text-purple-500">{rows.length} tracking</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <div className="text-xs text-blue-700 font-semibold mb-1">💰 ยอด COD</div>
            <div className="text-lg font-bold text-blue-800">฿{fmt(totalCod)}</div>
            <div className="text-xs text-blue-500">{rows.filter(r => r.cod > 0).length} รายการ</div>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
            <div className="text-xs text-orange-700 font-semibold mb-1">➕ ค่า COD Fee</div>
            <div className="text-lg font-bold text-orange-800">฿{fmt(totalCodFee)}</div>
            <div className="text-xs text-orange-500">รวม VAT 7%</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <div className="text-xs text-red-700 font-semibold mb-1">🧾 Total Charge</div>
            <div className="text-lg font-bold text-red-800">฿{fmt(totalCharge)}</div>
            <div className="text-xs text-red-500">Freight + COD Fee</div>
          </div>
        </div>
      )}

      {/* Actions */}
      {rows.length > 0 && (
        <div className="shrink-0 flex gap-2 items-center flex-wrap">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา Tracking / เพจ / ออเดอร์ / ลูกค้า..."
              className="pl-8 pr-3 py-2 border rounded-lg text-xs w-64 focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>

          {matched && (
            <div className="flex gap-2 text-xs">
              <span className="bg-green-100 text-green-700 px-3 py-1.5 rounded-full font-medium">
                ✓ จับคู่ได้ {cntMatched}
              </span>
              {cntNotFound > 0 && (
                <span className="bg-red-100 text-red-600 px-3 py-1.5 rounded-full font-medium">
                  ❌ ไม่พบ {cntNotFound}
                </span>
              )}
            </div>
          )}

          <button
            onClick={handleMatch}
            disabled={matching || matched}
            className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium
                       hover:bg-purple-600 disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw size={13} className={matching ? 'animate-spin' : ''} />
            {matched ? '✓ จับคู่แล้ว' : matching ? 'กำลังจับคู่...' : '🔗 จับคู่กับออเดอร์'}
          </button>

          {matched && (
            <button
              onClick={resetMatch}
              className="px-3 py-2 bg-slate-200 rounded-lg text-xs hover:bg-slate-300"
            >
              รีเซ็ตจับคู่
            </button>
          )}

          {rows.length > 0 && (
            <button
              onClick={handleSave}
              disabled={saving || isSaved}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                isSaved
                  ? 'bg-emerald-100 text-emerald-700 cursor-default'
                  : 'bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50'
              }`}
            >
              {saving ? '⏳ กำลังบันทึก...' : isSaved ? '✓ บันทึกแล้ว' : '💾 บันทึกลง Supabase'}
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
          <table className="text-xs w-full" style={{ minWidth: '1000px' }}>
            <thead className="bg-slate-800 text-slate-200 sticky top-0 z-10">
              <tr>
                <th className="p-3 text-left whitespace-nowrap">Tracking No.</th>
                <th className="p-3 text-left whitespace-nowrap">เพจ</th>
                <th className="p-3 text-left whitespace-nowrap">ผู้รับ</th>
                <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
                <th className="p-3 text-left whitespace-nowrap">ลูกค้า</th>
                <th className="p-3 text-left">สินค้า</th>
                <th className="p-3 text-right whitespace-nowrap">น้ำหนัก</th>
                <th className="p-3 text-right whitespace-nowrap">COD</th>
                <th className="p-3 text-right whitespace-nowrap">COD Fee</th>
                <th className="p-3 text-right whitespace-nowrap">Freight</th>
                <th className="p-3 text-right whitespace-nowrap">Total</th>
                {matched && <th className="p-3 text-center whitespace-nowrap">สถานะ</th>}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-slate-400">ไม่พบรายการ</td>
                </tr>
              )}
              {filteredRows.map(r => (
                <tr key={r.tracking}
                  className={`border-b ${
                    matched && !r.matched ? 'bg-red-50' :
                    matched &&  r.matched ? 'hover:bg-green-50' :
                                            'hover:bg-slate-50'
                  }`}>
                  <td className="p-3 font-mono text-purple-600 whitespace-nowrap">{r.tracking}</td>
                  <td className="p-3 text-slate-600 whitespace-nowrap max-w-[120px] truncate">{r.page}</td>
                  <td className="p-3 text-slate-500 whitespace-nowrap">{r.consignee}</td>
                  <td className="p-3 font-mono text-slate-600 whitespace-nowrap">{r.order_no ?? (matched ? '-' : '')}</td>
                  <td className="p-3 font-medium whitespace-nowrap">{r.customer ?? (matched ? '-' : '')}</td>
                  <td className="p-3 text-slate-500 max-w-[160px] truncate">{r.raw_prod ?? ''}</td>
                  <td className="p-3 text-right text-slate-500">{r.weight} kg</td>
                  <td className="p-3 text-right text-blue-700">{r.cod > 0 ? `฿${fmt(r.cod)}` : '-'}</td>
                  <td className="p-3 text-right text-orange-600">{r.cod_fee > 0 ? `฿${fmt(r.cod_fee)}` : '-'}</td>
                  <td className="p-3 text-right text-purple-700 font-medium">฿{fmt(r.freight)}</td>
                  <td className="p-3 text-right font-bold text-red-700">฿{fmt(r.total)}</td>
                  {matched && (
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        r.matched ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                      }`}>
                        {r.matched ? '✓ พบออเดอร์' : '❌ ไม่พบ'}
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 sticky bottom-0 font-bold text-[11px]">
              <tr>
                <td className="p-3 text-slate-600" colSpan={6}>
                  รวม {filteredRows.length} tracking
                </td>
                <td className="p-3 text-right text-slate-500">
                  {filteredRows.reduce((s, r) => s + r.weight, 0).toFixed(2)} kg
                </td>
                <td className="p-3 text-right text-blue-700">
                  ฿{fmt(filteredRows.reduce((s, r) => s + r.cod, 0))}
                </td>
                <td className="p-3 text-right text-orange-600">
                  ฿{fmt(filteredRows.reduce((s, r) => s + r.cod_fee, 0))}
                </td>
                <td className="p-3 text-right text-purple-700">
                  ฿{fmt(filteredRows.reduce((s, r) => s + r.freight, 0))}
                </td>
                <td className="p-3 text-right text-red-700">
                  ฿{fmt(filteredRows.reduce((s, r) => s + r.total, 0))}
                </td>
                {matched && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-300">
          <Upload size={48} strokeWidth={1} />
          <div className="text-center">
            <p className="text-sm font-medium text-slate-400">
              อัพโหลดไฟล์ MYORDER Excel เพื่อวิเคราะห์ค่าขนส่ง
            </p>
            <p className="text-xs text-slate-300 mt-1">
              ไฟล์ Total Charge Detail · รองรับหลายไฟล์พร้อมกัน
            </p>
          </div>
          <div className="flex gap-2 text-xs mt-1">
            <span className="bg-purple-50 border border-purple-100 text-purple-500 px-3 py-1.5 rounded-lg">
              🚚 Freight
            </span>
            <span className="bg-blue-50 border border-blue-100 text-blue-500 px-3 py-1.5 rounded-lg">
              💰 COD
            </span>
            <span className="bg-orange-50 border border-orange-100 text-orange-500 px-3 py-1.5 rounded-lg">
              ➕ COD Fee
            </span>
          </div>
          <button
            onClick={handleLoad}
            disabled={loadingDB}
            className="mt-2 px-5 py-2.5 bg-purple-500 text-white rounded-lg text-sm font-medium
                       hover:bg-purple-600 disabled:opacity-60 flex items-center gap-2"
          >
            {loadingDB ? '⏳ กำลังโหลด...' : '📂 โหลดข้อมูลที่บันทึกไว้'}
          </button>
        </div>
      )}

    </div>
  );
}
