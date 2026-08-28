import { Link } from 'react-router';
import { Button } from '../components/ui/button';
import { GraduationCap, Layers, Lightbulb, Target, Settings, TrendingUp, CheckCircle, BrainCircuit, Users } from 'lucide-react';
import { LandingNavbar } from '../components/layout/LandingNavbar';

export function AboutPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-500/30 w-full overflow-x-hidden">
      {/* Navigation */}
      <LandingNavbar />

      {/* Hero Section */}
      <section className="relative px-6 py-32 overflow-hidden bg-slate-900 rounded-b-[60px]">
        <img 
          src="/assets/hero.png" 
          alt="About Kautix" 
          className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-overlay"
        />
        <div className="max-w-7xl mx-auto text-center relative z-10">
          <h1 className="text-3xl md:text-7xl font-medium tracking-tight text-white mb-6">
            Building the Future of <br /><span className="text-blue-400">Education Management</span>
          </h1>
          <p className="text-slate-300 text-xl max-w-3xl mx-auto mb-8 leading-relaxed">
            Where technology doesn’t just support schools, but actively enhances learning, communication, and decision-making. We bring administration, communication, payments, analytics, and AI-driven insights into one unified system.
          </p>
          <Link to="/contact">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-8 py-6 font-semibold shadow-lg shadow-blue-600/20">
              Work with us
            </Button>
          </Link>
        </div>
      </section>

      {/* Vision & Mission */}
      <section className="bg-white py-24 px-6 border-y border-slate-100">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16">
          <div>
            <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center mb-6">
              <Lightbulb className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-3xl font-medium text-slate-900 mb-4">Our Vision</h2>
            <p className="text-slate-600 text-lg leading-relaxed mb-6">
              We believe that schools should focus on what truly matters — <strong>education and student growth</strong> — not on manual processes, scattered systems, or communication gaps.
            </p>
            <ul className="space-y-3">
              {['Schools operate efficiently', 'Teachers teach better with insights', 'Parents stay informed and involved', 'Students receive personalized support'].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-slate-700">
                  <CheckCircle className="w-5 h-5 text-blue-600" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center mb-6">
              <Target className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-3xl font-medium text-slate-900 mb-4">Our Mission & Approach</h2>
            <blockquote className="border-l-4 border-blue-600 pl-6 text-xl text-slate-700 italic leading-relaxed mb-6">
              "To empower schools with technology that saves time, improves outcomes, and enhances the overall educational experience."
            </blockquote>
            <p className="text-slate-600 text-lg leading-relaxed">
              We don’t just build software — we build solutions by understanding the real problems faced by schools, teachers, and parents. Every feature is designed with practical usability and long-term impact in mind.
            </p>
          </div>
        </div>
      </section>

      {/* What We Do */}
      <section className="py-24 px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-medium text-slate-900 mb-4">What We Do</h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">We provide a complete digital infrastructure for schools, combining powerful tools with a simple, intuitive experience.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-xl transition-all">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-6">
                <Settings className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3">1. Smart Administration</h3>
              <p className="text-slate-600 mb-4 text-sm leading-relaxed">Centralized student/staff management, attendance tracking, fee management, and inventory reducing manual effort.</p>
            </div>
            <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-xl transition-all">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-6">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3">2. Communication Hub</h3>
              <p className="text-slate-600 mb-4 text-sm leading-relaxed">Instant messaging, bulk notifications via WhatsApp/Email/SMS, announcements, and emergency alerts. No more communication gaps.</p>
            </div>
            <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-xl transition-all">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-6">
                <BrainCircuit className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3">3. AI-Powered Insights</h3>
              <p className="text-slate-600 mb-4 text-sm leading-relaxed">Move from reactive to proactive with performance analysis, personalized suggestions, and predictive alerts for academic risks.</p>
            </div>
            <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-xl transition-all">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-6">
                <Layers className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3">4. Parent & Student Exp.</h3>
              <p className="text-slate-600 mb-4 text-sm leading-relaxed">Real-time academic updates, easy fee payments, direct communication with teachers, and tracking dashboards creating transparency.</p>
            </div>
            <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-xl transition-all">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-6">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3">5. Scalable Platform</h3>
              <p className="text-slate-600 mb-4 text-sm leading-relaxed">Whether a school has 100 or 5000+ students, our system adapts seamlessly, ensuring performance and reliability at every stage.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Why We Are Different & Looking Ahead */}
      <section className="bg-[#0a0a0a] py-24 px-6 text-white rounded-t-[40px] mt-12">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16">
          <div>
            <h2 className="text-3xl font-medium mb-6">Why We Are Different</h2>
            <p className="text-slate-400 mb-8 leading-relaxed">
              Most solutions focus only on digitization. We focus on <strong>intelligence + experience + scalability</strong>.
            </p>
            <ul className="space-y-4">
              {[
                'AI-driven decision support',
                'Multi-channel communication integration',
                'Clean, user-friendly UI/UX',
                'Cost-effective solutions for schools of all sizes',
                'Built with real-world school challenges in mind'
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-slate-300">
                  <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                    <CheckCircle className="w-3 h-3 text-white" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-3xl font-medium mb-6">Looking Ahead</h2>
            <p className="text-slate-400 mb-8 leading-relaxed">
              We are continuously evolving our platform by expanding AI capabilities, improving automation, enhancing user experience, and integrating new technologies. Our goal is to create a system that not only manages schools but <strong>helps them grow and innovate.</strong>
            </p>
            <div className="p-8 bg-white/5 rounded-3xl border border-white/10">
              <h3 className="text-xl font-semibold mb-2">A Final Note</h3>
              <p className="text-slate-400 italic">
                We are not just another software provider. We are a partner in transforming education through technology.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Bottom */}
        <div className="max-w-7xl mx-auto border-t border-white/10 pt-12 mt-20">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8 mb-8">
            <Link to="/" className="flex items-center">
              <img src="https://res.cloudinary.com/dgrrdy6sk/image/upload/v1777535903/ChatGPT_Image_Apr_30__2026__11_33_17_AM-removebg-preview_vi9twl.png" alt="Kautix Logo" className="h-10 w-auto brightness-0 invert" />
            </Link>
            <div className="flex items-center gap-8 text-sm font-medium text-slate-400">
              <Link to="/" className="hover:text-white transition-colors">Home</Link>
              <Link to="/about" className="hover:text-white transition-colors text-white">About Us</Link>
              <Link to="/features" className="hover:text-white transition-colors">Features</Link>
              <Link to="/services" className="hover:text-white transition-colors">Services</Link>
              <Link to="/contact" className="hover:text-white transition-colors">Contact</Link>
            </div>
          </div>
          <div className="text-center text-xs text-slate-500">
            &copy; 2026 Kautix Inc. All rights reserved.
          </div>
        </div>
      </section>
    </div>
  );
}
