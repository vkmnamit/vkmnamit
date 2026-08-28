import { Link } from 'react-router';
import { Button } from '../components/ui/button';
import { GraduationCap, Mail, Phone, MapPin, Clock, MessageCircle } from 'lucide-react';
import { LandingNavbar } from '../components/layout/LandingNavbar';

export function ContactPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-500/30 flex flex-col w-full overflow-x-hidden">
      {/* Navigation */}
      <LandingNavbar />

      {/* Contact Content */}
      <section className="px-6 py-24 max-w-7xl mx-auto flex-grow w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          <div>
            <h1 className="text-5xl md:text-6xl font-medium tracking-tight text-slate-900 mb-6">
              Let’s Build Smarter <br /><span className="text-blue-600">Schools Together</span>
            </h1>
            <p className="text-slate-600 text-lg leading-relaxed mb-12 max-w-md">
              We’re here to simplify operations, improve communication, and bring intelligent insights into your institution.
            </p>
            
            <div className="space-y-8">
               <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-slate-200 shadow-sm">
                     <Mail className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-1">Email</h4>
                    <p className="text-slate-500">vkmnamit@gmail.com</p>
                  </div>
               </div>
               <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-slate-200 shadow-sm">
                     <Phone className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-1">Phone / WhatsApp</h4>
                    <p className="text-slate-500">8252208088</p>
                    <p className="text-slate-400 text-sm mt-1">Contact: Namit Raj</p>
                  </div>
               </div>
               <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-slate-200 shadow-sm">
                     <Clock className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-1">Availability</h4>
                    <p className="text-slate-500">Monday to Saturday<br/>Flexible timings (as per your convenience)</p>
                  </div>
               </div>
               <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-slate-200 shadow-sm">
                     <MessageCircle className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-1">Reach Out For</h4>
                    <p className="text-slate-500">Product Demo • Pricing Details • Custom Solutions • Partnership Opportunities</p>
                  </div>
               </div>
            </div>
          </div>
          
          <div className="bg-white p-8 md:p-12 rounded-[40px] border border-slate-200 shadow-2xl shadow-blue-900/5 h-fit">
             <h3 className="text-2xl font-semibold mb-8 text-slate-900">Quick Message</h3>
             <form className="space-y-6">
                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
                   <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" placeholder="Enter your name" />
                </div>
                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-2">School Name</label>
                   <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" placeholder="Enter institution name" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                     <label className="block text-sm font-medium text-slate-700 mb-2">Contact Number</label>
                     <input type="tel" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" placeholder="Enter phone" />
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
                     <input type="email" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" placeholder="Enter email" />
                  </div>
                </div>
                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-2">Message</label>
                   <textarea rows={4} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" placeholder="How can we help?"></textarea>
                </div>
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl h-14 font-semibold shadow-xl shadow-blue-600/20">
                  Send Message
                </Button>
             </form>
          </div>
        </div>
      </section>

      <footer className="bg-[#0a0a0a] pt-12 pb-8 px-6 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
           <Link to="/" className="flex items-center">
             <img src="https://res.cloudinary.com/dgrrdy6sk/image/upload/v1777535903/ChatGPT_Image_Apr_30__2026__11_33_17_AM-removebg-preview_vi9twl.png" alt="Kautix Logo" className="h-10 w-auto brightness-0 invert" />
           </Link>
           <p className="text-slate-500 text-xs">&copy; 2026 Kautix Inc. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
