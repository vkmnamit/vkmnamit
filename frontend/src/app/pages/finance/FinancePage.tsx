import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Skeleton } from '../../components/ui/skeleton';
import { 
  TrendingUp, TrendingDown, DollarSign, Wallet, 
  Receipt, Plus, PieChart, ArrowUpRight, ArrowDownRight,
  Sparkles, BrainCircuit, Settings, CreditCard
} from 'lucide-react';
import { api } from '../../../lib/api';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';

export function FinancePage() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [insights, setInsights] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newExpense, setNewExpense] = useState({
    title: '',
    amount: '',
    category: 'utilities',
    paymentMethod: 'cash',
    remarks: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [sumData, expData, insData] = await Promise.all([
        api.getFinancialSummary(),
        api.getExpenses(),
        api.getAIInsights('monthly')
      ]);
      setSummary(sumData);
      setExpenses(expData);
      setInsights(insData);
    } catch (err) {
      toast.error('Failed to load financial data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExpense = async () => {
    try {
      await api.createExpense(newExpense);
      toast.success('Expense recorded');
      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error('Failed to record expense');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
        </div>
        <Skeleton className="h-[400px] w-full rounded-2xl" />
      </div>
    );
  }

  const profitMargin = summary?.income > 0 ? (summary?.profit / summary?.income) * 100 : 0;

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Financial Command Center</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Institutional Revenue, Expenses & Profitability Analysis</p>
        </div>
        <div className="flex gap-2">
          <Link to="/finance/settings">
            <Button variant="outline" className="h-11 px-6 rounded-xl border-gray-200 font-bold text-xs hover:bg-gray-50">
              <CreditCard className="w-4 h-4 mr-2" />
              Gateway Setup
            </Button>
          </Link>
          <Button onClick={() => setIsModalOpen(true)} className="bg-gray-900 hover:bg-gray-800 h-11 px-6 rounded-xl shadow-xl shadow-gray-900/10 font-bold text-xs transition-all">
            <Plus className="w-4 h-4 mr-2" />
            Record Expenditure
          </Button>
        </div>
      </div>

      {/* Main KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-none shadow-sm bg-white overflow-hidden group">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
              <Badge className="bg-blue-50 text-blue-700 border-none font-bold text-[10px]">Income</Badge>
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Gross Revenue</p>
            <p className="text-2xl font-bold text-gray-900">₹{(summary?.income || 0).toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden group">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center border border-red-100">
                <TrendingDown className="w-6 h-6 text-red-600" />
              </div>
              <Badge className="bg-red-50 text-red-700 border-none font-bold text-[10px]">Costs</Badge>
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Total Expenditure</p>
            <p className="text-2xl font-bold text-gray-900">₹{((summary?.expenses || 0) + (summary?.salaries || 0)).toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-emerald-600 text-white overflow-hidden group">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-md">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <Badge className="bg-white/20 text-white border-none font-bold text-[10px]">{profitMargin.toFixed(1)}% Margin</Badge>
            </div>
            <p className="text-xs font-semibold text-emerald-100 uppercase tracking-wider mb-1">Net Profit</p>
            <p className="text-2xl font-bold">₹{(summary?.profit || 0).toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden group">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center border border-purple-100">
                <Wallet className="w-6 h-6 text-purple-600" />
              </div>
              <Badge className="bg-purple-50 text-purple-700 border-none font-bold text-[10px]">Salaries</Badge>
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Teacher Payroll</p>
            <p className="text-2xl font-bold text-gray-900">₹{(summary?.salaries || 0).toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Expenses List */}
        <Card className="lg:col-span-2 border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="py-5 px-8 border-b border-gray-50 flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-bold">Recent Expenditure</CardTitle>
            <Button variant="ghost" size="sm" className="text-blue-600 font-bold text-xs">View All</Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-gray-50/50">
                <TableRow>
                  <TableHead className="py-4 px-8 font-bold text-[10px] uppercase text-gray-400">Expense Title</TableHead>
                  <TableHead className="py-4 px-6 font-bold text-[10px] uppercase text-gray-400 text-center">Category</TableHead>
                  <TableHead className="py-4 px-6 font-bold text-[10px] uppercase text-gray-400 text-right">Amount</TableHead>
                  <TableHead className="py-4 px-6 font-bold text-[10px] uppercase text-gray-400 text-center">Method</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => (
                  <TableRow key={e.id} className="hover:bg-gray-50/50 transition-colors">
                    <TableCell className="py-4 px-8">
                      <div>
                        <p className="font-bold text-sm text-gray-900">{e.title}</p>
                        <p className="text-[10px] font-bold text-gray-400">{new Date(e.date).toLocaleDateString()}</p>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 px-6 text-center">
                      <Badge variant="outline" className="rounded-full text-[10px] font-bold uppercase">{e.category}</Badge>
                    </TableCell>
                    <TableCell className="py-4 px-6 text-right font-black text-red-600">₹{e.amount?.toLocaleString()}</TableCell>
                    <TableCell className="py-4 px-6 text-center font-bold text-gray-500 uppercase text-[10px]">{e.payment_method}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* AI Insights & Distribution */}
        <div className="space-y-8">
          <Card className="border-none shadow-sm bg-gradient-to-br from-indigo-900 to-slate-950 text-white overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <BrainCircuit className="w-24 h-24" />
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                AI Financial Insight
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-indigo-100 leading-relaxed font-medium">
                {insights?.summary || "Analyzing seasonal trends..."}
              </p>
              <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-tighter mb-1">Health Score</p>
                  <p className="text-xl font-bold">{insights?.healthScore ?? insights?.score ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-tighter mb-1">Risk Level</p>
                  <p className="text-xl font-bold text-emerald-400">{insights?.riskLevel ?? insights?.risk ?? '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardHeader>
              <CardTitle className="text-sm font-bold">Expense Distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { 
                  label: 'Academic Salaries', 
                  pct: summary?.income > 0 ? Math.round(((summary?.salaries || 0) / summary?.income) * 100) : 0, 
                  color: 'bg-blue-600' 
                },
                { 
                  label: 'Institutional Expenses', 
                  pct: summary?.income > 0 ? Math.round(((summary?.expenses || 0) / summary?.income) * 100) : 0, 
                  color: 'bg-amber-500' 
                },
                { 
                  label: 'Net Margin', 
                  pct: Math.max(0, Math.round(profitMargin)), 
                  color: 'bg-emerald-500' 
                },
              ].map((item) => (
                <div key={item.label} className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight">
                    <span>{item.label}</span>
                    <span className="text-gray-400">{item.pct}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${item.color} transition-all`} style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Record Expense Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Record Institutional Expenditure</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Expense Title</Label>
              <Input 
                value={newExpense.title} 
                onChange={e => setNewExpense({...newExpense, title: e.target.value})} 
                placeholder="e.g. Laboratory Repairs" 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Amount (₹)</Label>
                <Input 
                  type="number" 
                  value={newExpense.amount} 
                  onChange={e => setNewExpense({...newExpense, amount: e.target.value})} 
                  placeholder="0.00" 
                />
              </div>
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select value={newExpense.category} onValueChange={v => setNewExpense({...newExpense, category: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utilities">Utilities</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="academic">Academic Supplies</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="rent">Rent/Lease</SelectItem>
                    <SelectItem value="others">Others</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Payment Method</Label>
              <Select value={newExpense.paymentMethod} onValueChange={v => setNewExpense({...newExpense, paymentMethod: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateExpense} className="bg-red-600 text-white">Record Outflow</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
