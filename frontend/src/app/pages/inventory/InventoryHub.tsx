import { useState } from 'react';
import { Package, BookOpen, Settings, LayoutDashboard, History } from 'lucide-react';
import { InventoryDashboard } from './components/InventoryDashboard';
import { InventoryItems } from './components/InventoryItems';
import { InventoryTransactions } from './components/InventoryTransactions';
import { InventoryDistribution } from './components/InventoryDistribution';
import { InventoryRequirements } from './components/InventoryRequirements';
import { InventoryKits } from './components/InventoryKits';

export function InventoryHub() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'items', label: 'Products & Stock', icon: Package },
    { id: 'requirements', label: 'Class Requirements', icon: Settings },
    { id: 'distribution', label: 'Student Distribution', icon: BookOpen },
    { id: 'kits', label: 'Kit Templates', icon: Package },
    { id: 'transactions', label: 'History', icon: History },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory & Assets</h1>
          <p className="text-gray-500">Manage school stock, assets, and student distributions</p>
        </div>
      </div>

      <div className="flex space-x-1 bg-white p-1 rounded-xl border border-gray-200 overflow-x-auto shadow-sm mobile-edge">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                isActive 
                  ? 'bg-orange-50 text-orange-700 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-orange-600' : 'text-gray-400'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-6 min-h-[500px] mobile-edge">
        { activeTab === 'dashboard' && <InventoryDashboard onNavigate={setActiveTab} /> }
        { activeTab === 'items' && <InventoryItems /> }
        { activeTab === 'distribution' && <InventoryDistribution /> }
        { activeTab === 'kits' && <InventoryKits /> }
        { activeTab === 'transactions' && <InventoryTransactions /> }
        { activeTab === 'requirements' && <InventoryRequirements /> }
      </div>
    </div>
  );
}
