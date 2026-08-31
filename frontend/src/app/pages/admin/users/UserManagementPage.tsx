import React, { useState, useEffect } from 'react';
import { api } from '../../../../lib/api';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu';
import { Label } from '../../../components/ui/label';
import {
  Search,
  Users,
  UserCheck,
  UserX,
  Eye,
  Filter,
  Download,
  Plus,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  Mail,
  Lock,
  Trash2,
  CheckCircle2,
  XCircle,
  UserPlus,
  KeyRound,
  Send,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router';
import { useAuth } from '../../../context/AuthContext';
import { AddUserModal } from '../../../components/modals/AddUserModal';

type UserRole = 'student' | 'teacher' | 'parent' | 'admin';

interface UserData {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  is_active: boolean;
  avatar_url?: string;
  created_at: string;
  phone?: string;
  school_id: string;
  // Role specific IDs
  student_id?: string;
  teacher_id?: string;
  parent_id?: string;
}

export function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserData[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | UserRole>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addUserRole, setAddUserRole] = useState<'student' | 'teacher' | 'parent' | 'admin'>('student');
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendingAll, setResendingAll] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [sendingSelected, setSendingSelected] = useState(false);
  const [passwordModal, setPasswordModal] = useState<{ user: UserData; customPassword: string; saving: boolean } | null>(null);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchUsers();
  }, [activeTab]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // In a real app, we'd have a unified users endpoint
      // For now, let's fetch based on the active tab or fetch all and filter
      let data: any[] = [];

      if (activeTab === 'all') {
        const [students, teachers, parents, admins] = await Promise.all([
          api.getStudents(),
          api.getTeachers(),
          api.getParents(),
          api.getAdmins(),
        ]);

        const mappedStudents = (students.students || students || []).map((s: any) => ({ ...(s.user || s.profile || {}), role: 'student', id: s.user?.id || s.userId || s.id, student_id: s.id, created_at: s.created_at || s.user?.created_at }));
        const mappedTeachers = (teachers.data || teachers || []).map((t: any) => ({ ...(t.user || t.profile || {}), role: 'teacher', id: t.user?.id || t.userId || t.id, teacher_id: t.id, created_at: t.created_at || t.profile?.created_at }));
        const mappedParents = (parents.parents || parents || []).map((p: any) => ({ ...(p.user || p.profile || {}), role: 'parent', id: p.user?.id || p.userId || p.id, parent_id: p.id, created_at: p.created_at || p.user?.created_at }));
        const mappedAdmins = (admins.admins || admins || []).map((a: any) => ({ ...a, role: 'admin', id: a.id }));

        data = [...mappedAdmins, ...mappedStudents, ...mappedTeachers, ...mappedParents];
      } else if (activeTab === 'admin') {
        const res = await api.getAdmins();
        data = (res.admins || res || []).map((a: any) => ({ ...a, role: 'admin', id: a.id }));
      } else if (activeTab === 'student') {
        const res = await api.getStudents();
        data = (res.students || []).map((s: any) => ({ ...(s.user || s.profile || {}), role: 'student', id: s.user?.id || s.userId || s.id, student_id: s.id, created_at: s.created_at || s.user?.created_at }));
      } else if (activeTab === 'teacher') {
        const res = await api.getTeachers();
        data = (res.data || res || []).map((t: any) => ({ ...(t.user || t.profile || {}), role: 'teacher', id: t.user?.id || t.userId || t.id, teacher_id: t.id, created_at: t.created_at || t.profile?.created_at }));
      } else if (activeTab === 'parent') {
        const res = await api.getParents();
        data = (res.parents || res || []).map((p: any) => ({ ...(p.user || p.profile || {}), role: 'parent', id: p.user?.id || p.userId || p.id, parent_id: p.id, created_at: p.created_at || p.user?.created_at }));
      }

      setUsers(data);
    } catch (err) {
      console.error('Failed to fetch users', err);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCredentials = async (userId: string, userName: string) => {
    setResendingId(userId);
    try {
      await api.resendCredentials(userId);
      toast.success(`✅ Credentials sent to ${userName}`);
    } catch (err) {
      toast.error('Failed to resend credentials');
    } finally {
      setResendingId(null);
    }
  };

  const handleResendAll = async (role: 'admin' | 'teacher' | 'student' | 'parent' | 'all') => {
    const label = role === 'all' ? 'ALL users' : `all ${role}s`;
    if (!confirm(`This will reset passwords for ${label} and email them their login credentials. Continue?`)) return;
    setResendingAll(true);
    try {
      const res: any = await api.resendAllAdminCredentials(role);
      toast.success(res?.message || `Credentials sent to ${label}`);
    } catch (err) {
      toast.error('Failed to resend credentials');
    } finally {
      setResendingAll(false);
    }
  };

  const handleSendToSelected = async () => {
    if (selectedUsers.size === 0) return;
    if (!confirm(`Send login credentials to ${selectedUsers.size} selected user(s)? Their passwords will be reset.`)) return;
    setSendingSelected(true);
    let success = 0;
    for (const userId of Array.from(selectedUsers)) {
      try {
        await api.resendCredentials(userId);
        success++;
      } catch { }
    }
    setSendingSelected(false);
    setSelectedUsers(new Set());
    toast.success(`Credentials sent to ${success} user(s)`);
  };

  const handleResetPassword = async () => {
    if (!passwordModal) return;
    setPasswordModal(prev => prev ? { ...prev, saving: true } : null);
    try {
      // If custom password provided, use it; otherwise generate random
      const payload: any = { userId: passwordModal.user.id };
      if (passwordModal.customPassword.trim()) payload.customPassword = passwordModal.customPassword.trim();
      await api.resendCredentials(passwordModal.user.id, passwordModal.customPassword.trim() || undefined);
      toast.success(`Password updated and emailed to ${passwordModal.user.email}`);
      setPasswordModal(null);
    } catch {
      toast.error('Failed to reset password');
      setPasswordModal(prev => prev ? { ...prev, saving: false } : null);
    }
  };

  const toggleSelectUser = (userId: string) => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedUsers.size === paginatedUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(paginatedUsers.map(u => u.id)));
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    // Immediately update UI — no refetch
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: newStatus } : u));
    try {
      await api.updateUserStatus(userId, newStatus);
      toast.success(`User ${newStatus ? 'activated' : 'suspended'} successfully`);
    } catch (err) {
      // Revert on failure
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: currentStatus } : u));
      toast.error('Failed to update status');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    // Immediately remove from UI — no refetch, no stale data
    setUsers(prev => prev.filter(u => u.id !== userId));
    try {
      await api.deleteUser(userId);
      toast.success('User deleted successfully');
    } catch (err) {
      // Refetch to restore on failure
      fetchUsers();
      toast.error('Failed to delete user');
    }
  };

  const filteredUsers = users.filter(u => {
    const firstName = u.first_name || '';
    const lastName = u.last_name || '';
    const email = u.email || '';

    const nameStr = `${firstName} ${lastName}`.toLowerCase();
    const emailStr = email.toLowerCase();
    const search = (searchTerm || '').toLowerCase();

    return nameStr.includes(search) || emailStr.includes(search);
  });

  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const stats = [
    { label: 'Total Users', value: users.length, icon: Users, color: 'text-blue-400', trend: '+12%' },
    { label: 'Active Today', value: Math.floor(users.length * 0.8), icon: UserCheck, color: 'text-emerald-400', trend: '+5%' },
    { label: 'Suspended', value: users.filter(u => !u.is_active).length, icon: UserX, color: 'text-rose-400', trend: '-2%' },
    { label: 'New This Week', value: 48, icon: UserPlus, color: 'text-amber-400', trend: '+24%' },
  ];

  return (
    <div className="dashboard-page min-h-full bg-slate-50/50 p-3 sm:p-4 lg:p-6 space-y-6 sm:space-y-8 font-sans">

      {/* Password Reset Modal */}
      {passwordModal && (
        <Dialog open onOpenChange={() => setPasswordModal(null)}>
          <DialogContent className="sm:max-w-md bg-white rounded-2xl border-none shadow-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-gray-900 font-black">
                <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-white" />
                </div>
                Reset Password
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="font-bold text-slate-900 text-sm">{passwordModal.user.first_name} {passwordModal.user.last_name}</p>
                <p className="text-xs text-slate-500">{passwordModal.user.email} · {passwordModal.user.role}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase text-slate-500 tracking-widest">New Password</Label>
                <Input
                  placeholder="Leave blank to auto-generate a secure password"
                  value={passwordModal.customPassword}
                  onChange={e => setPasswordModal(prev => prev ? { ...prev, customPassword: e.target.value } : null)}
                  className="rounded-xl h-11 font-mono"
                  type="text"
                />
                <p className="text-[11px] text-slate-400">If left blank, a random secure password will be generated and emailed to the user.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  className="flex-1 h-11 rounded-xl font-bold bg-gray-900 hover:bg-gray-800 text-white"
                  onClick={handleResetPassword}
                  disabled={passwordModal.saving}
                >
                  {passwordModal.saving ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  {passwordModal.saving ? 'Sending...' : 'Reset & Email Password'}
                </Button>
                <Button variant="outline" className="h-11 rounded-xl font-bold" onClick={() => setPasswordModal(null)}>Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            User Directory
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Manage institutional access and user profiles across all roles.</p>
        </div>

        <div className="flex w-full flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 mt-1 md:mt-0 md:w-auto">
          <div className="relative w-full sm:w-[300px]">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10"
            />

            <Input
              type="text"
              placeholder="Search by name, email or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-11 rounded-xl border border-slate-200 bg-white text-slate-900 !pl-12 pr-4 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <Button
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold h-11 px-6 rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-95"
            onClick={() => setIsAddModalOpen(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add New User
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full sm:w-auto h-11 px-5 rounded-xl font-bold border-amber-200 text-amber-700 hover:bg-amber-50"
                disabled={resendingAll}
              >
                <Mail className="w-4 h-4 mr-2" />
                {resendingAll ? 'Sending...' : 'Send Credentials'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[calc(100vw-1.5rem)] max-w-52">
              {[
                { label: 'All Students', role: 'student' },
                { label: 'All Teachers', role: 'teacher' },
                { label: 'All Parents', role: 'parent' },
                { label: 'All Admins', role: 'admin' },
                { label: 'Everyone', role: 'all' },
              ].map(({ label, role }) => (
                <DropdownMenuItem
                  key={role}
                  onClick={() => handleResendAll(role as any)}
                  className="min-h-11 cursor-pointer px-3 text-sm font-semibold"
                >
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, idx) => (
          <Card key={idx} className="bg-white border-slate-200/60 hover:border-blue-300 transition-all group shadow-sm hover:shadow-md">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2 sm:mb-4">
                <div className={`p-2 sm:p-2.5 rounded-xl bg-slate-50 group-hover:bg-blue-50 transition-colors`}>
                  <stat.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${stat.color.replace('-400', '-600')}`} />
                </div>
                <div className="hidden sm:flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                  <TrendingUp className="w-3 h-3" />
                  {stat.trend}
                </div>
              </div>
              <div>
                <p className="text-lg sm:text-2xl font-bold tracking-tight text-slate-900">{stat.value.toLocaleString()}</p>
                <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 sm:mt-1.5">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Selection Action Bar */}
      {selectedUsers.size > 0 && (
        <div className="fixed bottom-3 left-3 right-3 sm:bottom-6 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50 bg-gray-900 text-white px-4 sm:px-6 py-3 rounded-xl sm:rounded-2xl shadow-2xl flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          <span className="font-bold text-sm">{selectedUsers.size} user{selectedUsers.size > 1 ? 's' : ''} selected</span>
          <div className="w-px h-5 bg-white/20" />
          <Button
            size="sm"
            className="bg-amber-500 hover:bg-amber-400 text-white font-bold h-8 px-4 rounded-xl"
            onClick={handleSendToSelected}
            disabled={sendingSelected}
          >
            <Mail className="w-3.5 h-3.5 mr-1.5" />
            {sendingSelected ? 'Sending...' : `Send Credentials to ${selectedUsers.size}`}
          </Button>
          <Button size="sm" variant="ghost" className="text-white/60 hover:text-white h-8 px-3 rounded-xl" onClick={() => setSelectedUsers(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Filters & Tabs */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex flex-wrap items-center justify-center lg:justify-start gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm w-full lg:w-auto">
          {(['all', 'admin', 'student', 'teacher', 'parent'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab as any); setCurrentPage(1); }}
              className={`min-h-11 flex-1 sm:flex-none px-3 sm:px-5 py-2 rounded-lg text-sm font-bold capitalize transition-all ${activeTab === tab
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`}
            >
              {tab === 'all' ? 'All Roles' : `${tab}s`}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch gap-3">
          <Button variant="outline" className="w-full sm:w-auto bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 h-11 rounded-xl font-bold shadow-sm">
            <Filter className="w-4 h-4 mr-2" />
            More Filters
          </Button>
          <Button variant="outline" className="w-full sm:w-auto bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 h-11 rounded-xl font-bold shadow-sm">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Users Table */}
      <div className="w-full bg-white border border-slate-200 rounded-xl sm:rounded-2xl overflow-x-auto shadow-sm">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow className="border-slate-200 hover:bg-transparent">
              <TableHead className="w-12 py-5">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                  checked={paginatedUsers.length > 0 && selectedUsers.size === paginatedUsers.length}
                  onChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="text-slate-500 font-bold uppercase text-[10px] tracking-widest py-5">User</TableHead>
              <TableHead className="text-slate-500 font-bold uppercase text-[10px] tracking-widest py-5">Login Info</TableHead>
              <TableHead className="text-slate-500 font-bold uppercase text-[10px] tracking-widest py-5">Role</TableHead>
              <TableHead className="text-slate-500 font-bold uppercase text-[10px] tracking-widest py-5">Status</TableHead>
              <TableHead className="text-slate-500 font-bold uppercase text-[10px] tracking-widest py-5">Date Joined</TableHead>
              <TableHead className="text-slate-500 font-bold uppercase text-[10px] tracking-widest py-5 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i} className="border-slate-100 animate-pulse">
                  <TableCell colSpan={6} className="py-8 bg-white" />
                </TableRow>
              ))
            ) : paginatedUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-3 text-slate-400">
                    <Users className="w-12 h-12 opacity-20" />
                    <p className="font-bold">No users found matching your search.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedUsers.map((u) => (
                <TableRow
                  key={u.id}
                  className={`border-slate-100 hover:bg-slate-50/50 transition-colors group ${selectedUsers.has(u.id) ? 'bg-blue-50/40' : ''}`}
                >
                  <TableCell className="py-4 w-12">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                      checked={selectedUsers.has(u.id)}
                      onChange={() => toggleSelectUser(u.id)}
                      onClick={e => e.stopPropagation()}
                    />
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-11 w-11 rounded-xl border border-slate-200 ring-2 ring-transparent group-hover:ring-blue-500/20 transition-all">
                        <AvatarImage src={u.avatar_url} />
                        <AvatarFallback className="bg-slate-100 text-slate-600 font-bold">
                          {u.first_name[0]}{u.last_name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors">
                          {u.first_name} {u.last_name}
                        </p>
                        <p className="text-[11px] font-medium text-slate-400 mt-0.5 uppercase tracking-tighter">
                          ID: {u.id.split('-')[0]}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors cursor-pointer">
                        <Mail className="w-3.5 h-3.5 text-blue-500/70" />
                        {u.email}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 bg-slate-50 w-fit px-2 py-0.5 rounded-md group/pass cursor-help border border-slate-100">
                        <Lock className="w-2.5 h-2.5" />
                        <span className="group-hover/pass:hidden italic opacity-50">********</span>
                        <span className="hidden group-hover/pass:inline text-blue-600">Auth Protected</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`
                      font-bold text-[10px] uppercase rounded-lg px-2.5 py-1
                      ${u.role === 'student' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                        u.role === 'teacher' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                          u.role === 'admin' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                            'bg-purple-50 text-purple-600 border-purple-100'}
                    `} variant="outline">
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <span className={`text-[11px] font-bold ${u.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {u.is_active ? 'ACTIVE' : 'SUSPENDED'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-xs font-bold text-slate-500">
                      {u.created_at && !isNaN(new Date(u.created_at).getTime()) 
                        ? new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'N/A'}
                    </p>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {u.role !== 'admin' && (
                        <Link to={`/${u.role}s/${u.student_id || u.teacher_id || u.parent_id}`}>
                          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-blue-50 hover:text-blue-600 text-slate-400 transition-all">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                      )}
                      {/* Send Credentials */}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Send login credentials to email"
                        disabled={resendingId === u.id}
                        onClick={() => handleResendCredentials(u.id, `${u.first_name} ${u.last_name}`)}
                        className="h-9 w-9 rounded-xl hover:bg-amber-50 hover:text-amber-600 text-slate-400 transition-all"
                      >
                        {resendingId === u.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Mail className="w-4 h-4" />
                        )}
                      </Button>
                      {/* Reset / Set Password */}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Set or reset password"
                        onClick={() => setPasswordModal({ user: u, customPassword: '', saving: false })}
                        className="h-9 w-9 rounded-xl hover:bg-violet-50 hover:text-violet-600 text-slate-400 transition-all"
                      >
                        <KeyRound className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleStatus(u.id, u.is_active)}
                        className={`h-9 w-9 rounded-xl transition-all ${u.is_active ? 'hover:bg-amber-50 hover:text-amber-600 text-slate-400' : 'bg-emerald-50 text-emerald-600'}`}
                      >
                        {u.is_active ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteUser(u.id)}
                        className="h-9 w-9 rounded-xl hover:bg-rose-50 hover:text-rose-600 text-slate-300 hover:text-rose-600 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Footer / Pagination */}
        <div className="bg-slate-50/80 border-t border-slate-200 p-4 flex items-center justify-between">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Showing {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredUsers.length)} of {filteredUsers.length} Users
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => prev - 1)}
              className="bg-white border-slate-200 text-slate-400 hover:text-slate-900 h-9 w-9 p-0 rounded-xl"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-1 px-2">
              <span className="text-sm font-bold text-slate-900">{currentPage}</span>
              <span className="text-sm font-bold text-slate-300">/</span>
              <span className="text-sm font-bold text-slate-400">{Math.ceil(filteredUsers.length / itemsPerPage)}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= Math.ceil(filteredUsers.length / itemsPerPage)}
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="bg-white border-slate-200 text-slate-400 hover:text-slate-900 h-9 w-9 p-0 rounded-xl"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Info Alert */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-4">
        <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-blue-900">Institutional Access Protocol</p>
          <p className="text-xs text-slate-500 mt-1">
            Suspended users will lose all access to their respective portals immediately. staff member credentials are automatically generated and can be audited from the detailed profile view.
          </p>
        </div>
      </div>

      {/* Role Selector for Add User */}
      {isAddModalOpen && !addUserRole && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="text-lg font-bold">Select Role</h3>
            {(['student', 'teacher', 'parent', 'admin'] as const).map(r => (
              <Button key={r} variant="outline" className="w-full capitalize" onClick={() => setAddUserRole(r)}>{r}</Button>
            ))}
            <Button variant="ghost" className="w-full" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Add User Role Picker + Modal */}
      {isAddModalOpen && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2 bg-white border border-slate-200 rounded-xl p-2 w-fit">
            {(['student', 'teacher', 'parent', 'admin'] as const).map(r => (
              <button
                key={r}
                onClick={() => setAddUserRole(r)}
                className={`px-4 py-1.5 rounded-lg text-sm font-bold capitalize transition-all ${addUserRole === r ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'
                  }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      <AddUserModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        role={addUserRole}
        onSuccess={fetchUsers}
      />
    </div>
  );
}
