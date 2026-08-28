import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Skeleton } from '../../components/ui/skeleton';
import { MessageSquare, Plus, Send, Filter, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-amber-50 text-amber-700',
  resolved: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-gray-100 text-gray-600',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-50 text-gray-600',
  medium: 'bg-orange-50 text-orange-700',
  high: 'bg-red-50 text-red-700',
};

export function QueriesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [queries, setQueries] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [reply, setReply] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState({ status: 'all', userType: 'all', priority: 'all' });
  const [form, setForm] = useState({ targetRole: 'admin', teacherId: '', category: 'general', subject: '', description: '', priority: 'medium' });
  const [teachers, setTeachers] = useState<any[]>([]);

  useEffect(() => { 
    fetchQueries(); 
    if (!isAdmin) {
      api.getTeachers().then(setTeachers).catch(() => {});
    }
  }, [filters]);

  const fetchQueries = async () => {
    try {
      const params: Record<string, string> = {};
      if (filters.status !== 'all') params.status = filters.status;
      if (filters.userType !== 'all' && isAdmin) params.userType = filters.userType;
      if (filters.priority !== 'all') params.priority = filters.priority;
      const data = await api.getQueries(params);
      setQueries(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load queries');
    } finally {
      setLoading(false);
    }
  };

  const openQuery = async (id: string) => {
    try {
      const data = await api.getQueryById(id);
      setSelected(data);
    } catch {
      toast.error('Failed to load query details');
    }
  };

  const handleCreate = async () => {
    if (!form.subject.trim() || !form.description.trim()) {
      toast.error('Subject and description are required');
      return;
    }
    setSubmitting(true);
    try {
      await api.createQuery(form);
      toast.success('Query submitted successfully');
      setShowForm(false);
      setForm({ targetRole: 'admin', teacherId: '', category: 'general', subject: '', description: '', priority: 'medium' });
      fetchQueries();
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit query');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async () => {
    if (!selected || !reply.trim()) return;
    try {
      await api.replyToQuery(selected.id, reply);
      toast.success('Reply sent');
      setReply('');
      openQuery(selected.id);
      fetchQueries();
    } catch {
      toast.error('Failed to send reply');
    }
  };

  const handleStatusUpdate = async (status: string) => {
    if (!selected) return;
    try {
      await api.updateQuery(selected.id, { status });
      toast.success(`Query marked as ${status}`);
      openQuery(selected.id);
      fetchQueries();
    } catch {
      toast.error('Failed to update status');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[500px] w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Query & Support</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">
            {isAdmin ? 'Manage incoming queries from students, parents, and teachers' : 'Raise and track your support tickets'}
          </p>
        </div>
        {!isAdmin && (
          <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700 rounded-xl font-bold text-xs h-11">
            <Plus className="w-4 h-4 mr-2" /> New Query
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
          <SelectTrigger className="w-40 h-9 rounded-xl text-xs font-bold"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        {isAdmin && (
          <Select value={filters.userType} onValueChange={(v) => setFilters({ ...filters, userType: v })}>
            <SelectTrigger className="w-40 h-9 rounded-xl text-xs font-bold"><SelectValue placeholder="User Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              <SelectItem value="student">Students</SelectItem>
              <SelectItem value="parent">Parents</SelectItem>
              <SelectItem value="teacher">Teachers</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Select value={filters.priority} onValueChange={(v) => setFilters({ ...filters, priority: v })}>
          <SelectTrigger className="w-36 h-9 rounded-xl text-xs font-bold"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Query List */}
        <Card className="lg:col-span-2 border-none shadow-sm">
          <CardHeader className="py-4 px-5 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-600" /> Tickets ({queries.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-[600px] overflow-y-auto">
            {queries.length === 0 ? (
              <div className="py-16 text-center text-gray-400 text-sm font-medium">No queries found</div>
            ) : (
              queries.map((q) => (
                <button
                  key={q.id}
                  onClick={() => openQuery(q.id)}
                  className={`w-full text-left px-5 py-4 border-b hover:bg-gray-50 transition-colors ${selected?.id === q.id ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-bold text-gray-900 truncate">{q.subject}</p>
                    <Badge className={`text-[9px] font-bold border-none ${STATUS_COLORS[q.status] || ''}`}>{q.status?.replace('_', ' ')}</Badge>
                  </div>
                  <p className="text-[10px] text-gray-400 font-mono">{q.ticket_number}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge className={`text-[9px] font-bold border-none capitalize ${PRIORITY_COLORS[q.priority] || ''}`}>{q.priority}</Badge>
                    <span className="text-[10px] text-gray-400 capitalize">{q.raised_by_role} · {q.category}</span>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* Query Detail */}
        <Card className="lg:col-span-3 border-none shadow-sm">
          {!selected ? (
            <CardContent className="py-24 text-center">
              <MessageSquare className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-bold text-gray-400">Select a ticket to view conversation</p>
            </CardContent>
          ) : (
            <>
              <CardHeader className="py-4 px-6 border-b">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base font-bold">{selected.subject}</CardTitle>
                    <p className="text-xs text-gray-400 mt-1 font-mono">{selected.ticket_number}</p>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2">
                      {selected.status !== 'resolved' && (
                        <Button size="sm" variant="outline" className="text-xs font-bold rounded-lg" onClick={() => handleStatusUpdate('resolved')}>
                          <CheckCircle className="w-3 h-3 mr-1" /> Resolve
                        </Button>
                      )}
                      {selected.status !== 'closed' && (
                        <Button size="sm" variant="outline" className="text-xs font-bold rounded-lg" onClick={() => handleStatusUpdate('closed')}>Close</Button>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="p-4 bg-gray-50 rounded-xl border">
                  <p className="text-sm text-gray-700 leading-relaxed">{selected.description}</p>
                  <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(selected.created_at).toLocaleString('en-IN')}
                    · {selected.raised_by?.first_name} {selected.raised_by?.last_name}
                  </p>
                </div>

                {(selected.replies || []).map((r: any) => (
                  <div key={r.id} className={`p-4 rounded-xl border ${r.sender_role === 'admin' ? 'bg-blue-50 border-blue-100 ml-8' : 'bg-white mr-8'}`}>
                    <p className="text-sm text-gray-700">{r.message}</p>
                    <p className="text-[10px] text-gray-400 mt-2">
                      {r.sender?.first_name} {r.sender?.last_name} · {new Date(r.created_at).toLocaleString('en-IN')}
                    </p>
                  </div>
                ))}

                {selected.status !== 'closed' && (
                  <div className="flex gap-3 pt-2">
                    <Textarea
                      placeholder="Type your reply..."
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      className="rounded-xl min-h-[80px] text-sm"
                    />
                    <Button onClick={handleReply} disabled={!reply.trim()} className="bg-blue-600 hover:bg-blue-700 rounded-xl h-auto px-4">
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>

      {/* New Query Modal (inline card) */}
      {showForm && (
        <Card className="border-none shadow-lg fixed inset-0 z-50 m-auto max-w-lg h-fit max-h-[90vh] overflow-y-auto">
          <CardHeader className="border-b">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600" /> Raise a Query
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <Select value={form.targetRole} onValueChange={(v) => setForm({ ...form, targetRole: v, teacherId: '' })}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Send To" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administration</SelectItem>
                <SelectItem value="teacher">Teachers</SelectItem>
              </SelectContent>
            </Select>
            {form.targetRole === 'teacher' && (
              <Select value={form.teacherId} onValueChange={(v) => setForm({ ...form, teacherId: v })}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select Teacher" /></SelectTrigger>
                <SelectContent>
                  {teachers.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name || t.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                {['academic', 'leave', 'fee', 'transport', 'certificate', 'complaint', 'hr', 'technical', 'resource', 'administrative', 'general'].map(c => (
                  <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="rounded-xl" />
            <Textarea placeholder="Describe your query in detail..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-xl min-h-[120px]" />
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-3">
              <Button onClick={handleCreate} loading={submitting} className="flex-1 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold">
                
                Submit Query
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={submitting} className="rounded-xl">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
