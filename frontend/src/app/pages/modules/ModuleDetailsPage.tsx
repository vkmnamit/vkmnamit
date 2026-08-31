import { useParams, Link } from 'react-router';
import { Button } from '../../components/ui/button';
import { GraduationCap, CheckCircle, ArrowLeft } from 'lucide-react';

const MODULES = {
  admissions: {
    title: 'Admissions Module',
    tagline: 'Simplify and digitize the entire student enrollment process.',
    overview: 'The Admissions Module simplifies and digitizes the entire student enrollment process — from application to final admission — making it fast, organized, and error-free.',
    features: [
      'Online admission form submission',
      'Application tracking system',
      'Document upload & verification',
      'Automated shortlist & approval workflow',
      'Admission status notifications (Email / WhatsApp / SMS)'
    ],
    howItHelps: [
      'Reduces paperwork and manual errors',
      'Speeds up admission process',
      'Provides transparency to parents',
      'Keeps all records centralized'
    ],
    useCase: 'A school can handle hundreds of applications seamlessly without losing track or creating confusion.',
    outcome: 'Faster admissions, better organization, and improved parent experience.'
  },
  learning: {
    title: 'Learning Management',
    tagline: 'A complete digital learning environment for your institution.',
    overview: 'A complete digital learning environment where teachers can manage classes, share resources, and track student progress effectively.',
    features: [
      'Assignment creation & submission',
      'Study material sharing',
      'Online tests and quizzes',
      'Performance tracking',
      'AI-based learning insights'
    ],
    howItHelps: [
      'Enhances teaching efficiency',
      'Supports hybrid/online learning',
      'Identifies weak areas in students',
      'Improves academic outcomes'
    ],
    useCase: 'Teachers can assign homework, evaluate performance, and provide feedback — all in one place.',
    outcome: 'Better engagement, smarter learning, and improved results.'
  },
  finance: {
    title: 'Finance & Fees Management',
    tagline: 'Streamlined fee collection and comprehensive financial tracking.',
    overview: 'A robust system to manage fee structures, automate collection, handle discounts and fines, and generate detailed financial reports.',
    features: [
      'Automated fee generation and collection',
      'Custom fee structures and categories',
      'Integrated payment gateways',
      'Real-time discount and fine calculation',
      'Comprehensive financial analytics and reports'
    ],
    howItHelps: [
      'Eliminates manual fee tracking errors',
      'Increases fee collection speed',
      'Provides clear financial visibility',
      'Simplifies auditing and reporting'
    ],
    useCase: 'Administrators can easily track pending dues, send automated reminders, and generate comprehensive revenue reports.',
    outcome: 'Improved financial health, transparency, and administrative efficiency.'
  },
  inventory: {
    title: 'Inventory Control',
    tagline: 'Manage and monitor all school assets and resources efficiently.',
    overview: 'Manage and monitor all school assets and resources efficiently with a centralized inventory system.',
    features: [
      'Asset tracking (lab equipment, books, etc.)',
      'Stock management',
      'Issue/return tracking',
      'Low-stock alerts',
      'Purchase and usage history'
    ],
    howItHelps: [
      'Prevents loss and mismanagement',
      'Maintains accurate records',
      'Optimizes resource usage',
      'Saves costs'
    ],
    useCase: 'Schools can track lab equipment, classroom resources, and office supplies without manual registers.',
    outcome: 'Better control, reduced wastage, and efficient resource management.'
  }
};

export function ModuleDetailsPage() {
  const { moduleId } = useParams();
  const moduleData = MODULES[moduleId as keyof typeof MODULES];

  if (!moduleData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Module not found</h1>
          <Link to="/">
            <Button>Return Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-500/30 flex flex-col w-full overflow-x-hidden">
      {/* Navigation */}
      <nav className="w-full z-50 bg-slate-50 px-6 py-6 border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">KAUTIX</span>
          </Link>
          
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <Link to="/" className="hover:text-slate-900 transition-colors">Home</Link>
            <Link to="/about" className="hover:text-slate-900 transition-colors">About Us</Link>
            <Link to="/features" className="hover:text-slate-900 transition-colors">Features</Link>
            <Link to="/services" className="hover:text-slate-900 transition-colors">Services</Link>
            <Link to="/contact" className="hover:text-slate-900 transition-colors">Contact</Link>
          </div>

          <div className="flex items-center gap-4">
            <Link to="/login">
              <Button variant="ghost" className="text-sm font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-200/50 rounded-full px-6">Log in</Button>
            </Link>
            <Link to="/register">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-6 rounded-full shadow-md shadow-blue-600/20">Get in touch</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="w-full bg-slate-900 py-24 md:py-32 px-6 text-white text-center">
         <div className="max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-7xl font-medium tracking-tight mb-6">{moduleData.title}</h1>
            <p className="text-xl md:text-2xl text-slate-300 font-medium max-w-3xl mx-auto leading-relaxed">
              {moduleData.tagline}
            </p>
         </div>
      </section>

      {/* Content Section */}
      <section className="w-full bg-white py-24 px-6 border-b border-slate-100 flex-grow">
         <div className="max-w-7xl mx-auto">
            
            <div className="max-w-4xl mx-auto mb-20 text-center">
                 <h3 className="text-sm font-bold tracking-widest text-blue-600 uppercase mb-4">Overview</h3>
                 <p className="text-2xl text-slate-700 leading-relaxed font-medium">{moduleData.overview}</p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mb-24">
               {/* Features */}
               <div className="bg-slate-50 p-10 md:p-12 rounded-[40px] border border-slate-100">
                  <h3 className="text-2xl font-semibold text-slate-900 mb-8">Key Features</h3>
                  <ul className="space-y-6">
                    {moduleData.features.map((item, i) => (
                      <li key={i} className="flex items-start gap-4 text-slate-700">
                        <CheckCircle className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
                        <span className="text-lg leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
               </div>

               {/* Benefits */}
               <div className="bg-slate-50 p-10 md:p-12 rounded-[40px] border border-slate-100">
                  <h3 className="text-2xl font-semibold text-slate-900 mb-8">How It Helps</h3>
                  <ul className="space-y-6">
                    {moduleData.howItHelps.map((item, i) => (
                      <li key={i} className="flex items-start gap-4 text-slate-700">
                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                           <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                        </div>
                        <span className="text-lg leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
               </div>
            </div>
            
            <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch mb-24">
               <div className="bg-blue-600 text-white p-10 rounded-[32px] flex flex-col justify-center">
                 <h3 className="text-sm font-bold tracking-widest text-blue-200 uppercase mb-4">Real Use Case</h3>
                 <p className="text-2xl font-medium italic leading-relaxed">"{moduleData.useCase}"</p>
               </div>
               
               <div className="bg-slate-900 text-white p-10 rounded-[32px] flex flex-col justify-center">
                 <h3 className="text-sm font-bold tracking-widest text-slate-400 uppercase mb-4">Final Outcome</h3>
                 <p className="text-3xl font-medium leading-tight">{moduleData.outcome}</p>
               </div>
            </div>
            
            <div className="text-center">
              <h2 className="text-4xl font-medium text-slate-900 mb-8">Ready to streamline your workflow?</h2>
              <Link to="/contact">
                <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-12 py-8 text-xl font-semibold shadow-xl shadow-blue-600/20">
                  Request a Demo
                </Button>
              </Link>
            </div>

         </div>
      </section>

      <footer className="bg-[#0a0a0a] pt-12 pb-8 px-6 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
           <div className="flex items-center gap-2 mb-4 md:mb-0">
             <GraduationCap className="w-5 h-5 text-white" />
             <span className="text-xl font-bold tracking-tight text-white">KAUTIX</span>
           </div>
           <p className="text-slate-500 text-xs">&copy; 2026 Kautix Inc. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
