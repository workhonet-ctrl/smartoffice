import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { FinanceIncome, FinanceExpense, EXPENSE_CATEGORIES } from '../lib/types';
import { Plus, DollarSign, TrendingDown, TrendingUp } from 'lucide-react';

export default function Finance() {
  const [income, setIncome]     = useState<FinanceIncome[]>([]);
  const [expenses, setExpenses] = useState<FinanceExpense[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    category:     '',
    amount_thb:   0,          // ← amount_thb
    expense_date: new Date().toISOString().split('T')[0],
    description:  '',
  });

  useEffect(() => { loadFinanceData(); }, []);

  const loadFinanceData = async () => {
    try {
      const [incomeRes, expenseRes] = await Promise.all([
        supabase.from('finance_income').select('*').order('income_date', { ascending: false }),
        supabase.from('finance_expense').select('*').order('expense_date', { ascending: false }),
      ]);
      if (incomeRes.data)  setIncome(incomeRes.data);
      if (expenseRes.data) setExpenses(expenseRes.data);
    } catch (error) {
      console.error('Error loading finance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveExpense = async () => {
    if (!expenseForm.category) { alert('กรุณาเลือกหมวดหมู่'); return; }
    if (!expenseForm.amount_thb) { alert('กรุณากรอกจำนวนเงิน'); return; }
    try {
      const { error } = await supabase.from('finance_expense').insert([expenseForm]);
      if (error) throw error;
      setShowExpenseForm(false);
      setExpenseForm({ category: '', amount_thb: 0, expense_date: new Date().toISOString().split('T')[0], description: '' });
      loadFinanceData();
    } catch (error) {
      console.error('Error saving expense:', error);
      alert('เกิดข้อผิดพลาดในการบันทึก');
    }
  };

  // FIX: ใช้ amount_thb
  const totalIncome   = income.reduce((sum, i) => sum + Number(i.amount_thb), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount_thb), 0);
  const netProfit     = totalIncome - totalExpenses;

  if (loading) return <div className="p-6">กำลังโหลด...</div>;

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">การเงิน</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 rounded-lg p-6 border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 mb-1">รายรับรวม</p>
              <p className="text-2xl font-bold text-green-700">฿{totalIncome.toLocaleString()}</p>
            </div>
            <TrendingUp className="text-green-600" size={32} />
          </div>
        </div>
        <div className="bg-red-50 rounded-lg p-6 border border-red-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600 mb-1">รายจ่ายรวม</p>
              <p className="text-2xl font-bold text-red-700">฿{totalExpenses.toLocaleString()}</p>
            </div>
            <TrendingDown className="text-red-600" size={32} />
          </div>
        </div>
        <div className="bg-cyan-50 rounded-lg p-6 border border-cyan-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-cyan-600 mb-1">กำไรสุทธิ</p>
              <p className={'text-2xl font-bold ' + (netProfit >= 0 ? 'text-cyan-700' : 'text-red-700')}>
                ฿{netProfit.toLocaleString()}
              </p>
            </div>
            <DollarSign className="text-cyan-600" size={32} />
          </div>
        </div>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-bold mb-4 text-green-600">รายรับ</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left">วันที่</th>
                  <th className="p-2 text-left">หมายเหตุ</th>
                  <th className="p-2 text-right">จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {income.length === 0 && (
                  <tr><td colSpan={3} className="p-4 text-center text-slate-400">ยังไม่มีรายรับ</td></tr>
                )}
                {income.slice(0, 20).map(i => (
                  <tr key={i.id} className="border-b hover:bg-slate-50">
                    <td className="p-2">{i.income_date}</td>
                    <td className="p-2 text-slate-500 text-xs">{i.note || i.order_no || '-'}</td>
                    <td className="p-2 text-right text-green-600 font-medium">฿{Number(i.amount_thb).toLocaleString()}</td>  {/* ← amount_thb */}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-red-600">รายจ่าย</h3>
            <button
              onClick={() => setShowExpenseForm(true)}
              className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 flex items-center gap-2 text-sm"
            >
              <Plus size={16} /> เพิ่ม
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left">วันที่</th>
                  <th className="p-2 text-left">หมวดหมู่</th>
                  <th className="p-2 text-left">รายละเอียด</th>
                  <th className="p-2 text-right">จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 && (
                  <tr><td colSpan={4} className="p-4 text-center text-slate-400">ยังไม่มีรายจ่าย</td></tr>
                )}
                {expenses.slice(0, 20).map(e => (
                  <tr key={e.id} className="border-b hover:bg-slate-50">
                    <td className="p-2">{e.expense_date}</td>
                    <td className="p-2">{e.category}</td>
                    <td className="p-2 text-slate-500 text-xs truncate max-w-xs">{e.description}</td>
                    <td className="p-2 text-right text-red-600 font-medium">฿{Number(e.amount_thb).toLocaleString()}</td>  {/* ← amount_thb */}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal: เพิ่มรายจ่าย */}
      {showExpenseForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">เพิ่มรายจ่าย</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">หมวดหมู่</label>
                <select
                  value={expenseForm.category}
                  onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">เลือกหมวดหมู่</option>
                  {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">จำนวนเงิน (THB)</label>
                <input
                  type="number"
                  value={expenseForm.amount_thb}
                  onChange={e => setExpenseForm({ ...expenseForm, amount_thb: Number(e.target.value) })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">วันที่</label>
                <input
                  type="date"
                  value={expenseForm.expense_date}
                  onChange={e => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">รายละเอียด</label>
                <textarea
                  value={expenseForm.description}
                  onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <button onClick={saveExpense} className="flex-1 bg-red-500 text-white py-2 rounded hover:bg-red-600">บันทึก</button>
                <button onClick={() => setShowExpenseForm(false)} className="px-4 py-2 bg-slate-300 rounded hover:bg-slate-400">ยกเลิก</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
