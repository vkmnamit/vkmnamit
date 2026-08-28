import { useState, useEffect } from 'react';
import { api } from '../../../../lib/api';
import { Skeleton } from '../../../components/ui/skeleton';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Search, Plus, Trash2, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { InventoryModal } from '../../../components/modals/InventoryModal';

export function InventoryItems() {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  useEffect(() => { fetchInventory(); }, []);

  const fetchInventory = async () => {
    try {
      const res = await api.getInventory();
      setItems(Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : []);
    } catch (err) {
      toast.error('Failed to load inventory data');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteInventoryItem(id);
      toast.success('Item deleted');
      fetchInventory();
    } catch (err) {
      toast.error('Failed to delete item');
    }
  };

  const filtered = items.filter((item: any) =>
    item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <Skeleton className="h-[500px] w-full rounded-2xl" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10"
          />

          <input
            type="search"
            placeholder="Search items or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-11 rounded-xl border border-gray-200 bg-white pl-12 pr-4 text-sm shadow-sm transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          />
        </div>

        <Button
          onClick={() => {
            setSelectedItem(null);
            setIsModalOpen(true);
          }}
          className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700 text-white gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </Button>
      </div>

      <InventoryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        item={selectedItem}
        onSuccess={() => {
          setIsModalOpen(false);
          fetchInventory();
        }}
      />

      <div className="border rounded-xl overflow-x-auto bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50">
              <TableHead>Item Details</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium text-gray-900">{item.name}</div>
                  <div className="text-sm text-gray-500">SKU: {item.sku || '-'}</div>
                </TableCell>
                <TableCell>
                  <div className="font-medium text-gray-900">{item.inventory_categories?.name || item.category || 'Uncategorized'}</div>
                  <div className="text-xs text-gray-500 mt-1">{item.class?.name ? `Class: ${item.class.name}` : 'General / All Classes'}</div>
                </TableCell>
                <TableCell>
                  <span className="font-medium">{item.quantity}</span> <span className="text-gray-500 text-sm">{item.unit || 'pcs'}</span>
                </TableCell>
                <TableCell>
                  {item.selling_price ? `₹${item.selling_price}` : '-'}
                </TableCell>
                <TableCell>
                  <Badge variant={item.status === 'good' ? 'success' : item.status === 'low' ? 'warning' : 'destructive'}>
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="ghost" size="icon" className="text-blue-600 hover:bg-blue-50" onClick={() => { setSelectedItem(item); setIsModalOpen(true); }}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-red-600 hover:bg-red-50" onClick={() => handleDelete(item.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">No items found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
