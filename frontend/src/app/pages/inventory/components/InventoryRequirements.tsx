import { useState, useEffect } from 'react';
import { api } from '../../../../lib/api';
import { Skeleton } from '../../../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export function InventoryRequirements() {
  const [classes, setClasses] = useState<any[]>([]);
  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newItem, setNewItem] = useState({ item_id: '', required_quantity: 1, is_mandatory: true });
  
  const [requirements, setRequirements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getClasses(),
      api.getAcademicYears(),
      api.getInventory()
    ]).then(([classesRes, yearsRes, invRes]) => {
      setClasses(classesRes.classes || classesRes || []);
      setAcademicYears(yearsRes || []);
      setInventoryItems(Array.isArray(invRes?.items) ? invRes.items : Array.isArray(invRes) ? invRes : []);
      if (classesRes?.[0]?.id) setSelectedClass(classesRes[0].id);
      if (yearsRes?.[0]?.id) setSelectedYear(yearsRes[0].id);
      setLoading(false);
    }).catch(() => {
      toast.error('Failed to load initial data');
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (selectedClass && selectedYear) {
      fetchRequirements();
    }
  }, [selectedClass, selectedYear]);

  const fetchRequirements = async () => {
    try {
      const res = await api.getClassInventoryRequirements({ class_id: selectedClass, academic_year_id: selectedYear });
      setRequirements(res || []);
    } catch (err) {
      toast.error('Failed to load requirements');
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await api.removeClassInventoryRequirement(id);
      toast.success('Requirement removed');
      fetchRequirements();
    } catch (err) {
      toast.error('Failed to remove');
    }
  };

  const handleAddRequirement = async () => {
    if (!newItem.item_id || newItem.required_quantity < 1) {
      toast.error('Please select an item and enter a valid quantity');
      return;
    }
    try {
      await api.setClassInventoryRequirement({
        class_id: selectedClass,
        academic_year_id: selectedYear,
        item_id: newItem.item_id,
        required_quantity: newItem.required_quantity,
        is_mandatory: newItem.is_mandatory
      });
      toast.success('Requirement added');
      setIsModalOpen(false);
      setNewItem({ item_id: '', required_quantity: 1, is_mandatory: true });
      fetchRequirements();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to add requirement');
    }
  };

  if (loading) return <Skeleton className="h-[500px] w-full rounded-2xl" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-64">
          <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger><SelectValue placeholder="Select Year" /></SelectTrigger>
            <SelectContent>
              {academicYears.map(y => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-64">
          <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
          <Select value={selectedClass} onValueChange={setSelectedClass}>
            <SelectTrigger><SelectValue placeholder="Select Class" /></SelectTrigger>
            <SelectContent>
              {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-xl overflow-hidden bg-white">
        <div className="flex justify-between items-center p-4 border-b bg-gray-50/50">
          <h3 className="font-semibold text-gray-900">Required Items Kit</h3>
          <Button onClick={() => setIsModalOpen(true)} variant="outline" size="sm">Add Required Item</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item Name</TableHead>
              <TableHead>Required Quantity</TableHead>
              <TableHead>Mandatory</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requirements.map(req => (
              <TableRow key={req.id}>
                <TableCell className="font-medium">{req.school_inventory?.name}</TableCell>
                <TableCell>{req.required_quantity}</TableCell>
                <TableCell>{req.is_mandatory ? 'Yes' : 'No'}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleRemove(req.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {requirements.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                  No required items configured for this class.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Class Requirement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Item</label>
              <Select value={newItem.item_id} onValueChange={(val) => setNewItem({ ...newItem, item_id: val })}>
                <SelectTrigger><SelectValue placeholder="Select an inventory item" /></SelectTrigger>
                <SelectContent>
                  {inventoryItems.map(item => (
                    <SelectItem key={item.id} value={item.id}>{item.name} ({item.sku})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity Required</label>
              <Input type="number" min={1} value={newItem.required_quantity} onChange={(e) => setNewItem({ ...newItem, required_quantity: parseInt(e.target.value) || 1 })} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 mt-2">
              <input 
                type="checkbox" 
                checked={newItem.is_mandatory} 
                onChange={(e) => setNewItem({ ...newItem, is_mandatory: e.target.checked })} 
                className="w-4 h-4 text-orange-600 rounded border-gray-300"
              />
              Mandatory for all students
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAddRequirement} className="bg-orange-600 hover:bg-orange-700 text-white">Add Requirement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
