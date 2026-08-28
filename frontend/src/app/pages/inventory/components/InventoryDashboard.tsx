import { useState, useEffect } from 'react';
import { api } from '../../../../lib/api';
import { Skeleton } from '../../../components/ui/skeleton';
import { Package, AlertTriangle, CheckCircle, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';

export function InventoryDashboard({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await api.getInventory();
      setStats(res.stats);
    } catch (err) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
      </div>
    );
  }

  const statCards = [
    { label: 'Total Items', value: stats?.total || 0, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100', tab: 'items' },
    { label: 'Low Stock', value: stats?.lowStock || 0, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100', tab: 'items' },
    { label: 'Well Stocked', value: stats?.good || 0, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100', tab: 'items' },
    { label: 'Out of Stock', value: stats?.outOfStock || 0, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50 border-red-100', tab: 'items' },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div 
              key={index} 
              onClick={() => onNavigate(stat.tab)}
              className={`p-6 rounded-2xl border cursor-pointer hover:shadow-md transition-shadow ${stat.bg}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.label}</p>
                  <p className="text-3xl font-bold mt-2 text-gray-900">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-xl bg-white/60 ${stat.color}`}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         {/* Placeholder for charts or recent transactions */}
         <div className="p-6 border rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 h-64">
           Recent Transactions Chart
         </div>
         <div className="p-6 border rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 h-64">
           Stock Distribution Pie Chart
         </div>
      </div>
    </div>
  );
}
