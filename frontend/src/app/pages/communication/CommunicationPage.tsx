import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Skeleton } from '../../components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
  MessageSquare, Send, Bell, Mail, Search, Filter, CheckCircle,
  Users, Receipt, FileText, X, Loader2, Clock, Settings
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router';

function StudentParentCommunicationView() {
  const [recipientType, setRecipientType] = useState('teachers');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [channels, setChannels] = useState<string[]>(['email', 'whatsapp']);

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error('Subject and message are required');
      return;
    }
    setSending(true);
    try {
      await api.sendMultiChannelNotification({
        recipientType,
        subject,
        message,
        type: 'custom',
        channels,
        filters: {}
      });
      toast.success('Message dispatched successfully!');
      setSubject('');
      setMessage('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const toggleChannel = (c: string) => {
    setChannels(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-10">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Message Center</h1>
        <p className="text-sm text-gray-500 font-medium mt-1">
          Send direct messages via Email and WhatsApp to your teachers or school administration.
        </p>
      </div>

      <Card className="border-none shadow-md overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <CardTitle className="text-xl flex items-center gap-2">
            <Send className="w-5 h-5" /> Compose Message
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-6 bg-white">
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Recipient</label>
            <Select value={recipientType} onValueChange={setRecipientType}>
              <SelectTrigger className="h-12 border-gray-200">
                <SelectValue placeholder="Select Recipient" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="teachers">Class Teachers</SelectItem>
                <SelectItem value="admin">School Administration</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Communication Channels</label>
            <div className="flex flex-wrap gap-3">
              {[
                { id: 'email', icon: Mail, label: 'Email', color: 'bg-emerald-100 text-emerald-700', ring: 'ring-emerald-500' },
                { id: 'whatsapp', icon: Bell, label: 'WhatsApp', color: 'bg-green-100 text-green-700', ring: 'ring-green-500' }
              ].map(c => {
                const Icon = c.icon;
                const isSelected = channels.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleChannel(c.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                      isSelected ? c.color + ' ring-2 ring-offset-1 ' + c.ring : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Subject</label>
            <Input 
              value={subject} 
              onChange={e => setSubject(e.target.value)} 
              placeholder="What is this about?" 
              className="h-12 border-gray-200" 
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Message</label>
            <Textarea 
              value={message} 
              onChange={e => setMessage(e.target.value)} 
              placeholder="Type your message here..." 
              className="min-h-[160px] resize-y border-gray-200 p-4"
            />
          </div>

          <Button 
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-xl shadow-lg shadow-blue-600/20"
            onClick={handleSend}
            disabled={sending || channels.length === 0}
          >
            {sending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Send className="w-5 h-5 mr-2" />}
            {sending ? 'Dispatching...' : 'Dispatch Message'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function CommunicationPage() {
  const { user } = useAuth();
  
  if (user?.role === 'parent' || user?.role === 'student') {
    return <StudentParentCommunicationView />;
  }
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [sending, setSending] = useState(false);

  // Email compose state
  const [recipientType, setRecipientType] = useState<'all' | 'class' | 'section' | 'individual'>('all');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [filterEmail, setFilterEmail] = useState('');
  const [filterPhone, setFilterPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [emailType, setEmailType] = useState<'announcement' | 'fee_reminder' | 'receipt' | 'custom'>('announcement');
  const [whatsappTemplate, setWhatsappTemplate] = useState<'text' | 'template_hello_world' | 'template_custom'>('text');
  const [channels, setChannels] = useState<string[]>(['email', 'whatsapp']);

  // Log search
  const [logSearch, setLogSearch] = useState('');
  const [logFilter, setLogFilter] = useState('all');
  const [emailAnalytics, setEmailAnalytics] = useState<any>(null);
  const [emails, setEmails] = useState<any[]>([]);
  const [whatsappStatus, setWhatsappStatus] = useState<any>(null);

  useEffect(() => {
    fetchData();
    if (user?.role === 'teacher') {
      setRecipientType('class');
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const [logsData, studentsData, classesData, analyticsData, emailsData, whatsappData] = await Promise.allSettled([
        api.getNotificationLogs(),
        api.getStudents({ limit: '9999' }),
        api.getClasses(),
        api.getEmailAnalytics(),
        api.getEmailLogs(),
        api.getWhatsAppStatus(),
      ]);
      if (logsData.status === 'fulfilled') setLogs(logsData.value?.logs || logsData.value || []);
      if (studentsData.status === 'fulfilled') setStudents(studentsData.value?.students || []);
      if (classesData.status === 'fulfilled') setClasses(classesData.value || []);
      if (analyticsData.status === 'fulfilled') setEmailAnalytics(analyticsData.value);
      if (emailsData.status === 'fulfilled') setEmails(emailsData.value?.emails || []);
      if (whatsappData.status === 'fulfilled') setWhatsappStatus(whatsappData.value);
    } catch (err) {
      console.error('Failed to load communication data');
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmail = async () => {
    if (channels.includes('email') && !subject.trim()) {
      toast.error('Subject line is required for email');
      return;
    }
    if (whatsappTemplate === 'text' && !message.trim()) {
      toast.error('Message body is required');
      return;
    }
    if (whatsappTemplate === 'template_custom' && !message.trim()) {
      toast.error('Message body is required for the custom template');
      return;
    }
    setSending(true);
    try {
      const payload: any = {
        recipientType,
        subject,
        message,
        type: emailType,
        whatsappTemplate,
        channels,
        filters: {},
      };
      if (recipientType === 'class' && selectedClass) payload.filters.classId = selectedClass;
      if (recipientType === 'section' && selectedSection) payload.filters.sectionId = selectedSection;
      if (recipientType === 'individual') {
        if (selectedStudent) payload.filters.studentId = selectedStudent;
        if (filterEmail) payload.filters.email = filterEmail;
        if (filterPhone) payload.filters.phone = filterPhone;
      }
      await api.sendMultiChannelNotification(payload);
      const successMsg = channels.includes('email') && channels.includes('whatsapp') 
        ? 'Message dispatched successfully!' 
        : channels.includes('whatsapp') 
          ? 'WhatsApp message dispatched!' 
          : 'Email dispatched successfully!';
      toast.success(successMsg);
      setSubject('');
      setMessage('');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  const handleSendReceipt = async (feePaymentId: string) => {
    try {
      await api.sendReceiptEmail({ feePaymentId });
      toast.success('Receipt sent to parent');
    } catch {
      toast.error('Failed to send receipt');
    }
  };

  const handleSendReminders = async () => {
    setSending(true);
    try {
      const res = await api.sendFeeReminders();
      toast.success(`Fee reminders sent to ${res.sent} parents`);
      fetchData();
    } catch {
      toast.error('Failed to send fee reminders');
    } finally {
      setSending(false);
    }
  };

  const availableSections = selectedClass
    ? (classes.find((c: any) => c.id === selectedClass)?.sections || [])
    : [];

  const filteredStudents = students.filter((s: any) => {
    const sClassId = s.section?.class?.id || s.section?.class_id;
    if (selectedClass && sClassId !== selectedClass) return false;
    if (selectedSection && s.section_id !== selectedSection) return false;
    return true;
  });

  const filteredLogs = logs.filter((l: any) => {
    const matchSearch = l.message?.toLowerCase().includes(logSearch.toLowerCase()) ||
      l.recipient?.toLowerCase().includes(logSearch.toLowerCase()) ||
      l.type?.toLowerCase().includes(logSearch.toLowerCase());
    const matchFilter = logFilter === 'all' || l.channel === logFilter;
return matchSearch && matchFilter;
  });

  const stats = [
    { label: 'School Dispatches', value: logs.length, icon: Send, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
    { label: 'Emails', value: logs.filter(l => l.channel === 'email').length, icon: Mail, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
    { label: 'WhatsApp', value: logs.filter(l => l.channel === 'whatsapp').length, icon: Bell, color: 'text-green-600', bg: 'bg-green-50 border-green-100' },
  ];

  if (loading) {
    return (
      <div className="space-y-6 max-w-full overflow-x-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
        </div>
        <Skeleton className="h-[600px] w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-full overflow-x-hidden pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Communication Hub</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">
            Dispatch synchronized notifications via Email and WhatsApp to students, parents, and staff
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full sm:w-auto">
          <Button
            variant="outline"
            className="h-12 w-full sm:w-auto px-5 rounded-xl font-bold text-sm border-orange-200 text-orange-700 hover:bg-orange-50"
            onClick={handleSendReminders}
            loading={sending}
          >
            <Bell className="w-4 h-4 mr-2" />
            Send Fee Reminders
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 h-12 w-full sm:w-auto px-6 rounded-xl shadow-xl shadow-blue-600/20 font-bold text-sm">
            <Receipt className="w-4 h-4 mr-2" />
            Bulk Receipts
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="border-none shadow-sm bg-white overflow-hidden group">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 ${s.bg} rounded-xl flex items-center justify-center border group-hover:scale-110 transition-transform`}>
                    <Icon className={`w-6 h-6 ${s.color}`} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{s.label}</p>
                    <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="compose" className="space-y-6">
        <div className="overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pb-0">
          <TabsList className="bg-gray-100 p-1 rounded-xl h-12 w-max sm:w-auto inline-flex">
            <TabsTrigger value="compose" className="rounded-lg px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm font-bold text-xs flex items-center gap-2">
              <Send className="w-3.5 h-3.5" /> Compose & Send
            </TabsTrigger>
            <TabsTrigger value="logs" className="rounded-lg px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm font-bold text-xs flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" /> Delivery Logs
            </TabsTrigger>
            <TabsTrigger value="emails" className="rounded-lg px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm font-bold text-xs flex items-center gap-2">
              <Mail className="w-3.5 h-3.5" /> Email Center
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── COMPOSE TAB ─────────────────────────────────────────── */}
        <TabsContent value="compose" className="outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left — Recipient Filters */}
            <Card className="border-none shadow-sm bg-white overflow-hidden lg:col-span-1">
              <CardHeader className="py-5 px-6 border-b border-gray-50">
                <CardTitle className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Filter className="w-4 h-4 text-blue-600" /> Recipient Filter
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-5">
                {/* Recipient Type */}
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Send To</label>
                  <Select value={recipientType} onValueChange={(v: any) => {
                    setRecipientType(v);
                    setSelectedClass(''); setSelectedSection(''); setSelectedStudent(''); setFilterEmail('');
                  }}>
                    <SelectTrigger className="h-10 rounded-xl border-gray-100 font-medium text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {user?.role !== 'teacher' && <SelectItem value="all">All Parents / Students</SelectItem>}
                      <SelectItem value="class">Specific Class</SelectItem>
                      <SelectItem value="section">Specific Section</SelectItem>
                      <SelectItem value="individual">Individual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Class Filter */}
                {['class', 'section', 'individual'].includes(recipientType) && (
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Class</label>
                    <Select value={selectedClass} onValueChange={setSelectedClass}>
                      <SelectTrigger className="h-10 rounded-xl border-gray-100 font-medium text-sm">
                        <SelectValue placeholder="Select class..." />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Section Filter */}
                {['section', 'individual'].includes(recipientType) && selectedClass && (
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Section</label>
                    <Select value={selectedSection} onValueChange={setSelectedSection}>
                      <SelectTrigger className="h-10 rounded-xl border-gray-100 font-medium text-sm">
                        <SelectValue placeholder="Select section..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableSections.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>Section {s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Individual — Student / Email */}
                {recipientType === 'individual' && (
                  <>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Student Name</label>
                      <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                        <SelectTrigger className="h-10 rounded-xl border-gray-100 font-medium text-sm">
                          <SelectValue placeholder="Search student..." />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredStudents.map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.user?.first_name} {s.user?.last_name} — Roll #{s.roll_number}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedStudent && (
                        <div className="mt-2 p-3 rounded-lg bg-blue-50/50 border border-blue-100 flex flex-col gap-1">
                          <p className="text-[11px] text-gray-500">
                            <strong>Email:</strong> {students.find(s => s.id === selectedStudent)?.user?.email || 'N/A'}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            <strong>Phone:</strong> {students.find(s => s.id === selectedStudent)?.user?.phone || 'N/A'}
                          </p>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Or Custom Email / Phone</label>
                      <div className="flex flex-col gap-2">
                        <Input
                          placeholder="parent@email.com"
                          value={filterEmail}
                          onChange={(e) => setFilterEmail(e.target.value)}
                          className="h-10 rounded-xl border-gray-100 font-medium text-sm"
                        />
                        <Input
                          placeholder="+919876543210 (Phone)"
                          value={filterPhone}
                          onChange={(e) => setFilterPhone(e.target.value)}
                          className="h-10 rounded-xl border-gray-100 font-medium text-sm"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Delivery Channels */}
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 block">Delivery Channels</label>
                  <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={channels.includes('email')}
                        onChange={(e) => {
                          if (e.target.checked) setChannels([...channels, 'email']);
                          else setChannels(channels.filter(c => c !== 'email'));
                        }}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs font-bold text-gray-700 group-hover:text-blue-600 transition-colors">Email</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={channels.includes('whatsapp')}
                        onChange={(e) => {
                          if (e.target.checked) setChannels([...channels, 'whatsapp']);
                          else setChannels(channels.filter(c => c !== 'whatsapp'));
                        }}
                        className="w-4 h-4 rounded text-green-600 focus:ring-green-500"
                      />
                      <span className="text-xs font-bold text-gray-700 group-hover:text-green-600 transition-colors">WhatsApp</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Email Category */}
                  {channels.includes('email') && (
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Email Category</label>
                      <Select value={emailType} onValueChange={(v: any) => setEmailType(v)}>
                        <SelectTrigger className="h-10 rounded-xl border-gray-100 font-medium text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="announcement">Announcement</SelectItem>
                          <SelectItem value="fee_reminder">Fee Reminder</SelectItem>
                          <SelectItem value="receipt">Payment Receipt</SelectItem>
                          <SelectItem value="custom">Custom Email</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* WhatsApp Type */}
                  {channels.includes('whatsapp') && (
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">WhatsApp Type</label>
                      <Select value={whatsappTemplate} onValueChange={(v: any) => setWhatsappTemplate(v)}>
                        <SelectTrigger className="h-10 rounded-xl border-gray-100 font-medium text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Raw Text Message</SelectItem>
                          <SelectItem value="template_hello_world">Template: hello_world</SelectItem>
                          <SelectItem value="template_custom">Template: kautix_custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Recipient Summary */}
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1">Recipient Summary</p>
                  <p className="text-sm font-bold text-blue-900">
                    {recipientType === 'all' ? `All ${students.length} students' parents` :
                     recipientType === 'class' && selectedClass ? `All students in selected class` :
                     recipientType === 'section' && selectedSection ? `Students in selected section` :
                     recipientType === 'individual' && (selectedStudent || filterEmail || filterPhone) ? '1 recipient' :
                     'No recipient selected'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Right — Compose */}
            <Card className="border-none shadow-sm bg-white overflow-hidden lg:col-span-2">
              <CardHeader className="py-5 px-6 border-b border-gray-50">
                <CardTitle className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-600" /> 
                  {channels.includes('email') && channels.includes('whatsapp') ? 'Compose Message (Email + WhatsApp)' : 
                   channels.includes('whatsapp') ? 'Compose WhatsApp Message' : 'Compose Email'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-5">
                {channels.includes('email') && (
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Subject Line</label>
                    <Input
                      placeholder="Enter email subject..."
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="h-11 rounded-xl border-gray-100 font-medium text-sm focus:border-blue-500"
                    />
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Message Body</label>
                  <Textarea
                    placeholder="Type your message here... Use {student_name}, {parent_name}, {amount} as dynamic variables."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="rounded-xl border-gray-100 font-medium text-sm focus:border-blue-500 min-h-[240px] resize-none"
                  />
                  <p className="text-[10px] text-gray-400 mt-2 font-medium">
                    Dynamic variables: <code className="bg-gray-100 px-1 rounded">{'{student_name}'}</code> <code className="bg-gray-100 px-1 rounded">{'{parent_name}'}</code> <code className="bg-gray-100 px-1 rounded">{'{amount}'}</code>
                  </p>
                </div>

                {/* Quick Templates */}
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Quick Templates</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'Fee Reminder', sub: 'Fee Overdue Notice', msg: 'Dear {parent_name}, this is a reminder that fees for {student_name} are overdue. Kindly pay ₹{amount} at the earliest to avoid penalties. Thank you. — Kautix School' },
                      { label: 'Exam Schedule', sub: 'Upcoming Examination Notice', msg: 'Dear {parent_name}, please be informed that examinations for {student_name} are scheduled. Kindly ensure your ward is prepared. Contact school for more details. — Kautix School' },
                      { label: 'Holiday Notice', sub: 'School Holiday Announcement', msg: 'Dear Parents, the school will remain closed on the upcoming holiday. Regular classes will resume the following day. Thank you for your cooperation. — Kautix School' },
                    ].map((t) => (
                      <button
                        key={t.label}
                        onClick={() => { setSubject(t.sub); setMessage(t.msg); }}
                        className="px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-[10px] font-bold text-gray-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-all"
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button
                    className="flex-1 h-12 rounded-xl bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-600/20 font-bold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleSendEmail}
                    disabled={
                      sending || 
                      (channels.includes('email') && !subject.trim()) || 
                      (channels.includes('whatsapp') && whatsappTemplate !== 'template_hello_world' && !message.trim())
                    }
                  >
                    {sending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Dispatching...</>
                    ) : (
                      <><Send className="w-4 h-4 mr-2" /> Send Multi-Channel Message</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 px-6 rounded-xl font-bold text-xs border-gray-200"
                    onClick={() => { setSubject(''); setMessage(''); }}
                  >
                    <X className="w-4 h-4 mr-2" /> Clear
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── LOGS TAB ────────────────────────────────────────────── */}
        <TabsContent value="logs" className="outline-none">
          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="py-5 px-6 border-b border-gray-50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <CardTitle className="text-sm font-bold text-gray-900">Delivery Logs ({filteredLogs.length})</CardTitle>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Search by recipient or type..."
                      value={logSearch}
                      onChange={(e) => setLogSearch(e.target.value)}
                      className="pl-12 h-9 w-60 rounded-xl border-gray-100 text-sm font-medium"
                    />
                  </div>
                  <Select value={logFilter} onValueChange={setLogFilter}>
                    <SelectTrigger className="h-9 w-36 rounded-xl border-gray-100 font-medium text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Channels</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-50">
                {filteredLogs.length === 0 ? (
                  <div className="py-20 text-center">
                    <Mail className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm font-bold text-gray-400">No communication logs found.</p>
                  </div>
                ) : (
                  filteredLogs.slice(0, 50).map((log: any) => (
                    <div key={log.id} className="flex items-start justify-between gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start gap-4 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          log.channel === 'email' ? 'bg-blue-50 text-blue-600' :
                          'bg-green-50 text-green-600'
                        }`}>
                          {log.channel === 'email' ? <Mail className="w-4 h-4" /> :
                           <Bell className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="text-sm font-bold text-gray-900 truncate">
                              {log.metadata?.title || log.type || 'Notification'}
                            </p>
                            <Badge className="text-[9px] font-bold px-2 py-0 rounded-full bg-gray-100 text-gray-600 border-none capitalize">
                              {log.type?.replace('_', ' ')}
                            </Badge>
                          </div>
                          <p className="text-xs font-medium text-gray-500 truncate">{log.recipient}</p>
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{log.message}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <Badge className={`text-[9px] font-bold px-2 py-0.5 rounded-full border-none ${
                          log.status === 'sent' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {log.status === 'sent' ? <CheckCircle className="w-2.5 h-2.5 inline mr-1" /> : null}
                          {log.status}
                        </Badge>
                        <p className="text-[10px] font-medium text-gray-400">
                          {log.created_at ? new Date(log.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── EMAIL CENTER TAB ──────────────────────────────────────── */}
        <TabsContent value="emails" className="outline-none space-y-6">
          {emailAnalytics && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                { label: 'School Total', value: emailAnalytics.total, color: 'text-gray-700', bg: 'bg-gray-50' },
                { label: 'Sent', value: emailAnalytics.sent, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Delivered', value: emailAnalytics.delivered, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'Failed', value: emailAnalytics.failed, color: 'text-red-600', bg: 'bg-red-50' },
                { label: 'Opened', value: emailAnalytics.opened, color: 'text-purple-600', bg: 'bg-purple-50' },
              ].map(s => (
                <Card key={s.label} className="border-none shadow-sm">
                  <CardContent className={`p-4 ${s.bg} rounded-xl`}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">{s.label}</p>
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <Card className="border-none shadow-sm">
            <CardHeader className="py-5 px-6 border-b">
              <CardTitle className="text-sm font-bold">Email History</CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y">
              {emails.length === 0 ? (
                <div className="py-16 text-center text-gray-400 text-sm">No emails logged yet</div>
              ) : emails.slice(0, 30).map((e: any) => (
                <div key={e.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{e.subject}</p>
                    <p className="text-xs text-gray-500">{e.recipient_name || e.recipient_email} · {e.recipient_type}</p>
                  </div>
                  <div className="text-right">
                    <Badge className="text-[9px] font-bold border-none capitalize">{e.delivery_status}</Badge>
                    <p className="text-[10px] text-gray-400 mt-1">{e.sent_at ? new Date(e.sent_at).toLocaleDateString('en-IN') : '—'}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
