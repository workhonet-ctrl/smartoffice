import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, X } from 'lucide-react';

const CATEGORIES = ['ยอดขาย', 'คุณภาพงาน', 'เวลาทำงาน', 'ความพึงพอใจ', 'อื่นๆ'];

export default function HRKPI() {
  const today = new Date();
  const [period, setPeriod] = useState(`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`);
  const [records, setRecords]   = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);

  const [fEmp,    setFEmp]    = useState('');
  const [fCat,    setFCat]    = useState('ยอดขาย');
  const [fItem,   setFItem]   = useState('');
  const [fTarget, setFTarget] = useState('');
  const [fActual, setFActual] = useState('');
  const [fUnit,   setFUnit]   = useState('%');
  const [fWeight, setFWeight] = useState('100');
  const [fNote,   setFNote]   = useState('');

  useEffect(() => { load(); }, [period]);

  const load = async () => {
    setLoading(true);
    const [{ data: kpi }, { data: emp }] = await Promise.all([
      supabase.from('hr_kpi').select('*, employees(name,nickname)').eq('period', period).order('created_at'),
      supabase.from('employees').select('id,name,nickname').eq('status','active').order('name'),
    ]);
    if (kpi) setRecords(kpi);
    if (emp) setEmployees(emp);
    setLoading(false);
  };

  const calcScore = (target: number, actual: number) => {
    if (!target) return 0;
    return Math.min((actual / target) * 100, 120);
  };

  const handleSave = async () => {
    if (!fEmp || !fItem) return;
    setSaving(true);
    const target = Number(fTarget)||0;
    const actual = Number(fActual)||0;
    const score  = calcScore(target, actual);
    await supabase.from('hr_kpi').insert([{
      employee_id: fEmp, period, period_type: 'monthly',
      category: fCat, item: fItem,
      target, actual, score, unit: fUnit,
      weight: Number(fWeight)||100, note: fNote||null,
    }]);
    setSaving(false); setShowForm(false); load();
  };

  const deleteKpi = async (id: string) => {
    if (!confirm('ลบรายการ KPI นี้?')) return;
    await supabase.from('hr_kpi').delete().eq('id', id);
    load();
  };

  // Group by employee
  const byEmp: Record<string, { emp: any; rows: any[]; avgScore: number }> = {};
  for (const r of records) {
    if (!byEmp[r.employee_id]) byEmp[r.employee_id] = { emp: r.employees, rows: [], avgScore: 0 };
    byEmp[r.employee_id].rows.push(r);
  }
  for (const g of Object.values(byEmp)) {
    const totalWeight = g.rows.reduce((s, r) => s + Number(r.weight||100), 0);
    g.avgScore = totalWeight > 0
      ? g.rows.reduce((s, r) => s + Number(r.score||0) * Number(r.weight||100), 0) / totalWeight
      : 0;
  }

  const scoreColor = (s: number) => {
    if (s >= 90) return 'text-green-600';
    if (s >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-800">📊 KPI</h2>
          <p className="text-xs text-slate-400">ประเมินผลงานประจำเดือน · {Object.keys(byEmp).length} คน</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
          <button onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium flex items-center gap-2">
            <Plus size={14}/> เพิ่ม KPI
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0 space-y-4">
        {loading && <div className="text-center text-slate-400 py-8">กำลังโหลด...</div>}
        {!loading && Object.keys(byEmp).length === 0 && (
          <div className="text-center text-slate-400 py-8">ยังไม่มีข้อมูล KPI เดือนนี้</div>
        )}
        {Object.entries(byEmp).map(([empId, group]) => (
          <div key={empId} className="bg-white rounded-xl shadow overflow-hidden">
            {/* Employee header */}
            <div className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between">
              <div>
                <span className="font-semibold">{group.emp?.name || '-'}</span>
                {group.emp?.nickname && <span className="text-slate-400 text-xs ml-2">({group.emp.nickname})</span>}
              </div>
              <div className={`text-xl font-bold ${scoreColor(group.avgScore)}`}>
                {group.avgScore.toFixed(1)}%
              </div>
            </div>
            {/* KPI rows */}
            <table className="text-sm w-full">
              <thead className="bg-slate-100 text-slate-600 text-xs">
                <tr>
                  <th className="px-4 py-2 text-left">หมวด</th>
                  <th className="px-4 py-2 text-left">รายการ</th>
                  <th className="px-4 py-2 text-right whitespace-nowrap">เป้าหมาย</th>
                  <th className="px-4 py-2 text-right whitespace-nowrap">ผลจริง</th>
                  <th className="px-4 py-2 text-right whitespace-nowrap">คะแนน</th>
                  <th className="px-4 py-2 text-left whitespace-nowrap">หมายเหตุ</th>
                  <th className="px-4 py-2 w-10"/>
                </tr>
              </thead>
              <tbody>
                {group.rows.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-blue-50">
                    <td className="px-4 py-2 text-xs">
                      <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]">{r.category}</span>
                    </td>
                    <td className="px-4 py-2 font-medium">{r.item}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{r.target} {r.unit}</td>
                    <td className="px-4 py-2 text-right font-medium">{r.actual} {r.unit}</td>
                    <td className={`px-4 py-2 text-right font-bold ${scoreColor(Number(r.score))}`}>
                      {Number(r.score).toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-400 max-w-[100px] truncate">{r.note || '-'}</td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => deleteKpi(r.id)} className="text-slate-300 hover:text-red-500 text-xs">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="flex justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">เพิ่ม KPI</h3>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">หมวด</label>
                  <select value={fCat} onChange={e => setFCat(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">หน่วย</label>
                  <input value={fUnit} onChange={e => setFUnit(e.target.value)} placeholder="%, บาท, ครั้ง"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">รายการ KPI *</label>
                <input value={fItem} onChange={e => setFItem(e.target.value)} placeholder="เช่น ยอดขายรายเดือน"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">เป้าหมาย</label>
                  <input type="number" value={fTarget} onChange={e => setFTarget(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ผลจริง</label>
                  <input type="number" value={fActual} onChange={e => setFActual(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">น้ำหนัก %</label>
                  <input type="number" value={fWeight} onChange={e => setFWeight(e.target.value)} max="100"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
              </div>
              {fTarget && fActual && (
                <div className={`text-sm font-bold px-3 py-2 rounded-lg ${scoreColor(calcScore(Number(fTarget),Number(fActual)))} bg-slate-50`}>
                  คะแนน: {calcScore(Number(fTarget),Number(fActual)).toFixed(1)}%
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">หมายเหตุ</label>
                <input value={fNote} onChange={e => setFNote(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm">ยกเลิก</button>
              <button onClick={handleSave} disabled={!fEmp || !fItem || saving}
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
