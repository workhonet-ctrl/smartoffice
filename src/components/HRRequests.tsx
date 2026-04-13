import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, X, CheckCircle, XCircle } from 'lucide-react';

const REQ_TYPES = [
  { v:'leave_sick',     l:'ลาป่วย',    emoji:'🤒' },
  { v:'leave_annual',   l:'ลาพักร้อน', emoji:'🏖️' },
  { v:'leave_personal', l:'ลากิจ',     emoji:'📝' },
  { v:'ot',             l:'OT',         emoji:'⏱️' },
  { v:'certificate',    l:'ขอใบรับรอง',emoji:'📄' },
];
const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
};

export default function HRRequests() {
  const [records, setRecords]   = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');

  const [fEmp,    setFEmp]    = useState('');
  const [fType,   setFType]   = useState('leave_sick');
  const [fStart,  setFStart]  = useState('');
  const [fEnd,    setFEnd]    = useState('');
  const [fDays,   setFDays]   = useState('');
  const [fHours,  setFHours]  = useState('');
  const [fReason, setFReason] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [{ data: req }, { data: emp }] = await Promise.all([
      supabase.from('hr_requests').select('*, employees(name,nickname)').order('created_at', { ascending: false }),
      supabase.from('employees').select('id,name,nickname').eq('status','active').order('name'),
    ]);
    if (req) setRecords(req);
    if (emp) setEmployees(emp);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!fEmp || !fType) return;
    setSaving(true);
    await supabase.from('hr_requests').insert([{
      employee_id: fEmp, request_type: fType,
      start_date: fStart||null, end_date: fEnd||null,
      days: fDays ? Number(fDays) : null,
      hours: fHours ? Number(fHours) : null,
      reason: fReason||null, status: 'pending',
    }]);
    setSaving(false); setShowForm(false); load();
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('hr_requests').update({ status, approved_at: new Date().toISOString() }).eq('id', id);
    load();
  };

  const filtered = records.filter(r =>
    (!filterStatus || r.status === filterStatus) &&
    (!filterType   || r.request_type === filterType)
  );

  const typeInfo = (t: string) => REQ_TYPES.find(x => x.v === t) || { l: t, emoji: '📋' };

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-800">📋 คำขอเอกสาร HR</h2>
          <p className="text-xs text-slate-400">ลา · OT · ใบรับรอง — รออนุมัติ {records.filter(r=>r.status==='pending').length} รายการ</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium flex items-center gap-2">
          <Plus size={14}/> ยื่นคำขอ
        </button>
      </div>

      {/* Filters */}
      <div className="shrink-0 flex gap-2 mb-3 flex-wrap">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-300">
          <option value="">สถานะ: ทั้งหมด</option>
          <option value="pending">รออนุมัติ</option>
          <option value="approved">อนุมัติแล้ว</option>
          <option value="rejected">ปฏิเสธ</option>
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="border rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-300">
          <option value="">ประเภท: ทั้งหมด</option>
          {REQ_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
        </select>
        {(filterStatus || filterType) && (
          <button onClick={() => { setFilterStatus(''); setFilterType(''); }}
            className="px-2 py-2 bg-slate-100 text-slate-500 rounded-lg text-xs hover:bg-slate-200">ล้าง ✕</button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
        <table className="text-sm w-full" style={{minWidth:'800px'}}>
          <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
            <tr>
              <th className="p-3 text-left whitespace-nowrap">วันที่ยื่น</th>
              <th className="p-3 text-left whitespace-nowrap">พนักงาน</th>
              <th className="p-3 text-left whitespace-nowrap">ประเภท</th>
              <th className="p-3 text-center whitespace-nowrap">วันที่</th>
              <th className="p-3 text-center whitespace-nowrap">จำนวน</th>
              <th className="p-3 text-left">เหตุผล</th>
              <th className="p-3 text-center whitespace-nowrap">สถานะ</th>
              <th className="p-3 text-center whitespace-nowrap">ดำเนินการ</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="p-8 text-center text-slate-400">กำลังโหลด...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-400">ไม่มีคำขอ</td></tr>}
            {filtered.map(r => {
              const ti = typeInfo(r.request_type);
              return (
                <tr key={r.id} className="border-b hover:bg-blue-50">
                  <td className="p-3 text-xs text-slate-400 whitespace-nowrap">{r.created_at?.substring(0,10).split('-').reverse().join('/')}</td>
                  <td className="p-3 font-medium whitespace-nowrap">{r.employees?.name || '-'}</td>
                  <td className="p-3 whitespace-nowrap">
                    <span className="flex items-center gap-1 text-xs">{ti.emoji} {ti.l}</span>
                  </td>
                  <td className="p-3 text-center text-xs text-slate-500 whitespace-nowrap">
                    {r.start_date ? r.start_date.split('-').reverse().join('/') : '-'}
                    {r.end_date && r.end_date !== r.start_date ? ` – ${r.end_date.split('-').reverse().join('/')}` : ''}
                  </td>
                  <td className="p-3 text-center text-xs">
                    {r.days ? `${r.days} วัน` : r.hours ? `${r.hours} ชม.` : '-'}
                  </td>
                  <td className="p-3 text-xs text-slate-500 max-w-[150px] truncate">{r.reason || '-'}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[r.status] || 'bg-slate-100 text-slate-500'}`}>
                      {r.status === 'pending' ? 'รออนุมัติ' : r.status === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ'}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    {r.status === 'pending' && (
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => updateStatus(r.id, 'approved')}
                          className="p-1 text-green-500 hover:bg-green-50 rounded" title="อนุมัติ">
                          <CheckCircle size={16}/>
                        </button>
                        <button onClick={() => updateStatus(r.id, 'rejected')}
                          className="p-1 text-red-500 hover:bg-red-50 rounded" title="ปฏิเสธ">
                          <XCircle size={16}/>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="flex justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">ยื่นคำขอ</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-slate-400"/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">พนักงาน *</label>
                <select value={fEmp} onChange={e => setFEmp(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="">— เลือกพนักงาน —</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">ประเภทคำขอ *</label>
                <select value={fType} onChange={e => setFType(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                  {REQ_TYPES.map(t => <option key={t.v} value={t.v}>{t.emoji} {t.l}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">วันที่เริ่ม</label>
                  <input type="date" value={fStart} onChange={e => setFStart(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">วันที่สิ้นสุด</label>
                  <input type="date" value={fEnd} onChange={e => setFEnd(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">จำนวนวัน</label>
                  <input type="number" value={fDays} onChange={e => setFDays(e.target.value)} step="0.5" min="0.5"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">จำนวนชั่วโมง (OT)</label>
                  <input type="number" value={fHours} onChange={e => setFHours(e.target.value)} step="0.5" min="0"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">เหตุผล</label>
                <textarea value={fReason} onChange={e => setFReason(e.target.value)} rows={3}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"/>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm">ยกเลิก</button>
              <button onClick={handleSave} disabled={!fEmp || saving}
                className="flex-1 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : 'ยื่นคำขอ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
