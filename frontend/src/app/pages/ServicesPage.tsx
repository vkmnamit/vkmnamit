import { Link } from 'react-router';
import { Button } from '../components/ui/button';
import { GraduationCap, CheckCircle, Settings, BookOpen, Wrench, MessageCircle, BrainCircuit, ShieldCheck, RefreshCw } from 'lucide-react';
import { LandingNavbar } from '../components/layout/LandingNavbar';

export function ServicesPage() {
  const services = [
    {
      icon: Settings,
      title: 'Platform Setup & Onboarding',
      desc: 'Complete system setup for your institution, data migration, and customization based on your specific needs.'
    },
    {
      icon: BookOpen,
      title: 'Training & Support',
      desc: 'Hands-on training sessions for staff, easy-to-follow guides, and ongoing support for smooth daily operations.'
    },
    {
      icon: Wrench,
      title: 'Custom Solutions',
      desc: 'Every school is different. We adapt with feature customization, workflow optimization, and integrations.'
    },
    {
      icon: MessageCircle,
      title: 'Communication Integration',
      desc: 'We set up WhatsApp communication systems, email automation, and SMS alerts ensuring you stay connected.'
    },
    {
      icon: BrainCircuit,
      title: 'AI Integration Services',
      desc: 'We assist in implementing student performance tracking models, predictive analytics, and personalized insights.'
    },
    {
      icon: ShieldCheck,
      title: 'Security & Compliance',
      desc: 'Secure data handling, role-based access control, and privacy-focused system design to protect your institution.'
    },
    {
      icon: RefreshCw,
      title: 'Continuous Improvement',
      desc: 'We continuously update features, improve performance, and add new capabilities so your school stays ahead.'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-500/30 w-full overflow-x-hidden">
      {/* Navigation */}
      <LandingNavbar />

      {/* Services Content */}
      <section className="px-6 py-24 max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <h1 className="text-5xl md:text-6xl font-medium tracking-tight text-slate-900 mb-6">
            End-to-End <span className="text-blue-600">Solutions</span>
          </h1>
          <p className="text-slate-600 text-xl max-w-2xl mx-auto leading-relaxed">
            We don’t just provide software — we provide end-to-end solutions for schools to ensure seamless adoption and growth.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service, i) => (
             <div key={i} className="bg-white p-8 rounded-[32px] border border-slate-100 hover:shadow-xl transition-all group">
               <div className="w-14 h-14 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-blue-600 transition-colors">
                  <service.icon className="w-7 h-7 text-blue-600 group-hover:text-white transition-colors" />
               </div>
               <h3 className="text-xl font-semibold mb-4 text-slate-900">{service.title}</h3>
               <p className="text-slate-600 leading-relaxed text-sm">{service.desc}</p>
             </div>
          ))}
        </div>
      </section>
      
      {/* Banner */}
      <section className="px-6 pb-24 max-w-7xl mx-auto">
        <div className="bg-blue-600 rounded-[40px] p-12 md:p-16 flex flex-col md:flex-row items-center justify-between text-white overflow-hidden relative isolate">
           <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 blur-[80px] rounded-full translate-x-1/2 -translate-y-1/2" />
           <div className="max-w-2xl relative z-10 mb-8 md:mb-0">
             <h2 className="text-4xl font-medium mb-4">Ready to transform your school?</h2>
             <p className="text-blue-100 text-lg">Every school is different. Get in touch to learn how our custom solutions adapt to your unique workflow.</p>
           </div>
           <Link to="/contact" className="relative z-10">
             <Button className="bg-white text-blue-600 hover:bg-slate-50 rounded-full px-8 py-6 text-lg font-semibold shadow-xl">
               Request Custom Proposal
             </Button>
           </Link>
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
