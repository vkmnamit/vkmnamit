import { useState, useEffect } from 'react';
import { api } from '../../../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Skeleton } from '../../../components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, Tag, Pencil, ToggleLeft, ToggleRight, Search, IndianRupee, RefreshCw } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

const defaultForm = { name: '', description: '', isRecurring: false, defaultAmount: '', taxPercent: '' };

export function FeeCategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...defaultForm });
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  useEffect(() => { fetchCategories(); }, []);

  const fetchCategories = async () => {
    try { setLoading(true); const d = await api.getFeeCategories(); setCategories(d); }
    catch { toast.error('Failed to load categories'); }
    finally { setLoading(false); }
  };

  const openCreate = () => { setEditing(null); setForm({ ...defaultForm }); setIsDialogOpen(true); };
  const openEdit = (cat: any) => {
    setEditing(cat);
    setForm({ name: cat.name, description: cat.description || '', isRecurring: cat.is_recurring, defaultAmount: cat.default_amount || '', taxPercent: cat.tax_percent || '' });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), description: form.description, isRecurring: form.isRecurring, defaultAmount: parseFloat(form.defaultAmount as any) || 0, taxPercent: parseFloat(form.taxPercent as any) || 0 };
      if (editing) await api.updateFeeCategory(editing.id, payload);
      else await api.createFeeCategory(payload);
      toast.success(editing ? 'Category updated' : 'Category created');
      setIsDialogOpen(false);
      fetchCategories();
    } catch (e: any) { toast.error(e?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleToggle = async (cat: any) => {
    try { await api.updateFeeCategory(cat.id, { isActive: !cat.is_active }); toast.success(cat.is_active ? 'Deactivated' : 'Activated'); fetchCategories(); }
    catch { toast.error('Failed to update'); }
  };

  const filtered = categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  const categoryTemplates = ['Admission Fee', 'Monthly Tuition', 'Annual Fee', 'Exam Fee', 'Library Fee', 'Computer Fee', 'Laboratory Fee', 'Sports Fee', 'Transport Fee', 'Uniform Fee', 'Books Fee', 'ID Card Fee', 'Hostel Fee', 'Smart Class Fee', 'Late Fine', 'Activity Fee', 'Miscellaneous'];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-full overflow-x-hidden pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Fee Categories</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Manage fee types and categories for your school</p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold text-sm shadow-lg shadow-blue-600/20">
            <Plus className="w-4 h-4 mr-2" /> Add Category
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total', value: categories.length, color: 'text-gray-900' },
          { label: 'Active', value: categories.filter(c => c.is_active).length, color: 'text-emerald-600' },
          { label: 'Recurring', value: categories.filter(c => c.is_recurring).length, color: 'text-blue-600' },
        ].map((s, i) => (
          <Card key={i} className="border-none shadow-sm bg-white">
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input placeholder="Search categories..." className="pl-12 h-10 rounded-xl" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Category Templates Hint */}
      {isAdmin && categories.length === 0 && !loading && (
        <Card className="border-dashed border-2 border-blue-200 bg-blue-50/30 shadow-none">
          <CardContent className="p-6">
            <p className="text-sm font-bold text-blue-700 mb-3">💡 Quick start — click to add a category:</p>
            <div className="flex flex-wrap gap-2">
              {categoryTemplates.map(t => (
                <button key={t} onClick={() => { setForm({ ...defaultForm, name: t }); setEditing(null); setIsDialogOpen(true); }}
                  className="px-3 py-1.5 bg-white border border-blue-200 rounded-full text-xs font-bold text-blue-700 hover:bg-blue-100 transition-all">
                  + {t}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Category</th>
                  <th className="text-left px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest hidden sm:table-cell">Type</th>
                  <th className="text-right px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Default Amt</th>
                  <th className="text-center px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest hidden md:table-cell">Tax</th>
                  <th className="text-center px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Status</th>
                  {isAdmin && <th className="px-4 py-4" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? Array(5).fill(0).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-6 py-3"><Skeleton className="h-8 w-full rounded-lg" /></td></tr>
                )) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-16 text-center text-gray-400 font-bold">No categories found</td></tr>
                ) : filtered.map(cat => (
                  <tr key={cat.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                          <Tag className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">{cat.name}</p>
                          {cat.description && <p className="text-xs text-gray-400 font-medium">{cat.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 hidden sm:table-cell">
                      <Badge className={`text-[9px] font-black uppercase ${cat.is_recurring ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'} border-none`}>
                        {cat.is_recurring ? 'Recurring' : 'One-Time'}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <p className="font-black text-gray-900">₹{Number(cat.default_amount || 0).toLocaleString('en-IN')}</p>
                    </td>
                    <td className="px-4 py-4 text-center hidden md:table-cell">
                      <p className="text-gray-600 font-bold text-xs">{cat.tax_percent || 0}%</p>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Badge className={`text-[9px] font-black uppercase border-none ${cat.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {cat.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => openEdit(cat)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-all">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleToggle(cat)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-all">
                            {cat.is_active ? <ToggleRight className="w-4 h-4 text-emerald-600" /> : <ToggleLeft className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md bg-white rounded-3xl border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-black text-xl">{editing ? 'Edit Category' : 'New Fee Category'}</DialogTitle>
            <DialogDescription className="text-gray-500 text-sm">{editing ? 'Update category details' : 'Create a new fee category for your school'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Category Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Monthly Tuition" className="h-11 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Description</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" className="h-11 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Default Amount (₹)</Label>
                <Input type="number" value={form.defaultAmount} onChange={e => setForm(f => ({ ...f, defaultAmount: e.target.value }))} placeholder="0" className="h-11 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Tax %</Label>
                <Input type="number" value={form.taxPercent} onChange={e => setForm(f => ({ ...f, taxPercent: e.target.value }))} placeholder="0" className="h-11 rounded-xl" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Frequency</Label>
              <Select value={form.isRecurring ? 'recurring' : 'onetime'} onValueChange={v => setForm(f => ({ ...f, isRecurring: v === 'recurring' }))}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="onetime">One-Time</SelectItem>
                  <SelectItem value="recurring">Recurring (Monthly)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 h-11 rounded-xl font-bold" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button className="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold" onClick={handleSave} loading={saving}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
