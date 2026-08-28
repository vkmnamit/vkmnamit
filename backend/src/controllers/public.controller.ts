import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';

export const publicController = {
  getLandingData: async (req: Request, res: Response) => {
    try {
      // Global stats across the entire system
      let totalStudents = 0;
      let totalTeachers = 0;

      // Fetch Total Students globally
      const { count: studentCount } = await supabaseAdmin
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);
      totalStudents = studentCount || 0;

      // Fetch Total Teachers globally
      const { count: teacherCount } = await supabaseAdmin
        .from('teachers')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);
      totalTeachers = teacherCount || 0;

      // Fetch Total Requests (all fee payment transactions ever processed globally)
      const { count: requestCount } = await supabaseAdmin
        .from('fee_payments')
        .select('*', { count: 'exact', head: true });
      const totalRequests = requestCount || 0;

      return res.json({
        stats: {
          totalStudents,
          totalTeachers,
          totalRequests,
        }
      });
    } catch (error: any) {
      console.error('Error fetching landing data:', error);
      return res.status(500).json({ error: 'Failed to fetch landing data' });
    }
  }
};
