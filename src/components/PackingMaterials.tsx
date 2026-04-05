import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Archive, RefreshCw, Search } from 'lucide-react';

type Box = { id: string; name: string; length_cm: number; width_cm: number; height_cm: number; price_thb: number };
type Bubble = { id: string; name: string; length_cm: number; width_cm: number; price_thb: number; active: boolean };

export default function PackingMaterials() {
  const [boxes, setBoxes]       = useState<Box[]>([]);
  const [bubbles, setBubbles]   = useState<Bubble[]>([]);
  const [loading, setLoading]   = useState(true);
  const [searchBox, setSearchBox]   = useState('');
  const [searchBub, setSearchBub]   = useState('');
  const [activeTab, setActiveTab]   = useState<'boxes'|'bubbles'>('boxes');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [{ data: b }, { data: bub }] = await Promise.all([
      supabase.from('boxes').select('*').order('id'),
      supabase.from('bubbles').select('*').order('id'),
    ]);
    if (b)   setBoxes(b);
    if (bub) setBubbles(bub);
    setLoading(false);
  };

  const filteredBoxes   = boxes.filter(b => !searchBox || b.name.toLowerCase().includes(searchBox.toLowerCase()));
  const filteredBubbles = bubbles.filter(b => !searchBub || b.name.toLowerCase().includes(searchBub.toLowerCase()));

  return (
    <div className="flex flex-col h-screen p-6 pb-2">
      <div className="shrink-0 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center">
            <Archive size={20} className="text-white"/>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">วัสดุแพ็กสินค้า</h2>
            <p className="text-sm text-slate-500">กล่อง {boxes.length} ประเภท · บั้บเบิ้ล {bubbles.filter(b=>b.active).length} ขนาด</p>
          </div>
        </div>
        <button onClick={load} disabled={loading}
          className="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 flex items-center gap-2 text-sm">
          <RefreshCw size={13} className={loading?'animate-spin':''}/> รีเฟรช
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-4 shrink-0">
        <button onClick={() => setActiveTab('boxes')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition ${activeTab==='boxes'?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
          📦 กล่องพัสดุ <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${activeTab==='boxes'?'bg-amber-100 text-amber-700':'bg-slate-200 text-slate-500'}`}>{boxes.length}</span>
        </button>
        <button onClick={() => setActiveTab('bubbles')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition ${activeTab==='bubbles'?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
          🫧 บั้บเบิ้ล <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${activeTab==='bubbles'?'bg-purple-100 text-purple-700':'bg-slate-200 text-slate-500'}`}>{bubbles.filter(b=>b.active).length}</span>
        </button>
      </div>

      {/* ── Tab: กล่องพัสดุ ── */}
      {activeTab === 'boxes' && (
        <>
          <div className="relative mb-3 shrink-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input value={searchBox} onChange={e => setSearchBox(e.target.value)}
              placeholder="ค้นหาชื่อกล่อง..."
              className="w-full pl-8 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"/>
          </div>
          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm w-full" style={{minWidth:'700px'}}>
              <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-left w-10">#</th>
                  <th className="p-3 text-left">รหัส</th>
                  <th className="p-3 text-left">ชื่อกล่อง</th>
                  <th className="p-3 text-center whitespace-nowrap">ยาว (cm)</th>
                  <th className="p-3 text-center whitespace-nowrap">กว้าง (cm)</th>
                  <th className="p-3 text-center whitespace-nowrap">สูง (cm)</th>
                  <th className="p-3 text-right whitespace-nowrap">ราคา/ใบ (฿)</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={7} className="p-8 text-center text-slate-400">กำลังโหลด...</td></tr>}
                {!loading && filteredBoxes.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-400">ไม่พบกล่อง</td></tr>}
                {filteredBoxes.map((b, idx) => (
                  <tr key={b.id} className={`border-b hover:bg-amber-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                    <td className="p-3 text-center text-slate-400 text-xs">{idx+1}</td>
                    <td className="p-3 font-mono text-xs text-slate-500">{b.id}</td>
                    <td className="p-3 font-semibold text-slate-800">{b.name}</td>
                    <td className="p-3 text-center text-slate-600">{Number(b.length_cm) || '-'}</td>
                    <td className="p-3 text-center text-slate-600">{Number(b.width_cm) || '-'}</td>
                    <td className="p-3 text-center text-slate-600">{Number(b.height_cm) || '-'}</td>
                    <td className="p-3 text-right font-bold text-amber-700">
                      {Number(b.price_thb) > 0 ? `฿${Number(b.price_thb).toFixed(2)}` : <span className="text-slate-300">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Tab: บั้บเบิ้ล ── */}
      {activeTab === 'bubbles' && (
        <>
          <div className="relative mb-3 shrink-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input value={searchBub} onChange={e => setSearchBub(e.target.value)}
              placeholder="ค้นหาบั้บเบิ้ล..."
              className="w-full pl-8 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
          </div>
          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm w-full" style={{minWidth:'600px'}}>
              <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-left w-10">#</th>
                  <th className="p-3 text-left">รหัส</th>
                  <th className="p-3 text-left">ชื่อ</th>
                  <th className="p-3 text-center whitespace-nowrap">ความยาว (cm)</th>
                  <th className="p-3 text-center whitespace-nowrap">ความกว้าง (cm)</th>
                  <th className="p-3 text-right whitespace-nowrap">ราคา/แผ่น (฿)</th>
                  <th className="p-3 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={7} className="p-8 text-center text-slate-400">กำลังโหลด...</td></tr>}
                {!loading && filteredBubbles.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-400">ไม่พบบั้บเบิ้ล</td></tr>}
                {filteredBubbles.map((b, idx) => (
                  <tr key={b.id} className={`border-b hover:bg-purple-50 ${!b.active ? 'opacity-40' : ''} ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                    <td className="p-3 text-center text-slate-400 text-xs">{idx+1}</td>
                    <td className="p-3 font-mono text-xs text-slate-500">{b.id}</td>
                    <td className="p-3 font-semibold text-slate-800">{b.name}</td>
                    <td className="p-3 text-center text-slate-600">{Number(b.length_cm) || '-'}</td>
                    <td className="p-3 text-center text-slate-600">{Number(b.width_cm) || '-'}</td>
                    <td className="p-3 text-right font-bold text-purple-700">
                      {Number(b.price_thb) > 0 ? `฿${Number(b.price_thb).toFixed(2)}` : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="p-3 text-center">
                      {b.active
                        ? <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">ใช้งาน</span>
                        : <span className="px-2 py-0.5 bg-slate-100 text-slate-400 rounded-full text-xs">ปิดใช้</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
