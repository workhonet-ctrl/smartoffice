import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TOURIST_ZIPS } from '../lib/types';
import { Search, Users, TrendingUp, ShoppingBag, ChevronDown, ChevronRight, X, Upload, Trash2 } from 'lucide-react';
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

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0 });
const fmt2 = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Customers({ onGoToProducts }: { onGoToProducts?: () => void } = {}) {
  const [customers, setCustomers]   = useState<Customer[]>([]);
  const [search, setSearch]         = useState('');
  const [tagFilter, setTagFilter]   = useState('ทั้งหมด');
  const [sortBy, setSortBy]         = useState<'total_spent' | 'order_count' | 'updated_at'>('total_spent');
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [custOrders, setCustOrders] = useState<Order[]>([]);
  const [shipCostMap, setShipCostMap] = useState<Record<string, number>>({});
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [editTag, setEditTag]       = useState<{id: string; tag: string} | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [importing, setImporting]   = useState(false);
  // Flash Import
  const [showFlashImport, setShowFlashImport] = useState(false);
  const [flashRows, setFlashRows]             = useState<any[]>([]);
  const [flashPromoSel, setFlashPromoSel]     = useState<Record<number, string>>({}); // index → promo_id
  const [flashTotalSel, setFlashTotalSel]     = useState<Record<number, string>>({}); // index → total override
  const [flashDups, setFlashDups]             = useState<{row: any; existing: any}[]>([]);
  const [flashSaving, setFlashSaving]         = useState(false);
  const [flashSearch, setFlashSearch]         = useState('');
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

  useEffect(() => { loadCustomers(); loadShipCosts(); }, []);

  const loadShipCosts = async () => {
    const [{ data: flash }, { data: myorder }] = await Promise.all([
      supabase.from('shipping_flash').select('tracking, total_thb'),
      supabase.from('shipping_myorder').select('tracking, total_thb'),
    ]);
    const map: Record<string, number> = {};
    [...(flash || []), ...(myorder || [])].forEach((r: any) => {
      if (r.tracking) map[r.tracking] = Number(r.total_thb || 0);
    });
    setShipCostMap(map);
  };

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
    setFlashSearch('');
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

        const promoId = flashPromoSel[idx];
        const totalThb = flashTotalSel[idx] ? Number(flashTotalSel[idx]) : (Number(r[17])||0);
        const dp = String(r[13]||'').split(' ');
        const province = dp[dp.length-1] || '';

        // ลบ dup ที่เลือกลบ (ไม่ทำอะไร = ข้าม)
        const isDup = flashDups.find(d => String(d.row[1]).trim() === tracking);
        if (isDup) continue; // ข้าม duplicate (ให้ user จัดการเอง)

        const { error } = await supabase.from('orders').insert([{
          order_no:    `FL-${tracking}`,
          customer_id: customerId,
          channel:     'FLASH',
          order_date:  new Date().toISOString().split('T')[0],
          tracking_no: tracking,
          courier:     'FLASH',
          route:       'B',
          promo_ids:   promoId ? [promoId] : [],
          raw_prod:    promoId ? (promoOptions.find(p => p.id === promoId)?.name || '') : '',
          quantity:    1,
          quantities:  '1',
          total_thb:   totalThb,
          payment_method: 'COD',
          payment_status: 'รอชำระเงิน',
          order_status: 'รอแพ็ค',
        }]);
        if (!error) added++;
      }

      showToast(`✓ นำเข้าสำเร็จ · ออเดอร์ใหม่ ${added} รายการ`);
      setShowFlashImport(false);
      loadCustomers();
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally { setFlashSaving(false); }
  };

  const loadCustomers = async () => {
    setLoading(true);
    const { data } = await supabase.from('customers').select('*').order(sortBy, { ascending: false });
    if (data) setCustomers(data);
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
    const hasOrders = filtered.filter(c => selectedIds.has(c.id) && c.order_count > 0);
    const msg = hasOrders.length > 0
      ? `ลบลูกค้า ${selectedIds.size} คน\n⚠ ${hasOrders.length} คน มีออเดอร์ — ออเดอร์จะถูกลบด้วย\nยืนยัน?`
      : `ลบลูกค้า ${selectedIds.size} คน ยืนยัน?`;
    if (!confirm(msg)) return;
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    // ลบออเดอร์ก่อน
    await supabase.from('orders').delete().in('customer_id', ids);
    // ลบลูกค้า
    await supabase.from('customers').delete().in('id', ids);
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

  const filtered = customers.filter(c => {
    const matchTag = tagFilter === 'ทั้งหมด' || c.tag === tagFilter;
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase())
      || (c.facebook_name || '').toLowerCase().includes(search.toLowerCase())
      || c.tel.includes(search)
      || (c.province || '').includes(search);
    return matchTag && matchSearch;
  });

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
              <h2 className="text-2xl font-bold text-slate-800">ลูกค้า</h2>
            </div>
            <p className="text-xs text-slate-400">{customers.length} คน · นำเข้า Excel ครั้งเดียว → บันทึกลูกค้า + ออเดอร์พร้อมกัน</p>
          </div>
        </div>
        {/* ปุ่ม นำเข้า Excel */}
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
      </div>

      {/* KPI */}
      <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
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
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="shrink-0 flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mb-2">
          <span className="text-sm font-medium text-red-700">
            เลือก {selectedIds.size} คน
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
                  onChange={e => {
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
            {filtered.map(c => (
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
                    <div className="font-medium text-slate-800">{c.name}</div>
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
                    <button onClick={e => handleDelete(c, e)}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                      title="ลบลูกค้า">
                      🗑
                    </button>
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
              <button onClick={() => setShowFlashImport(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-500">✕</button>
            </div>
            <div className="px-5 pt-3 pb-2">
              <input value={flashSearch} onChange={e => setFlashSearch(e.target.value)}
                placeholder="ค้นหา ชื่อ / เบอร์ / tracking..."
                className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"/>
            </div>
            {flashDups.length > 0 && (
              <div className="mx-5 mb-2 p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700">
                <div className="font-bold mb-1">Tracking ซ้ำ — จะถูกข้ามไป:</div>
                {flashDups.map((d: any, i: number) => (
                  <div key={i} className="ml-2">· {d.row[1]} (ลูกค้า: {d.existing?.customers?.name})</div>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-auto px-5">
              <table className="w-full text-sm" style={{minWidth:'900px'}}>
                <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0">
                  <tr>
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
                    .filter((r: any) => !flashSearch ||
                      String(r[10]||'').includes(flashSearch) ||
                      String(r[11]||'').includes(flashSearch) ||
                      String(r[1]||'').includes(flashSearch))
                    .map((r: any, idx: number) => {
                      const isDup = flashDups.some((d: any) => String(d.row[1]).trim() === String(r[1]).trim());
                      const dp = String(r[13]||'').split(' ');
                      const province = dp[dp.length-1] || '-';
                      return (
                        <tr key={idx} className={`border-b text-xs ${isDup ? 'bg-orange-50 opacity-60' : 'hover:bg-slate-50'}`}>
                          <td className="p-2 text-slate-400">{idx+1}{isDup && ' ⚠'}</td>
                          <td className="p-2 font-mono text-blue-600 text-[11px]">{String(r[1]||'')}</td>
                          <td className="p-2 font-medium">{String(r[10]||'')}</td>
                          <td className="p-2 text-slate-500">{String(r[11]||'')}</td>
                          <td className="p-2 text-slate-500">{province}</td>
                          <td className="p-2 text-right font-medium text-emerald-600">฿{Number(r[17]||0).toLocaleString()}</td>
                          <td className="p-2">
                            {isDup ? <span className="text-orange-400 text-[11px]">ข้าม (ซ้ำ)</span> : (
                              <select value={flashPromoSel[idx]||''}
                                onChange={e => setFlashPromoSel((prev: any) => ({...prev, [idx]: e.target.value}))}
                                className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-yellow-300 bg-white">
                                <option value="">— เลือกสินค้า —</option>
                                {promoOptions.map((p: any) => (
                                  <option key={p.id} value={p.id}>{p.id} · {p.master_name} · {p.name} ฿{Number(p.price_thb).toLocaleString()}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="p-2">
                            {isDup ? '-' : (
                              <input type="number"
                                value={flashTotalSel[idx] !== undefined ? flashTotalSel[idx] : String(Number(r[17])||0)}
                                onChange={e => setFlashTotalSel((prev: any) => ({...prev, [idx]: e.target.value}))}
                                className="border rounded px-2 py-1 text-xs w-24 text-right focus:outline-none focus:ring-1 focus:ring-yellow-300"/>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t flex items-center justify-between gap-3 bg-slate-50 rounded-b-2xl">
              <p className="text-xs text-slate-400">สินค้าที่ไม่เลือก จะบันทึกออเดอร์ว่างเปล่า (แก้ที่หน้าออเดอร์ได้)</p>
              <div className="flex gap-2">
                <button onClick={() => setShowFlashImport(false)} className="px-4 py-2 bg-slate-200 rounded-xl text-sm hover:bg-slate-300">ยกเลิก</button>
                <button onClick={handleFlashImport} disabled={flashSaving}
                  className="px-6 py-2 bg-yellow-500 text-white rounded-xl text-sm font-semibold hover:bg-yellow-600 disabled:opacity-50">
                  {flashSaving ? 'กำลัง import...' : `Import ${flashRows.length - flashDups.length} รายการ`}
                </button>
              </div>
            </div>
          </div>
        </div>
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
