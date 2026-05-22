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
  tracking:     string;
  page:         string;
  consignee:    string;
  weight:       number;
  cod:          number;
  cod_fee:      number;
  freight:      number;
  total:        number;
  invoice_date?: string;
  source_file?: string;  // ผูก row กับไฟล์ที่มา
  order_no?:    string;
  customer?:    string;
  raw_prod?:    string;
  matched:      boolean;
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
  const s = String(val ?? '').trim();
  if (/\d+\s*[×x×✕]\s*\d+/i.test(s)) return 0;
  if (/[a-zA-Z\u0E00-\u0E7F]{3,}/.test(s)) return 0;
  return Math.abs(parseFloat(s.replace(/[^0-9.-]/g, '')) || 0);
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
  // ดึงวันที่จากชื่อไฟล์
  // รองรับ: 2026-04-30, 30042569 (ddmmBE), 30-04-2026, 30042026
  let invoiceDate = new Date().toISOString().split('T')[0];
  const isoMatch  = fileName.match(/(\d{4}-\d{2}-\d{2})/);
  const thaiMatch = fileName.match(/(\d{2})(\d{2})(\d{4})/); // ddmmyyyy
  if (isoMatch) {
    invoiceDate = isoMatch[1];
  } else if (thaiMatch) {
    const [, dd, mm, yyyy] = thaiMatch;
    const year = Number(yyyy) > 2500 ? Number(yyyy) - 543 : Number(yyyy);
    invoiceDate = `${year}-${mm}-${dd}`;
  }

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // ── Auto-detect columns จาก header row ──
  const header = (rows[0] as string[]) || [];
  const findCol = (keywords: string[]) =>
    header.findIndex(h => h && keywords.some(k => String(h).toLowerCase().includes(k.toLowerCase())));

  const W  = findCol(['weight'])          >= 0 ? findCol(['weight'])          : 9;
  const C  = findCol(['cod amount'])      >= 0 ? findCol(['cod amount'])      : 10;
  const CF = findCol(['total cod fee','cod fee 2']) >= 0 ? findCol(['total cod fee','cod fee 2']) : 11;
  const V7 = findCol(['cod vat','vat 7']) >= 0 ? findCol(['cod vat','vat 7']) : 12;
  const SP = findCol(['พื้นที่พิเศษ','special']) >= 0 ? findCol(['พื้นที่พิเศษ','special']) : 13;
  const FR = findCol(['freight'])         >= 0 ? findCol(['freight'])         : 14;
  const TC = findCol(['total charge'])    >= 0 ? findCol(['total charge'])    : 15;

  // skip header row (index 0); กรองแถวที่ไม่มี tracking
  const dataRows = rows.slice(1).filter(r => (r as unknown[])[5]);

  const trackingMap: Record<string, TrackingRow> = {};

  for (const r of dataRows as unknown[][]) {
    const tracking = String(r[5] ?? '').trim();
    if (!tracking) continue;

    if (!trackingMap[tracking]) {
      trackingMap[tracking] = {
        tracking,
        page:         String(r[4] ?? '').trim(),
        consignee:    String(r[6] ?? '').trim(),
        weight:       parseNum(r[W]),
        cod:          parseNum(r[C]),
        cod_fee:      parseNum(r[CF]),
        freight:      parseNum(r[FR]),
        total:        parseNum(r[TC]),
        matched:      false,
        invoice_date: invoiceDate,
        source_file:  fileName,
      };
    } else {
      trackingMap[tracking].freight  += parseNum(r[FR]);
      trackingMap[tracking].total    += parseNum(r[TC]);
      trackingMap[tracking].cod      += parseNum(r[C]);
      trackingMap[tracking].cod_fee  += parseNum(r[CF]);
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
      // replace ทุกครั้ง — ไฟล์ใหม่ override ค่าเก่าเสมอ ไม่บวกซ้ำ
      merged[key] = { ...incoming, matched: merged[key]?.matched ?? false };
    }
  }
  return merged;
}

// ── Component ─────────────────────────────────────────────────

export default function MyOrderImport() {
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Session persistence ─────────────────────────────────────
  const [trackingMap, setTrackingMap] = useState<Record<string, TrackingRow>>(
    () => readStorage(STORAGE_KEY)?.trackingMap ?? {}
  );
  const [fileInfos, setFileInfos] = useState<FileInfo[]>(
    () => readStorage(STORAGE_KEY)?.fileInfos ?? []
  );
  const [matched, setMatched] = useState<boolean>(
    () => readStorage(STORAGE_KEY)?.matched ?? false
  );

  const [matching, setMatching]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [loadingDB, setLoadingDB] = useState(false);
  const [search, setSearch]       = useState('');
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ trackingMap, fileInfos, matched }));
    } catch {}
  }, [trackingMap, fileInfos, matched]);

  // โหลดจาก DB ทุกครั้งที่เปิดหน้า
  useEffect(() => {
    handleLoad();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Load from Supabase ──────────────────────────────────────

  const handleLoad = async () => {
    setLoadingDB(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('shipping_myorder').select('*')
        .order('imported_at', { ascending: false });
      if (e) throw e;

      const loaded: Record<string, TrackingRow> = {};
      for (const r of data ?? []) {
        loaded[r.tracking] = {
          tracking:     r.tracking,
          page:         r.page       ?? '',
          consignee:    r.consignee  ?? '',
          weight:       Number(r.weight_kg),
          cod:          Number(r.cod_thb),
          cod_fee:      Number(r.cod_fee_thb),
          freight:      Number(r.freight_thb),
          total:        Number(r.total_thb),
          invoice_date: r.invoice_date ?? undefined,
          source_file:  '__supabase__',
          order_no:     r.order_no   ?? undefined,
          customer:     r.customer   ?? undefined,
          raw_prod:     r.raw_prod   ?? undefined,
          matched:      r.matched    ?? false,
        };
      }

      setTrackingMap(loaded);
      setFileInfos([{ name: '📂 โหลดจาก Supabase', rows: Object.keys(loaded).length }]);
      setMatched(Object.values(loaded).some(r => r.matched));
    } catch (err: any) {
      setError(`โหลดไม่สำเร็จ: ${err?.message ?? String(err)}`);
    } finally {
      setLoadingDB(false);
    }
  };

  // ── Auto-save ──────────────────────────────────────────────

  const autoSave = async (map: Record<string, TrackingRow>) => {
    setSaving(true);
    try {
      const rows = Object.values(map).map(r => ({
        tracking:     r.tracking,
        page:         r.page      || null,
        consignee:    r.consignee || null,
        weight_kg:    r.weight,
        cod_thb:      r.cod,
        cod_fee_thb:  r.cod_fee,
        freight_thb:  r.freight,
        total_thb:    r.total,
        invoice_date: (r as any).invoice_date || null,
        order_no:     r.order_no ?? null,
        customer:     r.customer ?? null,
        raw_prod:     r.raw_prod ?? null,
        matched:      r.matched,
      }));
      await supabase.from('shipping_myorder').upsert(rows, { onConflict: 'tracking' });

      // ship_date อัพเดตเมื่อ MyOrderExport → ยืนยันส่งแล้ว (ไม่ใช่ตอนนำเข้าค่าขนส่ง)
    } catch (err) {
      console.error('auto-save failed:', err);
    } finally {
      setSaving(false);
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

      const updatedMap = { ...trackingMap };

      // ── ใส่ invoice_date ตามไฟล์ต้นทาง (source_file) ──
      const fileDateMap: Record<string, string> = {};
      for (const f of fileInfos) {
        if (f.invoice_date) fileDateMap[f.name] = f.invoice_date;
      }
      for (const k of Object.keys(updatedMap)) {
        const src = updatedMap[k].source_file;
        if (src && fileDateMap[src] && !updatedMap[k].invoice_date) {
          updatedMap[k] = { ...updatedMap[k], invoice_date: fileDateMap[src] };
        }
      }

      for (const o of allData) {
        if (updatedMap[o.tracking_no]) {
          updatedMap[o.tracking_no] = {
            ...updatedMap[o.tracking_no],
            order_no: o.order_no,
            customer: o.customers?.name,
            raw_prod: o.raw_prod,
            matched:  true,
          };
        }
      }
      setTrackingMap(updatedMap);
      setMatched(true);
      await autoSave(updatedMap);
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

  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [expandFiles, setExpandFiles] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [bulkDate, setBulkDate] = useState('');
  const [showNotFound, setShowNotFound] = useState(false);
  const [deletingNotFound, setDeletingNotFound] = useState(false);

  const [notFoundSelected, setNotFoundSelected] = useState<Set<string>>(new Set());

  const toggleNotFoundSelect = (tracking: string) =>
    setNotFoundSelected(prev => {
      const n = new Set(prev);
      n.has(tracking) ? n.delete(tracking) : n.add(tracking);
      return n;
    });

  const toggleSelectAll = (notFoundRows: TrackingRow[]) =>
    setNotFoundSelected(prev =>
      prev.size === notFoundRows.length
        ? new Set()
        : new Set(notFoundRows.map(r => r.tracking))
    );

  // ลบเฉพาะรายการที่เลือก (หรือทั้งหมดถ้าไม่ได้เลือกเฉพาะ)
  const deleteSelected = async (keys: string[]) => {
    if (!keys.length) return;
    setDeletingNotFound(true);
    try {
      const CHUNK = 500;
      for (let i = 0; i < keys.length; i += CHUNK) {
        await supabase.from('shipping_myorder').delete()
          .in('tracking', keys.slice(i, i + CHUNK));
      }
      setTrackingMap(prev => {
        const next = { ...prev };
        keys.forEach(k => delete next[k]);
        return next;
      });
      setNotFoundSelected(new Set());
      // ถ้าลบหมดแล้ว ปิด modal
      const remaining = Object.values(trackingMap).filter(r => !r.matched).length - keys.length;
      if (remaining <= 0) setShowNotFound(false);
    } catch (err) {
      console.error('deleteSelected error:', err);
    } finally {
      setDeletingNotFound(false);
    }
  };

  // ลบเฉพาะรายการ ❌ ไม่พบออเดอร์ (ทั้งหมด — ใช้ deleteSelected แทน)
  const deleteNotFound = () => {
    const notFoundKeys = Object.keys(trackingMap).filter(k => !trackingMap[k].matched);
    deleteSelected(notFoundKeys);
  };

  const clearAll = async () => {
    const trackings = Object.keys(trackingMap);
    setClearing(true);
    try {
      if (trackings.length > 0) {
        const CHUNK = 500;
        for (let i = 0; i < trackings.length; i += CHUNK) {
          await supabase.from('shipping_myorder').delete()
            .in('tracking', trackings.slice(i, i + CHUNK));
        }
      }
    } catch (err) { console.error('clearAll DB error:', err); }
    sessionStorage.removeItem(STORAGE_KEY);
    setTrackingMap({});
    setFileInfos([]);
    setMatched(false);
    setSearch('');
    setError(null);
    setClearing(false);
    setShowClearConfirm(false);
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

      {/* Upload zone + วันที่จัดส่ง */}
      <div className="shrink-0 flex gap-3 items-stretch">
        <div
          className="flex-1 border-2 border-dashed border-slate-200 rounded-xl p-4 flex items-center gap-4
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

      {/* File summary - แบบย่อ */}
      {fileInfos.length > 0 && (() => {
        const uploadedFiles = fileInfos.filter(f => f.name !== '📂 โหลดจาก Supabase');
        const supabaseFile  = fileInfos.find(f => f.name === '📂 โหลดจาก Supabase');
        const totalRows     = fileInfos.reduce((s, f) => s + f.rows, 0);
        const filesWithDate = uploadedFiles.filter(f => f.invoice_date).length;

        return (
          <div className="shrink-0 flex items-center gap-2 flex-wrap">
            {/* Summary badge */}
            <button
              onClick={() => setExpandFiles(e => !e)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-purple-100 text-purple-700 hover:bg-purple-200 transition"
            >
              📂 {fileInfos.length} ไฟล์ · {totalRows} tracking
              <span className="text-[10px]">{expandFiles ? '▲' : '▼'}</span>
            </button>

            {/* Date status */}
            {uploadedFiles.length > 0 && (
              <button
                onClick={() => setShowDateModal(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                  filesWithDate === uploadedFiles.length
                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    : 'bg-amber-100 text-amber-700 hover:bg-amber-200 animate-pulse'
                }`}
                title="ตั้งวันที่ invoice"
              >
                📅 วันที่ invoice
                <span className="bg-white/60 px-1.5 rounded-full text-[10px] font-mono">
                  {filesWithDate}/{uploadedFiles.length}
                </span>
              </button>
            )}

            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={clearing}
              className="px-3 py-1.5 rounded-full text-xs bg-slate-100 text-slate-500
                         hover:bg-red-100 hover:text-red-600 flex items-center gap-1 disabled:opacity-50"
            >
              <X size={11} /> {clearing ? 'กำลังลบ...' : 'ล้างทั้งหมด'}
            </button>

            {/* Expand รายละเอียดไฟล์ */}
            {expandFiles && (
              <div className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-40 overflow-y-auto">
                <div className="flex flex-col gap-1.5">
                  {supabaseFile && (
                    <div className="flex items-center gap-2 text-xs px-2 py-1 bg-white rounded-lg">
                      <span className="text-purple-600">📂</span>
                      <span className="flex-1 text-slate-600">โหลดจาก Supabase</span>
                      <span className="text-slate-400 font-mono">{supabaseFile.rows} tracking</span>
                    </div>
                  )}
                  {uploadedFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs px-2 py-1 bg-white rounded-lg">
                      <span className="text-purple-600">📋</span>
                      <span className="flex-1 truncate text-slate-700" title={f.name}>{f.name}</span>
                      {f.invoice_date && (
                        <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-mono text-[10px]">
                          📅 {f.invoice_date}
                        </span>
                      )}
                      <span className="text-slate-400 font-mono">{f.rows}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* date picker → moved to modal */}

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
                <button
                  onClick={() => setShowNotFound(true)}
                  className="bg-red-100 text-red-600 px-3 py-1.5 rounded-full font-medium hover:bg-red-200 transition flex items-center gap-1"
                >
                  ❌ ไม่พบ {cntNotFound}
                  <span className="text-[10px] underline">ดูรายการ</span>
                </button>
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

          {saving && (
            <span className="text-xs text-emerald-600 flex items-center gap-1.5 px-3 py-2 bg-emerald-50 rounded-lg">
              <RefreshCw size={12} className="animate-spin"/> กำลังบันทึก...
            </span>
          )}
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
          <table className="text-xs w-full" style={{ minWidth: '1000px' }}>
            <thead className="bg-slate-800 text-slate-200 sticky top-0 z-10">
              <tr>
                <th className="p-3 text-left whitespace-nowrap">วันที่</th>
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
                  <td colSpan={13} className="p-8 text-center text-slate-400">ไม่พบรายการ</td>
                </tr>
              )}
              {filteredRows.map(r => (
                <tr key={r.tracking}
                  className={`border-b ${
                    matched && !r.matched ? 'bg-red-50' :
                    matched &&  r.matched ? 'hover:bg-green-50' :
                                            'hover:bg-slate-50'
                  }`}>
                  <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                    {r.invoice_date
                      ? r.invoice_date.split('-').reverse().join('/')
                      : <span className="text-slate-300">-</span>}
                  </td>
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
                <td className="p-3 text-slate-600" colSpan={7}>
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
          <span className="text-xs text-slate-400">
            {loadingDB ? '⏳ กำลังโหลดข้อมูล...' : 'ไม่มีข้อมูล — อัพโหลดไฟล์ใหม่ได้เลย'}
          </span>
        </div>
      )}

      {/* Confirm clear popup */}
      {/* ── Date Modal ── */}
      {showDateModal && (() => {
        const uploadedFiles = fileInfos.filter(f => f.name !== '📂 โหลดจาก Supabase');
        const applyBulk = () => {
          if (!bulkDate) return;
          setFileInfos(prev => prev.map(f =>
            f.name === '📂 โหลดจาก Supabase' ? f : { ...f, invoice_date: bulkDate }
          ));
          setTrackingMap(prev => {
            const updated: Record<string, TrackingRow> = {};
            for (const [k, v] of Object.entries(prev)) {
              if (v.source_file && v.source_file !== '__supabase__') {
                updated[k] = { ...v, invoice_date: bulkDate };
              } else {
                updated[k] = v;
              }
            }
            return updated;
          });
        };
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowDateModal(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b">
                <div>
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">📅 ตั้งวันที่ invoice</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{uploadedFiles.length} ไฟล์ที่อัพโหลดใหม่</p>
                </div>
                <button onClick={() => setShowDateModal(false)} className="text-slate-400 hover:text-slate-700">
                  <X size={18}/>
                </button>
              </div>

              {/* Bulk apply */}
              <div className="p-5 border-b bg-amber-50">
                <p className="text-xs font-semibold text-amber-700 mb-2">⚡ ใช้วันเดียวกันทั้งหมด</p>
                <div className="flex gap-2 items-center">
                  <input
                    type="date"
                    value={bulkDate}
                    onChange={e => setBulkDate(e.target.value)}
                    className="flex-1 border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                  <button
                    onClick={applyBulk}
                    disabled={!bulkDate}
                    className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-40 whitespace-nowrap"
                  >
                    ✓ ใช้กับทุกไฟล์
                  </button>
                </div>
                <p className="text-[10px] text-amber-600 mt-1.5">เหมาะถ้า upload หลายไฟล์ที่มีวันเดียวกัน</p>
              </div>

              {/* Per-file list */}
              <div className="flex-1 overflow-y-auto p-5">
                <p className="text-xs font-semibold text-slate-600 mb-3">หรือตั้งแยกแต่ละไฟล์</p>
                <div className="flex flex-col gap-2">
                  {uploadedFiles.map((f, i) => {
                    const realIdx = fileInfos.indexOf(f);
                    return (
                      <div key={realIdx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                        <span className="text-purple-600 text-lg">📋</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-700 truncate" title={f.name}>{f.name}</div>
                          <div className="text-[10px] text-slate-400">{f.rows} tracking</div>
                        </div>
                        <input
                          type="date"
                          value={f.invoice_date || ''}
                          onChange={e => {
                            const newDate = e.target.value;
                            const fileName = f.name;
                            setFileInfos(prev => prev.map((fi, j) =>
                              j === realIdx ? { ...fi, invoice_date: newDate } : fi
                            ));
                            setTrackingMap(prev => {
                              const updated: Record<string, TrackingRow> = {};
                              for (const [k, v] of Object.entries(prev)) {
                                if (v.source_file === fileName) {
                                  updated[k] = { ...v, invoice_date: newDate };
                                } else {
                                  updated[k] = v;
                                }
                              }
                              return updated;
                            });
                          }}
                          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-300 w-[135px]"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t bg-slate-50 flex justify-end">
                <button
                  onClick={() => setShowDateModal(false)}
                  className="px-6 py-2 bg-purple-500 text-white rounded-lg text-sm font-semibold hover:bg-purple-600"
                >
                  เสร็จสิ้น
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Not Found Modal ── */}
      {showNotFound && (() => {
        const notFoundRows = Object.values(trackingMap).filter(r => !r.matched);
        const allSelected  = notFoundSelected.size === notFoundRows.length && notFoundRows.length > 0;
        const toDelete     = notFoundSelected.size > 0
          ? [...notFoundSelected]
          : notFoundRows.map(r => r.tracking);
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => { setShowNotFound(false); setNotFoundSelected(new Set()); }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b">
                <div>
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    ❌ รายการที่ไม่พบออเดอร์
                    <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-bold">
                      {notFoundRows.length} tracking
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    tracking เหล่านี้ไม่มีในระบบออเดอร์ — อาจเป็นออเดอร์จากช่องทางอื่น หรือยังไม่ได้นำเข้า
                  </p>
                </div>
                <button onClick={() => { setShowNotFound(false); setNotFoundSelected(new Set()); }}
                  className="text-slate-400 hover:text-slate-700">
                  <X size={18}/>
                </button>
              </div>

              {/* Selection bar */}
              <div className="px-5 py-3 border-b bg-slate-50 flex items-center gap-3 text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none font-medium text-slate-600">
                  <input type="checkbox"
                    checked={allSelected}
                    onChange={() => toggleSelectAll(notFoundRows)}
                    className="w-4 h-4 accent-red-500 cursor-pointer"
                  />
                  เลือกทั้งหมด ({notFoundRows.length})
                </label>
                {notFoundSelected.size > 0 && (
                  <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">
                    เลือกแล้ว {notFoundSelected.size} รายการ
                  </span>
                )}
                <span className="flex-1"/>
                <span className="text-slate-400">
                  {notFoundSelected.size === 0 ? 'ไม่ได้เลือก = ลบทั้งหมด' : `จะลบ ${notFoundSelected.size} รายการ`}
                </span>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-auto">
                <table className="text-xs w-full">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="p-3 w-10 text-center"></th>
                      <th className="p-3 text-left whitespace-nowrap">Tracking No.</th>
                      <th className="p-3 text-left whitespace-nowrap">เพจ</th>
                      <th className="p-3 text-left whitespace-nowrap">ผู้รับ</th>
                      <th className="p-3 text-right whitespace-nowrap">Freight</th>
                      <th className="p-3 text-right whitespace-nowrap">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notFoundRows.map(r => {
                      const isSelected = notFoundSelected.has(r.tracking);
                      return (
                        <tr key={r.tracking}
                          onClick={() => toggleNotFoundSelect(r.tracking)}
                          className={`border-b cursor-pointer transition ${
                            isSelected ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-slate-50'
                          }`}>
                          <td className="p-3 text-center">
                            <input type="checkbox" checked={isSelected} readOnly
                              className="w-4 h-4 accent-red-500 cursor-pointer pointer-events-none"/>
                          </td>
                          <td className="p-3 font-mono text-purple-600">{r.tracking}</td>
                          <td className="p-3 text-slate-600 max-w-[120px] truncate">{r.page || '-'}</td>
                          <td className="p-3 text-slate-500">{r.consignee || '-'}</td>
                          <td className="p-3 text-right text-purple-700">฿{fmt(r.freight)}</td>
                          <td className="p-3 text-right font-bold text-red-700">฿{fmt(r.total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 font-bold text-[11px] sticky bottom-0">
                    <tr>
                      <td colSpan={4} className="p-3 text-slate-600">
                        รวม {notFoundSelected.size > 0 ? `${notFoundSelected.size} ที่เลือก / ` : ''}
                        {notFoundRows.length} tracking ทั้งหมด
                      </td>
                      <td className="p-3 text-right text-purple-700">
                        ฿{fmt(
                          (notFoundSelected.size > 0
                            ? notFoundRows.filter(r => notFoundSelected.has(r.tracking))
                            : notFoundRows
                          ).reduce((s, r) => s + r.freight, 0)
                        )}
                      </td>
                      <td className="p-3 text-right text-red-700">
                        ฿{fmt(
                          (notFoundSelected.size > 0
                            ? notFoundRows.filter(r => notFoundSelected.has(r.tracking))
                            : notFoundRows
                          ).reduce((s, r) => s + r.total, 0)
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Footer */}
              <div className="p-4 border-t bg-slate-50 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400">
                  การลบจะลบออกจากหน้าจอ <strong>และ Supabase</strong> ด้วย
                </p>
                <div className="flex gap-2">
                  <button onClick={() => { setShowNotFound(false); setNotFoundSelected(new Set()); }}
                    className="px-5 py-2 bg-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-300">
                    ปิด
                  </button>
                  <button onClick={() => deleteSelected(toDelete)} disabled={deletingNotFound}
                    className="px-5 py-2 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-50 flex items-center gap-2">
                    {deletingNotFound
                      ? <><RefreshCw size={13} className="animate-spin"/> กำลังลบ...</>
                      : <>🗑 ลบ{notFoundSelected.size > 0 ? `รายการที่เลือก (${notFoundSelected.size})` : `ทั้งหมด (${notFoundRows.length})`}</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0 text-xl">🗑</div>
              <div>
                <h3 className="font-bold text-slate-800">ล้างข้อมูลทั้งหมด?</h3>
                <p className="text-sm text-slate-500 mt-1">
                  จะลบ <strong>{Object.keys(trackingMap).length} tracking</strong> ออกจากหน้าจอ
                  <br/>และ<strong className="text-red-600">ลบออกจาก Supabase</strong> ด้วย
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200">
                ยกเลิก
              </button>
              <button onClick={clearAll} disabled={clearing}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-50">
                {clearing ? 'กำลังลบ...' : '🗑 ลบทั้งหมด'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
