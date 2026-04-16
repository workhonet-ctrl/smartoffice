import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Upload, RefreshCw, X } from 'lucide-react';
import * as XLSX from 'xlsx';

// ── Constants ─────────────────────────────────────────────────

const SUPABASE_IN_LIMIT = 500;                    // safe batch size for .in() queries
const STORAGE_KEY       = 'flash_import_state';   // sessionStorage key

// ── Types ─────────────────────────────────────────────────────

type TrackingRow = {
  tracking: string;
  date: string;
  base: number;
  extra: number;
  total: number;
  order_no?: string;
  customer?: string;
  raw_prod?: string;
  matched: boolean;
};

type TopupRow = {
  date: string;
  amount: number;
};

type FileType = 'ค่าพัสดุ' | 'ค่าพัสดุเพิ่มเติม' | 'โอนเงิน Flash Pay' | 'ไม่รู้จัก';

type FileInfo = {
  name: string;
  type: FileType;
  rows: number;
};

type ParseResult = {
  trackingMap: Record<string, TrackingRow>;
  topups: TopupRow[];
  fileInfo: FileInfo;
};

// ── Pure helpers ──────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** แปลงค่าใดก็ได้ → ตัวเลขบวก */
function parseNum(val: unknown): number {
  return Math.abs(parseFloat(String(val ?? '0').replace(/[^0-9.-]/g, '')) || 0);
}

/** ตัดเวลาออก เหลือแค่วันที่ */
function parseDate(val: unknown): string {
  return String(val ?? '').split(' ')[0];
}

/**
 * อ่าน ArrayBuffer ของไฟล์ Flash Excel แล้วคืน tracking rows + topups
 *
 * FIX 1: รับ ArrayBuffer แทน BinaryString (readAsBinaryString deprecated)
 * FIX 2: นับ dominant type แทน last-row-wins
 */
function parseSheet(buffer: ArrayBuffer, fileName: string): ParseResult {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // ข้ามแถว 0 (header) และแถว 1 (สรุป "ทั้งหมด"); กรองแถวที่ col B ว่าง
  const dataRows = allRows.slice(2).filter(r => (r as unknown[])[1]);

  const trackingMap: Record<string, TrackingRow> = {};
  const topups: TopupRow[] = [];
  const typeCounts: Record<string, number> = {};

  for (const r of dataRows as unknown[][]) {
    const type = String(r[1] ?? '').trim();
    const tracking = String(r[3] ?? '').trim();
    const date = parseDate(r[0]);

    if (type === 'ค่าพัสดุ') {
      if (!tracking) continue;
      const amount = parseNum(r[7]); // col H
      if (!trackingMap[tracking]) {
        trackingMap[tracking] = { tracking, date, base: 0, extra: 0, total: 0, matched: false };
      }
      trackingMap[tracking].base += amount;
      trackingMap[tracking].total = trackingMap[tracking].base + trackingMap[tracking].extra;
      typeCounts['ค่าพัสดุ'] = (typeCounts['ค่าพัสดุ'] ?? 0) + 1;

    } else if (type === 'ค่าพัสดุเพิ่มเติม') {
      if (!tracking) continue;
      const amount = parseNum(r[9]); // col J
      if (!trackingMap[tracking]) {
        trackingMap[tracking] = { tracking, date, base: 0, extra: 0, total: 0, matched: false };
      }
      trackingMap[tracking].extra += amount;
      trackingMap[tracking].total = trackingMap[tracking].base + trackingMap[tracking].extra;
      typeCounts['ค่าพัสดุเพิ่มเติม'] = (typeCounts['ค่าพัสดุเพิ่มเติม'] ?? 0) + 1;

    } else if (type === 'โอนเงิน Flash Pay') {
      const amount = parseNum(r[33]); // col AH
      if (amount > 0) {
        topups.push({ date, amount });
        typeCounts['โอนเงิน Flash Pay'] = (typeCounts['โอนเงิน Flash Pay'] ?? 0) + 1;
      }
    }
  }

  // FIX 2: dominant type = type ที่มีแถวมากที่สุดในไฟล์นี้
  const dominantType = (
    Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'ไม่รู้จัก'
  ) as FileType;

  const rowCount = Object.values(typeCounts).reduce((s, n) => s + n, 0);

  return {
    trackingMap,
    topups,
    fileInfo: { name: fileName, type: dominantType, rows: rowCount },
  };
}

/** Merge ParseResult[] เข้า tracking map เดิม (immutable) */
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
          base: merged[key].base + incoming.base,
          extra: merged[key].extra + incoming.extra,
          total: merged[key].base + incoming.base + merged[key].extra + incoming.extra,
        };
      }
    }
  }
  return merged;
}

// ── Component ─────────────────────────────────────────────────

export default function FlashShippingImport() {
  const fileRef = useRef<HTMLInputElement>(null);

  const [trackingMap, setTrackingMap] = useState<Record<string, TrackingRow>>({});
  const [topups, setTopups]           = useState<TopupRow[]>([]);
  const [fileInfos, setFileInfos]     = useState<FileInfo[]>([]);
  const [matching, setMatching]       = useState(false);
  const [matched, setMatched]         = useState(false);
  const [search, setSearch]           = useState('');
  const [error, setError]             = useState<string | null>(null);

  // ── Session persistence ─────────────────────────────────────
  // โหลดข้อมูลจาก sessionStorage เมื่อ component mount
  // (ข้อมูลยังอยู่แม้เปลี่ยนหน้า แต่จะหายเมื่อปิด browser tab)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const { trackingMap: tm, topups: tp, fileInfos: fi, matched: m } = JSON.parse(saved);
      if (tm) setTrackingMap(tm);
      if (tp) setTopups(tp);
      if (fi) setFileInfos(fi);
      if (m  !== undefined) setMatched(m);
    } catch {
      // ถ้า parse ไม่ได้ (corrupt data) ล้างทิ้ง
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // บันทึกทุกครั้งที่ state เปลี่ยน
  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ trackingMap, topups, fileInfos, matched }),
      );
    } catch {
      // sessionStorage เต็ม (ข้อมูลมากเกินไป) — ไม่ crash แต่ไม่บันทึก
    }
  }, [trackingMap, topups, fileInfos, matched]);

  // ── File handling ───────────────────────────────────────────

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setError(null);

    const results: ParseResult[] = [];
    const errors: string[] = [];
    let pending = files.length;

    const finalize = () => {
      if (pending > 0) return; // ยังรอไฟล์อื่น

      if (errors.length) setError(errors.join(' · '));

      if (results.length > 0) {
        // FIX 5: functional update → ไม่มี stale closure แม้กดเพิ่มไฟล์หลายรอบ
        setTrackingMap(prev => mergeResults(prev, results));
        setTopups(prev => [...prev, ...results.flatMap(r => r.topups)]);
        setFileInfos(prev => [...prev, ...results.map(r => r.fileInfo)]);
        setMatched(false);
      }
    };

    for (const file of files) {
      const reader = new FileReader();

      reader.onload = ev => {
        try {
          const result = parseSheet(ev.target!.result as ArrayBuffer, file.name);
          results.push(result);
        } catch (err) {
          console.error('Parse error:', file.name, err);
          errors.push(`อ่านไฟล์ "${file.name}" ไม่ได้`);
        } finally {
          pending--;
          finalize();
        }
      };

      // FIX 3: เพิ่ม onerror — ก่อนหน้านี้ถ้า FileReader crash, pending ไม่ลดเลย
      reader.onerror = () => {
        errors.push(`เปิดไฟล์ "${file.name}" ล้มเหลว`);
        pending--;
        finalize();
      };

      // FIX 1: readAsArrayBuffer แทน readAsBinaryString (deprecated)
      reader.readAsArrayBuffer(file);
    }

    e.target.value = '';
  };

  // ── Match with Supabase ─────────────────────────────────────

  const handleMatch = async () => {
    const trackings = Object.keys(trackingMap);
    if (!trackings.length) return;

    setMatching(true);
    setError(null);

    try {
      // FIX 4: แบ่ง batch เพื่อหลีกเลี่ยง Supabase .in() limit (~1000)
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
              customer:  o.customers?.name,
              raw_prod:  o.raw_prod,
              matched:   true,
            };
          }
        }
        return updated;
      });

      setMatched(true);
    } catch (err: any) {
      setError(`จับคู่ไม่สำเร็จ: ${err?.message ?? String(err)}`);
    } finally {
      setMatching(false);
    }
  };

  const resetMatch = () => {
    setMatched(false);
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
    sessionStorage.removeItem(STORAGE_KEY); // ล้าง storage ด้วย
    setTrackingMap({});
    setTopups([]);
    setFileInfos([]);
    setMatched(false);
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
      (r.order_no ?? '').toLowerCase().includes(q) ||
      (r.customer ?? '').toLowerCase().includes(q) ||
      (r.raw_prod ?? '').toLowerCase().includes(q)
    );
  });

  const totalBase   = rows.reduce((s, r) => s + r.base,  0);
  const totalExtra  = rows.reduce((s, r) => s + r.extra, 0);
  const totalShip   = rows.reduce((s, r) => s + r.total, 0);
  const totalTopup  = topups.reduce((s, t) => s + t.amount, 0);
  const cntMatched  = rows.filter(r => r.matched).length;
  const cntNotFound = rows.filter(r => !r.matched).length;

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full gap-3">

      {/* Upload zone */}
      <div
        className="shrink-0 border-2 border-dashed border-slate-200 rounded-xl p-4 flex items-center gap-4
                   hover:border-blue-400 hover:bg-blue-50 transition cursor-pointer"
        onClick={() => fileRef.current?.click()}
      >
        <Upload size={22} className="text-slate-400 shrink-0" />
        <div className="flex-1">
          <p className="font-medium text-slate-600 text-sm">
            อัพโหลดไฟล์ Flash Excel (เลือกได้หลายไฟล์พร้อมกัน)
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            รองรับ: ค่าพัสดุ · ค่าพัสดุเพิ่มเติม · โอนเงิน Flash Pay
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
            <span
              key={i}
              className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 ${
                f.type === 'ค่าพัสดุ'           ? 'bg-blue-100 text-blue-700'     :
                f.type === 'ค่าพัสดุเพิ่มเติม'  ? 'bg-orange-100 text-orange-700' :
                f.type === 'โอนเงิน Flash Pay'  ? 'bg-green-100 text-green-700'   :
                                                   'bg-slate-100 text-slate-500'
              }`}
            >
              {f.type === 'ค่าพัสดุ'           && '📦'}
              {f.type === 'ค่าพัสดุเพิ่มเติม'  && '➕'}
              {f.type === 'โอนเงิน Flash Pay'  && '💳'}
              {f.name} · {f.rows} แถว
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
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <div className="text-xs text-green-700 font-semibold mb-1">💳 เติม Flash Pay</div>
            <div className="text-lg font-bold text-green-800">฿{fmt(totalTopup)}</div>
            <div className="text-xs text-green-500">{topups.length} ครั้ง</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <div className="text-xs text-blue-700 font-semibold mb-1">📦 ค่าพัสดุ</div>
            <div className="text-lg font-bold text-blue-800">฿{fmt(totalBase)}</div>
            <div className="text-xs text-blue-500">{rows.filter(r => r.base > 0).length} tracking</div>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
            <div className="text-xs text-orange-700 font-semibold mb-1">➕ ค่าพัสดุเพิ่มเติม</div>
            <div className="text-lg font-bold text-orange-800">฿{fmt(totalExtra)}</div>
            <div className="text-xs text-orange-500">{rows.filter(r => r.extra > 0).length} tracking</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <div className="text-xs text-red-700 font-semibold mb-1">🚚 ค่าขนส่งรวม</div>
            <div className="text-lg font-bold text-red-800">฿{fmt(totalShip)}</div>
            <div className="text-xs text-red-500">{rows.length} tracking</div>
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
              placeholder="ค้นหา Tracking / ออเดอร์ / ลูกค้า..."
              className="pl-8 pr-3 py-2 border rounded-lg text-xs w-56 focus:outline-none focus:ring-2 focus:ring-blue-300"
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
            className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium
                       hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
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
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
          <table className="text-xs w-full" style={{ minWidth: '900px' }}>
            <thead className="bg-slate-800 text-slate-200 sticky top-0 z-10">
              <tr>
                <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                <th className="p-3 text-left whitespace-nowrap">Tracking No.</th>
                <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
                <th className="p-3 text-left whitespace-nowrap">ลูกค้า</th>
                <th className="p-3 text-left">สินค้า</th>
                <th className="p-3 text-right whitespace-nowrap">ค่าพัสดุ</th>
                <th className="p-3 text-right whitespace-nowrap">ค่าเพิ่มเติม</th>
                <th className="p-3 text-right whitespace-nowrap">รวม</th>
                {matched && <th className="p-3 text-center whitespace-nowrap">สถานะ</th>}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    ไม่พบรายการ
                  </td>
                </tr>
              )}
              {filteredRows.map(r => (
                <tr
                  key={r.tracking}
                  className={`border-b ${
                    matched && !r.matched ? 'bg-red-50' :
                    matched &&  r.matched ? 'hover:bg-green-50' :
                                            'hover:bg-slate-50'
                  }`}
                >
                  <td className="p-3 text-slate-500 whitespace-nowrap">{r.date}</td>
                  <td className="p-3 font-mono text-blue-600 whitespace-nowrap">{r.tracking}</td>
                  <td className="p-3 font-mono text-slate-600 whitespace-nowrap">
                    {r.order_no ?? (matched ? '-' : '')}
                  </td>
                  <td className="p-3 font-medium whitespace-nowrap">
                    {r.customer ?? (matched ? '-' : '')}
                  </td>
                  <td className="p-3 text-slate-500 max-w-[180px] truncate">{r.raw_prod ?? ''}</td>
                  <td className="p-3 text-right text-blue-700 font-medium">
                    {r.base > 0 ? `฿${fmt(r.base)}` : '-'}
                  </td>
                  <td className="p-3 text-right text-orange-600">
                    {r.extra > 0 ? `+฿${fmt(r.extra)}` : '-'}
                  </td>
                  <td className="p-3 text-right font-bold text-red-700">฿{fmt(r.total)}</td>
                  {matched && (
                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          r.matched
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-600'
                        }`}
                      >
                        {r.matched ? '✓ พบออเดอร์' : '❌ ไม่พบ'}
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 sticky bottom-0 font-bold text-[11px]">
              <tr>
                <td className="p-3 text-slate-600" colSpan={5}>
                  รวม {filteredRows.length} tracking
                </td>
                <td className="p-3 text-right text-blue-700">
                  ฿{fmt(filteredRows.reduce((s, r) => s + r.base, 0))}
                </td>
                <td className="p-3 text-right text-orange-600">
                  +฿{fmt(filteredRows.reduce((s, r) => s + r.extra, 0))}
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
              อัพโหลดไฟล์ Flash Excel เพื่อวิเคราะห์ค่าขนส่ง
            </p>
            <p className="text-xs text-slate-300 mt-1">
              สามารถอัพโหลดหลายไฟล์พร้อมกันได้ — ระบบจะ merge อัตโนมัติ
            </p>
          </div>
          <div className="flex gap-2 text-xs mt-1">
            <span className="bg-blue-50 border border-blue-100 text-blue-500 px-3 py-1.5 rounded-lg">
              📦 ค่าพัสดุ
            </span>
            <span className="bg-orange-50 border border-orange-100 text-orange-500 px-3 py-1.5 rounded-lg">
              ➕ ค่าพัสดุเพิ่มเติม
            </span>
            <span className="bg-green-50 border border-green-100 text-green-500 px-3 py-1.5 rounded-lg">
              💳 โอนเงิน Flash Pay
            </span>
          </div>
        </div>
      )}

    </div>
  );
}
