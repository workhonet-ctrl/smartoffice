import { useState } from 'react';
import FlashShippingImport from './FlashShippingImport';
import MyOrderImport from './MyOrderImport';

type Tab = 'flash' | 'myorder';

export default function ShippingPage() {
  const [tab, setTab] = useState<Tab>('flash');

  return (
    <div className="flex flex-col h-full gap-3 p-4">

      {/* Tab switcher */}
      <div className="shrink-0 flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('flash')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'flash'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          ⚡ Flash Express
        </button>
        <button
          onClick={() => setTab('myorder')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'myorder'
              ? 'bg-white text-purple-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          📋 MYORDER
        </button>
      </div>

      {/* Content — ไม่ unmount เพื่อรักษา state (hidden แทน unmount) */}
      <div className={`flex-1 min-h-0 ${tab === 'flash' ? 'flex flex-col' : 'hidden'}`}>
        <FlashShippingImport />
      </div>
      <div className={`flex-1 min-h-0 ${tab === 'myorder' ? 'flex flex-col' : 'hidden'}`}>
        <MyOrderImport />
      </div>

    </div>
  );
}
