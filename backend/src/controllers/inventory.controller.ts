import { Request, Response } from 'express';
import { supabaseAdmin as supabase } from '../config/supabase';
import { notificationService } from '../services/notification.service';

// ============================================
// CATEGORIES
// ============================================
export const getCategories = async (req: Request, res: Response) => {
  const { school_id } = (req as any).user;
  const { data, error } = await supabase.from('inventory_categories').select('*').eq('school_id', school_id).order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

export const createCategory = async (req: Request, res: Response) => {
  const { school_id } = (req as any).user;
  const { name, description } = req.body;
  const { data, error } = await supabase.from('inventory_categories').insert({ school_id, name, description }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

// ============================================
// ITEMS / INVENTORY
// ============================================
export const getInventory = async (req: Request, res: Response) => {
  const { school_id } = (req as any).user;
  const { category_id, status, search } = req.query;

  let query = supabase.from('school_inventory')
    .select('*, inventory_categories(name), class:classes(name)')
    .eq('school_id', school_id);

  if (category_id && category_id !== 'all') query = query.eq('category_id', category_id);
  if (status && status !== 'all') query = query.eq('status', status);
  if (search) query = query.ilike('name', `%${search}%`);

  const { data, error } = await query.order('name');
  if (error) return res.status(500).json({ error: error.message });

  const total = data.length;
  const good = data.filter((item: any) => item.status === 'good').length;
  const lowStock = data.filter((item: any) => item.status === 'low' || item.quantity <= (item.min_stock || 10)).length;
  const outOfStock = data.filter((item: any) => item.quantity === 0).length;

  res.json({
    items: data,
    stats: { total, good, lowStock, outOfStock }
  });
};

export const upsertInventoryItem = async (req: Request, res: Response) => {
  const { school_id, id: user_id } = (req as any).user;
  const item = req.body;
  
  const isNew = !item.id;
  const previousQuantity = item.id ? 0 : 0; // In a real app, fetch previous stock before upserting
  
  const { data, error } = await supabase
    .from('school_inventory')
    .upsert({
      ...item,
      school_id,
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  if (isNew && item.quantity > 0) {
    // Log initial stock
    await supabase.from('inventory_transactions').insert({
      school_id, item_id: data.id, transaction_type: 'stock_added', quantity: item.quantity,
      previous_stock: 0, updated_stock: item.quantity, performed_by: user_id, remarks: 'Initial Stock'
    });
  }

  res.json(data);
};

export const deleteInventoryItem = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { error } = await supabase.from('school_inventory').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
};

// ============================================
// TRANSACTIONS / AUDIT
// ============================================
export const getTransactions = async (req: Request, res: Response) => {
  const { school_id } = (req as any).user;
  const { data, error } = await supabase
    .from('inventory_transactions')
    .select('*, school_inventory(name, sku), users(first_name, last_name), students(users(first_name, last_name)), teachers(users(first_name, last_name))')
    .eq('school_id', school_id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

export const adjustStock = async (req: Request, res: Response) => {
  const { school_id, id: user_id } = (req as any).user;
  const { itemId, transactionType, quantity, remarks } = req.body; // transactionType: purchase, repair, damage, lost, dispose, adjustment

  const { data: item } = await supabase.from('school_inventory').select('quantity, min_stock').eq('id', itemId).single();
  if (!item) return res.status(404).json({ error: 'Item not found' });

  let qtyChange = 0;
  if (['purchase', 'stock_added', 'return'].includes(transactionType)) qtyChange = quantity;
  else if (['repair', 'damage', 'lost', 'dispose', 'adjustment'].includes(transactionType)) qtyChange = -Math.abs(quantity);

  const updatedStock = item.quantity + qtyChange;
  
  const { error } = await supabase.from('school_inventory').update({
    quantity: updatedStock,
    status: updatedStock <= item.min_stock ? 'low' : 'good'
  }).eq('id', itemId);

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('inventory_transactions').insert({
    school_id, item_id: itemId, transaction_type: transactionType, quantity: Math.abs(quantity),
    previous_stock: item.quantity, updated_stock: updatedStock, performed_by: user_id, remarks
  });

  res.json({ success: true, updatedStock });
};

// ============================================
// DISTRIBUTION & REQUIREMENTS
// ============================================
export const getClassRequirements = async (req: Request, res: Response) => {
  const { school_id } = (req as any).user;
  const { class_id, academic_year_id } = req.query;

  const { data, error } = await supabase
    .from('class_inventory_requirements')
    .select('*, school_inventory(*)')
    .eq('school_id', school_id)
    .eq('class_id', class_id)
    .eq('academic_year_id', academic_year_id);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

export const setClassRequirement = async (req: Request, res: Response) => {
  const { school_id } = (req as any).user;
  const payload = req.body;
  const { data, error } = await supabase.from('class_inventory_requirements').upsert({ ...payload, school_id }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

export const removeClassRequirement = async (req: Request, res: Response) => {
  const { id } = req.params;
  await supabase.from('class_inventory_requirements').delete().eq('id', id);
  res.json({ success: true });
};

export const getStudentInventory = async (req: Request, res: Response) => {
  const { student_id } = req.params;
  // Get what they have
  const { data: distribution, error } = await supabase
    .from('student_inventory_distribution')
    .select('*, school_inventory(*, inventory_categories(name))')
    .eq('student_id', student_id);

  if (error) return res.status(500).json({ error: error.message });

  // Compute what they need based on class
  const { data: student } = await supabase.from('students').select('section:sections(class_id)').eq('id', student_id).single();
  let requiredItems: any[] = [];
  const studentData = student as any;
  if (studentData?.section?.class_id) {
     const { data: reqs } = await supabase.from('class_inventory_requirements').select('*, school_inventory(*, inventory_categories(name))').eq('class_id', studentData.section.class_id);
     requiredItems = reqs || [];
  }

  res.json({ distribution, requiredItems });
};

export const issueStudentItem = async (req: Request, res: Response) => {
  const { school_id, id: user_id } = (req as any).user;
  const { student_id } = req.params;
  const { item_id, quantity, academic_year_id, remarks, allow_duplicate, payment_rule = 'pending' } = req.body;

  if (!allow_duplicate) {
    const { data: existing } = await supabase.from('student_inventory_distribution')
      .select('id')
      .eq('student_id', student_id)
      .eq('item_id', item_id)
      .limit(1);
    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'This item is already assigned to the student. Check "Allow Duplicate" to proceed.' });
    }
  }

  const { data: item } = await supabase.from('school_inventory').select('quantity, min_stock, name, selling_price, unit_price').eq('id', item_id).single();
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const price = item.selling_price || item.unit_price || 0;
  
  // Backward compatibility fallback if payment_rule isn't passed (e.g. older frontend)
  const actualPaymentRule = req.body.payment_rule ? payment_rule : (price > 0 ? 'pending' : 'free');
  
  const isPending = actualPaymentRule === 'pending_payment';

  if (!isPending && item.quantity < quantity) {
    return res.status(400).json({ error: 'Insufficient stock' });
  }

  let feePaymentId = null;
  if (price > 0 && actualPaymentRule !== 'free') {
    const totalFee = price * quantity;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 10);
    const { data: fee } = await supabase.from('fee_payments').insert({
      school_id, student_id, amount: totalFee, paid_amount: actualPaymentRule === 'paid' ? totalFee : 0, status: actualPaymentRule === 'paid' ? 'paid' : 'pending',
      title: `Inventory Issue: ${item.name}`,
      remarks: `Issued ${quantity}x ${item.name} (${remarks || 'Inventory System'})`,
      due_date: dueDate.toISOString()
    }).select('id').single();
    if (fee) feePaymentId = fee.id;
  }

  const status = isPending ? 'pending' : 'issued';

  // Only update stock if immediately issued
  if (status === 'issued') {
    const updatedStock = item.quantity - quantity;
    await supabase.from('school_inventory').update({ quantity: updatedStock, status: updatedStock <= item.min_stock ? 'low' : 'good' }).eq('id', item_id);
    await supabase.from('inventory_transactions').insert({
      school_id, item_id, transaction_type: 'issue', quantity, previous_stock: item.quantity, updated_stock: updatedStock,
      issued_to_student_id: student_id, performed_by: user_id, remarks
    });
  }

  const { data, error } = await supabase.from('student_inventory_distribution').insert({
    school_id, student_id, item_id, academic_year_id: academic_year_id || null, quantity, status, issue_date: new Date().toISOString(), remarks,
    fee_payment_id: feePaymentId
  }).select('*, school_inventory(*)').single();

  if (error) return res.status(500).json({ error: error.message });

  // 🔔 Notify student and parent
  try {
    const { data: studentUser } = await supabase
      .from('students')
      .select('user_id, parents(user_id)')
      .eq('id', student_id)
      .single();

    if (studentUser) {
      const msg = `You have been issued ${quantity}x ${item.name}. ${price > 0 ? 'A fee has been added to your account.' : ''}`;
      
      // Notify Student
      if (studentUser.user_id) {
        await notificationService.createInAppNotification({
          schoolId: school_id,
          userId: studentUser.user_id,
          type: 'inventory',
          title: '📦 Inventory Item Issued',
          message: msg,
          sourceType: 'inventory',
          sourceId: data.id,
        });
      }
      
      // Notify Parent
      const parentUserId = studentUser.parents?.[0]?.user_id;
      if (parentUserId) {
        await notificationService.createInAppNotification({
          schoolId: school_id,
          userId: parentUserId,
          type: 'inventory',
          title: '📦 Item Issued to Student',
          message: msg,
          sourceType: 'inventory',
          sourceId: data.id,
        });
      }
    }
  } catch (notifErr) {
    console.error('Failed to send inventory notifications:', notifErr);
  }

  res.json(data);
};

export const bulkIssueItem = async (req: Request, res: Response) => {
  const { school_id, id: user_id } = (req as any).user;
  const { class_id, section_id, student_ids, items, kit_id, payment_rule, academic_year_id, remarks, allow_duplicate } = req.body;
  // items expected: Array<{ item_id: string, quantity: number }>

  if (!class_id || !section_id || !student_ids || !items || items.length === 0) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  // 1. Fetch Students
  const { data: students, error: studentError } = await supabase
    .from('students')
    .select('id, user_id')
    .eq('section_id', section_id)
    .in('id', student_ids);

  if (studentError || !students || students.length === 0) {
    return res.status(400).json({ error: 'No valid students found for this issue' });
  }

  // 2. Create Bulk Operation Record
  const { data: bulkOp, error: bulkErr } = await supabase.from('bulk_inventory_operations').insert({
    school_id, class_id, section_id, kit_id: kit_id || null, status: 'completed', student_count: students.length, performed_by: user_id
  }).select().single();

  if (bulkErr) return res.status(500).json({ error: 'Failed to create bulk operation: ' + bulkErr.message });
  const bulk_operation_id = bulkOp.id;

  const distributions: Array<any> = [];
  const transactions: Array<any> = [];
  const fees: Array<any> = [];
  const pendingStudents: string[] = [];
  const successfulStudents: any[] = [];
  
  // Track notifications to send
  const notificationsToProcess: any[] = [];

  // Pre-fetch existing distributions if we don't allow duplicates
  let existingDistributions: any[] = [];
  if (!allow_duplicate) {
    const itemIds = items.map((i: any) => i.item_id);
    const { data: existing } = await supabase
      .from('student_inventory_distribution')
      .select('student_id, item_id')
      .in('student_id', student_ids)
      .in('item_id', itemIds);
    existingDistributions = existing || [];
  }

  // For each item in the kit
  for (const requestedItem of items) {
    const { item_id, quantity } = requestedItem;

    const { data: item } = await supabase.from('school_inventory').select('quantity, min_stock, name, selling_price, unit_price').eq('id', item_id).single();
    if (!item) continue;

    // Partial Stock Logic
    const availableStock = item.quantity;
    let studentsToReceive = [...students];

    if (!allow_duplicate) {
      studentsToReceive = studentsToReceive.filter(s => 
        !existingDistributions.some(d => d.student_id === s.id && d.item_id === item_id)
      );
    }

    if (availableStock < studentsToReceive.length * quantity) {
      // Limit students based on stock
      const maxStudents = Math.floor(availableStock / quantity);
      const receivingSubset = studentsToReceive.slice(0, maxStudents);
      const remainingStudents = studentsToReceive.slice(maxStudents);
      studentsToReceive = receivingSubset;
      // Mark these as pending or couldn't issue
      remainingStudents.forEach(rs => {
        if (!pendingStudents.includes(rs.id)) pendingStudents.push(rs.id);
      });
    }

    if (studentsToReceive.length === 0) continue;

    const totalQuantityIssued = studentsToReceive.length * quantity;
    const price = item.selling_price || item.unit_price || 0;
    const isPending = payment_rule === 'pending_payment';
    const status = isPending ? 'pending' : 'issued';

    // Only update stock if immediately issued
    if (!isPending) {
      const updatedStock = item.quantity - totalQuantityIssued;
      await supabase.from('school_inventory').update({ quantity: updatedStock, status: updatedStock <= item.min_stock ? 'low' : 'good' }).eq('id', item_id);
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 10);
    const totalFeePerStudent = price * quantity;

    // We process sequentially to capture fee IDs easily
    for (const student of studentsToReceive) {
      if (!successfulStudents.some(s => s.id === student.id)) successfulStudents.push(student);

      let feePaymentId = null;
      if (price > 0 && payment_rule !== 'free') {
        const { data: fee } = await supabase.from('fee_payments').insert({
          school_id, student_id: student.id, amount: totalFeePerStudent, paid_amount: 0, 
          status: payment_rule === 'paid' ? 'paid' : 'pending',
          title: `Inventory Issue: ${item.name}`,
          remarks: `Issued ${quantity}x ${item.name} (${remarks || 'Bulk Kit'})`,
          due_date: dueDate.toISOString(),
          bulk_operation_id
        }).select('id').single();
        if (fee) feePaymentId = fee.id;
      }

      distributions.push({
        school_id, student_id: student.id, item_id, academic_year_id, quantity, status, issue_date: new Date().toISOString(), remarks, bulk_operation_id,
        fee_payment_id: feePaymentId
      });

      if (!isPending) {
        transactions.push({
          school_id, item_id, transaction_type: 'issue', quantity, previous_stock: item.quantity, updated_stock: item.quantity - totalQuantityIssued,
          issued_to_student_id: student.id, performed_by: user_id, remarks, bulk_operation_id
        });
      }

      if (student.user_id) {
        notificationsToProcess.push({
          schoolId: school_id, userId: student.user_id, type: 'inventory_issued',
          title: `New Inventory Issued: ${item.name}`,
          message: `You have been issued ${quantity}x ${item.name}. ${price > 0 && payment_rule !== 'free' ? 'Please check your fee section.' : ''}`,
          sourceType: 'inventory', sourceId: item_id
        });
      }
    }
  }

  // Batch Inserts for distributions and transactions
  if (distributions.length > 0) await supabase.from('student_inventory_distribution').insert(distributions);
  if (transactions.length > 0) await supabase.from('inventory_transactions').insert(transactions);

  // Update operation with actual issued count if partial
  if (successfulStudents.length !== students.length) {
    await supabase.from('bulk_inventory_operations').update({ student_count: successfulStudents.length }).eq('id', bulk_operation_id);
  }

  // Notifications
  try {
    for (const notif of notificationsToProcess) {
       await notificationService.createInAppNotification(notif);
    }
  } catch (notifErr) {
    console.error('Failed to send bulk notifications:', notifErr);
  }

  res.json({ 
    success: true, 
    issuedCount: successfulStudents.length, 
    pendingCount: pendingStudents.length,
    message: pendingStudents.length > 0 ? `Issued to ${successfulStudents.length}. Stock insufficient for ${pendingStudents.length} students.` : 'Issued to all requested students successfully.',
    operation_id: bulk_operation_id
  });
};

export const returnStudentItem = async (req: Request, res: Response) => {
  const { school_id, id: user_id } = (req as any).user;
  const { id } = req.params; // distribution id
  const { condition, remarks } = req.body;

  const { data: dist } = await supabase.from('student_inventory_distribution').select('*').eq('id', id).single();
  if (!dist) return res.status(404).json({ error: 'Record not found' });

  const { data: item } = await supabase.from('school_inventory').select('quantity, min_stock').eq('id', dist.item_id).single();
  
  let newStatus = 'returned';
  let stockChange = dist.quantity;
  if (condition === 'damaged' || condition === 'lost') {
    newStatus = condition;
    stockChange = 0; // Don't add back to stock if lost/damaged
  }

  const updatedStock = (item?.quantity || 0) + stockChange;

  if (stockChange > 0) {
    await supabase.from('school_inventory').update({ quantity: updatedStock, status: updatedStock <= (item?.min_stock || 10) ? 'low' : 'good' }).eq('id', dist.item_id);
    await supabase.from('inventory_transactions').insert({
      school_id, item_id: dist.item_id, transaction_type: 'return', quantity: stockChange, previous_stock: item?.quantity, updated_stock: updatedStock,
      issued_to_student_id: dist.student_id, performed_by: user_id, remarks
    });
  } else if (newStatus === 'damaged' || newStatus === 'lost') {
     await supabase.from('inventory_transactions').insert({
      school_id, item_id: dist.item_id, transaction_type: newStatus, quantity: dist.quantity, previous_stock: item?.quantity, updated_stock: updatedStock,
      issued_to_student_id: dist.student_id, performed_by: user_id, remarks
    });
  }

  const { data, error } = await supabase.from('student_inventory_distribution').update({ status: newStatus, actual_return_date: new Date().toISOString(), remarks }).eq('id', id).select('*, school_inventory(*)').single();
  
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

export const getAllDistributions = async (req: Request, res: Response) => {
  const { school_id } = (req as any).user;
  const { status, student_id } = req.query;

  let query = supabase.from('student_inventory_distribution')
    .select('*, fee_payments(status, id, amount, paid_amount), school_inventory(name, min_stock, quantity, selling_price, unit_price), students(id, admission_number, user:users(first_name, last_name))')
    .eq('school_id', school_id)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (student_id) query = query.eq('student_id', student_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

export const issuePendingItem = async (req: Request, res: Response) => {
  const { school_id, id: user_id } = (req as any).user;
  const { id } = req.params;

  // Fetch the distribution
  const { data: dist } = await supabase.from('student_inventory_distribution').select('*').eq('id', id).eq('school_id', school_id).single();
  if (!dist || dist.status !== 'pending') return res.status(400).json({ error: 'Record not found or not in pending state' });

  // Fetch the item
  const { data: item } = await supabase.from('school_inventory').select('quantity, min_stock').eq('id', dist.item_id).single();
  if (!item || item.quantity < dist.quantity) return res.status(400).json({ error: 'Insufficient stock to issue this item' });

  // Deduct Stock
  const updatedStock = item.quantity - dist.quantity;
  await supabase.from('school_inventory').update({ quantity: updatedStock, status: updatedStock <= item.min_stock ? 'low' : 'good' }).eq('id', dist.item_id);

  // Insert Transaction
  await supabase.from('inventory_transactions').insert({
    school_id, item_id: dist.item_id, transaction_type: 'issue', quantity: dist.quantity, previous_stock: item.quantity, updated_stock: updatedStock,
    issued_to_student_id: dist.student_id, performed_by: user_id, remarks: 'Issued from pending state'
  });

  // Update Distribution
  const { data, error } = await supabase.from('student_inventory_distribution')
    .update({ status: 'issued', issue_date: new Date().toISOString() })
    .eq('id', id)
    .select('*, school_inventory(*)').single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

export const getKits = async (req: Request, res: Response) => {
  const { school_id } = (req as any).user;
  const { data, error } = await supabase
    .from('inventory_kits')
    .select('*, inventory_kit_items(*, school_inventory(*))')
    .eq('school_id', school_id)
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

export const createKit = async (req: Request, res: Response) => {
  const { school_id } = (req as any).user;
  const { name, description, items } = req.body; // items is array of { item_id, quantity }

  const { data: kit, error: kitError } = await supabase.from('inventory_kits').insert({ school_id, name, description }).select().single();
  if (kitError) return res.status(500).json({ error: kitError.message });

  if (items && items.length > 0) {
    const kitItems = items.map((i: any) => ({ kit_id: kit.id, item_id: i.item_id, quantity: i.quantity || 1 }));
    await supabase.from('inventory_kit_items').insert(kitItems);
  }

  res.json({ success: true, kit });
};

export const undoBulkOperation = async (req: Request, res: Response) => {
  const { school_id } = (req as any).user;
  const { id } = req.params;

  // 1. Fetch the operation
  const { data: op } = await supabase.from('bulk_inventory_operations').select('*').eq('id', id).eq('school_id', school_id).single();
  if (!op || op.status === 'undone') return res.status(400).json({ error: 'Operation not found or already undone' });

  // 2. Time check (e.g. 15 minutes limit)
  const opTime = new Date(op.created_at).getTime();
  const now = new Date().getTime();
  if (now - opTime > 15 * 60 * 1000) {
    return res.status(400).json({ error: 'Undo window expired (15 minutes limit)' });
  }

  // 3. Check if any associated fee is paid
  const { data: paidFees } = await supabase.from('fee_payments')
    .select('id')
    .eq('bulk_operation_id', id)
    .in('status', ['paid', 'partial']);

  if (paidFees && paidFees.length > 0) {
    return res.status(400).json({ error: 'Cannot undo. Associated payments have already been partially or fully paid.' });
  }

  // 4. Reverse Inventory Quantities
  const { data: transactions } = await supabase.from('inventory_transactions').select('item_id, quantity').eq('bulk_operation_id', id).eq('transaction_type', 'issue');
  if (transactions) {
    // Sum up quantities to restore per item
    const itemQuantities: Record<string, number> = {};
    for (const t of transactions) {
      itemQuantities[t.item_id] = (itemQuantities[t.item_id] || 0) + t.quantity;
    }
    
    for (const [itemId, qty] of Object.entries(itemQuantities)) {
      const { data: item } = await supabase.from('school_inventory').select('quantity, min_stock').eq('id', itemId).single();
      if (item) {
        const newQty = item.quantity + qty;
        await supabase.from('school_inventory').update({ quantity: newQty, status: newQty <= item.min_stock ? 'low' : 'good' }).eq('id', itemId);
      }
    }
  }

  // 5. Delete records via CASCADE or manually
  await supabase.from('fee_payments').delete().eq('bulk_operation_id', id);
  await supabase.from('student_inventory_distribution').delete().eq('bulk_operation_id', id);
  await supabase.from('inventory_transactions').delete().eq('bulk_operation_id', id);

  // 6. Mark operation undone
  await supabase.from('bulk_inventory_operations').update({ status: 'undone' }).eq('id', id);

  res.json({ success: true, message: 'Bulk operation successfully undone and stock restored.' });
};
