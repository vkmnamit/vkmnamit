import { useState, useEffect } from 'react';
import { api } from '../../../../lib/api';
import { Skeleton } from '../../../components/ui/skeleton';
import { Badge } from '../../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { format } from 'date-fns';
import { toast } from 'sonner';

export function InventoryTransactions() {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => { fetchTransactions(); }, []);

  const fetchTransactions = async () => {
    try {
      const res = await api.getInventoryTransactions();
      setTransactions(res || []);
    } catch (err) {
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Skeleton className="h-[500px] w-full rounded-2xl" />;

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'purchase': case 'stock_added': case 'return': return 'success';
      case 'issue': return 'default';
      case 'damage': case 'lost': case 'dispose': return 'destructive';
      case 'repair': case 'adjustment': return 'warning';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Stock Movements Log</h2>
      </div>

      <div className="border rounded-xl overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50">
              <TableHead>Date</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Stock Change</TableHead>
              <TableHead>Remarks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                  {format(new Date(tx.created_at), 'dd MMM yyyy, HH:mm')}
                </TableCell>
                <TableCell>
                  <div className="font-medium text-gray-900">{tx.school_inventory?.name}</div>
                  <div className="text-xs text-gray-500">SKU: {tx.school_inventory?.sku || '-'}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={getTypeColor(tx.transaction_type)} className="capitalize">
                    {tx.transaction_type.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{tx.quantity}</TableCell>
                <TableCell className="text-sm text-gray-500">
                  {tx.previous_stock} → <span className="font-medium text-gray-900">{tx.updated_stock}</span>
                </TableCell>
                <TableCell className="text-sm text-gray-500 max-w-[200px] truncate" title={tx.remarks}>
                  {tx.remarks || '-'}
                </TableCell>
              </TableRow>
            ))}
            {transactions.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">No transactions found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
