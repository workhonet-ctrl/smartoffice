import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { DollarSign, TrendingUp, TrendingDown, Plus, Search, RefreshCw, X, Trash2, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

type Income = {
  id: string; order_id: string | null; order_no: string | null;
  amount_thb: number; income_date: string; note: string | null; created_at: string;
};
type Expense = {
  id: string; category: string; description: string;
  amount_thb: number; expense_date: string; reference: string | null;
  recorded_by: string | null; created_at: string;
};
type Tab = 'summary' | 'income' | 'expense';

const EXP_CATS = ['ค่าวัตถุดิบ/สินค้า','ค่าจัดส่ง','ค่าบรรจุภัณฑ์','ค่าเงินเดือน','ค่าโฆษณา','ค่าสาธารณูปโภค','ค่าเช่า','อื่นๆ'];

function fmt(n: number) { return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('th-TH'); }

export default function Finance() {
  const [tab, setTab]           = useState<Tab>('summary');
  const [incomes, setIncomes]   = useState<Income[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading]   = useState(true);

  // filters
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo]     = useState(new Date().toISOString().split('T')[0]);
  const [searchInc, setSearchInc] = useState('');
  const [searchExp, setSearchExp] = useState('');
  const [catFilter, setCatFilter] = useState('ทั้งหมด');

  // income form
  const [showIncModal, setShowIncModal] = useState(false);
  const [incForm, setIncForm]   = useState({ amount_thb:'', income_date: new Date().toISOString().split('T')[0], note:'', order_no:'' });
  const [savingInc, setSavingInc] = useState(false);

  // expense form
  const [showExpModal, setShowExpModal] = useState(false);
  const [expForm, setExpForm]   = useState({ category:'ค่าวัตถุดิบ/สินค้า', description:'', amount_thb:'', expense_date: new Date().toISOString().split('T')[0], reference:'', recorded_by:'' });
  const [savingExp, setSavingExp] = useState(false);

  const [toast, setToast]       = useState<{msg:string;type:'success'|'error'}|null>(null);
  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    setToast({msg,type}); setTimeout(()=>setToast(null), 4000);
  };

  useEffect(() => { loadAll(); }, [dateFrom, dateTo]);

  const loadAll = async () => {
    setLoading(true);
    const [{ data: inc }, { data: exp }] = await Promise.all([
      supabase.from('finance_income').select('*')
        .gte('income_date', dateFrom).lte('income_date', dateTo)
        .order('income_date', { ascending: false }),
      supabase.from('finance_expense').select('*')
        .gte('expense_date', dateFrom).lte('expense_date', dateTo)
        .order('expense_date', { ascending: false }),
    ]);
    if (inc) setIncomes(inc);
    if (exp) setExpenses(exp);
    setLoading(false);
  };

  // sync รายรับจากออเดอร์ที่ชำระแล้ว
  const syncFromOrders = async () => {
    setLoading(true);
    const { data: orders } = await supabase.from('orders').select('id, order_no, total_thb, payment_date, order_date')
      .eq('payment_status', 'ชำระแล้ว').gte('order_date', dateFrom).lte('order_date', dateTo);
    if (!orders) { setLoading(false); return; }

    let synced = 0;
    for (const o of orders) {
      const { data: exists } = await supabase.from('finance_income').select('id').eq('order_id', o.id).maybeSingle();
      if (!exists) {
        await supabase.from('finance_income').insert([{
          order_id: o.id, order_no: o.order_no,
          amount_thb: o.total_thb,
          income_date: o.payment_date || o.order_date,
          note: `ออเดอร์ ${o.order_no}`,
        }]);
        synced++;
      }
    }
    showToast(`✓ ซิงค์แล้ว ${synced} รายการ`);
    await loadAll();
  };

  const handleAddIncome = async () => {
    if (!incForm.amount_thb || !incForm.income_date) return;
    setSavingInc(true);
    try {
      await supabase.from('finance_income').insert([{
        amount_thb: Number(incForm.amount_thb),
        income_date: incForm.income_date,
        order_no: incForm.order_no || null,
        note: incForm.note || null,
      }]);
      showToast('✓ เพิ่มรายรับสำเร็จ');
      setIncForm({ amount_thb:'', income_date: new Date().toISOString().split('T')[0], note:'', order_no:'' });
      setShowIncModal(false);
      await loadAll();
    } finally { setSavingInc(false); }
  };

  const handleAddExpense = async () => {
    if (!expForm.amount_thb || !expForm.description) return;
    setSavingExp(true);
    try {
      await supabase.from('finance_expense').insert([{
        category:    expForm.category,
        description: expForm.description,
        amount_thb:  Number(expForm.amount_thb),
        expense_date: expForm.expense_date,
        reference:   expForm.reference || null,
        recorded_by: expForm.recorded_by || null,
      }]);
      showToast('✓ เพิ่มรายจ่ายสำเร็จ');
      setExpForm({ category:'ค่าวัตถุดิบ/สินค้า', description:'', amount_thb:'', expense_date: new Date().toISOString().split('T')[0], reference:'', recorded_by:'' });
      setShowExpModal(false);
      await loadAll();
    } finally { setSavingExp(false); }
  };

  const deleteIncome  = async (id: string) => {
    if (!confirm('ยืนยันลบรายรับนี้?')) return;
    await supabase.from('finance_income').delete().eq('id', id);
    setIncomes(p => p.filter(i => i.id !== id));
  };
  const deleteExpense = async (id: string) => {
    if (!confirm('ยืนยันลบรายจ่ายนี้?')) return;
    await supabase.from('finance_expense').delete().eq('id', id);
    setExpenses(p => p.filter(e => e.id !== id));
  };

  // คำนวณสรุป
  const totalIncome  = incomes.reduce((s, i) => s + Number(i.amount_thb), 0);
  const totalExpense = expenses.reduce((s, e) => s + Number(e.amount_thb), 0);
  const profit       = totalIncome - totalExpense;

  // กลุ่มรายจ่ายตามหมวด
  const expByCategory = EXP_CATS.map(cat => ({
    cat, amount: expenses.filter(e => e.category === cat).reduce((s, e) => s + Number(e.amount_thb), 0)
  })).filter(x => x.amount > 0);

  const filteredInc = incomes.filter(i =>
    !searchInc || (i.order_no||'').includes(searchInc) || (i.note||'').toLowerCase().includes(searchInc.toLowerCase())
  );
  const filteredExp = expenses.filter(e => {
    const matchCat  = catFilter === 'ทั้งหมด' || e.category === catFilter;
    const matchSearch = !searchExp || e.description.toLowerCase().includes(searchExp.toLowerCase()) || e.category.includes(searchExp);
    return matchCat && matchSearch;
  });

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(incomes.map(i => ({
      วันที่: fmtDate(i.income_date), เลขออเดอร์: i.order_no||'', จำนวน: i.amount_thb, หมายเหตุ: i.note||''
    }))), 'รายรับ');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenses.map(e => ({
      วันที่: fmtDate(e.expense_date), หมวด: e.category, รายการ: e.description, จำนวน: e.amount_thb
    }))), 'รายจ่าย');
    XLSX.writeFile(wb, `Finance_${dateFrom}_${dateTo}.xlsx`);
  };

  return (
    <div className="flex flex-col h-screen p-6 pb-2">
      {/* Header */}
      <div className="shrink-0 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
            <DollarSign size={20} className="text-white"/>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">การเงิน</h2>
            <p className="text-sm text-slate-500">กำไร/ขาดทุน · รายรับ-รายจ่าย</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
          <span className="text-slate-400 text-sm">–</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
          <button onClick={exportExcel} className="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 flex items-center gap-2 text-sm">
            <Download size={13}/> Export
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-4 shrink-0">
        {([['summary','สรุปภาพรวม'],['income','รายรับ'],['expense','รายจ่าย']] as [Tab,string][]).map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab===k?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ── Tab: สรุปภาพรวม ── */}
      {tab === 'summary' && (
        <div className="flex-1 overflow-auto min-h-0 space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">รายรับรวม</span>
                <TrendingUp size={16} className="text-emerald-500"/>
              </div>
              <div className="text-2xl font-bold text-emerald-600">฿{fmt(totalIncome)}</div>
              <div className="text-xs text-slate-400 mt-1">{incomes.length} รายการ</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">รายจ่ายรวม</span>
                <TrendingDown size={16} className="text-red-500"/>
              </div>
              <div className="text-2xl font-bold text-red-500">฿{fmt(totalExpense)}</div>
              <div className="text-xs text-slate-400 mt-1">{expenses.length} รายการ</div>
            </div>
            <div className={`rounded-xl border shadow-sm p-5 ${profit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {profit >= 0 ? 'กำไรสุทธิ' : 'ขาดทุน'}
                </span>
                <DollarSign size={16} className={profit >= 0 ? 'text-emerald-600' : 'text-red-600'}/>
              </div>
              <div className={`text-2xl font-bold ${profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {profit < 0 ? '-' : ''}฿{fmt(Math.abs(profit))}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Margin {totalIncome > 0 ? ((profit/totalIncome)*100).toFixed(1) : 0}%
              </div>
            </div>
          </div>

          {/* รายจ่ายแยกหมวด */}
          {expByCategory.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <h3 className="font-semibold text-slate-700 mb-4 text-sm">รายจ่ายแยกตามหมวด</h3>
              <div className="space-y-3">
                {expByCategory.sort((a,b) => b.amount - a.amount).map(({ cat, amount }) => {
                  const pct = totalExpense > 0 ? (amount / totalExpense) * 100 : 0;
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-600 font-medium">{cat}</span>
                        <span className="text-slate-700 font-bold">฿{fmt(amount)} <span className="text-slate-400 font-normal">({pct.toFixed(1)}%)</span></span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-red-400 rounded-full" style={{width:`${pct}%`}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* รายรับรายวัน (7 วันล่าสุด) */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-semibold text-slate-700 mb-4 text-sm">รายรับ 7 วันล่าสุด</h3>
            {(() => {
              const byDate: Record<string, number> = {};
              incomes.forEach(i => { byDate[i.income_date] = (byDate[i.income_date]||0) + Number(i.amount_thb); });
              const dates = Object.keys(byDate).sort().slice(-7);
              const max   = Math.max(...dates.map(d => byDate[d]), 1);
              return (
                <div className="flex items-end gap-2 h-32">
                  {dates.map(d => (
                    <div key={d} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-[10px] text-emerald-700 font-bold">฿{(byDate[d]/1000).toFixed(0)}K</div>
                      <div className="w-full bg-emerald-400 rounded-t" style={{height:`${(byDate[d]/max)*80}px`, minHeight:'4px'}}/>
                      <div className="text-[10px] text-slate-400">{new Date(d).toLocaleDateString('th-TH',{day:'2-digit',month:'2-digit'})}</div>
                    </div>
                  ))}
                  {dates.length === 0 && <div className="text-sm text-slate-400 m-auto">ยังไม่มีข้อมูล</div>}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Tab: รายรับ ── */}
      {tab === 'income' && (
        <>
          <div className="shrink-0 flex gap-2 mb-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input value={searchInc} onChange={e => setSearchInc(e.target.value)} placeholder="ค้นหาเลขออเดอร์ / หมายเหตุ..."
                className="w-full pl-8 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
            </div>
            <button onClick={syncFromOrders} disabled={loading}
              className="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 flex items-center gap-2 text-sm">
              <RefreshCw size={13} className={loading?'animate-spin':''}/> ซิงค์จากออเดอร์
            </button>
            <button onClick={() => setShowIncModal(true)}
              className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 flex items-center gap-2 text-sm">
              <Plus size={13}/> เพิ่มรายรับ
            </button>
          </div>
          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm w-full" style={{minWidth:'650px'}}>
              <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                  <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
                  <th className="p-3 text-left">หมายเหตุ</th>
                  <th className="p-3 text-right whitespace-nowrap">จำนวน (฿)</th>
                  <th className="p-3 text-center w-12">ลบ</th>
                </tr>
              </thead>
              <tbody>
                {filteredInc.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">ยังไม่มีรายรับในช่วงนี้</td></tr>}
                {filteredInc.map(i => (
                  <tr key={i.id} className="border-b hover:bg-emerald-50">
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(i.income_date)}</td>
                    <td className="p-3 font-mono text-xs text-emerald-700">{i.order_no || <span className="text-slate-300">-</span>}</td>
                    <td className="p-3 text-xs text-slate-500">{i.note || '-'}</td>
                    <td className="p-3 text-right font-bold text-emerald-600">฿{fmt(Number(i.amount_thb))}</td>
                    <td className="p-3 text-center">
                      <button onClick={() => deleteIncome(i.id)} className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded"><Trash2 size={14}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200 sticky bottom-0">
                <tr>
                  <td colSpan={3} className="p-3 text-right text-sm font-semibold text-slate-600">รวมทั้งสิ้น</td>
                  <td className="p-3 text-right font-bold text-lg text-emerald-600">฿{fmt(filteredInc.reduce((s,i)=>s+Number(i.amount_thb),0))}</td>
                  <td/>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {/* ── Tab: รายจ่าย ── */}
      {tab === 'expense' && (
        <>
          <div className="shrink-0 flex gap-2 mb-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input value={searchExp} onChange={e => setSearchExp(e.target.value)} placeholder="ค้นหารายการ..."
                className="w-full pl-8 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300"/>
            </div>
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300">
              <option>ทั้งหมด</option>
              {EXP_CATS.map(c => <option key={c}>{c}</option>)}
            </select>
            <button onClick={() => setShowExpModal(true)}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-2 text-sm">
              <Plus size={13}/> เพิ่มรายจ่าย
            </button>
          </div>
          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm w-full" style={{minWidth:'650px'}}>
              <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                  <th className="p-3 text-left whitespace-nowrap">หมวด</th>
                  <th className="p-3 text-left">รายการ</th>
                  <th className="p-3 text-left whitespace-nowrap">อ้างอิง</th>
                  <th className="p-3 text-right whitespace-nowrap">จำนวน (฿)</th>
                  <th className="p-3 text-center w-12">ลบ</th>
                </tr>
              </thead>
              <tbody>
                {filteredExp.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">ยังไม่มีรายจ่ายในช่วงนี้</td></tr>}
                {filteredExp.map(e => (
                  <tr key={e.id} className="border-b hover:bg-red-50">
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(e.expense_date)}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold whitespace-nowrap">{e.category}</span>
                    </td>
                    <td className="p-3 text-sm font-medium text-slate-800">{e.description}</td>
                    <td className="p-3 text-xs text-slate-400">{e.reference || '-'}</td>
                    <td className="p-3 text-right font-bold text-red-600">฿{fmt(Number(e.amount_thb))}</td>
                    <td className="p-3 text-center">
                      <button onClick={() => deleteExpense(e.id)} className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded"><Trash2 size={14}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200 sticky bottom-0">
                <tr>
                  <td colSpan={4} className="p-3 text-right text-sm font-semibold text-slate-600">รวมทั้งสิ้น</td>
                  <td className="p-3 text-right font-bold text-lg text-red-600">฿{fmt(filteredExp.reduce((s,e)=>s+Number(e.amount_thb),0))}</td>
                  <td/>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {/* Modal เพิ่มรายรับ */}
      {showIncModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-slate-800">เพิ่มรายรับ</h3>
              <button onClick={() => setShowIncModal(false)}><X size={20} className="text-slate-400"/></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">วันที่ *</label>
                  <input type="date" value={incForm.income_date} onChange={e => setIncForm(p=>({...p,income_date:e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">จำนวน (฿) *</label>
                  <input type="number" value={incForm.amount_thb} onChange={e => setIncForm(p=>({...p,amount_thb:e.target.value}))}
                    placeholder="0.00" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">เลขออเดอร์ (ถ้ามี)</label>
                <input value={incForm.order_no} onChange={e => setIncForm(p=>({...p,order_no:e.target.value}))}
                  placeholder="ORDER-xxxx" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">หมายเหตุ</label>
                <input value={incForm.note} onChange={e => setIncForm(p=>({...p,note:e.target.value}))}
                  placeholder="ระบุที่มา..." className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowIncModal(false)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm hover:bg-slate-300">ยกเลิก</button>
              <button onClick={handleAddIncome} disabled={!incForm.amount_thb||savingInc}
                className="flex-1 py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 font-medium">
                {savingInc ? 'กำลังบันทึก...' : 'เพิ่มรายรับ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal เพิ่มรายจ่าย */}
      {showExpModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-slate-800">เพิ่มรายจ่าย</h3>
              <button onClick={() => setShowExpModal(false)}><X size={20} className="text-slate-400"/></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">วันที่ *</label>
                  <input type="date" value={expForm.expense_date} onChange={e => setExpForm(p=>({...p,expense_date:e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">จำนวน (฿) *</label>
                  <input type="number" value={expForm.amount_thb} onChange={e => setExpForm(p=>({...p,amount_thb:e.target.value}))}
                    placeholder="0.00" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"/>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">หมวดหมู่ *</label>
                <select value={expForm.category} onChange={e => setExpForm(p=>({...p,category:e.target.value}))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300">
                  {EXP_CATS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">รายการ *</label>
                <input value={expForm.description} onChange={e => setExpForm(p=>({...p,description:e.target.value}))}
                  placeholder="ระบุรายละเอียด..." className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">เอกสารอ้างอิง</label>
                  <input value={expForm.reference} onChange={e => setExpForm(p=>({...p,reference:e.target.value}))}
                    placeholder="เลขที่ใบเสร็จ..." className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">บันทึกโดย</label>
                  <input value={expForm.recorded_by} onChange={e => setExpForm(p=>({...p,recorded_by:e.target.value}))}
                    placeholder="ชื่อผู้บันทึก..." className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"/>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowExpModal(false)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm hover:bg-slate-300">ยกเลิก</button>
              <button onClick={handleAddExpense} disabled={!expForm.amount_thb||!expForm.description||savingExp}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 font-medium">
                {savingExp ? 'กำลังบันทึก...' : 'เพิ่มรายจ่าย'}
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
