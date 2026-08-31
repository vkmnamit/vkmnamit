import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { 
  CreditCard, Clock, CheckCircle, AlertCircle, TrendingUp, 
  ArrowUpRight, ArrowDownRight, Tag, Receipt, X, User, FileDown, Download 
} from 'lucide-react';
import { toast } from 'sonner';
import { generateFeeReceiptPdf } from '../../../lib/reportCard';

export function StudentFeePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState<any[]>([]);
  const [totals, setTotals] = useState({ charged: 0, paid: 0, balance: 0 });
  const [parentName, setParentName] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<any | null>(null);

  useEffect(() => {
    fetchLedger();
  }, [user]);

  const fetchLedger = async () => {
    try {
      if (!user) return;
      const res = await api.getMyLedger();
      
      setLedger(res.ledger || []);
      setTotals({
        charged: res.summary.totalCharged || 0,
        paid: res.summary.totalPaid || 0,
        balance: res.summary.closingBalance || 0
      });
      setParentName(res.summary.father_name || res.summary.mother_name || null);
    } catch (err) {
      toast.error('Failed to load fee status');
    } finally {
      setLoading(false);
    }
  };

  const handlePayNow = () => {
    toast.info('Online payment gateway is coming soon! Please contact the admin.');
  };
  const handleDownloadReceipt = (entry: any) => {
    const hasReceipt = entry?.receiptNumber && (entry.type === 'payment' || entry.type === 'refund');
    if (!hasReceipt) {
      toast.error('An official receipt is only available for completed payments.');
      return;
    }
    try {
      generateFeeReceiptPdf({
        schoolName: (user as any)?.school_name || (user as any)?.school || 'Kautix School',
        studentName: user?.name || 'Student',
        className: (user as any)?.class || '—',
        receiptNumber: entry.receiptNumber,
        date: entry.date || new Date().toISOString(),
        description: entry.description || 'Fee Payment',
        amount: Math.abs(Number(entry.amount || 0)),
        paymentMode: entry.paymentMode,
        runningBalance: typeof entry.balance === 'number' ? entry.balance : undefined,
        fatherName: parentName,
      });
      toast.success('Fee receipt downloaded');
    } catch {
      toast.error('Failed to generate receipt');
    }
  };



  const getTxIcon = (type: string) => {
    switch (type) {
      case 'charge': return <ArrowUpRight className="w-5 h-5 text-rose-500" />;
      case 'payment': return <ArrowDownRight className="w-5 h-5 text-emerald-500" />;
      case 'discount': return <Tag className="w-5 h-5 text-blue-500" />;
      case 'fine': return <AlertCircle className="w-5 h-5 text-amber-500" />;
      case 'refund': return <ArrowDownRight className="w-5 h-5 text-purple-500" />;
      default: return <Clock className="w-5 h-5 text-slate-500" />;
    }
  };

  const getTxColor = (type: string) => {
    switch (type) {
      case 'charge': return 'bg-rose-50 border-rose-100 text-rose-700';
      case 'payment': return 'bg-emerald-50 border-emerald-100 text-emerald-700';
      case 'discount': return 'bg-blue-50 border-blue-100 text-blue-700';
      case 'fine': return 'bg-amber-50 border-amber-100 text-amber-700';
      case 'refund': return 'bg-purple-50 border-purple-100 text-purple-700';
      default: return 'bg-slate-50 border-slate-100 text-slate-700';
    }
  };

  if (loading) {
    return <div className="p-8 flex justify-center items-center h-screen"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-8 relative">
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            Fee Status
          </h1>
          <p className="text-slate-500 font-medium mt-1 ml-[60px]">Track your fee payments, dues, and transaction history.</p>
          {parentName && (
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-1.5 ml-[60px] flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-500" />
              Parent: <span className="text-slate-700 normal-case font-black">{parentName}</span>
            </p>
          )}
        </div>
        {totals.balance > 0 && (
          <Button onClick={handlePayNow} className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold h-12 px-8 shadow-xl shadow-slate-900/10 transition-all hover:-translate-y-1">
            <CreditCard className="w-5 h-5 mr-2" /> Pay Dues (₹{totals.balance.toLocaleString()})
          </Button>
        )}
      </div>

      {/* Outstanding Balance — Large, spacious section box at top */}
      <div className={`w-full rounded-[32px] p-8 sm:p-10 shadow-lg border-2 flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all hover:shadow-xl
        ${totals.balance > 0 
          ? 'bg-gradient-to-br from-rose-50/70 via-white to-rose-50/70 border-rose-200 shadow-rose-100/50' 
          : 'bg-gradient-to-br from-emerald-50/70 via-white to-emerald-50/70 border-emerald-200 shadow-emerald-100/50'}`}>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${totals.balance > 0 ? 'bg-rose-100/80' : 'bg-emerald-100/80'}`}>
              <AlertCircle className={`w-6 h-6 ${totals.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`} />
            </div>
            <span className={`text-xs font-black uppercase tracking-widest ${totals.balance > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
              Outstanding Fee Due
            </span>
          </div>
          <p className={`text-2xl sm:text-3xl font-black tracking-tight ${totals.balance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
            ₹{totals.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-sm text-slate-500 font-medium">
            {totals.balance > 0 
              ? 'Please clear the outstanding dues to avoid late fee penalties.' 
              : 'All set! No outstanding fee balances remain on your account.'}
          </p>
        </div>
        {totals.balance > 0 && (
          <Button onClick={handlePayNow} className="w-full md:w-auto bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black h-16 px-10 text-base shadow-lg shadow-rose-500/20 transition-all hover:scale-[1.02]">
            <CreditCard className="w-5 h-5 mr-2" /> Pay Dues Now
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <Card className="rounded-3xl border-slate-100 shadow-sm bg-gradient-to-br from-white to-slate-50/50 hover:shadow-md transition-shadow">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <p className="text-xs font-black uppercase text-slate-400 tracking-widest mb-1">Total Charged</p>
            <p className="text-3xl font-black text-slate-900">₹{totals.charged.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        
        <Card className="rounded-3xl border-slate-100 shadow-sm bg-gradient-to-br from-emerald-50/30 to-white hover:shadow-md transition-shadow">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
            <p className="text-xs font-black uppercase text-emerald-600/70 tracking-widest mb-1">Total Paid</p>
            <p className="text-3xl font-black text-emerald-700">₹{totals.paid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
      </div>

      {/* Ledger Table - No horizontal scroll, clean spacing */}
      <Card className="rounded-3xl border-slate-100 shadow-sm bg-white overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4 px-6 sm:px-8">
          <CardTitle className="text-sm font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
            <Receipt className="w-4 h-4" /> Transaction Ledger
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ledger.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400">
              <Receipt className="w-12 h-12 mb-4 opacity-20" />
              <p className="font-bold">No transactions found.</p>
              <p className="text-sm">Your fee ledger will appear here.</p>
            </div>
          ) : (
            <div className="w-full">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
                  <tr>
                    <th className="px-8 py-5">Date</th>
                    <th className="px-8 py-5">Description</th>
                    <th className="px-8 py-5">Type</th>
                    <th className="px-8 py-5 text-right">Amount</th>
                    <th className="px-8 py-5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {ledger.map((entry, idx) => (
                    <tr 
                      key={idx} 
                      onClick={() => setSelectedTx(entry)}
                      className="hover:bg-slate-50/85 cursor-pointer transition-colors group"
                    >
                      <td className="px-8 py-5 font-medium text-slate-600 whitespace-nowrap">
                        {new Date(entry.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-8 py-5">
                        <div className="font-bold text-slate-900 flex items-center gap-2">
                          {entry.description}
                          {entry.status === 'pending' && <Badge variant="outline" className="text-[9px] uppercase font-black text-rose-500 border-rose-200 bg-rose-50">Unpaid</Badge>}
                        </div>
                        {entry.receiptNumber && (
                          <div className="text-xs text-slate-400 font-medium mt-0.5">Receipt: {entry.receiptNumber}</div>
                        )}
                      </td>
                      <td className="px-8 py-5">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${getTxColor(entry.type)}`}>
                          {getTxIcon(entry.type)}
                          {entry.type}
                        </div>
                      </td>
                      <td className={`px-8 py-5 text-right font-black whitespace-nowrap ${entry.amount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {entry.amount > 0 ? '+' : ''}₹{Math.abs(entry.amount).toLocaleString('en-IN')}
                      </td>
                      <td className="px-8 py-5 text-right font-black text-slate-900 whitespace-nowrap">
                        ₹{entry.balance.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction Detail Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`h-24 ${getTxColor(selectedTx.type).split(' ')[0]} flex items-center justify-center relative`}>
              <button 
                onClick={() => setSelectedTx(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/50 hover:bg-white flex items-center justify-center text-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center mt-12">
                {getTxIcon(selectedTx.type)}
              </div>
            </div>
            
            <div className="pt-10 pb-6 px-8 text-center border-b border-slate-100">
              <h2 className="text-2xl font-black text-slate-900 mb-1">
                {selectedTx.amount > 0 ? '+' : ''}₹{Math.abs(selectedTx.amount).toLocaleString()}
              </h2>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">{selectedTx.type} Transaction</p>
            </div>

            <div className="p-8 space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-sm text-slate-500 font-medium">Date</span>
                <span className="text-sm font-bold text-slate-900">
                  {new Date(selectedTx.date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-sm text-slate-500 font-medium">Description</span>
                <span className="text-sm font-bold text-slate-900 text-right max-w-[200px] truncate">{selectedTx.description}</span>
              </div>
              
              {selectedTx.receiptNumber && (
                <div className="flex justify-between items-center py-2 border-b border-slate-50">
                  <span className="text-sm text-slate-500 font-medium">Receipt No.</span>
                  <span className="text-sm font-bold text-slate-900">{selectedTx.receiptNumber}</span>
                </div>
              )}
              
              {selectedTx.paymentMode && (
                <div className="flex justify-between items-center py-2 border-b border-slate-50">
                  <span className="text-sm text-slate-500 font-medium">Payment Mode</span>
                  <span className="text-sm font-bold text-slate-900 capitalize">{selectedTx.paymentMode}</span>
                </div>
              )}

              {selectedTx.dueDate && (
                <div className="flex justify-between items-center py-2 border-b border-slate-50">
                  <span className="text-sm text-slate-500 font-medium">Due Date</span>
                  <span className={`text-sm font-bold ${new Date(selectedTx.dueDate) < new Date() && selectedTx.status === 'pending' ? 'text-rose-600' : 'text-slate-900'}`}>
                    {new Date(selectedTx.dueDate).toLocaleDateString('en-IN')}
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-sm text-slate-500 font-medium">Status</span>
                <span className="text-sm font-bold text-slate-900 capitalize">{selectedTx.status}</span>
              </div>
              
              <div className="flex justify-between items-center py-2 mt-4 bg-slate-50 p-4 rounded-2xl">
                <span className="text-sm text-slate-700 font-bold">Balance After</span>
                <span className="text-lg font-black text-slate-900">₹{selectedTx.balance.toLocaleString()}</span>
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 space-y-2">
              {(selectedTx.type === 'payment' || selectedTx.type === 'refund') && selectedTx.receiptNumber && (
                <Button
                  onClick={() => handleDownloadReceipt(selectedTx)}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold h-12 shadow-sm"
                >
                  <FileDown className="w-4 h-4 mr-2" /> Download Fee Receipt
                </Button>
              )}
              <Button onClick={() => setSelectedTx(null)} className="w-full bg-white text-slate-900 hover:bg-slate-100 rounded-xl font-bold h-12 shadow-sm border border-slate-200">
                Close Details
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
