import { Link } from 'react-router';
import { Button } from '../components/ui/button';
import { GraduationCap, Layers, ArrowUpRight, Zap, Users, Shield, DollarSign, Calendar, MessageSquare, BarChart, BrainCircuit, LayoutDashboard, CreditCard } from 'lucide-react';
import { LandingNavbar } from '../components/layout/LandingNavbar';

export function FeaturesPage() {
  const features = [
    {
      icon: Users,
      title: 'Smart Administration',
      desc: 'Manage your entire institution from one place. Student & staff management, daily automated attendance, fee management with real-time status, and inventory. Everything is organized, reducing manual work and errors.',
    },
    {
      icon: MessageSquare,
      title: 'Unified Communication System',
      desc: 'Stay connected with everyone instantly. Parent-Teacher messaging, Admin announcements, WhatsApp/Email/SMS notifications, and event/emergency alerts. No more communication gaps or delays.',
    },
    {
      icon: BrainCircuit,
      title: 'AI-Powered Insights',
      desc: 'Turn data into actionable intelligence. Student performance analysis, personalized improvement suggestions, weak area detection, and teacher performance insights. Move from guesswork to data-driven decisions.',
    },
    {
      icon: LayoutDashboard,
      title: 'Parent & Student Dashboard',
      desc: 'A simple and transparent experience. Real-time academic updates, attendance tracking, easy fee payment systems, and direct communication with teachers. Parents stay informed, students stay motivated.',
    },
    {
      icon: CreditCard,
      title: 'Integrated Payments',
      desc: 'Smooth and secure transactions. Online fee collection, payment reminders, auto-generated receipts, and comprehensive payment history tracking. Simplifying financial management for schools and parents.',
    },
    {
      icon: BarChart,
      title: 'Analytics & Reports',
      desc: 'Gain complete visibility. Academic performance reports, attendance trends, financial insights, and custom downloadable reports. Make better decisions with clear data.',
    },
    {
      icon: Zap,
      title: 'Scalable & Fast',
      desc: 'Built for growth. Works for small schools to large institutions, handles thousands of users seamlessly, and is completely cloud-based for reliability and speed.',
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-500/30 w-full overflow-x-hidden">
      {/* Navigation */}
      <LandingNavbar />

      {/* Hero Section */}
      <section className="relative px-6 py-32 overflow-hidden bg-slate-900 rounded-b-[60px]">
        <img 
          src="/assets/classroom.png" 
          alt="Features of Kautix" 
          className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-overlay"
        />
        <div className="max-w-7xl mx-auto text-center relative z-10">
          <h1 className="text-3xl md:text-7xl font-medium tracking-tight text-white mb-6">
            Features built for <br /><span className="text-blue-400">Scale & Simplicity</span>
          </h1>
          <p className="text-slate-300 text-xl max-w-3xl mx-auto leading-relaxed">
            Our platform is designed to simplify school operations while enhancing learning, communication, and decision-making through smart technology.
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section className="bg-white py-24 px-6 border-y border-slate-100">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((f, i) => (
              <div key={i} className="p-8 rounded-[32px] bg-slate-50 border border-slate-100 hover:shadow-xl hover:border-blue-200 transition-all">
                <div className="w-14 h-14 bg-white border border-slate-200 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                  <f.icon className="w-7 h-7 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold mb-4 text-slate-900">{f.title}</h3>
                <p className="text-slate-600 leading-relaxed text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0a0a0a] pt-12 pb-8 px-6">
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
