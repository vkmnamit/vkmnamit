import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Skeleton } from '../../components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Coffee, TrendingUp, ShoppingCart, Plus, Search, DollarSign, Package } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { openRazorpayCheckout } from '../../../lib/razorpay';
import { toast } from 'sonner';

export function CanteenPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});

  useEffect(() => { fetchCanteen(); }, []);

  const fetchCanteen = async () => {
    try {
      const d = await api.getCanteen();
      setData(d);
    } catch {
      setData({
        menu: [],
        stats: { todayRevenue: 0, ordersToday: 0, topItem: '-', monthRevenue: 0 },
        salesTrend: [],
      });
    } finally {
      setLoading(false);
    }
  };

  const menu: any[] = data?.menu || [];
  const stats = data?.stats || {};
  const salesTrend = data?.salesTrend || [];

  const categories = ['All', ...Array.from(new Set(menu.map((i: any) => i.category)))];
  const [activeCategory, setActiveCategory] = useState('All');

  const filtered = menu.filter((item: any) => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === 'All' || item.category === activeCategory;
    return matchSearch && matchCat;
  });

  const addToCart = (id: number) => setCart(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  const removeFromCart = (id: number) => setCart(prev => {
    const n = { ...prev };
    if (n[id] > 1) n[id]--; else delete n[id];
    return n;
  });
  const cartTotal = Object.entries(cart).reduce((sum, [id, qty]) => {
    const item = menu.find((m: any) => String(m.id) === id);
    return sum + (item?.price || 0) * qty;
  }, 0);
  const cartItems = Object.keys(cart).length;

  const handleCheckout = async () => {
    if (cartTotal === 0) return;
    try {
      await openRazorpayCheckout({
        amount: cartTotal,
        purpose: 'Canteen Order',
      });
      
      // Save order to backend
      const orderItems = Object.entries(cart).map(([id, qty]) => {
        const item = menu.find((m: any) => String(m.id) === id);
        return {
          id: item.id,
          quantity: qty,
          price: item.price
        };
      });

      await api.createCanteenOrder({
        items: orderItems,
        total_amount: cartTotal
      });

      toast.success('Order placed successfully!');
      setCart({}); // Clear cart
      fetchCanteen(); // Refresh stats and menu
    } catch (error) {
      toast.error('Payment failed or was cancelled');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-full overflow-x-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-full overflow-x-hidden pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Canteen</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Menu management and daily sales tracking</p>
        </div>
        <div className="flex items-center gap-3">
          {cartItems > 0 && (
            <Button 
              onClick={handleCheckout}
              className="h-11 px-6 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20"
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              Checkout ({cartItems}) · ₹{cartTotal}
            </Button>
          )}
          <Button className="bg-blue-600 hover:bg-blue-700 h-11 px-6 rounded-xl shadow-xl shadow-blue-600/20 font-bold text-xs">
            <Plus className="w-4 h-4 mr-2" /> Add Item
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: "Today's Revenue", value: `₹${(stats.todayRevenue || 0).toLocaleString()}`, icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
          { label: 'Orders Today', value: stats.ordersToday || '—', icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
          { label: 'Top Item', value: stats.topItem || '—', icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-100' },
          { label: 'Monthly Revenue', value: `₹${((stats.monthRevenue || 0) / 1000).toFixed(0)}K`, icon: Package, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="border-none shadow-sm bg-white overflow-hidden group">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 ${s.bg} rounded-xl flex items-center justify-center border group-hover:scale-110 transition-transform`}>
                    <Icon className={`w-6 h-6 ${s.color}`} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{s.label}</p>
                    <p className={`${s.label === 'Top Item' ? 'text-base' : 'text-2xl'} font-bold text-gray-900`}>{s.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="menu" className="space-y-6">
        <TabsList className="bg-gray-100 p-1 rounded-xl h-11">
          <TabsTrigger value="menu" className="rounded-lg px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm font-bold text-xs">Menu</TabsTrigger>
          <TabsTrigger value="analytics" className="rounded-lg px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm font-bold text-xs">Sales Analytics</TabsTrigger>
        </TabsList>

        {/* ── MENU TAB ─────────────────────────────────────────── */}
        <TabsContent value="menu" className="outline-none space-y-6">
          {/* Search + Category Filter */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input placeholder="Search menu..." className="pl-12 h-10 rounded-xl border-gray-200 font-medium text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-2 flex-wrap">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeCategory === cat
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Menu Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((item: any) => (
              <Card key={item.id} className={`border-none shadow-sm overflow-hidden group transition-all ${!item.available ? 'opacity-60' : 'hover:shadow-md'}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="text-4xl">{item.image}</div>
                    <Badge className={`text-[10px] font-bold px-2 py-0.5 rounded-full border-none ${
                      item.available ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {item.available ? 'Available' : 'Unavailable'}
                    </Badge>
                  </div>
                  <h3 className="font-bold text-sm text-gray-900 mb-1">{item.name}</h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">{item.category}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-gray-900">₹{item.price}</span>
                    {item.available && (
                      <div className="flex items-center gap-1">
                        {cart[item.id] ? (
                          <>
                            <button onClick={() => removeFromCart(item.id)} className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center font-bold text-gray-700 hover:bg-gray-200 transition-colors text-sm">−</button>
                            <span className="w-7 text-center font-bold text-sm text-gray-900">{cart[item.id]}</span>
                            <button onClick={() => addToCart(item.id)} className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white hover:bg-blue-700 transition-colors text-sm">+</button>
                          </>
                        ) : (
                          <button onClick={() => addToCart(item.id)} className="h-8 px-4 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors">Add</button>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── ANALYTICS TAB ─────────────────────────────────────── */}
        <TabsContent value="analytics" className="outline-none">
          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="py-5 px-6 border-b border-gray-50">
              <CardTitle className="text-sm font-bold text-gray-900">Weekly Sales Revenue</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={salesTrend} barSize={40}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600, fill: '#94a3b8' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600, fill: '#94a3b8' }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9', fontFamily: 'Inter', fontSize: 12 }} formatter={(v: any) => [`₹${Number(v).toLocaleString()}`, 'Sales']} />
                  <Bar dataKey="sales" fill="#3b82f6" radius={[8, 8, 0, 0]} name="Sales" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
