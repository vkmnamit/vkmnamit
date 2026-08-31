import React, { useState, useEffect } from 'react';
import { api } from '../../../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Skeleton } from '../../../components/ui/skeleton';
import { toast } from 'sonner';
import { Download, FileText, Search, ChevronDown, ChevronRight, CheckCircle } from 'lucide-react';
import { MarkPaidModal } from '../../../components/modals/MarkPaidModal';

const statusColor: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
  partial: 'bg-blue-100 text-blue-700',
};

export function FeeReportsPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [classes, setClasses] = useState<any[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedFee, setSelectedFee] = useState<any>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [p, c] = await Promise.all([api.getFees(), api.getClasses()]);
      setPayments(p?.payments || p || []);
      setClasses(c || []);
    } catch { toast.error('Failed to load report data'); }
    finally { setLoading(false); }
  };

  const filtered = payments.filter(p => {
    const name = `${p.student?.user?.first_name} ${p.student?.user?.last_name}`.toLowerCase();
    const admNo = p.student?.admission_number?.toLowerCase() || '';
    const matchSearch = name.includes(search.toLowerCase()) || admNo.includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchClass = classFilter === 'all' || p.student?.section?.class?.id === classFilter || p.class_id === classFilter;
    return matchSearch && matchStatus && matchClass;
  });

  const groupedByStudent = Object.values(
    filtered.reduce((acc: any, p: any) => {
      const sId = p.student_id;
      if (!acc[sId]) {
        acc[sId] = { student: p.student, payments: [], totalAmount: 0, totalPaid: 0, totalPending: 0, worstStatus: 'paid' };
      }
      acc[sId].payments.push(p);
      acc[sId].totalAmount += Number(p.amount || 0);
      acc[sId].totalPaid += Number(p.paid_amount || 0);
      acc[sId].totalPending += (Number(p.amount || 0) - Number(p.paid_amount || 0));
      return acc;
    }, {})
  ).map((group: any) => {
    // Calculate worst status for group
    const statuses = group.payments.map((p: any) => p.status);
    if (statuses.includes('overdue')) group.worstStatus = 'overdue';
    else if (statuses.includes('pending')) group.worstStatus = 'pending';
    else if (statuses.includes('partial')) group.worstStatus = 'partial';
    return group;
  }).sort((a: any, b: any) => {
    const statusOrder: Record<string, number> = { overdue: 0, pending: 1, partial: 2, paid: 3 };
    return statusOrder[a.worstStatus] - statusOrder[b.worstStatus] || b.totalPending - a.totalPending;
  });

  const summary = {
    total: filtered.reduce((s, p) => s + Number(p.amount || 0), 0),
    collected: filtered.reduce((s, p) => s + Number(p.paid_amount || 0), 0),
    pending: filtered.filter(p => p.status !== 'paid').reduce((s, p) => s + (Number(p.amount) - Number(p.paid_amount)), 0),
    count: groupedByStudent.length, // Count of students now
  };

  const toggleExpand = (studentId: string) => {
    const next = new Set(expandedRows);
    if (next.has(studentId)) next.delete(studentId);
    else next.add(studentId);
    setExpandedRows(next);
  };

  const exportCSV = () => {
    const rows = [['Student', 'Admission No', 'Class', 'Total Expected', 'Total Paid', 'Total Pending', 'Overall Status']];
    groupedByStudent.forEach((g: any) => {
      rows.push([
        `${g.student?.user?.first_name} ${g.student?.user?.last_name}`,
        g.student?.admission_number || '',
        `${g.student?.section?.class?.name || ''}-${g.student?.section?.name || ''}`,
        g.totalAmount, g.totalPaid, g.totalPending, g.worstStatus
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'fee_register_summary.csv'; a.click();
    toast.success('Summary report exported');
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-full overflow-x-hidden pb-24">
      {selectedFee && (
        <MarkPaidModal
          isOpen={true}
          onClose={() => setSelectedFee(null)}
          fee={selectedFee.payment}
          studentName={selectedFee.studentName}
          onSuccess={() => { setSelectedFee(null); fetchData(); }}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Fee Register</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">View student fee consolidation and collect payments</p>
        </div>
        <Button onClick={exportCSV} variant="outline" className="h-10 px-5 rounded-xl font-bold text-sm border-gray-200">
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Students', value: summary.count, color: 'text-gray-900' },
          { label: 'Expected', value: `₹${Number(summary.total).toLocaleString('en-IN')}`, color: 'text-gray-900' },
          { label: 'Collected', value: `₹${Number(summary.collected).toLocaleString('en-IN')}`, color: 'text-emerald-600' },
          { label: 'Pending', value: `₹${Number(summary.pending).toLocaleString('en-IN')}`, color: 'text-red-600' },
        ].map((s, i) => (
          <Card key={i} className="border-none shadow-sm bg-white">
            <CardContent className="p-4">
              <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search student..." className="pl-12 h-10 rounded-xl" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-10 rounded-xl w-36 font-bold text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
          </SelectContent>
        </Select>
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="h-10 rounded-xl w-36 font-bold text-sm"><SelectValue placeholder="All Classes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="w-10"></th>
                  <th className="text-left px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Student</th>
                  <th className="text-right px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Total Fees</th>
                  <th className="text-right px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Paid</th>
                  <th className="text-right px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Pending</th>
                  <th className="text-center px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? Array(8).fill(0).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-6 py-3"><Skeleton className="h-8 w-full rounded-lg" /></td></tr>
                )) : groupedByStudent.slice(0, 100).map((g: any) => (
                  <React.Fragment key={g.student?.id}>
                    <tr onClick={() => toggleExpand(g.student?.id)} className="hover:bg-gray-50/50 transition-colors cursor-pointer group">
                      <td className="px-4 py-3.5 text-center text-gray-400 group-hover:text-gray-900 transition-colors">
                        {expandedRows.has(g.student?.id) ? <ChevronDown className="w-4 h-4 mx-auto" /> : <ChevronRight className="w-4 h-4 mx-auto" />}
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-gray-900 text-sm">{g.student?.user?.first_name} {g.student?.user?.last_name}</p>
                        <p className="text-xs text-gray-400 font-medium">{g.student?.admission_number} · {g.student?.section?.class?.name}-{g.student?.section?.name}</p>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <p className="font-bold text-gray-900">₹{g.totalAmount.toLocaleString('en-IN')}</p>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <p className="font-bold text-emerald-600">₹{g.totalPaid.toLocaleString('en-IN')}</p>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <p className={`font-black ${g.totalPending > 0 ? 'text-red-600' : 'text-gray-900'}`}>₹{g.totalPending.toLocaleString('en-IN')}</p>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <Badge className={`text-[9px] font-black uppercase border-none capitalize ${statusColor[g.worstStatus] || statusColor.pending}`}>{g.worstStatus}</Badge>
                      </td>
                    </tr>
                    
                    {expandedRows.has(g.student?.id) && (
                      <tr>
                        <td colSpan={6} className="p-0 border-b border-gray-100 bg-gray-50/30">
                          <div className="pl-14 pr-6 py-4">
                            <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-3">Fee Breakdown</h4>
                            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                              <table className="w-full text-xs">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="text-left px-4 py-2 font-bold text-gray-500">Fee Title</th>
                                    <th className="text-right px-4 py-2 font-bold text-gray-500">Expected</th>
                                    <th className="text-right px-4 py-2 font-bold text-gray-500">Pending</th>
                                    <th className="text-center px-4 py-2 font-bold text-gray-500">Due Date</th>
                                    <th className="text-center px-4 py-2 font-bold text-gray-500">Status</th>
                                    <th className="text-right px-4 py-2 font-bold text-gray-500">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                  {g.payments.sort((a:any, b:any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()).map((p: any) => {
                                    const pendingAmount = Number(p.amount) - Number(p.paid_amount || 0);
                                    return (
                                      <tr key={p.id}>
                                        <td className="px-4 py-3 font-medium text-gray-900">{p.title || p.fee_structure?.name || '—'}</td>
                                        <td className="px-4 py-3 text-right text-gray-500">₹{Number(p.amount).toLocaleString('en-IN')}</td>
                                        <td className="px-4 py-3 text-right font-bold text-gray-900">₹{pendingAmount.toLocaleString('en-IN')}</td>
                                        <td className="px-4 py-3 text-center text-gray-500">{p.due_date ? new Date(p.due_date).toLocaleDateString('en-IN') : '—'}</td>
                                        <td className="px-4 py-3 text-center">
                                          <Badge className={`text-[9px] font-bold capitalize ${statusColor[p.status] || statusColor.pending}`}>{p.status}</Badge>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                          {p.status !== 'paid' ? (
                                            <Button 
                                              size="sm" 
                                              className="h-7 text-[10px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                                              onClick={(e) => { e.stopPropagation(); setSelectedFee({ payment: p, studentName: `${g.student?.user?.first_name} ${g.student?.user?.last_name}` }); }}
                                            >
                                              Pay Now
                                            </Button>
                                          ) : (
                                            <span className="text-emerald-600 font-bold flex items-center justify-end text-[10px]">
                                              <CheckCircle className="w-3 h-3 mr-1" /> Paid
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {!loading && groupedByStudent.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-16 text-center">
                    <FileText className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-400 font-bold">No records found</p>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

