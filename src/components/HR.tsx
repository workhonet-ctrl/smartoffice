import { useState } from 'react';
import HREmployees from './hr/HREmployees';
import HRAttendance from './hr/HRAttendance';
import HRRequests from './hr/HRRequests';
import HRAnnouncements from './hr/HRAnnouncements';
import HRSalary from './hr/HRSalary';
import HRKPI from './hr/HRKPI';

type HRSub = 'employees' | 'attendance' | 'requests' | 'announcements' | 'salary' | 'kpi';

const MENUS: { key: HRSub; label: string; emoji: string; group: string }[] = [
  { key: 'employees',     label: 'พนักงาน',        emoji: '👤', group: 'พนักงาน' },
  { key: 'attendance',    label: 'เวลาทำงาน',      emoji: '⏰', group: 'พนักงาน' },
  { key: 'requests',      label: 'คำขอเอกสาร HR',  emoji: '📋', group: 'พนักงาน' },
  { key: 'announcements', label: 'ประกาศ',          emoji: '📢', group: 'ทั่วไป' },
  { key: 'salary',        label: 'เงินเดือน',       emoji: '💰', group: 'การเงิน' },
  { key: 'kpi',           label: 'KPI',             emoji: '📊', group: 'การเงิน' },
];

export default function HR() {
  const [sub, setSub] = useState<HRSub>('employees');
  const groups = ['พนักงาน', 'ทั่วไป', 'การเงิน'];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <div className="w-52 shrink-0 bg-slate-900 flex flex-col py-4">
        <div className="px-4 mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center text-white font-bold text-sm">HR</div>
            <div>
              <div className="text-white text-sm font-bold">ฝ่าย HR</div>
              <div className="text-slate-400 text-[10px]">Human Resources</div>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          {groups.map(group => {
            const items = MENUS.filter(m => m.group === group);
            return (
              <div key={group} className="mb-4">
                <div className="px-2 mb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{group}</div>
                {items.map(item => (
                  <button key={item.key} onClick={() => setSub(item.key)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition mb-0.5 text-left
                      ${sub === item.key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                    <span>{item.emoji}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-50 p-6 pb-2">
        {sub === 'employees'     && <HREmployees />}
        {sub === 'attendance'    && <HRAttendance />}
        {sub === 'requests'      && <HRRequests />}
        {sub === 'announcements' && <HRAnnouncements />}
        {sub === 'salary'        && <HRSalary />}
        {sub === 'kpi'           && <HRKPI />}
      </div>
    </div>
  );
}
