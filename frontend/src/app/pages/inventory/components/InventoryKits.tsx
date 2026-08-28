import { useState, useEffect } from 'react';
import { api } from '../../../../lib/api';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Plus, Trash2, Package } from 'lucide-react';
import { toast } from 'sonner';

export function InventoryKits() {
  const [kits, setKits] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<{item_id: string, quantity: number}[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [kitsRes, invRes] = await Promise.all([
        api.getInventoryKits(),
        api.getInventory()
      ]);
      setKits(kitsRes || []);
      setInventory(Array.isArray(invRes?.items) ? invRes.items : Array.isArray(invRes) ? invRes : []);
    } catch (err) {
      toast.error('Failed to load kits');
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = (itemId: string) => {
    if (!itemId || items.some(i => i.item_id === itemId)) return;
    setItems([...items, { item_id: itemId, quantity: 1 }]);
  };

  const handleCreateKit = async () => {
    if (!name || items.length === 0) {
      toast.error('Please provide a name and at least one item');
      return;
    }
    setIsSaving(true);
    try {
      await api.createInventoryKit({ name, description, items });
      toast.success('Kit template created successfully');
      setName('');
      setDescription('');
      setItems([]);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create kit');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left: Create Kit */}
      <div className="lg:w-1/3 bg-white border rounded-xl shadow-sm p-6 space-y-4">
        <h3 className="text-lg font-bold">Create Kit Template</h3>
        <p className="text-sm text-gray-500">Bundle items together for faster distribution.</p>
        
        <div>
          <label className="block text-sm font-medium mb-1">Kit Name</label>
          <Input placeholder="e.g. Nursery Kit" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Description (Optional)</label>
          <Input placeholder="Basic books and uniform..." value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        
        <div className="pt-4 border-t">
          <label className="block text-sm font-medium mb-2">Add Items to Kit</label>
          <Select onValueChange={handleAddItem} value="">
             <SelectTrigger><SelectValue placeholder="Select item to add..." /></SelectTrigger>
             <SelectContent>
               {inventory.map(i => (
                 <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
               ))}
             </SelectContent>
          </Select>
        </div>

        {items.length > 0 && (
          <div className="space-y-2 mt-2">
            {items.map(item => {
              const invItem = inventory.find(i => i.id === item.item_id);
              return (
                <div key={item.item_id} className="flex items-center justify-between bg-gray-50 p-2 rounded text-sm border">
                  <span>{invItem?.name}</span>
                  <div className="flex items-center gap-2">
                    <Input 
                      type="number" min={1} value={item.quantity} 
                      onChange={e => setItems(items.map(i => i.item_id === item.item_id ? { ...i, quantity: parseInt(e.target.value)||1 } : i))}
                      className="w-16 h-8 text-center"
                    />
                    <Button variant="ghost" size="icon" onClick={() => setItems(items.filter(i => i.item_id !== item.item_id))} className="h-8 w-8 text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Button className="w-full mt-4 bg-orange-600 hover:bg-orange-700 text-white" onClick={handleCreateKit} disabled={isSaving || !name || items.length === 0}>
          {isSaving ? 'Creating...' : 'Save Kit Template'}
        </Button>
      </div>

      {/* Right: Existing Kits */}
      <div className="lg:w-2/3 bg-white border rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-bold mb-4">Saved Kits</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {kits.map(kit => (
            <div key={kit.id} className="border rounded-xl p-4 bg-gray-50">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="font-bold text-gray-900">{kit.name}</h4>
                  <p className="text-xs text-gray-500">{kit.description}</p>
                </div>
                <div className="bg-orange-100 text-orange-700 p-2 rounded-lg">
                  <Package className="w-5 h-5" />
                </div>
              </div>
              <div className="text-sm font-medium text-gray-700 mb-1 border-t pt-2 mt-2">Included Items:</div>
              <ul className="text-xs text-gray-600 space-y-1">
                {kit.inventory_kit_items?.map((ki: any) => (
                  <li key={ki.id}>• {ki.quantity}x {ki.school_inventory?.name}</li>
                ))}
              </ul>
            </div>
          ))}
          {kits.length === 0 && (
            <div className="col-span-2 p-8 text-center text-gray-500 border border-dashed rounded-xl">
              No kit templates created yet. Create your first bundle on the left.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
