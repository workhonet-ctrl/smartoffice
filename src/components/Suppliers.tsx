import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Users, Plus, Search, X, Edit2, Trash2 } from 'lucide-react';

type Supplier = { id: string; name: string; tel: string | null; address: string | null; note: string | null; active: boolean; created_at: string };

const emptyForm = { name: '', tel: '', address: '', note: '' };

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
  const [form, setForm]           = useState(emptyForm);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState<{ msg: string; type: 'success'|'error' } | null>(null);

  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('suppliers').select('*').eq('active', true).order('name');
    if (data) setSuppliers(data);
    setLoading(false);
  };

  const openAdd  = () => { setEditTarget(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (s: Supplier) => { setEditTarget(s); setForm({ name: s.name, tel: s.tel||'', address: s.address||'', note: s.note||'' }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editTarget) {
        const { data } = await supabase.from('suppliers').update(form).eq('id', editTarget.id).select().single();
        if (data) setSuppliers(p => p.map(s => s.id === editTarget.id ? data : s));
        showToast('✓ แก้ไขผู้ขายสำเร็จ');
      } else {
        const { data } = await supabase.from('suppliers').insert([form]).select().single();
        if (data) setSuppliers(p => [...p, data]);
        showToast('✓ เพิ่มผู้ขายสำเร็จ');
      }
      setShowModal(false);
    } catch (err: any) {
      showToast('❌ ' + (err.message || 'เกิดข้อผิดพลาด'), 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('ยืนยันลบผู้ขายนี้?')) return;
    await supabase.from('suppliers').update({ active: false }).eq('id', id);
    setSuppliers(p => p.filter(s => s.id !== id));
    showToast('✓ ลบผู้ขายแล้ว');
  };

  const filtered = suppliers.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.tel||'').includes(search)
  );

  return (
    <div className="flex flex-col h-screen p-6 pb-2">
      {/* Header */}
      <div className="shrink-0 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500 flex items-center justify-center">
            <Users size={20} className="text-white"/>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">จัดการผู้ขาย</h2>
            <p className="text-sm text-slate-500">{suppliers.length} ราย</p>
          </div>
        </div>
        <button onClick={openAdd}
          className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 flex items-center gap-2 text-sm font-medium">
          <Plus size={14}/> เพิ่มผู้ขายใหม่
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4 shrink-0">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อ หรือเบอร์โทร..."
          className="w-full pl-8 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"/>
      </div>

      {/* Table */}
      <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
        <table className="text-sm w-full" style={{minWidth:'650px'}}>
          <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
            <tr>
              <th className="p-3 text-center w-10">#</th>
              <th className="p-3 text-left">ชื่อบริษัท / ผู้ขาย</th>
              <th className="p-3 text-left whitespace-nowrap">เบอร์โทร</th>
              <th className="p-3 text-left">ที่อยู่</th>
              <th className="p-3 text-left">หมายเหตุ</th>
              <th className="p-3 text-center whitespace-nowrap">วันที่เพิ่ม</th>
              <th className="p-3 text-center w-28">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="p-8 text-center text-slate-400">กำลังโหลด...</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-slate-400">
                {search ? `ไม่พบ "${search}"` : 'ยังไม่มีผู้ขาย — กด "+ เพิ่มผู้ขายใหม่" ด้านบน'}
              </td></tr>
            )}
            {filtered.map((s, idx) => (
              <tr key={s.id} className="border-b hover:bg-slate-50">
                <td className="p-3 text-center text-slate-400 text-xs">{idx + 1}</td>
                <td className="p-3 font-semibold text-slate-800 whitespace-nowrap">{s.name}</td>
                <td className="p-3 font-mono text-xs text-slate-600 whitespace-nowrap">{s.tel || <span className="text-slate-300">-</span>}</td>
                <td className="p-3 text-xs text-slate-500 max-w-[200px]">
                  <div className="truncate">{s.address || <span className="text-slate-300">-</span>}</div>
                </td>
                <td className="p-3 text-xs text-slate-500 max-w-[160px]">
                  <div className="truncate">{s.note || <span className="text-slate-300">-</span>}</div>
                </td>
                <td className="p-3 text-center text-xs text-slate-400 whitespace-nowrap">
                  {new Date(s.created_at).toLocaleDateString('th-TH')}
                </td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <button onClick={() => openEdit(s)}
                      className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg" title="แก้ไข">
                      <Edit2 size={14}/>
                    </button>
                    <button onClick={() => handleDelete(s.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="ลบ">
                      <Trash2 size={14}/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal เพิ่ม/แก้ไข */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-slate-800">
                {editTarget ? 'แก้ไขข้อมูลผู้ขาย' : 'เพิ่มผู้ขายใหม่'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            <div className="space-y-3">
              {([
                ['name',    'ชื่อบริษัท / ผู้ขาย', 'ชื่อผู้ขาย...', true],
                ['tel',     'เบอร์โทร',             '090-xxx-xxxx', false],
                ['address', 'ที่อยู่',               'ที่อยู่...', false],
                ['note',    'หมายเหตุ',              'บันทึกเพิ่มเติม...', false],
              ] as [string, string, string, boolean][]).map(([field, label, ph, req]) => (
                <div key={field}>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">
                    {label} {req && <span className="text-red-400">*</span>}
                  </label>
                  <input
                    value={(form as any)[field]}
                    onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                    placeholder={ph}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"/>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm hover:bg-slate-300">ยกเลิก</button>
              <button onClick={handleSave} disabled={!form.name.trim() || saving}
                className="flex-1 py-2.5 bg-violet-500 text-white rounded-lg hover:bg-violet-600 disabled:opacity-50 font-medium">
                {saving ? 'กำลังบันทึก...' : editTarget ? 'บันทึกการแก้ไข' : 'เพิ่มผู้ขาย'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] px-5 py-4 rounded-xl shadow-2xl text-white text-sm font-medium ${toast.type==='success'?'bg-emerald-500':'bg-red-500'}`} style={{minWidth:'240px'}}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
