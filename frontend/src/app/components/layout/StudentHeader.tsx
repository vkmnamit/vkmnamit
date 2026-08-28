import React from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { DashboardSubNav } from './DashboardSubNav';

export function StudentHeader() {
  const { user } = useAuth();

  return (
    <div className="w-full flex flex-col">
      {/* Top Branding Bar */}
      <div className="bg-white border-b border-gray-200 px-8 py-3 flex items-center justify-between">
        <Link to="/dashboard/student" aria-label="Go to student dashboard" className="flex items-center gap-4 rounded-lg [-webkit-tap-highlight-color:transparent] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900">
          <img 
            src="https://res.cloudinary.com/dgrrdy6sk/image/upload/v1777535903/ChatGPT_Image_Apr_30__2026__11_33_17_AM-removebg-preview_vi9twl.png" 
            alt="Kautix Logo" 
            className="h-10 w-auto grayscale brightness-0" 
          />
          <div>
             <h2 className="text-lg font-bold text-gray-800 leading-tight">Kautix System Access</h2>
             <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none">Administrative & Academic Management</p>
          </div>
        </Link>
        
        <div className="flex items-center gap-6">
           <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-gray-700">{user?.email}</p>
              <p className="text-[10px] text-gray-400 font-bold uppercase">{user?.id.split('-')[0]}</p>
           </div>
           <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg">
             {user?.name?.[0]}
           </div>
        </div>
      </div>

      {/* Sub Nav */}
      <DashboardSubNav />
    </div>
  );
}
