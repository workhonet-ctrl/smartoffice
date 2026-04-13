import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';

type AttRecord = {
  id: string; employee_id: string; work_date: string;
  check_in: string|null; check_out: string|null; status: string; note: string|null;
  employees: { name: string; nickname: string|null } | null;
};

const STATUS_OPT = [
  { v:'present',  l:'มาทำงาน',  c:'bg-green-100 text-green-700' },
  { v:'late',     l:'มาสาย',    c:'bg-yellow-100 text-yellow-700' },
  { v:'absent',   l:'ขาดงาน',   c:'bg-red-100 text-red-600' },
  { v:'leave',    l:'ลา',        c:'bg-blue-100 text-blue-700' },
  { v:'holiday',  l:'วันหยุด',  c:'bg-slate-100 text-slate-500' },
];

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function HRAttendance() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year,  setYear]  = useState(today.getFullYear());
  const [records, setRecords]   = useState<AttRecord[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);

  const [fEmp,    setFEmp]    = useState('');
  const [fDate,   setFDate]   = useState(fmtDate(today));
  const [fIn,     setFIn]     = useState('08:00');
  const [fOut,    setFOut]    = useState('17:00');
  const [fStatus, setFStatus] = useState('present');
  const [fNote,   setFNote]   = useState('');

  const monthStr = `${year}-${String(month+1).padStart(2,'0')}`;

  useEffect(() => { load(); }, [month, year]);

  const load = async () => {
    setLoading(true);
    const [{ data: att }, { data: emp }] = await Promise.all([
      supabase.from('hr_attendance').select('*, employees(name,nickname)')
        .gte('work_date', `${monthStr}-01`).lte('work_date', `${monthStr}-31`)
        .order('work_date', { ascending: false }),
      supabase.from('employees').select('id,name,nickname').eq('status','active').order('name'),
    ]);
    if (att) setRecords(att as AttRecord[]);
    if (emp) setEmployees(emp);
    setLoading(false);
  };

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y+1); } else setMonth(m => m+1); };

  const handleSave = async () => {
    if (!fEmp || !fDate) return;
    setSaving(true);
    await supabase.from('hr_attendance').upsert([{
      employee_id: fEmp, work_date: fDate,
      check_in: fIn||null, check_out: fOut||null,
      status: fStatus, note: fNote||null,
    }], { onConflict: 'employee_id,work_date' });
    setSaving(false); setShowForm(false); load();
  };

  const statusInfo = (s: string) => STATUS_OPT.find(o => o.v === s) || STATUS_OPT[0];

  // Summary
  const summary = STATUS_OPT.map(o => ({ ...o, count: records.filter(r => r.status === o.v).length }));

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-800">⏰ เวลาทำงาน</h2>
          <p className="text-xs text-slate-400">บันทึกการมา-ขาด-ลา ประจำเดือน</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 rounded-lg bg-white border hover:bg-slate-50"><ChevronLeft size={16}/></button>
          <span className="font-semibold text-slate-700 min-w-[120px] text-center">
            {new Date(year, month).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={nextMonth} className="p-2 rounded-lg bg-white border hover:bg-slate-50"><ChevronRight size={16}/></button>
          <button onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium flex items-center gap-2">
            <Plus size={14}/> บันทึก
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="shrink-0 grid grid-cols-5 gap-2 mb-3">
        {summary.map(s => (
          <div key={s.v} className={`rounded-xl p-3 border text-center ${s.c.replace('text-','border-').replace('bg-','')} bg-white`}>
            <div className={`text-xs font-semibold mb-1 ${s.c.split(' ')[1]}`}>{s.l}</div>
            <div className="text-xl font-bold text-slate-800">{s.count}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
        <table className="text-sm w-full" style={{minWidth:'700px'}}>
          <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
            <tr>
              <th className="p-3 text-left whitespace-nowrap">วันที่</th>
              <th className="p-3 text-left whitespace-nowrap">พนักงาน</th>
              <th className="p-3 text-center whitespace-nowrap">เข้างาน</th>
              <th className="p-3 text-center whitespace-nowrap">ออกงาน</th>
              <th className="p-3 text-center whitespace-nowrap">สถานะ</th>
              <th className="p-3 text-left whitespace-nowrap">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-8 text-center text-slate-400">กำลังโหลด...</td></tr>}
            {!loading && records.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">ยังไม่มีข้อมูล</td></tr>}
            {records.map(r => {
              const si = statusInfo(r.status);
              return (
                <tr key={r.id} className="border-b hover:bg-blue-50">
                  <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{r.work_date.split('-').reverse().join('/')}</td>
                  <td className="p-3 font-medium">
                    {r.employees?.name || '-'}
                    {r.employees?.nickname && <span className="text-xs text-slate-400 ml-1">({r.employees.nickname})</span>}
                  </td>
                  <td className="p-3 text-center font-mono text-xs">{r.check_in || '-'}</td>
                  <td className="p-3 text-center font-mono text-xs">{r.check_out || '-'}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${si.c}`}>{si.l}</span>
                  </td>
                  <td className="p-3 text-xs text-slate-400">{r.note || '-'}</td>
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
              <h3 className="text-lg font-bold text-slate-800">บันทึกการมาทำงาน</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-slate-400"/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">พนักงาน *</label>
                <select value={fEmp} onChange={e => setFEmp(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="">— เลือกพนักงาน —</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.nickname ? ` (${e.nickname})` : ''}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">วันที่ *</label>
                  <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">สถานะ</label>
                  <select value={fStatus} onChange={e => setFStatus(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                    {STATUS_OPT.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">เข้างาน</label>
                  <input type="time" value={fIn} onChange={e => setFIn(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ออกงาน</label>
                  <input type="time" value={fOut} onChange={e => setFOut(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">หมายเหตุ</label>
                <input value={fNote} onChange={e => setFNote(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm">ยกเลิก</button>
              <button onClick={handleSave} disabled={!fEmp || !fDate || saving}
                className="flex-1 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
