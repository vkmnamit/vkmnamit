import { Link, useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { LandingNavbar } from '../components/layout/LandingNavbar';
import {
  Users,
  Calendar,
  DollarSign,
  Shield,
  MessageSquare,
  BarChart,
  ArrowUpRight,
  CheckCircle,
  GraduationCap,
  School,
  Star,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// 📸 SCHOOL MEDIA GALLERY
// To add/change photos: just paste the image URL below and give it a caption.
// Size options: 'normal' | 'tall' | 'wide'
// ─────────────────────────────────────────────────────────────────────────────
const GALLERY_IMAGES = [
  {
    url: 'https://res.cloudinary.com/dgrrdy6sk/image/upload/v1785945356/WhatsApp_Image_2026-08-05_at_16.14.48_mb7zoh.jpg',
    caption: 'Explanation of Kautix to teacher, how it works',
    size: 'tall',
  },
  {
    url: 'https://res.cloudinary.com/dgrrdy6sk/image/upload/v1785945356/WhatsApp_Image_2026-08-05_at_14.42.48_odf229.jpg',
    caption: 'real use case of kautix',
    size: 'normal',
  },
  {
    url: 'https://res.cloudinary.com/dgrrdy6sk/image/upload/v1785945356/WhatsApp_Image_2026-08-05_at_21.16.20_uoe0pz.jpg',
    caption: 'Teachers and students working together',
    size: 'normal',
  },
  {
    url: 'https://res.cloudinary.com/dgrrdy6sk/image/upload/v1785945356/WhatsApp_Image_2026-08-05_at_14.42.46_dwb9ip.jpg',
    caption: 'Digital tools powering the modern classroom',
    size: 'wide',
  }

  // ← ADD YOUR OWN PHOTOS HERE:
  // { url: 'https://your-image-url.com/photo.jpg', caption: 'Your caption here', size: 'normal' },
];

// Animated counter hook
function useCountUp(target: number, duration = 1800, active = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active || target === 0) return;
    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCount(Math.floor(eased * target));
      if (progress >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration, active]);
  return count;
}

function AnimatedStat({ value, label, icon: Icon }: { value: number; label: string; icon: any }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const count = useCountUp(value, 1800, active);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setActive(true); },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const display = value > 0 ? count.toLocaleString() + '+' : '—';

  return (
    <div ref={ref} className="flex flex-col items-center text-center group">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
        <Icon className="w-7 h-7 text-blue-600" />
      </div>
      <h3 className="text-4xl md:text-5xl font-bold text-slate-900 mb-2 tabular-nums">
        {display}
      </h3>
      <p className="text-sm text-slate-500 font-medium max-w-[120px] leading-tight">{label}</p>
    </div>
  );
}

export function LandingPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [liveStats, setLiveStats] = useState({ totalStudents: 0, totalRequests: 0, totalSchools: 0 });

  useEffect(() => {
    if (isAuthenticated) {
      const lastPath = localStorage.getItem('lastPath');
      if (lastPath && lastPath !== '/') navigate(lastPath);
    }
  }, [isAuthenticated, navigate]);

  // Fetch live global stats from public API
  useEffect(() => {
    const apiBase = (import.meta.env.VITE_API_URL as string)?.replace(/\/+$/, '');
    fetch(`${apiBase}/public/landing-data`)
      .then(r => r.json())
      .then(data => {
        if (data?.stats) setLiveStats(data.stats);
      })
      .catch(() => { }); // fail silently — fallback values remain 0
  }, []);

  const features = [
    { icon: Users, title: 'Unified Management', description: 'Streamline student, teacher, and staff workflows in one central hub.' },
    { icon: Calendar, title: 'Smart Attendance', description: 'Automated tracking with instant parent alerts and compliance reports.' },
    { icon: DollarSign, title: 'Financial Clarity', description: 'Automated fee collection, expense tracking, and transparent reporting.' },
    { icon: Shield, title: 'Enterprise Security', description: 'Bank-grade security protocols to keep your institutional data safe.' },
    { icon: MessageSquare, title: 'Seamless Communication', description: 'Built-in messaging between teachers, parents, and administrators.' },
    { icon: BarChart, title: 'Advanced Analytics', description: 'Data-driven insights to improve student performance and operations.' },
  ];

  const services = [
    { id: '01', title: 'Admissions Module', desc: 'View Details', link: '/modules/admissions' },
    { id: '02', title: 'Learning Management', desc: 'View Details', link: '/modules/learning' },
    { id: '03', title: 'Finance & Fees', desc: 'View Details', link: '/modules/finance' },
    { id: '04', title: 'Inventory Control', desc: 'View Details', link: '/modules/inventory' },
  ];

  return (
    <div className="min-h-[100dvh] w-full bg-slate-50 text-slate-900 selection:bg-blue-500/30 overflow-x-hidden relative">
      <LandingNavbar />

      <main>
        {/* ── Hero ──────────────────────────────────────────── */}
        <section className="px-4 pb-20 pt-4">
          <div className="max-w-[1400px] mx-auto">
            <div className="relative w-full h-[600px] rounded-[40px] bg-slate-900 overflow-hidden isolate">
              <img
                src="/assets/hero.webp"
                alt="Modern School Campus"
                width="1024" height="1024"
                loading="eager" decoding="async"
                className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-overlay"
              />
              <Link to="/features" className="absolute top-12 right-12 md:top-24 md:right-24 bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-3xl w-64 hidden lg:block hover:bg-white/20 transition-colors">
                <div className="h-32 w-full rounded-2xl bg-slate-800/50 mb-4 overflow-hidden relative">
                  <img src="/assets/classroom.webp" alt="Students" width="1024" height="1024" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
                </div>
                <div className="flex items-center justify-between text-white">
                  <div className="w-8 h-8 rounded-full border border-white/30 flex items-center justify-center">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">Discover Our</p>
                    <p className="text-sm font-medium text-white/70">Recent Updates</p>
                  </div>
                </div>
              </Link>
              <div className="absolute inset-0 flex flex-col justify-center p-12 md:p-24 z-10">
                <p className="text-blue-400 font-medium tracking-wide mb-4">#1 School Management System</p>
                <h1 className="text-4xl sm:text-5xl md:text-7xl font-medium tracking-tight leading-[1.1] text-white max-w-3xl mb-12">
                  New Paradigm<br />for Education
                </h1>
                <div className="flex items-center gap-8 mt-auto">
                  <Link to="/register" className="flex items-center gap-2 text-white font-medium hover:text-blue-400 transition-colors border-b border-white hover:border-blue-400 pb-1">
                    Get in touch <ArrowUpRight className="w-4 h-4" />
                  </Link>
                  <a href="#services" className="flex items-center gap-2 text-white font-medium hover:text-blue-400 transition-colors border-b border-white hover:border-blue-400 pb-1">
                    Our services <ArrowUpRight className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>

            {/* Stats cutout */}
            <div className="flex flex-col lg:flex-row justify-end -mt-24 relative z-20 px-8 lg:px-12">
              <div className="bg-slate-50 p-8 rounded-[40px] lg:rounded-tl-[40px] lg:rounded-tr-none lg:rounded-br-none lg:rounded-bl-[40px] flex flex-col sm:flex-row flex-wrap gap-8 lg:gap-24 shadow-[-20px_-20px_0_0_#f8fafc]">
                {[{ value: '100%', label: 'Cloud-Based Setup' }, { value: '24/7', label: 'Automated Operations' }, { value: 'Real-Time', label: 'Data Synchronization' }].map((s, i) => (
                  <div key={i}>
                    <h3 className="text-4xl md:text-5xl font-medium text-slate-900 mb-2">{s.value}</h3>
                    <p className="text-sm text-slate-600 max-w-[140px] leading-relaxed">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Live Global Stats ─────────────────────────────── */}
        <section className="py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <span className="inline-block bg-blue-50 text-blue-600 text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-full mb-4">Live Network Stats</span>
              <h2 className="text-3xl md:text-5xl font-medium text-slate-900 leading-tight">
                Powering schools <span className="text-slate-400">across the country</span>
              </h2>
              <p className="text-slate-500 mt-4 max-w-lg mx-auto">Real numbers. Real schools. Updated live from our platform.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-4 bg-white rounded-[40px] p-8 sm:p-10 shadow-sm border border-slate-100 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
              <div className="pt-0 sm:pt-0 pb-6 sm:pb-0">
                <AnimatedStat value={liveStats.totalStudents} label="Students Enrolled" icon={GraduationCap} />
              </div>
              <div className="pt-6 sm:pt-0 pb-6 sm:pb-0">
                <AnimatedStat value={liveStats.totalRequests || 0} label="Total Requests Processed" icon={BarChart} />
              </div>
              <div className="pt-6 sm:pt-0 pb-0 sm:pb-0">
                <AnimatedStat value={liveStats.totalStudents > 0 ? 1 : 0} label="Schools Onboarded" icon={School} />
              </div>
            </div>
          </div>
        </section>

        {/* ── Quality / Trust ───────────────────────────────── */}
        <section className="py-20 px-6 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-16">
            <h2 className="text-3xl md:text-5xl font-medium text-slate-900 leading-tight">
              The Kautix Standard:<br />
              <span className="text-slate-600">Smarter, Safer, and Scalable School Operations</span>
            </h2>
            <p className="text-slate-600 text-lg leading-relaxed max-w-lg">
              Kautix streamlines school management with intelligent automation, real-time tracking, and seamless communication. From fee collection to transport monitoring and academic insights, everything is designed to improve efficiency and deliver a better experience.
            </p>
          </div>
          <div className="flex flex-wrap justify-center lg:justify-between gap-6">
            {['Fee Automation', 'Live Bus Tracking', 'AI Insights', 'Parent Connect', 'Smart Notifications'].map((name, i) => (
              <div key={i} className="w-40 h-40 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center hover:shadow-md hover:border-blue-200 transition-all cursor-pointer text-center p-4">
                <span className="font-bold text-slate-800 text-sm">{name}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── School Life Gallery (Marketing) ───────────────── */}
        <section id="gallery" className="py-24 px-6 bg-slate-900">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-4">
              <div>
                <span className="inline-block bg-white/10 text-white/60 text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-full mb-4">School Life</span>
                <h2 className="text-3xl md:text-5xl font-medium text-white leading-tight">
                  Moments that <span className="text-slate-400">define us</span>
                </h2>
              </div>
              <p className="text-slate-400 max-w-sm leading-relaxed text-sm">
                From sports days to science fairs — Kautix-powered schools are vibrant, engaged, and thriving communities.
              </p>
            </div>

            {/* Masonry-style gallery grid */}
            <div className="columns-2 md:columns-3 gap-4 space-y-4">
              {GALLERY_IMAGES.map((img, i) => (
                <div
                  key={i}
                  className="group relative rounded-[20px] overflow-hidden bg-slate-800 cursor-pointer break-inside-avoid mb-4"
                >
                  <img
                    src={img.url}
                    alt={img.caption}
                    loading="lazy"
                    className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-105 block"
                    style={{ aspectRatio: img.size === 'tall' ? '3/4' : img.size === 'wide' ? '16/9' : '4/3' }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-5">
                    <div className="flex items-start gap-2">
                      <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 shrink-0 mt-0.5" />
                      <p className="text-white text-sm font-medium leading-tight">{img.caption}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 text-center">
              <Link to="/register">
                <Button className="bg-white text-slate-900 hover:bg-slate-100 rounded-full px-8 py-6 font-semibold shadow-xl">
                  Join the Community <ArrowUpRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ── Features Grid ─────────────────────────────────── */}
        <section id="features" className="py-24 px-6 bg-slate-100/50">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-medium text-slate-900 leading-tight mb-4">
                We offer quality, <span className="text-slate-400">with the<br />best modules and service</span>
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, i) => {
                const Icon = feature.icon;
                return (
                  <div key={i} className="bg-white p-8 rounded-[32px] hover:shadow-xl transition-shadow duration-300">
                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-6">
                      <Icon className="w-6 h-6 text-blue-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-slate-900 mb-3">{feature.title}</h3>
                    <p className="text-slate-600 text-sm leading-relaxed">{feature.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Services Split ─────────────────────────────────── */}
        <section id="services" className="py-24 px-6 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-5xl font-medium text-slate-900 leading-tight mb-12">
                Trusted service, <span className="text-slate-600">for your<br />various needs</span>
              </h2>
              <Link to="/contact">
                <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-8 py-6 mb-16 shadow-lg shadow-blue-600/20">
                  Get in touch <ArrowUpRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {services.map((service) => (
                  <Link to={service.link} key={service.id} className="block">
                    <div className="p-6 rounded-[24px] border border-slate-200 hover:border-blue-600 hover:shadow-md transition-all cursor-pointer group h-full">
                      <span className="text-slate-500 text-sm font-medium mb-4 block">{service.id}</span>
                      <h3 className="text-lg font-semibold text-slate-900 mb-6">{service.title}</h3>
                      <span className="text-sm font-medium text-slate-900 border-b border-slate-900 pb-0.5 group-hover:text-blue-600 group-hover:border-blue-600 transition-colors">
                        {service.desc}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
            <div className="h-[700px] rounded-[40px] overflow-hidden">
              <img src="/assets/classroom.webp" alt="Students collaborating" width="1024" height="1024" loading="lazy" decoding="async" className="w-full h-full object-cover" />
            </div>
          </div>
        </section>

        {/* ── Dark CTA + Footer ──────────────────────────────── */}
        <section className="px-4 pb-6">
          <div className="max-w-[1400px] mx-auto bg-[#0a0a0a] rounded-[40px] px-8 py-20 lg:px-24">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center mb-24">
              <div>
                <h2 className="text-3xl md:text-5xl font-medium text-white leading-tight mb-6">
                  It's time to support modern education, <br />
                  <span className="text-slate-400">with unified resources</span>
                </h2>
                <div className="flex flex-col sm:flex-row gap-6 mt-8">
                  {['Enterprise-Grade Security & Reliability', 'Support for the latest technology'].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 text-white">
                      <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                        <CheckCircle className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-sm font-medium">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="lg:text-right">
                <p className="text-slate-400 mb-8 max-w-md ml-auto leading-relaxed">
                  By increasing the effectiveness and efficiency of school operations, the use of a unified management system is very profitable for all educational institutions.
                </p>
                <Link to="/contact">
                  <Button className="bg-white text-slate-900 hover:bg-slate-100 rounded-full px-8 py-6 font-semibold shadow-xl">
                    Get in touch <ArrowUpRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>

            <div className="border-t border-white/10 pt-12">
              <div className="flex flex-col lg:flex-row items-center justify-between gap-8 mb-12">
                <Link to="/" className="flex items-center">
                  <img src="https://res.cloudinary.com/dgrrdy6sk/image/upload/v1777535903/ChatGPT_Image_Apr_30__2026__11_33_17_AM-removebg-preview_vi9twl.png" alt="Kautix Logo" className="h-12 w-auto brightness-0 invert" />
                </Link>
                <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-4 text-sm font-medium text-slate-400">
                  {([['/', 'Home'], ['/about', 'About Us'], ['/features', 'Features'], ['/services', 'Services'], ['/contact', 'Contact']] as const).map(([path, label]) => (
                    <Link key={path} to={path} className="hover:text-white transition-colors">{label}</Link>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-4">
                  {['in', 'X', 'f', 'ig'].map((icon, i) => (
                    <div key={i} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer text-white">
                      <span className="text-xs font-bold">{icon}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row justify-between items-center text-xs text-slate-400 font-medium gap-4">
                <p className="text-center sm:text-left">&copy; 2026 Kautix Inc. All rights reserved</p>
                <div className="flex justify-center gap-6">
                  {([['Terms of Service', '/terms'], ['Privacy Policy', '/privacy-policy'], ['Data Deletion', '/data-deletion']] as const).map(([label, path]) => (
                    <Link key={path} to={path} className="hover:text-white transition-colors">{label}</Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
