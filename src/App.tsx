import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Products from './components/Products';
import ProductList from './components/ProductList';
import Packaging from './components/Packaging';
import PackingMaterials from './components/PackingMaterials';
import PackHistory from './components/PackHistory';
import Requisition from './components/Requisition';
import Stock from './components/Stock';
import PurchaseOrder from './components/PurchaseOrder';
import Suppliers from './components/Suppliers';
import Customers from './components/Customers';
import Orders from './components/Orders';
import FlashExport from './components/FlashExport';
import MyOrderExport from './components/MyOrderExport';
import Finance from './components/Finance';
import FinanceIncome from './components/FinanceIncome';
import Marketing from './components/Marketing';
import HR from './components/HR';

type PageKey =
  | 'products' | 'product-list' | 'packaging' | 'pack-products' | 'pack-history'
  | 'requisition' | 'stock' | 'purchase-order' | 'suppliers'
  | 'customers' | 'orders' | 'flash-export' | 'myorder-export'
  | 'finance-daily' | 'finance-monthly' | 'finance-yearly' | 'finance-expenses'
  | 'finance-income'
  | 'marketing-graphic' | 'marketing-ads' | 'marketing-admin'
  | 'hr';

export default function App() {
  const [activePage, setActivePage] = useState<PageKey>('products');
  const [packagingOrderIds, setPackagingOrderIds] = useState<string[]>([]);
  const [packHistoryId, setPackHistoryId]         = useState<string>('');

  const goToPackaging = (ids: string[]) => {
    setPackagingOrderIds(ids);
    setActivePage('pack-products');
  };

  const goToRequisition = (historyId: string) => {
    setPackHistoryId(historyId);
    setActivePage('requisition');
  };

  const renderPage = () => {
    switch (activePage) {
      case 'products':       return <Products />;
      case 'product-list':   return <ProductList />;
      case 'packaging':      return <PackingMaterials />;
      case 'pack-products':  return <Packaging orderIds={packagingOrderIds} onDone={() => { setPackagingOrderIds([]); setActivePage('orders'); }} onCreateRequisition={goToRequisition}/>;
      case 'pack-history':   return <PackHistory />;
      case 'requisition':    return <Requisition packHistoryId={packHistoryId} />;
      case 'stock':          return <Stock onGoToPO={() => setActivePage('purchase-order')} />;
      case 'purchase-order': return <PurchaseOrder />;
      case 'suppliers':      return <Suppliers />;
      case 'customers':      return <Customers />;
      case 'orders':         return <Orders onImportDone={goToPackaging} />;
      case 'flash-export':   return <FlashExport />;
      case 'myorder-export': return <MyOrderExport />;
      case 'finance-daily':    return <Finance page="daily" />;
      case 'finance-monthly':  return <Finance page="monthly" />;
      case 'finance-yearly':   return <Finance page="yearly" />;
      case 'finance-expenses': return <Finance page="expenses" />;
      case 'finance-income':   return <FinanceIncome />;
      case 'hr':             return <HR />;
      case 'marketing-graphic': return <Marketing page="graphic" />;
      case 'marketing-ads':     return <Marketing page="ads" />;
      case 'marketing-admin':   return <Marketing page="admin" />;
      default:               return <Products />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <Sidebar activePage={activePage} setActivePage={setActivePage} />
      <main className="flex-1 overflow-x-auto">{renderPage()}</main>
    </div>
  );
}
