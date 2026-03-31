import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

type BoxItem = {
  id: string;
  name: string;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  price_thb: number;
  created_at?: string;
};

type BubbleItem = {
  id: string;
  name: string;
  length_cm: number;
  width_cm: number;
  price_thb: number;
  active?: boolean;
  created_at?: string;
};

const emptyBoxForm: BoxItem = {
  id: '',
  name: '',
  length_cm: 0,
  width_cm: 0,
  height_cm: 0,
  price_thb: 0,
};

const emptyBubbleForm: BubbleItem = {
  id: '',
  name: '',
  length_cm: 0,
  width_cm: 65,
  price_thb: 0,
  active: true,
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

function formatBoxSize(box: BoxItem) {
  if (
    Number(box.length_cm) === 0 &&
    Number(box.width_cm) === 0 &&
    Number(box.height_cm) === 0
  ) {
    return '';
  }

  return `${formatNumber(box.length_cm)}*${formatNumber(box.width_cm)}*${formatNumber(
    box.height_cm
  )} cm.`;
}

function getNextBoxId(boxes: BoxItem[]) {
  const nums = boxes
    .map((b) => {
      const match = String(b.id).match(/^BOX(\d+)$/i);
      return match ? Number(match[1]) : NaN;
    })
    .filter((n) => !Number.isNaN(n));

  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `BOX${String(next).padStart(3, '0')}`;
}

function getNextBubbleId(bubbles: BubbleItem[]) {
  const nums = bubbles
    .map((b) => {
      const match = String(b.id).match(/^B(\d+)$/i);
      return match ? Number(match[1]) : NaN;
    })
    .filter((n) => !Number.isNaN(n));

  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `B${String(next).padStart(3, '0')}`;
}

function getBubbleAutoName(lengthCm: number) {
  return `บั้บเบิ้ล 65 CM - ยาว ${formatNumber(lengthCm)}`;
}

export default function Packaging() {
  const [boxes, setBoxes] = useState<BoxItem[]>([]);
  const [bubbles, setBubbles] = useState<BubbleItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [showBoxForm, setShowBoxForm] = useState(false);
  const [showBubbleForm, setShowBubbleForm] = useState(false);

  const [editingBox, setEditingBox] = useState<BoxItem | null>(null);
  const [editingBubble, setEditingBubble] = useState<BubbleItem | null>(null);

  const [boxForm, setBoxForm] = useState<BoxItem>(emptyBoxForm);
  const [bubbleForm, setBubbleForm] = useState<BubbleItem>(emptyBubbleForm);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [boxesRes, bubblesRes] = await Promise.all([
        supabase.from('boxes').select('*'),
        supabase.from('bubbles').select('*'),
      ]);

      if (boxesRes.error) throw boxesRes.error;
      if (bubblesRes.error) throw bubblesRes.error;

      setBoxes((boxesRes.data || []) as BoxItem[]);
      setBubbles((bubblesRes.data || []) as BubbleItem[]);
    } catch (error) {
      console.error('Error loading packaging data:', error);
      alert('โหลดข้อมูลวัสดุแพ็กสินค้าไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const sortedBoxes = useMemo(() => {
    const orderMap = new Map(BOX_ORDER.map((name, index) => [name, index]));

    return [...boxes].sort((a, b) => {
      const aKey = orderMap.has(a.name) ? orderMap.get(a.name)! : 9999;
      const bKey = orderMap.has(b.name) ? orderMap.get(b.name)! : 9999;

      if (aKey !== bKey) return aKey - bKey;
      return a.name.localeCompare(b.name, 'th');
    });
  }, [boxes]);

  const sortedBubbles = useMemo(() => {
    return [...bubbles].sort((a, b) => {
      const diff = Number(a.length_cm || 0) - Number(b.length_cm || 0);
      if (diff !== 0) return diff;
      return String(a.name || '').localeCompare(String(b.name || ''), 'th');
    });
  }, [bubbles]);

  const resetBoxForm = () => {
    setEditingBox(null);
    setBoxForm(emptyBoxForm);
    setShowBoxForm(false);
  };

  const resetBubbleForm = () => {
    setEditingBubble(null);
    setBubbleForm(emptyBubbleForm);
    setShowBubbleForm(false);
  };

  const openAddBoxForm = () => {
    setEditingBox(null);
    setBoxForm({
      ...emptyBoxForm,
      id: getNextBoxId(boxes),
    });
    setShowBoxForm(true);
  };

  const openAddBubbleForm = () => {
    const nextId = getNextBubbleId(bubbles);
    const defaultLength = 0;

    setEditingBubble(null);
    setBubbleForm({
      ...emptyBubbleForm,
      id: nextId,
      length_cm: defaultLength,
      name: getBubbleAutoName(defaultLength),
    });
    setShowBubbleForm(true);
  };

  const saveBox = async () => {
    try {
      if (!boxForm.id.trim()) {
        alert('ไม่พบรหัสกล่อง');
        return;
      }

      if (!boxForm.name.trim()) {
        alert('กรุณากรอกชื่อกล่อง');
        return;
      }

      const payload = {
        id: boxForm.id.trim(),
        name: boxForm.name.trim(),
        length_cm: Number(boxForm.length_cm) || 0,
        width_cm: Number(boxForm.width_cm) || 0,
        height_cm: Number(boxForm.height_cm) || 0,
        price_thb: Number(boxForm.price_thb) || 0,
      };

      if (editingBox) {
        const { error } = await supabase.from('boxes').update(payload).eq('id', editingBox.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('boxes').insert([payload]);
        if (error) throw error;
      }

      await loadData();
      resetBoxForm();
    } catch (error: any) {
      console.error('Error saving box:', error);
      alert(error?.message || 'บันทึกกล่องพัสดุไม่สำเร็จ');
    }
  };

  const saveBubble = async () => {
    try {
      if (!bubbleForm.id.trim()) {
        alert('ไม่พบรหัสบั้บเบิ้ล');
        return;
      }

      const autoName = getBubbleAutoName(Number(bubbleForm.length_cm) || 0);

      const payload = {
        id: bubbleForm.id.trim(),
        name: autoName,
        length_cm: Number(bubbleForm.length_cm) || 0,
        width_cm: 65,
        price_thb: Number(bubbleForm.price_thb) || 0,
        active: true,
      };

      if (editingBubble) {
        const { error } = await supabase.from('bubbles').update(payload).eq('id', editingBubble.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('bubbles').insert([payload]);
        if (error) throw error;
      }

      await loadData();
      resetBubbleForm();
    } catch (error: any) {
      console.error('Error saving bubble:', error);
      alert(error?.message || 'บันทึกบั้บเบิ้ลไม่สำเร็จ');
    }
  };

  const deleteBox = async (id: string) => {
    if (!confirm('ยืนยันการลบกล่องพัสดุ?')) return;

    try {
      const { error } = await supabase.from('boxes').delete().eq('id', id);
      if (error) throw error;
      await loadData();
    } catch (error: any) {
      console.error('Error deleting box:', error);
      alert(error?.message || 'ลบกล่องไม่สำเร็จ อาจมีสินค้าใช้งานกล่องนี้อยู่');
    }
  };

  const deleteBubble = async (id: string) => {
    if (!confirm('ยืนยันการลบบั้บเบิ้ล?')) return;

    try {
      const { error } = await supabase.from('bubbles').delete().eq('id', id);
      if (error) throw error;
      await loadData();
    } catch (error: any) {
      console.error('Error deleting bubble:', error);
      alert(error?.message || 'ลบบั้บเบิ้ลไม่สำเร็จ อาจมีสินค้าใช้งานบั้บเบิ้ลนี้อยู่');
    }
  };

  if (loading) {
    return <div className="p-6">กำลังโหลด...</div>;
  }

  return (
    <div className="p-6 space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">วัสดุแพ็กสินค้า</h2>
          <p className="text-sm text-slate-500 mt-1">จัดการกล่องพัสดุและบั้บเบิ้ลจากหน้าเว็บได้เลย</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={openAddBoxForm}
            className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 flex items-center gap-2"
          >
            <Plus size={18} />
            เพิ่มกล่องพัสดุ
          </button>

          <button
            onClick={openAddBubbleForm}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2"
          >
            <Plus size={18} />
            เพิ่มบั้บเบิ้ล
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <h3 className="text-lg font-bold text-slate-800 mb-4">ตารางขนาดกล่อง (BoxData)</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 text-left">รหัสกล่อง</th>
                <th className="p-2 text-left">ขนาดกล่อง</th>
                <th className="p-2 text-right">ราคา</th>
                <th className="p-2 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {sortedBoxes.map((box) => (
                <tr key={box.id} className="border-b hover:bg-slate-50">
                  <td className="p-2">{box.name}</td>
                  <td className="p-2">{formatBoxSize(box)}</td>
                  <td className="p-2 text-right">{Number(box.price_thb).toFixed(2)}</td>
                  <td className="p-2 text-center">
                    <button
                      onClick={() => {
                        setEditingBox(box);
                        setBoxForm(box);
                        setShowBoxForm(true);
                      }}
                      className="text-blue-600 hover:text-blue-800 mr-2"
                      title="แก้ไข"
                    >
                      <Edit2 size={16} />
                    </button>

                    <button
                      onClick={() => deleteBox(box.id)}
                      className="text-red-600 hover:text-red-800"
                      title="ลบ"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}

              {sortedBoxes.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-slate-500">
                    ยังไม่มีข้อมูลกล่องพัสดุ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <h3 className="text-lg font-bold text-slate-800 mb-1">บับเบิล 65 CM 250 บาท</h3>
        <p className="text-sm text-slate-500 mb-4">แสดงความยาวและราคาตามลำดับ 0 ถึง 30</p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 text-left">ความยาว</th>
                <th className="p-2 text-right">ราคา</th>
                <th className="p-2 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {sortedBubbles.map((bubble) => (
                <tr key={bubble.id} className="border-b hover:bg-slate-50">
                  <td className="p-2">{Number(bubble.length_cm || 0)}</td>
                  <td className="p-2 text-right">{Number(bubble.price_thb).toFixed(2)}</td>
                  <td className="p-2 text-center">
                    <button
                      onClick={() => {
                        setEditingBubble(bubble);
                        setBubbleForm(bubble);
                        setShowBubbleForm(true);
                      }}
                      className="text-blue-600 hover:text-blue-800 mr-2"
                      title="แก้ไข"
                    >
                      <Edit2 size={16} />
                    </button>

                    <button
                      onClick={() => deleteBubble(bubble.id)}
                      className="text-red-600 hover:text-red-800"
                      title="ลบ"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}

              {sortedBubbles.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-slate-500">
                    ยังไม่มีข้อมูลบั้บเบิ้ล
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showBoxForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">{editingBox ? 'แก้ไขกล่องพัสดุ' : 'เพิ่มกล่องพัสดุ'}</h3>
              <button
                onClick={resetBoxForm}
                className="text-slate-500 hover:text-slate-700"
              >
                <X size={22} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">รหัสกล่อง</label>
                <input
                  type="text"
                  value={boxForm.id}
                  className="w-full border rounded px-3 py-2 bg-slate-100 text-slate-600"
                  disabled
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">ชื่อกล่อง</label>
                <input
                  type="text"
                  value={boxForm.name}
                  onChange={(e) => setBoxForm({ ...boxForm, name: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="เช่น กล่อง A"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">ยาว</label>
                  <input
                    type="number"
                    step="0.01"
                    value={boxForm.length_cm}
                    onChange={(e) => setBoxForm({ ...boxForm, length_cm: Number(e.target.value) })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">กว้าง</label>
                  <input
                    type="number"
                    step="0.01"
                    value={boxForm.width_cm}
                    onChange={(e) => setBoxForm({ ...boxForm, width_cm: Number(e.target.value) })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">สูง</label>
                  <input
                    type="number"
                    step="0.01"
                    value={boxForm.height_cm}
                    onChange={(e) => setBoxForm({ ...boxForm, height_cm: Number(e.target.value) })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">ราคา</label>
                <input
                  type="number"
                  step="0.01"
                  value={boxForm.price_thb}
                  onChange={(e) => setBoxForm({ ...boxForm, price_thb: Number(e.target.value) })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <button
                onClick={saveBox}
                className="w-full bg-cyan-500 text-white py-2 rounded hover:bg-cyan-600"
              >
                บันทึกกล่องพัสดุ
              </button>
            </div>
          </div>
        </div>
      )}

      {showBubbleForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">{editingBubble ? 'แก้ไขบั้บเบิ้ล' : 'เพิ่มบั้บเบิ้ล'}</h3>
              <button
                onClick={resetBubbleForm}
                className="text-slate-500 hover:text-slate-700"
              >
                <X size={22} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">รหัส</label>
                <input
                  type="text"
                  value={bubbleForm.id}
                  className="w-full border rounded px-3 py-2 bg-slate-100 text-slate-600"
                  disabled
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">ความยาว</label>
                <input
                  type="number"
                  step="0.01"
                  value={bubbleForm.length_cm}
                  onChange={(e) => {
                    const nextLength = Number(e.target.value);
                    setBubbleForm({
                      ...bubbleForm,
                      length_cm: nextLength,
                      name: getBubbleAutoName(nextLength),
                    });
                  }}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">ราคา</label>
                <input
                  type="number"
                  step="0.01"
                  value={bubbleForm.price_thb}
                  onChange={(e) => setBubbleForm({ ...bubbleForm, price_thb: Number(e.target.value) })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <button
                onClick={saveBubble}
                className="w-full bg-green-500 text-white py-2 rounded hover:bg-green-600"
              >
                บันทึกบั้บเบิ้ล
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
