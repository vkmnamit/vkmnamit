import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { MapPin, Navigation, Power, AlertTriangle, Bus } from 'lucide-react';
import { toast } from 'sonner';
import { io, Socket } from 'socket.io-client';

export function DriverTrackingPage() {
  const { user } = useAuth();
  const [isTracking, setIsTracking] = useState(false);
  const [currentPos, setCurrentPos] = useState<{lat: number, lng: number} | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [watchId, setWatchId] = useState<number | null>(null);

  useEffect(() => {
    // Initialize socket connection
    const API_BASE_URL = import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, '')?.replace(/\/+$/, '') || 'http://localhost:3000';
    const newSocket = io(API_BASE_URL); // Use your API URL
    setSocket(newSocket);

    return () => {
      newSocket.close();
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const toggleTracking = () => {
    if (isTracking) {
      if (watchId) navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
      setIsTracking(false);
      toast.info('Location sharing stopped');
    } else {
      if (!navigator.geolocation) {
        toast.error('Geolocation is not supported by your browser');
        return;
      }

      setIsTracking(true);
      toast.success('Location sharing started');

      const id = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, speed, heading } = position.coords;
          setCurrentPos({ lat: latitude, lng: longitude });

          // Send to socket
          if (socket && user?.school_id) {
            socket.emit('update-location', {
              busId: user.id, // Using user ID as bus ID for demo
              schoolId: user.school_id,
              lat: latitude,
              lng: longitude,
              speed: speed || 0,
              heading: heading || 0
            });
          }
        },
        (error) => {
          console.error('GPS Error:', error);
          toast.error('Failed to get GPS signal. Please ensure location is enabled.');
          setIsTracking(false);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );
      setWatchId(id);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6 pb-10">
      <div className="text-center space-y-2 pt-4">
        <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-blue-600/20 mb-4">
          <Bus className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Driver Console</h1>
        <p className="text-sm text-gray-500 font-medium tracking-tight">Kautix Real-time Tracking System</p>
      </div>

      <Card className={`border-none shadow-xl transition-all duration-500 ${isTracking ? 'bg-blue-600' : 'bg-white'}`}>
        <CardContent className="p-8 text-center">
          <div className={`w-24 h-24 rounded-full mx-auto flex items-center justify-center mb-6 transition-all border-4 ${isTracking ? 'bg-white border-blue-400 animate-pulse' : 'bg-gray-50 border-gray-100'}`}>
            <Navigation className={`w-10 h-10 ${isTracking ? 'text-blue-600' : 'text-gray-300'}`} />
          </div>

          <h2 className={`text-xl font-bold mb-2 ${isTracking ? 'text-white' : 'text-gray-900'}`}>
            {isTracking ? 'Sharing Live Location' : 'Location Sharing Offline'}
          </h2>
          <p className={`text-sm mb-8 ${isTracking ? 'text-blue-100' : 'text-gray-500'}`}>
            {isTracking ? 'Buses and parents can now see your live position.' : 'Tap start to begin broadcasting your GPS coordinates.'}
          </p>

          <Button 
            onClick={toggleTracking}
            className={`w-full h-14 rounded-2xl font-bold text-lg shadow-lg transition-all ${
              isTracking 
              ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20' 
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'
            }`}
          >
            <Power className="w-5 h-5 mr-3" />
            {isTracking ? 'Stop Sharing' : 'Start Sharing'}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card className="border-none shadow-sm bg-white">
          <CardContent className="p-4 flex flex-col items-center text-center">
            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center mb-2">
              <MapPin className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</p>
            <p className="text-xs font-bold text-gray-900 mt-1">{isTracking ? 'GPS ACTIVE' : 'GPS IDLE'}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white">
          <CardContent className="p-4 flex flex-col items-center text-center">
            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center mb-2">
              <AlertTriangle className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Emergency</p>
            <button className="text-xs font-bold text-red-600 mt-1 hover:underline">SEND SOS</button>
          </CardContent>
        </Card>
      </div>

      {currentPos && isTracking && (
        <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
          <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Current Coordinates</p>
          <p className="text-xs font-mono font-bold text-blue-600">{currentPos.lat.toFixed(6)}, {currentPos.lng.toFixed(6)}</p>
        </div>
      )}
    </div>
  );
}
