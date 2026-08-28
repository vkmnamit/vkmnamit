import { Link, useLocation } from 'react-router';
import { Button } from '../ui/button';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

export function LandingNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'About Us', path: '/about' },
    { name: 'Features', path: '/features' },
    { name: 'Services', path: '/services' },
    { name: 'Contact', path: '/contact' },
  ];

  return (
    <>
      <nav className="w-full z-50 bg-slate-50 px-6 py-6 border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center z-50">
            <img src="https://res.cloudinary.com/dgrrdy6sk/image/upload/v1777535903/ChatGPT_Image_Apr_30__2026__11_33_17_AM-removebg-preview_vi9twl.png" alt="Kautix Logo" className="h-10 md:h-16 w-auto" />
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            {navLinks.map((link) => (
              <Link 
                key={link.name} 
                to={link.path} 
                className={`transition-colors ${location.pathname === link.path ? 'text-slate-900 font-semibold' : 'hover:text-slate-900'}`}
              >
                {link.name}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Link to="/login">
              <Button variant="ghost" className="text-sm font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-200/50 rounded-full px-6">
                Log in
              </Button>
            </Link>
            <Link to="/contact">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-6 rounded-full shadow-md shadow-blue-600/20">
                Get in touch
              </Button>
            </Link>
          </div>

          {/* Mobile Actions */}
          <div className="flex items-center gap-2 md:hidden">
            <Link to="/login" className="z-50">
              <Button variant="ghost" className="text-sm font-bold text-slate-700 hover:text-slate-900 px-3">
                Log in
              </Button>
            </Link>
            <button
              aria-label="Toggle navigation menu"
              className="z-50 p-2 -mr-2 text-slate-600"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Sidebar */}
      <div className={`fixed inset-0 bg-slate-50 z-40 transform transition-transform duration-300 ease-in-out ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'} md:hidden pt-24 px-6 flex flex-col`}>
        <div className="flex flex-col gap-6 text-lg font-medium text-slate-600 mb-8">
          {navLinks.map((link) => (
            <Link 
              key={link.name} 
              to={link.path} 
              className={`transition-colors ${location.pathname === link.path ? 'text-slate-900 font-semibold' : 'hover:text-slate-900'}`} 
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.name}
            </Link>
          ))}
        </div>
        <Link to="/contact" onClick={() => setMobileMenuOpen(false)}>
          <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl h-12 shadow-md shadow-blue-600/20">
            Get in touch
          </Button>
        </Link>
      </div>
    </>
  );
}
