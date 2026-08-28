import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router';
import { useAuth, UserRole } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Users, BookOpen, UserCircle, GraduationCap, ArrowLeft, Layers, Info, Check, Loader2, KeyRound, Mail, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { api } from '../../lib/api';

export function LoginPage() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>('admin');
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || `/dashboard/${selectedRole}`;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(loginId, password, selectedRole);
      toast.success('Login successful!');
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error('Login failed', err);
      toast.error(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotStep === 1) {
      if (!forgotEmail) return;
      setForgotLoading(true);
      try {
        const res: any = await api.forgotPassword(forgotEmail);
        toast.success(res?.message || 'OTP sent! Please check your email.');
        setForgotStep(2);
      } catch (err: any) {
        toast.error(err.message || 'Failed to send OTP. Make sure this email is registered.');
      } finally {
        setForgotLoading(false);
      }
    } else {
      if (!forgotOtp || !forgotNewPassword) return;
      setForgotLoading(true);
      try {
        const res: any = await api.resetPasswordWithOtp({ email: forgotEmail, otp: forgotOtp, newPassword: forgotNewPassword });
        toast.success(res?.message || 'Password updated successfully! You can now log in.');
        setIsForgotOpen(false);
        setForgotStep(1);
        setForgotEmail('');
        setForgotOtp('');
        setForgotNewPassword('');
      } catch (err: any) {
        toast.error(err.message || 'Invalid or expired OTP. Please try again.');
      } finally {
        setForgotLoading(false);
      }
    }
  };

  const handleResendOtp = async () => {
    if (!forgotEmail || forgotLoading) return;
    setForgotLoading(true);
    try {
      const res: any = await api.forgotPassword(forgotEmail);
      toast.success('New OTP sent! Please check your email.');
      setForgotOtp('');
    } catch (err: any) {
      toast.error('Failed to resend OTP.');
    } finally {
      setForgotLoading(false);
    }
  };

  const roles: { value: UserRole; label: string; icon: any; color: string }[] = [
    { value: 'admin', label: 'Admin', icon: Users, color: 'bg-blue-500' },
    { value: 'teacher', label: 'Teacher', icon: BookOpen, color: 'bg-green-500' },
    { value: 'parent', label: 'Parent', icon: UserCircle, color: 'bg-purple-500' },
    { value: 'student', label: 'Student', icon: GraduationCap, color: 'bg-orange-500' },
  ];

  return (
    <div className="min-h-[100dvh] w-full overflow-x-hidden flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4 py-12 md:py-4">
      <div className="w-full max-w-4xl px-2 md:px-0">
        <Link to="/" className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600 mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mb-4">
              <Layers className="w-10 h-10 text-white" />
            </div>
            <CardTitle className="text-3xl">Kautix</CardTitle>
            <CardDescription className="text-base">
              Complete School Management System
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              {roles.map((role) => {
                const Icon = role.icon;
                return (
                  <button
                    key={role.value}
                    type="button"
                    onClick={() => setSelectedRole(role.value)}
                    className={`relative p-4 sm:p-6 rounded-2xl sm:rounded-[24px] border-2 transition-all duration-300 flex flex-col items-center text-center group ${selectedRole === role.value
                        ? 'border-blue-600 bg-blue-50/50 shadow-xl shadow-blue-600/10'
                        : 'border-slate-100 bg-white hover:border-blue-200 hover:shadow-lg'
                      }`}
                  >
                    <div
                      className={`w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl ${role.color} flex items-center justify-center mb-2 sm:mb-4 shadow-lg group-hover:scale-110 transition-transform`}
                    >
                      <Icon className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
                    </div>
                    <p className={`text-xs sm:text-sm font-bold uppercase tracking-wider sm:tracking-widest ${selectedRole === role.value ? 'text-blue-600' : 'text-slate-500'}`}>
                      {role.label}
                    </p>
                    <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1 font-medium hidden sm:block">Access Portal</p>

                    {selectedRole === role.value && (
                      <div className="absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2 w-5 h-5 sm:w-6 sm:h-6 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg">
                        <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="loginId">Login ID</Label>
                <Input
                  id="loginId"
                  type="text"
                  placeholder="e.g., ADM-2026-X1Y2 or Email"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button 
                    type="button" 
                    onClick={() => setIsForgotOpen(true)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" loading={loading} className="w-full bg-blue-600 hover:bg-blue-700" size="lg">
                Login as {roles.find((r) => r.value === selectedRole)?.label}
              </Button>
            </form>

            <div className="text-center text-sm text-gray-500 space-y-2 mt-8 border-t border-gray-100 pt-6">
              <p className="font-semibold text-gray-700">Kautix School Management Platform</p>
              <p className="text-xs text-gray-400">
                Students • Attendance • Fees • Exams • Analytics
              </p>
              <div className="mt-6 text-xs text-gray-500 bg-gray-50 p-4 rounded-xl border border-gray-100 flex gap-3 text-left">
                <Info className="w-5 h-5 shrink-0 text-blue-500" />
                <p>
                  <strong>Note:</strong> Registration is only for school administrators. Teachers, students, and parents will receive login credentials directly from their school.
                </p>
              </div>
              <div className="mt-4 pt-4">
                <p className="text-sm">
                  Registering a new school?{' '}
                  <Link to="/register" className="text-blue-600 hover:text-blue-700 font-bold transition-colors">
                    Start Onboarding
                  </Link>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isForgotOpen} onOpenChange={(open) => {
        setIsForgotOpen(open);
        if (!open) {
          setTimeout(() => {
            setForgotStep(1);
            setForgotEmail('');
            setForgotOtp('');
            setForgotNewPassword('');
          }, 300);
        }
      }}>
        <DialogContent className="sm:max-w-md bg-white rounded-2xl border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-gray-900 font-black">
              <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-white" />
              </div>
              Reset Password
            </DialogTitle>
          </DialogHeader>

          {forgotStep === 1 ? (
            <form onSubmit={handleForgotPassword} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase text-slate-500 tracking-widest">Registered Email Address</Label>
                <Input
                  type="email"
                  placeholder="Enter your registered email"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  className="rounded-xl h-11"
                  required
                />
                <p className="text-[11px] text-slate-400 pt-1">
                  A 6-digit verification code will be sent to this email to reset your password safely.
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" loading={forgotLoading} className="flex-1 bg-gray-900 hover:bg-gray-800 text-white rounded-xl h-11">
                  <Send className="w-4 h-4 mr-2" /> Send OTP
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsForgotOpen(false)} className="rounded-xl h-11">Cancel</Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4 pt-2">
              {/* Show which email OTP was sent to, with resend option */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-center gap-3">
                <Mail className="w-4 h-4 text-blue-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">OTP sent to</p>
                  <p className="text-sm font-semibold text-slate-800 truncate">{forgotEmail}</p>
                </div>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={forgotLoading}
                  className="ml-auto text-[11px] font-bold text-blue-600 hover:text-blue-800 transition-colors shrink-0 disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5 inline mr-1" />Resend
                </button>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-black uppercase text-slate-500 tracking-widest">Enter 6-Digit OTP</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="123456"
                  value={forgotOtp}
                  onChange={e => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="rounded-xl h-11 font-mono tracking-[0.5em] text-center text-xl"
                  maxLength={6}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase text-slate-500 tracking-widest">New Password</Label>
                <Input
                  type="password"
                  placeholder="Minimum 6 characters"
                  value={forgotNewPassword}
                  onChange={e => setForgotNewPassword(e.target.value)}
                  className="rounded-xl h-11"
                  minLength={6}
                  required
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" loading={forgotLoading} className="flex-1 bg-gray-900 hover:bg-gray-800 text-white rounded-xl h-11">
                  <Check className="w-4 h-4 mr-2" /> Reset Password
                </Button>
                <Button type="button" variant="outline" onClick={() => setForgotStep(1)} className="rounded-xl h-11">Back</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


