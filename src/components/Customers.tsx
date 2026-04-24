import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { TOURIST_ZIPS } from '../lib/types';
import { useShipCostMap } from '../lib/useShipCostMap';
import { fmtTHB, fmtInt } from '../lib/utils';
import { Search, Users, TrendingUp, ShoppingBag, ChevronDown, ChevronRight, X, Upload, Trash2, Edit2, Save } from 'lucide-react';
import * as XLSX from 'xlsx';

type Customer = {
  id: string; name: string; facebook_name: string | null; tel: string;
  address: string | null; subdistrict: string | null; district: string | null;
  province: string | null; postal_code: string | null;
  channel: string | null; payment_method: string | null;
  tag: string | null; order_count: number; total_spent: number;
  created_at: string; updated_at: string;
};
type Order = {
  id: string; order_no: string; order_date: string; raw_prod: string | null;
  total_thb: number; order_status: string; tracking_no: string | null; ship_date?: string | null;
};

const TAG_COLORS: Record<string, string> = {
  'VIP':    'bg-amber-100 text-amber-800',
  'ประจำ':  'bg-purple-100 text-purple-700',
  'ใหม่':   'bg-blue-100 text-blue-700',
};

// ใช้ fmtInt และ fmtTHB จาก utils.ts แทน (alias ให้โค้ดเดิมทำงานได้เลย)
const fmt  = fmtInt;
const fmt2 = fmtTHB;

export default function Customers({ onGoToProducts, problemOnly = false }: { onGoToProducts?: () => void; problemOnly?: boolean } = {}) {
  const [customers, setCustomers]   = useState<Customer[]>([]);
  // ถ้าเป็นหน้าเคสมีปัญหา → เก็บ customer_id ที่มีออเดอร์สถานะปัญหา
  const [problemCustomerIds, setProblemCustomerIds] = useState<Set<string> | null>(null);
  // สรุปจำนวนออเดอร์ปัญหาต่อลูกค้า (ใช้แสดงใน badge)
  const [problemOrderCount, setProblemOrderCount] = useState<Record<string, number>>({});
  const [search, setSearch]         = useState('');
  const [tagFilter, setTagFilter]   = useState('ทั้งหมด');
  const [sortBy, setSortBy]         = useState<'total_spent' | 'order_count' | 'updated_at'>('total_spent');
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [custOrders, setCustOrders] = useState<Order[]>([]);
  const { shipCostMap } = useShipCostMap();
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [editTag, setEditTag]       = useState<{id: string; tag: string} | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [importing, setImporting]   = useState(false);
  // Flash Import
  const [showFlashImport, setShowFlashImport] = useState(false);
  const [flashRows, setFlashRows]             = useState<any[]>([]);
  // index → รายการสินค้าที่เลือก (หลายรายการได้)
  const [flashPromoSel, setFlashPromoSel]     = useState<Record<number, {promoId: string; qty: number}[]>>({});
  const [flashTotalSel, setFlashTotalSel]     = useState<Record<number, string>>({}); // index → total override
  const [flashDups, setFlashDups]             = useState<{row: any; existing: any}[]>([]);
  const [flashSaving, setFlashSaving]         = useState(false);
  const [flashSearch, setFlashSearch]         = useState('');
  // สถานะของแต่ละแถว: ค้นหาใน combobox + แถวไหนกำลังเปิด dropdown
  const [flashPromoSearch, setFlashPromoSearch] = useState<Record<number, string>>({});
  const [flashOpenPromo, setFlashOpenPromo]     = useState<number | null>(null);
  const [flashAddQty, setFlashAddQty]           = useState<Record<number, number>>({});
  // NEW: filter ช่วงราคา COD (min/max)
  const [flashMinCod, setFlashMinCod] = useState('');
  const [flashMaxCod, setFlashMaxCod] = useState('');
  // NEW: เลือกแถวเพื่อ bulk add (key = tracking)
  const [flashSelectedRows, setFlashSelectedRows] = useState<Set<string>>(new Set());
  // NEW: Modal bulk add
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [bulkPromoSearch, setBulkPromoSearch] = useState('');
  const [bulkPromoId, setBulkPromoId]         = useState<string>('');
  const [bulkQty, setBulkQty]                 = useState(1);
  const [bulkOpenDropdown, setBulkOpenDropdown] = useState(false);
  // NEW: Confirm close modal
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  // NEW: ตำแหน่ง dropdown ของ combobox ที่ใช้ portal (กันถูก clip ด้วย overflow)
  const [promoDropdownPos, setPromoDropdownPos] = useState<{top: number; left: number; width: number; openUp: boolean} | null>(null);
  // NEW: Edit Customer modal
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [editCustForm, setEditCustForm] = useState<Partial<Customer>>({});
  const [editCustSaving, setEditCustSaving] = useState(false);
  // NEW: Edit Order modal — เก็บ order + รายการสินค้าที่ parse จาก promo_ids + quantities
  const [editOrder, setEditOrder] = useState<any>(null);
  const [editOrderItems, setEditOrderItems] = useState<{promoId: string; qty: number}[]>([]);
  const [editOrderForm, setEditOrderForm] = useState<any>({});
  const [editOrderSaving, setEditOrderSaving] = useState(false);
  const [editOrderSearch, setEditOrderSearch] = useState('');
  const [editOrderAddQty, setEditOrderAddQty] = useState(1);
  const [editOrderDropdownOpen, setEditOrderDropdownOpen] = useState(false);
  const [importResult, setImportResult] = useState<{
    added: number; updated: number; skipped: number;
    unmapped: {name:string; qty:string}[];
  } | null>(null);

  // mapping modal state
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [unmappedList, setUnmappedList]         = useState<{name:string; qty:string}[]>([]);
  const [promoOptions, setPromoOptions]         = useState<{id:string; name:string; short_name:string|null; price_thb:number; master_name:string}[]>([]);
  const [mappingSelects, setMappingSelects]     = useState<Record<string, string>>({}); // raw_name → promo_id
  const [mappingSearch, setMappingSearch]       = useState(''); // ค้นหาใน modal
  const [savingMappings, setSavingMappings]     = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success'|'error'|'warning' } | null>(null);
  const showToast = (msg: string, type: 'success'|'error'|'warning' = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 5000);
  };
  const PAGE_SIZE = 500;
  const [pageView, setPageView] = useState<'all' | number>(0);

  useEffect(() => { loadCustomers(); }, []);

  // reset กลับหน้าแรกเมื่อ filter หรือ search เปลี่ยน
  useEffect(() => { if (pageView !== 'all') setPageView(0); }, [search, tagFilter, sortBy]);
  // เมื่อเป็นหน้า "เคสมีปัญหา" → query ออเดอร์สถานะปัญหาแล้วเก็บ customer_ids
  useEffect(() => {
    if (!problemOnly) {
      setProblemCustomerIds(null);
      setProblemOrderCount({});
      return;
    }
    const loadProblem = async () => {
      // สถานะที่ถือว่ามีปัญหา
      const PROBLEM_STATUSES = ['ค้างอยู่คลัง', 'ไม่มีคนรับ', 'ตีกลับ', 'ส่งคืน', 'ปัญหา'];
      // query 2 ช่อง: parcel_status + order_status (ส่วนใหญ่เก็บคู่กัน)
      const { data: byParcel } = await supabase
        .from('orders').select('customer_id')
        .in('parcel_status', PROBLEM_STATUSES);
      const { data: byOrder } = await supabase
        .from('orders').select('customer_id')
        .in('order_status', PROBLEM_STATUSES);
      const counts: Record<string, number> = {};
      const ids = new Set<string>();
      [...(byParcel || []), ...(byOrder || [])].forEach((o: any) => {
        if (o.customer_id) {
          ids.add(o.customer_id);
          counts[o.customer_id] = (counts[o.customer_id] || 0) + 1;
        }
      });
      setProblemCustomerIds(ids);
      setProblemOrderCount(counts);
    };
    loadProblem();
  }, [problemOnly]);

  // ปิด combobox dropdown เมื่อ scroll ตารางหรือ resize window (กันตำแหน่งเพี้ยน)
  useEffect(() => {
    if (flashOpenPromo === null) return;
    const close = () => { setFlashOpenPromo(null); setPromoDropdownPos(null); };
    window.addEventListener('resize', close);
    // listen scroll ทั้ง capture เพราะ scroll เกิดใน table container
    document.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [flashOpenPromo]);

  // ── Flash Import ──────────────────────────────────────────
  const handleFlashFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const buf = await file.arrayBuffer();
    const wb  = XLSX.read(buf);
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
    const dataRows = rows.slice(1).filter(r => r[1] && r[11]); // มี tracking + tel

    // batch โหลด promos ถ้ายังไม่มี
    if (promoOptions.length === 0) {
      const { data: promos } = await supabase
        .from('products_promo').select('id, name, short_name, price_thb, products_master(name)')
        .eq('active', true).order('id');
      setPromoOptions((promos||[]).map((p: any) => ({
        ...p, master_name: p.products_master?.name || '',
      })));
    }

    // เช็ค duplicate tracking
    const trackings = dataRows.map(r => String(r[1]).trim());
    const { data: existOrders } = await supabase
      .from('orders').select('id, order_no, tracking_no, customers(name, tel)')
      .in('tracking_no', trackings);
    const existMap: Record<string, any> = {};
    (existOrders||[]).forEach((o: any) => { existMap[o.tracking_no] = o; });

    const dups: {row: any; existing: any}[] = [];
    dataRows.forEach(r => {
      const t = String(r[1]).trim();
      if (existMap[t]) dups.push({ row: r, existing: existMap[t] });
    });

    setFlashRows(dataRows);
    setFlashDups(dups);
    setFlashPromoSel({});
    setFlashTotalSel({});
    setFlashPromoSearch({});
    setFlashAddQty({});
    setFlashOpenPromo(null);
    setFlashSearch('');
    setFlashMinCod('');
    setFlashMaxCod('');
    setFlashSelectedRows(new Set());
    setShowFlashImport(true);
    e.target.value = '';
  };

  const handleFlashImport = async () => {
    setFlashSaving(true);
    try {
      // โหลด existing customers by tel
      const allTels = [...new Set(flashRows.map(r => String(r[11]).trim()))];
      const custMap: Record<string, string> = {};
      for (let i = 0; i < allTels.length; i += 500) {
        const { data } = await supabase.from('customers').select('id, tel').in('tel', allTels.slice(i, i+500));
        (data||[]).forEach((c: any) => { custMap[c.tel] = c.id; });
      }

      // สร้างลูกค้าใหม่
      const toInsert: any[] = [];
      const seenTels = new Set<string>();
      flashRows.forEach(r => {
        const tel = String(r[11]).trim();
        if (!custMap[tel] && !seenTels.has(tel)) {
          seenTels.add(tel);
          const dp = String(r[13]||'').split(' ');
          const province = dp[dp.length-1] || '';
          const district = dp[dp.length-2] || '';
          toInsert.push({
            name: String(r[10]||'').trim(),
            tel,
            address: String(r[12]||'').trim()||null,
            district, province,
            postal_code: String(r[14]||'').trim()||null,
            channel: 'FLASH',
            tag: 'ใหม่',
          });
        }
      });
      for (let i = 0; i < toInsert.length; i += 500) {
        const { data } = await supabase.from('customers').insert(toInsert.slice(i, i+500)).select('id, tel');
        (data||[]).forEach((c: any) => { custMap[c.tel] = c.id; });
      }

      // สร้างออเดอร์
      let added = 0;
      for (let idx = 0; idx < flashRows.length; idx++) {
        const r = flashRows[idx];
        const tracking = String(r[1]).trim();
        const tel = String(r[11]).trim();
        const customerId = custMap[tel];
        if (!customerId) continue;

        // รายการสินค้าที่ user เลือก (หลายรายการได้)
        const items = (flashPromoSel[idx] || []).filter(it => it.promoId);
        const totalThb = flashTotalSel[idx] ? Number(flashTotalSel[idx]) : (Number(r[17])||0);

        // ลบ dup ที่เลือกลบ (ไม่ทำอะไร = ข้าม)
        const isDup = flashDups.find(d => String(d.row[1]).trim() === tracking);
        if (isDup) continue; // ข้าม duplicate (ให้ user จัดการเอง)

        // สร้าง promo_ids, quantities, raw_prod จาก items
        const promoIds   = items.map(it => it.promoId);
        const quantities = items.length > 0 ? items.map(it => String(it.qty || 1)).join('|') : '1';
        const qtySum     = items.length > 0 ? items.reduce((s, it) => s + (Number(it.qty) || 1), 0) : 1;
        const rawProd    = items.length > 0
          ? items.map(it => promoOptions.find(p => p.id === it.promoId)?.name || '').filter(Boolean).join('|')
          : '';

        const { error } = await supabase.from('orders').insert([{
          order_no:    `FL-${tracking}`,
          customer_id: customerId,
          channel:     'FLASH',
          order_date:  new Date().toISOString().split('T')[0],
          tracking_no: tracking,
          courier:     'FLASH',
          route:       'B',
          promo_ids:   promoIds,
          raw_prod:    rawProd,
          quantity:    qtySum,
          quantities:  quantities,
          total_thb:   totalThb,
          payment_method: 'COD',
          payment_status: 'รอชำระเงิน',
          order_status: 'รอแพ็ค',
        }]);
        if (!error) added++;
      }

      showToast(`✓ นำเข้าสำเร็จ · ออเดอร์ใหม่ ${added} รายการ`);
      setShowFlashImport(false);
      // รอ trigger DB อัพเดต order_count/total_spent ก่อน reload
      setTimeout(() => loadCustomers(), 600);
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally { setFlashSaving(false); }
  };

  const loadCustomers = async () => {
    setLoading(true);
    const PAGE = 1000;
    const all: Customer[] = [];
    let page = 0;
    while (true) {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order(sortBy, { ascending: false })
        .order('created_at', { ascending: false })  // secondary sort กัน row ทับกัน
        .range(page * PAGE, (page + 1) * PAGE - 1);
      if (error || !data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      page++;
    }
    setCustomers(all);
    setLoading(false);
  };

  useEffect(() => { loadCustomers(); }, [sortBy]);

  const loadOrders = async (customerId: string) => {
    setLoadingOrders(true);
    const { data } = await supabase.from('orders')
      .select('id, order_no, order_date, raw_prod, total_thb, order_status, tracking_no, ship_date')
      .eq('customer_id', customerId)
      .order('order_date', { ascending: false });
    if (data) setCustOrders(data);
    setLoadingOrders(false);
  };

  const toggleExpand = (id: string) => {
    if (expanded === id) { setExpanded(null); setCustOrders([]); }
    else { setExpanded(id); loadOrders(id); }
  };

  const saveTag = async () => {
    if (!editTag) return;
    await supabase.from('customers').update({ tag: editTag.tag, tag_manual: true }).eq('id', editTag.id);
    setCustomers(p => p.map(c => c.id === editTag.id ? { ...c, tag: editTag.tag } : c));
    setEditTag(null);
  };

  // ── นำเข้า Excel ครั้งเดียว → บันทึก ลูกค้า + ออเดอร์ พร้อมกัน (BATCH) ──
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting(true); setImportResult(null);
    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf);
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as Array<Array<string|number>>;
      const dataRows = rows.slice(1).filter(r => String(r[6]||'').trim() && String(r[4]||'').trim());

      // ── Step 1: โหลด product_mappings ทั้งหมดครั้งเดียว ─────────────────
      const rawProdsAll = [...new Set(
        dataRows.flatMap(r => String(r[14]||'').split('|').map(s=>s.trim()).filter(Boolean))
      )];
      const autoPromoMap: Record<string,string> = {};
      const unmappedProds: {name:string; qty:string}[] = [];
      // สร้าง map ชื่อสินค้า → จำนวน (ดึงจากแถวแรกที่เจอ)
      const prodQtyMap: Record<string,string> = {};
      dataRows.forEach(r => {
        const prods = String(r[14]||'').split('|').map((s:string)=>s.trim()).filter(Boolean);
        const qtys  = String(r[15]||'1').split('|').map((s:string)=>s.trim());
        prods.forEach((p,i) => { if (!prodQtyMap[p]) prodQtyMap[p] = qtys[i] || '1'; });
      });
      if (rawProdsAll.length > 0) {
        const { data: mappings } = await supabase
          .from('product_mappings').select('raw_name, promo_id').in('raw_name', rawProdsAll);
        (mappings||[]).forEach((m:any) => { autoPromoMap[m.raw_name] = m.promo_id; });
        rawProdsAll.forEach(rp => {
          if (!autoPromoMap[rp]) unmappedProds.push({ name: rp, qty: prodQtyMap[rp] || '?' });
        });
      }

      // ── Step 2: โหลด customers ที่มีอยู่แล้วทั้งหมดครั้งเดียว (by tel) ──
      const allTels = [...new Set(dataRows.map(r => String(r[6]||'').trim()))];
      const existingCustMap: Record<string,string> = {}; // tel → id
      for (let i=0; i<allTels.length; i+=500) {
        const { data } = await supabase.from('customers').select('id,tel').in('tel', allTels.slice(i,i+500));
        (data||[]).forEach((c:any) => { existingCustMap[c.tel] = c.id; });
      }

      // ── Step 3: โหลด orders ที่มีอยู่แล้วทั้งหมดครั้งเดียว (by order_no) ─
      const allOrderNos = [...new Set(dataRows.map(r => String(r[1]||'').trim()).filter(Boolean))];
      const existingOrderSet = new Set<string>();
      for (let i=0; i<allOrderNos.length; i+=500) {
        const { data } = await supabase.from('orders').select('order_no').in('order_no', allOrderNos.slice(i,i+500));
        (data||[]).forEach((o:any) => existingOrderSet.add(o.order_no));
      }

      // ── Step 4: แยก insert vs update — deduplicate by tel ────────────
      // ลูกค้า 1 คนอาจมีหลายออเดอร์ → deduplicate ก่อน insert
      const seenTels = new Set<string>();
      const toInsertCustsMap: Record<string,any> = {}; // tel → payload (last wins)
      const toUpdateCusts: {id:string; payload:any}[] = [];

      for (const row of dataRows) {
        const tel  = String(row[6]||'').trim();
        const name = String(row[4]||'').trim();
        const payload = {
          name,
          facebook_name:  String(row[5] ||'').trim()||null,
          tel,
          address:        String(row[7] ||'').trim()||null,
          subdistrict:    String(row[8] ||'').trim()||null,
          district:       String(row[9] ||'').trim()||null,
          province:       String(row[10]||'').trim()||null,
          postal_code:    String(row[11]||'').trim()||null,
          channel:        String(row[2] ||'').trim()||null,
          payment_method: String(row[22]||'').trim()||null,
        };
        if (existingCustMap[tel]) {
          if (!seenTels.has(tel)) {
            toUpdateCusts.push({ id: existingCustMap[tel], payload });
            seenTels.add(tel);
          }
        } else {
          toInsertCustsMap[tel] = { ...payload, tag: 'ใหม่' }; // deduplicate by tel
        }
      }
      const toInsertCusts = Object.values(toInsertCustsMap);

      // batch insert new customers (500 ต่อครั้ง) — ไม่มี duplicate แล้ว
      let custAdded = 0, custUpdated = 0;
      const newCustIdMap: Record<string,string> = {}; // tel → new id
      for (let i=0; i<toInsertCusts.length; i+=500) {
        const { data, error } = await supabase.from('customers')
          .insert(toInsertCusts.slice(i,i+500)).select('id,tel');
        if (error) console.error('insert customers error:', error);
        (data||[]).forEach((c:any) => { newCustIdMap[c.tel] = c.id; custAdded++; });
      }
      // batch update existing (ทีละ 10 parallel)
      for (let i=0; i<toUpdateCusts.length; i+=10) {
        await Promise.all(
          toUpdateCusts.slice(i,i+10).map(({id,payload}) =>
            supabase.from('customers').update(payload).eq('id',id)
          )
        );
      }
      custUpdated = toUpdateCusts.length;

      // รวม telMap
      const telToId: Record<string,string> = { ...existingCustMap, ...newCustIdMap };

      // ── Step 5: batch insert orders ────────────────────────────────────
      const ordersToInsert: any[] = [];
      let orderSkipped = 0;

      for (const row of dataRows) {
        const orderNo = String(row[1]||'').trim();
        if (!orderNo) continue;
        if (existingOrderSet.has(orderNo)) { orderSkipped++; continue; }

        const tel = String(row[6]||'').trim();
        const customerId = telToId[tel];
        if (!customerId) continue;

        const rawDate  = String(row[3]||'');
        const orderDate = rawDate ? new Date(rawDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const timeMatch = rawDate.match(/(\d{1,2}):(\d{2})/);
        const orderTime = timeMatch ? `${timeMatch[1].padStart(2,'0')}:${timeMatch[2]}` : '';

        const rawTrack    = String(row[17]||'');
        const trackMatch  = rawTrack.match(/^([^\s(]+)/);
        const trackingNo  = trackMatch ? trackMatch[1] : '';
        const courierMatch = rawTrack.match(/\(([^)]+)\)/);
        let courier = '';
        if (courierMatch) {
          const cv = courierMatch[1].toUpperCase();
          if (cv.includes('THAI_POST')||cv.includes('EMS')) courier='ไปรษณีย์';
          else if (cv.includes('FLASH')) courier='FLASH';
          else courier=courierMatch[1];
        }

        const rawProds = String(row[14]||'').split('|').map((s:string)=>s.trim()).filter(Boolean);
        const promoIds = rawProds.map(rp=>autoPromoMap[rp]||'').filter(Boolean);
        const quantities = String(row[15]||'1');
        const weightKg   = (Number(row[16])||0)/1000;
        const postal     = String(row[11]||'').trim();
        const hasTrack   = trackingNo.length>3;
        const isTourist  = TOURIST_ZIPS.has(postal);
        // route ตาม courier จริง
        // B = Flash, A = ไปรษณีย์มี tracking, C = ไปรษณีย์นักท่องเที่ยว, ไม่มี tracking = B
        const route = hasTrack
          ? (courier === 'ไปรษณีย์' ? (isTourist ? 'C' : 'A') : 'B')
          : (isTourist ? 'C' : 'B');

        ordersToInsert.push({
          order_no: orderNo, customer_id: customerId,
          channel: String(row[2]||'').trim()||null,
          order_date: orderDate, order_time: orderTime||null,
          raw_prod: String(row[14]||'').trim()||null,
          promo_ids: promoIds,
          quantity: quantities.split('|').reduce((s:number,n:string)=>s+(Number(n.trim())||1),0),
          quantities, weight_kg: weightKg,
          tracking_no: hasTrack?trackingNo:null,
          courier: courier||null,
          total_thb: Number(row[21])||0,
          payment_method: String(row[22]||'COD').trim(),
          payment_status: String(row[24]||'รอชำระเงิน').trim(),
          order_status: hasTrack?'รอแพ็ค':'รอคีย์ออเดอร์',
          route,
          imported_at: new Date().toISOString().split('T')[0],
        });
      }

      // batch insert orders (500 ต่อครั้ง)
      let orderAdded = 0;
      for (let i=0; i<ordersToInsert.length; i+=500) {
        const { error } = await supabase.from('orders').insert(ordersToInsert.slice(i,i+500));
        if (!error) orderAdded += Math.min(500, ordersToInsert.length-i);
        else console.error('batch order insert error:', error);
      }

      // อัพเดต tracking ให้ orders ที่มีอยู่แล้วแต่ยังไม่มี tracking
      const toUpdateTracking: {order_no:string; tracking_no:string; courier:string; route:string}[] = [];
      for (const row of dataRows) {
        const orderNo   = String(row[1]||'').trim();
        const rawTrack  = String(row[17]||'');
        const trackMatch = rawTrack.match(/^([^\s(]+)/);
        const trackingNo = trackMatch ? trackMatch[1] : '';
        if (!orderNo || trackingNo.length <= 3) continue;
        if (!existingOrderSet.has(orderNo)) continue; // ออเดอร์ใหม่ insert แล้ว
        const courierMatch = rawTrack.match(/\(([^)]+)\)/);
        let courier = '';
        if (courierMatch) {
          const cv = courierMatch[1].toUpperCase();
          if (cv.includes('THAI_POST')||cv.includes('EMS')) courier='ไปรษณีย์';
          else if (cv.includes('FLASH')) courier='FLASH';
          else courier=courierMatch[1];
        }
        const postal    = String(row[11]||'').trim();
        const isTourist = TOURIST_ZIPS.has(postal);
        const isPost    = courier === 'ไปรษณีย์';
        const route     = isPost ? (isTourist?'C':'A') : 'B';
        toUpdateTracking.push({ order_no: orderNo, tracking_no: trackingNo, courier, route });
      }
      if (toUpdateTracking.length > 0) {
        // โหลด orders ที่มีอยู่และยังไม่มี tracking
        const { data: existingNoTrack } = await supabase
          .from('orders').select('id, order_no')
          .in('order_no', toUpdateTracking.map(t=>t.order_no))
          .is('tracking_no', null);
        const noTrackMap: Record<string,string> = {};
        (existingNoTrack||[]).forEach((o:any) => { noTrackMap[o.order_no] = o.id; });
        // อัพเดตเฉพาะที่ไม่มี tracking
        const updates = toUpdateTracking.filter(t => noTrackMap[t.order_no]);
        for (let i=0; i<updates.length; i+=10) {
          await Promise.all(updates.slice(i,i+10).map(t =>
            supabase.from('orders').update({
              tracking_no: t.tracking_no,
              courier: t.courier,
              route: t.route,
              order_status: 'รอแพ็ค',
            }).eq('id', noTrackMap[t.order_no])
          ));
        }
        orderAdded += updates.length; // นับรวมด้วย
      }

      setImportResult({
        added: custAdded,
        updated: custUpdated,
        skipped: orderSkipped,
        unmapped: unmappedProds,
      });

      if (unmappedProds.length > 0) {
        // โหลด promo options แล้วเปิด modal ให้ user จับคู่เอง
        const { data: promos } = await supabase
          .from('products_promo')
          .select('id, name, short_name, price_thb, products_master(name)')
          .eq('active', true)
          .order('id');
        setPromoOptions((promos || []).map((p: any) => ({
          ...p,
          master_name: p.products_master?.name || '',
        })));
        setUnmappedList(unmappedProds);
        const defaults: Record<string, string> = {};
        unmappedProds.forEach(({name}) => { defaults[name] = ''; });
        setMappingSelects(defaults);
        setShowMappingModal(true);
        showToast(`✓ นำเข้าสำเร็จ · พบสินค้า ${unmappedProds.length} รายการยังไม่มีในระบบ`, 'warning');
      } else {
        showToast(`✓ ลูกค้า +${custAdded} อัพเดต ${custUpdated} · ออเดอร์ +${orderAdded} ข้าม ${orderSkipped}`);
      }
      loadCustomers();
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาดในการนำเข้า', 'error');
    } finally { setImporting(false); e.target.value = ''; }
  };

  // บันทึก mappings ที่ user เลือก → trigger remap orders อัตโนมัติ
  const handleSaveMappings = async () => {
    setSavingMappings(true);
    const toSave = Object.entries(mappingSelects).filter(([, pid]) => pid);
    for (const [rawName, promoId] of toSave) {
      await supabase.from('product_mappings').upsert(
        [{ raw_name: rawName, promo_id: promoId }],
        { onConflict: 'raw_name' }
      );
    }
    setSavingMappings(false);
    setShowMappingModal(false);
    if (toSave.length > 0) {
      showToast(`✓ จับคู่สินค้า ${toSave.length} รายการ — ออเดอร์จะ sync อัตโนมัติ`);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    // ดึงข้อมูลจาก customers ที่ถูกเลือก (ค้นจาก filtered ทั้งหมดได้เลย)
    const selectedList = customers.filter(c => selectedIds.has(c.id));
    const hasOrders = selectedList.filter(c => c.order_count > 0);
    const msg = hasOrders.length > 0
      ? `ลบลูกค้า ${selectedIds.size} คน\n⚠ ${hasOrders.length} คน มีออเดอร์ — ออเดอร์จะถูกลบด้วย\nยืนยัน?`
      : `ลบลูกค้า ${selectedIds.size} คน ยืนยัน?`;
    if (!confirm(msg)) return;
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    // แบ่ง chunk 200 กัน timeout เมื่อ ids เยอะ
    const CHUNK = 200;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      await supabase.from('orders').delete().in('customer_id', chunk);
      await supabase.from('customers').delete().in('id', chunk);
    }
    setSelectedIds(new Set());
    showToast(`✓ ลบลูกค้า ${ids.length} คนแล้ว`);
    setBulkDeleting(false);
    loadCustomers();
  };

  const handleDelete = async (c: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    if (c.order_count > 0) {
      if (!confirm(`ลูกค้า "${c.name}" มี ${c.order_count} ออเดอร์\n⚠ ออเดอร์ทั้งหมดจะถูกลบด้วย ข้อมูลจะหายถาวร\nยืนยันลบ?`)) return;
    } else {
      if (!confirm(`ยืนยันลบลูกค้า "${c.name}"?`)) return;
    }
    // ลบออเดอร์ก่อน แล้วค่อยลบลูกค้า
    const { error: oe } = await supabase.from('orders').delete().eq('customer_id', c.id);
    if (oe) { showToast('ลบออเดอร์ไม่สำเร็จ: ' + oe.message, 'error'); return; }
    const { error: ce } = await supabase.from('customers').delete().eq('id', c.id);
    if (ce) { showToast('ลบลูกค้าไม่สำเร็จ: ' + ce.message, 'error'); return; }
    setCustomers(p => p.filter(x => x.id !== c.id));
    showToast(`✓ ลบ "${c.name}" และออเดอร์ทั้งหมดแล้ว`);
  };

  // ── Flash Import helpers ────────────────────────────────────
  // คำนวณราคารวมของสินค้าที่เลือกในแถว idx (promo.price × qty รวมกัน)
  const calcRowSum = (idx: number) => {
    const items = flashPromoSel[idx] || [];
    return items.reduce((sum, it) => {
      const promo = promoOptions.find(p => p.id === it.promoId);
      return sum + (promo ? Number(promo.price_thb) * (it.qty || 1) : 0);
    }, 0);
  };

  // ดูว่ามีการแก้ไขอะไรบ้างหรือยัง (ใช้เช็คก่อนปิด modal)
  const hasUnsavedChanges = () => {
    return Object.values(flashPromoSel).some(items => items && items.length > 0)
      || Object.keys(flashTotalSel).length > 0;
  };

  // เมื่อผู้ใช้กดปิด modal — ถ้ามีการแก้ไขแล้วต้องยืนยันก่อน
  const handleRequestCloseFlash = () => {
    if (hasUnsavedChanges()) {
      setShowConfirmClose(true);
    } else {
      setShowFlashImport(false);
    }
  };

  // ยืนยันปิดจริง ล้าง state ทั้งหมด
  const handleConfirmCloseFlash = () => {
    setShowConfirmClose(false);
    setShowFlashImport(false);
    setFlashPromoSel({});
    setFlashTotalSel({});
    setFlashPromoSearch({});
    setFlashAddQty({});
    setFlashSelectedRows(new Set());
  };

  // Bulk add — เพิ่มสินค้าเดียวกันให้ทุกแถวที่เลือก (ใช้ tracking เป็น key)
  const handleBulkAdd = () => {
    if (!bulkPromoId || flashSelectedRows.size === 0) return;
    const newSel = { ...flashPromoSel };
    flashRows.forEach((r, idx) => {
      const tracking = String(r[1] || '').trim();
      if (!flashSelectedRows.has(tracking)) return;
      const isDup = flashDups.some(d => String(d.row[1]).trim() === tracking);
      if (isDup) return; // ข้าม duplicate
      const curr = newSel[idx] || [];
      // กันเลือกซ้ำในแถวเดียวกัน
      if (curr.some(it => it.promoId === bulkPromoId)) return;
      newSel[idx] = [...curr, { promoId: bulkPromoId, qty: bulkQty }];
    });
    setFlashPromoSel(newSel);
    showToast(`✓ เพิ่มสินค้าให้ ${flashSelectedRows.size} แถวแล้ว`);
    // ปิด modal bulk + ล้าง
    setShowBulkAdd(false);
    setBulkPromoId('');
    setBulkPromoSearch('');
    setBulkQty(1);
    setBulkOpenDropdown(false);
  };

  // ── Edit Customer ────────────────────────────────────────────
  const openEditCustomer = (c: Customer) => {
    setEditCustomer(c);
    setEditCustForm({
      name: c.name,
      facebook_name: c.facebook_name || '',
      tel: c.tel,
      address: c.address || '',
      subdistrict: c.subdistrict || '',
      district: c.district || '',
      province: c.province || '',
      postal_code: c.postal_code || '',
      channel: c.channel || '',
      payment_method: c.payment_method || '',
    });
  };

  const handleSaveCustomer = async () => {
    if (!editCustomer) return;
    if (!editCustForm.name?.trim() || !editCustForm.tel?.trim()) {
      showToast('กรุณากรอกชื่อและเบอร์โทร', 'error');
      return;
    }
    setEditCustSaving(true);
    try {
      const payload = {
        name:           editCustForm.name?.trim() || '',
        facebook_name:  editCustForm.facebook_name?.trim() || null,
        tel:            editCustForm.tel?.trim() || '',
        address:        editCustForm.address?.trim() || null,
        subdistrict:    editCustForm.subdistrict?.trim() || null,
        district:       editCustForm.district?.trim() || null,
        province:       editCustForm.province?.trim() || null,
        postal_code:    editCustForm.postal_code?.trim() || null,
        channel:        editCustForm.channel?.trim() || null,
        payment_method: editCustForm.payment_method?.trim() || null,
      };
      const { error } = await supabase.from('customers').update(payload).eq('id', editCustomer.id);
      if (error) throw error;
      // อัพเดต state แบบ optimistic
      setCustomers(p => p.map(c => c.id === editCustomer.id ? { ...c, ...payload } as Customer : c));
      showToast('✓ บันทึกข้อมูลลูกค้าแล้ว');
      setEditCustomer(null);
      setEditCustForm({});
    } catch (err: any) {
      console.error(err);
      showToast('บันทึกไม่สำเร็จ: ' + (err.message || 'unknown'), 'error');
    } finally {
      setEditCustSaving(false);
    }
  };

  // ── Edit Order ───────────────────────────────────────────────
  const openEditOrder = async (orderId: string) => {
    // โหลดข้อมูลออเดอร์เต็ม
    const { data, error } = await supabase.from('orders')
      .select('*').eq('id', orderId).maybeSingle();
    if (error || !data) {
      showToast('โหลดออเดอร์ไม่สำเร็จ', 'error');
      return;
    }
    // โหลด promos ถ้ายังไม่มี
    if (promoOptions.length === 0) {
      const { data: promos } = await supabase
        .from('products_promo').select('id, name, short_name, price_thb, products_master(name)')
        .eq('active', true).order('id');
      setPromoOptions((promos||[]).map((p: any) => ({
        ...p, master_name: p.products_master?.name || '',
      })));
    }
    // parse รายการสินค้าจาก promo_ids + quantities
    const pids: string[]    = Array.isArray(data.promo_ids) ? data.promo_ids : [];
    const qtys: string[]    = String(data.quantities || '1').split('|').map((s: string) => s.trim());
    const items: {promoId: string; qty: number}[] = pids.map((pid, i) => ({
      promoId: pid,
      qty: Number(qtys[i]) || 1,
    }));
    setEditOrder(data);
    setEditOrderItems(items);
    setEditOrderForm({
      total_thb:      String(data.total_thb || 0),
      tracking_no:    data.tracking_no || '',
      courier:        data.courier || '',
      channel:        data.channel || '',
      payment_method: data.payment_method || '',
      payment_status: data.payment_status || 'รอชำระเงิน',
      order_status:   data.order_status || 'รอแพ็ค',
      note:           data.note || '',
    });
    setEditOrderSearch('');
    setEditOrderAddQty(1);
    setEditOrderDropdownOpen(false);
  };

  const handleSaveOrder = async () => {
    if (!editOrder) return;
    setEditOrderSaving(true);
    try {
      const promoIds   = editOrderItems.map(it => it.promoId);
      const quantities = editOrderItems.length > 0
        ? editOrderItems.map(it => String(it.qty || 1)).join('|')
        : '1';
      const qtySum = editOrderItems.length > 0
        ? editOrderItems.reduce((s, it) => s + (Number(it.qty) || 1), 0)
        : 1;
      const rawProd = editOrderItems.length > 0
        ? editOrderItems.map(it => promoOptions.find(p => p.id === it.promoId)?.name || '').filter(Boolean).join('|')
        : '';

      const payload = {
        promo_ids:      promoIds,
        quantities,
        quantity:       qtySum,
        raw_prod:       rawProd,
        total_thb:      Number(editOrderForm.total_thb) || 0,
        tracking_no:    editOrderForm.tracking_no?.trim() || null,
        courier:        editOrderForm.courier?.trim() || null,
        channel:        editOrderForm.channel?.trim() || null,
        payment_method: editOrderForm.payment_method?.trim() || null,
        payment_status: editOrderForm.payment_status?.trim() || 'รอชำระเงิน',
        order_status:   editOrderForm.order_status?.trim() || 'รอแพ็ค',
        note:           editOrderForm.note?.trim() || null,
      };
      const { error } = await supabase.from('orders').update(payload).eq('id', editOrder.id);
      if (error) throw error;
      // reload orders ใน expanded row ถ้าลูกค้ายังเปิดอยู่
      if (expanded) await loadOrders(expanded);
      // reload customers (เพราะ total_spent อาจเปลี่ยน ผ่าน trigger) — await ให้ยอดอัพเดตก่อนโชว์ toast
      await loadCustomers();
      showToast('✓ บันทึกออเดอร์แล้ว');
      setEditOrder(null);
      setEditOrderItems([]);
      setEditOrderForm({});
    } catch (err: any) {
      console.error(err);
      showToast('บันทึกไม่สำเร็จ: ' + (err.message || 'unknown'), 'error');
    } finally {
      setEditOrderSaving(false);
    }
  };

  const handleDeleteOrder = async (orderId: string, orderNo: string) => {
    if (!confirm(`ลบออเดอร์ "${orderNo}"?\nข้อมูลจะหายถาวร`)) return;
    // หา order ก่อนลบ — เอาไว้ optimistic update customer stats
    const orderToDelete = custOrders.find(o => o.id === orderId);
    const customerId = expanded;
    const { error } = await supabase.from('orders').delete().eq('id', orderId);
    if (error) { showToast('ลบไม่สำเร็จ: ' + error.message, 'error'); return; }
    // Optimistic: ลดยอดใน state ทันที ไม่รอ trigger DB (เห็นผลเร็ว)
    if (orderToDelete && customerId) {
      setCustomers(prev => prev.map(c => c.id === customerId
        ? {
            ...c,
            order_count: Math.max(0, c.order_count - 1),
            total_spent: Math.max(0, Number(c.total_spent) - Number(orderToDelete.total_thb || 0)),
          }
        : c
      ));
      setCustOrders(prev => prev.filter(o => o.id !== orderId));
    }
    showToast('✓ ลบออเดอร์แล้ว');
    // Refresh จาก DB เพื่อให้ตรงกับค่าจริง (หลัง trigger ทำงาน)
    await loadCustomers();
    if (customerId) await loadOrders(customerId);
  };

  const filtered = customers.filter(c => {
    // ถ้าเป็นโหมด problemOnly → แสดงเฉพาะลูกค้าที่มีออเดอร์สถานะปัญหา
    if (problemOnly) {
      if (problemCustomerIds === null) return false; // ยังโหลดไม่เสร็จ
      if (!problemCustomerIds.has(c.id)) return false;
    }
    const matchTag = tagFilter === 'ทั้งหมด' || c.tag === tagFilter;
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase())
      || (c.facebook_name || '').toLowerCase().includes(search.toLowerCase())
      || c.tel.includes(search)
      || (c.province || '').includes(search);
    return matchTag && matchSearch;
  });
  // reset หน้าเมื่อ filter เปลี่ยน
  // (ใช้ใน useEffect ด้านล่าง)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pagedCustomers = pageView === 'all'
    ? filtered
    : filtered.slice((pageView as number) * PAGE_SIZE, ((pageView as number) + 1) * PAGE_SIZE);

  // สถิติสรุป
  const vipCount    = customers.filter(c => c.tag === 'VIP').length;
  const regularCount = customers.filter(c => c.tag === 'ประจำ').length;
  const totalSpent  = customers.reduce((s, c) => s + Number(c.total_spent), 0);
  const topChannel  = (() => {
    const freq: Record<string, number> = {};
    customers.forEach(c => { if (c.channel) freq[c.channel] = (freq[c.channel] || 0) + 1; });
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
  })();

  return (
    <div className="flex flex-col h-screen p-6 pb-2">
      {/* Header */}
      <div className="shrink-0 mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500 flex items-center justify-center">
            <Users size={20} className="text-white"/>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-slate-800">
                {problemOnly ? '⚠ เคสมีปัญหา' : 'ลูกค้า'}
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              {problemOnly
                ? `${filtered.length} ลูกค้าที่มีออเดอร์สถานะปัญหา (ตีกลับ · ไม่มีคนรับ · ค้างอยู่คลัง · ส่งคืน · ปัญหา)`
                : `${customers.length} คน · นำเข้า Excel ครั้งเดียว → บันทึกลูกค้า + ออเดอร์พร้อมกัน`
              }
            </p>
          </div>
        </div>
        {/* ปุ่ม นำเข้า Excel — ซ่อนเมื่อเป็นหน้าเคสมีปัญหา */}
        {!problemOnly && (
        <div className="flex items-center gap-3">
          {importResult && (
            <div className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 space-y-0.5">
              <div>👥 ลูกค้า: เพิ่ม <strong>{importResult.added}</strong> · อัพเดต <strong>{importResult.updated}</strong></div>
              <div>📋 ออเดอร์: บันทึก <strong>{importResult.added + importResult.updated}</strong> · ข้าม {importResult.skipped} ซ้ำ</div>
              {importResult.unmapped.length > 0 && (
                <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded-lg text-orange-700">
                  <div className="font-semibold mb-1">⚠ สินค้ายังไม่มีในระบบ ({importResult.unmapped.length} รายการ)</div>
                  {importResult.unmapped.map(({name, qty}, i) => (
                    <div key={i} className="ml-2">· {name} <span className="text-orange-500 font-bold">×{qty}</span></div>
                  ))}
                  <div className="mt-1 text-orange-600">→ ไปเพิ่มที่หน้า "เพิ่มสินค้า" แล้ว ออเดอร์จะ sync อัตโนมัติ</div>
                </div>
              )}
            </div>
          )}
          <label className={`px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-semibold cursor-pointer shadow-sm transition
            ${importing ? 'bg-slate-200 text-slate-400' : 'bg-cyan-500 text-white hover:bg-cyan-600'}`}>
            <Upload size={16}/>
            {importing ? 'กำลังนำเข้า...' : '📥 นำเข้า Excel'}
            <input type="file" accept=".xlsx,.xls" className="hidden"
              onChange={handleImportExcel} disabled={importing}/>
          </label>
          {/* ปุ่ม Flash Import */}
          <label className="px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-semibold cursor-pointer shadow-sm transition bg-yellow-500 text-white hover:bg-yellow-600">
            <Upload size={16}/>
            ⚡ นำเข้า Flash
            <input type="file" accept=".xlsx,.xls" className="hidden"
              onChange={handleFlashFile}/>
          </label>
        </div>
        )}
      </div>

      {/* KPI */}
      <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {problemOnly ? (
          <>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="text-xs font-semibold text-red-600 mb-1">ลูกค้าที่มีปัญหา</div>
              <div className="text-2xl font-bold text-red-700">{filtered.length}</div>
              <div className="text-xs text-red-500">คน</div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <div className="text-xs font-semibold text-orange-600 mb-1">ออเดอร์ที่มีปัญหา</div>
              <div className="text-2xl font-bold text-orange-700">
                {Object.values(problemOrderCount).reduce((s, n) => s + n, 0)}
              </div>
              <div className="text-xs text-orange-500">รายการ</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="text-xs font-semibold text-amber-600 mb-1">VIP ที่มีปัญหา</div>
              <div className="text-2xl font-bold text-amber-700">
                {filtered.filter(c => c.tag === 'VIP').length}
              </div>
              <div className="text-xs text-amber-500">คน</div>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
              <div className="text-xs font-semibold text-purple-600 mb-1">ประจำที่มีปัญหา</div>
              <div className="text-2xl font-bold text-purple-700">
                {filtered.filter(c => c.tag === 'ประจำ').length}
              </div>
              <div className="text-xs text-purple-500">คน</div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="text-xs font-semibold text-amber-600 mb-1">VIP</div>
              <div className="text-2xl font-bold text-amber-700">{vipCount}</div>
              <div className="text-xs text-amber-500">10+ ออเดอร์</div>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
              <div className="text-xs font-semibold text-purple-600 mb-1">ลูกค้าประจำ</div>
              <div className="text-2xl font-bold text-purple-700">{regularCount}</div>
              <div className="text-xs text-purple-500">3–9 ออเดอร์</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="text-xs font-semibold text-emerald-600 mb-1">ยอดซื้อรวม</div>
              <div className="text-lg font-bold text-emerald-700">฿{fmt(totalSpent)}</div>
              <div className="text-xs text-emerald-500">ทุกลูกค้า</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="text-xs font-semibold text-blue-600 mb-1">เพจยอดนิยม</div>
              <div className="text-sm font-bold text-blue-700 truncate">{topChannel}</div>
              <div className="text-xs text-blue-500">ช่องทางหลัก</div>
            </div>
          </>
        )}
      </div>

      {/* Filter bar */}
      <div className="shrink-0 flex gap-2 mb-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ, เฟสบุ๊ก, เบอร์, จังหวัด..."
            className="w-full pl-8 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {['ทั้งหมด','VIP','ประจำ','ใหม่'].map(t => (
            <button key={t} onClick={() => setTagFilter(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${tagFilter===t?'bg-white shadow text-slate-800':'text-slate-500'}`}>{t}</button>
          ))}
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300">
          <option value="total_spent">เรียงตามยอดซื้อ</option>
          <option value="order_count">เรียงตามจำนวนครั้ง</option>
          <option value="updated_at">เรียงตามล่าสุด</option>
        </select>
        <span className="text-xs text-slate-400">{filtered.length} คน</span>
        {/* Pagination buttons */}
        <div className="flex items-center gap-1 ml-2">
          {Array.from({ length: totalPages }, (_, i) => (
            <button key={i} onClick={() => setPageView(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                pageView === i ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              หน้า {i + 1}
            </button>
          ))}
          <button onClick={() => setPageView('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              pageView === 'all' ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>
            ALL
          </button>
          <span className="text-xs text-slate-400 ml-1">
            {pageView === 'all' ? `แสดงทั้งหมด` : `แสดง ${pagedCustomers.length} / ${filtered.length}`}
          </span>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="shrink-0 flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mb-2 flex-wrap">
          <span className="text-sm font-medium text-red-700">
            เลือก {selectedIds.size} คน
            {selectedIds.size < filtered.length && (
              <button onClick={() => setSelectedIds(new Set(filtered.map(c => c.id)))}
                className="ml-2 text-xs text-red-500 underline hover:text-red-700">
                เลือกทั้งหมด {filtered.length} คน
              </button>
            )}
          </span>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 bg-white rounded-lg border"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="ml-auto px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium
                       hover:bg-red-600 disabled:opacity-50 flex items-center gap-2"
          >
            <Trash2 size={14}/>
            {bulkDeleting ? 'กำลังลบ...' : `ลบ ${selectedIds.size} คน`}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
        <table className="text-sm w-full" style={{minWidth:'1000px'}}>
          <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
            <tr>
              <th className="p-3 w-8">
                <input type="checkbox"
                  checked={filtered.length > 0 && filtered.every(c => selectedIds.has(c.id))}
                  ref={el => {
                    if (el) el.indeterminate = selectedIds.size > 0 && !filtered.every(c => selectedIds.has(c.id));
                  }}
                  onChange={e => {
                    // เลือก/ยกเลิก ทั้งหมดใน filtered (ไม่ใช่แค่หน้าปัจจุบัน)
                    if (e.target.checked) setSelectedIds(new Set(filtered.map(c => c.id)));
                    else setSelectedIds(new Set());
                  }}
                  className="rounded cursor-pointer"
                />
              </th>
              <th className="p-3 w-8"/>
              <th className="p-3 text-left whitespace-nowrap" style={{minWidth:'140px'}}>ชื่อลูกค้า</th>
              <th className="p-3 text-left whitespace-nowrap">ชื่อเฟสบุ๊ก</th>
              <th className="p-3 text-left whitespace-nowrap">เบอร์โทร</th>
              <th className="p-3 text-left whitespace-nowrap">จังหวัด</th>
              <th className="p-3 text-left whitespace-nowrap">ช่องทาง</th>
              <th className="p-3 text-center whitespace-nowrap">วิธีชำระ</th>
              <th className="p-3 text-center whitespace-nowrap">ออเดอร์</th>
              <th className="p-3 text-right whitespace-nowrap">ยอดรวม (฿)</th>
              <th className="p-3 text-center whitespace-nowrap">แท็ก</th>
              <th className="p-3 w-10"/>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={13} className="p-8 text-center text-slate-400">กำลังโหลด...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={13} className="p-8 text-center text-slate-400">ไม่พบลูกค้า</td></tr>}
            {pagedCustomers.map(c => (
              <>
                <tr key={c.id} onClick={() => toggleExpand(c.id)}
                  className={`border-b cursor-pointer hover:bg-cyan-50 transition ${expanded===c.id?'bg-cyan-50':''}`}>
                  <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                    <input type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={e => {
                        const next = new Set(selectedIds);
                        e.target.checked ? next.add(c.id) : next.delete(c.id);
                        setSelectedIds(next);
                      }}
                      className="rounded cursor-pointer"
                    />
                  </td>
                  <td className="p-3 text-center text-slate-400">
                    {expanded===c.id ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                  </td>
                  <td className="p-3 whitespace-nowrap" style={{minWidth:'140px'}}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{c.name}</span>
                      {problemOnly && problemOrderCount[c.id] > 0 && (
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-bold whitespace-nowrap"
                          title={`มีออเดอร์สถานะปัญหา ${problemOrderCount[c.id]} รายการ`}>
                          ⚠ {problemOrderCount[c.id]}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-xs text-blue-600 whitespace-nowrap">
                    {c.facebook_name && c.facebook_name !== c.name && c.facebook_name !== '-'
                      ? c.facebook_name
                      : <span className="text-slate-300">-</span>}
                  </td>
                  <td className="p-3 font-mono text-xs text-slate-600">{c.tel}</td>
                  <td className="p-3 text-xs text-slate-500">{c.province || '-'}</td>
                  <td className="p-3 text-xs text-slate-500 max-w-[120px] truncate">{c.channel || '-'}</td>
                  <td className="p-3 text-center">
                    {c.payment_method
                      ? <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.payment_method === 'COD' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                          {c.payment_method}
                        </span>
                      : <span className="text-slate-300 text-xs">-</span>}
                  </td>
                  <td className="p-3 text-center">
                    <span className="px-2 py-0.5 bg-cyan-100 text-cyan-800 rounded-full text-xs font-bold">{c.order_count}</span>
                  </td>
                  <td className="p-3 text-right font-bold text-emerald-600">฿{fmt2(Number(c.total_spent))}</td>
                  <td className="p-3 text-center">
                    <button onClick={e => { e.stopPropagation(); setEditTag({id:c.id, tag:c.tag||'ใหม่'}); }}
                      className={`px-2.5 py-1 rounded-full text-xs font-bold cursor-pointer hover:opacity-80 ${TAG_COLORS[c.tag||'ใหม่'] || 'bg-slate-100 text-slate-600'}`}>
                      {c.tag || 'ใหม่'}
                    </button>
                  </td>
                  <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-0.5">
                      <button onClick={() => openEditCustomer(c)}
                        className="p-1.5 text-slate-300 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition"
                        title="แก้ไขข้อมูลลูกค้า">
                        <Edit2 size={14}/>
                      </button>
                      <button onClick={e => handleDelete(c, e)}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                        title="ลบลูกค้า">
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>

                {/* ExpandedRow: รายละเอียด + ประวัติออเดอร์ */}
                {expanded === c.id && (
                  <tr key={`${c.id}-detail`}>
                    <td colSpan={13} className="bg-cyan-50 px-6 py-4 border-b">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                        <div>
                          <div className="text-xs text-slate-400 mb-0.5">ที่อยู่</div>
                          <div className="text-xs text-slate-700">{[c.address, c.subdistrict, c.district, c.province, c.postal_code].filter(Boolean).join(' ') || '-'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-0.5">ช่องทาง</div>
                          <div className="text-xs text-slate-700">{c.channel || '-'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-0.5">วิธีชำระ</div>
                          <div className="text-xs text-slate-700">{c.payment_method || '-'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-0.5">ลูกค้าตั้งแต่</div>
                          <div className="text-xs text-slate-700">{new Date(c.created_at).toLocaleDateString('th-TH')}</div>
                        </div>
                      </div>
                      <div className="text-xs font-semibold text-slate-600 mb-2">ประวัติออเดอร์</div>
                      {loadingOrders ? (
                        <div className="text-xs text-slate-400">กำลังโหลด...</div>
                      ) : (
                        <div className="space-y-1 max-h-48 overflow-auto">
                          {custOrders.length === 0 && <div className="text-xs text-slate-400">ยังไม่มีออเดอร์</div>}
                          {custOrders.map(o => (
                            <div key={o.id} className="flex items-center gap-3 text-xs bg-white rounded-lg px-3 py-2">
                              <span className="font-mono text-cyan-600 w-32 shrink-0">{o.order_no}</span>
                              <span className="text-slate-400 w-20 shrink-0">{o.order_date}</span>
                              {o.ship_date && (
                                <span className="text-blue-600 text-xs font-medium w-24 shrink-0">
                                  🚚 {o.ship_date.split('-').reverse().join('-')}
                                </span>
                              )}
                              {o.tracking_no && shipCostMap[o.tracking_no] && (
                                <span className="text-blue-700 text-xs font-bold shrink-0">
                                  ฿{Number(shipCostMap[o.tracking_no]).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})}
                                </span>
                              )}
                              <span className="text-slate-600 flex-1 truncate">{o.raw_prod || '-'}</span>
                              <span className="font-bold text-emerald-600 shrink-0">฿{fmt2(Number(o.total_thb))}</span>
                              <span className={`px-2 py-0.5 rounded-full font-medium shrink-0 ${
                                o.order_status === 'แพ็คสินค้า' ? 'bg-teal-100 text-teal-700' :
                                o.order_status === 'รอแพ็ค' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-slate-100 text-slate-500'}`}>{o.order_status}</span>
                              {o.tracking_no && <span className="font-mono text-xs text-blue-500 shrink-0">{o.tracking_no}</span>}
                              {/* ปุ่มจัดการออเดอร์ */}
                              <div className="flex items-center gap-0.5 shrink-0 ml-auto">
                                <button onClick={() => openEditOrder(o.id)}
                                  className="p-1 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded transition"
                                  title="แก้ไขออเดอร์">
                                  <Edit2 size={13}/>
                                </button>
                                <button onClick={() => handleDeleteOrder(o.id, o.order_no)}
                                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition"
                                  title="ลบออเดอร์">
                                  <Trash2 size={13}/>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal แก้ tag */}
      {editTag && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-xs w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800">เปลี่ยนแท็กลูกค้า</h3>
              <button onClick={() => setEditTag(null)}><X size={18} className="text-slate-400"/></button>
            </div>
            <div className="space-y-2 mb-4">
              {['VIP','ประจำ','ใหม่'].map(t => (
                <button key={t} onClick={() => setEditTag(p => p ? {...p, tag:t} : null)}
                  className={`w-full py-2.5 rounded-lg text-sm font-medium border transition ${editTag.tag===t?'border-cyan-400 bg-cyan-50 text-cyan-700':'border-slate-200 hover:bg-slate-50'}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditTag(null)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm">ยกเลิก</button>
              <button onClick={saveTag} className="flex-1 py-2 bg-cyan-500 text-white rounded-lg text-sm hover:bg-cyan-600">บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {/* ── Mapping Modal ── */}
      {showMappingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-start mb-4 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800">🔍 จับคู่สินค้าที่ยังไม่มีในระบบ</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  เลือกสินค้าที่ตรงกัน หรือกด "ไปเพิ่มสินค้า" ถ้ายังไม่มีในระบบ
                </p>
              </div>
              <button onClick={() => setShowMappingModal(false)} className="text-slate-400 hover:text-slate-600 ml-4">
                <X size={20}/>
              </button>
            </div>

            {/* ช่องค้นหาสินค้า */}
            <div className="shrink-0 mb-3">
              <input
                value={mappingSearch}
                onChange={e => setMappingSearch(e.target.value)}
                placeholder="🔍 ค้นหาชื่อสินค้า / รหัส..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
              />
            </div>

            <div className="flex-1 overflow-auto space-y-3 min-h-0">
              {unmappedList.map(({name: rawName, qty}) => {
                const selectedPromo = promoOptions.find(p => p.id === mappingSelects[rawName]);
                const filtered = promoOptions.filter(p => {
                  const q = mappingSearch.toLowerCase();
                  return !q || p.id.toLowerCase().includes(q)
                    || p.name.toLowerCase().includes(q)
                    || (p.short_name||'').toLowerCase().includes(q)
                    || (p.master_name||'').toLowerCase().includes(q);
                });
                return (
                  <div key={rawName} className="bg-slate-50 rounded-xl p-3">
                    {/* ชื่อ + จำนวน จาก Excel */}
                    <div className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                      <span className="text-orange-500">⚠</span>
                      <span className="font-mono bg-orange-50 px-2 py-0.5 rounded text-orange-700">{rawName}</span>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">×{qty} ชิ้น</span>
                    </div>

                    {/* แสดงสินค้าที่เลือกไว้ */}
                    {selectedPromo && (
                      <div className="mb-2 px-2 py-1.5 bg-cyan-50 border border-cyan-200 rounded-lg text-xs text-cyan-700 flex items-center gap-2">
                        <span className="font-bold">{selectedPromo.id}</span>
                        <span className="text-slate-500">{selectedPromo.master_name}</span>
                        <span>· {selectedPromo.name}</span>
                        <span className="ml-auto font-bold text-emerald-600">฿{Number(selectedPromo.price_thb).toLocaleString()}</span>
                      </div>
                    )}

                    {/* dropdown options แบบ list */}
                    <div className="border rounded-lg overflow-hidden max-h-40 overflow-y-auto bg-white">
                      <div
                        onClick={() => setMappingSelects(prev => ({ ...prev, [rawName]: '' }))}
                        className={`px-3 py-2 text-xs cursor-pointer border-b hover:bg-slate-50 ${
                          !mappingSelects[rawName] ? 'bg-slate-100 font-medium' : ''
                        }`}
                      >
                        — ข้ามไปก่อน —
                      </div>
                      {filtered.map(p => (
                        <div
                          key={p.id}
                          onClick={() => setMappingSelects(prev => ({ ...prev, [rawName]: p.id }))}
                          className={`px-3 py-2 text-xs cursor-pointer border-b last:border-0 hover:bg-cyan-50 flex items-center gap-2 ${
                            mappingSelects[rawName] === p.id ? 'bg-cyan-100' : ''
                          }`}
                        >
                          <span className="font-mono text-slate-400 shrink-0 w-16">{p.id}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-slate-400 text-[10px] truncate">{p.master_name}</div>
                            <div className="text-slate-700 font-medium truncate">{p.name}</div>
                          </div>
                          <span className="shrink-0 font-bold text-emerald-600">฿{Number(p.price_thb).toLocaleString()}</span>
                        </div>
                      ))}
                      {filtered.length === 0 && (
                        <div className="px-3 py-3 text-xs text-slate-400 text-center">ไม่พบสินค้า</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="shrink-0 flex gap-2 mt-5">
              {onGoToProducts && (
                <button
                  onClick={() => { setShowMappingModal(false); onGoToProducts(); }}
                  className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200 font-medium"
                >
                  ➕ ไปเพิ่มสินค้า
                </button>
              )}
              <button
                onClick={() => setShowMappingModal(false)}
                className="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-300"
              >
                ข้ามทั้งหมด
              </button>
              <button
                onClick={handleSaveMappings}
                disabled={savingMappings || Object.values(mappingSelects).every(v => !v)}
                className="flex-1 py-2.5 bg-cyan-500 text-white rounded-lg text-sm font-medium
                           hover:bg-cyan-600 disabled:opacity-50"
              >
                {savingMappings ? 'กำลังบันทึก...' : `✓ บันทึก (${Object.values(mappingSelects).filter(Boolean).length} รายการ)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Flash Import ── */}
      {showFlashImport && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl">
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Flash Import — เลือกสินค้าก่อน import</h3>
                <p className="text-sm text-slate-500 mt-0.5">{flashRows.length} รายการ {flashDups.length > 0 && <span className="text-orange-500 font-medium ml-2">Tracking ซ้ำ {flashDups.length} รายการ (จะถูกข้าม)</span>}</p>
              </div>
              <button onClick={handleRequestCloseFlash} className="p-2 hover:bg-slate-100 rounded-xl text-slate-500">✕</button>
            </div>

            {/* Filter bar: ค้นหา + ช่วงราคา COD */}
            <div className="px-5 pt-3 pb-2 flex gap-2 flex-wrap items-center">
              <input value={flashSearch} onChange={e => setFlashSearch(e.target.value)}
                placeholder="ค้นหา ชื่อ / เบอร์ / tracking..."
                className="flex-1 min-w-[200px] border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"/>
              <div className="flex items-center gap-1.5 bg-slate-50 border rounded-xl px-3 py-1.5">
                <span className="text-xs text-slate-500 shrink-0">COD:</span>
                <input type="number" min="0" value={flashMinCod}
                  onChange={e => setFlashMinCod(e.target.value)}
                  placeholder="ต่ำสุด"
                  className="w-20 border-0 bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-yellow-300 rounded px-1 text-right"/>
                <span className="text-xs text-slate-400">–</span>
                <input type="number" min="0" value={flashMaxCod}
                  onChange={e => setFlashMaxCod(e.target.value)}
                  placeholder="สูงสุด"
                  className="w-20 border-0 bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-yellow-300 rounded px-1 text-right"/>
                {(flashMinCod || flashMaxCod) && (
                  <button onClick={() => { setFlashMinCod(''); setFlashMaxCod(''); }}
                    className="text-slate-400 hover:text-red-500 text-xs ml-1" title="ล้าง">✕</button>
                )}
              </div>
            </div>

            {/* Bulk action bar — โผล่มาเมื่อเลือกแถว */}
            {flashSelectedRows.size > 0 && (
              <div className="mx-5 mb-2 px-4 py-2.5 bg-yellow-50 border border-yellow-300 rounded-xl flex items-center gap-3 flex-wrap">
                <span className="text-sm font-semibold text-yellow-800">
                  ☑ เลือก {flashSelectedRows.size} แถว
                </span>
                <button
                  onClick={() => {
                    setBulkPromoId('');
                    setBulkPromoSearch('');
                    setBulkQty(1);
                    setShowBulkAdd(true);
                  }}
                  className="px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-xs font-medium hover:bg-yellow-600 flex items-center gap-1"
                >
                  + เพิ่มสินค้าให้ทุกแถวที่เลือก
                </button>
                <button
                  onClick={() => setFlashSelectedRows(new Set())}
                  className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 bg-white rounded-lg border ml-auto"
                >
                  ยกเลิกการเลือก
                </button>
              </div>
            )}

            {flashDups.length > 0 && (
              <div className="mx-5 mb-2 p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700">
                <div className="font-bold mb-1">Tracking ซ้ำ — จะถูกข้ามไป:</div>
                {flashDups.map((d: any, i: number) => (
                  <div key={i} className="ml-2">· {d.row[1]} (ลูกค้า: {d.existing?.customers?.name})</div>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-auto px-5">
              <table className="w-full text-sm" style={{minWidth:'950px'}}>
                <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-20">
                  <tr>
                    <th className="p-2 w-8 text-center">
                      {/* Select all — เลือกทุกแถวที่ผ่าน filter และไม่ใช่ dup */}
                      {(() => {
                        const minCod = flashMinCod ? Number(flashMinCod) : -Infinity;
                        const maxCod = flashMaxCod ? Number(flashMaxCod) : Infinity;
                        const visibleTrackings = flashRows.filter((r: any) => {
                          const tracking = String(r[1]||'').trim();
                          const isDup = flashDups.some((d: any) => String(d.row[1]).trim() === tracking);
                          if (isDup) return false;
                          const cod = Number(r[17] || 0);
                          if (cod < minCod || cod > maxCod) return false;
                          if (flashSearch &&
                              !String(r[10]||'').includes(flashSearch) &&
                              !String(r[11]||'').includes(flashSearch) &&
                              !String(r[1]||'').includes(flashSearch)) return false;
                          return true;
                        }).map((r: any) => String(r[1]||'').trim());
                        const allChecked = visibleTrackings.length > 0 && visibleTrackings.every(t => flashSelectedRows.has(t));
                        return (
                          <input type="checkbox"
                            checked={allChecked}
                            onChange={e => {
                              const next = new Set(flashSelectedRows);
                              if (e.target.checked) visibleTrackings.forEach(t => next.add(t));
                              else visibleTrackings.forEach(t => next.delete(t));
                              setFlashSelectedRows(next);
                            }}
                            className="rounded cursor-pointer"
                            title="เลือกทั้งหมดที่แสดงอยู่"
                          />
                        );
                      })()}
                    </th>
                    <th className="p-2 text-left">#</th>
                    <th className="p-2 text-left">Tracking</th>
                    <th className="p-2 text-left">ชื่อผู้รับ</th>
                    <th className="p-2 text-left">เบอร์</th>
                    <th className="p-2 text-left">จังหวัด</th>
                    <th className="p-2 text-right">COD</th>
                    <th className="p-2 text-left" style={{minWidth:'280px'}}>สินค้า / โปรโมชั่น</th>
                    <th className="p-2 text-right">ยอดรวม</th>
                  </tr>
                </thead>
                <tbody>
                  {flashRows
                    .filter((r: any) => {
                      // ค้นหา
                      if (flashSearch &&
                          !String(r[10]||'').includes(flashSearch) &&
                          !String(r[11]||'').includes(flashSearch) &&
                          !String(r[1]||'').includes(flashSearch)) return false;
                      // ช่วงราคา COD
                      const cod = Number(r[17] || 0);
                      if (flashMinCod && cod < Number(flashMinCod)) return false;
                      if (flashMaxCod && cod > Number(flashMaxCod)) return false;
                      return true;
                    })
                    .map((r: any) => {
                      // หา index จริงใน flashRows (ไม่ใช่ index หลัง filter)
                      const idx = flashRows.indexOf(r);
                      const tracking = String(r[1]||'').trim();
                      const isDup = flashDups.some((d: any) => String(d.row[1]).trim() === tracking);
                      const dp = String(r[13]||'').split(' ');
                      const province = dp[dp.length-1] || '-';
                      const cod = Number(r[17]||0);
                      const productSum = calcRowSum(idx);
                      const totalVal = flashTotalSel[idx] !== undefined ? Number(flashTotalSel[idx]) : cod;
                      // แจ้งเตือนราคาไม่ตรง (มีสินค้าเลือกอย่างน้อย 1 รายการ และราคาต่างจากยอดรวม)
                      const hasItems = (flashPromoSel[idx] || []).length > 0;
                      const priceDiff = hasItems && Math.abs(productSum - totalVal) > 0.01
                        ? productSum - totalVal : 0;
                      const isSelected = flashSelectedRows.has(tracking);
                      return (
                        <tr key={idx} className={`border-b text-xs ${isDup ? 'bg-orange-50 opacity-60' : isSelected ? 'bg-yellow-50' : 'hover:bg-slate-50'}`}>
                          <td className="p-2 text-center">
                            {!isDup && (
                              <input type="checkbox"
                                checked={isSelected}
                                onChange={e => {
                                  const next = new Set(flashSelectedRows);
                                  e.target.checked ? next.add(tracking) : next.delete(tracking);
                                  setFlashSelectedRows(next);
                                }}
                                className="rounded cursor-pointer"
                              />
                            )}
                          </td>
                          <td className="p-2 text-slate-400">{idx+1}{isDup && ' ⚠'}</td>
                          <td className="p-2 font-mono text-blue-600 text-[11px]">{String(r[1]||'')}</td>
                          <td className="p-2 font-medium">{String(r[10]||'')}</td>
                          <td className="p-2 text-slate-500">{String(r[11]||'')}</td>
                          <td className="p-2 text-slate-500">{province}</td>
                          <td className="p-2 text-right font-medium text-emerald-600">฿{cod.toLocaleString()}</td>
                          <td className="p-2 align-top" style={{minWidth:'280px'}}>
                            {isDup ? <span className="text-orange-400 text-[11px]">ข้าม (ซ้ำ)</span> : (
                              <div className="space-y-1.5">
                                {/* list รายการที่เลือกแล้ว */}
                                {(flashPromoSel[idx] || []).map((item, itemIdx) => {
                                  const promo = promoOptions.find(p => p.id === item.promoId);
                                  return (
                                    <div key={itemIdx} className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 rounded-lg px-2 py-1" title={`รหัส: ${item.promoId}`}>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-[10px] text-slate-500 leading-tight truncate">{promo?.master_name || '—'}</div>
                                        <div className="text-[11px] text-slate-800 font-medium leading-tight truncate">{promo?.name || '—'}</div>
                                      </div>
                                      <input type="number" min="1"
                                        value={item.qty}
                                        onChange={e => {
                                          const qty = Math.max(1, Number(e.target.value)||1);
                                          setFlashPromoSel(prev => ({
                                            ...prev,
                                            [idx]: (prev[idx]||[]).map((it, i) => i === itemIdx ? {...it, qty} : it)
                                          }));
                                        }}
                                        className="w-12 border rounded px-1.5 py-0.5 text-[11px] text-center focus:outline-none focus:ring-1 focus:ring-yellow-300 shrink-0"/>
                                      <button
                                        onClick={() => setFlashPromoSel(prev => ({
                                          ...prev,
                                          [idx]: (prev[idx]||[]).filter((_, i) => i !== itemIdx)
                                        }))}
                                        className="text-red-400 hover:text-red-600 shrink-0 w-5 h-5 rounded hover:bg-red-50 flex items-center justify-center"
                                        title="ลบรายการนี้"
                                      >✕</button>
                                    </div>
                                  );
                                })}

                                {/* combobox เพิ่มรายการ */}
                                <div className="relative">
                                  <div className="flex gap-1">
                                    <div className="flex-1 relative">
                                      <input
                                        type="text"
                                        value={flashPromoSearch[idx] || ''}
                                        onChange={e => {
                                          setFlashPromoSearch(prev => ({...prev, [idx]: e.target.value}));
                                          setFlashOpenPromo(idx);
                                          // recalc position เมื่อพิมพ์ (กรณี scroll)
                                          const rect = e.target.getBoundingClientRect();
                                          const spaceBelow = window.innerHeight - rect.bottom;
                                          const openUp = spaceBelow < 220; // ถ้าพื้นที่ด้านล่างน้อยกว่า 220px ให้ขึ้นข้างบน
                                          setPromoDropdownPos({
                                            top: openUp ? rect.top : rect.bottom,
                                            left: rect.left,
                                            width: rect.width,
                                            openUp,
                                          });
                                        }}
                                        onFocus={e => {
                                          setFlashOpenPromo(idx);
                                          const rect = e.target.getBoundingClientRect();
                                          const spaceBelow = window.innerHeight - rect.bottom;
                                          const openUp = spaceBelow < 220;
                                          setPromoDropdownPos({
                                            top: openUp ? rect.top : rect.bottom,
                                            left: rect.left,
                                            width: rect.width,
                                            openUp,
                                          });
                                        }}
                                        placeholder="+ เพิ่มสินค้า (พิมพ์ค้นหา: ชื่อ/โปร)"
                                        className="w-full border rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-yellow-300 bg-white"
                                      />
                                    </div>
                                    <input
                                      type="number"
                                      min="1"
                                      value={flashAddQty[idx] ?? 1}
                                      onChange={e => {
                                        const qty = Math.max(1, Number(e.target.value)||1);
                                        setFlashAddQty(prev => ({...prev, [idx]: qty}));
                                      }}
                                      placeholder="จำนวน"
                                      className="w-12 border rounded-lg px-1.5 py-1 text-[11px] text-center focus:outline-none focus:ring-1 focus:ring-yellow-300"
                                      title="จำนวน"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="p-2">
                            {isDup ? '-' : (
                              <div className="flex items-center gap-1 justify-end">
                                {priceDiff !== 0 && (
                                  <span
                                    className="text-orange-500 cursor-help shrink-0"
                                    title={`⚠ ราคาสินค้ารวม ฿${productSum.toLocaleString()} ${priceDiff > 0 ? 'มากกว่า' : 'น้อยกว่า'}ยอดรวม ฿${totalVal.toLocaleString()} อยู่ ฿${Math.abs(priceDiff).toLocaleString()}`}
                                  >
                                    ⚠
                                  </span>
                                )}
                                <input type="number"
                                  value={flashTotalSel[idx] !== undefined ? flashTotalSel[idx] : String(cod)}
                                  onChange={e => setFlashTotalSel((prev: any) => ({...prev, [idx]: e.target.value}))}
                                  className={`border rounded px-2 py-1 text-xs w-24 text-right focus:outline-none focus:ring-1 focus:ring-yellow-300 ${priceDiff !== 0 ? 'border-orange-300 bg-orange-50' : ''}`}/>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t flex items-center justify-between gap-3 bg-slate-50 rounded-b-2xl">
              <p className="text-xs text-slate-400">💡 1 ออเดอร์ = เพิ่มได้หลายรายการ · พิมพ์ในช่องเพื่อค้นหาสินค้า · ⚠ = ราคาสินค้าไม่ตรงยอดรวม</p>
              <div className="flex gap-2">
                <button onClick={handleRequestCloseFlash} className="px-4 py-2 bg-slate-200 rounded-xl text-sm hover:bg-slate-300">ยกเลิก</button>
                <button onClick={handleFlashImport} disabled={flashSaving}
                  className="px-6 py-2 bg-yellow-500 text-white rounded-xl text-sm font-semibold hover:bg-yellow-600 disabled:opacity-50">
                  {flashSaving ? 'กำลัง import...' : `Import ${flashRows.length - flashDups.length} รายการ`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Bulk Add สินค้าให้หลายแถว ── */}
      {showBulkAdd && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800">เพิ่มสินค้าพร้อมกัน</h3>
                <p className="text-sm text-slate-500 mt-0.5">เพิ่มให้ {flashSelectedRows.size} แถวที่เลือกไว้</p>
              </div>
              <button onClick={() => setShowBulkAdd(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-500">✕</button>
            </div>
            <div className="p-5 space-y-3">
              {/* Combobox สินค้า */}
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">สินค้า *</label>
                <div className="relative">
                  {bulkPromoId ? (
                    // แสดงสินค้าที่เลือกแล้ว พร้อมปุ่มเปลี่ยน
                    (() => {
                      const selected = promoOptions.find(p => p.id === bulkPromoId);
                      return (
                        <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-300 rounded-lg px-3 py-2">
                          <span className="font-mono text-[11px] text-slate-500 shrink-0">{bulkPromoId}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] text-slate-400 truncate">{selected?.master_name}</div>
                            <div className="text-xs text-slate-700 font-medium truncate">{selected?.name}</div>
                          </div>
                          <span className="shrink-0 text-xs font-bold text-emerald-600">฿{Number(selected?.price_thb || 0).toLocaleString()}</span>
                          <button onClick={() => { setBulkPromoId(''); setBulkPromoSearch(''); setBulkOpenDropdown(true); }}
                            className="text-slate-400 hover:text-red-500 shrink-0">✕</button>
                        </div>
                      );
                    })()
                  ) : (
                    <input type="text"
                      value={bulkPromoSearch}
                      onChange={e => { setBulkPromoSearch(e.target.value); setBulkOpenDropdown(true); }}
                      onFocus={() => setBulkOpenDropdown(true)}
                      placeholder="พิมพ์ค้นหา: ชื่อ / รหัส P0001 / ชื่อโปร..."
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"/>
                  )}

                  {!bulkPromoId && bulkOpenDropdown && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setBulkOpenDropdown(false)}/>
                      <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto z-20">
                        {(() => {
                          const q = bulkPromoSearch.toLowerCase().trim();
                          const results = promoOptions.filter(p => {
                            if (!q) return true;
                            return (
                              p.id.toLowerCase().includes(q) ||
                              p.name.toLowerCase().includes(q) ||
                              (p.short_name || '').toLowerCase().includes(q) ||
                              (p.master_name || '').toLowerCase().includes(q)
                            );
                          }).slice(0, 30);
                          if (results.length === 0) {
                            return <div className="px-3 py-4 text-center text-xs text-slate-400">ไม่พบ "{q}"</div>;
                          }
                          return results.map(p => (
                            <div key={p.id}
                              onClick={() => {
                                setBulkPromoId(p.id);
                                setBulkPromoSearch('');
                                setBulkOpenDropdown(false);
                              }}
                              className="px-3 py-2 border-b last:border-0 hover:bg-yellow-50 cursor-pointer flex items-center gap-2"
                            >
                              <span className="font-mono text-[10px] text-slate-400 shrink-0 w-14">{p.id}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-[10px] text-slate-400 truncate">{p.master_name}</div>
                                <div className="text-xs text-slate-700 font-medium truncate">{p.name}</div>
                              </div>
                              <span className="shrink-0 text-xs font-bold text-emerald-600">฿{Number(p.price_thb).toLocaleString()}</span>
                            </div>
                          ));
                        })()}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* จำนวน */}
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">จำนวน</label>
                <input type="number" min="1"
                  value={bulkQty}
                  onChange={e => setBulkQty(Math.max(1, Number(e.target.value)||1))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"/>
              </div>

              <div className="text-xs text-slate-400 bg-slate-50 rounded-lg p-2.5 leading-relaxed">
                💡 ระบบจะข้ามแถวที่มีสินค้านี้อยู่แล้วให้อัตโนมัติ (กันซ้ำ)
              </div>
            </div>
            <div className="p-4 border-t bg-slate-50 flex gap-2 rounded-b-2xl">
              <button onClick={() => setShowBulkAdd(false)}
                className="flex-1 py-2 bg-slate-200 rounded-xl text-sm hover:bg-slate-300">ยกเลิก</button>
              <button onClick={handleBulkAdd}
                disabled={!bulkPromoId}
                className="flex-1 py-2.5 bg-yellow-500 text-white rounded-xl text-sm font-semibold hover:bg-yellow-600 disabled:opacity-50">
                ✓ เพิ่มให้ {flashSelectedRows.size} แถว
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirm close (เมื่อมีการแก้ไขค้างอยู่) ── */}
      {showConfirmClose && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                <span className="text-xl">⚠</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">ปิดโดยไม่บันทึก?</h3>
                <p className="text-sm text-slate-500 mt-1">คุณได้เลือกสินค้าไว้แล้ว ถ้าปิดตอนนี้ข้อมูลที่ใส่ไว้จะหายทั้งหมด</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirmClose(false)}
                className="flex-1 py-2.5 bg-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-300">
                ทำต่อ
              </button>
              <button onClick={handleConfirmCloseFlash}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600">
                ปิด (ทิ้งข้อมูล)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: แก้ไขข้อมูลลูกค้า ── */}
      {editCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[65] p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800">แก้ไขข้อมูลลูกค้า</h3>
                <p className="text-sm text-slate-500 mt-0.5">{editCustomer.name}</p>
              </div>
              <button onClick={() => { setEditCustomer(null); setEditCustForm({}); }}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-500"><X size={18}/></button>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ชื่อลูกค้า *</label>
                  <input value={editCustForm.name || ''}
                    onChange={e => setEditCustForm(p => ({...p, name: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ชื่อเฟสบุ๊ก</label>
                  <input value={editCustForm.facebook_name || ''}
                    onChange={e => setEditCustForm(p => ({...p, facebook_name: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">เบอร์โทร *</label>
                  <input value={editCustForm.tel || ''}
                    onChange={e => setEditCustForm(p => ({...p, tel: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 font-mono"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ช่องทาง</label>
                  <input value={editCustForm.channel || ''}
                    onChange={e => setEditCustForm(p => ({...p, channel: e.target.value}))}
                    placeholder="Facebook / Lazada / Shopee..."
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">ที่อยู่</label>
                <input value={editCustForm.address || ''}
                  onChange={e => setEditCustForm(p => ({...p, address: e.target.value}))}
                  placeholder="บ้านเลขที่ หมู่ ซอย ถนน..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ตำบล</label>
                  <input value={editCustForm.subdistrict || ''}
                    onChange={e => setEditCustForm(p => ({...p, subdistrict: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">อำเภอ</label>
                  <input value={editCustForm.district || ''}
                    onChange={e => setEditCustForm(p => ({...p, district: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">จังหวัด</label>
                  <input value={editCustForm.province || ''}
                    onChange={e => setEditCustForm(p => ({...p, province: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">รหัสไปรษณีย์</label>
                  <input value={editCustForm.postal_code || ''}
                    onChange={e => setEditCustForm(p => ({...p, postal_code: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 font-mono"/>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">วิธีชำระ</label>
                <input value={editCustForm.payment_method || ''}
                  onChange={e => setEditCustForm(p => ({...p, payment_method: e.target.value}))}
                  placeholder="COD / โอน / ..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
              </div>
            </div>

            <div className="p-4 border-t bg-slate-50 flex gap-2 rounded-b-2xl">
              <button onClick={() => { setEditCustomer(null); setEditCustForm({}); }}
                className="flex-1 py-2.5 bg-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-300">
                ยกเลิก
              </button>
              <button onClick={handleSaveCustomer} disabled={editCustSaving}
                className="flex-1 py-2.5 bg-cyan-500 text-white rounded-xl text-sm font-semibold hover:bg-cyan-600 disabled:opacity-50 flex items-center justify-center gap-2">
                <Save size={14}/>
                {editCustSaving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: แก้ไขออเดอร์ ── */}
      {editOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[65] p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800">แก้ไขออเดอร์</h3>
                <p className="text-sm text-slate-500 mt-0.5 font-mono">{editOrder.order_no}</p>
              </div>
              <button onClick={() => { setEditOrder(null); setEditOrderItems([]); setEditOrderForm({}); }}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-500"><X size={18}/></button>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-4">
              {/* รายการสินค้า */}
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-2">รายการสินค้า</label>
                <div className="space-y-1.5">
                  {editOrderItems.length === 0 && (
                    <div className="text-center text-xs text-slate-400 py-3 bg-slate-50 rounded-lg">
                      ยังไม่มีรายการสินค้า
                    </div>
                  )}
                  {editOrderItems.map((item, itemIdx) => {
                    const promo = promoOptions.find(p => p.id === item.promoId);
                    return (
                      <div key={itemIdx} className="flex items-center gap-2 bg-cyan-50 border border-cyan-200 rounded-lg px-3 py-2" title={`รหัส: ${item.promoId}`}>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-slate-500 leading-tight truncate">{promo?.master_name || '—'}</div>
                          <div className="text-xs text-slate-800 font-medium leading-tight truncate">{promo?.name || item.promoId}</div>
                        </div>
                        {promo && (
                          <span className="text-[11px] text-emerald-600 font-semibold shrink-0">฿{Number(promo.price_thb).toLocaleString()}</span>
                        )}
                        <input type="number" min="1"
                          value={item.qty}
                          onChange={e => {
                            const qty = Math.max(1, Number(e.target.value)||1);
                            setEditOrderItems(prev => prev.map((it, i) => i === itemIdx ? {...it, qty} : it));
                          }}
                          className="w-14 border rounded px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-cyan-300 shrink-0"/>
                        <button
                          onClick={() => setEditOrderItems(prev => prev.filter((_, i) => i !== itemIdx))}
                          className="text-red-400 hover:text-red-600 shrink-0 w-6 h-6 rounded hover:bg-red-50 flex items-center justify-center"
                          title="ลบรายการ"
                        >✕</button>
                      </div>
                    );
                  })}
                </div>

                {/* combobox เพิ่มรายการ */}
                <div className="flex gap-2 mt-2 relative">
                  <div className="flex-1 relative">
                    <input type="text"
                      value={editOrderSearch}
                      onChange={e => { setEditOrderSearch(e.target.value); setEditOrderDropdownOpen(true); }}
                      onFocus={() => setEditOrderDropdownOpen(true)}
                      placeholder="+ เพิ่มสินค้า (พิมพ์ค้นหา: ชื่อ / โปร)"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
                    {editOrderDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setEditOrderDropdownOpen(false)}/>
                        <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-lg shadow-xl max-h-56 overflow-y-auto z-20">
                          {(() => {
                            const q = editOrderSearch.toLowerCase().trim();
                            const selectedIds = new Set(editOrderItems.map(it => it.promoId));
                            const results = promoOptions.filter(p => {
                              if (selectedIds.has(p.id)) return false;
                              if (!q) return true;
                              return (
                                p.id.toLowerCase().includes(q) ||
                                p.name.toLowerCase().includes(q) ||
                                (p.short_name || '').toLowerCase().includes(q) ||
                                (p.master_name || '').toLowerCase().includes(q)
                              );
                            }).slice(0, 30);
                            if (results.length === 0) {
                              return <div className="px-3 py-4 text-center text-xs text-slate-400">{q ? `ไม่พบ "${q}"` : 'ไม่มีสินค้าที่เหลือให้เพิ่ม'}</div>;
                            }
                            return results.map(p => (
                              <div key={p.id}
                                onMouseDown={e => {
                                  e.preventDefault();
                                  setEditOrderItems(prev => [...prev, {promoId: p.id, qty: editOrderAddQty}]);
                                  setEditOrderSearch('');
                                  setEditOrderAddQty(1);
                                  setEditOrderDropdownOpen(false);
                                }}
                                className="px-3 py-2 border-b last:border-0 hover:bg-cyan-50 cursor-pointer flex items-center gap-2"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="text-[10px] text-slate-400 truncate">{p.master_name}</div>
                                  <div className="text-xs text-slate-700 font-medium truncate">{p.name}</div>
                                </div>
                                <span className="shrink-0 text-xs font-bold text-emerald-600">฿{Number(p.price_thb).toLocaleString()}</span>
                              </div>
                            ));
                          })()}
                        </div>
                      </>
                    )}
                  </div>
                  <input type="number" min="1"
                    value={editOrderAddQty}
                    onChange={e => setEditOrderAddQty(Math.max(1, Number(e.target.value)||1))}
                    placeholder="จำนวน"
                    className="w-16 border rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
                </div>
              </div>

              {/* ข้อมูลอื่นๆ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ยอดรวม (฿) *</label>
                  <input type="number" value={editOrderForm.total_thb || '0'}
                    onChange={e => setEditOrderForm((p: any) => ({...p, total_thb: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 font-bold text-emerald-600"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Tracking No.</label>
                  <input value={editOrderForm.tracking_no || ''}
                    onChange={e => setEditOrderForm((p: any) => ({...p, tracking_no: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 font-mono"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ขนส่ง</label>
                  <input value={editOrderForm.courier || ''}
                    onChange={e => setEditOrderForm((p: any) => ({...p, courier: e.target.value}))}
                    placeholder="FLASH / ไปรษณีย์..."
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ช่องทาง</label>
                  <input value={editOrderForm.channel || ''}
                    onChange={e => setEditOrderForm((p: any) => ({...p, channel: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">วิธีชำระ</label>
                  <select value={editOrderForm.payment_method || ''}
                    onChange={e => setEditOrderForm((p: any) => ({...p, payment_method: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 bg-white">
                    <option value="">— เลือก —</option>
                    <option>COD</option>
                    <option>โอน</option>
                    <option>เงินสด</option>
                    <option>บัตรเครดิต</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">สถานะชำระ</label>
                  <select value={editOrderForm.payment_status || 'รอชำระเงิน'}
                    onChange={e => setEditOrderForm((p: any) => ({...p, payment_status: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 bg-white">
                    <option>รอชำระเงิน</option>
                    <option>ชำระแล้ว</option>
                    <option>ยกเลิก</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-500 block mb-1">สถานะออเดอร์</label>
                  <select value={editOrderForm.order_status || 'รอแพ็ค'}
                    onChange={e => setEditOrderForm((p: any) => ({...p, order_status: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 bg-white">
                    <option>รอคีย์ออเดอร์</option>
                    <option>รอแพ็ค</option>
                    <option>แพ็คสินค้า</option>
                    <option>รอจัดส่ง</option>
                    <option>อยู่ระหว่างจัดส่ง</option>
                    <option>ส่งสินค้าแล้ว</option>
                    <option>ส่งสำเร็จ</option>
                    <option>ตีกลับ</option>
                    <option>ยกเลิก</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-500 block mb-1">หมายเหตุ</label>
                  <textarea value={editOrderForm.note || ''}
                    onChange={e => setEditOrderForm((p: any) => ({...p, note: e.target.value}))}
                    rows={2}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 resize-none"/>
                </div>
              </div>

              {/* แจ้งเตือนราคาไม่ตรง */}
              {(() => {
                const sum = editOrderItems.reduce((s, it) => {
                  const p = promoOptions.find(x => x.id === it.promoId);
                  return s + (p ? Number(p.price_thb) * (it.qty || 1) : 0);
                }, 0);
                const total = Number(editOrderForm.total_thb) || 0;
                if (editOrderItems.length === 0 || Math.abs(sum - total) < 0.01) return null;
                return (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-700">
                    ⚠ ราคาสินค้ารวม ฿{sum.toLocaleString()} {sum > total ? 'มากกว่า' : 'น้อยกว่า'}ยอดรวม ฿{total.toLocaleString()} อยู่ ฿{Math.abs(sum - total).toLocaleString()}
                  </div>
                );
              })()}
            </div>

            <div className="p-4 border-t bg-slate-50 flex gap-2 rounded-b-2xl">
              <button onClick={() => { setEditOrder(null); setEditOrderItems([]); setEditOrderForm({}); }}
                className="flex-1 py-2.5 bg-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-300">
                ยกเลิก
              </button>
              <button onClick={handleSaveOrder} disabled={editOrderSaving}
                className="flex-1 py-2.5 bg-cyan-500 text-white rounded-xl text-sm font-semibold hover:bg-cyan-600 disabled:opacity-50 flex items-center justify-center gap-2">
                <Save size={14}/>
                {editOrderSaving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portal dropdown ของ combobox สินค้าในแต่ละแถว — render ที่ body เพื่อกันถูก clip */}
      {flashOpenPromo !== null && promoDropdownPos && createPortal(
        <>
          {/* backdrop click-outside */}
          <div
            className="fixed inset-0 z-[80]"
            onClick={() => { setFlashOpenPromo(null); setPromoDropdownPos(null); }}
          />
          <div
            className="fixed bg-white border border-slate-200 rounded-lg shadow-2xl max-h-52 overflow-y-auto z-[90]"
            style={{
              top: promoDropdownPos.openUp ? undefined : promoDropdownPos.top + 4,
              bottom: promoDropdownPos.openUp ? window.innerHeight - promoDropdownPos.top + 4 : undefined,
              left: promoDropdownPos.left,
              width: Math.max(promoDropdownPos.width, 280), // อย่างน้อย 280px ให้อ่านง่าย
            }}
          >
            {(() => {
              const currIdx = flashOpenPromo;
              if (currIdx === null) return null;
              const q = (flashPromoSearch[currIdx] || '').toLowerCase().trim();
              const selectedIds = new Set((flashPromoSel[currIdx]||[]).map(it => it.promoId));
              const results = promoOptions.filter(p => {
                if (selectedIds.has(p.id)) return false;
                if (!q) return true;
                return (
                  p.id.toLowerCase().includes(q) ||
                  p.name.toLowerCase().includes(q) ||
                  (p.short_name || '').toLowerCase().includes(q) ||
                  (p.master_name || '').toLowerCase().includes(q)
                );
              }).slice(0, 30);

              if (results.length === 0) {
                return (
                  <div className="px-3 py-4 text-center text-[11px] text-slate-400">
                    {q ? `ไม่พบ "${q}"` : 'ไม่มีสินค้าที่เหลือให้เพิ่ม'}
                  </div>
                );
              }

              return results.map(p => (
                <div
                  key={p.id}
                  onMouseDown={(e) => {
                    // ใช้ onMouseDown แทน onClick เพื่อให้ทำงานก่อน blur input
                    e.preventDefault();
                    const addQty = flashAddQty[currIdx] ?? 1;
                    setFlashPromoSel(prev => ({
                      ...prev,
                      [currIdx]: [...(prev[currIdx]||[]), {promoId: p.id, qty: addQty}]
                    }));
                    setFlashPromoSearch(prev => ({...prev, [currIdx]: ''}));
                    setFlashAddQty(prev => ({...prev, [currIdx]: 1}));
                    setFlashOpenPromo(null);
                    setPromoDropdownPos(null);
                  }}
                  className="px-3 py-2 border-b last:border-0 hover:bg-yellow-50 cursor-pointer flex items-center gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-slate-400 truncate">{p.master_name}</div>
                    <div className="text-xs text-slate-700 font-medium truncate">{p.name}</div>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-emerald-600">฿{Number(p.price_thb).toLocaleString()}</span>
                </div>
              ));
            })()}
          </div>
        </>,
        document.body
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl text-white text-sm font-medium
          ${toast.type === 'success' ? 'bg-emerald-500' : toast.type === 'warning' ? 'bg-orange-500' : 'bg-red-500'}`}
          style={{minWidth:'260px'}}>
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-auto opacity-70 hover:opacity-100 text-lg leading-none">×</button>
        </div>
      )}
    </div>
  );
}
