import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, CreditCard as Edit2, Trash2, X } from 'lucide-react';

type ProductMaster = {
  id: string;
  name: string;
  cost_thb: number;
  weight_g: number;
  created_at?: string;
};

type ProductPromoRow = {
  id: string;
  master_id: string;
  name: string;
  short_name: string | null;
  price_thb: number;
  box_id: string | null;
  bubble_id: string | null;
  color: string | null;
  item_type: string | null;
  boxes?: any;
  bubbles?: any;
  created_at?: string;
};

type Box = {
  id: string;
  name: string;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  price_thb: number;
};

type Bubble = {
  id: string;
  name: string;
  length_cm: number | null;
  width_cm: number | null;
  price_thb: number | null;
  active?: boolean;
  created_at?: string;
};

type MasterFormState = {
  id: string;
  name: string;
  cost_thb: number;
  weight_g: number;
};

type PromoFormState = {
  id: string;
  master_id: string;
  name: string;
  short_name: string;
  price_thb: number;
  box_id: string;
  bubble_id: string;
  color: string;
  item_type: string;
};

const emptyMasterForm: MasterFormState = {
  id: '',
  name: '',
  cost_thb: 0,
  weight_g: 0,
};

const emptyPromoForm: PromoFormState = {
  id: '',
  master_id: '',
  name: '',
  short_name: '',
  price_thb: 0,
  box_id: '',
  bubble_id: '',
  color: '',
  item_type: 'อื่นๆ',
};

const BOX_ORDER = [
  'ไม่ใช้กล่อง',
  'กล่อง 00 ไม่พิมพ์',
  'กล่อง 00',
  'กล่อง 00 ลายแมว',
  'กล่อง 0',
  'กล่อง 0+4',
  'กล่อง A',
  'กล่อง AA',
  'กล่อง AB',
  'กล่อง AH',
  'กล่อง A2',
  'กล่อง A3',
  'กล่อง 2A',
  'กล่อง B',
  'กล่อง 2B',
  'กล่อง B+7',
  'กล่อง BH',
  'กล่อง C',
  'กล่อง 2C',
  'กล่อง CD',
  'กล่อง C+8',
  'กล่อง C+9',
  'กล่อง C+15',
  'กล่อง D',
  'กล่อง 2D',
  'กล่อง D-7',
  'กล่อง D+11',
  'กล่อง E',
  'กล่อง 2E',
  'กล่อง S+',
  'กล่อง Fเล็ก',
  'กล่อง ฉ',
  'กล่อง ฉ+13',
  'กล่อง Fใหญ่',
  'กล่อง 2F',
  'กล่อง G',
  'กล่อง M',
  'กล่อง M+',
  'กล่อง L',
  'กล่อง H',
  'กล่อง I บาง',
  'กล่อง No.7',
  'กล่องยาว T1',
  'กล่องยาว T2',
  'กล่องยาว T3',
  'กล่องยาว T4',
  'กล่องยาว T5',
];

function formatNumber(value: number | null | undefined) {
  const num = Number(value || 0);
  return Number.isInteger(num) ? `${num}` : `${num}`;
}

function formatBoxSize(box: any) {
  if (
    Number(box.length_cm || 0) === 0 &&
    Number(box.width_cm || 0) === 0 &&
    Number(box.height_cm || 0) === 0
  ) {
    return '';
  }

  return `${formatNumber(box.length_cm)}*${formatNumber(box.width_cm)}*${formatNumber(
    box.height_cm
  )} cm.`;
}

function formatBubbleLength(bubble: Bubble) {
  return `${formatNumber(bubble.length_cm)}`;
}

function getNextMasterId(masters: ProductMaster[]) {
  const nums = masters
    .map((m) => Number(String(m.id).replace(/^M/i, '')))
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `M${String(next).padStart(4, '0')}`;
}

function getPromoSuffixFromId(id: string) {
  const match = String(id).match(/-(\d+)$/);
  return match ? Number(match[1]) : 1;
}

function buildPromoId(masterId: string, suffix: number) {
  const masterNum = masterId.replace(/^M/i, '').padStart(4, '0');
  return `P${masterNum}-${suffix}`;
}

function getNextPromoId(promos: ProductPromoRow[], masterId: string) {
  const masterNum = masterId.replace(/^M/i, '').padStart(4, '0');
  const matched = promos
    .filter((p) => String(p.id).startsWith(`P${masterNum}-`))
    .map((p) => {
      const m = String(p.id).match(/-(\d+)$/);
      return m ? Number(m[1]) : 0;
    })
    .filter((n) => !Number.isNaN(n));

  const next = (matched.length ? Math.max(...matched) : 0) + 1;
  return `P${masterNum}-${next}`;
}

function extractQty(promoName: string): number {
  const tamMatch = promoName.match(/(\d+)\s*แถม\s*(\d+)/);
  if (tamMatch) return parseInt(tamMatch[1]) + parseInt(tamMatch[2]);
  const unitMatch = promoName.match(/\(?\s*(\d+)\s*(?:กระป๋อง|ชิ้น|แพ็ค|ซอง|กล่อง|ขวด|ถุง|อัน)/i);
  if (unitMatch) return parseInt(unitMatch[1]);
  const firstNum = promoName.match(/(\d+)/);
  if (firstNum) return parseInt(firstNum[1]);
  return 1;
}

export default function Products() {
  const [masters, setMasters] = useState<ProductMaster[]>([]);
  const [promos, setPromos] = useState<ProductPromoRow[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMasterForm, setShowMasterForm] = useState(false);
  const [showPromoForm, setShowPromoForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [editingMaster, setEditingMaster] = useState<ProductMaster | null>(null);
  const [editingPromo, setEditingPromo] = useState<ProductPromoRow | null>(null);

  const [masterForm, setMasterForm] = useState<MasterFormState>(emptyMasterForm);
  const [promoForm, setPromoForm] = useState<PromoFormState>(emptyPromoForm);

  // Bulk add state
  const [bulkMasterId, setBulkMasterId] = useState('');
  type BulkRow = { name: string; short_name: string; price_thb: number; box_id: string; bubble_id: string; item_type: string };
  const emptyBulkRow: BulkRow = { name: '', short_name: '', price_thb: 0, box_id: '', bubble_id: '', item_type: 'พัสดุ' };
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([{ ...emptyBulkRow }]);
  const [bulkSaving, setBulkSaving] = useState(false);
  // Toast notification
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [mastersRes, promosRes, boxesRes, bubblesRes] = await Promise.all([
        supabase.from('products_master').select('*').order('id', { ascending: true }),
        supabase
          .from('products_promo')
          .select('*, boxes(*), bubbles(*)')
          .order('id', { ascending: true }),
        supabase.from('boxes').select('*'),
        supabase.from('bubbles').select('*'),
      ]);

      if (mastersRes.error) throw mastersRes.error;
      if (promosRes.error) throw promosRes.error;
      if (boxesRes.error) throw boxesRes.error;
      if (bubblesRes.error) throw bubblesRes.error;

      setMasters((mastersRes.data || []) as ProductMaster[]);
      setPromos((promosRes.data || []) as ProductPromoRow[]);
      setBoxes((boxesRes.data || []) as Box[]);
      setBubbles((bubblesRes.data || []) as Bubble[]);
    } catch (error) {
      console.error('Error loading products:', error);
      alert('โหลดข้อมูลสินค้าไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const sortedBoxes = useMemo(() => {
    const orderMap = new Map(BOX_ORDER.map((name, index) => [name, index]));

    return [...boxes].sort((a, b) => {
      const aName = String(a.name || '');
      const bName = String(b.name || '');
      const aKey = orderMap.has(aName) ? orderMap.get(aName)! : 9999;
      const bKey = orderMap.has(bName) ? orderMap.get(bName)! : 9999;

      if (aKey !== bKey) return aKey - bKey;
      return aName.localeCompare(bName, 'th');
    });
  }, [boxes]);

  const sortedBubbles = useMemo(() => {
    return [...bubbles].sort((a, b) => {
      const diff = Number(a.length_cm || 0) - Number(b.length_cm || 0);
      if (diff !== 0) return diff;
      return String(a.name || '').localeCompare(String(b.name || ''), 'th');
    });
  }, [bubbles]);

  const openAddMasterForm = () => {
    setEditingMaster(null);
    setMasterForm({
      ...emptyMasterForm,
      id: getNextMasterId(masters),
    });
    setShowMasterForm(true);
  };

  const openAddPromoForm = () => {
    setEditingPromo(null);
    setPromoForm(emptyPromoForm);
    setShowPromoForm(true);
  };

  const saveMaster = async () => {
    try {
      if (!masterForm.id.trim() || !masterForm.name.trim()) {
        alert('กรุณากรอก รหัส M และชื่อสินค้า');
        return;
      }

      if (editingMaster) {
        const { error } = await supabase
          .from('products_master')
          .update({
            name: masterForm.name.trim(),
            cost_thb: Number(masterForm.cost_thb) || 0,
            weight_g: Number(masterForm.weight_g) || 0,
          })
          .eq('id', editingMaster.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('products_master').insert([
          {
            id: masterForm.id.trim(),
            name: masterForm.name.trim(),
            cost_thb: Number(masterForm.cost_thb) || 0,
            weight_g: Number(masterForm.weight_g) || 0,
          },
        ]);

        if (error) throw error;
      }

      setShowMasterForm(false);
      setEditingMaster(null);
      setMasterForm(emptyMasterForm);
      await loadData();
    } catch (error) {
      console.error('Error saving master:', error);
      alert('เกิดข้อผิดพลาดในการบันทึก Master');
    }
  };

  const savePromo = async () => {
    try {
      if (!promoForm.master_id) {
        alert('กรุณาเลือก Master Product');
        return;
      }

      if (!promoForm.id.trim() || !promoForm.name.trim()) {
        alert('กรุณากรอก รหัส P และชื่อโปรโมชัน');
        return;
      }

      if (!promoForm.box_id) {
        alert('กรุณาเลือกกล่องพัสดุ');
        return;
      }

      if (!promoForm.bubble_id) {
        alert('กรุณาเลือกบั้บเบิ้ล');
        return;
      }

      const payload = {
        id: promoForm.id.trim(),
        master_id: promoForm.master_id,
        name: promoForm.name.trim(),
        short_name: promoForm.short_name.trim() || null,
        price_thb: Number(promoForm.price_thb) || 0,
        box_id: promoForm.box_id || null,
        bubble_id: promoForm.bubble_id || null,
        color: promoForm.color.trim() || 'ไม่มี',
        item_type: promoForm.item_type || 'อื่นๆ',
      };

      if (editingPromo) {
        const oldId = editingPromo.id;
        const newId = payload.id;

        if (oldId === newId) {
          const { error } = await supabase
            .from('products_promo')
            .update(payload)
            .eq('id', oldId);

          if (error) throw error;
        } else {
          const { error: insertError } = await supabase
            .from('products_promo')
            .insert([payload]);
          if (insertError) throw insertError;

          const { error: mappingError } = await supabase
            .from('product_mappings')
            .update({ promo_id: newId })
            .eq('promo_id', oldId);
          if (mappingError) throw mappingError;

          const { error: deleteOldError } = await supabase
            .from('products_promo')
            .delete()
            .eq('id', oldId);
          if (deleteOldError) throw deleteOldError;
        }
      } else {
        const { error } = await supabase.from('products_promo').insert([payload]);
        if (error) throw error;
      }

      setShowPromoForm(false);
      setEditingPromo(null);
      setPromoForm(emptyPromoForm);
      await loadData();
    } catch (error) {
      console.error('Error saving promo:', error);
      alert('เกิดข้อผิดพลาดในการบันทึก Promo');
    }
  };

  // ── Bulk Save ──
  const saveBulkPromos = async () => {
    if (!bulkMasterId) { showToast('กรุณาเลือก Master Product', 'error'); return; }
    const validRows = bulkRows.filter(r => r.name.trim() && r.price_thb > 0 && r.box_id && r.bubble_id);
    if (validRows.length === 0) { showToast('กรุณากรอกข้อมูลอย่างน้อย 1 แถวให้ครบ', 'error'); return; }
    setBulkSaving(true);
    try {
      // ดึง promos ล่าสุดเพื่อนับ suffix
      const { data: latestPromos } = await supabase.from('products_promo').select('id').order('id', { ascending: true });
      const currentPromos = (latestPromos || []) as { id: string }[];
      let insertCount = 0;
      for (const row of validRows) {
        const nextId = getNextPromoId([...promos, ...currentPromos.map(p => ({ ...p, master_id: '', name: '', short_name: null, price_thb: 0, box_id: null, bubble_id: null, color: null, item_type: null, active: true, boxes: null, bubbles: null }))], bulkMasterId);
        // re-fetch each iteration to avoid duplicate id
        const { data: freshPromos } = await supabase.from('products_promo').select('id').eq('master_id', bulkMasterId);
        const freshId = getNextPromoId((freshPromos || []).map((p: any) => ({ ...p, master_id: bulkMasterId, name: '', short_name: null, price_thb: 0, box_id: null, bubble_id: null, color: null, item_type: null, active: true, boxes: null, bubbles: null })), bulkMasterId);
        const { error } = await supabase.from('products_promo').insert([{
          id: freshId,
          master_id: bulkMasterId,
          name: row.name.trim(),
          short_name: row.short_name.trim() || null,
          price_thb: Number(row.price_thb) || 0,
          box_id: row.box_id || null,
          bubble_id: row.bubble_id || null,
          color: 'ไม่มี',
          item_type: row.item_type || 'พัสดุ',
        }]);
        if (error) { console.error('insert error:', error); } else { insertCount++; }
      }
      showToast(`✓ บันทึกสำเร็จ ${insertCount} โปร`);
      setShowBulkForm(false);
      setBulkMasterId('');
      setBulkRows([{ ...emptyBulkRow }]);
      await loadData();
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
    } finally {
      setBulkSaving(false);
    }
  };

  const deleteMaster = async (id: string) => {
    const hasPromos = promos.some((p) => p.master_id === id);
    if (hasPromos) {
      alert('ไม่สามารถลบ M ได้ เนื่องจากยังมี P ที่ผูกอยู่');
      return;
    }
    if (!confirm('ยืนยันการลบ?')) return;

    try {
      const { error } = await supabase.from('products_master').delete().eq('id', id);
      if (error) throw error;
      await loadData();
    } catch (error) {
      console.error('Error deleting master:', error);
      alert('ลบ Master ไม่สำเร็จ');
    }
  };

  const deletePromo = async (id: string) => {
    if (!confirm('ยืนยันการลบ?')) return;

    try {
      const { error: mappingDeleteError } = await supabase
        .from('product_mappings')
        .delete()
        .eq('promo_id', id);

      if (mappingDeleteError) throw mappingDeleteError;

      const { error: promoDeleteError } = await supabase
        .from('products_promo')
        .delete()
        .eq('id', id);

      if (promoDeleteError) throw promoDeleteError;

      await loadData();
    } catch (error) {
      console.error('Error deleting promo:', error);
      alert('ลบ Promo ไม่สำเร็จ');
    }
  };

  if (loading) return <div className="p-6">กำลังโหลด...</div>;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800 mb-4">จัดการสินค้า</h2>
        <div className="flex gap-3">
          <button
            onClick={openAddMasterForm}
            className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 flex items-center gap-2"
          >
            <Plus size={20} /> เพิ่ม Master (M)
          </button>
          <button
            onClick={openAddPromoForm}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2"
          >
            <Plus size={20} /> เพิ่ม Promo (P)
          </button>
          <button
            onClick={() => { setShowBulkForm(true); setBulkMasterId(''); setBulkRows([{ ...emptyBulkRow }]); }}
            className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 flex items-center gap-2"
          >
            <Plus size={20} /> เพิ่มหลายโปรพร้อมกัน
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-bold mb-4 text-cyan-600">Master Products (M)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left">รหัส</th>
                  <th className="p-2 text-left">ชื่อ</th>
                  <th className="p-2 text-right">ต้นทุน</th>
                  <th className="p-2 text-right">น้ำหนัก (g)</th>
                  <th className="p-2 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {masters.map((m) => (
                  <tr key={m.id} className="border-b hover:bg-slate-50">
                    <td className="p-2">{m.id}</td>
                    <td className="p-2">{m.name}</td>
                    <td className="p-2 text-right">{Number(m.cost_thb).toLocaleString()}</td>
                    <td className="p-2 text-right">{m.weight_g}</td>
                    <td className="p-2 text-center">
                      <button
                        onClick={() => {
                          setEditingMaster(m);
                          setMasterForm({
                            id: m.id,
                            name: m.name,
                            cost_thb: Number(m.cost_thb) || 0,
                            weight_g: Number(m.weight_g) || 0,
                          });
                          setShowMasterForm(true);
                        }}
                        className="text-blue-600 hover:text-blue-800 mr-2"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => deleteMaster(m.id)} className="text-red-600 hover:text-red-800">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-bold mb-4 text-green-600">Promo Products (P)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left">รหัส</th>
                  <th className="p-2 text-left">ชื่อโปร</th>
                  <th className="p-2 text-left">ชื่อสั้น</th>
                  <th className="p-2 text-center">จำนวน</th>
                  <th className="p-2 text-right">ราคา</th>
                  <th className="p-2 text-left">กล่อง</th>
                  <th className="p-2 text-left">บั้บเบิ้ล</th>
                  <th className="p-2 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {promos.map((p) => (
                  <tr key={p.id} className="border-b hover:bg-slate-50">
                    <td className="p-2">{p.id}</td>
                    <td className="p-2">{p.name}</td>
                    <td className="p-2">{p.short_name}</td>
                    <td className="p-2 text-center">
                      <span className="px-2 py-0.5 bg-slate-100 rounded-full text-xs font-bold text-slate-700">
                        {extractQty(p.name)}
                      </span>
                    </td>
                    <td className="p-2 text-right">{Number(p.price_thb).toLocaleString()}</td>
                    <td className="p-2">{p.boxes?.name || '-'}</td>
                    <td className="p-2">{p.bubbles?.name || '-'}</td>
                    <td className="p-2 text-center">
                      <button
                        onClick={() => {
                          setEditingPromo(p);
                          setPromoForm({
                            id: p.id,
                            master_id: p.master_id,
                            name: p.name,
                            short_name: p.short_name || '',
                            price_thb: Number(p.price_thb) || 0,
                            box_id: p.box_id || '',
                            bubble_id: p.bubble_id || '',
                            color: p.color || '',
                            item_type: p.item_type || 'อื่นๆ',
                          });
                          setShowPromoForm(true);
                        }}
                        className="text-blue-600 hover:text-blue-800 mr-2"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => deletePromo(p.id)} className="text-red-600 hover:text-red-800">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showMasterForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">{editingMaster ? 'แก้ไข' : 'เพิ่ม'} Master Product</h3>
              <button
                onClick={() => {
                  setShowMasterForm(false);
                  setEditingMaster(null);
                  setMasterForm(emptyMasterForm);
                }}
                className="text-slate-500 hover:text-slate-700"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">รหัส M</label>
                <input
                  type="text"
                  value={masterForm.id}
                  onChange={(e) => setMasterForm({ ...masterForm, id: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  disabled={!!editingMaster}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">ชื่อสินค้า</label>
                <input
                  type="text"
                  value={masterForm.name}
                  onChange={(e) => setMasterForm({ ...masterForm, name: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">ต้นทุน (THB)</label>
                <input
                  type="number"
                  value={masterForm.cost_thb}
                  onChange={(e) => setMasterForm({ ...masterForm, cost_thb: Number(e.target.value) })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">น้ำหนัก (กรัม)</label>
                <input
                  type="number"
                  value={masterForm.weight_g}
                  onChange={(e) => setMasterForm({ ...masterForm, weight_g: Number(e.target.value) })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <button onClick={saveMaster} className="w-full bg-cyan-500 text-white py-2 rounded hover:bg-cyan-600">
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {showPromoForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">{editingPromo ? 'แก้ไข' : 'เพิ่ม'} Promo Product</h3>
              <button
                onClick={() => {
                  setShowPromoForm(false);
                  setEditingPromo(null);
                  setPromoForm(emptyPromoForm);
                }}
                className="text-slate-500 hover:text-slate-700"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Master Product</label>
                <select
                  value={promoForm.master_id}
                  onChange={(e) => {
                    const masterId = e.target.value;

                    let nextId = '';
                    if (masterId) {
                      if (editingPromo) {
                        const suffix = getPromoSuffixFromId(promoForm.id || editingPromo.id);
                        nextId = buildPromoId(masterId, suffix);
                      } else {
                        nextId = getNextPromoId(promos, masterId);
                      }
                    }

                    setPromoForm({
                      ...promoForm,
                      master_id: masterId,
                      id: nextId,
                    });
                  }}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">เลือก Master</option>
                  {masters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} - {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">รหัส P</label>
                <input
                  type="text"
                  value={promoForm.id}
                  onChange={(e) => setPromoForm({ ...promoForm, id: e.target.value })}
                  className="w-full border rounded px-3 py-2 bg-slate-100"
                  readOnly
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">ชื่อโปรโมชัน</label>
                <input
                  type="text"
                  value={promoForm.name}
                  onChange={(e) => setPromoForm({ ...promoForm, name: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="เช่น นมถั่วสุขภาพ 3 กระป๋อง / 1 แถม 1"
                />
                {/* แสดงจำนวนที่ตรวจพบ real-time */}
                {promoForm.name && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-xs text-slate-500">จำนวนที่ตรวจพบ:</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      extractQty(promoForm.name) > 1
                        ? 'bg-cyan-100 text-cyan-700'
                        : 'bg-orange-100 text-orange-600'
                    }`}>
                      {extractQty(promoForm.name)} ชิ้น
                    </span>
                    <span className="text-xs text-slate-400">
                      {extractQty(promoForm.name) === 1
                        ? '— ตรวจไม่พบจำนวน ลองเพิ่ม เช่น "3 กระป๋อง" หรือ "1 แถม 1"'
                        : '✓ ถูกต้อง'}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">ชื่อสั้น (ไม่มีวงเล็บ)</label>
                <input
                  type="text"
                  value={promoForm.short_name}
                  onChange={(e) => setPromoForm({ ...promoForm, short_name: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">ราคาขาย (THB)</label>
                <input
                  type="number"
                  value={promoForm.price_thb}
                  onChange={(e) => setPromoForm({ ...promoForm, price_thb: Number(e.target.value) })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">กล่องพัสดุ</label>
                <select
                  value={promoForm.box_id}
                  onChange={(e) => setPromoForm({ ...promoForm, box_id: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">เลือกกล่องพัสดุ</option>
                  {sortedBoxes.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {formatBoxSize(b) ? ` - ${formatBoxSize(b)}` : ''}
                      {` - ${Number(b.price_thb || 0).toFixed(2)}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">บั้บเบิ้ล</label>
                <select
                  value={promoForm.bubble_id}
                  onChange={(e) => setPromoForm({ ...promoForm, bubble_id: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">เลือกบั้บเบิ้ล</option>
                  {sortedBubbles.map((b) => (
                    <option key={b.id} value={b.id}>
                      ยาว {formatBubbleLength(b)} - {Number(b.price_thb || 0).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">สี</label>
                <input
                  type="text"
                  value={promoForm.color}
                  onChange={(e) => setPromoForm({ ...promoForm, color: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="เช่น แดง, น้ำเงิน"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">ประเภทสินค้า</label>
                <select
                  value={promoForm.item_type}
                  onChange={(e) => setPromoForm({ ...promoForm, item_type: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option>อื่นๆ</option>
                  <option>เอกสาร</option>
                  <option>พัสดุ</option>
                  <option>อาหารแห้ง</option>
                  <option>ของใช้</option>
                  <option>อุปกรณ์ไอที</option>
                  <option>เสื้อผ้า</option>
                  <option>สินค้าแบรนด์</option>
                  <option>อะไหล่รถยนต์</option>
                  <option>รองเท้า-กระเป๋า</option>
                  <option>เครื่องสำอาง</option>
                  <option>เฟอร์นิเจอร์</option>
                </select>
              </div>

              <button onClick={savePromo} className="w-full bg-green-500 text-white py-2 rounded hover:bg-green-600">
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ======== Modal: เพิ่มหลายโปรพร้อมกัน ======== */}
      {showBulkForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-5xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">เพิ่มหลายโปรพร้อมกัน</h3>
                <p className="text-sm text-slate-500 mt-0.5">เลือก Master ครั้งเดียว แล้วกรอกโปรได้หลายแถว</p>
              </div>
              <button onClick={() => setShowBulkForm(false)} className="text-slate-400 hover:text-slate-600"><X size={22}/></button>
            </div>

            {/* เลือก Master */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Master Product <span className="text-red-500">*</span></label>
              <select value={bulkMasterId} onChange={e => setBulkMasterId(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-purple-300">
                <option value="">เลือก Master</option>
                {masters.map(m => <option key={m.id} value={m.id}>{m.id} — {m.name}</option>)}
              </select>
            </div>

            {/* ตาราง bulk */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="p-2 text-left font-medium text-slate-600 w-8">#</th>
                    <th className="p-2 text-left font-medium text-slate-600 min-w-[200px]">ชื่อโปรโมชัน <span className="text-red-400">*</span></th>
                    <th className="p-2 text-left font-medium text-slate-600 min-w-[140px]">ชื่อสั้น</th>
                    <th className="p-2 text-right font-medium text-slate-600 w-28">ราคา (฿) <span className="text-red-400">*</span></th>
                    <th className="p-2 text-left font-medium text-slate-600 min-w-[160px]">กล่อง <span className="text-red-400">*</span></th>
                    <th className="p-2 text-left font-medium text-slate-600 min-w-[130px]">บั้บเบิ้ล <span className="text-red-400">*</span></th>
                    <th className="p-2 text-left font-medium text-slate-600 min-w-[120px]">ประเภท</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {bulkRows.map((row, i) => (
                    <tr key={i} className="border-b hover:bg-slate-50">
                      <td className="p-2 text-slate-400 text-xs text-center">{i + 1}</td>
                      {/* ชื่อโปร */}
                      <td className="p-2">
                        <input type="text" value={row.name}
                          onChange={e => { const r = [...bulkRows]; r[i] = { ...r[i], name: e.target.value }; setBulkRows(r); }}
                          placeholder="เช่น นมถั่ว 3 กระป๋อง"
                          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-300"/>
                        {row.name && (
                          <span className={`text-xs mt-0.5 ${extractQty(row.name) > 1 ? 'text-cyan-600' : 'text-orange-400'}`}>
                            จำนวน: {extractQty(row.name)} ชิ้น
                          </span>
                        )}
                      </td>
                      {/* ชื่อสั้น */}
                      <td className="p-2">
                        <input type="text" value={row.short_name}
                          onChange={e => { const r = [...bulkRows]; r[i] = { ...r[i], short_name: e.target.value }; setBulkRows(r); }}
                          placeholder="ชื่อสั้น"
                          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-300"/>
                      </td>
                      {/* ราคา */}
                      <td className="p-2">
                        <input type="number" value={row.price_thb || ''}
                          onChange={e => { const r = [...bulkRows]; r[i] = { ...r[i], price_thb: Number(e.target.value) }; setBulkRows(r); }}
                          placeholder="0"
                          className="w-full border rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-purple-300"/>
                      </td>
                      {/* กล่อง */}
                      <td className="p-2">
                        <select value={row.box_id}
                          onChange={e => { const r = [...bulkRows]; r[i] = { ...r[i], box_id: e.target.value }; setBulkRows(r); }}
                          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-300">
                          <option value="">เลือกกล่อง</option>
                          {sortedBoxes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </td>
                      {/* บั้บเบิ้ล */}
                      <td className="p-2">
                        <select value={row.bubble_id}
                          onChange={e => { const r = [...bulkRows]; r[i] = { ...r[i], bubble_id: e.target.value }; setBulkRows(r); }}
                          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-300">
                          <option value="">เลือกบั้บเบิ้ล</option>
                          {sortedBubbles.map(b => <option key={b.id} value={b.id}>ยาว {formatBubbleLength(b)}</option>)}
                        </select>
                      </td>
                      {/* ประเภท */}
                      <td className="p-2">
                        <select value={row.item_type}
                          onChange={e => { const r = [...bulkRows]; r[i] = { ...r[i], item_type: e.target.value }; setBulkRows(r); }}
                          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-300">
                          {['พัสดุ','อาหารแห้ง','ของใช้','เครื่องสำอาง','เสื้อผ้า','อุปกรณ์ไอที','อื่นๆ'].map(t => <option key={t}>{t}</option>)}
                        </select>
                      </td>
                      {/* ลบแถว */}
                      <td className="p-2 text-center">
                        {bulkRows.length > 1 && (
                          <button onClick={() => setBulkRows(bulkRows.filter((_, idx) => idx !== i))}
                            className="text-red-400 hover:text-red-600">
                            <X size={16}/>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="mt-4 pt-4 border-t flex items-center justify-between">
              <button
                onClick={() => setBulkRows([...bulkRows, { ...emptyBulkRow }])}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-600 flex items-center gap-2">
                <Plus size={15}/> เพิ่มแถว
              </button>
              <div className="flex gap-3">
                <span className="text-sm text-slate-400 self-center">{bulkRows.filter(r => r.name && r.price_thb > 0 && r.box_id && r.bubble_id).length} แถวพร้อมบันทึก</span>
                <button onClick={() => setShowBulkForm(false)} className="px-4 py-2 bg-slate-200 rounded-lg text-sm hover:bg-slate-300">ยกเลิก</button>
                <button onClick={saveBulkPromos} disabled={bulkSaving || !bulkMasterId}
                  className="px-5 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-40 font-medium text-sm">
                  {bulkSaving ? 'กำลังบันทึก...' : `บันทึก ${bulkRows.filter(r => r.name && r.price_thb > 0 && r.box_id && r.bubble_id).length} โปร`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ======== Toast Notification ======== */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        }`}>
          <span>{toast.type === 'success' ? '✓' : '✕'}</span>
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
