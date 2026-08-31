import { useState } from 'react';
import { api } from '../../lib/api';
import { useNavigate, Link } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ArrowLeft, Info, Layers, CheckCircle2, Building2, User, Lock, Mail, Phone, MapPin, Globe, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';

export function RegisterPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    schoolName: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    board: 'CBSE',
    principalName: '',
    establishedYear: '',
    schoolEmail: '',
    schoolPhone: '',
    website: '',
    logoUrl: '',
  });
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.schoolName || !formData.firstName || !formData.email || !formData.password) {
      toast.error('Please fill in all required fields.');
      return;
    }
    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }
    setStep(2);
    window.scrollTo(0, 0);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.register(formData);
      toast.success('School registered! Welcome to Kautix 🎉');
      await login(formData.email, formData.password, 'admin');
      navigate(`/dashboard/admin`);
    } catch (err: any) {
      toast.error(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center p-4 py-12 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-violet-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-xl relative z-10">
        <Link to="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-8 font-medium transition-colors text-sm group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to Home
        </Link>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="text-center px-8 pt-10 pb-8 border-b border-white/10">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-blue-500/30">
              <Layers className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Register your School</h1>
            <p className="text-slate-400 text-sm">Set up your admin account and get started</p>

            {/* Stepper */}
            <div className="flex items-center justify-center mt-7 gap-0">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step >= 1 ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/40' : 'bg-white/10 text-slate-400'}`}>
                  {step > 1 ? <CheckCircle2 className="w-4 h-4" /> : '1'}
                </div>
                <span className={`text-xs font-semibold transition-colors ${step >= 1 ? 'text-blue-400' : 'text-slate-500'}`}>Admin Details</span>
              </div>
              <div className={`w-12 h-0.5 mx-3 rounded-full transition-all ${step >= 2 ? 'bg-blue-500' : 'bg-white/10'}`} />
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step >= 2 ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/40' : 'bg-white/10 text-slate-400'}`}>
                  2
                </div>
                <span className={`text-xs font-semibold transition-colors ${step >= 2 ? 'text-blue-400' : 'text-slate-500'}`}>School Setup</span>
              </div>
            </div>
          </div>

          {/* Form body */}
          <div className="p-8">
            {step === 1 ? (
              <form onSubmit={handleNext} className="space-y-5">
                {/* Institution Name — full width, NO icon inside input */}
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-sm font-medium flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    Institution Name <span className="text-blue-400">*</span>
                  </Label>
                  <Input
                    type="text"
                    placeholder="Global International Academy"
                    value={formData.schoolName}
                    onChange={(e) => handleChange('schoolName', e.target.value)}
                    required
                    className="h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500 focus:bg-white/10 rounded-xl"
                  />
                </div>

                {/* Name row */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-sm font-medium flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      First Name <span className="text-blue-400">*</span>
                    </Label>
                    <Input
                      type="text"
                      placeholder="John"
                      value={formData.firstName}
                      onChange={(e) => handleChange('firstName', e.target.value)}
                      required
                      className="h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500 focus:bg-white/10 rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-sm font-medium">Last Name</Label>
                    <Input
                      type="text"
                      placeholder="Doe"
                      value={formData.lastName}
                      onChange={(e) => handleChange('lastName', e.target.value)}
                      className="h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500 focus:bg-white/10 rounded-xl"
                    />
                  </div>
                </div>

                {/* Email + Phone */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-sm font-medium flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5" />
                      Official Email <span className="text-blue-400">*</span>
                    </Label>
                    <Input
                      type="email"
                      placeholder="admin@school.edu"
                      value={formData.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      required
                      className="h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500 focus:bg-white/10 rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-sm font-medium flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5" />
                      Phone <span className="text-blue-400">*</span>
                    </Label>
                    <Input
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={formData.phone}
                      onChange={(e) => handleChange('phone', e.target.value)}
                      required
                      className="h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500 focus:bg-white/10 rounded-xl"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-sm font-medium flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    Admin Password <span className="text-blue-400">*</span>
                  </Label>
                  <Input
                    type="password"
                    placeholder="Create a secure password (min. 6 chars)"
                    value={formData.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    required
                    className="h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500 focus:bg-white/10 rounded-xl"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/30 transition-all mt-2"
                >
                  Continue to School Setup →
                </Button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-5">
                {/* Address */}
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-sm font-medium flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    School Address <span className="text-blue-400">*</span>
                  </Label>
                  <Input
                    type="text"
                    placeholder="Complete address"
                    value={formData.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    required
                    className="h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500 focus:bg-white/10 rounded-xl"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-sm font-medium">City <span className="text-blue-400">*</span></Label>
                    <Input
                      value={formData.city}
                      onChange={(e) => handleChange('city', e.target.value)}
                      placeholder="City"
                      required
                      className="h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500 focus:bg-white/10 rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-sm font-medium">State <span className="text-blue-400">*</span></Label>
                    <Input
                      value={formData.state}
                      onChange={(e) => handleChange('state', e.target.value)}
                      placeholder="State"
                      required
                      className="h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500 focus:bg-white/10 rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-sm font-medium">Pincode <span className="text-blue-400">*</span></Label>
                    <Input
                      value={formData.pincode}
                      onChange={(e) => handleChange('pincode', e.target.value)}
                      placeholder="000000"
                      required
                      className="h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500 focus:bg-white/10 rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-sm font-medium flex items-center gap-1.5">
                      <GraduationCap className="w-3.5 h-3.5" />
                      Education Board
                    </Label>
                    <select
                      className="flex h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.board}
                      onChange={(e) => handleChange('board', e.target.value)}
                    >
                      <option value="CBSE" className="bg-slate-800">CBSE</option>
                      <option value="ICSE" className="bg-slate-800">ICSE</option>
                      <option value="STATE" className="bg-slate-800">State Board</option>
                      <option value="IB" className="bg-slate-800">IB</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-sm font-medium">Principal Name</Label>
                    <Input
                      value={formData.principalName}
                      onChange={(e) => handleChange('principalName', e.target.value)}
                      placeholder="Dr. Sharma"
                      className="h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500 focus:bg-white/10 rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-sm font-medium">School Email</Label>
                    <Input
                      type="email"
                      value={formData.schoolEmail}
                      onChange={(e) => handleChange('schoolEmail', e.target.value)}
                      placeholder="school@edu.in"
                      className="h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500 focus:bg-white/10 rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-sm font-medium flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5" />
                      Website
                    </Label>
                    <Input
                      value={formData.website}
                      onChange={(e) => handleChange('website', e.target.value)}
                      placeholder="https://school.edu"
                      className="h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500 focus:bg-white/10 rounded-xl"
                    />
                  </div>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl flex items-start gap-3">
                  <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-300 leading-relaxed">
                    Teachers, Students, and Parents don't register here. You'll add them from your Admin Dashboard after setup.
                  </p>
                </div>

                <div className="flex gap-3 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(1)}
                    className="w-1/3 h-12 rounded-xl border-white/10 text-slate-300 hover:bg-white/10 hover:text-white bg-transparent"
                  >
                    ← Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-2/3 h-12 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/30 disabled:opacity-60 transition-all"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        Setting up...
                      </span>
                    ) : 'Complete & Initialize →'}
                  </Button>
                </div>
              </form>
            )}

            <p className="text-center text-sm text-slate-500 mt-7">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-400 font-semibold hover:text-blue-300 transition-colors">
                Sign in here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
