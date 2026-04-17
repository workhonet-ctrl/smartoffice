import { useState } from 'react';
import {
  Package, List, Users, ShoppingCart, Truck, FileSpreadsheet,
  DollarSign, UserCog, Archive, Warehouse, ChevronDown, ChevronRight,
  PackageCheck, FileText, BarChart2, ShoppingBag, Handshake,
  History, TrendingUp, ArrowDownCircle, Search, Target,
  BookOpen, UserPlus, GraduationCap, PieChart, Building2,
  MessageSquare, Megaphone, Store,
} from 'lucide-react';

type PageKey =
  | 'sales-admin' | 'sales-customers' | 'sales-crm'
  | 'marketing-graphic' | 'marketing-ads'
  | 'product-list' | 'product-search' | 'product-kpi' | 'products' | 'packaging'
  | 'orders' | 'flash-export' | 'myorder-export'
  | 'pack-products' | 'requisition' | 'pack-history'
  | 'stock' | 'purchase-order' | 'suppliers'
  | 'finance-daily' | 'finance-monthly' | 'finance-yearly'
  | 'finance-expenses' | 'finance-income' | 'finance-cost'
  | 'hr-recruit' | 'hr' | 'hr-train' | 'hr-kpi' | 'hr-sop';

type SidebarProps = {
  activePage: PageKey;
  setActivePage: (page: PageKey) => void;
};

type MenuItem = { key: PageKey; label: string; icon: any; built?: boolean };

// accent สีต่างกันต่อแผนก
const GROUPS = [
  {
    key: 'sales', label: 'ฝ่ายขาย', icon: Store,
    accent: '#0ea5e9', bg: '#f0f9ff', dot: '#0ea5e9',
    menus: [
      { key: 'sales-admin',     label: 'แอดมิน',    icon: UserCog,       built: true  },
      { key: 'sales-customers', label: 'ตามลูกค้า', icon: Users,         built: true  },
      { key: 'sales-crm',       label: 'CRM',        icon: MessageSquare, built: false },
    ] as MenuItem[],
  },
  {
    key: 'marketing', label: 'ฝ่ายการตลาด', icon: Megaphone,
    accent: '#ec4899', bg: '#fdf2f8', dot: '#ec4899',
    menus: [
      { key: 'marketing-graphic', label: 'กราฟฟิก',   icon: Target,    built: true },
      { key: 'marketing-ads',     label: 'โฆษณา ADS', icon: TrendingUp, built: true },
    ] as MenuItem[],
  },
  {
    key: 'product', label: 'ฝ่ายสินค้า', icon: Package,
    accent: '#f59e0b', bg: '#fffbeb', dot: '#f59e0b',
    menus: [
      { key: 'product-list',   label: 'รายการสินค้าทั้งหมด', icon: List,     built: true  },
      { key: 'product-search', label: 'หาสินค้า',             icon: Search,   built: false },
      { key: 'product-kpi',    label: 'KPI สินค้า',            icon: PieChart, built: false },
      { key: 'products',       label: 'เพิ่มสินค้า',           icon: Package,  built: true  },
      { key: 'packaging',      label: 'วัสดุแพ็กสินค้า',        icon: Archive,  built: true  },
    ] as MenuItem[],
  },
  {
    key: 'warehouse', label: 'ฝ่ายคลังสินค้า', icon: Warehouse,
    accent: '#14b8a6', bg: '#f0fdfa', dot: '#14b8a6',
    menus: [
      { key: 'orders',         label: 'ออเดอร์',          icon: ShoppingCart,    built: true },
      { key: 'flash-export',   label: 'Flash Export',      icon: Truck,           built: true },
      { key: 'myorder-export', label: 'MyOrder Export',    icon: FileSpreadsheet, built: true },
      { key: 'pack-products',  label: 'แพ็คสินค้า',        icon: PackageCheck,    built: true },
      { key: 'requisition',    label: 'ใบเบิกสินค้า',      icon: FileText,        built: true },
      { key: 'pack-history',   label: 'ประวัติแพ็คสินค้า', icon: History,         built: true },
      { key: 'stock',          label: 'จัดการสต็อก',        icon: BarChart2,       built: true },
      { key: 'purchase-order', label: 'ใบสั่งซื้อ (PO)',    icon: ShoppingBag,     built: true },
      { key: 'suppliers',      label: 'จัดการผู้ขาย',        icon: Handshake,       built: true },
    ] as MenuItem[],
  },
  {
    key: 'finance', label: 'ฝ่ายการเงิน', icon: DollarSign,
    accent: '#10b981', bg: '#f0fdf4', dot: '#10b981',
    menus: [
      { key: 'finance-daily',    label: 'บัญชีรายวัน',   icon: BarChart2,       built: true  },
      { key: 'finance-monthly',  label: 'บัญชีรายเดือน', icon: BarChart2,       built: true  },
      { key: 'finance-yearly',   label: 'บัญชีรายปี',    icon: BarChart2,       built: true  },
      { key: 'finance-expenses', label: 'รายจ่าย',        icon: FileText,        built: true  },
      { key: 'finance-income',   label: 'รายรับ',         icon: ArrowDownCircle, built: true  },
      { key: 'finance-cost',     label: 'ต้นทุนสินค้า',   icon: DollarSign,      built: false },
    ] as MenuItem[],
  },
  {
    key: 'hr', label: 'ฝ่าย HR', icon: Building2,
    accent: '#8b5cf6', bg: '#faf5ff', dot: '#8b5cf6',
    menus: [
      { key: 'hr-recruit', label: 'สรรหาพนักงาน',        icon: UserPlus,      built: false },
      { key: 'hr',         label: 'พนักงาน',              icon: Users,         built: true  },
      { key: 'hr-train',   label: 'เทรนพนักงาน',          icon: GraduationCap, built: false },
      { key: 'hr-kpi',     label: 'KPI พนักงาน',           icon: PieChart,      built: false },
      { key: 'hr-sop',     label: 'คู่มือการทำงาน (SOP)', icon: BookOpen,      built: false },
    ] as MenuItem[],
  },
];

export default function Sidebar({ activePage, setActivePage }: SidebarProps) {
  const initOpen = () => {
    const g = GROUPS.find(g => g.menus.some(m => m.key === activePage));
    return new Set<string>(g ? [g.key] : []);
  };
  const [openGroups, setOpenGroups] = useState<Set<string>>(initOpen);

  const toggle = (key: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const activeGroup = GROUPS.find(g => g.menus.some(m => m.key === activePage));

  return (
    <aside className="w-[220px] h-screen shrink-0 flex flex-col bg-white border-r border-slate-100"
      style={{ boxShadow: '2px 0 12px 0 rgba(0,0,0,0.04)' }}>

      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold"
            style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)' }}>
            S
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800 leading-none">SmartOffice</div>
            <div className="text-[10px] text-slate-400 mt-0.5">E-commerce Portal</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {GROUPS.map(group => {
          const isGroupActive = group.menus.some(m => m.key === activePage);
          const isOpen = openGroups.has(group.key);
          const Icon = group.icon;

          return (
            <div key={group.key} className="mb-0.5">
              {/* Group header */}
              <button
                onClick={() => toggle(group.key)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all group"
                style={isGroupActive
                  ? { background: group.bg }
                  : {}
                }
              >
                <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-all"
                  style={isGroupActive
                    ? { background: group.accent + '20' }
                    : { background: '#f1f5f9' }
                  }>
                  <Icon size={13}
                    style={{ color: isGroupActive ? group.accent : '#94a3b8' }}
                  />
                </div>
                <span className="flex-1 text-[13px] font-semibold leading-none"
                  style={{ color: isGroupActive ? group.accent : '#64748b' }}>
                  {group.label}
                </span>
                {isOpen
                  ? <ChevronDown size={12} style={{ color: isGroupActive ? group.accent : '#cbd5e1' }} />
                  : <ChevronRight size={12} style={{ color: '#cbd5e1' }} />
                }
              </button>

              {/* Sub menus */}
              {isOpen && (
                <div className="ml-3 mt-0.5 mb-1 pl-3 space-y-0.5"
                  style={{ borderLeft: `1.5px solid ${group.accent}25` }}>
                  {group.menus.map(menu => {
                    const MIcon = menu.icon;
                    const active = activePage === menu.key;
                    return (
                      <button
                        key={menu.key}
                        onClick={() => setActivePage(menu.key)}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-[12.5px] transition-all"
                        style={active
                          ? {
                              background: group.accent,
                              color: '#fff',
                              boxShadow: `0 2px 8px ${group.accent}40`,
                            }
                          : {
                              color: menu.built ? '#475569' : '#94a3b8',
                            }
                        }
                      >
                        <MIcon size={13} style={{ opacity: menu.built ? 1 : 0.5 }} />
                        <span className="flex-1 leading-none">{menu.label}</span>
                        {!menu.built && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0"
                            style={{ background: '#f1f5f9', color: '#94a3b8' }}>
                            เร็วๆนี้
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="shrink-0 px-4 py-3 border-t border-slate-100">
        <div className="text-[10px] text-slate-300 text-center">
          SmartOffice © 2026
        </div>
      </div>
    </aside>
  );
}
