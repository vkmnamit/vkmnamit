import { supabaseAdmin } from '../config/supabase';
import { getUserScope, UserScope } from '../utils/userScope';

export interface AIRequestContext {
  user: { id: string; school_id: string; role: string; first_name: string; last_name: string | null; preferred_language: string | null };
  scope: UserScope | null;
  academicYear: string | null;
  memory: string | null;
}

/** Builds AI context exclusively from authenticated server-side data. */
export async function buildAIRequestContext(params: {
  userId: string;
  schoolId: string;
  role: string;
  sessionId?: string;
}): Promise<AIRequestContext | null> {
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('id, school_id, role, first_name, last_name, preferred_language')
    .eq('id', params.userId)
    .eq('school_id', params.schoolId)
    .maybeSingle();
  if (userError) throw userError;
  if (!user || user.role !== params.role) return null;

  const [scope, academicYearResult, memoryResult] = await Promise.all([
    getUserScope({ id: user.id, role: user.role, school_id: user.school_id }),
    supabaseAdmin
      .from('academic_years')
      .select('name')
      .eq('school_id', user.school_id)
      .eq('is_current', true)
      .maybeSingle(),
    params.sessionId
      ? supabaseAdmin
        .from('ai_session_memories')
        .select('summary')
        .eq('session_id', params.sessionId)
        .eq('user_id', user.id)
        .eq('school_id', user.school_id)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (academicYearResult.error) throw academicYearResult.error;
  if (memoryResult.error) throw memoryResult.error;
  return {
    user,
    scope,
    academicYear: academicYearResult.data?.name || null,
    memory: memoryResult.data?.summary || null,
  };
}

/** Persist a compact rolling transcript so references survive beyond the recent-message window. */
export async function refreshSessionMemory(params: { sessionId: string; userId: string; schoolId: string }) {
  const { data: messages, error } = await supabaseAdmin
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('session_id', params.sessionId)
    .eq('user_id', params.userId)
    .order('created_at', { ascending: false })
    .limit(80);
  if (error) throw error;

  const transcript = (messages || [])
    .reverse()
    .map((message: any) => `${message.role === 'assistant' ? 'Kautix' : 'User'}: ${message.content}`)
    .join('\n')
    .slice(-12000);

  const { error: saveError } = await supabaseAdmin
    .from('ai_session_memories')
    .upsert({
      session_id: params.sessionId,
      user_id: params.userId,
      school_id: params.schoolId,
      summary: transcript,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'session_id' });
  if (saveError) throw saveError;
}
