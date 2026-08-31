import { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

// ── LIBRARY BOOKS ──────────────────────────────────────────

export async function getBooks(req: AuthenticatedRequest, res: Response) {
  try {
    const { data, error } = await supabaseAdmin
      .from('library_books')
      .select('*')
      .eq('school_id', req.user!.school_id);

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch books' });
  }
}

export async function addBooks(req: AuthenticatedRequest, res: Response) {
  try {
    const { data, error } = await supabaseAdmin
      .from('library_books')
      .insert({ ...req.body, school_id: req.user!.school_id })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to add book' });
  }
}

// ── BOOK ISSUES ───────────────────────────────────────────

export async function issueBook(req: AuthenticatedRequest, res: Response) {
  try {
    const { bookId, userId, dueDate } = req.body;

    // 1. Check availability
    const { data: book } = await supabaseAdmin
      .from('library_books')
      .select('available_copies')
      .eq('id', bookId)
      .single();

    if (!book || book.available_copies <= 0) {
      return res.status(400).json({ error: 'Book not available for issue' });
    }

    // 2. Create issue record
    const { data, error } = await supabaseAdmin
      .from('library_issues')
      .insert({
        book_id: bookId,
        user_id: userId,
        due_date: dueDate,
        status: 'issued'
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // 3. Decrement available copies
    await supabaseAdmin
      .from('library_books')
      .update({ available_copies: book.available_copies - 1 })
      .eq('id', bookId);

    return res.status(201).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to issue book' });
  }
}

export async function returnBook(req: AuthenticatedRequest, res: Response) {
  try {
    const { issueId } = req.body;

    // 1. Get issue details
    const { data: issue } = await supabaseAdmin
      .from('library_issues')
      .select('book_id')
      .eq('id', issueId)
      .single();

    if (!issue) return res.status(404).json({ error: 'Issue record not found' });

    // 2. Update issue status
    await supabaseAdmin
      .from('library_issues')
      .update({ status: 'returned', return_date: new Date().toISOString().split('T')[0] })
      .eq('id', issueId);

    // 3. Increment available copies
    const { data: book } = await supabaseAdmin
      .from('library_books')
      .select('available_copies')
      .eq('id', issue.book_id)
      .single();

    if (book) {
      await supabaseAdmin
        .from('library_books')
        .update({ available_copies: book.available_copies + 1 })
        .eq('id', issue.book_id);
    }

    return res.json({ message: 'Book returned successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to return book' });
  }
}
