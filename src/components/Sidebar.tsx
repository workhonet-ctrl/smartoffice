import { useState } from 'react';
import {
  Package,
  List,
  Users,
  ShoppingCart,
  Truck,
  FileSpreadsheet,
  DollarSign,
  UserCog,
  Archive,
  Warehouse,
  ChevronDown,
  ChevronRight,
  PackageCheck,
  FileText,
  BarChart2,
  ShoppingBag,
  Handshake,
  History,
} from 'lucide-react';

type PageKey =
  | 'products' | 'product-list' | 'packaging' | 'pack-products' | 'pack-history'
  | 'requisition' | 'stock' | 'purchase-order' | 'suppliers'
  | 'customers' | 'orders' | 'flash-export' | 'myorder-export'
  | 'finance-daily' | 'finance-monthly' | 'finance-yearly' | 'finance-expenses'
  | 'hr';

type SidebarProps = {
  activePage: PageKey;
  setActivePage: (page: PageKey) => void;
};

// เมนูหลัก ฝ่ายคลังสินค้า (มีเมนูย่อย)
const warehouseSubMenus: { key: PageKey; label: string; icon: any }[] = [
  { key: 'products',       label: 'เพิ่มสินค้า',          icon: Package },
  { key: 'product-list',   label: 'รายการสินค้าทั้งหมด', icon: List },
  { key: 'packaging',      label: 'วัสดุแพ็กสินค้า',       icon: Archive },
  { key: 'orders',         label: 'ออเดอร์',                icon: ShoppingCart },
  { key: 'pack-products',  label: 'แพ็คสินค้า',             icon: PackageCheck },
  { key: 'pack-history',   label: 'ประวัติแพ็คสินค้า',       icon: History },
  { key: 'requisition',    label: 'ใบเบิกสินค้า',           icon: FileText },
  { key: 'stock',          label: 'จัดการสต็อก',             icon: BarChart2 },
  { key: 'purchase-order', label: 'ใบสั่งซื้อ (PO)',          icon: ShoppingBag },
  { key: 'suppliers',      label: 'จัดการผู้ขาย',             icon: Handshake },
  { key: 'flash-export',   label: 'Flash Export',           icon: Truck },
  { key: 'myorder-export', label: 'MyOrder Export',         icon: FileSpreadsheet },
];

// เมนูย่อย การเงิน
const financeSubMenus: { key: PageKey; label: string; icon: any }[] = [
  { key: 'finance-daily',    label: 'บัญชีรายวัน',   icon: BarChart2 },
  { key: 'finance-monthly',  label: 'บัญชีรายเดือน', icon: BarChart2 },
  { key: 'finance-yearly',   label: 'บัญชีรายปี',    icon: BarChart2 },
  { key: 'finance-expenses', label: 'รายจ่าย',       icon: FileText  },
];

// เมนูหลักอื่น ๆ
const mainMenus: { key: PageKey; label: string; icon: any }[] = [
  { key: 'customers', label: 'ลูกค้า',   icon: Users },
  { key: 'hr',        label: 'พนักงาน',  icon: UserCog },
];

export default function Sidebar({ activePage, setActivePage }: SidebarProps) {
  const warehouseKeys = warehouseSubMenus.map(m => m.key);
  const financeKeys   = financeSubMenus.map(m => m.key);

  const [warehouseOpen, setWarehouseOpen] = useState(warehouseKeys.includes(activePage));
  const [financeOpen,   setFinanceOpen]   = useState(financeKeys.includes(activePage));

  const handleSubMenu = (key: PageKey) => { setActivePage(key); setWarehouseOpen(true); };

  return (
    <aside className="w-60 bg-slate-950 text-white min-h-screen flex flex-col">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-cyan-500">SmartOffice</h1>
        <p className="text-slate-400 text-sm mt-1">Thai E-commerce Portal</p>
      </div>

      <nav className="p-3 space-y-1">

        {/* ── เมนูหลัก: ฝ่ายคลังสินค้า ── */}
        <div>
          <button
            onClick={() => setWarehouseOpen(v => !v)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition
              ${warehouseKeys.includes(activePage)
                ? 'bg-slate-800 text-cyan-400'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
          >
            <Warehouse size={20} />
            <span className="flex-1">ฝ่ายคลังสินค้า</span>
            {warehouseOpen
              ? <ChevronDown size={16} className="text-slate-400" />
              : <ChevronRight size={16} className="text-slate-400" />
            }
          </button>

          {/* เมนูย่อย */}
          {warehouseOpen && (
            <div className="mt-1 ml-3 pl-3 border-l border-slate-700 space-y-1">
              {warehouseSubMenus.map(menu => {
                const Icon = menu.icon;
                const active = activePage === menu.key;
                return (
                  <button
                    key={menu.key}
                    onClick={() => handleSubMenu(menu.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition text-sm
                      ${active
                        ? 'bg-cyan-700 text-white font-medium'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                      }`}
                  >
                    <Icon size={17} />
                    <span>{menu.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── เส้นคั่น ── */}
        <div className="my-2 border-t border-slate-800" />

        {/* ── เมนูหลัก: ลูกค้า ── */}
        <button onClick={() => setActivePage('customers')}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition ${activePage==='customers'?'bg-cyan-700 text-white':'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
          <Users size={20}/><span>ลูกค้า</span>
        </button>

        {/* ── เมนูหลัก: การเงิน (dropdown) ── */}
        <div>
          <button onClick={() => setFinanceOpen(o => !o)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition
              ${financeKeys.includes(activePage) ? 'bg-slate-800 text-cyan-400' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <DollarSign size={20}/>
            <span className="flex-1">การเงิน</span>
            {financeOpen ? <ChevronDown size={16} className="text-slate-400"/> : <ChevronRight size={16} className="text-slate-400"/>}
          </button>
          {financeOpen && (
            <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-700 pl-3">
              {financeSubMenus.map(menu => {
                const Icon = menu.icon;
                const active = activePage === menu.key;
                return (
                  <button key={menu.key} onClick={() => setActivePage(menu.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition text-sm
                      ${active ? 'bg-cyan-700 text-white font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                    <Icon size={17}/><span>{menu.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── เมนูหลัก: พนักงาน ── */}
        <button onClick={() => setActivePage('hr')}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition ${activePage==='hr'?'bg-cyan-700 text-white':'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
          <UserCog size={20}/><span>พนักงาน</span>
        </button>

      </nav>
    </aside>
  );
}
