import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Bus, MapPin, Users, AlertCircle, Loader2, Navigation, ShieldCheck, Radio, ExternalLink } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Skeleton } from '../../components/ui/skeleton';
import { useNavigate } from 'react-router';

export function TransportPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchTransport();
  }, []);

  const fetchTransport = async () => {
    try {
      const transportData = await api.getTransport();
      setData(transportData);
    } catch (err) {
      console.error('Failed to load transport data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRoute = async (id: string) => {
    if (!window.confirm('Delete this route?')) return;
    try {
      await api.deleteTransportRoute(id);
      fetchTransport();
    } catch (err) { /* silent */ }
  };

  const routes = data?.routes || [];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map(i => <Skeleton key={i} className="h-[300px] w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Logistic Protocol</h1>
          <p className="text-gray-500">Fleet synchronization and route optimization registry</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="h-10 rounded-xl font-bold px-5 border-gray-200 text-xs"
            onClick={() => navigate('/transport/driver')}
          >
            <Radio className="w-4 h-4 mr-2" />
            Driver Console
          </Button>
          <Button
            className="h-10 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 rounded-xl font-bold px-6 text-xs"
            onClick={() => navigate('/transport/live')}
          >
            <MapPin className="w-4 h-4 mr-2" />
            Live Tracking
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-600/10 rounded-xl flex items-center justify-center border border-blue-600/20">
                <Bus className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Fleet Size</p>
                <p className="text-2xl font-black text-gray-900">{data?.stats?.totalBuses || '24'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-600/10 rounded-xl flex items-center justify-center border border-green-600/20">
                <Users className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Transportees</p>
                <p className="text-2xl font-black text-gray-900">{data?.stats?.totalStudents || '1,245'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-600/10 rounded-xl flex items-center justify-center border border-indigo-600/20">
                <Navigation className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Active Paths</p>
                <p className="text-2xl font-black text-gray-900">{data?.stats?.activeRoutes || '20'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-600/10 rounded-xl flex items-center justify-center border border-red-600/20">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Maintenance</p>
                <p className="text-2xl font-black text-gray-900">{data?.stats?.maintenanceCount || '4'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {routes.map((route) => (
          <Card key={route.id} className="border-gray-100 shadow-xl shadow-gray-100/50 overflow-hidden group hover:border-blue-200 transition-all">
            <CardHeader className="bg-gray-50/50 border-b p-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-black text-gray-900 group-hover:text-blue-600 transition-colors uppercase tracking-tighter">{route.name}</CardTitle>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">{route.area}</p>
                </div>
                <Badge className={route.status === 'active' ? 'bg-green-600 text-white border-0 font-black text-[10px] px-3' : 'bg-red-600 text-white border-0 font-black text-[10px] px-3'}>
                  {route.status.toUpperCase()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Fleet Unit</p>
                  <p className="font-black text-gray-900 text-sm">{route.bus}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Operator</p>
                  <p className="font-black text-gray-900 text-sm">{route.driver}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-gray-400 uppercase">Unit Saturation</span>
                  <span className="text-sm font-black text-gray-900">{route.students}/{route.capacity}</span>
                </div>
                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${(route.students / route.capacity) > 0.9 ? 'bg-red-600' : 'bg-blue-600'}`}
                    style={{ width: `${(route.students / route.capacity) * 100}%` }}
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <Button variant="outline" className="flex-1 h-10 rounded-xl font-black border-gray-200 hover:bg-blue-50 hover:text-blue-600 transition-all uppercase text-[10px] tracking-widest">
                    <MapPin className="w-3 h-3 mr-2" /> Track Node
                  </Button>
                  <Button className="flex-1 h-10 rounded-xl bg-gray-900 hover:bg-black font-black text-[10px] tracking-widest uppercase transition-all shadow-lg shadow-gray-200">
                    Registry Details
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Live Tracking CTA */}
      <Card className="border-none shadow-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white overflow-hidden relative">
        <CardContent className="p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-bold">Real-time GPS Tracking</h3>
            <p className="text-blue-100 text-sm mt-1 max-w-md">
              Monitor all buses live on an interactive map. Powered by OpenStreetMap — zero cost, full visibility.
            </p>
          </div>
          <Button
            className="bg-white text-blue-600 hover:bg-blue-50 font-bold h-12 px-8 rounded-xl shadow-lg flex items-center gap-2"
            onClick={() => navigate('/transport/live')}
          >
            <ExternalLink className="w-4 h-4" />
            Open Live Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
