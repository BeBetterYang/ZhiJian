import { createServer } from 'node:http';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('.', import.meta.url));
const dataRoot = join(root, 'server-data');
const accountsRoot = join(dataRoot, 'accounts');
const legacyMapsRoot = join(dataRoot, 'maps');
const legacyUploadsRoot = join(dataRoot, 'uploads');
const usersFile = join(dataRoot, 'users.json');
const distRoot = join(root, 'dist');
const apiOnly = process.argv.includes('--api-only');
const portArg = process.argv.indexOf('--port');
const port = Number(portArg >= 0 ? process.argv[portArg + 1] : apiOnly ? 4174 : process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.json': 'application/json; charset=utf-8' };
const allowedImageTypes = new Map([['image/png', '.png'], ['image/jpeg', '.jpg'], ['image/webp', '.webp'], ['image/gif', '.gif']]);
const scrypt = promisify(scryptCallback);
const sessions = new Map();
let userWriteQueue = Promise.resolve();

await mkdir(accountsRoot, { recursive: true });
await mkdir(legacyUploadsRoot, { recursive: true });

function send(response, status, body, type = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  response.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 50 * 1024 * 1024) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function readBinaryBody(request, maxSize = 15 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxSize) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function safeMapId(pathname) {
  const match = pathname.match(/^\/api\/maps\/([a-zA-Z0-9_-]+)$/);
  return match?.[1] ?? null;
}

async function readUsers() {
  try {
    const users = JSON.parse(await readFile(usersFile, 'utf8'));
    return Array.isArray(users) ? users : [];
  } catch {
    return [];
  }
}

function publicUser(user) {
  return { id: user.id, username: user.username, phone: user.phone, email: user.email };
}

function createSession(user) {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, user.id);
  return { token, user: publicUser(user) };
}

function authenticatedUserId(request) {
  const authorization = String(request.headers.authorization || '');
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  return sessions.get(token) || null;
}

function storageOwnerId(request) {
  const authorization = String(request.headers.authorization || '');
  if (authorization === 'Bearer demo') return 'demo';
  return authenticatedUserId(request);
}

async function pathExists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function migrateLegacyFiles(ownerId, accountRoot, accountMaps) {
  if (ownerId === 'demo' || await pathExists(join(accountRoot, 'library.json'))) return;
  const users = await readUsers();
  const earliestUser = [...users].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
  if (earliestUser?.id !== ownerId) return;
  const legacyLibrary = join(dataRoot, 'library.json');
  if (await pathExists(legacyLibrary)) await cp(legacyLibrary, join(accountRoot, 'library.json'));
  if (await pathExists(legacyMapsRoot)) await cp(legacyMapsRoot, accountMaps, { recursive: true });
}

async function accountStorage(request) {
  const ownerId = storageOwnerId(request);
  if (!ownerId) return null;
  const root = join(accountsRoot, ownerId);
  const maps = join(root, 'maps');
  const uploads = join(root, 'uploads');
  await Promise.all([mkdir(maps, { recursive: true }), mkdir(uploads, { recursive: true })]);
  await migrateLegacyFiles(ownerId, root, maps);
  return { ownerId, root, maps, uploads };
}

function normalizePhone(value) {
  return String(value || '').replace(/[\s-]/g, '');
}

async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, salt, 64);
  return { salt, hash: Buffer.from(derived).toString('hex') };
}

async function passwordMatches(password, user) {
  const derived = await scrypt(password, user.passwordSalt, 64);
  const expected = Buffer.from(user.passwordHash, 'hex');
  const actual = Buffer.from(derived);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function handleRegister(request, response) {
  const body = await readBody(request);
  const username = String(body.username || '').trim();
  const phone = normalizePhone(body.phone);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!/^[\p{L}\p{N}_-]{2,30}$/u.test(username)) return send(response, 400, { error: 'INVALID_USERNAME' });
  if (!/^1[3-9]\d{9}$/.test(phone)) return send(response, 400, { error: 'INVALID_PHONE' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(response, 400, { error: 'INVALID_EMAIL' });
  if (password.length < 8 || password.length > 128) return send(response, 400, { error: 'INVALID_PASSWORD' });

  const users = await readUsers();
  const normalizedUsername = username.toLocaleLowerCase();
  if (users.some((user) => user.normalizedUsername === normalizedUsername)) return send(response, 409, { error: 'USERNAME_EXISTS' });
  if (users.some((user) => user.phone === phone)) return send(response, 409, { error: 'PHONE_EXISTS' });
  if (users.some((user) => user.email === email)) return send(response, 409, { error: 'EMAIL_EXISTS' });

  const passwordData = await hashPassword(password);
  const user = {
    id: randomUUID(), username, normalizedUsername, phone, email,
    passwordSalt: passwordData.salt, passwordHash: passwordData.hash,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await writeFile(usersFile, JSON.stringify(users, null, 2), 'utf8');
  return send(response, 201, createSession(user));
}

async function handleLogin(request, response) {
  const body = await readBody(request);
  const account = String(body.account || '').trim();
  const password = String(body.password || '');
  if (!account || !password) return send(response, 400, { error: 'MISSING_CREDENTIALS' });
  const normalizedAccount = account.toLocaleLowerCase();
  const phone = normalizePhone(account);
  const users = await readUsers();
  const user = users.find((candidate) => candidate.normalizedUsername === normalizedAccount
    || candidate.email === normalizedAccount || candidate.phone === phone);
  if (!user || !(await passwordMatches(password, user))) return send(response, 401, { error: 'INVALID_CREDENTIALS' });
  return send(response, 200, createSession(user));
}

async function handleProfileUpdate(request, response) {
  const userId = authenticatedUserId(request);
  if (!userId) return send(response, 401, { error: 'UNAUTHORIZED' });
  const body = await readBody(request);
  const username = String(body.username || '').trim();
  const phone = normalizePhone(body.phone);
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[\p{L}\p{N}_-]{2,30}$/u.test(username)) return send(response, 400, { error: 'INVALID_USERNAME' });
  if (!/^1[3-9]\d{9}$/.test(phone)) return send(response, 400, { error: 'INVALID_PHONE' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(response, 400, { error: 'INVALID_EMAIL' });
  const users = await readUsers();
  const user = users.find((candidate) => candidate.id === userId);
  if (!user) return send(response, 401, { error: 'UNAUTHORIZED' });
  const normalizedUsername = username.toLocaleLowerCase();
  if (users.some((candidate) => candidate.id !== userId && candidate.normalizedUsername === normalizedUsername)) return send(response, 409, { error: 'USERNAME_EXISTS' });
  if (users.some((candidate) => candidate.id !== userId && candidate.phone === phone)) return send(response, 409, { error: 'PHONE_EXISTS' });
  if (users.some((candidate) => candidate.id !== userId && candidate.email === email)) return send(response, 409, { error: 'EMAIL_EXISTS' });
  Object.assign(user, { username, normalizedUsername, phone, email, updatedAt: new Date().toISOString() });
  await writeFile(usersFile, JSON.stringify(users, null, 2), 'utf8');
  return send(response, 200, { user: publicUser(user) });
}

async function handlePasswordUpdate(request, response) {
  const userId = authenticatedUserId(request);
  if (!userId) return send(response, 401, { error: 'UNAUTHORIZED' });
  const body = await readBody(request);
  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');
  if (newPassword.length < 8 || newPassword.length > 128) return send(response, 400, { error: 'INVALID_PASSWORD' });
  const users = await readUsers();
  const user = users.find((candidate) => candidate.id === userId);
  if (!user) return send(response, 401, { error: 'UNAUTHORIZED' });
  if (!(await passwordMatches(currentPassword, user))) return send(response, 400, { error: 'CURRENT_PASSWORD_INCORRECT' });
  if (await passwordMatches(newPassword, user)) return send(response, 400, { error: 'PASSWORD_UNCHANGED' });
  const passwordData = await hashPassword(newPassword);
  user.passwordSalt = passwordData.salt;
  user.passwordHash = passwordData.hash;
  user.updatedAt = new Date().toISOString();
  await writeFile(usersFile, JSON.stringify(users, null, 2), 'utf8');
  return send(response, 200, { ok: true });
}

async function handleApi(request, response, url) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (request.method === 'OPTIONS') return send(response, 204, '');

  if (url.pathname === '/api/health' && request.method === 'GET') return send(response, 200, { ok: true });
  if (url.pathname === '/api/auth/register' && request.method === 'POST') {
    const task = userWriteQueue.then(() => handleRegister(request, response));
    userWriteQueue = task.catch(() => undefined);
    return task;
  }
  if (url.pathname === '/api/auth/login' && request.method === 'POST') return handleLogin(request, response);
  if (url.pathname === '/api/account/profile' && request.method === 'PUT') {
    const task = userWriteQueue.then(() => handleProfileUpdate(request, response));
    userWriteQueue = task.catch(() => undefined);
    return task;
  }
  if (url.pathname === '/api/account/password' && request.method === 'PUT') {
    const task = userWriteQueue.then(() => handlePasswordUpdate(request, response));
    userWriteQueue = task.catch(() => undefined);
    return task;
  }
  if (url.pathname === '/api/uploads' && request.method === 'POST') {
    const storage = await accountStorage(request);
    if (!storage) return send(response, 401, { error: 'UNAUTHORIZED' });
    const contentType = String(request.headers['content-type'] || '').split(';')[0].toLowerCase();
    const extension = allowedImageTypes.get(contentType);
    if (!extension) return send(response, 415, { error: 'UNSUPPORTED_IMAGE_TYPE' });
    const content = await readBinaryBody(request);
    if (!content.length) return send(response, 400, { error: 'EMPTY_FILE' });
    const fileName = `${Date.now()}-${randomUUID()}${extension}`;
    await writeFile(join(storage.uploads, fileName), content);
    return send(response, 201, { url: `/uploads/${storage.ownerId}/${fileName}` });
  }
  if (url.pathname === '/api/library') {
    const storage = await accountStorage(request);
    if (!storage) return send(response, 401, { error: 'UNAUTHORIZED' });
    const file = join(storage.root, 'library.json');
    if (request.method === 'GET') {
      try { return send(response, 200, await readFile(file, 'utf8')); } catch { return send(response, 404, { error: 'NOT_FOUND' }); }
    }
    if (request.method === 'PUT') {
      await writeFile(file, JSON.stringify(await readBody(request), null, 2), 'utf8');
      return send(response, 200, { ok: true });
    }
  }

  const mapId = safeMapId(url.pathname);
  if (mapId) {
    const storage = await accountStorage(request);
    if (!storage) return send(response, 401, { error: 'UNAUTHORIZED' });
    const file = join(storage.maps, `${mapId}.json`);
    if (request.method === 'GET') {
      try { return send(response, 200, await readFile(file, 'utf8')); } catch { return send(response, 404, { error: 'NOT_FOUND' }); }
    }
    if (request.method === 'PUT') {
      await writeFile(file, JSON.stringify(await readBody(request)), 'utf8');
      return send(response, 200, { ok: true });
    }
    if (request.method === 'DELETE') {
      await rm(file, { force: true });
      return send(response, 200, { ok: true });
    }
  }
  return send(response, 404, { error: 'NOT_FOUND' });
}

async function serveUpload(response, pathname) {
  const scopedMatch = pathname.match(/^\/uploads\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9.-]+)$/);
  const legacyMatch = pathname.match(/^\/uploads\/([a-zA-Z0-9.-]+)$/);
  if (!scopedMatch && !legacyMatch) return send(response, 404, { error: 'NOT_FOUND' });
  const file = scopedMatch
    ? join(accountsRoot, scopedMatch[1], 'uploads', scopedMatch[2])
    : join(legacyUploadsRoot, legacyMatch[1]);
  try {
    const content = await readFile(file);
    response.writeHead(200, {
      'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': content.length,
    });
    return response.end(content);
  } catch {
    return send(response, 404, { error: 'NOT_FOUND' });
  }
}

async function serveStatic(response, pathname) {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const candidate = resolve(distRoot, requested);
  const safeCandidate = candidate.startsWith(resolve(distRoot)) ? candidate : join(distRoot, 'index.html');
  let file = safeCandidate;
  try { if (!(await stat(file)).isFile()) file = join(distRoot, 'index.html'); } catch { file = join(distRoot, 'index.html'); }
  try {
    const content = await readFile(file);
    return send(response, 200, content, mime[extname(file)] || 'application/octet-stream');
  } catch {
    return send(response, 503, '请先运行 npm run build', 'text/plain; charset=utf-8');
  }
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url);
    if (url.pathname.startsWith('/uploads/')) return await serveUpload(response, url.pathname);
    if (apiOnly) return send(response, 404, { error: 'API_ONLY' });
    return await serveStatic(response, url.pathname);
  } catch (error) {
    const status = error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE' ? 413 : 500;
    return send(response, status, { error: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'SERVER_ERROR' });
  }
}).listen(port, '0.0.0.0', () => console.log(`枝间服务已启动：http://0.0.0.0:${port}`));
