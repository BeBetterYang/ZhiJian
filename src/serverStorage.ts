import { isSupabaseConfigured, supabase } from './supabaseClient';

const SESSION_KEY = 'mindflow-session';
const ASSET_BUCKET = 'map-assets';

function isDemoSession() {
  return localStorage.getItem(SESSION_KEY) === 'demo';
}

function authHeaders(contentType = false): Record<string, string> {
  const token = localStorage.getItem(SESSION_KEY);
  return {
    ...(contentType ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function currentUserId() {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('UNAUTHORIZED');
  return data.user.id;
}

function mapIdFromPath(path: string) {
  const match = path.match(/^\/api\/maps\/([^/?#]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function loadServerJson<T>(path: string): Promise<T | null> {
  if (isDemoSession()) return null;

  if (supabase) {
    try {
      const userId = await currentUserId();
      if (path === '/api/library') {
        const { data, error } = await supabase
          .from('libraries')
          .select('data')
          .eq('user_id', userId)
          .maybeSingle();
        if (error) throw error;
        return (data?.data as T | undefined) ?? null;
      }

      const mapId = mapIdFromPath(path);
      if (mapId) {
        const { data, error } = await supabase
          .from('mind_maps')
          .select('data')
          .eq('user_id', userId)
          .eq('map_id', mapId)
          .maybeSingle();
        if (error) throw error;
        return (data?.data as T | undefined) ?? null;
      }
      return null;
    } catch {
      return null;
    }
  }

  try {
    const response = await fetch(path, { cache: 'no-store', headers: authHeaders() });
    return response.ok ? await response.json() as T : null;
  } catch {
    return null;
  }
}

export async function saveServerJson(path: string, value: unknown) {
  if (isDemoSession()) return;

  if (supabase) {
    const userId = await currentUserId();
    if (path === '/api/library') {
      const { error } = await supabase
        .from('libraries')
        .upsert({ user_id: userId, data: value }, { onConflict: 'user_id' });
      if (error) throw new Error('SERVER_SAVE_FAILED');
      return;
    }

    const mapId = mapIdFromPath(path);
    if (mapId) {
      const { error } = await supabase
        .from('mind_maps')
        .upsert({ user_id: userId, map_id: mapId, data: value }, { onConflict: 'user_id,map_id' });
      if (error) throw new Error('SERVER_SAVE_FAILED');
      return;
    }
    throw new Error('SERVER_SAVE_FAILED');
  }

  const response = await fetch(path, {
    method: 'PUT',
    headers: authHeaders(true),
    body: JSON.stringify(value),
  });
  if (!response.ok) throw new Error('SERVER_SAVE_FAILED');
}

export async function deleteServerMap(mapId: string) {
  if (isDemoSession()) return;

  if (supabase) {
    const userId = await currentUserId();
    const { error } = await supabase
      .from('mind_maps')
      .delete()
      .eq('user_id', userId)
      .eq('map_id', mapId);
    if (error) throw new Error('SERVER_DELETE_FAILED');
    return;
  }

  const response = await fetch(`/api/maps/${encodeURIComponent(mapId)}`, { method: 'DELETE', headers: authHeaders() });
  if (!response.ok) throw new Error('SERVER_DELETE_FAILED');
}

function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('SERVER_UPLOAD_FAILED'));
    reader.readAsDataURL(file);
  });
}

export async function uploadServerImage(file: File) {
  if (file.size > 15 * 1024 * 1024) throw new Error('IMAGE_TOO_LARGE');
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
    throw new Error('UNSUPPORTED_IMAGE_TYPE');
  }
  if (isDemoSession()) return fileAsDataUrl(file);

  if (supabase) {
    const userId = await currentUserId();
    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const objectPath = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from(ASSET_BUCKET).upload(objectPath, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) throw new Error('SERVER_UPLOAD_FAILED');
    return supabase.storage.from(ASSET_BUCKET).getPublicUrl(objectPath).data.publicUrl;
  }

  const response = await fetch('/api/uploads', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': file.type },
    body: file,
  });
  if (!response.ok) {
    if (response.status === 413) throw new Error('IMAGE_TOO_LARGE');
    if (response.status === 415) throw new Error('UNSUPPORTED_IMAGE_TYPE');
    throw new Error('SERVER_UPLOAD_FAILED');
  }
  const data = await response.json() as { url: string };
  return new URL(data.url, window.location.origin).href;
}

export type AuthUser = {
  id: string;
  username: string;
  phone: string;
  email: string;
};

export type AuthResult = { token: string; user: AuthUser };

async function requestAuth(path: string, body: Record<string, string>): Promise<AuthResult> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({ error: 'SERVER_ERROR' })) as AuthResult & { error?: string };
  if (!response.ok) throw new Error(data.error || 'SERVER_ERROR');
  return data;
}

async function authResultFromSession(token: string, userId: string, email: string, metadata: Record<string, unknown>) {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data: profile } = await supabase
    .from('profiles')
    .select('username, phone')
    .eq('user_id', userId)
    .maybeSingle();
  return {
    token,
    user: {
      id: userId,
      username: profile?.username || String(metadata.username || email.split('@')[0]),
      phone: profile?.phone || String(metadata.phone || ''),
      email,
    },
  } satisfies AuthResult;
}

function mapSupabaseAuthError(message: string, code?: string) {
  const normalized = message.toLowerCase();
  if (code === 'email_not_confirmed' || normalized.includes('email not confirmed')) return 'EMAIL_NOT_CONFIRMED';
  if (code === 'invalid_credentials' || normalized.includes('invalid login credentials')) return 'INVALID_CREDENTIALS';
  if (normalized.includes('already registered') || normalized.includes('already been registered')) {
    return 'EMAIL_EXISTS';
  }
  if (normalized.includes('password')) return 'INVALID_PASSWORD';
  return 'SERVER_ERROR';
}

export async function loginAccount(account: string, password: string) {
  if (!supabase) return requestAuth('/api/auth/login', { account, password });
  if (!account.includes('@')) throw new Error('INVALID_CREDENTIALS');

  const { data, error } = await supabase.auth.signInWithPassword({ email: account.trim(), password });
  if (error || !data.session || !data.user) throw new Error(mapSupabaseAuthError(error?.message || '', error?.code));
  return authResultFromSession(data.session.access_token, data.user.id, data.user.email || account, data.user.user_metadata);
}

export async function registerAccount(username: string, phone: string, email: string, password: string) {
  if (!supabase) return requestAuth('/api/auth/register', { username, phone, email, password });

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { username: username.trim(), phone: phone.trim() },
      emailRedirectTo: `${window.location.origin}/login`,
    },
  });
  if (error) throw new Error(mapSupabaseAuthError(error.message, error.code));
  if (!data.session || !data.user) throw new Error('EMAIL_CONFIRMATION_REQUIRED');
  return authResultFromSession(data.session.access_token, data.user.id, data.user.email || email, data.user.user_metadata);
}

async function requestAccount<T>(path: string, body: Record<string, string>): Promise<T> {
  const token = localStorage.getItem(SESSION_KEY);
  const response = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({ error: 'SERVER_ERROR' })) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || 'SERVER_ERROR');
  return data;
}

export async function updateAccountProfile(username: string, phone: string, email: string) {
  if (!supabase) return requestAccount<{ user: AuthUser }>('/api/account/profile', { username, phone, email });
  const userId = await currentUserId();
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ username: username.trim(), phone: phone.trim() })
    .eq('user_id', userId);
  if (profileError) {
    if (profileError.code === '23505') throw new Error(profileError.message.includes('phone') ? 'PHONE_EXISTS' : 'USERNAME_EXISTS');
    throw new Error('SERVER_ERROR');
  }
  const { data, error } = await supabase.auth.updateUser({
    email: email.trim(),
    data: { username: username.trim(), phone: phone.trim() },
  });
  if (error || !data.user) throw new Error(mapSupabaseAuthError(error?.message || '', error?.code));
  return { user: { id: userId, username: username.trim(), phone: phone.trim(), email: data.user.email || email.trim() } };
}

export async function updateAccountPassword(currentPassword: string, newPassword: string) {
  if (!supabase) return requestAccount<{ ok: true }>('/api/account/password', { currentPassword, newPassword });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const email = userData.user?.email;
  if (userError || !email) throw new Error('UNAUTHORIZED');
  const { error: loginError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (loginError) throw new Error('CURRENT_PASSWORD_INCORRECT');
  if (currentPassword === newPassword) throw new Error('PASSWORD_UNCHANGED');
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(mapSupabaseAuthError(error.message, error.code));
  return { ok: true as const };
}

export async function logoutAccount() {
  if (isSupabaseConfigured && supabase) await supabase.auth.signOut({ scope: 'local' });
  localStorage.removeItem(SESSION_KEY);
}
