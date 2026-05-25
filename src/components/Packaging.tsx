import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Package, ClipboardList, FileText, AlertCircle, Printer, History, RefreshCw } from 'lucide-react';

type PackOrder = {
  id: string; order_no: string; order_date: string | null; order_time: string | null;
  raw_prod: string | null; quantities: string | null; quantity: number | null;
  promo_ids: string[] | null;
  courier: string | null;
  route: string | null;
  customers: { name: string; tel: string } | null;
  promos: PromoDetail[];
};
type PromoDetail = { id: string; name: string; short_name: string | null; qty: number; box_name: string; box_id: string; bubble_name: string; bubble_id: string; };
type Override = Record<string, { box_id: string; bubble_id: string; box_search?: string; bubble_search?: string }>;


export default function Packaging({
  orderIds, onCreateRequisition,
}: {
  orderIds: string[];
  onDone: () => void;
  onCreateRequisition?: (historyId: string) => void;
}) {
  const [orders, setOrders]     = useState<PackOrder[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<'prep' | 'summary' | 'history'>('prep');
  const [printHistory, setPrintHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [override, setOverride] = useState<Override>({});
  const [boxes, setBoxes]       = useState<{ id: string; name: string }[]>([]);
  const [bubbles, setBubbles]   = useState<{ id: string; name: string; length_cm: number }[]>([]);
  const [responsible, setResponsible] = useState('');
  const [selectedMulti, setSelectedMulti] = useState<Set<string>>(new Set()); // bulk assign
  const [bulkBoxId,     setBulkBoxId]     = useState('');
  const [bulkBubbleId,  setBulkBubbleId]  = useState('');
  const [boxSearch,     setBoxSearch]     = useState('');
  const [bubbleSearch,  setBubbleSearch]  = useState('');
  const [saving, setSaving]     = useState(false);
  const [packDate]              = useState(new Date().toLocaleDateString('th-TH', { day:'2-digit', month:'2-digit', year:'numeric' }));
  const incompleteRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const scrollToFirstIncomplete = () => {
    const first = multiIncomplete[0];
    if (!first) return;
    const el = incompleteRefs.current[first.id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-orange-400');
      setTimeout(() => el.classList.remove('ring-2', 'ring-orange-400'), 2000);
    }
  };

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // ── 1. โหลด orders ทั้งหมด (loop pagination — ปลดล้อก 1000) ──
      const PAGE = 1000;
      const ordersData: any[] = [];
      let page = 0;
      while (true) {
        const baseQuery = orderIds.length > 0
          ? supabase.from('orders').select('*, customers(name, tel)').in('id', orderIds)
          : supabase.from('orders').select('*, customers(name, tel)').eq('order_status', 'รอแพ็ค');
        const { data, error } = await baseQuery
          .order('created_at', { ascending: true })
          .range(page * PAGE, (page + 1) * PAGE - 1);
        if (error) { console.error('[Packaging load orders]', error); break; }
        if (!data || data.length === 0) break;
        ordersData.push(...data);
        if (data.length < PAGE) break;
        page++;
      }
      if (!ordersData.length) return;

      // ── 2. รวม raw_names ทั้งหมด + promo_ids ──────────────────
      const allRawNames = new Set<string>();
      const allPromoIds = new Set<string>();
      ordersData.forEach((o: any) => {
        (o.raw_prod||'').split('|').map((s:string)=>s.trim()).filter(Boolean)
          .forEach((n:string) => allRawNames.add(n));
        (o.promo_ids||[]).filter(Boolean).forEach((pid:string) => allPromoIds.add(pid));
      });

      // ── 3. batch โหลด product_mappings + promos + boxes + bubbles ──
      const [
        { data: mappingsData },
        { data: promosData },
        { data: boxData },
        { data: bubData },
      ] = await Promise.all([
        allRawNames.size > 0
          ? supabase.from('product_mappings').select('raw_name, promo_id').in('raw_name', [...allRawNames])
          : Promise.resolve({ data: [] }),
        allPromoIds.size > 0
          ? supabase.from('products_promo')
              .select('id, name, short_name, box_id, bubble_id, boxes(name), bubbles(name, length_cm)')
              .in('id', [...allPromoIds])
          : Promise.resolve({ data: [] }),
        supabase.from('boxes').select('id, name').order('id'),
        supabase.from('bubbles').select('id, name, length_cm').order('id'),
      ]);

      // build lookup maps
      const mappingMap: Record<string,string> = {};
      (mappingsData||[]).forEach((m:any) => { mappingMap[m.raw_name] = m.promo_id; });
      const promoMap: Record<string,any> = {};
      (promosData||[]).forEach((p:any) => { promoMap[p.id] = p; });

      // ── 4. ถ้ามี order ที่ยังไม่มี promo_id → ดึง mapping เพิ่ม ──
      const missingNames = new Set<string>();
      ordersData.forEach((o: any) => {
        const raws = (o.raw_prod||'').split('|').map((s:string)=>s.trim()).filter(Boolean);
        raws.forEach((rp:string, i:number) => {
          if (!o.promo_ids?.[i] && !mappingMap[rp]) missingNames.add(rp);
        });
      });
      // โหลด promo สำหรับ mapped ids ที่ยังไม่มีใน promoMap
      const mappedIds = [...missingNames].map(n => mappingMap[n]).filter(Boolean);
      if (mappedIds.length > 0) {
        const { data: extraPromos } = await supabase.from('products_promo')
          .select('id, name, short_name, box_id, bubble_id, boxes(name), bubbles(name, length_cm)')
          .in('id', mappedIds);
        (extraPromos||[]).forEach((p:any) => { promoMap[p.id] = p; });
      }

      // ── 5. batch update orders ที่ promo_ids ขาด ──────────────
      const toUpdate: {id:string; promo_ids:string[]}[] = [];
      ordersData.forEach((o: any) => {
        const raws = (o.raw_prod||'').split('|').map((s:string)=>s.trim()).filter(Boolean);
        const updatedIds = [...(o.promo_ids || raws.map(()=>null))];
        let changed = false;
        raws.forEach((rp:string, i:number) => {
          if (!updatedIds[i] && mappingMap[rp]) {
            updatedIds[i] = mappingMap[rp]; changed = true;
          }
        });
        if (changed) toUpdate.push({ id: o.id, promo_ids: updatedIds });
      });
      // update parallel (ทีละ 10)
      for (let i=0; i<toUpdate.length; i+=10) {
        await Promise.all(toUpdate.slice(i,i+10).map(({id,promo_ids}) =>
          supabase.from('orders').update({ promo_ids }).eq('id',id)
        ));
      }

      // ── 6. สร้าง enriched orders ──────────────────────────────
      const enriched: PackOrder[] = ordersData.map((o: any) => {
        const rawProds = (o.raw_prod||'').split('|').map((s:string)=>s.trim()).filter(Boolean);
        const qtys = String(o.quantities||o.quantity||'1').split('|');
        const promos: PromoDetail[] = rawProds.map((rp:string, i:number) => {
          const pid = o.promo_ids?.[i] || mappingMap[rp];
          const promoData = pid ? promoMap[pid] : null;
          const qty = Number(qtys[i]?.trim()) || 1; // จำนวนชุดของโปรนี้ในออเดอร์ เช่น โปร 2 กระป๋อง x2
          return {
            id: pid||`raw-${i}`, name: promoData?.name||rp,
            short_name: promoData?.short_name||null, qty,
            box_id: promoData?.box_id||'', box_name: promoData?.boxes?.name||'-',
            bubble_id: promoData?.bubble_id||'',
            bubble_name: promoData?.bubbles ? `ยาว ${Number(promoData.bubbles.length_cm)} cm` : '-',
          };
        });
        return { ...o, promos };
      });

      setOrders(enriched);
      if (boxData) setBoxes(boxData);
      if (bubData) setBubbles(bubData);
    } finally { setLoading(false); }
  };

  const isMulti  = (o: PackOrder) => o.promos.length > 1 || o.promos.some(p => promoRepeat(p) > 1);
  const isFlash  = (o: PackOrder) => o.courier === 'FLASH' || o.route === 'B';
  const chanBadge = (o: PackOrder) => (o.courier === 'FLASH' || o.route === 'B')
    ? <span className="ml-1 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[9px] font-bold">FLASH</span>
    : <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[9px] font-bold">MyOrder</span>;

  const promoRepeat = (p: { qty?: number | null }) => Math.max(1, Number(p?.qty) || 1);
  const orderPackCount = (o: PackOrder) => o.promos.reduce((sum, p) => sum + promoRepeat(p), 0);
  const promoRepeatText = (p: { qty?: number | null }) => {
    const q = promoRepeat(p);
    return q > 1 ? ` x${q}` : '';
  };


  const escHtml = (value: any) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const getSnapshotProductName = (s: any) =>
    s?.product_name || s?.short_name || s?.master_name || s?.product || '';

  const getSnapshotPromoName = (s: any) => {
    const productName = getSnapshotProductName(s);
    if (s?.promo_name) return s.promo_name;
    if (s?.name && s.name !== productName) return s.name;
    return '';
  };

  const renderSnapshotProductPromoHtml = (s: any) => {
    if (Array.isArray(s?.promos) && s.promos.length > 0) {
      return s.promos.map((p: any, pi: number) => {
        const productName = p.product_name || p.short_name || p.master_name || p.product || p.name || '';
        const promoName = p.promo_name || p.name || '';
        const qty = Number(p.qty) || 1;
        const qtyText = qty > 1 ? ` x${qty}` : '';
        const promoLine = promoName && promoName !== productName
          ? `<div style="font-size:11px;color:#64748b;margin-top:1px">${escHtml(promoName)}${qtyText}</div>`
          : (qty > 1 ? `<div style="font-size:11px;color:#64748b;margin-top:1px">${qtyText.trim()}</div>` : '');
        return `<div style="margin-bottom:${pi === s.promos.length - 1 ? '0' : '4px'}">
          ${s.promos.length > 1 ? `<span style="background:#e0f2fe;color:#0369a1;border-radius:3px;padding:0 4px;font-size:10px;margin-right:3px">${pi + 1}</span>` : ''}
          <span style="font-weight:700">${escHtml(productName || promoName || '-')}</span>
          ${promoLine}
        </div>`;
      }).join('');
    }

    const productName = getSnapshotProductName(s);
    const promoName = getSnapshotPromoName(s);
    const mainText = productName || promoName || s?.name || '-';
    const promoLine = promoName && promoName !== mainText
      ? `<div style="font-size:11px;color:#64748b;margin-top:1px">${escHtml(promoName)}</div>`
      : '';
    return `<div style="font-weight:700">${escHtml(mainText)}</div>${promoLine}`;
  };

  // validate กล่อง/บั้บเบิ้ล — multi-product orders ต้องเลือกครบ
  const multiOrders        = orders.filter(isMulti);
  const multiIncomplete    = multiOrders.filter(o => !override[o.id]?.box_id);
  const canGoToSummary     = multiIncomplete.length === 0;

  // validate ผู้รับผิดชอบ
  const canCreateRequisition = responsible.trim().length > 0;

  // ── summary groups (แยก Flash / MyOrder) ──
  const summaryGroups = (() => {
    const singleOrders = orders.filter(o => !isMulti(o));
    const makeGrouped = (subset: PackOrder[]) => {
      const grouped: Record<string, { promoId: string; short_name: string; promo_name: string; box_name: string; bubble_name: string; count: number }> = {};
      for (const o of subset) {
        const p = o.promos[0]; if (!p) continue;
        const repeat = promoRepeat(p);
        if (grouped[p.id]) grouped[p.id].count += repeat;
        else grouped[p.id] = { promoId: p.id, short_name: p.short_name||'', promo_name: p.name, box_name: p.box_name, bubble_name: p.bubble_name, count: repeat };
      }
      return Object.values(grouped);
    };
    const flashSingles  = singleOrders.filter(o => isFlash(o));
    const myordSingles  = singleOrders.filter(o => !isFlash(o));
    const flashMultis   = multiOrders.filter(o => isFlash(o));
    const myordMultis   = multiOrders.filter(o => !isFlash(o));
    return {
      grouped: makeGrouped(singleOrders),          // รวม (ใช้เดิมสำหรับ requisition/print)
      flashGrouped: makeGrouped(flashSingles),     // FLASH เดี่ยว
      myordGrouped: makeGrouped(myordSingles),     // MyOrder เดี่ยว
      flashMultis, myordMultis,
      multiOrders,
    };
  })();


  const buildRichSummarySnapshot = () => [
    ...summaryGroups.grouped.map(g => ({
      promo_id: g.promoId,
      name: g.promo_name || g.short_name,
      short_name: g.short_name || g.promo_name,
      product_name: g.short_name || g.promo_name,
      promo_name: g.promo_name || '',
      count: g.count,
      box: g.box_name,
      bubble: g.bubble_name && !g.bubble_name.includes('0 cm') ? g.bubble_name : '-',
      type: 'single',
    })),
    ...summaryGroups.multiOrders.map(o => ({
      name: o.promos.map(p => {
        const productName = p.short_name || p.name;
        const promoName = p.name && p.name !== productName ? ` ${p.name}` : '';
        const qtyText = p.qty > 1 ? ` x${p.qty}` : '';
        return `${productName}${promoName}${qtyText}`;
      }).join(', '),
      short_name: o.promos.map(p => p.short_name || p.name).join(' + '),
      product_name: o.promos.map(p => p.short_name || p.name).join(' + '),
      promo_name: 'แพ็คพิเศษ',
      promos: o.promos.map(p => ({
        id: p.id,
        short_name: p.short_name || p.name,
        product_name: p.short_name || p.name,
        promo_name: p.name || '',
        name: p.name || '',
        qty: p.qty || 1,
      })),
      count: orderPackCount(o),
      box: boxes.find(b => b.id === override[o.id]?.box_id)?.name || '',
      bubble: (() => {
        const b = override[o.id]?.bubble_id ? bubbles.find(b => b.id === override[o.id].bubble_id) : null;
        return b ? `ยาว ${b.length_cm} cm` : '-';
      })(),
      type: 'multi',
    })),
  ];

  const buildRichOrdersSnapshot = () => orders.map(o => ({
    order_no: o.order_no,
    customer: o.customers?.name,
    promos: o.promos.map(p => {
      const productName = p.short_name || p.name;
      const promoName = p.name && p.name !== productName ? ` ${p.name}` : '';
      const qtyText = p.qty > 1 ? ` x${p.qty}` : '';
      return `${productName}${promoName}${qtyText}`;
    }).join(', '),
    promo_details: o.promos.map(p => ({
      id: p.id,
      short_name: p.short_name || p.name,
      product_name: p.short_name || p.name,
      promo_name: p.name || '',
      qty: p.qty || 1,
    })),
  }));

  const historyOrderKey = (ordersSnapshot: any[] | null | undefined) =>
    (ordersSnapshot || [])
      .map((o: any) => String(o?.order_no || '').trim())
      .filter(Boolean)
      .sort()
      .join('|');

  const currentHistoryOrderKey = () =>
    orders.map(o => String(o.order_no || '').trim()).filter(Boolean).sort().join('|');

  const historySnapshotScore = (item: any) => {
    const snap = (item?.summary_snapshot || []) as any[];
    const richScore = snap.reduce((score: number, s: any) => {
      const hasPromoDetails = Array.isArray(s?.promos) && s.promos.length > 0;
      return score
        + (s?.promo_name ? 3 : 0)
        + (s?.product_name ? 3 : 0)
        + (s?.promo_id ? 2 : 0)
        + (hasPromoDetails ? 6 : 0);
    }, 0);
    const statusScore = item?.status === 'approved' ? 2 : item?.status === 'printed' ? 1 : 0;
    return richScore + statusScore;
  };

  const dedupePrintHistory = (rows: any[]) => {
    const best = new Map<string, any>();
    rows.forEach(item => {
      const orderKey = historyOrderKey(item.orders_snapshot);
      const fallbackKey = [
        item.pack_date || '',
        item.responsible_person || '',
        item.order_count || '',
        new Date(item.created_at).toISOString().slice(0, 16),
      ].join('|');
      const key = orderKey
        ? `${item.pack_date || ''}|${item.responsible_person || ''}|${item.order_count || ''}|${orderKey}`
        : fallbackKey;
      const current = best.get(key);
      if (!current || historySnapshotScore(item) > historySnapshotScore(current)) {
        best.set(key, item);
      }
    });
    return Array.from(best.values()).sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  };

  const savePackHistory = async (status: 'printed' | 'pending', responsibleName: string) => {
    const packDateDb = new Date().toISOString().split('T')[0];
    const ordersSnapshot = buildRichOrdersSnapshot();
    const summarySnapshot = buildRichSummarySnapshot();
    const orderKey = historyOrderKey(ordersSnapshot);

    const payload = {
      pack_date: packDateDb,
      responsible_person: responsibleName || 'ไม่ระบุ',
      order_count: orders.length,
      orders_snapshot: ordersSnapshot,
      summary_snapshot: summarySnapshot,
      status,
    };

    const { data: candidates } = await supabase
      .from('pack_history')
      .select('id, status, orders_snapshot, created_at')
      .eq('pack_date', packDateDb)
      .eq('responsible_person', payload.responsible_person)
      .eq('order_count', orders.length)
      .in('status', ['printed', 'pending', 'approved'])
      .order('created_at', { ascending: false })
      .limit(20);

    const existing = (candidates || []).find((h: any) => historyOrderKey(h.orders_snapshot) === orderKey);

    if (existing?.id) {
      const nextStatus = existing.status === 'approved' ? 'approved' : status;
      const { data, error } = await supabase
        .from('pack_history')
        .update({ ...payload, status: nextStatus })
        .eq('id', existing.id)
        .select('id')
        .single();
      return { data, error };
    }

    const { data, error } = await supabase
      .from('pack_history')
      .insert([payload])
      .select('id')
      .single();
    return { data, error };
  };


  const loadPrintHistory = async () => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from('pack_history')
      .select('id, pack_date, responsible_person, order_count, status, created_at, summary_snapshot, orders_snapshot')
      .in('status', ['printed', 'approved'])
      .order('created_at', { ascending: false })
      .limit(80);
    setPrintHistory(dedupePrintHistory(data || []));
    setLoadingHistory(false);
  };

  const handleReprintFromHistory = (item: any) => {
    const snap = (item.summary_snapshot || []) as any[];
    const packDate = item.pack_date
      ? new Date(item.pack_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    const resp = item.responsible_person || '-';
    const orderCount = item.order_count || 0;

    // สร้าง HTML แบบเดียวกับ handlePrint (สรุปตามโปรโมชัน + แยก Flash/MyOrder ถ้ามี route)
    // summary_snapshot ไม่มี route → แสดงเป็น section เดียว
    let idx = 1;
    const tableRows = snap.map((s: any) => {
      const isMultiRow = s.type === 'multi';
      const nameHtml = `${renderSnapshotProductPromoHtml(s)}
        ${isMultiRow ? '<div style="margin-top:3px"><span style="background:#fef3c7;color:#92400e;font-size:10px;border-radius:3px;padding:1px 5px">⭐ แพ็คพิเศษ</span></div>' : ''}`;
      return `<tr${isMultiRow ? ' style="background:#fffbeb"' : ''}>
        <td class="num">${idx++}</td>
        <td>${nameHtml}</td>
        <td style="text-align:center"><span class="badge">${s.count} ชุด</span></td>
        <td style="text-align:center">${escHtml(s.box || '-')}</td>
        <td style="text-align:center;color:#0369a1">${(s.bubble && s.bubble !== '-') ? escHtml(s.bubble) : '-'}</td>
        <td><div class="note-box"></div></td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8"/>
  <title>ใบเตรียมสินค้า</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Sarabun',sans-serif;font-size:13px;color:#1e293b;padding:20px}
    h1{font-size:20px;font-weight:700;margin-bottom:3px}
    .meta{font-size:11px;color:#64748b;margin-bottom:14px}
    table{width:100%;border-collapse:collapse;margin-bottom:20px}
    th{background:#1e293b;color:white;padding:8px 10px;text-align:left;font-size:11px}
    td{padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;vertical-align:top}
    .num{text-align:center;color:#64748b;font-weight:700;width:28px}
    .badge{display:inline-block;background:#cffafe;color:#164e63;border-radius:99px;padding:1px 8px;font-weight:700;font-size:12px}
    .note-box{border:1px solid #cbd5e1;border-radius:4px;min-height:28px}
    .footer{margin-top:24px;display:flex;gap:60px}
    .sig{border-top:1px solid #94a3b8;width:180px;text-align:center;padding-top:5px;font-size:10px;color:#64748b;margin-top:36px}
    @media print{body{padding:10px}}
  </style>
</head><body>
  <h1>📋 ใบเตรียมสินค้า</h1>
  <div class="meta">วันที่: ${packDate} &nbsp;|&nbsp; จำนวนออเดอร์: ${orderCount} รายการ &nbsp;|&nbsp; ผู้รับผิดชอบ: ${resp}</div>
  <table>
    <thead><tr>
      <th style="width:28px">#</th>
      <th>รายการสินค้า / โปรโมชั่น</th>
      <th style="text-align:center;width:100px">จำนวน (ชุด)</th>
      <th style="text-align:center;width:120px">กล่อง</th>
      <th style="text-align:center;width:90px">บับเบิ้ล</th>
      <th style="width:120px">หมายเหตุ</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="footer">
    <div class="sig">ผู้เตรียม: ${resp}</div>
    <div class="sig">ผู้ตรวจสอบ: ___________________</div>
  </div>
  <script>window.onload=()=>{window.print()}</script>
</body></html>`;

    const w = window.open('', '_blank', 'width=1000,height=700');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const openPrintWindow = (rows: any[], today: string, resp: string, orderCount: number) => {
    // rows ใหม่ = per-order rows (ชื่อลูกค้า, เบอร์, สินค้า, กล่อง, บั้บเบิ้ล)
    const tableRows = rows.map((r: any, i: number) => {
      const promoHtml = Array.isArray(r.promos)
        ? r.promos.map((p: any, pi: number) => `
            <div style="margin-bottom:2px">
              ${r.promos.length > 1 ? '<span style="background:#e0f2fe;color:#0369a1;border-radius:3px;padding:0 4px;font-size:10px;margin-right:3px">' + (pi+1) + '</span>' : ''}
              <span style="font-weight:600;color:#1e293b">${p.short_name || p.name}</span>
              <span style="color:#64748b;font-size:11px"> / ${p.name}${Number(p.qty) > 1 ? ` x${Number(p.qty)}` : ``}</span>
            </div>`).join('')
        : `<span style="color:#1e293b">${r.product}</span>`;
      const channelBadge = r.isFlash
        ? '<span style="background:#fef9c3;color:#854d0e;border-radius:3px;padding:0 5px;font-size:10px;font-weight:700;margin-left:4px">FLASH</span>'
        : '<span style="background:#dbeafe;color:#1d4ed8;border-radius:3px;padding:0 5px;font-size:10px;font-weight:700;margin-left:4px">MyOrder</span>';
      return `
      <tr class="${r.isMulti ? 'multi-row' : ''}">
        <td class="num">${i + 1}</td>
        <td>
          <div style="font-weight:600;font-size:13px">${r.customerName || '-'}${channelBadge}</div>
          <div style="color:#64748b;font-size:11px">${r.tel || ''}</div>
        </td>
        <td>${promoHtml}</td>
        <td style="text-align:center;font-size:12px;color:#64748b">${r.box || '-'}</td>
        <td style="text-align:center;font-size:12px;color:#0369a1">${r.bubble && r.bubble !== '-' ? r.bubble : '-'}</td>
        <td><div class="note-box"></div></td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>ใบเตรียมสินค้า</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Sarabun', sans-serif; font-size: 13px; color: #1e293b; padding: 20px; }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 3px; }
    .meta { font-size: 11px; color: #64748b; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #1e293b; color: white; padding: 8px 10px; text-align: left; font-size: 11px; }
    td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    tr.multi-row td { background: #fffbeb; }
    .num { text-align: center; color: #64748b; font-weight: 700; width: 28px; }
    .note-box { border: 1px solid #cbd5e1; border-radius: 4px; min-height: 28px; width: 100%; }
    .footer { margin-top: 28px; display: flex; gap: 60px; }
    .sig { border-top: 1px solid #94a3b8; width: 180px; text-align: center; padding-top: 6px; font-size: 10px; color: #64748b; margin-top: 40px; }
    @media print { body { padding: 10px; } }
  </style>
</head>
<body>
  <h1>📋 ใบเตรียมสินค้า</h1>
  <div class="meta">วันที่: ${today} &nbsp;|&nbsp; จำนวนออเดอร์: ${orderCount} รายการ &nbsp;|&nbsp; ผู้รับผิดชอบ: ${resp}</div>
  <table>
    <thead>
      <tr>
        <th style="width:28px">#</th>
        <th style="width:180px">ลูกค้า / เบอร์</th>
        <th>สินค้า / โปรโมชั่น</th>
        <th style="width:110px;text-align:center">กล่อง</th>
        <th style="width:90px;text-align:center">บับเบิ้ล</th>
        <th style="width:120px">หมายเหตุ</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="footer">
    <div class="sig">ผู้เตรียม: ${resp}</div>
    <div class="sig">ผู้ตรวจสอบ: ___________________</div>
  </div>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=1000,height=700');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const handlePrint = async () => {
    const today = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    // ── บันทึก/อัปเดตประวัติการปริ้นลง pack_history ──
    // ถ้าปริ้นชุดออเดอร์เดิมซ้ำในวันเดียวกัน จะอัปเดตรายการเดิมแทนการสร้างแถวซ้ำ
    const { error: phError } = await savePackHistory('printed', responsible || 'ไม่ระบุ');
    if (phError) {
      console.error('[pack_history save error]', phError);
      alert('บันทึกประวัติปริ้นไม่สำเร็จ: ' + phError.message);
    }

    // ── สร้าง HTML แบบใบสรุป (เหมือนแท็บใบสรุปบนหน้าจอ) ────────────────

    const makeGroupedRows2 = (subset: PackOrder[]) => {
      const grouped: Record<string, { short_name: string; promo_name: string; box: string; bubble: string; count: number }> = {};
      for (const o of subset.filter(o2 => !isMulti(o2))) {
        const p = o.promos[0]; if (!p) continue;
        const bub = p.bubble_name && !p.bubble_name.includes('0 cm') ? p.bubble_name : '-';
        const repeat = promoRepeat(p);
        if (grouped[p.id]) grouped[p.id].count += repeat;
        else grouped[p.id] = { short_name: p.short_name||'', promo_name: p.name, box: p.box_name||'-', bubble: bub, count: repeat };
      }
      return Object.values(grouped);
    };

    const flashOrd  = orders.filter(o => o.courier === 'FLASH' || (o as any).route === 'B');
    const myordOrd  = orders.filter(o => o.courier !== 'FLASH' && (o as any).route !== 'B');
    const fSingle   = makeGroupedRows2(flashOrd);
    const mSingle   = makeGroupedRows2(myordOrd);
    const fMultis   = flashOrd.filter(isMulti);
    const mMultis   = myordOrd.filter(isMulti);

    const buildRows = (grouped: typeof fSingle, multis: typeof fMultis, startIdx: number) => {
      let html2 = ''; let idx = startIdx;
      for (const g of grouped) {
        html2 += `<tr>
          <td class="num">${idx++}</td>
          <td><div style="font-weight:700">${g.short_name || g.promo_name}</div>
              <div style="font-size:11px;color:#64748b">${g.promo_name}</div></td>
          <td style="text-align:center"><span class="badge">${g.count} ชุด</span></td>
          <td style="text-align:center">${g.box}</td>
          <td style="text-align:center;color:#0369a1">${g.bubble !== '-' ? g.bubble : '-'}</td>
          <td><div class="note-box"></div></td>
        </tr>`;
      }
      for (const o of multis) {
        const bxName = boxes.find(b => b.id === override[o.id]?.box_id)?.name || '-';
        const buObj  = override[o.id]?.bubble_id ? bubbles.find(b => b.id === override[o.id].bubble_id) : null;
        const buName = buObj ? `ยาว ${buObj.length_cm} cm` : '-';
        const ph = o.promos.map((p2, pi) =>
          `<div><span style="background:#fef3c7;color:#92400e;border-radius:3px;padding:0 3px;font-size:10px">${pi+1}</span>
           <strong>${p2.short_name || p2.name}</strong>
           <span style="color:#64748b;font-size:11px"> ${p2.name}${promoRepeatText(p2)}</span></div>`).join('');
        html2 += `<tr style="background:#fffbeb">
          <td class="num">${idx++}</td>
          <td>${ph}<div style="margin-top:3px"><span style="background:#fef3c7;color:#92400e;font-size:10px;border-radius:3px;padding:1px 5px">⭐ แพ็คพิเศษ</span></div></td>
          <td style="text-align:center"><span class="badge">${orderPackCount(o)} ชุด</span></td>
          <td style="text-align:center">${bxName}</td>
          <td style="text-align:center;color:#0369a1">${buName !== '-' ? buName : '-'}</td>
          <td><div class="note-box"></div></td>
        </tr>`;
      }
      return { html: html2, nextIdx: idx };
    };

    const { html: fRows, nextIdx: ni } = buildRows(fSingle, fMultis, 1);
    const { html: mRows }              = buildRows(mSingle, mMultis, ni);

    const fSection = (fSingle.length + fMultis.length) > 0 ? `
      <tr><td colspan="6" style="background:#fefce8;border-top:2px solid #ca8a04;padding:6px 10px">
        <span style="font-weight:700;color:#854d0e">🟡 FLASH — ${flashOrd.length} ออเดอร์</span>
      </td></tr>${fRows}` : '';

    const mSection = (mSingle.length + mMultis.length) > 0 ? `
      <tr><td colspan="6" style="background:#eff6ff;border-top:2px solid #2563eb;padding:6px 10px">
        <span style="font-weight:700;color:#1d4ed8">🔵 MyOrder — ${myordOrd.length} ออเดอร์</span>
      </td></tr>${mRows}` : '';

    const html = `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8"/>
  <title>ใบเตรียมสินค้า</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Sarabun',sans-serif;font-size:13px;color:#1e293b;padding:20px}
    h1{font-size:20px;font-weight:700;margin-bottom:3px}
    .meta{font-size:11px;color:#64748b;margin-bottom:14px}
    table{width:100%;border-collapse:collapse;margin-bottom:20px}
    th{background:#1e293b;color:white;padding:8px 10px;text-align:left;font-size:11px}
    td{padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;vertical-align:top}
    .num{text-align:center;color:#64748b;font-weight:700;width:28px}
    .badge{display:inline-block;background:#cffafe;color:#164e63;border-radius:99px;padding:1px 8px;font-weight:700;font-size:12px}
    .note-box{border:1px solid #cbd5e1;border-radius:4px;min-height:28px}
    .footer{margin-top:24px;display:flex;gap:60px}
    .sig{border-top:1px solid #94a3b8;width:180px;text-align:center;padding-top:5px;font-size:10px;color:#64748b;margin-top:36px}
    @media print{body{padding:10px}}
  </style>
</head><body>
  <h1>📋 ใบเตรียมสินค้า</h1>
  <div class="meta">วันที่: ${today} &nbsp;|&nbsp; จำนวนออเดอร์: ${orders.length} รายการ &nbsp;|&nbsp; ผู้รับผิดชอบ: ${responsible}</div>
  <table>
    <thead><tr>
      <th style="width:28px">#</th>
      <th>รายการสินค้า / โปรโมชั่น</th>
      <th style="text-align:center;width:100px">จำนวน (ชุด)</th>
      <th style="text-align:center;width:120px">กล่อง</th>
      <th style="text-align:center;width:90px">บับเบิ้ล</th>
      <th style="width:120px">หมายเหตุ</th>
    </tr></thead>
    <tbody>${fSection}${mSection}</tbody>
  </table>
  <div class="footer">
    <div class="sig">ผู้เตรียม: ${responsible}</div>
    <div class="sig">ผู้ตรวจสอบ: ___________________</div>
  </div>
  <script>window.onload=()=>{window.print()}</script>
</body></html>`;

    const w = window.open('', '_blank', 'width=1000,height=700');
    if (w) { w.document.write(html); w.document.close(); }
    // เปิดแท็บประวัติปริ้น + reload
    setTab('history');
    setTimeout(() => loadPrintHistory(), 300);
  };

  const handleCreateRequisition = async () => {
    if (!canCreateRequisition || !onCreateRequisition) return;
    setSaving(true);
    try {
      // ใช้ประวัติชุดเดียวกับปุ่มปริ้น ถ้ามีอยู่แล้วจะอัปเดต ไม่สร้างแถวซ้ำ
      const { data: ph, error } = await savePackHistory('pending', responsible);

      if (error) {
        console.error('pack_history insert error:', error);
        onCreateRequisition('');
      } else {
        // ✅ อัพเดต order_status + บันทึก box_id/bubble_id จริงที่ใช้แพ็ค
        const todayDate = new Date().toISOString().split('T')[0];
        await Promise.all(orders.map(o => {
          const multi = isMulti(o);
          const boxId    = multi ? (override[o.id]?.box_id    || null) : (o.promos[0]?.box_id    || null);
          const bubbleId = multi ? (override[o.id]?.bubble_id || null) : (o.promos[0]?.bubble_id  || null);
          return supabase.from('orders').update({
            order_status: 'กำลังแพ็ค',
            ...(o.ship_date ? {} : { ship_date: todayDate }),
            ...(boxId    ? { box_id: boxId }           : {}),
            ...(bubbleId ? { bubble_id_pack: bubbleId } : {}),
          }).eq('id', o.id);
        }));
        // navigate หลัง DB update เสร็จแน่นอน
        onCreateRequisition(ph?.id || '');
      }
    } catch (err) {
      console.error('handleCreateRequisition error:', err);
      // fallback: navigate ไปหน้าใบเบิกเสมอ
      onCreateRequisition('');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 flex items-center gap-2 text-slate-500"><Package size={18} className="animate-bounce"/> กำลังโหลด...</div>;

  return (
    <div className="flex flex-col h-screen p-3 sm:p-6 pb-2">
      {/* Header — ไม่มีปุ่ม สร้างใบเบิก / เสร็จสิ้น ที่นี่ */}
      <div className="shrink-0 mb-4">
        <h2 className="text-lg sm:text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Package size={24} className="text-cyan-600"/> แพ็คสินค้า
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">วันที่ {packDate} · {orders.length} ออเดอร์</p>
      </div>

      {/* Tabs + Refresh button */}
      <div className="flex items-center gap-3 mb-4 shrink-0 flex-wrap">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          <button onClick={() => setTab('prep')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${tab==='prep'?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
            <ClipboardList size={15}/> จัดเตรียมสินค้า
          </button>
          <button
            onClick={() => canGoToSummary && setTab('summary')}
            disabled={!canGoToSummary}
            title={!canGoToSummary ? `ยังเลือกกล่องไม่ครบ ${multiIncomplete.length} รายการ` : ''}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2
              ${tab==='summary'?'bg-white shadow text-slate-800':''}
              ${!canGoToSummary?'opacity-40 cursor-not-allowed text-slate-400':'text-slate-500 hover:text-slate-700'}`}>
            <Package size={15}/> ใบสรุป
            {!canGoToSummary && <AlertCircle size={13} className="text-orange-400"/>}
          </button>
          <button
            onClick={() => { setTab('history'); loadPrintHistory(); }}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${tab==='history'?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
            <History size={15}/> ประวัติปริ้น
          </button>
        </div>
        <button
          onClick={() => loadData()}
          disabled={loading}
          className="px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 hover:border-slate-300 flex items-center gap-2 shadow-sm disabled:opacity-50 transition">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'animate-spin' : ''}>
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M8 16H3v5"/>
          </svg>
          {loading ? 'กำลังโหลด...' : 'รีเฟรชสินค้า'}
        </button>
      </div>

      {/* hint เมื่อ disabled */}
      {tab === 'prep' && !canGoToSummary && (
        <div className="shrink-0 mb-3 flex items-center gap-3 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
          <AlertCircle size={14} className="shrink-0"/>
          <span>กรุณาเลือกกล่องให้ครบก่อน — ยังขาดอีก {multiIncomplete.length} รายการ (แพ็คพิเศษ)</span>
          <button onClick={scrollToFirstIncomplete}
            className="ml-auto shrink-0 px-3 py-1 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 whitespace-nowrap">
            ไปเลย →
          </button>
        </div>
      )}

      {/* ── Tab: จัดเตรียมสินค้า ── */}
      {tab === 'prep' && (
        <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
          <table className="text-sm w-full" style={{minWidth:'1000px'}}>
            <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
              {/* Bulk assign bar */}
              {selectedMulti.size > 0 && (
                <tr className="bg-cyan-900">
                  <td colSpan={9} className="px-4 py-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-cyan-200 font-medium">เลือก {selectedMulti.size} รายการ</span>
                      {/* Searchable box */}
                      <div className="flex flex-col gap-0.5">
                        <input list="bulk-boxes" value={bulkBoxId ? (boxes.find(b=>b.id===bulkBoxId)?.name||bulkBoxId) : boxSearch}
                          onChange={e => {
                            setBoxSearch(e.target.value);
                            const found = boxes.find(b => b.name === e.target.value);
                            setBulkBoxId(found ? found.id : '');
                          }}
                          placeholder="พิมพ์เพื่อค้นหากล่อง..."
                          className="border rounded px-2 py-1.5 text-xs w-44 focus:outline-none focus:ring-1 focus:ring-cyan-300 bg-white text-slate-800"/>
                        <datalist id="bulk-boxes">
                          {boxes.map(b => <option key={b.id} value={b.name}/>)}
                        </datalist>
                      </div>
                      {/* Searchable bubble */}
                      <div className="flex flex-col gap-0.5">
                        <input list="bulk-bubbles" value={bulkBubbleId ? (bubbles.find(b=>b.id===bulkBubbleId) ? `ยาว ${bubbles.find(b=>b.id===bulkBubbleId)!.length_cm} cm` : bubbleSearch) : bubbleSearch}
                          onChange={e => {
                            setBubbleSearch(e.target.value);
                            const found = bubbles.find(b => `ยาว ${b.length_cm} cm` === e.target.value);
                            setBulkBubbleId(found ? found.id : '');
                          }}
                          placeholder="พิมพ์เพื่อค้นหาบั้บเบิ้ล..."
                          className="border rounded px-2 py-1.5 text-xs w-44 focus:outline-none focus:ring-1 focus:ring-cyan-300 bg-white text-slate-800"/>
                        <datalist id="bulk-bubbles">
                          {bubbles.map(b => <option key={b.id} value={`ยาว ${b.length_cm} cm`}/>)}
                        </datalist>
                      </div>
                      <button
                        onClick={() => {
                          if (!bulkBoxId) { alert('กรุณาเลือกกล่องก่อน'); return; }
                          setOverride(prev => {
                            const next = { ...prev };
                            selectedMulti.forEach(id => {
                              next[id] = { ...next[id], box_id: bulkBoxId, ...(bulkBubbleId ? { bubble_id: bulkBubbleId } : {}) };
                            });
                            return next;
                          });
                          setSelectedMulti(new Set());
                          setBulkBoxId(''); setBulkBubbleId(''); setBoxSearch(''); setBubbleSearch('');
                        }}
                        className="px-3 py-1.5 bg-cyan-400 text-slate-900 rounded-lg text-xs font-bold hover:bg-cyan-300 transition">
                        ✓ ใส่ให้ทั้งหมด
                      </button>
                      <button onClick={() => setSelectedMulti(new Set())}
                        className="text-xs text-cyan-300 hover:text-white ml-auto">ยกเลิก</button>
                    </div>
                  </td>
                </tr>
              )}
              <tr>
                <th className="p-3 text-center w-8 whitespace-nowrap">
                  <input type="checkbox"
                    checked={multiOrders.length > 0 && multiOrders.every(o => selectedMulti.has(o.id))}
                    onChange={e => setSelectedMulti(e.target.checked ? new Set(multiOrders.map(o => o.id)) : new Set())}
                    className="rounded cursor-pointer"/>
                </th>
                <th className="p-3 text-center w-10 whitespace-nowrap">#</th>
                <th className="p-3 text-left whitespace-nowrap">วันที่แพ็ค</th>
                <th className="p-3 text-left whitespace-nowrap">รายชื่อ</th>
                <th className="p-3 text-left whitespace-nowrap">เบอร์โทร</th>
                <th className="p-3 text-left whitespace-nowrap">ชื่อสินค้า / โปรโมชั่น</th>
                <th className="p-3 text-center whitespace-nowrap">จำนวน</th>
                <th className="p-3 text-left whitespace-nowrap">กล่อง</th>
                <th className="p-3 text-left whitespace-nowrap">บั้บเบิ้ล</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-400">ไม่มีออเดอร์</td></tr>}
              {orders.map((o, idx) => {
                const multi    = isMulti(o);
                const missingBox = multi && !override[o.id]?.box_id;
                return (
                  <tr key={o.id}
                    ref={el => { if (missingBox) incompleteRefs.current[o.id] = el; }}
                    className={`border-b align-top hover:bg-cyan-50 ${selectedMulti.has(o.id) ? 'bg-cyan-50' : missingBox ? 'bg-orange-50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                    <td className="p-3 text-center whitespace-nowrap">
                      {multi && (
                        <input type="checkbox" checked={selectedMulti.has(o.id)}
                          onChange={e => setSelectedMulti(prev => {
                            const next = new Set(prev);
                            e.target.checked ? next.add(o.id) : next.delete(o.id);
                            return next;
                          })}
                          className="rounded cursor-pointer"/>
                      )}
                    </td>
                    <td className="p-3 text-center font-bold text-slate-500 whitespace-nowrap">{idx + 1}</td>
                    <td className="p-3 text-xs text-slate-600 whitespace-nowrap">{packDate}{o.order_time && <div className="text-slate-400">{o.order_time}</div>}</td>
                    <td className="p-3 font-medium whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {o.customers?.name || '-'}
                        {chanBadge(o)}
                      </div>
                    </td>
                    <td className="p-3 font-mono text-xs whitespace-nowrap">{o.customers?.tel || '-'}</td>
                    <td className="p-3 min-w-[200px]">
                      {multi ? (
                        <div className="space-y-2">
                          {o.promos.map((p, pi) => (
                            <div key={pi} className="flex items-start gap-2">
                              <span className="w-5 h-5 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{pi+1}</span>
                              <div>
                                {p.short_name && <div className="font-medium text-slate-800 text-sm">{p.short_name}</div>}
                                <div className="text-xs text-slate-500">{p.name}{promoRepeatText(p)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div>
                          {o.promos[0]?.short_name && <div className="font-medium text-slate-800">{o.promos[0].short_name}</div>}
                          <div className="text-xs text-slate-500">{o.promos[0] ? `${o.promos[0].name}${promoRepeatText(o.promos[0])}` : (o.raw_prod || '-')}</div>
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <div className="font-bold text-slate-700 text-sm">{orderPackCount(o)}</div>
                      {multi && <div className="text-[10px] text-slate-400">{o.promos.length > 1 ? `${o.promos.length} รายการ` : 'เลือกกล่องเอง'}</div>}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {multi ? (
                        <>
                          <input
                            list={'boxes-' + o.id}
                            value={override[o.id]?.box_id ? (boxes.find(b => b.id === override[o.id].box_id)?.name || '') : (override[o.id]?.box_search || '')}
                            onChange={e => {
                              const found = boxes.find(b => b.name === e.target.value);
                              setOverride(p => ({ ...p, [o.id]: { ...p[o.id], box_id: found?.id || '', box_search: e.target.value } }));
                            }}
                            placeholder="พิมพ์ค้นหากล่อง... *"
                            className={['border rounded px-2 py-1.5 text-xs w-40 focus:outline-none focus:ring-1 focus:ring-cyan-300', !override[o.id]?.box_id ? 'border-orange-400 bg-orange-50' : 'border-green-400 bg-green-50'].join(' ')}/>
                          <datalist id={'boxes-' + o.id}>
                            {boxes.map(b => <option key={b.id} value={b.name}/>)}
                          </datalist>
                        </>
                      ) : (
                        <span className="text-sm text-slate-700">{o.promos[0]?.box_name || '-'}</span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {multi ? (
                        <>
                          <input
                            list={'bubbles-' + o.id}
                            value={(() => {
                              const bid = override[o.id]?.bubble_id;
                              if (!bid) return override[o.id]?.bubble_search || '';
                              const bub = bubbles.find(b => b.id === bid);
                              return bub ? 'ยาว ' + bub.length_cm + ' cm' : '';
                            })()}
                            onChange={e => {
                              const val = e.target.value;
                              const found = bubbles.find(b => ('ยาว ' + b.length_cm + ' cm') === val);
                              setOverride(p => ({ ...p, [o.id]: { ...p[o.id], bubble_id: found?.id || '', bubble_search: val } }));
                            }}
                            placeholder="พิมพ์ค้นหาบั้บเบิ้ล..."
                            className="border rounded px-2 py-1.5 text-xs w-40 focus:outline-none focus:ring-1 focus:ring-cyan-300"/>
                          <datalist id={'bubbles-' + o.id}>
                            {bubbles.map(b => <option key={b.id} value={'ยาว ' + b.length_cm + ' cm'}/>)}
                          </datalist>
                        </>
                      ) : (
                        <span className="text-sm text-slate-700">{o.promos[0]?.bubble_name || '-'}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab: ใบสรุป ── */}
      {tab === 'summary' && (
        <>
          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm w-full" style={{minWidth:'900px'}}>
              <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-center w-10 whitespace-nowrap">#</th>
                  <th className="p-3 text-left whitespace-nowrap">วันที่แพ็ค</th>
                  <th className="p-3 text-left whitespace-nowrap">รายการสินค้า</th>
                  <th className="p-3 text-center whitespace-nowrap">จำนวน (ชุด)</th>
                  <th className="p-3 text-left whitespace-nowrap">กล่อง</th>
                  <th className="p-3 text-left whitespace-nowrap">บั้บเบิ้ล</th>
                </tr>
              </thead>
              <tbody>
                {/* ── Section: FLASH ── */}
                {(summaryGroups.flashGrouped.length > 0 || summaryGroups.flashMultis.length > 0) && (
                  <tr>
                    <td colSpan={6} className="px-3 py-2 bg-yellow-50 border-y border-yellow-200">
                      <span className="text-xs font-bold text-yellow-700 flex items-center gap-1.5">
                        🟡 FLASH — {summaryGroups.flashGrouped.reduce((s,g)=>s+g.count,0) + summaryGroups.flashMultis.length} ออเดอร์
                      </span>
                    </td>
                  </tr>
                )}
                {summaryGroups.flashGrouped.map((g, idx) => (
                  <tr key={'f-'+g.promoId} className={`border-b align-top hover:bg-yellow-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                    <td className="p-3 text-center font-bold text-slate-500 whitespace-nowrap">{idx + 1}</td>
                    <td className="p-3 text-xs text-slate-600 whitespace-nowrap">{packDate}</td>
                    <td className="p-3 min-w-[160px]">
                      {g.short_name && <div className="font-semibold text-slate-800 whitespace-nowrap">{g.short_name}</div>}
                      <div className="text-xs text-slate-500 whitespace-nowrap">{g.promo_name}</div>
                      <div className="text-xs text-cyan-600 font-bold mt-0.5">จำนวน {g.count} ชุด</div>
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <span className="px-3 py-0.5 bg-cyan-100 text-cyan-800 rounded-full text-sm font-bold">{g.count} ชุด</span>
                    </td>
                    <td className="p-3 text-sm text-slate-600 whitespace-nowrap">{g.box_name}</td>
                    <td className="p-3 text-sm text-slate-600 whitespace-nowrap">{g.bubble_name}</td>
                  </tr>
                ))}
                {summaryGroups.flashMultis.map((o, idx) => {
                  const rowIdx = summaryGroups.flashGrouped.length + idx;
                  const selBox = override[o.id]?.box_id;
                  const selBub = override[o.id]?.bubble_id;
                  return (
                    <tr key={'fm-'+o.id} className="border-b align-top bg-amber-50 hover:bg-amber-100">
                      <td className="p-3 text-center font-bold text-amber-600 whitespace-nowrap">{rowIdx + 1}</td>
                      <td className="p-3 text-xs text-slate-600 whitespace-nowrap">{packDate}</td>
                      <td className="p-3 min-w-[180px]">
                        <div className="space-y-1.5 mb-1">
                          {o.promos.map((p, pi) => (
                            <div key={pi} className="flex items-start gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{pi+1}</span>
                              <div>
                                {p.short_name && <div className="font-semibold text-slate-800 text-sm whitespace-nowrap">{p.short_name}</div>}
                                <div className="text-xs text-slate-500 whitespace-nowrap">{p.name}{promoRepeatText(p)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <span className="text-xs text-amber-600 font-semibold bg-amber-100 px-2 py-0.5 rounded-full">⭐ แพ็คพิเศษ FLASH</span>
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <span className="px-3 py-0.5 bg-amber-100 text-amber-800 rounded-full text-sm font-bold">{orderPackCount(o)} ชุด</span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <select value={selBox || ''} onChange={e => setOverride(p => ({ ...p, [o.id]: { ...p[o.id], box_id: e.target.value } }))}
                          className="border rounded px-2 py-1.5 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-amber-300 bg-white">
                          <option value="">เลือกกล่อง...</option>
                          {boxes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <select value={selBub || ''} onChange={e => setOverride(p => ({ ...p, [o.id]: { ...p[o.id], bubble_id: e.target.value } }))}
                          className="border rounded px-2 py-1.5 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-amber-300 bg-white">
                          <option value="">บั้บเบิ้ล...</option>
                          {bubbles.map(b => <option key={b.id} value={b.id}>ยาว {b.length_cm} cm</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}

                {/* ── Section: MyOrder ── */}
                {(summaryGroups.myordGrouped.length > 0 || summaryGroups.myordMultis.length > 0) && (
                  <tr>
                    <td colSpan={6} className="px-3 py-2 bg-blue-50 border-y border-blue-200">
                      <span className="text-xs font-bold text-blue-700 flex items-center gap-1.5">
                        🔵 MyOrder — {summaryGroups.myordGrouped.reduce((s,g)=>s+g.count,0) + summaryGroups.myordMultis.length} ออเดอร์
                      </span>
                    </td>
                  </tr>
                )}
                {summaryGroups.myordGrouped.map((g, idx) => (
                  <tr key={'m-'+g.promoId} className={`border-b align-top hover:bg-blue-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                    <td className="p-3 text-center font-bold text-slate-500 whitespace-nowrap">{summaryGroups.flashGrouped.length + summaryGroups.flashMultis.length + idx + 1}</td>
                    <td className="p-3 text-xs text-slate-600 whitespace-nowrap">{packDate}</td>
                    <td className="p-3 min-w-[160px]">
                      {g.short_name && <div className="font-semibold text-slate-800 whitespace-nowrap">{g.short_name}</div>}
                      <div className="text-xs text-slate-500 whitespace-nowrap">{g.promo_name}</div>
                      <div className="text-xs text-cyan-600 font-bold mt-0.5">จำนวน {g.count} ชุด</div>
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <span className="px-3 py-0.5 bg-cyan-100 text-cyan-800 rounded-full text-sm font-bold">{g.count} ชุด</span>
                    </td>
                    <td className="p-3 text-sm text-slate-600 whitespace-nowrap">{g.box_name}</td>
                    <td className="p-3 text-sm text-slate-600 whitespace-nowrap">{g.bubble_name}</td>
                  </tr>
                ))}
                {summaryGroups.myordMultis.map((o, idx) => {
                  const rowIdx = summaryGroups.flashGrouped.length + summaryGroups.flashMultis.length + summaryGroups.myordGrouped.length + idx;
                  const selBox = override[o.id]?.box_id;
                  const selBub = override[o.id]?.bubble_id;
                  return (
                    <tr key={'mm-'+o.id} className="border-b align-top bg-amber-50 hover:bg-amber-100">
                      <td className="p-3 text-center font-bold text-amber-600 whitespace-nowrap">{rowIdx + 1}</td>
                      <td className="p-3 text-xs text-slate-600 whitespace-nowrap">{packDate}</td>
                      <td className="p-3 min-w-[180px]">
                        <div className="space-y-1.5 mb-1">
                          {o.promos.map((p, pi) => (
                            <div key={pi} className="flex items-start gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{pi+1}</span>
                              <div>
                                {p.short_name && <div className="font-semibold text-slate-800 text-sm whitespace-nowrap">{p.short_name}</div>}
                                <div className="text-xs text-slate-500 whitespace-nowrap">{p.name}{promoRepeatText(p)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <span className="text-xs text-amber-600 font-semibold bg-amber-100 px-2 py-0.5 rounded-full">⭐ แพ็คพิเศษ MyOrder</span>
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <span className="px-3 py-0.5 bg-amber-100 text-amber-800 rounded-full text-sm font-bold">{orderPackCount(o)} ชุด</span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <select value={selBox || ''} onChange={e => setOverride(p => ({ ...p, [o.id]: { ...p[o.id], box_id: e.target.value } }))}
                          className="border rounded px-2 py-1.5 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-amber-300 bg-white">
                          <option value="">เลือกกล่อง...</option>
                          {boxes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <select value={selBub || ''} onChange={e => setOverride(p => ({ ...p, [o.id]: { ...p[o.id], bubble_id: e.target.value } }))}
                          className="border rounded px-2 py-1.5 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-amber-300 bg-white">
                          <option value="">บั้บเบิ้ล...</option>
                          {bubbles.map(b => <option key={b.id} value={b.id}>ยาว {b.length_cm} cm</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── ผู้รับผิดชอบ + ปุ่มสร้างใบเบิก (ท้ายสุด) ── */}
          <div className="shrink-0 mt-4 bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">
                ผู้รับผิดชอบ <span className="text-red-400">*</span>
              </label>
              <input value={responsible} onChange={e => setResponsible(e.target.value)}
                placeholder="กรอกชื่อผู้รับผิดชอบก่อนสร้างใบเบิก..."
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${responsible.trim() ? 'border-green-400 focus:ring-green-300' : 'border-slate-300 focus:ring-cyan-300'}`}/>
            </div>
            {canCreateRequisition && (
              <div className="flex gap-2 shrink-0">
                <button onClick={handlePrint}
                  className="px-4 py-2.5 bg-slate-600 text-white rounded-xl hover:bg-slate-700 font-semibold flex items-center gap-2 shadow">
                  <Printer size={15}/> ปริ้น
                </button>
                <button onClick={handleCreateRequisition} disabled={saving}
                  className="px-6 py-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 font-semibold flex items-center gap-2 shadow disabled:opacity-50">
                  <FileText size={16}/> {saving ? 'กำลังบันทึก...' : 'สร้างใบเบิก'}
                </button>
              </div>
            )}
            {!canCreateRequisition && (
              <div className="text-xs text-slate-400 flex items-center gap-1 shrink-0">
                <AlertCircle size={13}/> กรอกผู้รับผิดชอบเพื่อสร้างใบเบิก
              </div>
            )}
          </div>
        </>
      )}

      {/* ── แท็บ ประวัติปริ้น ── */}
      {tab === 'history' && (
        <div className="flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div>
              <h3 className="font-semibold text-slate-800">ประวัติการปริ้นใบเตรียมสินค้า</h3>
              <p className="text-xs text-slate-400 mt-0.5">กดปุ่มปริ้นซ้ำเพื่อพิมพ์อีกครั้ง</p>
            </div>
            <button onClick={loadPrintHistory} disabled={loadingHistory}
              className="flex items-center gap-2 px-3 py-1.5 text-xs border rounded-lg hover:bg-slate-50 transition disabled:opacity-50">
              <RefreshCw size={13} className={loadingHistory ? 'animate-spin' : ''}/> รีเฟรช
            </button>
          </div>
          {loadingHistory && (
            <div className="p-8 text-center text-slate-400 text-sm">กำลังโหลด...</div>
          )}
          {!loadingHistory && printHistory.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">ยังไม่มีประวัติการปริ้น</div>
          )}
          {!loadingHistory && printHistory.length > 0 && (
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-slate-500">วันที่ปริ้น</th>
                  <th className="p-3 text-left text-xs font-medium text-slate-500">ผู้รับผิดชอบ</th>
                  <th className="p-3 text-center text-xs font-medium text-slate-500">จำนวนออเดอร์</th>
                  <th className="p-3 text-center text-xs font-medium text-slate-500">สถานะ</th>
                  <th className="p-3 text-center text-xs font-medium text-slate-500">รายการสินค้า</th>
                  <th className="p-3 text-center text-xs font-medium text-slate-500">ปริ้นซ้ำ</th>
                </tr>
              </thead>
              <tbody>
                {printHistory.map((item, idx) => {
                  const snap = (item.summary_snapshot || []) as any[];
                  const printedAt = new Date(item.created_at).toLocaleString('th-TH', {
                    day: '2-digit', month: '2-digit', year: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                  });
                  return (
                    <tr key={item.id} className={'border-b hover:bg-slate-50 transition ' + (idx % 2 === 0 ? '' : 'bg-slate-50/50')}>
                      <td className="p-3 text-slate-700">{printedAt}</td>
                      <td className="p-3 font-medium text-slate-800">{item.responsible_person || '-'}</td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 bg-cyan-100 text-cyan-800 rounded-full text-xs font-bold">{item.order_count}</span>
                      </td>
                      <td className="p-3 text-center">
                        {item.status === 'approved'
                          ? <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">✓ อนุมัติแล้ว</span>
                          : <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold">ปริ้นแล้ว</span>
                        }
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-0.5 max-h-20 overflow-auto">
                          {snap.slice(0, 3).map((s: any, i: number) => {
                            const productName = getSnapshotProductName(s) || s.name || '-';
                            const promoName = getSnapshotPromoName(s);
                            return (
                              <div key={i} className="text-xs text-slate-600">
                                <div>
                                  {productName} — <span className="font-medium">{s.count} ชุด</span>
                                </div>
                                {promoName && promoName !== productName && (
                                  <div className="text-[10px] text-slate-400 ml-2">{promoName}</div>
                                )}
                              </div>
                            );
                          })}
                          {snap.length > 3 && <div className="text-xs text-slate-400">+{snap.length - 3} รายการ</div>}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleReprintFromHistory(item)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-medium hover:bg-slate-700 transition mx-auto">
                          <Printer size={12}/> ปริ้นซ้ำ
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
