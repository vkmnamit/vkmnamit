import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Skeleton } from '../../components/ui/skeleton';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Checkbox } from '../../components/ui/checkbox';
import { Users, Mail, Phone, MessageSquare, Send, Eye, Search, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { normalizePhone, phoneMatches, textIncludes } from '../../../lib/search';

export function ParentsPage() {
  const [loading, setLoading] = useState(false);
  const [parents, setParents] = useState<any[]>([]);
  const [msgModalOpen, setMsgModalOpen] = useState(false);
  const [selectedParent, setSelectedParent] = useState<any>(null);
  const [msgText, setMsgText] = useState('');
  const [msgChannels, setMsgChannels] = useState({ email: true, whatsapp: true });
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewAll, setViewAll] = useState(false);
  const [quickFilter, setQuickFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [classes, setClasses] = useState<any[]>([]);
  const itemsPerPage = 10;
  const navigate = useNavigate();

  useEffect(() => { fetchParents(); fetchClasses(); }, []);

  const fetchClasses = async () => {
    try {
      const data = await api.getClasses();
      setClasses(data || []);
    } catch { /* silent */ }
  };

  const fetchParents = async () => {
    try {
      setLoading(true);
      const data = await api.getParents();
      setParents(data || []);
    } catch (err) {
      toast.error('Failed to load parent directory');
    } finally {
      setLoading(false);
    }
  };

  const filteredParents = parents.filter(p => {
    const search = searchTerm.trim();
    const name = `${p.user?.first_name || ''} ${p.user?.last_name || ''}`;
    const email = p.user?.email || '';
    const phone = p.user?.phone || '';
    const parentId = p.id || '';

    // Search: name, email, phone (digit-normalized), parent ID, student name, admission number
    if (search) {
      const childNames = (p.children || []).map((c: any) =>
        `${c.student?.user?.first_name || ''} ${c.student?.user?.last_name || ''} ${c.student?.admission_number || ''}`
      ).join(' ');

      const matchesSearch =
        textIncludes(name, search) ||
        textIncludes(email, search) ||
        phoneMatches(phone, search) ||
        textIncludes(parentId, search) ||
        textIncludes(childNames, search);

      if (!matchesSearch) return false;
    }

    // Quick filters
    if (quickFilter === 'active' && !p.user?.is_active) return false;
    if (quickFilter === 'inactive' && p.user?.is_active) return false;
    if (quickFilter === 'fee_due' && p.fee_payment_history !== 'defaulter' && p.fee_payment_history !== 'irregular') return false;
    if (quickFilter === 'no_account' && p.user?.is_active) return false;

    // Class filter — match if any linked student is in the class
    if (classFilter !== 'all') {
      const hasClass = (p.children || []).some((c: any) => {
        const section = c.student?.section;
        return section?.class_id === classFilter || section?.class?.id === classFilter;
      });
      if (!hasClass) return false;
    }

    return true;
  });

  const openMessage = (parent: any) => {
    setSelectedParent(parent);
    setMsgText(`Dear ${parent.user?.first_name || 'Parent'},\n\n`);
    setMsgModalOpen(true);
  };

  const handleSendMessage = async () => {
    const channels = Object.entries(msgChannels).filter(([_, v]) => v).map(([k]) => k);
    if (channels.length === 0) { toast.error('Select at least one channel'); return; }
    if (!msgText.trim()) { toast.error('Please type a message'); return; }

    setSending(true);
    try {
      const tId = toast.loading('Dispatching message...');
      await api.sendMultiChannelNotification({
        recipientType: 'individual',
        filters: { email: selectedParent.user?.email },
        subject: 'Message from School Admin',
        message: msgText,
        type: 'custom'
      });
      toast.success(`Message sent to ${selectedParent.user?.first_name} via ${channels.join(', ')}`, { id: tId });
      setMsgModalOpen(false);
      setMsgText('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const viewParentProfile = (parent: any) => {
    navigate(`/parents/${parent.id}`);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {[1, 2].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-[600px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden pb-10">
      {/* Message Modal */}
      <Dialog open={msgModalOpen} onOpenChange={setMsgModalOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Message Parent</DialogTitle>
            <p className="text-sm text-gray-500">Send to: <strong>{selectedParent?.user?.first_name} {selectedParent?.user?.last_name}</strong></p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">Message</Label>
              <Textarea value={msgText} onChange={(e) => setMsgText(e.target.value)} placeholder="Type your message..." className="min-h-[120px] mt-2 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest mb-2 block">Send via</Label>
              <div className="flex gap-3">
                {[
                  { key: 'email', label: 'Email', icon: Mail, color: 'blue' },
                  { key: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'emerald' },

                ].map(ch => (
                  <button
                    key={ch.key}
                    onClick={() => setMsgChannels(prev => ({ ...prev, [ch.key]: !(prev as any)[ch.key] }))}
                    className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all text-xs font-bold ${
                      (msgChannels as any)[ch.key] ? `bg-${ch.color}-50 border-${ch.color}-300 text-${ch.color}-700` : 'bg-gray-50 border-gray-100 text-gray-400'
                    }`}
                  >
                    <ch.icon className="w-4 h-4" />
                    {ch.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMsgModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSendMessage} loading={sending} className="bg-blue-600 hover:bg-blue-700 rounded-xl font-bold px-6">
              <Send className="w-4 h-4 mr-2" /> {sending ? 'Sending...' : 'Send Message'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Parent Directory</h1>
          <p className="text-gray-500 font-medium text-sm">Manage parent contacts and linked students</p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700 font-semibold h-12 w-full sm:w-auto shadow-lg shadow-blue-600/20" onClick={() => toast.info('Parents are auto-created when you add students with guardian info')}>
          Invite Parents
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Total Parents', value: parents.length, color: 'bg-blue-600' },
          { label: 'Active Users', value: parents.filter(p => p.user?.is_active).length, color: 'bg-green-600' },
          { label: 'Fee Defaulters', value: parents.filter(p => p.fee_payment_history === 'defaulter').length, color: 'bg-red-600' },
        ].map((stat) => (
          <Card key={stat.label} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 ${stat.color} rounded-xl flex items-center justify-center shadow-lg`}>
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-semibold">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-none shadow-sm">
        <div className="p-4 sm:p-6 border-b border-gray-100 space-y-4">
          {/* Full-width search */}
          <div className="relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, phone, student name, or admission no..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full pl-12 pr-4 h-12 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>

          {/* Quick filters */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: 'All' },
              { id: 'fee_due', label: 'Fee Due' },
              { id: 'active', label: 'Active' },
              { id: 'inactive', label: 'Inactive' },
              { id: 'no_account', label: 'No Account' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => { setQuickFilter(f.id); setCurrentPage(1); }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  quickFilter === f.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Advanced filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={classFilter} onValueChange={(v) => { setClassFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="h-12 rounded-xl font-medium text-sm w-full sm:w-48">
                <Filter className="w-4 h-4 mr-2 text-gray-400" />
                <SelectValue placeholder="Filter by Class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 h-12 px-4 bg-gray-50 rounded-xl border border-gray-100 text-xs font-bold text-gray-500 cursor-pointer">
              <input type="checkbox" checked={viewAll} onChange={(e) => { setViewAll(e.target.checked); setCurrentPage(1); }} className="w-4 h-4 rounded" />
              Show all (no pagination)
            </label>
          </div>
        </div>

        {/* Mobile: Card view */}
        <div className="md:hidden divide-y divide-gray-50">
          {(viewAll ? filteredParents : filteredParents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)).map(parent => (
            <div key={parent.id} className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11">
                  <AvatarFallback className="bg-blue-600 text-white font-bold">
                    {parent.user?.first_name?.[0]}{parent.user?.last_name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 truncate">{parent.user?.first_name} {parent.user?.last_name}</p>
                  <p className="text-xs text-gray-400">{parent.occupation || 'Guardian'}</p>
                </div>
                <Badge className={`text-[9px] font-bold border-none ${
                  parent.fee_payment_history === 'defaulter' ? 'bg-red-50 text-red-700' :
                  parent.fee_payment_history === 'irregular' ? 'bg-amber-50 text-amber-700' :
                  'bg-emerald-50 text-emerald-700'
                }`}>{parent.fee_payment_history || 'Reliable'}</Badge>
              </div>
              <div className="space-y-1.5 text-sm">
                <a href={`mailto:${parent.user?.email}`} className="flex items-center gap-2 text-gray-600"><Mail className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{parent.user?.email}</span></a>
                <a href={`tel:${parent.user?.phone}`} className="flex items-center gap-2 text-gray-600"><Phone className="w-3.5 h-3.5 shrink-0" />{parent.user?.phone || '—'}</a>
              </div>
              <div className="flex flex-wrap gap-2">
                {parent.children?.map((c: any, idx: number) => (
                  <Badge key={idx} variant="outline" className="bg-blue-50 text-blue-700 border-none text-[10px] font-bold">
                    {c.student?.user?.first_name} {c.student?.user?.last_name}
                  </Badge>
                )) || <span className="text-gray-400 text-xs">No linked students</span>}
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="flex-1 h-10 rounded-xl text-xs font-bold" onClick={() => viewParentProfile(parent)}>
                  <Eye className="w-3 h-3 mr-1" /> View
                </Button>
                <Button size="sm" className="flex-1 h-10 rounded-xl text-xs font-bold bg-blue-600" onClick={() => openMessage(parent)}>
                  <MessageSquare className="w-3 h-3 mr-1" /> Message
                </Button>
              </div>
            </div>
          ))}
          {filteredParents.length === 0 && (
            <div className="py-16 text-center px-6">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-lg font-medium text-gray-900">No parents found</p>
              <p className="text-sm text-gray-500 mt-1">Try adjusting your search or filters.</p>
              <Button className="mt-4 bg-blue-600" onClick={() => toast.info('Add students with guardian info to auto-create parent accounts')}>
                Invite Your First Parent
              </Button>
            </div>
          )}
        </div>

        {/* Desktop: Table view */}
        <div className="hidden md:block overflow-x-auto w-full">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50">
                <TableHead className="font-bold text-gray-600 py-4">Parent</TableHead>
                <TableHead className="font-bold text-gray-600 py-4">Contact Info</TableHead>
                <TableHead className="font-bold text-gray-600 py-4">Linked Students</TableHead>
                <TableHead className="font-bold text-gray-600 py-4">Status</TableHead>
                <TableHead className="text-right font-bold text-gray-600 py-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(viewAll ? filteredParents : filteredParents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)).map((parent) => (
                <TableRow key={parent.id} className="hover:bg-blue-50/50 transition-colors">
                  <TableCell className="py-4">
                    <div className="flex items-center gap-3 min-w-[200px]">
                      <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                        <AvatarFallback className="bg-blue-600 text-white font-bold">
                          {parent.user?.first_name?.[0]}{parent.user?.last_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-bold text-gray-900">{parent.user?.first_name} {parent.user?.last_name}</p>
                        <p className="text-[10px] text-gray-400 font-medium">{parent.occupation || 'Guardian'}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex flex-col gap-1 min-w-[150px]">
                      <a href={`mailto:${parent.user?.email}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600">
                        <Mail className="w-3.5 h-3.5 text-gray-400" /> {parent.user?.email}
                      </a>
                      <a href={`tel:${parent.user?.phone}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600">
                        <Phone className="w-3.5 h-3.5 text-gray-400" /> {parent.user?.phone}
                      </a>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex flex-wrap gap-2">
                      {parent.children?.map((c: any, idx: number) => (
                        <Badge key={idx} variant="outline" className="bg-blue-50 text-blue-700 border-none font-bold cursor-pointer hover:bg-blue-100" onClick={() => {
                          if (c.student_id) navigate(`/students/${c.student_id}`);
                          else toast.info(`Viewing profile for ${c.student?.user?.first_name}`);
                        }}>
                          {c.student?.user?.first_name} {c.student?.user?.last_name}
                        </Badge>
                      )) || <span className="text-gray-400 text-xs">No Linked Students</span>}
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge className={`border-none text-[10px] font-bold ${
                      parent.fee_payment_history === 'defaulter' ? 'bg-red-50 text-red-700' :
                      parent.fee_payment_history === 'irregular' ? 'bg-amber-50 text-amber-700' :
                      'bg-emerald-50 text-emerald-700'
                    }`}>{parent.fee_payment_history || 'Reliable'}</Badge>
                  </TableCell>
                  <TableCell className="text-right py-4">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" className="h-8 rounded-lg font-medium text-xs" onClick={() => viewParentProfile(parent)}>
                        <Eye className="w-3 h-3 mr-1" /> View
                      </Button>
                      <Button size="sm" className="h-8 rounded-lg font-medium text-xs bg-blue-600 hover:bg-blue-700" onClick={() => openMessage(parent)}>
                        <MessageSquare className="w-3 h-3 mr-1" /> Message
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredParents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-lg font-medium text-gray-900">No parents found</p>
                    <p className="text-sm text-gray-500">Try adjusting your search terms.</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {!viewAll && filteredParents.length > itemsPerPage && (
          <div className="flex items-center justify-between p-6 border-t border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Page {currentPage} of {Math.ceil(filteredParents.length / itemsPerPage)}
            </p>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="h-9 w-9 p-0 rounded-xl border-gray-200" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-9 w-9 p-0 rounded-xl border-gray-200" 
                disabled={currentPage === Math.ceil(filteredParents.length / itemsPerPage)}
                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredParents.length / itemsPerPage), prev + 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
