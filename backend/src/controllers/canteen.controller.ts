import { Request, Response } from 'express';
import { supabaseAdmin as supabase } from '../config/supabase';

export const getCanteenData = async (req: Request, res: Response) => {
  const school_id = (req as any).user?.school_id;

  if (!school_id) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data: menuData } = await supabase
      .from('canteen_menu')
      .select('*')
      .eq('school_id', school_id);

    // Get orders from the last 30 days for trend
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: ordersData } = await supabase
      .from('canteen_orders')
      .select('*, canteen_order_items(*, canteen_menu(name))')
      .eq('school_id', school_id)
      .gte('created_at', thirtyDaysAgo.toISOString());

    const menu = (menuData && menuData.length > 0) ? menuData : [];

    // Calculate Stats
    const today = new Date().toISOString().split('T')[0];
    const todayOrders = ordersData?.filter(o => o.created_at.startsWith(today)) || [];
    const todayRevenue = todayOrders.reduce((acc, order) => acc + Number(order.total_amount), 0);
    
    const monthRevenue = ordersData?.reduce((acc, order) => acc + Number(order.total_amount), 0) || 0;

    // Find Top Item
    const itemSales: Record<string, number> = {};
    ordersData?.forEach(order => {
      order.canteen_order_items?.forEach((item: any) => {
        const name = item.canteen_menu?.name;
        if (name) {
          itemSales[name] = (itemSales[name] || 0) + item.quantity;
        }
      });
    });

    const topItem = Object.entries(itemSales).sort((a, b) => b[1] - a[1])[0]?.[0] || 'No sales yet';

    // Sales Trend (Last 7 days)
    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dateStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const daySales = ordersData?.filter(o => o.created_at.startsWith(dateStr))
        .reduce((acc, o) => acc + Number(o.total_amount), 0) || 0;
      return { day: dayName, sales: daySales };
    });

    res.json({
      menu,
      stats: {
        todayRevenue,
        ordersToday: todayOrders.length,
        topItem,
        monthRevenue,
      },
      salesTrend: last7Days,
    });
  } catch (err) {
    console.error('Canteen Data Error:', err);
    res.status(500).json({ error: 'Failed to load canteen data' });
  }
};

export const createOrder = async (req: Request, res: Response) => {
  const { items, total_amount } = req.body;
  const user_id = (req as any).user?.id;
  const school_id = (req as any).user?.school_id;

  if (!user_id || !school_id) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // 1. Create Order
    const { data: order, error: orderError } = await supabase
      .from('canteen_orders')
      .insert({
        school_id,
        user_id,
        total_amount,
        status: 'completed'
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // 2. Create Order Items
    const orderItems = items.map((item: any) => ({
      order_id: order.id,
      menu_item_id: item.id,
      quantity: item.quantity,
      price_at_time: item.price
    }));

    const { error: itemsError } = await supabase
      .from('canteen_order_items')
      .insert(orderItems);

    if (itemsError) throw itemsError;

    res.json({ success: true, orderId: order.id });
  } catch (err) {
    console.error('Create Order Error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
};
