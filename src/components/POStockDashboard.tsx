import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  BarChart3,
  ClipboardCheck,
  Clock,
  PackageCheck,
  PackageSearch,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Boxes,
  ArrowDown,
  FileText,
  CalendarDays,
  Users,
} from 'lucide-react';

type POItem = {
  key?: string;
  stock_item_id: string | null;
  name: string;
  qty: number;
  unit: string;
  price: number;
};

type PurchaseOrder = {
  id: string;
  po_no: string;
  po_date: string;
  supplier_id: string | null;
  supplier_name: string | null;
  items: POItem[];
  total_thb: number;
  status: string;
  note: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type StockItem = {
  id: string;
  name: string;
  unit: string;
  type: string;
  min_qty: number;
  current_qty: number;
  total_in: number;
  total_out: number;
  active: boolean;
};

type StockTransaction = {
  id: string;
  stock_item_id: string;
  txn_type: string;
  qty: number;
  ref_type: string | null;
  ref_id: string | null;
  note: string | null;
  created_at: string;
  stock_items?: {
    name: string;
    unit: string;
  } | null;
};

type ProductCostLot = {
  id: string;
  lot_no: string;
  product_id: string | null;
  product_name: string;
  initial_qty: number;
  remaining_qty: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  status: string;
  note: string | null;
  created_at: string;
  updated_at?: string | null;
};

type DashboardProps = {
  onGoToPO?: () => void;
  onGoToStock?: () => void;
};

type DateRangeKey = 'today' | '7d' | '30d' | 'month' | 'all';

const dateRangeOptions: { key: DateRangeKey; label: string; short: string }[] = [
  { key: 'today', label: 'วันนี้', short: 'วันนี้' },
  { key: '7d', label: '7 วันล่าสุด', short: '7 วัน' },
  { key: '30d', label: '30 วันล่าสุด', short: '30 วัน' },
  { key: 'month', label: 'เดือนนี้', short: 'เดือนนี้' },
  { key: 'all', label: 'ทั้งหมด', short: 'ทั้งหมด' },
];

const getRangeStart = (range: DateRangeKey) => {
  const d = new Date();

  if (range === 'today') {
    d.setHours(0, 0, 0, 0);
    return d;
  }

  if (range === '7d') {
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  if (range === '30d') {
    d.setDate(d.getDate() - 29);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  if (range === 'month') {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  return null;
};

const money = (value: number) => `฿${Number(value || 0).toLocaleString()}`;

const statusText = (status: string) => {
  if (status === 'pending_approval') return 'รออนุมัติ';
  if (status === 'approved') return 'รอรับเข้า';
  if (status === 'received') return 'ปิดงานแล้ว';
  if (status === 'rejected') return 'ไม่อนุมัติ';
  return status || '-';
};

const statusBadgeClass = (status: string) => {
  if (status === 'pending_approval') return 'bg-orange-50 text-orange-700 border-orange-100';
  if (status === 'approved') return 'bg-cyan-50 text-cyan-700 border-cyan-100';
  if (status === 'received') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (status === 'rejected') return 'bg-rose-50 text-rose-700 border-rose-100';
  return 'bg-slate-50 text-slate-600 border-slate-100';
};

const stockTypeText = (type: string) => {
  if (type === 'product') return 'สินค้า';
  if (type === 'box') return 'กล่อง';
  if (type === 'bubble') return 'บั้บเบิ้ล';
  return 'อื่น ๆ';
};

export default function POStockDashboard({ onGoToPO, onGoToStock }: DashboardProps) {
  const [poList, setPoList] = useState<PurchaseOrder[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [latestTxns, setLatestTxns] = useState<StockTransaction[]>([]);
  const [costLots, setCostLots] = useState<ProductCostLot[]>([]);
  const [range, setRange] = useState<DateRangeKey>('month');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [{ data: po }, { data: stock }, { data: txns }, { data: lots }] = await Promise.all([
        supabase
          .from('purchase_orders')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(300),
        supabase
          .from('stock_current')
          .select('*')
          .order('type')
          .order('name'),
        supabase
          .from('stock_transactions')
          .select('*, stock_items(name, unit)')
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('product_cost_lots')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      setPoList((po || []) as PurchaseOrder[]);
      setStockItems((stock || []) as StockItem[]);
      setLatestTxns((txns || []) as StockTransaction[]);
      setCostLots((lots || []) as ProductCostLot[]);
    } catch (err: any) {
      showToast('โหลด Dashboard ไม่สำเร็จ: ' + (err.message || 'unknown'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const rangeStart = useMemo(() => getRangeStart(range), [range]);
  const selectedRangeLabel = dateRangeOptions.find(o => o.key === range)?.label || 'เดือนนี้';

  const filteredPO = useMemo(() => {
    if (!rangeStart) return poList;

    return poList.filter(po => {
      const rawDate = po.created_at || po.po_date;
      if (!rawDate) return false;
      return new Date(rawDate) >= rangeStart;
    });
  }, [poList, rangeStart]);

  const filteredClosedPO = useMemo(() => {
    if (!rangeStart) return poList.filter(po => po.status === 'received');

    return poList.filter(po => {
      if (po.status !== 'received') return false;
      const rawDate = po.updated_at || po.created_at || po.po_date;
      if (!rawDate) return false;
      return new Date(rawDate) >= rangeStart;
    });
  }, [poList, rangeStart]);

  const summary = useMemo(() => {
    const pendingAll = poList.filter(po => po.status === 'pending_approval');
    const approvedAll = poList.filter(po => po.status === 'approved');
    const receivedAll = poList.filter(po => po.status === 'received');

    const lowStock = stockItems.filter(i => i.active && i.min_qty > 0 && Number(i.current_qty) <= Number(i.min_qty));
    const warnStock = stockItems.filter(i =>
      i.active &&
      i.min_qty > 0 &&
      Number(i.current_qty) > Number(i.min_qty) &&
      Number(i.current_qty) <= Number(i.min_qty) * 1.5
    );

    const poValue = filteredPO.reduce((sum, po) => sum + Number(po.total_thb || 0), 0);
    const receivedValue = filteredClosedPO.reduce((sum, po) => sum + Number(po.total_thb || 0), 0);

    return {
      poInRangeCount: filteredPO.length,
      pendingCount: pendingAll.length,
      approvedCount: approvedAll.length,
      receivedCount: receivedAll.length,
      poValue,
      receivedValue,
      lowStock,
      warnStock,
      totalStockItems: stockItems.length,
    };
  }, [poList, stockItems, filteredPO, filteredClosedPO]);

  const recentPO = useMemo(() => filteredPO.slice(0, 5), [filteredPO]);

  const filteredTxns = useMemo(() => {
    if (!rangeStart) return latestTxns;
    return latestTxns.filter(txn => new Date(txn.created_at) >= rangeStart);
  }, [latestTxns, rangeStart]);

  const topSuppliers = useMemo(() => {
    const map = new Map<string, { supplier: string; count: number; value: number }>();

    filteredPO.forEach(po => {
      const name = po.supplier_name || 'ไม่ระบุผู้ขาย';
      const cur = map.get(name) || { supplier: name, count: 0, value: 0 };
      cur.count += 1;
      cur.value += Number(po.total_thb || 0);
      map.set(name, cur);
    });

    return Array.from(map.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [filteredPO]);

  const stockCareList = useMemo(
    () => [...summary.lowStock, ...summary.warnStock].slice(0, 5),
    [summary.lowStock, summary.warnStock]
  );

  const activeCostLots = useMemo(
    () => costLots.filter(lot => lot.status === 'active' && Number(lot.remaining_qty || 0) > 0),
    [costLots]
  );

  const lotSummary = useMemo(() => {
    const remainingValue = activeCostLots.reduce(
      (sum, lot) => sum + Number(lot.remaining_qty || 0) * Number(lot.unit_cost || 0),
      0
    );

    const lowLots = activeCostLots.filter(lot => {
      const initial = Number(lot.initial_qty || 0);
      const remaining = Number(lot.remaining_qty || 0);
      if (initial <= 0) return false;
      return remaining / initial <= 0.2;
    });

    const activeProducts = new Set(activeCostLots.map(lot => lot.product_id || lot.product_name)).size;

    return {
      activeLots: activeCostLots.length,
      activeProducts,
      remainingValue,
      lowLots,
      avgUnitCost: activeCostLots.length > 0
        ? activeCostLots.reduce((sum, lot) => sum + Number(lot.unit_cost || 0), 0) / activeCostLots.length
        : 0,
    };
  }, [activeCostLots]);

  const latestCostLots = useMemo(
    () => activeCostLots.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 6),
    [activeCostLots]
  );

  const lowCostLots = useMemo(
    () => lotSummary.lowLots
      .slice()
      .sort((a, b) => (Number(a.remaining_qty || 0) / Math.max(Number(a.initial_qty || 1), 1)) - (Number(b.remaining_qty || 0) / Math.max(Number(b.initial_qty || 1), 1)))
      .slice(0, 5),
    [lotSummary.lowLots]
  );

  const statCards = [
    {
      title: `PO ${selectedRangeLabel}`,
      value: summary.poInRangeCount.toLocaleString(),
      sub: 'จำนวนใบสั่งซื้อในช่วงที่เลือก',
      icon: ShoppingBag,
      tone: 'from-indigo-500 to-violet-500',
      bg: 'bg-indigo-50',
    },
    {
      title: 'รออนุมัติ',
      value: summary.pendingCount.toLocaleString(),
      sub: 'รายการค้างตรวจ',
      icon: Clock,
      tone: 'from-orange-500 to-amber-500',
      bg: 'bg-orange-50',
    },
    {
      title: 'รอรับเข้า',
      value: summary.approvedCount.toLocaleString(),
      sub: 'อนุมัติแล้ว ยังไม่ปิดงาน',
      icon: PackageSearch,
      tone: 'from-cyan-500 to-blue-500',
      bg: 'bg-cyan-50',
    },
    {
      title: 'ปิดงานแล้ว',
      value: summary.receivedCount.toLocaleString(),
      sub: 'รับเข้าสินค้าแล้วทั้งหมด',
      icon: CheckCircle2,
      tone: 'from-emerald-500 to-green-500',
      bg: 'bg-emerald-50',
    },
  ];

  return (
    <div className="flex flex-col h-screen p-3 sm:p-6 pb-2 bg-slate-50">
      <div className="shrink-0 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow">
            <BarChart3 size={22} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold text-slate-800">Dashboard PO + Stock</h2>
            <p className="text-sm text-slate-500">
              ภาพรวมใบสั่งซื้อ การรับเข้าสินค้า และสต็อกคงเหลือ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-white border border-slate-100 rounded-2xl p-1 shadow-sm">
            {dateRangeOptions.map(option => (
              <button
                key={option.key}
                onClick={() => setRange(option.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  range === option.key
                    ? 'bg-indigo-500 text-white shadow'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {option.short}
              </button>
            ))}
          </div>

          <button
            onClick={loadDashboard}
            disabled={loading}
            className="px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-100 flex items-center gap-2 text-sm font-semibold disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            รีเฟรช
          </button>
          {onGoToPO && (
            <button
              onClick={onGoToPO}
              className="px-3 py-2 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 flex items-center gap-2 text-sm font-semibold shadow-sm"
            >
              <ClipboardCheck size={14} />
              ไปหน้า PO
            </button>
          )}
          {onGoToStock && (
            <button
              onClick={onGoToStock}
              className="px-3 py-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 flex items-center gap-2 text-sm font-semibold shadow-sm"
            >
              <Boxes size={14} />
              ไปหน้า Stock
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {statCards.map(card => {
            const Icon = card.icon;
            return (
              <div key={card.title} className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 overflow-hidden relative">
                <div className={`absolute -right-8 -top-8 w-24 h-24 rounded-full ${card.bg}`}></div>
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-slate-400">{card.title}</div>
                    <div className="text-3xl font-extrabold text-slate-800 mt-1">{card.value}</div>
                    <div className="text-xs text-slate-500 mt-1">{card.sub}</div>
                  </div>
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${card.tone} text-white flex items-center justify-center shadow`}>
                    <Icon size={22} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-extrabold text-slate-800 flex items-center gap-2">
                  <TrendingUp size={18} className="text-indigo-500" />
                  มูลค่า {selectedRangeLabel}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">สรุปมูลค่า PO และมูลค่าที่รับเข้าแล้วตามช่วงเวลาที่เลือก</p>
              </div>
              <div className="hidden sm:flex items-center gap-1 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full">
                <CalendarDays size={13} />
                {selectedRangeLabel}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-3xl bg-gradient-to-br from-indigo-50 to-fuchsia-50 border border-indigo-100 p-4">
                <div className="text-xs font-bold text-indigo-500">มูลค่า PO</div>
                <div className="text-3xl font-extrabold text-slate-800 mt-2">{money(summary.poValue)}</div>
                <div className="text-xs text-slate-500 mt-2">รวมจาก PO ในช่วงที่เลือก</div>
              </div>
              <div className="rounded-3xl bg-gradient-to-br from-emerald-50 to-cyan-50 border border-emerald-100 p-4">
                <div className="text-xs font-bold text-emerald-600">มูลค่ารับเข้า</div>
                <div className="text-3xl font-extrabold text-slate-800 mt-2">{money(summary.receivedValue)}</div>
                <div className="text-xs text-slate-500 mt-2">รวมจาก PO ที่ปิดงานแล้วในช่วงที่เลือก</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-extrabold text-slate-800 flex items-center gap-2 mb-3">
              <AlertTriangle size={18} className="text-amber-500" />
              สต็อกที่ควรดูแล
            </h3>

            <div className="space-y-2">
              {stockCareList.map(item => {
                const isLow = Number(item.current_qty) <= Number(item.min_qty);
                return (
                  <div key={item.id} className={`rounded-2xl border p-3 ${isLow ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100'}`}>
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 truncate">{item.name}</div>
                        <div className="text-xs text-slate-500">{stockTypeText(item.type)}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-lg font-extrabold ${isLow ? 'text-rose-600' : 'text-amber-600'}`}>
                          {Number(item.current_qty).toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-400">{item.unit}</div>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      ขั้นต่ำ {Number(item.min_qty).toLocaleString()} {item.unit}
                    </div>
                  </div>
                );
              })}

              {stockCareList.length === 0 && (
                <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-5 text-center text-emerald-700 font-bold">
                  ✅ สต็อกยังปกติ
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ภาพรวมล็อตต้นทุน */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-slate-800 flex items-center gap-2">
                <PackageCheck size={18} className="text-emerald-500" />
                ภาพรวมล็อตต้นทุน
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">ดูล็อต active ต้นทุนคงเหลือ และสินค้าที่ใกล้หมดล็อต</p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="rounded-3xl bg-emerald-50 border border-emerald-100 p-4">
                <div className="text-xs font-bold text-emerald-600">ล็อตต้นทุน Active</div>
                <div className="text-3xl font-extrabold text-emerald-700 mt-1">{lotSummary.activeLots.toLocaleString()}</div>
                <div className="text-xs text-slate-500 mt-1">{lotSummary.activeProducts.toLocaleString()} สินค้า</div>
              </div>

              <div className="rounded-3xl bg-fuchsia-50 border border-fuchsia-100 p-4">
                <div className="text-xs font-bold text-fuchsia-600">มูลค่าล็อตคงเหลือ</div>
                <div className="text-3xl font-extrabold text-fuchsia-700 mt-1">{money(lotSummary.remainingValue)}</div>
                <div className="text-xs text-slate-500 mt-1">remaining_qty × unit_cost</div>
              </div>

              <div className="rounded-3xl bg-amber-50 border border-amber-100 p-4">
                <div className="text-xs font-bold text-amber-600">ล็อตใกล้หมด</div>
                <div className="text-3xl font-extrabold text-amber-700 mt-1">{lotSummary.lowLots.length.toLocaleString()}</div>
                <div className="text-xs text-slate-500 mt-1">เหลือน้อยกว่า 20%</div>
              </div>

              <div className="rounded-3xl bg-slate-50 border border-slate-100 p-4">
                <div className="text-xs font-bold text-slate-500">ต้นทุนเฉลี่ย/ล็อต</div>
                <div className="text-3xl font-extrabold text-slate-800 mt-1">{money(lotSummary.avgUnitCost)}</div>
                <div className="text-xs text-slate-500 mt-1">เฉลี่ยจากล็อต active</div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="xl:col-span-2 rounded-3xl border border-slate-100 overflow-hidden">
                <div className="px-4 py-3 bg-slate-800 text-white flex justify-between items-center">
                  <div className="font-bold text-sm">ล็อตต้นทุนล่าสุด</div>
                  <div className="text-xs text-slate-300">แสดง 6 รายการ</div>
                </div>
                <div className="overflow-auto">
                  <table className="w-full text-sm" style={{ minWidth: '760px' }}>
                    <thead className="bg-slate-50 text-slate-500 text-xs">
                      <tr>
                        <th className="px-4 py-3 text-left">เลขล็อต</th>
                        <th className="px-4 py-3 text-left">สินค้า</th>
                        <th className="px-4 py-3 text-right">ต้นทุน/ชิ้น</th>
                        <th className="px-4 py-3 text-right">คงเหลือ</th>
                        <th className="px-4 py-3 text-right">มูลค่าคงเหลือ</th>
                        <th className="px-4 py-3 text-center">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestCostLots.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-slate-400">ยังไม่มีล็อตต้นทุน active</td>
                        </tr>
                      )}
                      {latestCostLots.map(lot => {
                        const value = Number(lot.remaining_qty || 0) * Number(lot.unit_cost || 0);
                        return (
                          <tr key={lot.id} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-4 py-3 font-mono text-xs text-emerald-700">{lot.lot_no}</td>
                            <td className="px-4 py-3 font-bold text-slate-800">{lot.product_name}</td>
                            <td className="px-4 py-3 text-right font-bold text-fuchsia-700">{money(lot.unit_cost)}</td>
                            <td className="px-4 py-3 text-right">
                              {Number(lot.remaining_qty || 0).toLocaleString()} {lot.unit}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-800">{money(value)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100">
                                active
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-3xl border border-amber-100 bg-amber-50/50 p-4">
                <h4 className="font-extrabold text-slate-800 flex items-center gap-2 mb-3">
                  <AlertTriangle size={17} className="text-amber-500" />
                  ใกล้หมดล็อต
                </h4>
                <div className="space-y-2">
                  {lowCostLots.length === 0 && (
                    <div className="rounded-2xl bg-white/80 border border-white p-5 text-center text-emerald-700 font-bold">
                      ✅ ยังไม่มีล็อตใกล้หมด
                    </div>
                  )}
                  {lowCostLots.map(lot => {
                    const percent = Number(lot.initial_qty || 0) > 0
                      ? (Number(lot.remaining_qty || 0) / Number(lot.initial_qty || 1)) * 100
                      : 0;
                    return (
                      <div key={lot.id} className="rounded-2xl bg-white border border-amber-100 p-3">
                        <div className="font-bold text-slate-800 truncate">{lot.product_name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{lot.lot_no}</div>
                        <div className="mt-2 flex justify-between text-xs">
                          <span className="text-slate-500">คงเหลือ</span>
                          <span className="font-bold text-amber-700">
                            {Number(lot.remaining_qty || 0).toLocaleString()} / {Number(lot.initial_qty || 0).toLocaleString()} {lot.unit}
                          </span>
                        </div>
                        <div className="mt-2 h-2 bg-amber-100 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.max(4, Math.min(100, percent))}%` }} />
                        </div>
                        <div className="text-[11px] text-amber-600 mt-1">{percent.toFixed(1)}% ของล็อต</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ย้ายผู้ขายยอดสูงสุดขึ้นมาไว้ด้านบน ตามที่ตูนขอ */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-slate-800 flex items-center gap-2">
                <Users size={18} className="text-indigo-500" />
                ผู้ขายยอดสูงสุด {selectedRangeLabel}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">แสดงสูงสุด 5 ราย เพื่อไม่ให้ข้อมูลเยอะเกินไป</p>
            </div>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            {topSuppliers.length === 0 && (
              <div className="col-span-full text-center text-slate-400 p-6">ยังไม่มีข้อมูลผู้ขายในช่วงนี้</div>
            )}
            {topSuppliers.map((s, idx) => (
              <div key={s.supplier} className="rounded-3xl bg-gradient-to-br from-slate-50 to-indigo-50 border border-slate-100 p-4">
                <div className="w-9 h-9 rounded-2xl bg-indigo-500 text-white flex items-center justify-center font-extrabold shadow mb-3">
                  {idx + 1}
                </div>
                <div className="font-extrabold text-slate-800 truncate">{s.supplier}</div>
                <div className="text-xs text-slate-500 mt-1">{s.count} PO</div>
                <div className="text-lg font-extrabold text-indigo-700 mt-2">{money(s.value)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-extrabold text-slate-800 flex items-center gap-2">
                <FileText size={18} className="text-indigo-500" />
                PO ล่าสุด
              </h3>
              <span className="text-xs text-slate-400">แสดง 5 รายการ</span>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm" style={{ minWidth: '680px' }}>
                <thead className="bg-slate-800 text-white text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">เลข PO</th>
                    <th className="px-4 py-3 text-left">ผู้ขาย</th>
                    <th className="px-4 py-3 text-right">ยอดรวม</th>
                    <th className="px-4 py-3 text-center">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPO.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-400">ยังไม่มี PO ในช่วงนี้</td>
                    </tr>
                  )}
                  {recentPO.map(po => (
                    <tr key={po.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-indigo-700">{po.po_no}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{po.supplier_name || '-'}</td>
                      <td className="px-4 py-3 text-right font-bold">{money(po.total_thb)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full border text-xs font-bold ${statusBadgeClass(po.status)}`}>
                          {statusText(po.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-extrabold text-slate-800 flex items-center gap-2">
                <ArrowDown size={18} className="text-emerald-500" />
                การเคลื่อนไหวสต็อกล่าสุด
              </h3>
              <span className="text-xs text-slate-400">เกิน 5 รายการเลื่อนได้</span>
            </div>

            <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
              {filteredTxns.length === 0 && (
                <div className="p-8 text-center text-slate-400">ยังไม่มีประวัติการเคลื่อนไหวในช่วงนี้</div>
              )}
              {filteredTxns.map(txn => (
                <div key={txn.id} className="p-4 hover:bg-slate-50">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800 truncate">{txn.stock_items?.name || '-'}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {txn.ref_type ? `${txn.ref_type}: ` : ''}{txn.ref_id || '-'} · {new Date(txn.created_at).toLocaleString('th-TH')}
                      </div>
                    </div>
                    <div className={`text-right font-extrabold shrink-0 ${txn.txn_type === 'in' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {txn.txn_type === 'in' ? '+' : '-'}{Number(txn.qty).toLocaleString()}
                      <span className="text-xs text-slate-400 ml-1">{txn.stock_items?.unit}</span>
                    </div>
                  </div>
                  {txn.note && <div className="text-xs text-slate-500 mt-1 truncate">{txn.note}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] px-5 py-4 rounded-xl shadow-2xl text-white text-sm font-medium ${
          toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
        }`} style={{ minWidth: '280px' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
