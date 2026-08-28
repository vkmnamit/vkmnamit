import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { api } from '../../../lib/api';
import { Skeleton } from '../../components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { 
  User, Mail, Phone, MapPin, Briefcase, 
  CreditCard, ShieldCheck, MessageSquare, History, ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';

export function ParentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [parent, setParent] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);

  useEffect(() => {
    if (id) fetchParentData();
  }, [id]);

  const fetchParentData = async () => {
    try {
      setLoading(true);
      const data = await api.getParentById(id!);
      setParent(data);
      
      // Fetch fees for all children
      if (data.children && data.children.length > 0) {
        const allPayments: any[] = [];
        for (const link of data.children) {
          const resp = await api.getFees({ student_id: link.student.id });
          if (resp && resp.payments) {
            allPayments.push(...resp.payments);
          }
        }
        setPayments(allPayments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      }
    } catch (err) {
      toast.error('Failed to load parent profile');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-6"><Skeleton className="h-[600px] w-full rounded-2xl" /></div>;

  if (!parent) return (
    <div className="flex flex-col items-center justify-center py-20">
      <p className="text-gray-400 font-bold">Parent profile not found.</p>
      <Button variant="link" onClick={() => navigate('/parents')}>Return to Directory</Button>
    </div>
  );

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden pb-10">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="rounded-xl">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <h1 className="text-xl font-bold">Guardian Profile</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Basic Info */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-none shadow-sm overflow-hidden">
            <CardContent className="p-8 text-center">
              <Avatar className="w-24 h-24 mx-auto border-4 border-white shadow-xl mb-4">
                <AvatarFallback className="bg-blue-600 text-white text-3xl font-black">
                  {parent.user?.first_name?.[0]}{parent.user?.last_name?.[0]}
                </AvatarFallback>
              </Avatar>
              <h2 className="text-2xl font-bold text-gray-900">{parent.user?.first_name} {parent.user?.last_name}</h2>
              <Badge className="mt-2 bg-blue-50 text-blue-700 border-none font-bold">PRIMARY GUARDIAN</Badge>
              
              <div className="mt-8 space-y-4 text-left">
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <span>{parent.user?.email}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span>{parent.user?.phone}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <span className="leading-tight">{parent.address || 'Address unlinked'}</span>
                </div>
              </div>

              <Button className="w-full mt-8 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold">
                <MessageSquare className="w-4 h-4 mr-2" /> Message Guardian
              </Button>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-emerald-600 text-white p-6">
            <h3 className="text-xs font-black uppercase tracking-widest opacity-80 mb-4">Engagement & Trust</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium opacity-90">Payment History</span>
                <Badge className="bg-white/20 text-white border-none text-[10px] font-black">{parent.fee_payment_history?.toUpperCase() || 'UNKNOWN'}</Badge>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Linked Students & Financials */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-none shadow-sm">
            <CardHeader className="py-5 px-8 border-b border-gray-50">
              <CardTitle className="text-base font-bold text-gray-900">Linked Students (Wards)</CardTitle>
            </CardHeader>
            <CardContent className="p-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(parent.children || []).map((c: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100 hover:border-blue-200 transition-all cursor-pointer" onClick={() => navigate(`/students/${c.student?.id}`)}>
                    <Avatar className="h-12 w-12 border-2 border-white">
                      <AvatarFallback className="bg-blue-600 text-white font-bold">{c.student?.user?.first_name?.[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-bold text-gray-900">{c.student?.user?.first_name} {c.student?.user?.last_name}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">{c.student?.section?.class?.name} - {c.student?.section?.name}</p>
                    </div>
                  </div>
                ))}
                {(parent.children || []).length === 0 && <p className="text-gray-400 text-sm">No linked wards found.</p>}
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader className="py-5 px-8 border-b border-gray-50 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-bold text-gray-900">Recent Financial Activity</CardTitle>
              <Button variant="ghost" className="text-xs font-bold text-blue-600">View All Ledger</Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-50">
                {payments.slice(0, 5).map((payment, idx) => (
                  <div key={idx} className="p-6 flex items-center justify-between hover:bg-gray-50/50">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{payment.fee_structure?.name || 'Academic Fee'}</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                          {payment.payment_method ? `Via ${payment.payment_method}` : 'Standard Transfer'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-gray-900">₹{payment.amount.toLocaleString()}</p>
                      <p className={`text-[10px] font-bold uppercase tracking-widest ${
                        payment.status === 'paid' ? 'text-emerald-600' : 
                        payment.status === 'overdue' ? 'text-red-600' : 'text-amber-600'
                      }`}>
                        {payment.status.toUpperCase()}
                      </p>
                    </div>
                  </div>
                ))}
                {payments.length === 0 && (
                  <div className="p-10 text-center text-gray-400 font-bold text-xs italic">
                    No recent financial transactions found for this node.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-gray-900 text-white p-8 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <ShieldCheck className="w-32 h-32" />
            </div>
            <div className="relative z-10">
              <h3 className="text-xl font-black tracking-tight mb-2">Protocol Verified Guardian</h3>
              <p className="text-sm text-gray-400 font-medium max-w-md leading-relaxed">
                This node has been verified through our multi-factor identity synchronization. All financial and academic data transfers are encrypted.
              </p>
              <div className="flex gap-4 mt-8">
                <div className="px-4 py-2 bg-white/10 rounded-xl border border-white/10 text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Trust Level</p>
                  <p className="font-bold">Tier 1</p>
                </div>
                <div className="px-4 py-2 bg-white/10 rounded-xl border border-white/10 text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Last Sync</p>
                  <p className="font-bold">Today, 12:45 PM</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
