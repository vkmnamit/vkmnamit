import { Request, Response } from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { generateRandomPassword } from '../util/user.util';
import { notificationService } from '../services/notification.service';

import { createClient } from '@supabase/supabase-js';

export async function login(req: Request, res: Response) {
    try {
        const { loginId, password, role } = req.body;
        if (typeof loginId !== 'string' || !loginId.trim() || typeof password !== 'string' || !password) {
            return res.status(400).json({ error: 'Login ID and password are required' });
        }

        // Create a temporary client so we don't mutate the global singleton session
        const tempClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
            auth: { persistSession: false, autoRefreshToken: false }
        });

        // Backward compatibility: If it contains '@', use it directly. Otherwise, it's a loginId.
        const normalizedLoginId = loginId.trim();
        const authEmail = normalizedLoginId.includes('@') ? normalizedLoginId : `${normalizedLoginId.toLowerCase().replace(/-/g, '')}@kautix.local`;

        const { data: authData, error: authError } = await tempClient.auth.signInWithPassword({
            email: authEmail,
            password,
        });

        if (authError) return res.status(401).json({ error: authError.message });

        // Fetch user by auth_id — do NOT filter by role here so missing role doesn't cause false 403
        let query = supabaseAdmin
            .from('users')
            .select('*, schools(*)')
            .eq('auth_id', authData.user.id);

        const { data: user, error: userError } = await query.single();

        if (userError || !user) {
            return res.status(403).json({ error: 'User account not found in the system' });
        }

        // If a specific role was requested, validate it matches
        if (role && user.role !== role) {
            return res.status(403).json({ error: 'Invalid login credentials or role mismatch' });
        }

        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role,
                school_id: user.school_id
            },
            env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        return res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                firstName: user.first_name,
                lastName: user.last_name,
                school: user.schools?.name,
                schoolAddress: user.schools?.address,
                schoolPhone: user.schools?.phone,
                schoolEmail: user.schools?.email,
                schoolWebsite: user.schools?.website,
            }
        });
    } catch (error: any) {
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Login failed' });
    }
}

export const register = async (req: Request, res: Response) => {
    try {
        const {
            email,
            password,
            firstName,
            lastName,
            phone,
            schoolName,
            schoolCode,
            board,
            address,
            city,
            state,
            pincode,
            principalName,
            establishedYear,
            schoolEmail,
            schoolPhone,
            website,
            logoUrl,
            domain
        } = req.body;

        if (!email || !password || !firstName || !schoolName) {
            return res.status(400).json({ error: 'email, password, firstName and schoolName are required' });
        }

        // Check if email or phone is already used by an admin or teacher
        const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('id, email, phone')
            .in('role', ['admin', 'teacher'])
            .or(`email.eq.${email}${phone ? `,phone.eq.${phone}` : ''}`);

        if (existingUser && existingUser.length > 0) {
            const conflict = existingUser[0];
            if (conflict.email === email) {
                return res.status(400).json({ error: 'This email is already registered as an Admin or Teacher.' });
            }
            if (phone && conflict.phone === phone) {
                return res.status(400).json({ error: 'This phone number is already registered to an Admin or Teacher.' });
            }
        }

        const baseCode = schoolCode || schoolName.toLowerCase().replace(/\s+/g, '-');
        const uniqueCode = `${baseCode}-${Math.random().toString(36).slice(2, 6)}`;
        const assignedDomain = domain || `${uniqueCode}.kautix.app`;

        // 1. Create school record first
        const { data: school, error: schoolError } = await supabaseAdmin
            .from('schools')
            .insert({
                name: schoolName,
                code: uniqueCode,
                board: board || 'CBSE',
                phone: schoolPhone || phone || null,
                address: address || null,
                city: city || null,
                state: state || null,
                pincode: pincode || null,
                email: schoolEmail || email || null,
                website: website || null,
                logo_url: logoUrl || null,
                principal_name: principalName || null,
                established_year: establishedYear ? parseInt(establishedYear, 10) : null,
                domain: assignedDomain,
            })
            .select()
            .single();

        if (schoolError || !school) {
            console.error('School creation error:', schoolError);
            return res.status(500).json({ error: schoolError?.message || 'Failed to create school record' });
        }

        // 2. Create user in Supabase Auth (skip email confirmation for admin setup)
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { role: 'admin', schoolId: school.id },
        });

        if (authError || !authData?.user) {
            // Rollback school
            await supabaseAdmin.from('schools').delete().eq('id', school.id);
            return res.status(400).json({ error: authError?.message || 'Failed to create auth user' });
        }

        // 3. Insert into users table
        const { data: user, error: userError } = await supabaseAdmin
            .from('users')
            .insert({
                auth_id: authData.user.id,
                school_id: school.id,
                email,
                phone: phone || null,
                role: 'admin',
                first_name: firstName,
                last_name: lastName || '',
            })
            .select()
            .single();

        if (userError || !user) {
            console.error('User insert error:', userError);
            // Rollback auth user and school
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            await supabaseAdmin.from('schools').delete().eq('id', school.id);
            return res.status(500).json({ error: 'Failed to create user profile' });
        }

        // 4. Sign JWT and return
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, school_id: user.school_id },
            env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        return res.status(201).json({
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                firstName: user.first_name,
                lastName: user.last_name,
                school: school.name,
                schoolAddress: school.address,
                schoolPhone: school.phone,
                schoolEmail: school.email,
                schoolWebsite: school.website,
            },
        });
    } catch (error: any) {
        console.error('Register error:', error);
        return res.status(500).json({ error: 'Registration failed' });
    }
};
export const logout = (req: Request, res: Response) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out' });
};
export const getMe = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (!user) return res.status(401).json({ error: 'Unauthorized' });
        const { data, error } = await supabaseAdmin.from('users').select('*, schools(*)').eq('id', user.id).single();
        if (error || !data) return res.status(404).json({ error: 'User not found' });
        return res.json({ user: data });
    } catch (e: any) { return res.status(500).json({ error: 'Failed to fetch user' }); }
};
export const createUser = async (req: Request, res: Response) => {
    try {
        const { email, firstName, lastName, phone, role, password, academicYearId } = req.body;
        const school_id = (req as any).user?.school_id;
        if (!school_id) return res.status(401).json({ error: 'Unauthorized' });

        // Enforce uniqueness for admin and teacher
        if (role === 'admin' || role === 'teacher') {
            const { data: existingUser } = await supabaseAdmin
                .from('users')
                .select('id, email, phone')
                .in('role', ['admin', 'teacher'])
                .or(`email.eq.${email}${phone ? `,phone.eq.${phone}` : ''}`);

            if (existingUser && existingUser.length > 0) {
                const conflict = existingUser[0];
                if (conflict.email === email) {
                    return res.status(400).json({ error: `This email is already registered as an Admin or Teacher.` });
                }
                if (phone && conflict.phone === phone) {
                    return res.status(400).json({ error: `This phone number is already registered to an Admin or Teacher.` });
                }
            }
        }

        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: password || 'Welcome@123',
            email_confirm: true,
            user_metadata: { role, school_id }
        });

        if (authError) return res.status(400).json({ error: authError.message });

        const { data: user, error: userError } = await supabaseAdmin
            .from('users')
            .insert({
                id: authUser.user.id,
                school_id,
                email,
                phone,
                role,
                first_name: firstName,
                last_name: lastName,
                academic_year_id: academicYearId || null
            })
            .select()
            .single();

        if (userError) {
            await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
            return res.status(400).json({ error: userError.message });
        }

        return res.json({ user });
    } catch (e: any) {
        return res.status(500).json({ error: 'Failed to create user' });
    }
};
export const resendCredentials = async (req: Request, res: Response) => {
    try {
        const { userId, customPassword } = req.body;
        const school_id = (req as any).user?.school_id;

        if (!userId) return res.status(400).json({ error: 'User ID is required' });

        const { data: user, error: userError } = await supabaseAdmin
            .from('users')
            .select('id, auth_id, email, first_name, role')
            .eq('id', userId)
            .eq('school_id', school_id)
            .single();

        if (userError || !user) return res.status(404).json({ error: 'User not found' });
        if (!user.auth_id) return res.status(500).json({ error: 'Auth account not linked for this user' });

        // Use custom password if provided, otherwise generate random secure one
        const newPassword = (customPassword && customPassword.trim().length >= 6)
            ? customPassword.trim()
            : generateRandomPassword(10);

        // Must use auth_id (Supabase Auth UUID), not users.id
        const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(user.auth_id, { password: newPassword });
        if (authErr) return res.status(500).json({ error: 'Failed to reset password in Auth' });

        await notificationService.sendMultiChannel({
            schoolId: school_id,
            channels: ['email'],
            type: 'credentials',
            title: `Your ${user.role.charAt(0).toUpperCase() + user.role.slice(1)} Login Credentials`,
            message: `Hello ${user.first_name},\n\nYour login credentials for Kautix School Management:\n\nLogin URL: https://kautix.in/login\nEmail: ${user.email}\nPassword: ${newPassword}\n\nPlease login and change your password after your first login.`,
            emailAddress: user.email,
        });

        return res.json({ message: 'Credentials resent successfully' });
    } catch (e: any) {
        return res.status(500).json({ error: 'Failed to resend credentials' });
    }
};

export const forgotPassword = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const { data: users, error: userError } = await supabaseAdmin
            .from('users')
            .select('id, auth_id, email, first_name, role, school_id')
            .eq('email', email.trim().toLowerCase());

        if (userError || !users || users.length === 0) {
            // Return success even if not found to prevent email enumeration
            return res.json({ message: 'If this email is registered, an OTP has been sent.' });
        }

        const user = users[0];
        if (!user.auth_id) {
            console.error('User has no auth_id:', user.id);
            return res.json({ message: 'If this email is registered, an OTP has been sent.' });
        }

        const otp = crypto.randomInt(100000, 999999).toString();
        const expires = Date.now() + 15 * 60 * 1000; // 15 mins

        // Use auth_id (not users.id) to look up the auth user
        const { data: authUser, error: authUserErr } = await supabaseAdmin.auth.admin.getUserById(user.auth_id);
        if (authUserErr || !authUser) {
            console.error('Failed to retrieve auth user by auth_id:', user.auth_id, authUserErr?.message);
            return res.status(500).json({ error: 'Failed to generate reset OTP' });
        }

        const currentMeta = authUser.user.user_metadata || {};
        const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(user.auth_id, {
            user_metadata: { ...currentMeta, reset_otp: otp, reset_otp_expires: expires }
        });

        if (authErr) return res.status(500).json({ error: 'Failed to generate reset OTP' });

        // Build a nice HTML email for the OTP
        const htmlContent = `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1e293b">
  <div style="background:#1e40af;padding:32px;border-radius:16px 16px 0 0;text-align:center">
    <h1 style="color:white;margin:0;font-size:24px;font-weight:900">Kautix</h1>
    <p style="color:#bfdbfe;margin:6px 0 0;font-size:12px;letter-spacing:2px;text-transform:uppercase">Password Reset</p>
  </div>
  <div style="padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;background:white">
    <p>Hello <strong>${user.first_name}</strong>,</p>
    <p>You requested a password reset for your Kautix account. Use the OTP below:</p>
    <div style="background:#f0f9ff;border:2px dashed #3b82f6;border-radius:12px;padding:24px;text-align:center;margin:24px 0">
      <p style="margin:0;font-size:12px;color:#64748b;letter-spacing:2px;font-weight:700">YOUR ONE-TIME PASSWORD</p>
      <p style="margin:12px 0 0;font-size:42px;font-weight:900;letter-spacing:12px;color:#1e40af">${otp}</p>
    </div>
    <p style="color:#64748b;font-size:13px">This OTP is valid for <strong>15 minutes</strong>. If you did not request this, please ignore this email — your password will not be changed.</p>
    <p style="color:#94a3b8;font-size:11px;margin-top:24px;border-top:1px solid #f1f5f9;padding-top:16px">This is an automated message from Kautix School Management System.</p>
  </div>
</div>`;

        await notificationService.sendMultiChannel({
            schoolId: user.school_id,
            channels: ['email'],
            type: 'otp',
            title: `Your Password Reset OTP — Kautix`,
            message: `Your OTP is: ${otp} (valid for 15 minutes)`,
            emailAddress: user.email,
            htmlContent,
        });

        return res.json({ message: 'OTP sent successfully. Please check your email.' });
    } catch (e: any) {
        console.error('forgotPassword error:', e);
        return res.status(500).json({ error: 'Failed to process request' });
    }
};

export const resetPasswordWithOtp = async (req: Request, res: Response) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) return res.status(400).json({ error: 'Email, OTP, and New Password are required' });

        const { data: users, error: userError } = await supabaseAdmin
            .from('users')
            .select('id, auth_id, email, first_name, role, school_id')
            .eq('email', email.trim().toLowerCase());

        if (userError || !users || users.length === 0) {
            return res.status(400).json({ error: 'Invalid OTP' });
        }

        const user = users[0];
        if (!user.auth_id) return res.status(500).json({ error: 'Auth account not found' });

        // Use auth_id to fetch the correct auth user
        const { data: authUser, error: authUserErr } = await supabaseAdmin.auth.admin.getUserById(user.auth_id);
        if (authUserErr || !authUser) return res.status(500).json({ error: 'Failed to retrieve auth user' });

        const currentMeta = authUser.user.user_metadata || {};

        if (!currentMeta.reset_otp || currentMeta.reset_otp !== otp.trim()) {
            return res.status(400).json({ error: 'Invalid OTP. Please check the code and try again.' });
        }

        if (!currentMeta.reset_otp_expires || currentMeta.reset_otp_expires < Date.now()) {
            return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        // Update password and clear OTP using auth_id
        const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(user.auth_id, {
            password: newPassword,
            user_metadata: { ...currentMeta, reset_otp: null, reset_otp_expires: null }
        });

        if (authErr) return res.status(500).json({ error: 'Failed to update password' });

        return res.json({ message: 'Password updated successfully! You can now log in.' });
    } catch (e: any) {
        console.error('resetPasswordWithOtp error:', e);
        return res.status(500).json({ error: 'Failed to process request' });
    }
};

export const updateUserStatus = async (req: Request, res: Response) => {
    try {
        const { userId, isActive } = req.body;

        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ error: 'isActive must be a boolean' });
        }

        // Fetch user first to get auth_id and verify ownership + tenant isolation
        const { data: user, error: userError } = await supabaseAdmin
            .from('users')
            .select('id, auth_id')
            .eq('id', userId)
            .eq('school_id', (req as any).user?.school_id)
            .single();

        if (userError || !user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update public users table
        const { error: dbError } = await supabaseAdmin
            .from('users')
            .update({ is_active: isActive })
            .eq('id', userId);

        if (dbError) {
            return res.status(500).json({ error: 'Failed to update user status in database' });
        }

        // Update auth user if auth_id exists
        if (user.auth_id) {
            // Note: Supabase doesn't have a direct "suspend" flag for Auth users, 
            // but we can update user_metadata to reflect it if needed, or simply let our middleware block inactive users.
            // For now, the database flag is sufficient if our middleware checks it.
            await supabaseAdmin.auth.admin.updateUserById(user.auth_id, {
                user_metadata: { is_active: isActive }
            });
        }

        return res.json({ message: `User successfully ${isActive ? 'activated' : 'suspended'}` });
    } catch (e: any) {
        console.error('updateUserStatus error:', e);
        return res.status(500).json({ error: 'Failed to update user status' });
    }
};

export const deleteUser = async (req: Request, res: Response) => {
    try {
        const { id: userId } = req.params;

        // Fetch user to get auth_id and verify ownership + tenant isolation
        const { data: user, error: userError } = await supabaseAdmin
            .from('users')
            .select('id, auth_id, role')
            .eq('id', userId)
            .eq('school_id', (req as any).user?.school_id)
            .single();

        if (userError || !user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Delete from auth.users (this should cascade to public.users if FK is set up, but we'll do both to be safe)
        if (user.auth_id) {
            const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(user.auth_id);
            if (authDeleteError) {
                console.error('Failed to delete auth user:', authDeleteError);
                // Continue anyway to clean up public records if needed
            }
        }

        // Delete from role-specific tables and public.users
        if (user.role === 'student') {
            await supabaseAdmin.from('students').delete().eq('user_id', user.id);
        } else if (user.role === 'teacher') {
            await supabaseAdmin.from('teachers').delete().eq('user_id', user.id);
        } else if (user.role === 'parent') {
            await supabaseAdmin.from('parents').delete().eq('user_id', user.id);
        }

        // Delete from users table (might be redundant if cascade works)
        await supabaseAdmin.from('users').delete().eq('id', user.id);

        return res.json({ message: 'User deleted successfully' });
    } catch (e: any) {
        console.error('deleteUser error:', e);
        return res.status(500).json({ error: 'Failed to delete user' });
    }
};
