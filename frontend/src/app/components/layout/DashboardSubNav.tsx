import React from 'react';
import { Link, useLocation } from 'react-router';

export function DashboardSubNav() {
  const location = useLocation();
  
  const navItems = [
    { label: 'HOME', path: '/dashboard/student' },
    { label: 'FEE', path: '/fees' },
    { label: 'FEEDBACK', path: '/feedback' },
    { label: 'REGISTRATION', path: '/registration' },
    { label: 'HALL-TICKET', path: '/exams' },
    { label: 'OTHERS', path: '/others' },
    { label: 'APPLY FORMS', path: '/forms' },
    { label: 'USER MANUALS', path: '/manuals' },
    { label: 'LOGOUT', path: '/logout' },
  ];

  return (
    <div className="bg-[#1A1A1A] text-white px-8 h-10 flex items-center gap-6 overflow-x-auto scrollbar-none border-b border-gray-800">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <Link 
            key={item.label} 
            to={item.path}
            className={`text-[10px] font-black tracking-widest whitespace-nowrap h-full flex items-center border-b-2 transition-all ${
              isActive ? 'border-white text-white' : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
