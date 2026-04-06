import { useState } from 'react';
import { DollarSign, Calendar, BarChart2, FileText } from 'lucide-react';
import FinanceDaily from './FinanceDaily';
import FinanceMonthly from './FinanceMonthly';
import FinanceExpenses from './FinanceExpenses';

type FinTab = 'daily' | 'monthly' | 'yearly' | 'expenses';

const TABS: { key: FinTab; label: string; icon: any }[] = [
  { key:'daily',    label:'บัญชีรายวัน',   icon: Calendar  },
  { key:'monthly',  label:'บัญชีรายเดือน', icon: BarChart2 },
  { key:'yearly',   label:'บัญชีรายปี',    icon: BarChart2 },
  { key:'expenses', label:'รายจ่าย',       icon: FileText  },
];

export default function Finance() {
  const [tab, setTab] = useState<FinTab>('daily');

  return (
    <div className="flex flex-col h-screen p-6 pb-2">
      {/* Header */}
      <div className="shrink-0 mb-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
          <DollarSign size={20} className="text-white"/>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">การเงิน</h2>
          <p className="text-xs text-slate-400">P&amp;L · รายรับ-รายจ่าย · กำไร/ขาดทุน</p>
        </div>
      </div>

      {/* Sub-menu */}
      <div className="shrink-0 flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-5">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${tab===key?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
            <Icon size={13}/>
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'daily'    && <FinanceDaily />}
        {tab === 'monthly'  && <FinanceMonthly />}
        {tab === 'yearly'   && <FinanceYearly />}
        {tab === 'expenses' && <FinanceExpenses />}
      </div>
    </div>
  );
}

function FinanceYearly() {
  return (
    <div className="flex-1 h-full bg-white rounded-xl border border-slate-100 shadow-sm flex items-center justify-center">
      <div className="text-center">
        <BarChart2 size={40} className="text-slate-300 mx-auto mb-3"/>
        <p className="text-slate-500 font-medium">บัญชีรายปี</p>
        <p className="text-sm text-slate-400 mt-1">ดึงข้อมูลจากบัญชีรายเดือนโดยอัตโนมัติ — อยู่ระหว่างพัฒนา</p>
      </div>
    </div>
  );
}
