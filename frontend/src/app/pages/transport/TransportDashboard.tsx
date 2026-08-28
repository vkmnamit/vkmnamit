import React, { useState, useEffect } from 'react';
import { LiveMap } from '../../components/transport/LiveMap';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Search, Bus, MapPin, TrendingUp, AlertCircle, Phone, Navigation } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../../context/AuthContext';

export function TransportDashboard() {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [buses, setBuses] = useState<Record<string, any>>({});
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const API_BASE_URL = import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, '')?.replace(/\/+$/, '') || 'http://localhost:3000';
    const newSocket = io(API_BASE_URL);
    setSocket(newSocket);

    if (user?.school_id) {
      newSocket.emit('join-room', user.school_id);
    }

    newSocket.on('bus-location-updated', (data) => {
      setBuses(prev => ({
        ...prev,
        [data.busId]: {
          ...data,
          lastSeen: new Date().toISOString()
        }
      }));
    });

    return () => {
      newSocket.close();
    };
  }, [user?.school_id]);

  const vehiclesForMap = Object.values(buses).map(b => ({
    id: b.busId,
    lat: b.lat,
    lng: b.lng,
    label: `Bus ${b.busId.substring(0, 4)}`,
    details: `${b.speed || 0} km/h • Last updated ${new Date(b.lastSeen).toLocaleTimeString()}`
  }));

  const filteredBuses = Object.values(buses).filter(b => 
    b.busId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 max-w-full overflow-x-hidden pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Transport Nexus</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Real-time GPS monitoring and fleet analytics</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="h-11 px-5 rounded-xl font-bold text-xs border-gray-200 bg-white">
            <Navigation className="w-4 h-4 mr-2" />
            Route Optimization
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 h-11 px-6 rounded-xl shadow-xl shadow-blue-600/20 font-bold text-xs transition-all">
            <AlertCircle className="w-4 h-4 mr-2" />
            Emergency Broadcast
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Fleet List */}
        <div className="space-y-6">
          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="bg-gray-50/50 py-5 px-6 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input 
                  placeholder="Search fleet ID..." 
                  className="pl-12 h-10 rounded-xl border-gray-100 bg-white focus:border-blue-600"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0 max-h-[600px] overflow-y-auto">
              {filteredBuses.length > 0 ? (
                filteredBuses.map((bus) => (
                  <div key={bus.busId} className="p-5 border-b border-gray-50 hover:bg-slate-50 transition-colors cursor-pointer group">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                          <Bus className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold text-sm text-gray-900">Bus ID: {bus.busId.substring(0, 8)}</p>
                          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mt-0.5">Live Now</p>
                        </div>
                      </div>
                      <Badge className="bg-blue-600 text-white border-none font-bold text-[10px] px-2 py-0.5">{bus.speed} km/h</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                        <MapPin className="w-3 h-3" />
                        {bus.lat.toFixed(4)}, {bus.lng.toFixed(4)}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                        <TrendingUp className="w-3 h-3" />
                        {new Date(bus.lastSeen).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="outline" className="flex-1 h-8 rounded-lg text-[10px] font-bold">Trace Route</Button>
                      <Button size="sm" className="bg-blue-600 h-8 rounded-lg text-[10px] font-bold flex items-center gap-1">
                        <Phone className="w-3 h-3" /> Call
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Bus className="w-8 h-8 text-slate-200" />
                  </div>
                  <p className="text-sm font-bold text-slate-400">No active tracking signals detected.</p>
                  <p className="text-[10px] text-slate-300 mt-1 uppercase font-bold tracking-widest">Waiting for driver input...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Live Map Area */}
        <div className="lg:col-span-2 h-[600px] lg:h-auto min-h-[600px]">
          <LiveMap vehicles={vehiclesForMap} zoom={12} />
        </div>
      </div>
    </div>
  );
}
