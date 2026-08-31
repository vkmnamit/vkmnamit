import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { api } from '../../../lib/api';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface InventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  item?: any;
}

export function InventoryModal({ isOpen, onClose, onSuccess, item }: InventoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    category: 'Stationery',
    quantity: 0,
    min_stock: 10,
    unit_price: 0,
    unit: 'pcs',
    description: '',
    class_id: 'general'
  });

  useEffect(() => {
    if (isOpen) {
      api.getClasses().then(data => {
        if (data && Array.isArray(data)) setClasses(data);
      }).catch(err => console.error("Failed to fetch classes:", err));
    }
  }, [isOpen]);

  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name || '',
        category: item.category || 'Stationery',
        quantity: item.quantity !== undefined ? Number(item.quantity) : 0,
        min_stock: item.min_stock !== undefined ? Number(item.min_stock) : 10,
        unit_price: item.unit_price !== undefined ? Number(item.unit_price) : 0,
        unit: item.unit || 'pcs',
        description: item.description || '',
        class_id: item.class_id || 'general'
      });
    } else {
      setFormData({
        name: '',
        category: 'Stationery',
        quantity: 0,
        min_stock: 10,
        unit_price: 0,
        unit: 'pcs',
        description: '',
        class_id: 'general'
      });
    }
  }, [item, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.upsertInventoryItem({
        ...(item?.id ? { id: item.id } : {}),
        ...formData,
        class_id: formData.class_id === 'general' ? null : formData.class_id
      });
      toast.success(item ? 'Item updated successfully' : 'Item added successfully');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{item ? 'Edit Inventory Item' : 'Add New Item'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="name" className="text-xs font-bold uppercase text-gray-500">Item Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. A4 Paper, Basketball"
                required
                className="rounded-xl h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-500">Category</Label>
              <Select 
                value={formData.category} 
                onValueChange={(v) => setFormData({ ...formData, category: v })}
              >
                <SelectTrigger className="rounded-xl h-11">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  {['Library', 'Stationery', 'Arts', 'IT', 'Sports', 'Office', 'Other'].map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-500">Class Assignment</Label>
              <Select 
                value={formData.class_id} 
                onValueChange={(v) => setFormData({ ...formData, class_id: v })}
              >
                <SelectTrigger className="rounded-xl h-11">
                  <SelectValue placeholder="Select Class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">All Classes (General)</SelectItem>
                  {classes.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit" className="text-xs font-bold uppercase text-gray-500">Unit</Label>
              <Input
                id="unit"
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                placeholder="e.g. pcs, box, packet"
                className="rounded-xl h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity" className="text-xs font-bold uppercase text-gray-500">Current Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min="0"
                value={formData.quantity.toString().replace(/^0+(?=\d)/, '')}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value === '' ? 0 : parseInt(e.target.value, 10) })}
                required
                className="rounded-xl h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="min_stock" className="text-xs font-bold uppercase text-gray-500">Min. Stock Alert</Label>
              <Input
                id="min_stock"
                type="number"
                min="0"
                value={formData.min_stock.toString().replace(/^0+(?=\d)/, '')}
                onChange={(e) => setFormData({ ...formData, min_stock: e.target.value === '' ? 0 : parseInt(e.target.value, 10) })}
                required
                className="rounded-xl h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit_price" className="text-xs font-bold uppercase text-gray-500">Unit Price (₹)</Label>
              <Input
                id="unit_price"
                type="number"
                min="0"
                step="0.01"
                value={formData.unit_price.toString().replace(/^0+(?=\d)/, '')}
                onChange={(e) => setFormData({ ...formData, unit_price: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                className="rounded-xl h-11"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="description" className="text-xs font-bold uppercase text-gray-500">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional details..."
                className="rounded-xl h-11"
              />
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button type="button" variant="ghost" onClick={onClose} className="rounded-xl h-11">Cancel</Button>
            <Button type="submit" loading={loading} className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl h-11 px-8 font-bold">
              {item ? 'Update Item' : 'Add Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
