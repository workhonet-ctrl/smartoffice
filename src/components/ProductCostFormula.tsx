import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Calculator,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  Search,
  Package,
  History,
  Sparkles,
  FileText,
  Layers,
  PackageCheck,
  X,
} from 'lucide-react';

type ProductMaster = {
  id: string;
  name: string;
  cost_thb?: number | null;
};

type StockItem = {
  id: string;
  name: string;
  unit: string;
  type: string;
  ref_id?: string | null;
};

type Formula = {
  id: string;
  product_id: string | null;
  product_name: string;
  formula_name: string;
  output_qty: number;
  output_unit: string;
  cost_per_unit: number;
  active: boolean;
  note: string | null;
  created_at?: string;
  updated_at?: string;
};

type FormulaItem = {
  id?: string;
  formula_id?: string;
  cost_type: 'material' | 'service' | 'shipping' | 'other';
  stock_item_id: string | null;
  item_name: string;
  qty: number;
  unit: string;
  unit_cost: number;
  subtotal: number;
  note?: string | null;
  local_key?: string;
};

type CalculationHistory = {
  id: string;
  formula_id: string;
  product_name: string;
  formula_name: string;
  output_qty: number;
  output_unit: string;
  total_cost: number;
  cost_per_unit: number;
  items_snapshot: FormulaItem[];
  note: string | null;
  created_at: string;
};

type ProductCostLot = {
  id: string;
  lot_no: string;
  product_id: string | null;
  product_name: string;
  formula_id: string | null;
  calculation_history_id: string | null;
  initial_qty: number;
  remaining_qty: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  status: string;
  note: string | null;
  created_at: string;
};

const emptyItem = (): FormulaItem => ({
  local_key: `${Date.now()}-${Math.random()}`,
  cost_type: 'material',
  stock_item_id: null,
  item_name: '',
  qty: 1,
  unit: 'ชิ้น',
  unit_cost: 0,
  subtotal: 0,
  note: '',
});

const costTypeLabel = (type: string) => {
  if (type === 'material') return 'วัตถุดิบ/วัสดุ';
  if (type === 'service') return 'ค่าบริการ/ค่าแรง';
  if (type === 'shipping') return 'ค่าขนส่งเข้า';
  return 'อื่น ๆ';
};

const money = (value: number) => `฿${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ProductCostFormula() {
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [selectedFormulaId, setSelectedFormulaId] = useState('');
  const [history, setHistory] = useState<CalculationHistory[]>([]);
  const [lots, setLots] = useState<ProductCostLot[]>([]);
  const [showLotConfirm, setShowLotConfirm] = useState(false);
  const [lotDuplicateWarning, setLotDuplicateWarning] = useState<{
    activeLots: ProductCostLot[];
    sameLots24h: ProductCostLot[];
  }>({ activeLots: [], sameLots24h: [] });
  const [lotNote, setLotNote] = useState('');
  const [tab, setTab] = useState<'form' | 'history' | 'lots'>('form');

  const [productId, setProductId] = useState('');
  const [productName, setProductName] = useState('');
  const [formulaName, setFormulaName] = useState('');
  const [outputQty, setOutputQty] = useState(1);
  const [outputUnit, setOutputUnit] = useState('ชิ้น');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<FormulaItem[]>([emptyItem()]);

  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [{ data: prod, error: prodErr }, { data: stock, error: stockErr }, { data: formula, error: formulaErr }] = await Promise.all([
        supabase.from('products_master').select('id, name, cost_thb').order('name'),
        supabase.from('stock_items').select('id, name, unit, type, ref_id').eq('active', true).order('type').order('name'),
        supabase.from('product_cost_formulas').select('*').eq('active', true).order('created_at', { ascending: false }),
      ]);

      if (prodErr) throw prodErr;
      if (stockErr) throw stockErr;
      if (formulaErr) throw formulaErr;

      setProducts((prod || []) as ProductMaster[]);
      setStockItems((stock || []) as StockItem[]);
      setFormulas((formula || []) as Formula[]);
    } catch (err: any) {
      showToast('โหลดข้อมูลสูตรต้นทุนไม่สำเร็จ: ' + (err.message || 'unknown'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalCost = useMemo(
    () => items.reduce((sum, it) => sum + Number(it.qty || 0) * Number(it.unit_cost || 0), 0),
    [items]
  );

  const costPerUnit = useMemo(
    () => Number(outputQty || 0) > 0 ? totalCost / Number(outputQty || 1) : 0,
    [totalCost, outputQty]
  );

  const filteredFormulas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return formulas;
    return formulas.filter(f =>
      f.product_name.toLowerCase().includes(q) ||
      f.formula_name.toLowerCase().includes(q)
    );
  }, [formulas, search]);

  const resetForm = () => {
    setSelectedFormulaId('');
    setProductId('');
    setProductName('');
    setFormulaName('');
    setOutputQty(1);
    setOutputUnit('ชิ้น');
    setNote('');
    setItems([emptyItem()]);
    setHistory([]);
    setLots([]);
    setShowLotConfirm(false);
    setLotDuplicateWarning({ activeLots: [], sameLots24h: [] });
    setLotNote('');
    setTab('form');
  };

  const selectProduct = (id: string) => {
    setProductId(id);
    const found = products.find(p => p.id === id);
    setProductName(found?.name || '');
    if (found?.name && !formulaName) {
      setFormulaName(`สูตรต้นทุน ${found.name}`);
    }
  };

  const updateItem = (key: string, field: keyof FormulaItem, value: any) => {
    setItems(prev => prev.map(it => {
      const rowKey = it.id || it.local_key || '';
      if (rowKey !== key) return it;

      const next: FormulaItem = { ...it, [field]: value };

      if (field === 'stock_item_id') {
        const stock = stockItems.find(s => s.id === value);
        if (stock) {
          next.stock_item_id = stock.id;
          next.item_name = stock.name;
          next.unit = stock.unit || next.unit;
        } else {
          next.stock_item_id = null;
        }
      }

      next.subtotal = Number(next.qty || 0) * Number(next.unit_cost || 0);
      return next;
    }));
  };

  const addItem = () => setItems(prev => [...prev, emptyItem()]);

  const removeItem = (key: string) => {
    setItems(prev => prev.length <= 1 ? prev : prev.filter(it => (it.id || it.local_key) !== key));
  };

  const loadFormula = async (formula: Formula) => {
    setLoading(true);
    try {
      const [{ data: rows, error: rowsErr }, { data: hist, error: histErr }, { data: lotRows, error: lotErr }] = await Promise.all([
        supabase.from('product_cost_formula_items').select('*').eq('formula_id', formula.id).order('created_at'),
        supabase.from('product_cost_calculation_history').select('*').eq('formula_id', formula.id).order('created_at', { ascending: false }).limit(20),
        supabase.from('product_cost_lots').select('*').eq('formula_id', formula.id).order('created_at', { ascending: false }).limit(30),
      ]);

      if (rowsErr) throw rowsErr;
      if (histErr) throw histErr;
      if (lotErr) throw lotErr;

      setSelectedFormulaId(formula.id);
      setProductId(formula.product_id || '');
      setProductName(formula.product_name || '');
      setFormulaName(formula.formula_name || '');
      setOutputQty(Number(formula.output_qty || 1));
      setOutputUnit(formula.output_unit || 'ชิ้น');
      setNote(formula.note || '');
      setItems(((rows || []) as FormulaItem[]).map(r => ({
        ...r,
        qty: Number(r.qty || 0),
        unit_cost: Number(r.unit_cost || 0),
        subtotal: Number(r.subtotal || 0),
        local_key: r.id,
      })).concat((rows || []).length ? [] : [emptyItem()]));
      setHistory((hist || []) as CalculationHistory[]);
      setLots((lotRows || []) as ProductCostLot[]);
      setLotNote(`ล็อตต้นทุนจาก ${formula.formula_name}`);
      setTab('form');
    } catch (err: any) {
      showToast('โหลดสูตรไม่สำเร็จ: ' + (err.message || 'unknown'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const validate = () => {
    if (!productName.trim()) {
      showToast('กรุณาเลือกหรือระบุชื่อสินค้าสำเร็จรูป', 'error');
      return false;
    }

    if (!formulaName.trim()) {
      showToast('กรุณาระบุชื่อสูตรต้นทุน', 'error');
      return false;
    }

    if (Number(outputQty || 0) <= 0) {
      showToast('จำนวนผลผลิตต้องมากกว่า 0', 'error');
      return false;
    }

    const validRows = items.filter(it => it.item_name.trim() && Number(it.qty || 0) > 0);
    if (!validRows.length) {
      showToast('กรุณาเพิ่มรายการต้นทุนอย่างน้อย 1 รายการ', 'error');
      return false;
    }

    return true;
  };

  const saveFormula = async () => {
    if (saving) return;
    if (!validate()) return;

    setSaving(true);
    try {
      const cleanedItems = items
        .filter(it => it.item_name.trim() && Number(it.qty || 0) > 0)
        .map(it => ({
          cost_type: it.cost_type || 'material',
          stock_item_id: it.stock_item_id || null,
          item_name: it.item_name.trim(),
          qty: Number(it.qty || 0),
          unit: it.unit || 'ชิ้น',
          unit_cost: Number(it.unit_cost || 0),
          subtotal: Number(it.qty || 0) * Number(it.unit_cost || 0),
          note: it.note || null,
        }));

      let formulaId = selectedFormulaId;

      if (selectedFormulaId) {
        const { error } = await supabase
          .from('product_cost_formulas')
          .update({
            product_id: productId || null,
            product_name: productName.trim(),
            formula_name: formulaName.trim(),
            output_qty: Number(outputQty || 1),
            output_unit: outputUnit || 'ชิ้น',
            cost_per_unit: costPerUnit,
            note: note || null,
          })
          .eq('id', selectedFormulaId);

        if (error) throw error;

        await supabase.from('product_cost_formula_items').delete().eq('formula_id', selectedFormulaId);
      } else {
        const { data, error } = await supabase
          .from('product_cost_formulas')
          .insert([{
            product_id: productId || null,
            product_name: productName.trim(),
            formula_name: formulaName.trim(),
            output_qty: Number(outputQty || 1),
            output_unit: outputUnit || 'ชิ้น',
            cost_per_unit: costPerUnit,
            active: true,
            note: note || null,
          }])
          .select()
          .single();

        if (error) throw error;
        formulaId = data.id;
        setSelectedFormulaId(formulaId);
      }

      const { error: itemErr } = await supabase
        .from('product_cost_formula_items')
        .insert(cleanedItems.map(it => ({ ...it, formula_id: formulaId })));

      if (itemErr) throw itemErr;

      await saveCalculationHistory(formulaId, cleanedItems, false);
      await loadData();

      const current = await supabase.from('product_cost_formulas').select('*').eq('id', formulaId).single();
      if (current.data) await loadFormula(current.data as Formula);

      showToast('✓ บันทึกสูตรต้นทุนสำเร็จ');
    } catch (err: any) {
      showToast('บันทึกสูตรไม่สำเร็จ: ' + (err.message || 'unknown'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveCalculationHistory = async (formulaId: string, rows?: any[], showSuccess = true) => {
    const snapshot = rows || items
      .filter(it => it.item_name.trim() && Number(it.qty || 0) > 0)
      .map(it => ({
        cost_type: it.cost_type,
        stock_item_id: it.stock_item_id,
        item_name: it.item_name,
        qty: Number(it.qty || 0),
        unit: it.unit,
        unit_cost: Number(it.unit_cost || 0),
        subtotal: Number(it.qty || 0) * Number(it.unit_cost || 0),
        note: it.note || null,
      }));

    const total = snapshot.reduce((sum: number, it: any) => sum + Number(it.subtotal || 0), 0);
    const perUnit = Number(outputQty || 0) > 0 ? total / Number(outputQty || 1) : 0;

    const { error } = await supabase.from('product_cost_calculation_history').insert([{
      formula_id: formulaId,
      product_name: productName.trim(),
      formula_name: formulaName.trim(),
      output_qty: Number(outputQty || 1),
      output_unit: outputUnit || 'ชิ้น',
      total_cost: total,
      cost_per_unit: perUnit,
      items_snapshot: snapshot,
      note: note || null,
    }]);

    if (error) throw error;
    if (showSuccess) showToast('✓ บันทึกประวัติคำนวณแล้ว');
  };

  const openCreateLotConfirm = async () => {
    if (!selectedFormulaId) {
      showToast('กรุณาบันทึกสูตรต้นทุนก่อนสร้างล็อต', 'error');
      return;
    }

    if (Number(outputQty || 0) <= 0 || Number(costPerUnit || 0) <= 0) {
      showToast('จำนวนผลผลิตและต้นทุนต่อหน่วยต้องมากกว่า 0', 'error');
      return;
    }

    setSaving(true);
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: activeRows, error: activeErr } = await supabase
        .from('product_cost_lots')
        .select('*')
        .eq('product_id', productId || '')
        .eq('status', 'active')
        .gt('remaining_qty', 0)
        .order('created_at', { ascending: false })
        .limit(10);

      if (activeErr) throw activeErr;

      const { data: sameRows, error: sameErr } = await supabase
        .from('product_cost_lots')
        .select('*')
        .eq('formula_id', selectedFormulaId)
        .eq('product_id', productId || '')
        .eq('status', 'active')
        .eq('initial_qty', Number(outputQty || 0))
        .eq('unit_cost', Number(costPerUnit || 0))
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(10);

      if (sameErr) throw sameErr;

      setLotDuplicateWarning({
        activeLots: (activeRows || []) as ProductCostLot[],
        sameLots24h: (sameRows || []) as ProductCostLot[],
      });

      setShowLotConfirm(true);
    } catch (err: any) {
      showToast('ตรวจล็อตซ้ำไม่สำเร็จ: ' + (err.message || 'unknown'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const generateLotNo = async () => {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const prefix = `LOT-${dateStr}-`;

    const { data, error } = await supabase
      .from('product_cost_lots')
      .select('lot_no')
      .like('lot_no', `${prefix}%`)
      .order('lot_no', { ascending: false })
      .limit(1);

    if (error) throw error;

    const lastNo = data?.[0]?.lot_no || '';
    const lastSeq = Number(lastNo.replace(prefix, '')) || 0;
    return `${prefix}${String(lastSeq + 1).padStart(3, '0')}`;
  };

  const createCostLot = async () => {
    if (saving) return;

    if (!selectedFormulaId) {
      showToast('กรุณาบันทึกสูตรต้นทุนก่อนสร้างล็อต', 'error');
      return;
    }

    if (Number(outputQty || 0) <= 0 || Number(costPerUnit || 0) <= 0) {
      showToast('จำนวนผลผลิตและต้นทุนต่อหน่วยต้องมากกว่า 0', 'error');
      return;
    }

    setSaving(true);
    try {
      const lotNo = await generateLotNo();

      // ใช้ประวัติคำนวณล่าสุดของสูตรนี้เพื่ออ้างอิง snapshot
      const { data: latestHistory } = await supabase
        .from('product_cost_calculation_history')
        .select('id')
        .eq('formula_id', selectedFormulaId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const total = Number(outputQty || 0) * Number(costPerUnit || 0);

      const { data: lot, error: lotErr } = await supabase
        .from('product_cost_lots')
        .insert([{
          lot_no: lotNo,
          product_id: productId || null,
          product_name: productName.trim(),
          formula_id: selectedFormulaId,
          calculation_history_id: latestHistory?.id || null,
          initial_qty: Number(outputQty || 0),
          remaining_qty: Number(outputQty || 0),
          unit: outputUnit || 'ชิ้น',
          unit_cost: Number(costPerUnit || 0),
          total_cost: total,
          status: 'active',
          note: lotNote || null,
        }])
        .select()
        .single();

      if (lotErr) throw lotErr;

      const { error: txnErr } = await supabase
        .from('product_cost_lot_transactions')
        .insert([{
          lot_id: lot.id,
          lot_no: lotNo,
          product_id: productId || null,
          product_name: productName.trim(),
          txn_type: 'in',
          qty: Number(outputQty || 0),
          unit_cost: Number(costPerUnit || 0),
          total_cost: total,
          ref_type: 'cost_formula',
          ref_id: selectedFormulaId,
          note: `สร้างล็อตจากสูตรต้นทุน ${formulaName}`,
        }]);

      if (txnErr) throw txnErr;

      setLots(prev => [lot as ProductCostLot, ...prev]);
      setShowLotConfirm(false);
      setLotDuplicateWarning({ activeLots: [], sameLots24h: [] });
      showToast(`✓ สร้างล็อตต้นทุน ${lotNo} สำเร็จ`);
    } catch (err: any) {
      showToast('สร้างล็อตต้นทุนไม่สำเร็จ: ' + (err.message || 'unknown'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const deactivateFormula = async () => {
    if (!selectedFormulaId) return;
    if (!confirm('ปิดใช้งานสูตรต้นทุนนี้?')) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('product_cost_formulas')
        .update({ active: false })
        .eq('id', selectedFormulaId);

      if (error) throw error;
      showToast('✓ ปิดใช้งานสูตรแล้ว');
      resetForm();
      await loadData();
    } catch (err: any) {
      showToast('ปิดใช้งานสูตรไม่สำเร็จ: ' + (err.message || 'unknown'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const summaryByType = useMemo(() => {
    const result: Record<string, number> = { material: 0, service: 0, shipping: 0, other: 0 };
    items.forEach(it => {
      const type = it.cost_type || 'other';
      result[type] = (result[type] || 0) + Number(it.qty || 0) * Number(it.unit_cost || 0);
    });
    return result;
  }, [items]);

  return (
    <div className="flex flex-col h-screen p-3 sm:p-6 pb-2 bg-slate-50">
      <div className="shrink-0 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-indigo-500 flex items-center justify-center shadow">
            <Calculator size={22} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold text-slate-800">สูตรต้นทุนสินค้า</h2>
            <p className="text-sm text-slate-500">
              คำนวณต้นทุนต่อชิ้นจากวัตถุดิบ วัสดุ ค่าบริการ และค่าขนส่ง
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={loadData} disabled={loading}
            className="px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-100 flex items-center gap-2 text-sm font-semibold disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            รีเฟรช
          </button>
          <button onClick={resetForm}
            className="px-3 py-2 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 flex items-center gap-2 text-sm font-semibold shadow-sm">
            <Plus size={14} />
            สูตรใหม่
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col min-h-[260px]">
          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหาสูตร / สินค้า..."
                className="w-full pl-8 pr-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-200" />
            </div>
          </div>

          <div className="flex-1 overflow-auto p-3 space-y-2">
            {filteredFormulas.length === 0 && (
              <div className="p-6 text-center text-slate-400 text-sm">ยังไม่มีสูตรต้นทุน</div>
            )}

            {filteredFormulas.map(f => (
              <button key={f.id} onClick={() => loadFormula(f)}
                className={`w-full text-left rounded-2xl border p-3 transition ${
                  selectedFormulaId === f.id
                    ? 'bg-fuchsia-50 border-fuchsia-200 shadow-sm'
                    : 'bg-white border-slate-100 hover:bg-slate-50'
                }`}>
                <div className="font-extrabold text-slate-800 truncate">{f.formula_name}</div>
                <div className="text-xs text-slate-500 truncate mt-0.5">{f.product_name}</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-slate-400">ต่อ {f.output_unit}</span>
                  <span className="text-sm font-extrabold text-fuchsia-700">{money(Number(f.cost_per_unit || 0))}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex flex-col gap-4 overflow-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 shrink-0">
            <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-4">
              <div className="text-xs font-bold text-slate-400">ต้นทุนรวม</div>
              <div className="text-2xl font-extrabold text-slate-800 mt-1">{money(totalCost)}</div>
            </div>
            <div className="rounded-3xl bg-gradient-to-br from-fuchsia-50 to-indigo-50 border border-fuchsia-100 shadow-sm p-4">
              <div className="text-xs font-bold text-fuchsia-600">ต้นทุนต่อหน่วย</div>
              <div className="text-2xl font-extrabold text-fuchsia-700 mt-1">{money(costPerUnit)}</div>
            </div>
            <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-4">
              <div className="text-xs font-bold text-slate-400">ผลผลิต</div>
              <div className="text-2xl font-extrabold text-slate-800 mt-1">{Number(outputQty || 0).toLocaleString()}</div>
              <div className="text-xs text-slate-400">{outputUnit}</div>
            </div>
            <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-4">
              <div className="text-xs font-bold text-slate-400">จำนวนรายการต้นทุน</div>
              <div className="text-2xl font-extrabold text-slate-800 mt-1">{items.filter(i => i.item_name.trim()).length}</div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="font-extrabold text-slate-800 flex items-center gap-2">
                <Package size={18} className="text-fuchsia-500" />
                ข้อมูลสูตร
              </h3>
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                {(['form', 'history', 'lots'] as const).map(k => (
                  <button key={k} onClick={() => setTab(k)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${tab === k ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>
                    {k === 'form' ? 'สูตรต้นทุน' : k === 'history' ? 'ประวัติคำนวณ' : 'ล็อตต้นทุน'}
                  </button>
                ))}
              </div>
            </div>

            {tab === 'form' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 block mb-1">สินค้าสำเร็จรูป</label>
                    <select value={productId} onChange={e => selectProduct(e.target.value)}
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-200">
                      <option value="">เลือกสินค้า...</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 block mb-1">หรือระบุชื่อเอง</label>
                    <input value={productName} onChange={e => setProductName(e.target.value)}
                      placeholder="เช่น ครีม Secret Rose"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-200" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 block mb-1">ชื่อสูตร</label>
                    <input value={formulaName} onChange={e => setFormulaName(e.target.value)}
                      placeholder="เช่น สูตรครีม 10g"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-200" />
                  </div>
                  <div className="grid grid-cols-[1fr_90px] gap-2">
                    <div>
                      <label className="text-xs font-bold text-slate-500 block mb-1">จำนวนผลผลิต</label>
                      <input type="number" value={outputQty} onChange={e => setOutputQty(Number(e.target.value))}
                        className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-200" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 block mb-1">หน่วย</label>
                      <input value={outputUnit} onChange={e => setOutputUnit(e.target.value)}
                        className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-200" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">หมายเหตุ</label>
                  <input value={note} onChange={e => setNote(e.target.value)}
                    placeholder="เช่น สูตรรอบผลิตเดือนนี้ / ใช้ราคาวัตถุดิบล่าสุด"
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-200" />
                </div>

                <div className="rounded-3xl border border-slate-100 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-800 text-white flex items-center justify-between">
                    <div className="font-bold flex items-center gap-2">
                      <Layers size={16} />
                      รายการต้นทุน
                    </div>
                    <button onClick={addItem}
                      className="px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-xl text-xs font-bold flex items-center gap-1">
                      <Plus size={13} />
                      เพิ่มรายการ
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {items.map((it, idx) => {
                      const key = it.id || it.local_key || String(idx);
                      return (
                        <div key={key} className="p-3 grid grid-cols-1 xl:grid-cols-[145px_1.2fr_90px_80px_110px_110px_36px] gap-2 items-end">
                          <div>
                            <label className="text-[11px] font-bold text-slate-400 block mb-1">ประเภท</label>
                            <select value={it.cost_type} onChange={e => updateItem(key, 'cost_type', e.target.value)}
                              className="w-full border rounded-xl px-2 py-2 text-sm">
                              <option value="material">วัตถุดิบ/วัสดุ</option>
                              <option value="service">ค่าบริการ/ค่าแรง</option>
                              <option value="shipping">ค่าขนส่งเข้า</option>
                              <option value="other">อื่น ๆ</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-slate-400 block mb-1">รายการต้นทุน</label>
                            <select value={it.stock_item_id || ''} onChange={e => updateItem(key, 'stock_item_id', e.target.value)}
                              className="w-full border rounded-xl px-2 py-2 text-sm mb-1">
                              <option value="">ไม่ผูกสต็อก / พิมพ์เอง</option>
                              {stockItems.map(s => (
                                <option key={s.id} value={s.id}>{s.name} ({s.unit})</option>
                              ))}
                            </select>
                            <input value={it.item_name} onChange={e => updateItem(key, 'item_name', e.target.value)}
                              placeholder="เช่น เนื้อครีม / กระปุก / ค่าบรรจุ"
                              className="w-full border rounded-xl px-2 py-2 text-sm" />
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-slate-400 block mb-1">จำนวน</label>
                            <input type="number" value={it.qty} onChange={e => updateItem(key, 'qty', Number(e.target.value))}
                              className="w-full border rounded-xl px-2 py-2 text-sm text-right" />
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-slate-400 block mb-1">หน่วย</label>
                            <input value={it.unit} onChange={e => updateItem(key, 'unit', e.target.value)}
                              className="w-full border rounded-xl px-2 py-2 text-sm" />
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-slate-400 block mb-1">ราคา/หน่วย</label>
                            <input type="number" value={it.unit_cost} onChange={e => updateItem(key, 'unit_cost', Number(e.target.value))}
                              className="w-full border rounded-xl px-2 py-2 text-sm text-right" />
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-slate-400 block mb-1">รวม</label>
                            <div className="w-full rounded-xl bg-slate-50 px-2 py-2 text-sm text-right font-extrabold text-slate-800">
                              {money(Number(it.qty || 0) * Number(it.unit_cost || 0))}
                            </div>
                          </div>

                          <button onClick={() => removeItem(key)}
                            className="h-10 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 flex items-center justify-center">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {Object.entries(summaryByType).map(([type, value]) => (
                    <div key={type} className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
                      <div className="text-xs text-slate-400 font-bold">{costTypeLabel(type)}</div>
                      <div className="text-lg font-extrabold text-slate-800 mt-1">{money(value)}</div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 flex-wrap">
                  {selectedFormulaId && (
                    <button onClick={deactivateFormula} disabled={saving}
                      className="px-4 py-2.5 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold disabled:opacity-50">
                      ปิดใช้งานสูตร
                    </button>
                  )}
                  {selectedFormulaId && (
                    <button onClick={openCreateLotConfirm} disabled={saving}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:from-emerald-600 hover:to-cyan-600 font-bold shadow disabled:opacity-50 flex items-center gap-2">
                      <PackageCheck size={16} />
                      สร้างล็อตต้นทุน
                    </button>
                  )}
                  <button onClick={saveFormula} disabled={saving}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white hover:from-fuchsia-600 hover:to-indigo-600 font-bold shadow disabled:opacity-50 flex items-center gap-2">
                    <Save size={16} />
                    {saving ? 'กำลังบันทึก...' : 'บันทึกสูตรต้นทุน'}
                  </button>
                </div>
              </div>
            )}

            {tab === 'history' && (
              <div className="space-y-3">
                {!selectedFormulaId && (
                  <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl">
                    เลือกสูตรทางซ้ายก่อน เพื่อดูประวัติคำนวณ
                  </div>
                )}

                {selectedFormulaId && history.length === 0 && (
                  <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl">
                    ยังไม่มีประวัติคำนวณ
                  </div>
                )}

                {history.map(h => (
                  <div key={h.id} className="rounded-3xl border border-slate-100 bg-white shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-extrabold text-slate-800 flex items-center gap-2">
                          <History size={16} className="text-fuchsia-500" />
                          {h.formula_name}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {new Date(h.created_at).toLocaleString('th-TH')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400">ต้นทุนต่อ {h.output_unit}</div>
                        <div className="text-xl font-extrabold text-fuchsia-700">{money(Number(h.cost_per_unit || 0))}</div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <div className="text-xs text-slate-400">ต้นทุนรวม</div>
                        <div className="font-bold">{money(Number(h.total_cost || 0))}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <div className="text-xs text-slate-400">ผลผลิต</div>
                        <div className="font-bold">{Number(h.output_qty).toLocaleString()} {h.output_unit}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <div className="text-xs text-slate-400">จำนวนรายการ</div>
                        <div className="font-bold">{Array.isArray(h.items_snapshot) ? h.items_snapshot.length : 0} รายการ</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'lots' && (
              <div className="space-y-3">
                {!selectedFormulaId && (
                  <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl">
                    เลือกสูตรทางซ้ายก่อน เพื่อดูล็อตต้นทุน
                  </div>
                )}

                {selectedFormulaId && lots.length === 0 && (
                  <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl">
                    ยังไม่มีล็อตต้นทุนของสูตรนี้
                  </div>
                )}

                {lots.map(lot => (
                  <div key={lot.id} className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-white to-emerald-50 shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-extrabold text-slate-800 flex items-center gap-2">
                          <PackageCheck size={16} className="text-emerald-500" />
                          {lot.lot_no}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {new Date(lot.created_at).toLocaleString('th-TH')}
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        lot.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : lot.status === 'depleted'
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-rose-100 text-rose-600'
                      }`}>
                        {lot.status === 'active' ? 'ใช้งานอยู่' : lot.status === 'depleted' ? 'หมดแล้ว' : 'ปิดล็อต'}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-2 text-sm">
                      <div className="rounded-2xl bg-white/80 border border-white p-3">
                        <div className="text-xs text-slate-400">จำนวนเริ่มต้น</div>
                        <div className="font-extrabold text-slate-800">{Number(lot.initial_qty).toLocaleString()} {lot.unit}</div>
                      </div>
                      <div className="rounded-2xl bg-white/80 border border-white p-3">
                        <div className="text-xs text-slate-400">คงเหลือ</div>
                        <div className="font-extrabold text-emerald-700">{Number(lot.remaining_qty).toLocaleString()} {lot.unit}</div>
                      </div>
                      <div className="rounded-2xl bg-white/80 border border-white p-3">
                        <div className="text-xs text-slate-400">ต้นทุนต่อหน่วย</div>
                        <div className="font-extrabold text-fuchsia-700">{money(Number(lot.unit_cost || 0))}</div>
                      </div>
                      <div className="rounded-2xl bg-white/80 border border-white p-3">
                        <div className="text-xs text-slate-400">ต้นทุนรวม</div>
                        <div className="font-extrabold text-slate-800">{money(Number(lot.total_cost || 0))}</div>
                      </div>
                    </div>

                    {lot.note && (
                      <div className="mt-3 rounded-2xl bg-white/70 border border-white px-3 py-2 text-xs text-slate-500">
                        {lot.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-gradient-to-br from-fuchsia-50 to-indigo-50 border border-fuchsia-100 p-4 text-sm text-slate-600 flex items-start gap-3">
            <Sparkles size={20} className="text-fuchsia-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-extrabold text-slate-800">แนวทางใช้งาน</div>
              <div className="mt-1 leading-6">
                PO ใช้บันทึกสิ่งที่ซื้อจริง ส่วนหน้านี้ใช้รวมต้นทุนหลายรายการให้กลายเป็นต้นทุนต่อชิ้น เช่น ครีม 1 กระปุก = เนื้อครีม + กระปุก + กล่อง + ค่าบรรจุ + ค่าทำความสะอาด
              </div>
            </div>
          </div>
        </div>
      </div>

      {showLotConfirm && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl border border-emerald-100 overflow-hidden">
            <div className="bg-gradient-to-br from-emerald-50 via-cyan-50 to-fuchsia-50 px-6 py-6 border-b border-emerald-100 relative">
              <button onClick={() => setShowLotConfirm(false)}
                className="absolute right-4 top-4 text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-emerald-500 to-cyan-500 text-white flex items-center justify-center text-3xl shadow-lg mb-3">
                📦
              </div>
              <h3 className="text-xl font-extrabold text-slate-800">สร้างล็อตต้นทุนใช่ไหม?</h3>
              <p className="text-sm text-slate-500 mt-2 leading-6">
                ระบบจะล็อกต้นทุนสูตรนี้เป็นล็อตใหม่ เพื่อไม่ให้ต้นทุนรอบถัดไปทับออเดอร์เก่า
              </p>
            </div>

            <div className="px-6 py-4 space-y-3">
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-slate-400">สินค้า</span><b>{productName || '-'}</b></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-slate-400">จำนวนล็อต</span><b>{Number(outputQty || 0).toLocaleString()} {outputUnit}</b></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-slate-400">ต้นทุนต่อหน่วย</span><b className="text-fuchsia-700">{money(costPerUnit)}</b></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-slate-400">ต้นทุนรวม</span><b>{money(totalCost)}</b></div>
              </div>

              {(lotDuplicateWarning.activeLots.length > 0 || lotDuplicateWarning.sameLots24h.length > 0) && (
                <div className={`rounded-2xl border px-3 py-3 text-xs leading-5 ${
                  lotDuplicateWarning.sameLots24h.length > 0
                    ? 'bg-rose-50 border-rose-100 text-rose-700'
                    : 'bg-amber-50 border-amber-100 text-amber-700'
                }`}>
                  <div className="font-extrabold mb-2">
                    {lotDuplicateWarning.sameLots24h.length > 0
                      ? '⚠️ เตือนแรง: สูตร/จำนวน/ต้นทุนนี้เพิ่งสร้างล็อตใน 24 ชม.'
                      : '⚠️ สินค้านี้มีล็อต active อยู่แล้ว'}
                  </div>

                  {lotDuplicateWarning.activeLots.slice(0, 3).map(lot => (
                    <div key={lot.id} className="rounded-xl bg-white/80 border border-white px-3 py-2 mb-2">
                      <div className="flex justify-between gap-2">
                        <span className="font-mono font-bold">{lot.lot_no}</span>
                        <span className="font-bold">{money(Number(lot.unit_cost || 0))}/ชิ้น</span>
                      </div>
                      <div className="mt-1 flex justify-between gap-2 text-slate-500">
                        <span>คงเหลือ {Number(lot.remaining_qty || 0).toLocaleString()} / {Number(lot.initial_qty || 0).toLocaleString()} {lot.unit}</span>
                        <span>{new Date(lot.created_at).toLocaleString('th-TH')}</span>
                      </div>
                    </div>
                  ))}

                  <div className="font-bold">
                    ถ้ากดยืนยัน ระบบจะเพิ่มล็อตใหม่อีก {Number(outputQty || 0).toLocaleString()} {outputUnit}
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">หมายเหตุล็อต</label>
                <input value={lotNote} onChange={e => setLotNote(e.target.value)}
                  placeholder="เช่น ล็อตผลิตครีม Secret Rose รอบเดือนนี้"
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>

              <div className="rounded-2xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
                หลังสร้างล็อตแล้ว ล็อตนี้จะเป็นต้นทุนอ้างอิงของสินค้ารอบนี้ เช่น ฿27 ต่อชิ้น
              </div>
            </div>

            <div className="px-6 pb-6 flex justify-end gap-2">
              <button onClick={() => setShowLotConfirm(false)} disabled={saving}
                className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold disabled:opacity-50">
                ยกเลิก
              </button>
              <button onClick={createCostLot} disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:from-emerald-600 hover:to-cyan-600 font-bold shadow disabled:opacity-50 flex items-center gap-2">
                <PackageCheck size={16} />
                {saving ? 'กำลังสร้าง...' : lotDuplicateWarning.activeLots.length > 0 ? 'ยืนยันสร้างล็อตใหม่เพิ่ม' : 'ยืนยันสร้างล็อต'}
              </button>
            </div>
          </div>
        </div>
      )}

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
