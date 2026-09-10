import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check if Supabase is configured
export const isSupabaseConfigured = 
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'https://your-project-id.supabase.co' &&
  supabaseAnonKey !== 'your-anon-key-here';

// Create client (or a dummy if not configured)
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// ============================================
// DATABASE HELPERS
// ============================================

// --- Teams ---
export async function fetchTeams() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('teams')
    .select('*, team_members(*), scores(*)')
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchTeams error:', error); return []; }
  return data || [];
}

export async function fetchMyTeam(userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('teams')
    .select('*, team_members(*)')
    .eq('id', userId)
    .single();
  if (error && error.code !== 'PGRST116') console.error('fetchMyTeam error:', error);
  return data || null;
}

export async function createTeam(teamData) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('teams')
    .insert(teamData)
    .select()
    .single();
  if (error) { console.error('createTeam error:', error); throw error; }
  return data;
}

export async function createOrganizerTeam(teamData, credentials) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('create_organizer_team', {
    p_team_name: teamData.team_name,
    p_leader_email: teamData.leader_email,
    p_leader_name: teamData.leader_name,
    p_college: teamData.college || null,
    p_login_name: credentials.loginName,
    p_password: credentials.password,
  });
  if (error) { console.error('createOrganizerTeam error:', error); throw error; }
  return data?.[0] || data;
}

export async function authenticateTeam(loginName, password) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('authenticate_team', {
    p_login_name: loginName.trim().toLowerCase(),
    p_password: password,
  });
  if (error || !data?.[0]) return null;
  return { team: data[0], loginName: data[0].login_name };
}

export async function updateTeam(teamId, updates) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('teams')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', teamId)
    .select()
    .single();
  if (error) { console.error('updateTeam error:', error); throw error; }
  return data;
}

// --- Team Members ---
export async function addTeamMember(memberData) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('team_members')
    .insert(memberData)
    .select()
    .single();
  if (error) { console.error('addTeamMember error:', error); throw error; }
  return data;
}

export async function removeTeamMember(memberId) {
  if (!supabase) return;
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('id', memberId);
  if (error) { console.error('removeTeamMember error:', error); throw error; }
}

// --- Scores ---
export async function fetchScoresForTeam(teamId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('scores')
    .select('*')
    .eq('team_id', teamId);
  if (error) { console.error('fetchScoresForTeam error:', error); return []; }
  return data || [];
}

export async function upsertScore(scoreData) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('scores')
    .upsert(scoreData, { onConflict: 'team_id,judge_email' })
    .select()
    .single();
  if (error) { console.error('upsertScore error:', error); throw error; }
  return data;
}

// --- Announcements ---
export async function fetchAnnouncements() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchAnnouncements error:', error); return []; }
  return data || [];
}

export async function createAnnouncement(announcementData) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('announcements')
    .insert(announcementData)
    .select()
    .single();
  if (error) { console.error('createAnnouncement error:', error); throw error; }
  return data;
}

export async function deleteAnnouncement(id) {
  if (!supabase) return;
  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id);
  if (error) { console.error('deleteAnnouncement error:', error); throw error; }
}
