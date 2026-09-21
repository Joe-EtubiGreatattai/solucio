# Solucio Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Solucio, a MERN app for a hospital to record income (with printable PDF receipts) and expenses, and report on both.

**Architecture:** One repo with `server/` (Express 4 + Mongoose, CommonJS, JWT auth, role guards) and `client/` (React + Vite, plain JS). Money is stored as integer kobo. Records are never edited or deleted, only voided. Reports are Mongo aggregations over non-voided records.

**Tech Stack:** Node, Express 4, Mongoose, Zod 3, bcryptjs, jsonwebtoken, PDFKit, ExcelJS, Jest + Supertest + mongodb-memory-server, pdf-parse 1.1.1 (tests), React, react-router-dom, Recharts, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-21-solucio-payments-design.md`

## Global Constraints

- Amounts are integer minor units (kobo); never floats. Display currency is Naira (₦) in the UI and Excel; PDFs use the text `NGN` (PDFKit's built-in fonts have no ₦ glyph).
- Timezone is `Africa/Lagos` (UTC+1, no DST). Dates cross the API as `YYYY-MM-DD` strings; day ranges are inclusive. UI dates display day-first (`dd/mm/yyyy`).
- No patient data anywhere. Receipts have no payer name. Receipts show "Recorded by".
- Income has no categories. Expense categories are exactly the tree in the spec (section 5), validated server-side.
- Income and expense records have no update or delete endpoints; correction is void-with-reason. Voided rows stay in lists and are excluded from all totals.
- Receipt numbers: `RCP-YYYY-NNNN`, sequential per year, never reused.
- Roles: `cashier`, `accountant`, `admin`. Income routes: all three. Expense and report routes: accountant, admin. Users and account writes: admin. Every route calls `authenticate` then `requireRole` BEFORE `validate`.
- API is mounted under `/api`. JSON errors look like `{ message, fields? }`.
- Client uses `_id` for record ids.
- Every commit message ends with a second `-m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"`.
- Tests: server `cd server && npm test -- <file>`; client `cd client && npx vitest run <file>`.

---

### Task 1: Server scaffold

**Files:**
- Create: `.gitignore`, `server/package.json` (via npm), `server/.env.example`, `server/jest.config.js`
- Create: `server/src/app.js`, `server/src/server.js`, `server/src/routes/index.js`
- Create: `server/src/utils/AppError.js`, `server/src/utils/asyncHandler.js`
- Create: `server/src/middleware/errorHandler.js`, `server/src/middleware/validate.js`
- Test: `server/tests/setup.js`, `server/tests/health.test.js`

**Interfaces:**
- Produces: `AppError(status, message, fields?)`; `asyncHandler(fn)`; `validate(schema, source='body')` sets `req.validated[source]`; `routes/index.js` router mounted at `/api` (later tasks add `router.use(...)` lines); `app` exported from `src/app.js` without listening.

- [ ] **Step 1: Init repo and install**

```bash
cd "/Users/mac/Documents/Solucio recipt and payment"
git init
printf "node_modules\n.env\ndist\n*.log\n" > .gitignore
mkdir -p server/src/{config,middleware,models,routes,services,utils} server/tests server/scripts
cd server && npm init -y
npm install express@4 mongoose cors helmet dotenv jsonwebtoken bcryptjs zod@3 express-rate-limit@7 pdfkit exceljs
npm install -D jest supertest mongodb-memory-server pdf-parse@1.1.1
npm pkg set main=src/server.js scripts.start="node src/server.js" scripts.dev="node --watch src/server.js" scripts.test="jest --runInBand" scripts.seed:admin="node scripts/seed-admin.js"
```

- [ ] **Step 2: Write config and test setup**

`server/jest.config.js`:
```js
module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 60000,
};
```

`server/.env.example`:
```
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/solucio
JWT_SECRET=change-me
CLIENT_ORIGIN=http://localhost:5173
HOSPITAL_NAME=Hospital Name
HOSPITAL_LOGO_PATH=
ADMIN_NAME=Administrator
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me-now
```

`server/tests/setup.js`:
```js
process.env.JWT_SECRET = 'test-secret';
process.env.HOSPITAL_NAME = 'Test Hospital';
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterEach(async () => {
  const cols = mongoose.connection.collections;
  for (const key of Object.keys(cols)) await cols[key].deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
```

- [ ] **Step 3: Write the failing test**

`server/tests/health.test.js`:
```js
const request = require('supertest');
const app = require('../src/app');

test('GET /api/health returns ok', async () => {
  const res = await request(app).get('/api/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true });
});

test('unknown route returns a JSON 404', async () => {
  const res = await request(app).get('/api/nope');
  expect(res.status).toBe(404);
  expect(res.body.message).toBe('Not found');
});

test('malformed JSON returns 400', async () => {
  const res = await request(app).post('/api/health').set('Content-Type', 'application/json').send('{bad');
  expect(res.status).toBe(400);
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `cd server && npm test -- tests/health.test.js`
Expected: FAIL, `Cannot find module '../src/app'`.

- [ ] **Step 5: Implement**

`server/src/utils/AppError.js`:
```js
class AppError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}
module.exports = AppError;
```

`server/src/utils/asyncHandler.js`:
```js
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
```

`server/src/middleware/validate.js`:
```js
module.exports = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) return next(result.error);
  req.validated = { ...(req.validated || {}), [source]: result.data };
  next();
};
```

`server/src/middleware/errorHandler.js`:
```js
const { ZodError } = require('zod');
const AppError = require('../utils/AppError');

function notFound(req, res) {
  res.status(404).json({ message: 'Not found' });
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof ZodError) {
    const fields = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      if (!(key in fields)) fields[key] = issue.message;
    }
    return res.status(400).json({ message: 'Please fix the highlighted fields', fields });
  }
  if (err instanceof AppError) return res.status(err.status).json({ message: err.message, fields: err.fields });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON' });
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid id' });
  console.error(err);
  res.status(500).json({ message: 'Something went wrong' });
}

module.exports = { notFound, errorHandler };
```

`server/src/routes/index.js`:
```js
const router = require('express').Router();

router.get('/health', (req, res) => res.json({ ok: true }));

module.exports = router;
```

`server/src/app.js`:
```js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
```

`server/src/server.js`:
```js
require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

if (!process.env.JWT_SECRET || !process.env.MONGODB_URI) {
  console.error('JWT_SECRET and MONGODB_URI must be set (see .env.example)');
  process.exit(1);
}
const port = process.env.PORT || 5000;
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => app.listen(port, () => console.log(`Solucio API on :${port}`)))
  .catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd server && npm test -- tests/health.test.js`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
cd "/Users/mac/Documents/Solucio recipt and payment"
git add -A
git commit -m "chore: scaffold server, add spec and plan" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Users and authentication

**Files:**
- Create: `server/src/models/User.js`, `server/src/middleware/auth.js`, `server/src/routes/auth.js`, `server/scripts/seed-admin.js`
- Modify: `server/src/routes/index.js`
- Test: `server/tests/helpers.js`, `server/tests/auth.test.js`

**Interfaces:**
- Consumes: `AppError`, `asyncHandler`, `validate`.
- Produces: `User` model (`ROLES` also at `User.ROLES`); `authenticate` (sets `req.user`, a User document, rejects inactive users); `requireRole(...roles)`; test helpers `createUser(role, overrides) -> {user, token}` and `auth(token) -> headers`.

- [ ] **Step 1: Write helpers and failing tests**

`server/tests/helpers.js`:
```js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');

let n = 0;
async function createUser(role = 'admin', overrides = {}) {
  n += 1;
  const user = await User.create({
    name: `${role} ${n}`,
    email: `${role}${n}@test.com`,
    passwordHash: await bcrypt.hash('password123', 4),
    role,
    ...overrides,
  });
  const token = jwt.sign({ sub: user.id, role }, process.env.JWT_SECRET);
  return { user, token };
}
const auth = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = { createUser, auth };
```

`server/tests/auth.test.js`:
```js
const request = require('supertest');
const app = require('../src/app');
const { createUser, auth } = require('./helpers');

test('login returns a token and never the password hash', async () => {
  const { user } = await createUser('cashier');
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'password123' });
  expect(res.status).toBe(200);
  expect(res.body.token).toEqual(expect.any(String));
  expect(res.body.user.role).toBe('cashier');
  expect(res.body.user.passwordHash).toBeUndefined();
});

test('wrong password is rejected with 401', async () => {
  const { user } = await createUser('cashier');
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'nope' });
  expect(res.status).toBe(401);
});

test('deactivated user cannot log in', async () => {
  const { user } = await createUser('cashier', { active: false });
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'password123' });
  expect(res.status).toBe(401);
});

test('deactivated user is rejected even with a valid token', async () => {
  const { user, token } = await createUser('cashier');
  user.active = false;
  await user.save();
  const res = await request(app).get('/api/auth/me').set(auth(token));
  expect(res.status).toBe(401);
});

test('/me requires a token and returns the user', async () => {
  expect((await request(app).get('/api/auth/me')).status).toBe(401);
  const { token } = await createUser('accountant');
  const res = await request(app).get('/api/auth/me').set(auth(token));
  expect(res.status).toBe(200);
  expect(res.body.user.role).toBe('accountant');
});

test('login validates input', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
  expect(res.status).toBe(400);
  expect(res.body.fields.email).toBeDefined();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npm test -- tests/auth.test.js`
Expected: FAIL, `Cannot find module '../src/models/User'`.

- [ ] **Step 3: Implement**

`server/src/models/User.js`:
```js
const mongoose = require('mongoose');

const ROLES = ['cashier', 'accountant', 'admin'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
```

`server/src/middleware/auth.js`:
```js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');

async function authenticate(req, res, next) {
  try {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new AppError(401, 'Authentication required');
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      throw new AppError(401, 'Invalid or expired token');
    }
    const user = await User.findById(payload.sub);
    if (!user || !user.active) throw new AppError(401, 'Account not available');
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : next(new AppError(403, 'You are not allowed to do that'));

module.exports = { authenticate, requireRole };
```

`server/src/routes/auth.js`:
```js
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skip: () => process.env.NODE_ENV === 'test',
  message: { message: 'Too many login attempts. Try again later.' },
});

router.post('/login', limiter, validate(loginSchema), asyncHandler(async (req, res) => {
  const { email, password } = req.validated.body;
  const user = await User.findOne({ email: email.toLowerCase() });
  const ok = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) throw new AppError(401, 'Invalid email or password');
  const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user });
}));

router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

module.exports = router;
```

Modify `server/src/routes/index.js`, adding above `module.exports`:
```js
router.use('/auth', require('./auth'));
```

`server/scripts/seed-admin.js`:
```js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');

(async () => {
  const { ADMIN_NAME = 'Administrator', ADMIN_EMAIL, ADMIN_PASSWORD, MONGODB_URI } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !MONGODB_URI) {
    console.error('Set ADMIN_EMAIL, ADMIN_PASSWORD and MONGODB_URI');
    process.exit(1);
  }
  await mongoose.connect(MONGODB_URI);
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await User.findOneAndUpdate(
    { email: ADMIN_EMAIL.toLowerCase() },
    { name: ADMIN_NAME, passwordHash, role: 'admin', active: true },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log(`Admin ready: ${ADMIN_EMAIL}`);
  await mongoose.disconnect();
})();
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && npm test -- tests/auth.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: users, JWT auth, role guard, admin seed script" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Dates, shared schemas, categories

**Files:**
- Create: `server/src/utils/dates.js`, `server/src/utils/schemas.js`, `server/src/config/categories.js`, `server/src/routes/categories.js`
- Modify: `server/src/routes/index.js`
- Test: `server/tests/dates.test.js`, `server/tests/categories.test.js`

**Interfaces:**
- Produces (`utils/dates.js`): `parseLagosDate(str) -> Date` (Lagos midnight as a UTC instant; throws on invalid), `dayAfter(date) -> Date`, `lagosToday(now=Date.now()) -> 'YYYY-MM-DD'`, `isFuture(str, now=Date.now()) -> boolean`, `formatLagosDate(date) -> 'dd/mm/yyyy'`.
- Produces (`utils/schemas.js`): Zod `isoDate`, `recordDate` (not in future), `amount` (positive int), `objectId`, `voidBody` (`{reason}` min 3 chars), `listQueryShape` (`from,to,accountId,status,page,limit`).
- Produces (`config/categories.js`): `CATEGORIES`, `listCategories() -> [{type, groups:[{name, items:[]}]}]`, `isValidCategory(type, group, item) -> boolean`.

- [ ] **Step 1: Write failing tests**

`server/tests/dates.test.js`:
```js
const { parseLagosDate, dayAfter, lagosToday, isFuture, formatLagosDate } = require('../src/utils/dates');

test('parseLagosDate returns Lagos midnight as a UTC instant', () => {
  expect(parseLagosDate('2026-09-21').toISOString()).toBe('2026-09-20T23:00:00.000Z');
});

test('parseLagosDate rejects bad dates', () => {
  expect(() => parseLagosDate('2026-02-30')).toThrow();
  expect(() => parseLagosDate('21/09/2026')).toThrow();
});

test('dayAfter adds 24 hours', () => {
  expect(dayAfter(parseLagosDate('2026-09-21')).toISOString()).toBe('2026-09-21T23:00:00.000Z');
});

test('lagosToday uses the Lagos day near UTC midnight', () => {
  expect(lagosToday(Date.parse('2026-09-20T23:30:00Z'))).toBe('2026-09-21');
  expect(lagosToday(Date.parse('2026-09-20T22:30:00Z'))).toBe('2026-09-20');
});

test('isFuture compares against the Lagos day', () => {
  const now = Date.parse('2026-09-20T23:30:00Z'); // Lagos: 21 Sep
  expect(isFuture('2026-09-21', now)).toBe(false);
  expect(isFuture('2026-09-22', now)).toBe(true);
});

test('formatLagosDate is day-first in Lagos time', () => {
  expect(formatLagosDate(new Date('2026-09-20T23:00:00Z'))).toBe('21/09/2026');
});
```

`server/tests/categories.test.js`:
```js
const request = require('supertest');
const app = require('../src/app');
const { listCategories, isValidCategory } = require('../src/config/categories');
const { createUser, auth } = require('./helpers');

test('tree has Recurrent and Capital in order', () => {
  expect(listCategories().map((c) => c.type)).toEqual(['Recurrent', 'Capital']);
});

test('isValidCategory accepts real paths and rejects invented ones', () => {
  expect(isValidCategory('Recurrent', 'Hospital Consumables', 'Oxygen')).toBe(true);
  expect(isValidCategory('Recurrent', 'Staff Wages', null)).toBe(true);
  expect(isValidCategory('Recurrent', 'Staff Wages', 'Bonus')).toBe(false);
  expect(isValidCategory('Recurrent', 'Hospital Consumables', null)).toBe(false);
  expect(isValidCategory('Capital', 'Structural', 'Nursing')).toBe(false);
  expect(isValidCategory('Capital', 'Equipment', 'Nursing')).toBe(true);
  expect(isValidCategory('constructor', 'x', null)).toBe(false);
});

test('GET /api/categories needs auth and returns the tree', async () => {
  expect((await request(app).get('/api/categories')).status).toBe(401);
  const { token } = await createUser('cashier');
  const res = await request(app).get('/api/categories').set(auth(token));
  expect(res.status).toBe(200);
  expect(res.body[1].groups.find((g) => g.name === 'Equipment').items).toContain('Ophthalmology');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd server && npm test -- tests/dates.test.js tests/categories.test.js`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`server/src/utils/dates.js`:
```js
const DAY_MS = 24 * 60 * 60 * 1000;
const LAGOS_OFFSET_MS = 60 * 60 * 1000; // UTC+1, no DST

function parseLagosDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) throw new Error('Invalid date');
  const d = new Date(`${str}T00:00:00+01:00`);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
  return d;
}
const dayAfter = (d) => new Date(d.getTime() + DAY_MS);
const lagosToday = (now = Date.now()) => new Date(now + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
const isFuture = (str, now = Date.now()) => str > lagosToday(now);
function formatLagosDate(date) {
  const [y, m, d] = new Date(date.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

module.exports = { parseLagosDate, dayAfter, lagosToday, isFuture, formatLagosDate };
```

`server/src/utils/schemas.js`:
```js
const { z } = require('zod');
const { parseLagosDate, isFuture } = require('./dates');

const validDate = (s) => {
  try { parseLagosDate(s); return true; } catch { return false; }
};
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD').refine(validDate, 'Invalid date');
const recordDate = isoDate.refine((s) => !isFuture(s), 'Date cannot be in the future');
const amount = z
  .number({ invalid_type_error: 'Amount must be a number', required_error: 'Amount is required' })
  .int('Amount must be in whole kobo')
  .positive('Amount must be greater than zero');
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const voidBody = z.object({ reason: z.string().trim().min(3, 'Give a reason for voiding') });
const listQueryShape = {
  from: isoDate.optional(),
  to: isoDate.optional(),
  accountId: objectId.optional(),
  status: z.enum(['all', 'active', 'voided']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
};

module.exports = { isoDate, recordDate, amount, objectId, voidBody, listQueryShape };
```

`server/src/config/categories.js`:
```js
// Empty array = leaf group with no items.
const CATEGORIES = {
  Recurrent: {
    'Hospital Consumables': ['Oxygen', 'Toiletries & Stationeries', 'Laboratory Consumables', 'Theatre Consumables', 'Drugs', 'Others'],
    'Servicing & Maintenance': ['Electricity', 'Data & Airtime', 'Plumbing', 'Electrical', 'Fuel', 'Gas', 'Other T.P', 'Others'],
    'Outsource Services': ['Specialist Consultation', 'Laboratory', 'Opticals', 'Others'],
    'Staff Wages': [],
    'Tax and Dues': ['PAYE', 'WHT', 'Others'],
    Rents: [],
    Charity: [],
  },
  Capital: {
    Structural: ['Furniture', 'Electricals', 'Plumbing', 'Building'],
    Equipment: ['Nursing', 'Laboratory', 'Radiology', 'Theatre', 'Ophthalmology'],
  },
};

const listCategories = () =>
  Object.entries(CATEGORIES).map(([type, groups]) => ({
    type,
    groups: Object.entries(groups).map(([name, items]) => ({ name, items })),
  }));

function isValidCategory(type, group, item) {
  const groups = Object.hasOwn(CATEGORIES, type) ? CATEGORIES[type] : null;
  const items = groups && Object.hasOwn(groups, group) ? groups[group] : null;
  if (!items) return false;
  return items.length === 0 ? !item : items.includes(item);
}

module.exports = { CATEGORIES, listCategories, isValidCategory };
```

`server/src/routes/categories.js`:
```js
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { listCategories } = require('../config/categories');

router.get('/', authenticate, (req, res) => res.json(listCategories()));

module.exports = router;
```

Modify `server/src/routes/index.js`, add: `router.use('/categories', require('./categories'));`

- [ ] **Step 4: Run to verify they pass**

Run: `cd server && npm test -- tests/dates.test.js tests/categories.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Lagos date helpers, shared schemas, expense category tree" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 4: Accounts

**Files:**
- Create: `server/src/models/Account.js`, `server/src/routes/accounts.js`
- Modify: `server/src/routes/index.js`, `server/tests/helpers.js`
- Test: `server/tests/accounts.test.js`

**Interfaces:**
- Consumes: `authenticate`, `requireRole`, `validate`, `objectId`.
- Produces: `Account` model `{name, type:'bank'|'cash', bankName, accountNumber, openingBalance (kobo), active}`; `GET /api/accounts[?active=true]` returns an array; `POST /api/accounts` (admin); `PATCH /api/accounts/:id` (admin; `type` is immutable); test helper `makeAccount(overrides) -> Account doc`.

- [ ] **Step 1: Add helper and write failing tests**

Modify `server/tests/helpers.js`: add `const Account = require('../src/models/Account');` at the top, then before `module.exports`:
```js
async function makeAccount(overrides = {}) {
  return Account.create({
    name: 'Main Account', type: 'bank', bankName: 'GTBank', accountNumber: '0123456789', openingBalance: 0, ...overrides,
  });
}
```
and export it: `module.exports = { createUser, auth, makeAccount };`

`server/tests/accounts.test.js`:
```js
const request = require('supertest');
const app = require('../src/app');
const { createUser, auth, makeAccount } = require('./helpers');

test('admin creates a bank account with an opening balance', async () => {
  const { token } = await createUser('admin');
  const res = await request(app).post('/api/accounts').set(auth(token)).send({
    name: 'Ops', type: 'bank', bankName: 'Zenith', accountNumber: '1234567890', openingBalance: 500000,
  });
  expect(res.status).toBe(201);
  expect(res.body.openingBalance).toBe(500000);
  expect(res.body.active).toBe(true);
});

test('cash accounts need no bank details', async () => {
  const { token } = await createUser('admin');
  const res = await request(app).post('/api/accounts').set(auth(token)).send({ name: 'Petty cash', type: 'cash' });
  expect(res.status).toBe(201);
  expect(res.body.openingBalance).toBe(0);
});

test('bank accounts without bank name/number are rejected', async () => {
  const { token } = await createUser('admin');
  const res = await request(app).post('/api/accounts').set(auth(token)).send({ name: 'X', type: 'bank' });
  expect(res.status).toBe(400);
  expect(res.body.fields.bankName).toBeDefined();
});

test('non-admins cannot create accounts but can list them', async () => {
  const { token } = await createUser('cashier');
  await makeAccount();
  expect((await request(app).post('/api/accounts').set(auth(token)).send({ name: 'X', type: 'cash' })).status).toBe(403);
  const list = await request(app).get('/api/accounts').set(auth(token));
  expect(list.status).toBe(200);
  expect(list.body).toHaveLength(1);
});

test('?active=true hides deactivated accounts', async () => {
  const { token } = await createUser('cashier');
  await makeAccount({ name: 'A' });
  await makeAccount({ name: 'B', active: false });
  const res = await request(app).get('/api/accounts?active=true').set(auth(token));
  expect(res.body.map((a) => a.name)).toEqual(['A']);
});

test('admin can deactivate and edit, but type is immutable', async () => {
  const { token } = await createUser('admin');
  const acc = await makeAccount();
  const res = await request(app).patch(`/api/accounts/${acc.id}`).set(auth(token)).send({ active: false, name: 'Renamed', type: 'cash' });
  expect(res.status).toBe(200);
  expect(res.body.active).toBe(false);
  expect(res.body.name).toBe('Renamed');
  expect(res.body.type).toBe('bank');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npm test -- tests/accounts.test.js`
Expected: FAIL, `Cannot find module '../src/models/Account'`.

- [ ] **Step 3: Implement**

`server/src/models/Account.js`:
```js
const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['bank', 'cash'], required: true },
    bankName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    openingBalance: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Account', accountSchema);
```

`server/src/routes/accounts.js`:
```js
const router = require('express').Router();
const { z } = require('zod');
const Account = require('../models/Account');
const { authenticate, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

const number = z.string().trim().regex(/^\d{4,20}$/, 'Account number must be 4-20 digits');

const createSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    type: z.enum(['bank', 'cash']),
    bankName: z.string().trim().optional(),
    accountNumber: number.optional(),
    openingBalance: z.number().int().min(0).default(0),
  })
  .refine((d) => d.type === 'cash' || (d.bankName && d.accountNumber), {
    message: 'Bank accounts need a bank name and account number',
    path: ['bankName'],
  });

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  bankName: z.string().trim().optional(),
  accountNumber: number.optional(),
  openingBalance: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const filter = req.query.active === 'true' ? { active: true } : {};
  res.json(await Account.find(filter).sort('name'));
}));

router.post('/', requireRole('admin'), validate(createSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await Account.create(req.validated.body));
}));

router.patch('/:id', requireRole('admin'), validate(updateSchema), asyncHandler(async (req, res) => {
  const acc = await Account.findByIdAndUpdate(req.params.id, { $set: req.validated.body }, { new: true, runValidators: true });
  if (!acc) throw new AppError(404, 'Account not found');
  res.json(acc);
}));

module.exports = router;
```

Modify `server/src/routes/index.js`, add: `router.use('/accounts', require('./accounts'));`

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && npm test -- tests/accounts.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: accounts with opening balance" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Income, receipt numbers, voiding, audit log

**Files:**
- Create: `server/src/models/{Income,AuditLog,Counter}.js`, `server/src/services/{audit,receiptNumber,voidRecord}.js`, `server/src/utils/filters.js`, `server/src/routes/incomes.js`
- Modify: `server/src/routes/index.js`
- Test: `server/tests/income.test.js`

**Interfaces:**
- Consumes: `recordDate`, `amount`, `objectId`, `voidBody`, `listQueryShape`, `parseLagosDate`, `dayAfter`, `Account`.
- Produces: `Income` model; `logAudit({actor, action, targetModel, targetId, details})`; `nextReceiptNumber(yearString) -> 'RCP-YYYY-NNNN'`; `voidRecord(Model, id, reason, user, action) -> doc` (404 if missing, 409 if already void); `dateFilter(from, to) -> {date:{...}}|{}`; `statusFilter(status)`; routes `POST /api/incomes` (body `{amount,date,method,accountId}`), `GET /api/incomes` (returns `{items,total,page,limit}`, items populated with `account` and `recordedBy.name`), `POST /api/incomes/:id/void`.

- [ ] **Step 1: Write failing tests**

`server/tests/income.test.js`:
```js
const request = require('supertest');
const app = require('../src/app');
const AuditLog = require('../src/models/AuditLog');
const { createUser, auth, makeAccount } = require('./helpers');

let admin, cashier, account;
beforeEach(async () => {
  admin = await createUser('admin');
  cashier = await createUser('cashier');
  account = await makeAccount();
});
const body = (o = {}) => ({ amount: 150000, date: '2026-01-15', method: 'transfer', accountId: account.id, ...o });
const post = (token, o) => request(app).post('/api/incomes').set(auth(token)).send(body(o));

test('cashier records income and gets a receipt number', async () => {
  const res = await post(cashier.token);
  expect(res.status).toBe(201);
  expect(res.body.receiptNumber).toBe('RCP-2026-0001');
  expect(res.body.amount).toBe(150000);
  expect(res.body.recordedBy).toBe(cashier.user.id);
  expect(res.body.voided).toBe(false);
});

test('rejects future dates, non-integer and zero amounts', async () => {
  expect((await post(cashier.token, { date: '2999-01-01' })).body.fields.date).toBeDefined();
  expect((await post(cashier.token, { amount: 10.5 })).body.fields.amount).toBeDefined();
  expect((await post(cashier.token, { amount: 0 })).status).toBe(400);
});

test('rejects unknown method and inactive accounts', async () => {
  expect((await post(cashier.token, { method: 'cheque' })).status).toBe(400);
  account.active = false;
  await account.save();
  const res = await post(cashier.token);
  expect(res.status).toBe(400);
  expect(res.body.fields.accountId).toBeDefined();
});

test('20 concurrent creates get unique, gap-free receipt numbers', async () => {
  const results = await Promise.all(Array.from({ length: 20 }, () => post(cashier.token)));
  expect(results.every((r) => r.status === 201)).toBe(true);
  const nums = results.map((r) => r.body.receiptNumber).sort();
  expect(new Set(nums).size).toBe(20);
  expect(nums[0]).toBe('RCP-2026-0001');
  expect(nums[19]).toBe('RCP-2026-0020');
});

test('numbering is per year', async () => {
  expect((await post(cashier.token, { date: '2025-12-31' })).body.receiptNumber).toBe('RCP-2025-0001');
  expect((await post(cashier.token, { date: '2026-01-01' })).body.receiptNumber).toBe('RCP-2026-0001');
});

test('list filters by date and status, keeps voided rows, populates account', async () => {
  const a = await post(cashier.token, { date: '2026-01-10' });
  await post(cashier.token, { date: '2026-01-20' });
  await request(app).post(`/api/incomes/${a.body._id}/void`).set(auth(cashier.token)).send({ reason: 'Wrong amount' });
  const all = await request(app).get('/api/incomes').set(auth(cashier.token));
  expect(all.body.total).toBe(2);
  expect(all.body.items[0].account.name).toBe('Main Account');
  const ranged = await request(app).get('/api/incomes?from=2026-01-15&to=2026-01-31').set(auth(cashier.token));
  expect(ranged.body.total).toBe(1);
  const voided = await request(app).get('/api/incomes?status=voided').set(auth(cashier.token));
  expect(voided.body.items.map((i) => i.voided)).toEqual([true]);
});

test('void needs a reason, works once, and is audited', async () => {
  const created = await post(cashier.token);
  const url = `/api/incomes/${created.body._id}/void`;
  expect((await request(app).post(url).set(auth(cashier.token)).send({})).status).toBe(400);
  const ok = await request(app).post(url).set(auth(cashier.token)).send({ reason: 'Entered twice' });
  expect(ok.status).toBe(200);
  expect(ok.body.voided).toBe(true);
  expect(ok.body.voidReason).toBe('Entered twice');
  expect((await request(app).post(url).set(auth(cashier.token)).send({ reason: 'Again' })).status).toBe(409);
  const logs = await AuditLog.find().sort('createdAt');
  expect(logs.map((l) => l.action)).toEqual(['income.create', 'income.void']);
  expect(logs[1].details.reason).toBe('Entered twice');
});

test('voiding a missing record is 404', async () => {
  const res = await request(app).post('/api/incomes/64b7f0000000000000000000/void').set(auth(admin.token)).send({ reason: 'test' });
  expect(res.status).toBe(404);
});

test('there is no way to edit or delete income', async () => {
  const created = await post(cashier.token);
  expect((await request(app).patch(`/api/incomes/${created.body._id}`).set(auth(admin.token)).send({ amount: 1 })).status).toBe(404);
  expect((await request(app).delete(`/api/incomes/${created.body._id}`).set(auth(admin.token))).status).toBe(404);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npm test -- tests/income.test.js`
Expected: FAIL, `Cannot find module '../src/models/AuditLog'`.

- [ ] **Step 3: Implement models and services**

`server/src/models/Income.js`:
```js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const incomeSchema = new Schema(
  {
    amount: { type: Number, required: true, min: 1 },
    date: { type: Date, required: true },
    method: { type: String, enum: ['transfer', 'pos'], required: true },
    account: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    receiptNumber: { type: String, required: true, unique: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    voided: { type: Boolean, default: false },
    voidReason: String,
    voidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    voidedAt: Date,
  },
  { timestamps: true }
);
incomeSchema.index({ date: -1 });
incomeSchema.index({ account: 1 });

module.exports = mongoose.model('Income', incomeSchema);
```

`server/src/models/AuditLog.js`:
```js
const mongoose = require('mongoose');
const { Schema } = mongoose;

module.exports = mongoose.model(
  'AuditLog',
  new Schema(
    {
      actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      action: { type: String, required: true },
      targetModel: { type: String, required: true },
      targetId: { type: Schema.Types.ObjectId, required: true },
      details: Schema.Types.Mixed,
    },
    { timestamps: { createdAt: true, updatedAt: false } }
  )
);
```

`server/src/models/Counter.js`:
```js
const mongoose = require('mongoose');

module.exports = mongoose.model(
  'Counter',
  new mongoose.Schema({ key: { type: String, required: true, unique: true }, seq: { type: Number, default: 0 } })
);
```

`server/src/services/audit.js`:
```js
const AuditLog = require('../models/AuditLog');

const logAudit = ({ actor, action, targetModel, targetId, details }) =>
  AuditLog.create({ actor, action, targetModel, targetId, details });

module.exports = { logAudit };
```

`server/src/services/receiptNumber.js`:
```js
const Counter = require('../models/Counter');

async function nextReceiptNumber(year) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const c = await Counter.findOneAndUpdate(
        { key: `receipt-${year}` },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );
      return `RCP-${year}-${String(c.seq).padStart(4, '0')}`;
    } catch (err) {
      // Two first-ever requests can race on the upsert; retry picks up the existing document.
      if (err.code !== 11000 || attempt === 2) throw err;
    }
  }
}

module.exports = { nextReceiptNumber };
```

`server/src/services/voidRecord.js`:
```js
const AppError = require('../utils/AppError');
const { logAudit } = require('./audit');

async function voidRecord(Model, id, reason, user, action) {
  const doc = await Model.findOneAndUpdate(
    { _id: id, voided: false },
    { $set: { voided: true, voidReason: reason, voidedBy: user._id, voidedAt: new Date() } },
    { new: true }
  );
  if (!doc) {
    const exists = await Model.exists({ _id: id });
    throw exists ? new AppError(409, 'This entry is already void') : new AppError(404, 'Entry not found');
  }
  await logAudit({ actor: user._id, action, targetModel: Model.modelName, targetId: doc._id, details: { reason } });
  return doc;
}

module.exports = { voidRecord };
```

`server/src/utils/filters.js`:
```js
const { parseLagosDate, dayAfter } = require('./dates');

function dateFilter(from, to) {
  const d = {};
  if (from) d.$gte = parseLagosDate(from);
  if (to) d.$lt = dayAfter(parseLagosDate(to));
  return Object.keys(d).length ? { date: d } : {};
}
const statusFilter = (status) => (status === 'active' ? { voided: false } : status === 'voided' ? { voided: true } : {});

module.exports = { dateFilter, statusFilter };
```

- [ ] **Step 4: Implement the route**

`server/src/routes/incomes.js`:
```js
const router = require('express').Router();
const { z } = require('zod');
const Income = require('../models/Income');
const Account = require('../models/Account');
const { authenticate, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { parseLagosDate } = require('../utils/dates');
const { recordDate, amount, objectId, voidBody, listQueryShape } = require('../utils/schemas');
const { dateFilter, statusFilter } = require('../utils/filters');
const { nextReceiptNumber } = require('../services/receiptNumber');
const { voidRecord } = require('../services/voidRecord');
const { logAudit } = require('../services/audit');

const createSchema = z.object({
  amount,
  date: recordDate,
  method: z.enum(['transfer', 'pos'], { errorMap: () => ({ message: 'Choose transfer or POS' }) }),
  accountId: objectId,
});
const listQuery = z.object({ ...listQueryShape, method: z.enum(['transfer', 'pos']).optional() });

router.use(authenticate, requireRole('cashier', 'accountant', 'admin'));

router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const { amount: amt, date, method, accountId } = req.validated.body;
  const account = await Account.findById(accountId);
  if (!account || !account.active) {
    throw new AppError(400, 'Account not found or inactive', { accountId: 'Choose an active account' });
  }
  const receiptNumber = await nextReceiptNumber(date.slice(0, 4));
  const income = await Income.create({
    amount: amt, date: parseLagosDate(date), method, account: account._id, receiptNumber, recordedBy: req.user._id,
  });
  await logAudit({ actor: req.user._id, action: 'income.create', targetModel: 'Income', targetId: income._id, details: { receiptNumber, amount: amt } });
  res.status(201).json(income);
}));

router.get('/', validate(listQuery, 'query'), asyncHandler(async (req, res) => {
  const q = req.validated.query;
  const filter = { ...dateFilter(q.from, q.to), ...statusFilter(q.status) };
  if (q.accountId) filter.account = q.accountId;
  if (q.method) filter.method = q.method;
  const [items, total] = await Promise.all([
    Income.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate('account', 'name type bankName accountNumber')
      .populate('recordedBy', 'name'),
    Income.countDocuments(filter),
  ]);
  res.json({ items, total, page: q.page, limit: q.limit });
}));

router.post('/:id/void', validate(voidBody), asyncHandler(async (req, res) => {
  res.json(await voidRecord(Income, req.params.id, req.validated.body.reason, req.user, 'income.void'));
}));

module.exports = router;
```

Modify `server/src/routes/index.js`, add: `router.use('/incomes', require('./incomes'));`

- [ ] **Step 5: Run to verify it passes**

Run: `cd server && npm test -- tests/income.test.js`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: income recording with atomic receipt numbers, voiding and audit log" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Expenses

**Files:**
- Create: `server/src/models/Expense.js`, `server/src/routes/expenses.js`
- Modify: `server/src/routes/index.js`
- Test: `server/tests/expenses.test.js`

**Interfaces:**
- Consumes: everything from Tasks 3 and 5 (`isValidCategory`, `voidRecord`, `dateFilter`, `statusFilter`, `logAudit`).
- Produces: `Expense` model `{amount, date, account, type, group, item (null for leaf groups), note, recordedBy, voided...}`; `POST /api/expenses` (body `{amount,date,accountId,type,group,item?,note?}`), `GET /api/expenses` (filters `type,group,item` plus shared ones; `{items,total,page,limit}`), `POST /api/expenses/:id/void`. Accountant and admin only.

- [ ] **Step 1: Write failing tests**

`server/tests/expenses.test.js`:
```js
const request = require('supertest');
const app = require('../src/app');
const AuditLog = require('../src/models/AuditLog');
const { createUser, auth, makeAccount } = require('./helpers');

let accountant, cashier, account;
beforeEach(async () => {
  accountant = await createUser('accountant');
  cashier = await createUser('cashier');
  account = await makeAccount();
});
const body = (o = {}) => ({
  amount: 50000, date: '2026-01-15', accountId: account.id, type: 'Recurrent', group: 'Hospital Consumables', item: 'Oxygen', ...o,
});
const post = (token, o) => request(app).post('/api/expenses').set(auth(token)).send(body(o));

test('accountant records an expense', async () => {
  const res = await post(accountant.token, { note: 'Cylinders' });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ amount: 50000, type: 'Recurrent', group: 'Hospital Consumables', item: 'Oxygen', note: 'Cylinders' });
});

test('leaf groups take no item and store null', async () => {
  const res = await post(accountant.token, { group: 'Staff Wages', item: undefined });
  expect(res.status).toBe(201);
  expect(res.body.item).toBeNull();
});

test('invalid category paths are rejected', async () => {
  for (const o of [
    { item: 'Nope' },
    { item: undefined },
    { group: 'Staff Wages', item: 'Bonus' },
    { type: 'Capital' },
    { type: 'Other' },
  ]) {
    const res = await post(accountant.token, o);
    expect(res.status).toBe(400);
    expect(res.body.fields.category).toBeDefined();
  }
});

test('cashiers cannot use expense routes', async () => {
  expect((await post(cashier.token)).status).toBe(403);
  expect((await request(app).get('/api/expenses').set(auth(cashier.token))).status).toBe(403);
});

test('list filters by type and group', async () => {
  await post(accountant.token);
  await post(accountant.token, { type: 'Capital', group: 'Equipment', item: 'Radiology' });
  const res = await request(app).get('/api/expenses?type=Capital').set(auth(accountant.token));
  expect(res.body.total).toBe(1);
  expect(res.body.items[0].item).toBe('Radiology');
  expect(res.body.items[0].account.name).toBe('Main Account');
});

test('void needs a reason, works once, and is audited', async () => {
  const created = await post(accountant.token);
  const url = `/api/expenses/${created.body._id}/void`;
  expect((await request(app).post(url).set(auth(accountant.token)).send({})).status).toBe(400);
  expect((await request(app).post(url).set(auth(accountant.token)).send({ reason: 'Duplicate' })).status).toBe(200);
  expect((await request(app).post(url).set(auth(accountant.token)).send({ reason: 'Again' })).status).toBe(409);
  expect((await AuditLog.find().sort('createdAt')).map((l) => l.action)).toEqual(['expense.create', 'expense.void']);
});

test('there is no way to edit or delete expenses', async () => {
  const created = await post(accountant.token);
  expect((await request(app).patch(`/api/expenses/${created.body._id}`).set(auth(accountant.token)).send({})).status).toBe(404);
  expect((await request(app).delete(`/api/expenses/${created.body._id}`).set(auth(accountant.token))).status).toBe(404);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npm test -- tests/expenses.test.js`
Expected: FAIL (expense routes 404 / model missing).

- [ ] **Step 3: Implement**

`server/src/models/Expense.js`:
```js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const expenseSchema = new Schema(
  {
    amount: { type: Number, required: true, min: 1 },
    date: { type: Date, required: true },
    account: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    type: { type: String, required: true },
    group: { type: String, required: true },
    item: { type: String, default: null },
    note: { type: String, trim: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    voided: { type: Boolean, default: false },
    voidReason: String,
    voidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    voidedAt: Date,
  },
  { timestamps: true }
);
expenseSchema.index({ date: -1 });
expenseSchema.index({ account: 1 });

module.exports = mongoose.model('Expense', expenseSchema);
```

`server/src/routes/expenses.js`:
```js
const router = require('express').Router();
const { z } = require('zod');
const Expense = require('../models/Expense');
const Account = require('../models/Account');
const { authenticate, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { parseLagosDate } = require('../utils/dates');
const { recordDate, amount, objectId, voidBody, listQueryShape } = require('../utils/schemas');
const { dateFilter, statusFilter } = require('../utils/filters');
const { isValidCategory } = require('../config/categories');
const { voidRecord } = require('../services/voidRecord');
const { logAudit } = require('../services/audit');

const createSchema = z
  .object({
    amount,
    date: recordDate,
    accountId: objectId,
    type: z.string(),
    group: z.string(),
    item: z.string().nullish(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((d) => isValidCategory(d.type, d.group, d.item), { message: 'Choose a valid category', path: ['category'] });

const listQuery = z.object({
  ...listQueryShape,
  type: z.string().optional(),
  group: z.string().optional(),
  item: z.string().optional(),
});

router.use(authenticate, requireRole('accountant', 'admin'));

router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const b = req.validated.body;
  const account = await Account.findById(b.accountId);
  if (!account || !account.active) {
    throw new AppError(400, 'Account not found or inactive', { accountId: 'Choose an active account' });
  }
  const expense = await Expense.create({
    amount: b.amount, date: parseLagosDate(b.date), account: account._id,
    type: b.type, group: b.group, item: b.item || null, note: b.note, recordedBy: req.user._id,
  });
  await logAudit({ actor: req.user._id, action: 'expense.create', targetModel: 'Expense', targetId: expense._id, details: { amount: b.amount, type: b.type, group: b.group, item: b.item || null } });
  res.status(201).json(expense);
}));

router.get('/', validate(listQuery, 'query'), asyncHandler(async (req, res) => {
  const q = req.validated.query;
  const filter = { ...dateFilter(q.from, q.to), ...statusFilter(q.status) };
  if (q.accountId) filter.account = q.accountId;
  for (const k of ['type', 'group', 'item']) if (q[k]) filter[k] = q[k];
  const [items, total] = await Promise.all([
    Expense.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate('account', 'name type bankName accountNumber')
      .populate('recordedBy', 'name'),
    Expense.countDocuments(filter),
  ]);
  res.json({ items, total, page: q.page, limit: q.limit });
}));

router.post('/:id/void', validate(voidBody), asyncHandler(async (req, res) => {
  res.json(await voidRecord(Expense, req.params.id, req.validated.body.reason, req.user, 'expense.void'));
}));

module.exports = router;
```

Modify `server/src/routes/index.js`, add: `router.use('/expenses', require('./expenses'));`

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && npm test -- tests/expenses.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: expenses with validated category tree and voiding" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 7: Receipt PDF

**Files:**
- Create: `server/src/utils/money.js`, `server/src/services/receiptPdf.js`
- Modify: `server/src/routes/incomes.js`
- Test: `server/tests/money.test.js`, `server/tests/receipt.test.js`

**Interfaces:**
- Consumes: `Income` (populated `account`, `recordedBy`), `formatLagosDate`.
- Produces: `amountInWords(kobo) -> string`, `formatMoney(kobo) -> '1,500.00'`, `formatNgn(kobo) -> 'NGN 1,500.00'`; `renderReceipt(income) -> Promise<Buffer>`; `GET /api/incomes/:id/receipt` returns `application/pdf`.

- [ ] **Step 1: Write failing tests**

`server/tests/money.test.js`:
```js
const { amountInWords, formatMoney, formatNgn } = require('../src/utils/money');

test('amountInWords', () => {
  expect(amountInWords(150000)).toBe('One thousand five hundred naira only');
  expect(amountInWords(250050)).toBe('Two thousand five hundred naira and fifty kobo only');
  expect(amountInWords(10500)).toBe('One hundred and five naira only');
  expect(amountInWords(1)).toBe('One kobo only');
  expect(amountInWords(100000100)).toBe('One million and one naira only');
  expect(amountInWords(2100)).toBe('Twenty-one naira only');
});

test('formatMoney and formatNgn', () => {
  expect(formatMoney(150050)).toBe('1,500.50');
  expect(formatNgn(100)).toBe('NGN 1.00');
});
```

`server/tests/receipt.test.js`:
```js
const request = require('supertest');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const app = require('../src/app');
const { createUser, auth, makeAccount } = require('./helpers');

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const getPdf = (token, id) => request(app).get(`/api/incomes/${id}/receipt`).set(auth(token)).buffer(true).parse(binary);

let cashier, income;
beforeEach(async () => {
  cashier = await createUser('cashier');
  const account = await makeAccount();
  const res = await request(app).post('/api/incomes').set(auth(cashier.token))
    .send({ amount: 150000, date: '2026-01-15', method: 'transfer', accountId: account.id });
  income = res.body;
});

test('receipt PDF has the receipt details and no VOID mark', async () => {
  const res = await getPdf(cashier.token, income._id);
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch('application/pdf');
  expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
  const { text } = await pdfParse(res.body);
  expect(text).toContain('Test Hospital');
  expect(text).toContain('RCP-2026-0001');
  expect(text).toContain('15/01/2026');
  expect(text).toContain('NGN 1,500.00');
  expect(text).toContain('One thousand five hundred naira only');
  expect(text).toContain('Bank transfer');
  expect(text).toContain('6789');
  expect(text).toContain(cashier.user.name);
  expect(text).not.toContain('VOID');
});

test('voided receipt carries VOID and the reason', async () => {
  await request(app).post(`/api/incomes/${income._id}/void`).set(auth(cashier.token)).send({ reason: 'Wrong amount' });
  const res = await getPdf(cashier.token, income._id);
  const { text } = await pdfParse(res.body);
  expect(text).toContain('VOID');
  expect(text).toContain('Wrong amount');
  expect(text).toContain('RCP-2026-0001');
});

test('unknown receipt is 404', async () => {
  const res = await request(app).get('/api/incomes/64b7f0000000000000000000/receipt').set(auth(cashier.token));
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd server && npm test -- tests/money.test.js tests/receipt.test.js`
Expected: FAIL, `Cannot find module '../src/utils/money'`.

- [ ] **Step 3: Implement money utils**

`server/src/utils/money.js`:
```js
const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function below1000(n) {
  const parts = [];
  if (n >= 100) {
    parts.push(`${SMALL[Math.floor(n / 100)]} hundred`);
    n %= 100;
    if (n) parts.push('and');
  }
  if (n >= 20) parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${SMALL[n % 10]}` : ''));
  else if (n > 0 || parts.length === 0) parts.push(SMALL[n]);
  return parts.join(' ');
}

function words(n) {
  if (n === 0) return 'zero';
  const parts = [];
  for (const [size, label] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]) {
    if (n >= size) {
      parts.push(`${below1000(Math.floor(n / size))} ${label}`);
      n %= size;
    }
  }
  if (n > 0) parts.push(n < 100 && parts.length ? `and ${below1000(n)}` : below1000(n));
  return parts.join(' ');
}

function amountInWords(kobo) {
  const naira = Math.floor(kobo / 100);
  const k = kobo % 100;
  const segments = [];
  if (naira > 0) segments.push(`${words(naira)} naira`);
  if (k > 0) segments.push(`${words(k)} kobo`);
  const s = `${segments.join(' and ')} only`;
  return s[0].toUpperCase() + s.slice(1);
}

const formatMoney = (kobo) =>
  (kobo / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatNgn = (kobo) => `NGN ${formatMoney(kobo)}`;

module.exports = { amountInWords, formatMoney, formatNgn };
```

- [ ] **Step 4: Implement the receipt renderer and route**

`server/src/services/receiptPdf.js`:
```js
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { formatLagosDate } = require('../utils/dates');
const { amountInWords, formatNgn } = require('../utils/money');

const METHOD = { transfer: 'Bank transfer', pos: 'POS' };

function accountLabel(a) {
  if (!a) return '';
  return a.type === 'bank' ? `${a.name} - ${a.bankName} ****${String(a.accountNumber).slice(-4)}` : a.name;
}

function renderReceipt(income) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 36, info: { Title: `Receipt ${income.receiptNumber}` } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const width = doc.page.width - 72;
    const logo = process.env.HOSPITAL_LOGO_PATH;
    if (logo && fs.existsSync(logo)) {
      doc.image(logo, doc.page.width / 2 - 20, 30, { height: 40 });
      doc.moveDown(3.5);
    }
    doc.font('Helvetica-Bold').fontSize(16).text(process.env.HOSPITAL_NAME || 'Hospital', { align: 'center' });
    doc.moveDown(0.3).fontSize(11).text('PAYMENT RECEIPT', { align: 'center' });
    doc.moveDown(1.2);

    const row = (label, value) => {
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(10).text(label, 36, y, { width: 110 });
      doc.font('Helvetica').text(String(value), 150, y, { width: width - 114 });
      doc.moveDown(0.6);
    };
    row('Receipt No.', income.receiptNumber);
    row('Date', formatLagosDate(income.date));
    row('Amount', formatNgn(income.amount));
    row('In words', amountInWords(income.amount));
    row('Method', METHOD[income.method] || income.method);
    row('Paid into', accountLabel(income.account));
    row('Recorded by', income.recordedBy ? income.recordedBy.name : '');

    if (income.voided) {
      doc.moveDown(0.5);
      row('Status', `VOID - ${income.voidReason || ''}`);
      doc.save();
      doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.font('Helvetica-Bold').fontSize(90).fillColor('#cc0000').opacity(0.25)
        .text('VOID', 0, doc.page.height / 2 - 50, { align: 'center', width: doc.page.width });
      doc.restore();
    }
    doc.end();
  });
}

module.exports = { renderReceipt };
```

Modify `server/src/routes/incomes.js`: add `const { renderReceipt } = require('../services/receiptPdf');` with the other requires, and add this route above `module.exports`:
```js
router.get('/:id/receipt', asyncHandler(async (req, res) => {
  const income = await Income.findById(req.params.id).populate('account').populate('recordedBy', 'name');
  if (!income) throw new AppError(404, 'Receipt not found');
  const pdf = await renderReceipt(income);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${income.receiptNumber}.pdf"` });
  res.send(pdf);
}));
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd server && npm test -- tests/money.test.js tests/receipt.test.js`
Expected: PASS. If a text assertion fails only because PDF text extraction split a string, print `text` and adjust the assertion to the extracted form; do not weaken the VOID checks.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: printable A5 receipt PDF with VOID watermark" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Reports

**Files:**
- Create: `server/src/services/reports.js`, `server/src/routes/reports.js`
- Modify: `server/src/routes/index.js`, `server/tests/helpers.js`
- Test: `server/tests/reports.test.js`

**Interfaces:**
- Consumes: `Income`, `Expense`, `Account`, `listCategories`, `parseLagosDate`, `dayAfter`.
- Produces (`services/reports.js`, all amounts in kobo, voided excluded):
  - `summary(from, to) -> { from, to, income:{total,count}, spending:{total,count}, net }`
  - `spendingByCategory(from, to) -> { grandTotal, types:[{type,total,percent,groups:[{group,total,percent,items:[{item,total,percent}]}]}] }` (tree order; zero rows omitted)
  - `accountBalances(asOf?) -> { accounts:[{accountId,name,type,bankName,accountNumber,active,openingBalance,totalIn,totalOut,balance}], grandTotal }`
- Produces routes: `GET /api/reports/summary?from&to`, `/spending-by-category?from&to`, `/account-balances[?asOf]`; accountant and admin only. `rangeShape`/`ordered` are reused by the export route in Task 9.
- Produces test helpers: `makeIncome({account, recordedBy, amount, date, voided})`, `makeExpense({account, recordedBy, amount, date, type, group, item, voided})`.

- [ ] **Step 1: Add helpers and write failing tests**

Modify `server/tests/helpers.js`: add requires `const Income = require('../src/models/Income');` and `const Expense = require('../src/models/Expense');`, then before `module.exports`:
```js
let seq = 0;
async function makeIncome({ account, recordedBy, amount = 100000, date = '2026-01-15T10:00:00Z', voided = false, voidReason, ...rest }) {
  seq += 1;
  return Income.create({
    account: account._id, recordedBy: recordedBy._id, amount, date: new Date(date), method: 'transfer',
    receiptNumber: `T-${seq}`, voided, voidReason: voided ? voidReason || 'test' : undefined, ...rest,
  });
}
async function makeExpense({ account, recordedBy, amount = 50000, date = '2026-01-15T10:00:00Z', type = 'Recurrent', group = 'Staff Wages', item = null, voided = false, ...rest }) {
  return Expense.create({
    account: account._id, recordedBy: recordedBy._id, amount, date: new Date(date), type, group, item, voided,
    voidReason: voided ? 'test' : undefined, ...rest,
  });
}
```
Update the export line to: `module.exports = { createUser, auth, makeAccount, makeIncome, makeExpense };`

`server/tests/reports.test.js`:
```js
const request = require('supertest');
const app = require('../src/app');
const { createUser, auth, makeAccount, makeIncome, makeExpense } = require('./helpers');

let accountant, account;
const get = (path) => request(app).get(`/api/reports${path}`).set(auth(accountant.token));
beforeEach(async () => {
  accountant = await createUser('accountant');
  account = await makeAccount({ openingBalance: 500000 });
});
const ctx = () => ({ account, recordedBy: accountant.user });

test('summary totals exclude voided entries', async () => {
  await makeIncome({ ...ctx(), amount: 100000, date: '2026-09-21T10:00:00Z' });
  await makeIncome({ ...ctx(), amount: 50000, date: '2026-09-21T10:00:00Z', voided: true });
  await makeExpense({ ...ctx(), amount: 30000, date: '2026-09-21T10:00:00Z' });
  const res = await get('/summary?from=2026-09-21&to=2026-09-21');
  expect(res.status).toBe(200);
  expect(res.body.income).toEqual({ total: 100000, count: 1 });
  expect(res.body.spending).toEqual({ total: 30000, count: 1 });
  expect(res.body.net).toBe(70000);
});

test('ranges follow the Lagos day boundary', async () => {
  await makeIncome({ ...ctx(), amount: 1, date: '2026-09-20T23:00:00Z' }); // 21st 00:00 Lagos: in
  await makeIncome({ ...ctx(), amount: 2, date: '2026-09-21T22:59:59.999Z' }); // 21st 23:59:59.999: in
  await makeIncome({ ...ctx(), amount: 4, date: '2026-09-20T22:59:59.999Z' }); // 20th: out
  await makeIncome({ ...ctx(), amount: 8, date: '2026-09-21T23:00:00Z' }); // 22nd: out
  const res = await get('/summary?from=2026-09-21&to=2026-09-21');
  expect(res.body.income).toEqual({ total: 3, count: 2 });
});

test('summary validates the range', async () => {
  expect((await get('/summary?from=2026-09-22&to=2026-09-21')).status).toBe(400);
  expect((await get('/summary?from=2026-09-22')).status).toBe(400);
});

test('spending by category follows the tree order and hides unused/void rows', async () => {
  const d = '2026-01-15T10:00:00Z';
  await makeExpense({ ...ctx(), amount: 30000, date: d, group: 'Hospital Consumables', item: 'Oxygen' });
  await makeExpense({ ...ctx(), amount: 10000, date: d, group: 'Hospital Consumables', item: 'Drugs' });
  await makeExpense({ ...ctx(), amount: 40000, date: d, group: 'Staff Wages' });
  await makeExpense({ ...ctx(), amount: 20000, date: d, type: 'Capital', group: 'Equipment', item: 'Radiology' });
  await makeExpense({ ...ctx(), amount: 99999, date: d, group: 'Rents', voided: true });
  const { body } = await get('/spending-by-category?from=2026-01-01&to=2026-01-31');
  expect(body.grandTotal).toBe(100000);
  expect(body.types.map((t) => [t.type, t.total, t.percent])).toEqual([['Recurrent', 80000, 80], ['Capital', 20000, 20]]);
  const recurrent = body.types[0];
  expect(recurrent.groups.map((g) => [g.group, g.total, g.percent])).toEqual([['Hospital Consumables', 40000, 40], ['Staff Wages', 40000, 40]]);
  expect(recurrent.groups[0].items.map((i) => [i.item, i.total, i.percent])).toEqual([['Oxygen', 30000, 30], ['Drugs', 10000, 10]]);
});

test('account balances = opening + income - expenses, voided ignored, inactive included', async () => {
  const other = await makeAccount({ name: 'Old', openingBalance: 1000, active: false });
  await makeIncome({ ...ctx(), amount: 200000 });
  await makeIncome({ ...ctx(), amount: 999, voided: true });
  await makeExpense({ ...ctx(), amount: 50000 });
  const { body } = await get('/account-balances');
  const main = body.accounts.find((a) => a.name === 'Main Account');
  expect(main).toMatchObject({ openingBalance: 500000, totalIn: 200000, totalOut: 50000, balance: 650000 });
  expect(body.accounts.find((a) => a.accountId === other.id).balance).toBe(1000);
  expect(body.grandTotal).toBe(651000);
});

test('account balances honour asOf', async () => {
  await makeIncome({ ...ctx(), amount: 200000, date: '2026-02-01T10:00:00Z' });
  const { body } = await get('/account-balances?asOf=2026-01-31');
  expect(body.accounts[0].balance).toBe(500000);
});

test('cashiers cannot read reports', async () => {
  const { token } = await createUser('cashier');
  expect((await request(app).get('/api/reports/summary?from=2026-01-01&to=2026-01-02').set(auth(token))).status).toBe(403);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npm test -- tests/reports.test.js`
Expected: FAIL (404s on report routes).

- [ ] **Step 3: Implement the service**

`server/src/services/reports.js`:
```js
const Income = require('../models/Income');
const Expense = require('../models/Expense');
const Account = require('../models/Account');
const { listCategories } = require('../config/categories');
const { parseLagosDate, dayAfter } = require('../utils/dates');

const rangeMatch = (from, to) => ({
  voided: false,
  date: { $gte: parseLagosDate(from), $lt: dayAfter(parseLagosDate(to)) },
});

async function totalFor(Model, match) {
  const [r] = await Model.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]);
  return { total: r ? r.total : 0, count: r ? r.count : 0 };
}

async function summary(from, to) {
  const match = rangeMatch(from, to);
  const [income, spending] = await Promise.all([totalFor(Income, match), totalFor(Expense, match)]);
  return { from, to, income, spending, net: income.total - spending.total };
}

async function spendingByCategory(from, to) {
  const rows = await Expense.aggregate([
    { $match: rangeMatch(from, to) },
    { $group: { _id: { type: '$type', group: '$group', item: '$item' }, total: { $sum: '$amount' } } },
  ]);
  const totals = new Map(rows.map((r) => [`${r._id.type}|${r._id.group}|${r._id.item || ''}`, r.total]));
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  const pct = (n) => (grandTotal ? Math.round((n / grandTotal) * 1000) / 10 : 0);

  const types = [];
  for (const { type, groups } of listCategories()) {
    const groupOut = [];
    for (const g of groups) {
      let items = [];
      let groupTotal;
      if (g.items.length === 0) {
        groupTotal = totals.get(`${type}|${g.name}|`) || 0;
      } else {
        items = g.items
          .map((item) => ({ item, total: totals.get(`${type}|${g.name}|${item}`) || 0 }))
          .filter((i) => i.total > 0);
        groupTotal = items.reduce((s, i) => s + i.total, 0);
      }
      if (groupTotal > 0) {
        groupOut.push({ group: g.name, total: groupTotal, percent: pct(groupTotal), items: items.map((i) => ({ ...i, percent: pct(i.total) })) });
      }
    }
    const typeTotal = groupOut.reduce((s, g) => s + g.total, 0);
    if (typeTotal > 0) types.push({ type, total: typeTotal, percent: pct(typeTotal), groups: groupOut });
  }
  return { grandTotal, types };
}

async function accountBalances(asOf) {
  const match = { voided: false };
  if (asOf) match.date = { $lt: dayAfter(parseLagosDate(asOf)) };
  const byAccount = async (Model) => {
    const rows = await Model.aggregate([{ $match: match }, { $group: { _id: '$account', total: { $sum: '$amount' } } }]);
    return new Map(rows.map((r) => [String(r._id), r.total]));
  };
  const [inMap, outMap, accounts] = await Promise.all([byAccount(Income), byAccount(Expense), Account.find().sort('name')]);
  const rows = accounts.map((a) => {
    const totalIn = inMap.get(String(a._id)) || 0;
    const totalOut = outMap.get(String(a._id)) || 0;
    return {
      accountId: a._id, name: a.name, type: a.type, bankName: a.bankName, accountNumber: a.accountNumber, active: a.active,
      openingBalance: a.openingBalance, totalIn, totalOut, balance: a.openingBalance + totalIn - totalOut,
    };
  });
  return { accounts: rows, grandTotal: rows.reduce((s, r) => s + r.balance, 0) };
}

module.exports = { summary, spendingByCategory, accountBalances };
```

- [ ] **Step 4: Implement the routes**

`server/src/routes/reports.js`:
```js
const router = require('express').Router();
const { z } = require('zod');
const { authenticate, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const { isoDate } = require('../utils/schemas');
const reports = require('../services/reports');

const rangeShape = { from: isoDate, to: isoDate };
const ordered = (d) => d.from <= d.to;
const orderedMsg = { message: 'From must be on or before To', path: ['from'] };
const rangeQuery = z.object(rangeShape).refine(ordered, orderedMsg);
const balancesQuery = z.object({ asOf: isoDate.optional() });

router.use(authenticate, requireRole('accountant', 'admin'));

router.get('/summary', validate(rangeQuery, 'query'), asyncHandler(async (req, res) => {
  const { from, to } = req.validated.query;
  res.json(await reports.summary(from, to));
}));

router.get('/spending-by-category', validate(rangeQuery, 'query'), asyncHandler(async (req, res) => {
  const { from, to } = req.validated.query;
  res.json(await reports.spendingByCategory(from, to));
}));

router.get('/account-balances', validate(balancesQuery, 'query'), asyncHandler(async (req, res) => {
  res.json(await reports.accountBalances(req.validated.query.asOf));
}));

module.exports = router;
module.exports.rangeShape = rangeShape;
module.exports.ordered = ordered;
module.exports.orderedMsg = orderedMsg;
```

Modify `server/src/routes/index.js`, add: `router.use('/reports', require('./reports'));`

- [ ] **Step 5: Run to verify it passes**

Run: `cd server && npm test -- tests/reports.test.js`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: summary, spending-by-category and account balance reports" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Excel and PDF export

**Files:**
- Create: `server/src/services/exportTables.js`, `server/src/services/exporters.js`
- Modify: `server/src/routes/reports.js`
- Test: `server/tests/export.test.js`

**Interfaces:**
- Consumes: `reports.summary`, `reports.spendingByCategory`, `Income`, `Expense`, `dateFilter`, `formatMoney`, `rangeShape/ordered/orderedMsg` from `routes/reports.js`.
- Produces: `buildTable(type, from, to) -> {title, subtitle, columns:[{header,key,width,type?:'money'}], rows:[{...,voided?}], totals:{label,amount}|null}` for `type` in `income|expenses|summary` (money values in kobo; voided rows included and flagged, excluded from totals); `renderXlsx(table) -> Promise<Buffer>` (title row 1, subtitle row 2, blank row 3, header row 4, data from row 5, totals row last); `renderTablePdf(table) -> Promise<Buffer>`; `GET /api/reports/export?type&format&from&to`.

- [ ] **Step 1: Write failing tests**

`server/tests/export.test.js`:
```js
const request = require('supertest');
const ExcelJS = require('exceljs');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const app = require('../src/app');
const { createUser, auth, makeAccount, makeIncome, makeExpense } = require('./helpers');

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
let accountant, ctx;
const exportReq = (q) => request(app).get(`/api/reports/export?${q}`).set(auth(accountant.token)).buffer(true).parse(binary);

beforeEach(async () => {
  accountant = await createUser('accountant');
  ctx = { account: await makeAccount(), recordedBy: accountant.user };
  await makeIncome({ ...ctx, amount: 150000, receiptNumber: 'RCP-A' });
  await makeIncome({ ...ctx, amount: 99900, voided: true, voidReason: 'Wrong', receiptNumber: 'RCP-B' });
  await makeExpense({ ...ctx, amount: 25050, group: 'Hospital Consumables', item: 'Oxygen' });
});

test('income xlsx lists voided rows but totals exclude them', async () => {
  const res = await exportReq('type=income&format=xlsx&from=2026-01-01&to=2026-01-31');
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch('spreadsheetml');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.body);
  const ws = wb.worksheets[0];
  expect(ws.getRow(4).getCell(2).value).toBe('Receipt No.');
  const receipts = [5, 6].map((r) => ws.getRow(r).getCell(2).value);
  expect(receipts).toEqual(['RCP-A', 'RCP-B']);
  expect(ws.getRow(6).getCell(6).value).toBe('VOID: Wrong');
  expect(ws.getRow(7).getCell(1).value).toBe('Total (excluding void)');
  expect(ws.getRow(7).getCell(5).value).toBe(1500);
});

test('expenses xlsx shows the category path', async () => {
  const res = await exportReq('type=expenses&format=xlsx&from=2026-01-01&to=2026-01-31');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.body);
  expect(wb.worksheets[0].getRow(5).getCell(2).value).toBe('Recurrent > Hospital Consumables > Oxygen');
});

test('summary xlsx has income, spending and net', async () => {
  const res = await exportReq('type=summary&format=xlsx&from=2026-01-01&to=2026-01-31');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.body);
  const ws = wb.worksheets[0];
  expect([5, 6, 7].map((r) => [ws.getRow(r).getCell(1).value, ws.getRow(r).getCell(2).value])).toEqual([
    ['Total income', 1500], ['Total spending', 250.5], ['Net', 1249.5],
  ]);
});

test('pdf export contains the title and rows', async () => {
  const res = await exportReq('type=income&format=pdf&from=2026-01-01&to=2026-01-31');
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch('application/pdf');
  const { text } = await pdfParse(res.body);
  expect(text).toContain('Income');
  expect(text).toContain('RCP-A');
  expect(text).toContain('1,500.00');
});

test('export validates params', async () => {
  expect((await exportReq('type=bogus&format=xlsx&from=2026-01-01&to=2026-01-31')).status).toBe(400);
  expect((await exportReq('type=income&format=csv&from=2026-01-01&to=2026-01-31')).status).toBe(400);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npm test -- tests/export.test.js`
Expected: FAIL (route missing, 404).

- [ ] **Step 3: Implement table builders**

`server/src/services/exportTables.js`:
```js
const Income = require('../models/Income');
const Expense = require('../models/Expense');
const reports = require('./reports');
const { dateFilter } = require('../utils/filters');
const { formatLagosDate } = require('../utils/dates');

const METHOD = { transfer: 'Bank transfer', pos: 'POS' };
const populate = [['account', 'name type bankName accountNumber'], ['recordedBy', 'name']];
const withPopulate = (q) => populate.reduce((acc, [p, s]) => acc.populate(p, s), q);

const accountLabel = (a) =>
  !a ? '' : a.type === 'bank' ? `${a.name} (${a.bankName} ****${String(a.accountNumber).slice(-4)})` : a.name;
const statusOf = (r) => (r.voided ? `VOID: ${r.voidReason}` : 'Active');
const sumActive = (items) => items.filter((i) => !i.voided).reduce((s, i) => s + i.amount, 0);

async function incomeTable(from, to) {
  const items = await withPopulate(Income.find(dateFilter(from, to)).sort({ date: 1, createdAt: 1 }));
  return {
    title: 'Income',
    subtitle: `${from} to ${to}`,
    columns: [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Receipt No.', key: 'receiptNumber', width: 16 },
      { header: 'Method', key: 'method', width: 14 },
      { header: 'Account', key: 'account', width: 34 },
      { header: 'Amount (NGN)', key: 'amount', width: 16, type: 'money' },
      { header: 'Status', key: 'status', width: 26 },
      { header: 'Recorded by', key: 'recordedBy', width: 18 },
    ],
    rows: items.map((i) => ({
      date: formatLagosDate(i.date), receiptNumber: i.receiptNumber, method: METHOD[i.method], account: accountLabel(i.account),
      amount: i.amount, status: statusOf(i), recordedBy: i.recordedBy ? i.recordedBy.name : '', voided: i.voided,
    })),
    totals: { label: 'Total (excluding void)', amount: sumActive(items) },
  };
}

async function expenseTable(from, to) {
  const items = await withPopulate(Expense.find(dateFilter(from, to)).sort({ date: 1, createdAt: 1 }));
  return {
    title: 'Expenses',
    subtitle: `${from} to ${to}`,
    columns: [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Category', key: 'category', width: 44 },
      { header: 'Account', key: 'account', width: 34 },
      { header: 'Amount (NGN)', key: 'amount', width: 16, type: 'money' },
      { header: 'Status', key: 'status', width: 26 },
      { header: 'Note', key: 'note', width: 30 },
      { header: 'Recorded by', key: 'recordedBy', width: 18 },
    ],
    rows: items.map((e) => ({
      date: formatLagosDate(e.date), category: [e.type, e.group, e.item].filter(Boolean).join(' > '), account: accountLabel(e.account),
      amount: e.amount, status: statusOf(e), note: e.note || '', recordedBy: e.recordedBy ? e.recordedBy.name : '', voided: e.voided,
    })),
    totals: { label: 'Total (excluding void)', amount: sumActive(items) },
  };
}

async function summaryTable(from, to) {
  const [s, c] = await Promise.all([reports.summary(from, to), reports.spendingByCategory(from, to)]);
  const rows = [
    { label: 'Total income', amount: s.income.total },
    { label: 'Total spending', amount: s.spending.total },
    { label: 'Net', amount: s.net },
    { label: '', amount: null },
    { label: 'Spending by category', amount: null },
  ];
  for (const t of c.types) {
    rows.push({ label: t.type, amount: t.total });
    for (const g of t.groups) {
      rows.push({ label: `   ${g.group}`, amount: g.total });
      for (const i of g.items) rows.push({ label: `      ${i.item}`, amount: i.total });
    }
  }
  return {
    title: 'Summary',
    subtitle: `${from} to ${to}`,
    columns: [{ header: 'Item', key: 'label', width: 44 }, { header: 'Amount (NGN)', key: 'amount', width: 18, type: 'money' }],
    rows,
    totals: null,
  };
}

const buildTable = (type, from, to) => ({ income: incomeTable, expenses: expenseTable, summary: summaryTable })[type](from, to);

module.exports = { buildTable };
```

- [ ] **Step 4: Implement exporters**

`server/src/services/exporters.js`:
```js
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { formatMoney } = require('../utils/money');

const amountIndex = (table) => table.columns.findIndex((c) => c.key === 'amount');

async function renderXlsx(table) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(table.title);
  ws.addRow([table.title]).font = { bold: true, size: 14 };
  ws.addRow([table.subtitle]);
  ws.addRow([]);
  ws.addRow(table.columns.map((c) => c.header)).font = { bold: true };
  table.columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

  const money = (row, cells) => {
    table.columns.forEach((c, i) => { if (c.type === 'money') row.getCell(i + 1).numFmt = '#,##0.00'; });
    return cells;
  };
  for (const r of table.rows) {
    const cells = table.columns.map((c) => (c.type === 'money' ? (r[c.key] == null ? null : r[c.key] / 100) : r[c.key]));
    const row = ws.addRow(cells);
    money(row);
    if (r.voided) row.font = { color: { argb: 'FF999999' }, strike: true };
  }
  if (table.totals) {
    const cells = table.columns.map(() => null);
    cells[0] = table.totals.label;
    cells[amountIndex(table)] = table.totals.amount / 100;
    const row = ws.addRow(cells);
    money(row);
    row.font = { bold: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function renderTablePdf(table) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const usable = doc.page.width - 60;
    const totalW = table.columns.reduce((s, c) => s + c.width, 0);
    const cols = table.columns.map((c) => ({ ...c, w: (c.width / totalW) * usable }));
    const headerCells = table.columns.map((c) => c.header);

    const drawRow = (cells, { bold = false, grey = false } = {}) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(grey ? '#888888' : '#000000');
      const heights = cells.map((t, i) => doc.heightOfString(String(t), { width: cols[i].w - 4 }));
      const h = Math.max(...heights);
      if (doc.y + h > doc.page.height - 40) {
        doc.addPage();
        drawRow(headerCells, { bold: true });
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(grey ? '#888888' : '#000000');
      }
      const y = doc.y;
      let x = 30;
      cells.forEach((t, i) => {
        doc.text(String(t), x, y, { width: cols[i].w - 4, align: cols[i].type === 'money' ? 'right' : 'left' });
        x += cols[i].w;
      });
      doc.x = 30;
      doc.y = y + h + 4;
    };

    doc.font('Helvetica-Bold').fontSize(14).text(table.title, 30, 30);
    doc.font('Helvetica').fontSize(9).text(table.subtitle, 30);
    doc.moveDown();
    drawRow(headerCells, { bold: true });
    for (const r of table.rows) {
      drawRow(table.columns.map((c) => (c.type === 'money' ? (r[c.key] == null ? '' : formatMoney(r[c.key])) : r[c.key] ?? '')), { grey: r.voided });
    }
    if (table.totals) {
      const cells = table.columns.map(() => '');
      cells[0] = table.totals.label;
      cells[amountIndex(table)] = formatMoney(table.totals.amount);
      drawRow(cells, { bold: true });
    }
    doc.end();
  });
}

module.exports = { renderXlsx, renderTablePdf };
```

- [ ] **Step 5: Add the route**

Modify `server/src/routes/reports.js`: add these requires at the top
```js
const { buildTable } = require('../services/exportTables');
const { renderXlsx, renderTablePdf } = require('../services/exporters');
```
and this route above `module.exports = router;`:
```js
const exportQuery = z
  .object({ ...rangeShape, type: z.enum(['income', 'expenses', 'summary']), format: z.enum(['xlsx', 'pdf']) })
  .refine(ordered, orderedMsg);

router.get('/export', validate(exportQuery, 'query'), asyncHandler(async (req, res) => {
  const { type, format, from, to } = req.validated.query;
  const table = await buildTable(type, from, to);
  const buffer = format === 'xlsx' ? await renderXlsx(table) : await renderTablePdf(table);
  res.set({
    'Content-Type': format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf',
    'Content-Disposition': `attachment; filename="solucio-${type}-${from}_to_${to}.${format}"`,
  });
  res.send(buffer);
}));
```
`ordered` and `orderedMsg` are already defined as consts in this file, so no import is needed.

- [ ] **Step 6: Run to verify it passes**

Run: `cd server && npm test -- tests/export.test.js`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: Excel and PDF exports for income, expenses and summary" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: User management and role matrix

**Files:**
- Create: `server/src/routes/users.js`
- Modify: `server/src/routes/index.js`
- Test: `server/tests/users.test.js`, `server/tests/roles.test.js`

**Interfaces:**
- Consumes: `User`, `authenticate`, `requireRole`, `validate`.
- Produces: `GET /api/users`, `POST /api/users` (`{name,email,password,role}`), `PATCH /api/users/:id` (`{name?,role?,active?,password?}`), admin only. Duplicate email is 409. An admin cannot change their own role or deactivate themselves.

- [ ] **Step 1: Write failing tests**

`server/tests/users.test.js`:
```js
const request = require('supertest');
const app = require('../src/app');
const { createUser, auth } = require('./helpers');

let admin;
beforeEach(async () => { admin = await createUser('admin'); });
const create = (o = {}) =>
  request(app).post('/api/users').set(auth(admin.token)).send({ name: 'Ada', email: 'ada@test.com', password: 'password123', role: 'cashier', ...o });

test('admin creates a user who can then log in', async () => {
  const res = await create();
  expect(res.status).toBe(201);
  expect(res.body.passwordHash).toBeUndefined();
  const login = await request(app).post('/api/auth/login').send({ email: 'ada@test.com', password: 'password123' });
  expect(login.status).toBe(200);
});

test('duplicate email is 409 and short passwords are 400', async () => {
  await create();
  expect((await create()).status).toBe(409);
  const res = await create({ email: 'b@test.com', password: 'short' });
  expect(res.status).toBe(400);
  expect(res.body.fields.password).toBeDefined();
});

test('list never leaks password hashes', async () => {
  const res = await request(app).get('/api/users').set(auth(admin.token));
  expect(res.status).toBe(200);
  expect(res.body.every((u) => u.passwordHash === undefined)).toBe(true);
});

test('admin changes role, deactivates, and resets password', async () => {
  const { body } = await create();
  const res = await request(app).patch(`/api/users/${body._id}`).set(auth(admin.token)).send({ role: 'accountant', active: false, password: 'newpassword1' });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ role: 'accountant', active: false });
  const login = await request(app).post('/api/auth/login').send({ email: 'ada@test.com', password: 'newpassword1' });
  expect(login.status).toBe(401); // inactive
});

test('admin cannot demote or deactivate themselves', async () => {
  const a = await request(app).patch(`/api/users/${admin.user.id}`).set(auth(admin.token)).send({ role: 'cashier' });
  const b = await request(app).patch(`/api/users/${admin.user.id}`).set(auth(admin.token)).send({ active: false });
  expect([a.status, b.status]).toEqual([400, 400]);
});
```

`server/tests/roles.test.js`:
```js
const request = require('supertest');
const app = require('../src/app');
const { createUser, auth } = require('./helpers');

const ID = '64b7f0000000000000000000';
const ALL = ['cashier', 'accountant', 'admin'];
const FIN = ['accountant', 'admin'];
const ADMIN = ['admin'];
const RANGE = 'from=2026-01-01&to=2026-01-31';

// [method, path, roles allowed past the role guard]
const ROUTES = [
  ['get', '/api/auth/me', ALL],
  ['get', '/api/categories', ALL],
  ['get', '/api/accounts', ALL],
  ['post', '/api/accounts', ADMIN],
  ['patch', `/api/accounts/${ID}`, ADMIN],
  ['post', '/api/incomes', ALL],
  ['get', '/api/incomes', ALL],
  ['get', `/api/incomes/${ID}/receipt`, ALL],
  ['post', `/api/incomes/${ID}/void`, ALL],
  ['post', '/api/expenses', FIN],
  ['get', '/api/expenses', FIN],
  ['post', `/api/expenses/${ID}/void`, FIN],
  ['get', `/api/reports/summary?${RANGE}`, FIN],
  ['get', `/api/reports/spending-by-category?${RANGE}`, FIN],
  ['get', '/api/reports/account-balances', FIN],
  ['get', `/api/reports/export?type=income&format=xlsx&${RANGE}`, FIN],
  ['get', '/api/users', ADMIN],
  ['post', '/api/users', ADMIN],
  ['patch', `/api/users/${ID}`, ADMIN],
];

const tokens = {};
beforeEach(async () => {
  for (const role of ALL) tokens[role] = (await createUser(role)).token;
});

describe.each(ROUTES)('%s %s', (method, path, allowed) => {
  test('requires a token', async () => {
    expect((await request(app)[method](path).send({})).status).toBe(401);
  });
  test.each(ALL)('role %s', async (role) => {
    const res = await request(app)[method](path).set(auth(tokens[role])).send({});
    if (allowed.includes(role)) expect([401, 403]).not.toContain(res.status);
    else expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd server && npm test -- tests/users.test.js tests/roles.test.js`
Expected: `users.test.js` FAILS (routes missing). `roles.test.js` fails only for the users routes.

- [ ] **Step 3: Implement**

`server/src/routes/users.js`:
```js
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const User = require('../models/User');
const { authenticate, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

const password = z.string().min(8, 'Password must be at least 8 characters');
const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password,
  role: z.enum(User.ROLES),
});
const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  role: z.enum(User.ROLES).optional(),
  active: z.boolean().optional(),
  password: password.optional(),
});

router.use(authenticate, requireRole('admin'));

router.get('/', asyncHandler(async (req, res) => res.json(await User.find().sort('name'))));

router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const { password: plain, ...rest } = req.validated.body;
  try {
    res.status(201).json(await User.create({ ...rest, passwordHash: await bcrypt.hash(plain, 10) }));
  } catch (err) {
    if (err.code === 11000) throw new AppError(409, 'A user with that email already exists', { email: 'Already in use' });
    throw err;
  }
}));

router.patch('/:id', validate(updateSchema), asyncHandler(async (req, res) => {
  const { password: plain, ...changes } = req.validated.body;
  if (req.params.id === req.user.id && ((changes.role && changes.role !== req.user.role) || changes.active === false)) {
    throw new AppError(400, 'You cannot change your own role or deactivate yourself');
  }
  if (plain) changes.passwordHash = await bcrypt.hash(plain, 10);
  const user = await User.findByIdAndUpdate(req.params.id, { $set: changes }, { new: true });
  if (!user) throw new AppError(404, 'User not found');
  res.json(user);
}));

module.exports = router;
```

Modify `server/src/routes/index.js`, add: `router.use('/users', require('./users'));`

- [ ] **Step 4: Run the full server suite**

Run: `cd server && npm test`
Expected: all suites PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: user management and table-driven role guard tests" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 11: Client scaffold, auth, layout, utilities

**Files:**
- Create: `client/package.json` (via npm), `client/vite.config.js`, `client/index.html`, `client/src/main.jsx`, `client/src/App.jsx`, `client/src/styles.css`, `client/src/test/setup.js`
- Create: `client/src/api.js`, `client/src/auth/AuthContext.jsx`, `client/src/nav.js`, `client/src/components/{Layout,RequireRole,Field}.jsx`, `client/src/pages/Login.jsx`
- Create: `client/src/utils/{money,dates,labels,download}.js`
- Test: `client/src/utils/money.test.js`, `client/src/utils/dates.test.js`, `client/src/components/Layout.test.jsx`

**Interfaces:**
- Produces:
  - `api.get(path, query?)`, `api.post(path, body)`, `api.patch(path, body)`, `api.blob(path, query?)` (all prefixed `/api`, bearer token from localStorage); `ApiError{status, message, fields}`; `setToken`, `getToken`, `setUnauthorizedHandler`.
  - `AuthContext`, `useAuth() -> {user, loading, login(email,password), logout}`, `AuthProvider`.
  - `NAV`, `visibleNav(role) -> [{to,label,roles}]`.
  - `nairaToKobo(str) -> integer|null` (null when invalid or not 2dp; `0` returns 0), `koboToNaira(kobo) -> '1500.50'`, `formatNaira(kobo) -> '₦1,500.50'`.
  - `lagosToday(now?)`, `rangeFor('today'|'week'|'month', today?) -> {from,to}`, `formatDate(iso) -> 'dd/mm/yyyy'`.
  - `accountLabel(account) -> string`, `downloadBlob(blob, filename)`.
  - `Field({label, error, children})`: label wraps the control; the error is rendered OUTSIDE the label with `role="alert"`.

- [ ] **Step 1: Install and configure**

```bash
cd "/Users/mac/Documents/Solucio recipt and payment"
mkdir -p client/src/{auth,components,pages/admin,hooks,utils,test} && cd client
npm init -y
npm install react react-dom react-router-dom recharts
npm install -D vite @vitejs/plugin-react vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm pkg set type=module scripts.dev="vite" scripts.build="vite build" scripts.test="vitest run"
```

`client/vite.config.js`:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:5000' } },
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test/setup.js' },
});
```

`client/src/test/setup.js`:
```js
import '@testing-library/jest-dom/vitest';
```

`client/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Solucio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Write failing tests**

`client/src/utils/money.test.js`:
```js
import { nairaToKobo, koboToNaira, formatNaira } from './money';

test('nairaToKobo parses valid amounts', () => {
  expect(nairaToKobo('1,500.50')).toBe(150050);
  expect(nairaToKobo('1500')).toBe(150000);
  expect(nairaToKobo('0.5')).toBe(50);
  expect(nairaToKobo(' 20 ')).toBe(2000);
});
test('nairaToKobo rejects invalid input', () => {
  for (const bad of ['', 'abc', '10.999', '-5', '1.2.3']) expect(nairaToKobo(bad)).toBeNull();
});
test('koboToNaira and formatNaira', () => {
  expect(koboToNaira(150050)).toBe('1500.50');
  expect(formatNaira(150050)).toBe('₦1,500.50');
});
```

`client/src/utils/dates.test.js`:
```js
import { lagosToday, rangeFor, formatDate } from './dates';

test('lagosToday uses Lagos time', () => {
  expect(lagosToday(Date.parse('2026-09-20T23:30:00Z'))).toBe('2026-09-21');
});
test('rangeFor presets', () => {
  expect(rangeFor('today', '2026-09-23')).toEqual({ from: '2026-09-23', to: '2026-09-23' });
  expect(rangeFor('week', '2026-09-23')).toEqual({ from: '2026-09-21', to: '2026-09-23' }); // Monday start
  expect(rangeFor('week', '2026-09-27')).toEqual({ from: '2026-09-21', to: '2026-09-27' }); // Sunday
  expect(rangeFor('month', '2026-09-23')).toEqual({ from: '2026-09-01', to: '2026-09-23' });
});
test('formatDate is day-first in Lagos time', () => {
  expect(formatDate('2026-09-20T23:00:00.000Z')).toBe('21/09/2026');
});
```

`client/src/components/Layout.test.jsx`:
```jsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../auth/AuthContext';
import Layout from './Layout';
import { visibleNav } from '../nav';

const labels = (role) => visibleNav(role).map((i) => i.label);

test('nav items by role', () => {
  expect(labels('cashier')).toEqual(['Income']);
  expect(labels('accountant')).toEqual(['Dashboard', 'Income', 'Expenses', 'Reports']);
  expect(labels('admin')).toEqual(['Dashboard', 'Income', 'Expenses', 'Reports', 'Admin']);
});

test('Layout only renders links the role may use', () => {
  render(
    <AuthContext.Provider value={{ user: { name: 'Ada', role: 'cashier' }, logout() {} }}>
      <MemoryRouter><Layout><p>page</p></Layout></MemoryRouter>
    </AuthContext.Provider>
  );
  expect(screen.getByRole('link', { name: 'Income' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Expenses' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
  expect(screen.getByText('page')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd client && npx vitest run`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement utilities**

`client/src/utils/money.js`:
```js
export function nairaToKobo(input) {
  const s = String(input).replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [n, k = ''] = s.split('.');
  return parseInt(n, 10) * 100 + parseInt(k.padEnd(2, '0'), 10);
}
export const koboToNaira = (kobo) => (kobo / 100).toFixed(2);
export const formatNaira = (kobo) =>
  '₦' + (kobo / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
```

`client/src/utils/dates.js`:
```js
const HOUR = 3600000;

export const lagosToday = (now = Date.now()) => new Date(now + HOUR).toISOString().slice(0, 10);

export function rangeFor(preset, today = lagosToday()) {
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
  if (preset === 'week') {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return { from: d.toISOString().slice(0, 10), to: today };
  }
  throw new Error(`Unknown preset ${preset}`);
}

export function formatDate(iso) {
  const [y, m, d] = new Date(new Date(iso).getTime() + HOUR).toISOString().slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
```

`client/src/utils/labels.js`:
```js
export const accountLabel = (a) =>
  !a ? '' : a.type === 'bank' ? `${a.name} - ${a.bankName} ****${String(a.accountNumber).slice(-4)}` : a.name;
```

`client/src/utils/download.js`:
```js
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 5: Implement api, auth, nav, layout**

`client/src/api.js`:
```js
const TOKEN_KEY = 'solucio_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields || {};
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(method, path, { body, query, raw } = {}) {
  const qs = query
    ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null))
    : '';
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
  let res;
  try {
    res = await fetch(`/api${path}${qs}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 401 && !path.startsWith('/auth/login')) onUnauthorized();
  if (!res.ok) {
    let data = {};
    try { data = await res.json(); } catch { /* not JSON */ }
    throw new ApiError(res.status, data.message || 'Request failed', data.fields);
  }
  return raw ? res.blob() : res.json();
}

export const api = {
  get: (p, query) => request('GET', p, { query }),
  post: (p, body) => request('POST', p, { body }),
  patch: (p, body) => request('PATCH', p, { body }),
  blob: (p, query) => request('GET', p, { query, raw: true }),
};
```

`client/src/auth/AuthContext.jsx`:
```jsx
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from '../api';

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());
  const logout = useCallback(() => { setToken(null); setUser(null); }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) return;
    api.get('/auth/me').then((r) => setUser(r.user)).catch(logout).finally(() => setLoading(false));
  }, [logout]);

  const login = async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    setToken(r.token);
    setUser(r.user);
  };
  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}
```

`client/src/nav.js`:
```js
const FIN = ['accountant', 'admin'];
export const NAV = [
  { to: '/', label: 'Dashboard', roles: FIN },
  { to: '/income', label: 'Income', roles: ['cashier', 'accountant', 'admin'] },
  { to: '/expenses', label: 'Expenses', roles: FIN },
  { to: '/reports', label: 'Reports', roles: FIN },
  { to: '/admin', label: 'Admin', roles: ['admin'] },
];
export const visibleNav = (role) => NAV.filter((i) => i.roles.includes(role));
```

`client/src/components/Layout.jsx`:
```jsx
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { visibleNav } from '../nav';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <strong>Solucio</strong>
        <nav>
          {visibleNav(user.role).map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === '/'}>{i.label}</NavLink>
          ))}
        </nav>
        <span className="who">
          {user.name} ({user.role}) <button onClick={logout}>Sign out</button>
        </span>
      </header>
      <main>{children}</main>
    </div>
  );
}
```

`client/src/components/RequireRole.jsx`:
```jsx
import { useAuth } from '../auth/AuthContext';

export default function RequireRole({ roles, children }) {
  const { user } = useAuth();
  return roles.includes(user.role) ? children : <p className="error">You are not allowed to view this page.</p>;
}
```

`client/src/components/Field.jsx`:
```jsx
export default function Field({ label, error, children }) {
  return (
    <div className="field">
      <label>
        <span>{label}</span>
        {children}
      </label>
      {error && <small className="error" role="alert">{error}</small>}
    </div>
  );
}
```

`client/src/pages/Login.jsx`:
```jsx
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import Field from '../components/Field';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <form className="card login" onSubmit={submit}>
      <h1>Solucio</h1>
      <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
      <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
```

- [ ] **Step 6: Implement entry, App shell (page stubs come in later tasks), styles**

`client/src/main.jsx`:
```jsx
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);
```

`client/src/App.jsx` (pages are added in Tasks 12-14; until then each route renders a placeholder that those tasks replace):
```jsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import RequireRole from './components/RequireRole';
import Login from './pages/Login';

const Placeholder = ({ name }) => <p>{name} (coming in a later task)</p>;
const FIN = ['accountant', 'admin'];

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <p className="center">Loading…</p>;
  if (!user) return <Login />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={user.role === 'cashier' ? <Navigate to="/income" replace /> : <Placeholder name="Dashboard" />} />
        <Route path="/income" element={<Placeholder name="Income" />} />
        <Route path="/expenses" element={<RequireRole roles={FIN}><Placeholder name="Expenses" /></RequireRole>} />
        <Route path="/reports" element={<RequireRole roles={FIN}><Placeholder name="Reports" /></RequireRole>} />
        <Route path="/admin" element={<RequireRole roles={['admin']}><Placeholder name="Admin" /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
```

`client/src/styles.css`:
```css
:root { --bg:#f6f7f9; --card:#fff; --ink:#1c2430; --muted:#6b7683; --line:#dfe3e8; --brand:#1f6f8b; --danger:#b3261e; }
* { box-sizing: border-box; }
body { margin:0; font-family: system-ui, sans-serif; background:var(--bg); color:var(--ink); }
.topbar { display:flex; gap:24px; align-items:center; padding:12px 24px; background:var(--card); border-bottom:1px solid var(--line); }
.topbar nav { display:flex; gap:16px; flex:1; }
.topbar a { color:var(--muted); text-decoration:none; padding:4px 0; }
.topbar a.active { color:var(--brand); border-bottom:2px solid var(--brand); }
main { max-width:1100px; margin:24px auto; padding:0 16px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:16px; margin-bottom:16px; }
.login { max-width:360px; margin:15vh auto; }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; align-items:end; }
.field { display:flex; flex-direction:column; gap:4px; font-size:14px; }
.field label { display:flex; flex-direction:column; gap:4px; }
input, select, textarea, button { font:inherit; padding:8px; border:1px solid var(--line); border-radius:6px; background:#fff; }
button { cursor:pointer; background:var(--brand); color:#fff; border-color:var(--brand); }
button:disabled { opacity:.6; cursor:default; }
button.secondary { background:#fff; color:var(--brand); }
button.danger { background:var(--danger); border-color:var(--danger); }
.error { color:var(--danger); font-size:13px; }
.notice { background:#e8f4ee; border:1px solid #b9dcc6; padding:8px 12px; border-radius:6px; margin-bottom:12px; }
table { width:100%; border-collapse:collapse; font-size:14px; }
th, td { text-align:left; padding:8px; border-bottom:1px solid var(--line); }
td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; }
tr.void td { color:var(--muted); text-decoration:line-through; }
tr.void td:last-child, tr.void td.keep { text-decoration:none; }
.cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; }
.stat b { display:block; font-size:22px; margin-top:4px; }
.row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.modal { position:fixed; inset:0; background:rgba(0,0,0,.35); display:grid; place-items:center; }
.modal .card { width:min(420px,92vw); }
.center { text-align:center; margin-top:20vh; }
@media (max-width:640px) { .topbar { flex-wrap:wrap; gap:8px; } }
```

- [ ] **Step 7: Run to verify tests pass**

Run: `cd client && npx vitest run`
Expected: PASS (money, dates, Layout).

- [ ] **Step 8: Commit**

```bash
cd "/Users/mac/Documents/Solucio recipt and payment"
git add -A
git commit -m "feat: client scaffold with auth, role-based nav and utilities" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Income screen

**Files:**
- Create: `client/src/hooks/useAccounts.js`, `client/src/utils/receipt.js`, `client/src/components/{VoidDialog,IncomeForm}.jsx`, `client/src/pages/Income.jsx`
- Modify: `client/src/App.jsx`
- Test: `client/src/components/IncomeForm.test.jsx`

**Interfaces:**
- Consumes: `api`, `ApiError`, `Field`, `nairaToKobo`, `lagosToday`, `formatDate`, `formatNaira`, `accountLabel`.
- Produces:
  - `useAccounts({activeOnly=true}) -> Account[]`.
  - `viewReceipt(id, win = window.open('', '_blank'))`: fetches the PDF blob and navigates the (pre-opened) window to it; closes the window and rethrows on failure.
  - `VoidDialog({title, onConfirm(reason) -> Promise, onCancel})`.
  - `IncomeForm({accounts, onSubmit(payload) -> Promise})`; payload `{amount (kobo), date, method, accountId}`. Owns its busy state (button disabled while in flight); keeps its fields on failure and shows `err.fields` and `err.message`.

- [ ] **Step 1: Write the failing test**

`client/src/components/IncomeForm.test.jsx`:
```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IncomeForm from './IncomeForm';

const accounts = [{ _id: 'a1', name: 'Main', type: 'cash' }];

test('shows validation messages and does not submit invalid data', async () => {
  const onSubmit = vi.fn();
  render(<IncomeForm accounts={accounts} onSubmit={onSubmit} />);
  await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  expect(screen.getByText(/Enter a valid amount/)).toBeInTheDocument();
  expect(screen.getByText(/Choose the account/)).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
});

test('submits the payload in kobo', async () => {
  const onSubmit = vi.fn().mockResolvedValue();
  render(<IncomeForm accounts={accounts} onSubmit={onSubmit} />);
  await userEvent.type(screen.getByLabelText('Amount (₦)'), '1,500.50');
  await userEvent.selectOptions(screen.getByLabelText('Account'), 'a1');
  await userEvent.selectOptions(screen.getByLabelText('Method'), 'pos');
  await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  expect(onSubmit).toHaveBeenCalledWith({ amount: 150050, date: expect.any(String), method: 'pos', accountId: 'a1' });
});

test('keeps the typed amount and shows the server error when saving fails', async () => {
  const err = Object.assign(new Error('Account not found or inactive'), { fields: { accountId: 'Choose an active account' } });
  render(<IncomeForm accounts={accounts} onSubmit={vi.fn().mockRejectedValue(err)} />);
  await userEvent.type(screen.getByLabelText('Amount (₦)'), '100');
  await userEvent.selectOptions(screen.getByLabelText('Account'), 'a1');
  await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  expect(await screen.findByText('Choose an active account')).toBeInTheDocument();
  expect(screen.getByLabelText('Amount (₦)')).toHaveValue('100');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && npx vitest run src/components/IncomeForm.test.jsx`
Expected: FAIL, `Failed to resolve import './IncomeForm'`.

- [ ] **Step 3: Implement hook, helpers, components**

`client/src/hooks/useAccounts.js`:
```js
import { useEffect, useState } from 'react';
import { api } from '../api';

export function useAccounts({ activeOnly = true } = {}) {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    api.get('/accounts', activeOnly ? { active: 'true' } : {}).then(setAccounts).catch(() => setAccounts([]));
  }, [activeOnly]);
  return accounts;
}
```

`client/src/utils/receipt.js`:
```js
import { api } from '../api';

// window.open must run synchronously inside the click handler, so the window is opened
// first (default argument) and pointed at the PDF once it has downloaded.
export async function viewReceipt(id, win = window.open('', '_blank')) {
  try {
    const blob = await api.blob(`/incomes/${id}/receipt`);
    const url = URL.createObjectURL(blob);
    if (win) win.location.href = url;
    else window.open(url, '_blank');
  } catch (err) {
    if (win) win.close();
    throw err;
  }
}
```

`client/src/components/VoidDialog.jsx`:
```jsx
import { useState } from 'react';
import Field from './Field';

export default function VoidDialog({ title, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (reason.trim().length < 3) return setError('Give a reason for voiding');
    setBusy(true);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <div className="modal">
      <form className="card" onSubmit={submit}>
        <h3>{title}</h3>
        <p>The entry stays on record, marked void, and no longer counts in totals.</p>
        <Field label="Reason" error={error}>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="row">
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
          <button className="danger" disabled={busy}>Void entry</button>
        </div>
      </form>
    </div>
  );
}
```

`client/src/components/IncomeForm.jsx`:
```jsx
import { useState } from 'react';
import Field from './Field';
import { nairaToKobo } from '../utils/money';
import { lagosToday } from '../utils/dates';
import { accountLabel } from '../utils/labels';

export default function IncomeForm({ accounts, onSubmit }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(lagosToday());
  const [method, setMethod] = useState('transfer');
  const [accountId, setAccountId] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    const kobo = nairaToKobo(amount);
    if (!kobo) errs.amount = 'Enter a valid amount, e.g. 1500 or 1500.50';
    if (!accountId) errs.accountId = 'Choose the account paid into';
    if (!date) errs.date = 'Choose a date';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await onSubmit({ amount: kobo, date, method, accountId });
      setAmount('');
    } catch (err) {
      setErrors({ ...err.fields, form: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card grid" onSubmit={submit}>
      <Field label="Amount (₦)" error={errors.amount}>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Date" error={errors.date}>
        <input type="date" max={lagosToday()} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Method" error={errors.method}>
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="transfer">Bank transfer</option>
          <option value="pos">POS</option>
        </select>
      </Field>
      <Field label="Account" error={errors.accountId}>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Choose account…</option>
          {accounts.map((a) => <option key={a._id} value={a._id}>{accountLabel(a)}</option>)}
        </select>
      </Field>
      <button disabled={busy}>{busy ? 'Saving…' : 'Record payment'}</button>
      {errors.form && <p className="error" role="alert">{errors.form}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Implement the page**

`client/src/pages/Income.jsx`:
```jsx
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAccounts } from '../hooks/useAccounts';
import IncomeForm from '../components/IncomeForm';
import VoidDialog from '../components/VoidDialog';
import Field from '../components/Field';
import { viewReceipt } from '../utils/receipt';
import { formatDate } from '../utils/dates';
import { formatNaira } from '../utils/money';
import { accountLabel } from '../utils/labels';

const METHOD = { transfer: 'Bank transfer', pos: 'POS' };

export default function Income() {
  const accounts = useAccounts();
  const [filters, setFilters] = useState({ from: '', to: '', status: 'all' });
  const [data, setData] = useState({ items: [], total: 0 });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [voidId, setVoidId] = useState(null);

  const load = useCallback(() => {
    api.get('/incomes', filters).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  }, [filters]);
  useEffect(load, [load]);

  const record = async (payload) => {
    const win = window.open('', '_blank');
    let income;
    try {
      income = await api.post('/incomes', payload);
    } catch (err) {
      if (win) win.close();
      throw err;
    }
    setNotice(income);
    load();
    viewReceipt(income._id, win).catch((e) => setError(e.message));
  };

  const confirmVoid = async (reason) => {
    await api.post(`/incomes/${voidId}/void`, { reason });
    setVoidId(null);
    load();
  };
  const setFilter = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <>
      <h2>Income</h2>
      <IncomeForm accounts={accounts} onSubmit={record} />
      {notice && (
        <div className="notice">
          Recorded <b>{notice.receiptNumber}</b>.{' '}
          <button className="secondary" onClick={() => viewReceipt(notice._id).catch((e) => setError(e.message))}>View / print receipt</button>
        </div>
      )}
      <div className="card grid">
        <Field label="From"><input type="date" value={filters.from} onChange={setFilter('from')} /></Field>
        <Field label="To"><input type="date" value={filters.to} onChange={setFilter('to')} /></Field>
        <Field label="Status">
          <select value={filters.status} onChange={setFilter('status')}>
            <option value="all">All</option><option value="active">Active</option><option value="voided">Void</option>
          </select>
        </Field>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="card">
        <table>
          <thead>
            <tr><th>Date</th><th>Receipt</th><th>Method</th><th>Account</th><th className="num">Amount</th><th>Recorded by</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {data.items.map((i) => (
              <tr key={i._id} className={i.voided ? 'void' : ''}>
                <td>{formatDate(i.date)}</td>
                <td>{i.receiptNumber}</td>
                <td>{METHOD[i.method]}</td>
                <td>{accountLabel(i.account)}</td>
                <td className="num">{formatNaira(i.amount)}</td>
                <td>{i.recordedBy && i.recordedBy.name}</td>
                <td className="keep">{i.voided ? `Void: ${i.voidReason}` : 'Active'}</td>
                <td className="keep row">
                  <button className="secondary" onClick={() => viewReceipt(i._id).catch((e) => setError(e.message))}>Receipt</button>
                  {!i.voided && <button className="danger" onClick={() => setVoidId(i._id)}>Void</button>}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && <tr><td colSpan={8}>No income recorded for these filters.</td></tr>}
          </tbody>
        </table>
        <p>{data.total} entries</p>
      </div>
      {voidId && <VoidDialog title="Void this income entry?" onConfirm={confirmVoid} onCancel={() => setVoidId(null)} />}
    </>
  );
}
```

Modify `client/src/App.jsx`: add `import Income from './pages/Income';` and change the income route element to `<Income />`.

- [ ] **Step 5: Run to verify tests pass**

Run: `cd client && npx vitest run`
Expected: PASS (all client tests so far).

- [ ] **Step 6: Commit**

```bash
cd "/Users/mac/Documents/Solucio recipt and payment"
git add -A
git commit -m "feat: income screen with receipt viewing and void dialog" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 13: Expenses screen

**Files:**
- Create: `client/src/hooks/useCategories.js`, `client/src/components/{CategorySelect,ExpenseForm}.jsx`, `client/src/pages/Expenses.jsx`
- Modify: `client/src/App.jsx`
- Test: `client/src/components/CategorySelect.test.jsx`, `client/src/components/ExpenseForm.test.jsx`

**Interfaces:**
- Consumes: `api`, `Field`, `VoidDialog`, `useAccounts`, money/date/label utils.
- Produces: `useCategories() -> [{type, groups:[{name, items}]}]`; `CategorySelect({categories, value:{type,group,item}, onChange, errors})` (controlled, cascading: the Group select appears once a type is chosen, the Item select only when the group has items; changing a level resets the levels below); `ExpenseForm({accounts, categories, onSubmit})` with payload `{amount, date, accountId, type, group, item (string|null), note?}`.

- [ ] **Step 1: Write failing tests**

`client/src/components/CategorySelect.test.jsx`:
```jsx
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CategorySelect from './CategorySelect';

const CATS = [
  { type: 'Recurrent', groups: [{ name: 'Tax and Dues', items: ['PAYE', 'WHT', 'Others'] }, { name: 'Staff Wages', items: [] }] },
  { type: 'Capital', groups: [{ name: 'Equipment', items: ['Radiology'] }] },
];
function Harness() {
  const [v, setV] = useState({ type: '', group: '', item: '' });
  return <CategorySelect categories={CATS} value={v} onChange={setV} />;
}

test('groups appear after choosing a type, items after choosing a group with items', async () => {
  render(<Harness />);
  expect(screen.queryByLabelText('Group')).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText('Category type'), 'Recurrent');
  expect(screen.getByLabelText('Group')).toBeInTheDocument();
  expect(screen.queryByLabelText('Item')).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText('Group'), 'Tax and Dues');
  const options = screen.getByLabelText('Item').querySelectorAll('option');
  expect([...options].map((o) => o.textContent)).toEqual(['Choose…', 'PAYE', 'WHT', 'Others']);
});

test('leaf groups show no item select', async () => {
  render(<Harness />);
  await userEvent.selectOptions(screen.getByLabelText('Category type'), 'Recurrent');
  await userEvent.selectOptions(screen.getByLabelText('Group'), 'Staff Wages');
  expect(screen.queryByLabelText('Item')).toBeNull();
});

test('changing the type resets group and item', async () => {
  render(<Harness />);
  await userEvent.selectOptions(screen.getByLabelText('Category type'), 'Recurrent');
  await userEvent.selectOptions(screen.getByLabelText('Group'), 'Tax and Dues');
  await userEvent.selectOptions(screen.getByLabelText('Category type'), 'Capital');
  expect(screen.getByLabelText('Group')).toHaveValue('');
});
```

`client/src/components/ExpenseForm.test.jsx`:
```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExpenseForm from './ExpenseForm';

const accounts = [{ _id: 'a1', name: 'Main', type: 'cash' }];
const categories = [{ type: 'Recurrent', groups: [{ name: 'Tax and Dues', items: ['PAYE'] }, { name: 'Rents', items: [] }] }];

async function fill(amount = '250') {
  await userEvent.type(screen.getByLabelText('Amount (₦)'), amount);
  await userEvent.selectOptions(screen.getByLabelText('Account'), 'a1');
  await userEvent.selectOptions(screen.getByLabelText('Category type'), 'Recurrent');
}

test('requires category, and an item when the group has items', async () => {
  const onSubmit = vi.fn();
  render(<ExpenseForm accounts={accounts} categories={categories} onSubmit={onSubmit} />);
  await userEvent.click(screen.getByRole('button', { name: 'Record expense' }));
  expect(screen.getByText(/Choose the account/)).toBeInTheDocument();
  expect(screen.getByText(/Choose a category type/)).toBeInTheDocument();

  await fill();
  await userEvent.selectOptions(screen.getByLabelText('Group'), 'Tax and Dues');
  await userEvent.click(screen.getByRole('button', { name: 'Record expense' }));
  expect(screen.getByText(/Choose an item/)).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
});

test('submits a leaf group with a null item', async () => {
  const onSubmit = vi.fn().mockResolvedValue();
  render(<ExpenseForm accounts={accounts} categories={categories} onSubmit={onSubmit} />);
  await fill('1,000');
  await userEvent.selectOptions(screen.getByLabelText('Group'), 'Rents');
  await userEvent.click(screen.getByRole('button', { name: 'Record expense' }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    amount: 100000, accountId: 'a1', type: 'Recurrent', group: 'Rents', item: null,
  }));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd client && npx vitest run src/components/CategorySelect.test.jsx src/components/ExpenseForm.test.jsx`
Expected: FAIL, imports not found.

- [ ] **Step 3: Implement components and hook**

`client/src/hooks/useCategories.js`:
```js
import { useEffect, useState } from 'react';
import { api } from '../api';

export function useCategories() {
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    api.get('/categories').then(setCategories).catch(() => setCategories([]));
  }, []);
  return categories;
}
```

`client/src/components/CategorySelect.jsx`:
```jsx
import Field from './Field';

export default function CategorySelect({ categories, value, onChange, errors = {} }) {
  const groups = (categories.find((c) => c.type === value.type) || {}).groups || [];
  const items = (groups.find((g) => g.name === value.group) || {}).items || [];
  return (
    <>
      <Field label="Category type" error={errors.type}>
        <select value={value.type} onChange={(e) => onChange({ type: e.target.value, group: '', item: '' })}>
          <option value="">Choose…</option>
          {categories.map((c) => <option key={c.type} value={c.type}>{c.type}</option>)}
        </select>
      </Field>
      {value.type && (
        <Field label="Group" error={errors.group}>
          <select value={value.group} onChange={(e) => onChange({ ...value, group: e.target.value, item: '' })}>
            <option value="">Choose…</option>
            {groups.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
          </select>
        </Field>
      )}
      {items.length > 0 && (
        <Field label="Item" error={errors.item}>
          <select value={value.item} onChange={(e) => onChange({ ...value, item: e.target.value })}>
            <option value="">Choose…</option>
            {items.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </Field>
      )}
    </>
  );
}
```

`client/src/components/ExpenseForm.jsx`:
```jsx
import { useState } from 'react';
import Field from './Field';
import CategorySelect from './CategorySelect';
import { nairaToKobo } from '../utils/money';
import { lagosToday } from '../utils/dates';
import { accountLabel } from '../utils/labels';

export default function ExpenseForm({ accounts, categories, onSubmit }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(lagosToday());
  const [accountId, setAccountId] = useState('');
  const [cat, setCat] = useState({ type: '', group: '', item: '' });
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    const kobo = nairaToKobo(amount);
    const group = ((categories.find((c) => c.type === cat.type) || {}).groups || []).find((g) => g.name === cat.group);
    if (!kobo) errs.amount = 'Enter a valid amount, e.g. 1500 or 1500.50';
    if (!accountId) errs.accountId = 'Choose the account paid from';
    if (!date) errs.date = 'Choose a date';
    if (!cat.type) errs.type = 'Choose a category type';
    else if (!cat.group) errs.group = 'Choose a group';
    else if (group && group.items.length > 0 && !cat.item) errs.item = 'Choose an item';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await onSubmit({ amount: kobo, date, accountId, type: cat.type, group: cat.group, item: cat.item || null, note: note.trim() || undefined });
      setAmount('');
      setNote('');
    } catch (err) {
      setErrors({ ...err.fields, form: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card grid" onSubmit={submit}>
      <Field label="Amount (₦)" error={errors.amount}>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Date" error={errors.date}>
        <input type="date" max={lagosToday()} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Account" error={errors.accountId}>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Choose account…</option>
          {accounts.map((a) => <option key={a._id} value={a._id}>{accountLabel(a)}</option>)}
        </select>
      </Field>
      <CategorySelect categories={categories} value={cat} onChange={setCat} errors={{ ...errors, type: errors.type || errors.category }} />
      <Field label="Note (optional)" error={errors.note}>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </Field>
      <button disabled={busy}>{busy ? 'Saving…' : 'Record expense'}</button>
      {errors.form && <p className="error" role="alert">{errors.form}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Implement the page**

`client/src/pages/Expenses.jsx`:
```jsx
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAccounts } from '../hooks/useAccounts';
import { useCategories } from '../hooks/useCategories';
import ExpenseForm from '../components/ExpenseForm';
import VoidDialog from '../components/VoidDialog';
import Field from '../components/Field';
import { formatDate } from '../utils/dates';
import { formatNaira } from '../utils/money';
import { accountLabel } from '../utils/labels';

export default function Expenses() {
  const accounts = useAccounts();
  const categories = useCategories();
  const [filters, setFilters] = useState({ from: '', to: '', status: 'all', type: '' });
  const [data, setData] = useState({ items: [], total: 0 });
  const [error, setError] = useState('');
  const [voidId, setVoidId] = useState(null);

  const load = useCallback(() => {
    api.get('/expenses', filters).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  }, [filters]);
  useEffect(load, [load]);

  const record = async (payload) => {
    await api.post('/expenses', payload);
    load();
  };
  const confirmVoid = async (reason) => {
    await api.post(`/expenses/${voidId}/void`, { reason });
    setVoidId(null);
    load();
  };
  const setFilter = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <>
      <h2>Expenses</h2>
      <ExpenseForm accounts={accounts} categories={categories} onSubmit={record} />
      <div className="card grid">
        <Field label="From"><input type="date" value={filters.from} onChange={setFilter('from')} /></Field>
        <Field label="To"><input type="date" value={filters.to} onChange={setFilter('to')} /></Field>
        <Field label="Type">
          <select value={filters.type} onChange={setFilter('type')}>
            <option value="">All</option>
            {categories.map((c) => <option key={c.type} value={c.type}>{c.type}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={filters.status} onChange={setFilter('status')}>
            <option value="all">All</option><option value="active">Active</option><option value="voided">Void</option>
          </select>
        </Field>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="card">
        <table>
          <thead>
            <tr><th>Date</th><th>Category</th><th>Account</th><th className="num">Amount</th><th>Note</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {data.items.map((e) => (
              <tr key={e._id} className={e.voided ? 'void' : ''}>
                <td>{formatDate(e.date)}</td>
                <td>{[e.type, e.group, e.item].filter(Boolean).join(' › ')}</td>
                <td>{accountLabel(e.account)}</td>
                <td className="num">{formatNaira(e.amount)}</td>
                <td>{e.note}</td>
                <td className="keep">{e.voided ? `Void: ${e.voidReason}` : 'Active'}</td>
                <td className="keep">{!e.voided && <button className="danger" onClick={() => setVoidId(e._id)}>Void</button>}</td>
              </tr>
            ))}
            {data.items.length === 0 && <tr><td colSpan={7}>No expenses recorded for these filters.</td></tr>}
          </tbody>
        </table>
        <p>{data.total} entries</p>
      </div>
      {voidId && <VoidDialog title="Void this expense?" onConfirm={confirmVoid} onCancel={() => setVoidId(null)} />}
    </>
  );
}
```

Modify `client/src/App.jsx`: add `import Expenses from './pages/Expenses';` and change the expenses route child to `<Expenses />`.

- [ ] **Step 5: Run to verify tests pass**

Run: `cd client && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd "/Users/mac/Documents/Solucio recipt and payment"
git add -A
git commit -m "feat: expenses screen with cascading category select" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 14: Dashboard and Reports screens

**Files:**
- Create: `client/src/components/DateRange.jsx`, `client/src/pages/Dashboard.jsx`, `client/src/pages/Reports.jsx`
- Modify: `client/src/App.jsx`
- Test: `client/src/components/DateRange.test.jsx`

**Interfaces:**
- Consumes: `api`, `rangeFor`, `formatNaira`, `downloadBlob`, `accountLabel`, `Field`.
- Produces: `DateRange({value:{from,to}, onChange})` with Today / This week / This month presets and two date inputs. Dashboard shows income, spending and net cards plus balance per account. Reports shows the spending-by-category chart and table and the export controls.

- [ ] **Step 1: Write the failing test**

`client/src/components/DateRange.test.jsx`:
```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DateRange from './DateRange';

test('presets call onChange with a from/to range', async () => {
  const onChange = vi.fn();
  render(<DateRange value={{ from: '2026-01-01', to: '2026-01-31' }} onChange={onChange} />);
  await userEvent.click(screen.getByRole('button', { name: 'Today' }));
  const arg = onChange.mock.calls[0][0];
  expect(arg.from).toBe(arg.to);
  expect(arg.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('editing a date input keeps the other end', async () => {
  const onChange = vi.fn();
  render(<DateRange value={{ from: '2026-01-01', to: '2026-01-31' }} onChange={onChange} />);
  const from = screen.getByLabelText('From');
  await userEvent.clear(from);
  await userEvent.type(from, '2026-01-05');
  expect(onChange).toHaveBeenLastCalledWith({ from: '2026-01-05', to: '2026-01-31' });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && npx vitest run src/components/DateRange.test.jsx`
Expected: FAIL, `Failed to resolve import './DateRange'`.

- [ ] **Step 3: Implement**

`client/src/components/DateRange.jsx`:
```jsx
import Field from './Field';
import { rangeFor } from '../utils/dates';

export default function DateRange({ value, onChange }) {
  return (
    <div className="card row">
      <button type="button" className="secondary" onClick={() => onChange(rangeFor('today'))}>Today</button>
      <button type="button" className="secondary" onClick={() => onChange(rangeFor('week'))}>This week</button>
      <button type="button" className="secondary" onClick={() => onChange(rangeFor('month'))}>This month</button>
      <Field label="From"><input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} /></Field>
      <Field label="To"><input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} /></Field>
    </div>
  );
}
```

`client/src/pages/Dashboard.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { api } from '../api';
import DateRange from '../components/DateRange';
import { rangeFor } from '../utils/dates';
import { formatNaira } from '../utils/money';
import { accountLabel } from '../utils/labels';

export default function Dashboard() {
  const [range, setRange] = useState(rangeFor('month'));
  const [summary, setSummary] = useState(null);
  const [balances, setBalances] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!range.from || !range.to) return;
    api.get('/reports/summary', range).then((s) => { setSummary(s); setError(''); }).catch((e) => setError(e.message));
  }, [range]);
  useEffect(() => {
    api.get('/reports/account-balances').then(setBalances).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <h2>Dashboard</h2>
      <DateRange value={range} onChange={setRange} />
      {error && <p className="error" role="alert">{error}</p>}
      {summary && (
        <div className="cards">
          <div className="card stat">Income ({summary.income.count})<b>{formatNaira(summary.income.total)}</b></div>
          <div className="card stat">Spending ({summary.spending.count})<b>{formatNaira(summary.spending.total)}</b></div>
          <div className="card stat">Net<b>{formatNaira(summary.net)}</b></div>
        </div>
      )}
      <h3>Balance per account</h3>
      {balances && (
        <div className="card">
          <table>
            <thead><tr><th>Account</th><th className="num">Opening</th><th className="num">In</th><th className="num">Out</th><th className="num">Balance</th></tr></thead>
            <tbody>
              {balances.accounts.map((a) => (
                <tr key={a.accountId}>
                  <td>{accountLabel(a)}{!a.active && ' (inactive)'}</td>
                  <td className="num">{formatNaira(a.openingBalance)}</td>
                  <td className="num">{formatNaira(a.totalIn)}</td>
                  <td className="num">{formatNaira(a.totalOut)}</td>
                  <td className="num"><b>{formatNaira(a.balance)}</b></td>
                </tr>
              ))}
              <tr><td colSpan={4}><b>All accounts</b></td><td className="num"><b>{formatNaira(balances.grandTotal)}</b></td></tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
```

`client/src/pages/Reports.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import DateRange from '../components/DateRange';
import Field from '../components/Field';
import { rangeFor } from '../utils/dates';
import { formatNaira } from '../utils/money';
import { downloadBlob } from '../utils/download';

export default function Reports() {
  const [range, setRange] = useState(rangeFor('month'));
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [exportType, setExportType] = useState('summary');
  const [format, setFormat] = useState('xlsx');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!range.from || !range.to) return;
    api.get('/reports/spending-by-category', range).then((r) => { setReport(r); setError(''); }).catch((e) => setError(e.message));
  }, [range]);

  const chart = report ? report.types.flatMap((t) => t.groups.map((g) => ({ name: `${t.type}: ${g.group}`, naira: g.total / 100 }))) : [];

  const exportFile = async () => {
    setBusy(true);
    try {
      const blob = await api.blob('/reports/export', { type: exportType, format, ...range });
      downloadBlob(blob, `solucio-${exportType}-${range.from}_to_${range.to}.${format}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2>Reports</h2>
      <DateRange value={range} onChange={setRange} />
      {error && <p className="error" role="alert">{error}</p>}

      <div className="card row">
        <Field label="Export">
          <select value={exportType} onChange={(e) => setExportType(e.target.value)}>
            <option value="summary">Summary</option><option value="income">Income</option><option value="expenses">Expenses</option>
          </select>
        </Field>
        <Field label="Format">
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="xlsx">Excel</option><option value="pdf">PDF</option>
          </select>
        </Field>
        <button onClick={exportFile} disabled={busy}>{busy ? 'Preparing…' : 'Download'}</button>
      </div>

      <h3>Spending by category</h3>
      {report && report.grandTotal === 0 && <p>No spending in this period.</p>}
      {report && report.grandTotal > 0 && (
        <>
          <div className="card">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chart}>
                <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={80} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => v.toLocaleString()} />
                <Tooltip formatter={(v) => formatNaira(v * 100)} />
                <Bar dataKey="naira" fill="#1f6f8b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card">
            <table>
              <thead><tr><th>Category</th><th className="num">Amount</th><th className="num">% of spending</th></tr></thead>
              <tbody>
                {report.types.map((t) => [
                  <tr key={t.type}><td><b>{t.type}</b></td><td className="num"><b>{formatNaira(t.total)}</b></td><td className="num">{t.percent}%</td></tr>,
                  ...t.groups.flatMap((g) => [
                    <tr key={`${t.type}|${g.group}`}><td style={{ paddingLeft: 24 }}>{g.group}</td><td className="num">{formatNaira(g.total)}</td><td className="num">{g.percent}%</td></tr>,
                    ...g.items.map((i) => (
                      <tr key={`${t.type}|${g.group}|${i.item}`}><td style={{ paddingLeft: 48 }}>{i.item}</td><td className="num">{formatNaira(i.total)}</td><td className="num">{i.percent}%</td></tr>
                    )),
                  ]),
                ])}
                <tr><td><b>Total</b></td><td className="num"><b>{formatNaira(report.grandTotal)}</b></td><td /></tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
```

Modify `client/src/App.jsx`: add imports `Dashboard from './pages/Dashboard'` and `Reports from './pages/Reports'`; replace the Dashboard placeholder (the non-cashier branch of the `/` route) with `<Dashboard />` and the reports route child with `<Reports />`.

- [ ] **Step 4: Run to verify tests pass**

Run: `cd client && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/mac/Documents/Solucio recipt and payment"
git add -A
git commit -m "feat: dashboard, spending-by-category report and exports" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 15: Admin screen (users and accounts)

**Files:**
- Create: `client/src/pages/Admin.jsx`, `client/src/pages/admin/UsersAdmin.jsx`, `client/src/pages/admin/AccountsAdmin.jsx`
- Modify: `client/src/App.jsx`
- Test: `client/src/pages/admin/AccountsAdmin.test.jsx`

**Interfaces:**
- Consumes: `api`, `Field`, `nairaToKobo`, `koboToNaira`, `formatNaira`, `useAuth`.
- Produces: `Admin` page with Users and Accounts tabs. `AccountsAdmin` creates (name, type, bank name, account number, opening balance) and edits (everything except type) and activates/deactivates. `UsersAdmin` creates users, changes roles, and activates/deactivates (controls are disabled on the signed-in admin's own row).

- [ ] **Step 1: Write the failing test**

`client/src/pages/admin/AccountsAdmin.test.jsx`:
```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountsAdmin from './AccountsAdmin';
import { api } from '../../api';

vi.mock('../../api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

beforeEach(() => {
  api.get.mockResolvedValue([]);
  api.post.mockResolvedValue({});
});

test('bank accounts require a bank name and number before saving', async () => {
  render(<AccountsAdmin />);
  await userEvent.type(await screen.findByLabelText('Name'), 'Ops');
  await userEvent.click(screen.getByRole('button', { name: 'Save account' }));
  expect(screen.getByText(/Enter the bank name/)).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

test('posts the opening balance in kobo', async () => {
  render(<AccountsAdmin />);
  await userEvent.type(await screen.findByLabelText('Name'), 'Ops');
  await userEvent.type(screen.getByLabelText('Bank name'), 'Zenith');
  await userEvent.type(screen.getByLabelText('Account number'), '1234567890');
  await userEvent.type(screen.getByLabelText('Opening balance (₦)'), '5,000.25');
  await userEvent.click(screen.getByRole('button', { name: 'Save account' }));
  expect(api.post).toHaveBeenCalledWith('/accounts', {
    name: 'Ops', type: 'bank', bankName: 'Zenith', accountNumber: '1234567890', openingBalance: 500025,
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && npx vitest run src/pages/admin/AccountsAdmin.test.jsx`
Expected: FAIL, `Failed to resolve import './AccountsAdmin'`.

- [ ] **Step 3: Implement**

`client/src/pages/admin/AccountsAdmin.jsx`:
```jsx
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import Field from '../../components/Field';
import { formatNaira, koboToNaira, nairaToKobo } from '../../utils/money';

const EMPTY = { name: '', type: 'bank', bankName: '', accountNumber: '', opening: '0' };

export default function AccountsAdmin() {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/accounts').then(setAccounts).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    const opening = nairaToKobo(form.opening === '' ? '0' : form.opening);
    if (!form.name.trim()) errs.name = 'Enter a name';
    if (opening === null) errs.opening = 'Enter a valid amount';
    if (form.type === 'bank') {
      if (!form.bankName.trim()) errs.bankName = 'Enter the bank name';
      if (!/^\d{4,20}$/.test(form.accountNumber.trim())) errs.accountNumber = 'Enter the account number (4-20 digits)';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = { name: form.name.trim(), openingBalance: opening };
    if (form.type === 'bank') Object.assign(body, { bankName: form.bankName.trim(), accountNumber: form.accountNumber.trim() });
    try {
      if (editingId) await api.patch(`/accounts/${editingId}`, body);
      else await api.post('/accounts', { ...body, type: form.type });
      setForm(EMPTY);
      setEditingId(null);
      setError('');
      load();
    } catch (err) {
      setErrors(err.fields || {});
      setError(err.message);
    }
  };

  const edit = (a) => {
    setEditingId(a._id);
    setForm({ name: a.name, type: a.type, bankName: a.bankName || '', accountNumber: a.accountNumber || '', opening: koboToNaira(a.openingBalance) });
  };
  const toggle = (a) => api.patch(`/accounts/${a._id}`, { active: !a.active }).then(load).catch((e) => setError(e.message));

  return (
    <>
      <form className="card grid" onSubmit={submit}>
        <Field label="Name" error={errors.name}><input value={form.name} onChange={set('name')} /></Field>
        <Field label="Type">
          <select value={form.type} onChange={set('type')} disabled={!!editingId}>
            <option value="bank">Bank</option><option value="cash">Cash</option>
          </select>
        </Field>
        {form.type === 'bank' && (
          <>
            <Field label="Bank name" error={errors.bankName}><input value={form.bankName} onChange={set('bankName')} /></Field>
            <Field label="Account number" error={errors.accountNumber}><input value={form.accountNumber} onChange={set('accountNumber')} /></Field>
          </>
        )}
        <Field label="Opening balance (₦)" error={errors.opening}><input inputMode="decimal" value={form.opening} onChange={set('opening')} /></Field>
        <div className="row">
          <button>{editingId ? 'Update account' : 'Save account'}</button>
          {editingId && <button type="button" className="secondary" onClick={() => { setEditingId(null); setForm(EMPTY); }}>Cancel</button>}
        </div>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Bank</th><th className="num">Opening balance</th><th>Status</th><th /></tr></thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a._id}>
                <td>{a.name}</td><td>{a.type}</td>
                <td>{a.type === 'bank' ? `${a.bankName} ${a.accountNumber}` : '-'}</td>
                <td className="num">{formatNaira(a.openingBalance)}</td>
                <td>{a.active ? 'Active' : 'Inactive'}</td>
                <td className="row">
                  <button className="secondary" onClick={() => edit(a)}>Edit</button>
                  <button className="secondary" onClick={() => toggle(a)}>{a.active ? 'Deactivate' : 'Activate'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

`client/src/pages/admin/UsersAdmin.jsx`:
```jsx
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import Field from '../../components/Field';

const ROLES = ['cashier', 'accountant', 'admin'];
const EMPTY = { name: '', email: '', password: '', role: 'cashier' };

export default function UsersAdmin() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/users').then(setUsers).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/users', form);
      setForm(EMPTY);
      setErrors({});
      setError('');
      load();
    } catch (err) {
      setErrors(err.fields || {});
      setError(err.message);
    }
  };
  const patch = (u, body) => api.patch(`/users/${u._id}`, body).then(load).catch((e) => setError(e.message));

  return (
    <>
      <form className="card grid" onSubmit={submit}>
        <Field label="Name" error={errors.name}><input value={form.name} onChange={set('name')} required /></Field>
        <Field label="Email" error={errors.email}><input type="email" value={form.email} onChange={set('email')} required /></Field>
        <Field label="Password" error={errors.password}><input type="password" value={form.password} onChange={set('password')} required /></Field>
        <Field label="Role">
          <select value={form.role} onChange={set('role')}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
        </Field>
        <button>Add user</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead>
          <tbody>
            {users.map((u) => {
              const self = u._id === me._id;
              return (
                <tr key={u._id}>
                  <td>{u.name}</td><td>{u.email}</td>
                  <td>
                    <select value={u.role} disabled={self} onChange={(e) => patch(u, { role: e.target.value })}>
                      {ROLES.map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>{u.active ? 'Active' : 'Inactive'}</td>
                  <td><button className="secondary" disabled={self} onClick={() => patch(u, { active: !u.active })}>{u.active ? 'Deactivate' : 'Activate'}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

`client/src/pages/Admin.jsx`:
```jsx
import { useState } from 'react';
import UsersAdmin from './admin/UsersAdmin';
import AccountsAdmin from './admin/AccountsAdmin';

export default function Admin() {
  const [tab, setTab] = useState('accounts');
  return (
    <>
      <h2>Admin</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={tab === 'accounts' ? '' : 'secondary'} onClick={() => setTab('accounts')}>Accounts</button>
        <button className={tab === 'users' ? '' : 'secondary'} onClick={() => setTab('users')}>Users</button>
      </div>
      {tab === 'accounts' ? <AccountsAdmin /> : <UsersAdmin />}
    </>
  );
}
```

Modify `client/src/App.jsx`: add `import Admin from './pages/Admin';` and replace the admin route child with `<Admin />`. Remove the now-unused `Placeholder` component.

- [ ] **Step 4: Run all client tests and a production build**

Run: `cd client && npx vitest run && npm run build`
Expected: all tests PASS and the build completes without errors.

- [ ] **Step 5: Commit**

```bash
cd "/Users/mac/Documents/Solucio recipt and payment"
git add -A
git commit -m "feat: admin screens for accounts and users" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 16: README and end-to-end verification

**Files:**
- Create: `README.md`

**Interfaces:** none.

- [ ] **Step 1: Write the README**

`README.md`:
```markdown
# Solucio

Hospital payments, receipts and spending tracker (MongoDB, Express, React, Node).

## Setup

Requires Node 20+ and a MongoDB instance.

    cd server && cp .env.example .env    # set MONGODB_URI, JWT_SECRET, HOSPITAL_NAME, ADMIN_*
    npm install && npm run seed:admin    # creates the first admin
    npm run dev                          # API on :5000

    cd client && npm install && npm run dev   # app on :5173 (proxies /api to :5000)

## Tests

    cd server && npm test
    cd client && npm test

## Rules worth knowing

- Money is stored as integer kobo. Dates are Africa/Lagos days.
- Income and expenses can never be edited or deleted, only voided with a reason. Voided entries stay listed and never count in totals or balances.
- Receipt numbers are `RCP-YYYY-NNNN`, per year, and are never reused.
- Roles: cashier (income), accountant (income, expenses, reports), admin (everything plus users and accounts).
- Expense categories live in `server/src/config/categories.js`.
```

- [ ] **Step 2: Run both full suites**

Run: `cd server && npm test && cd ../client && npx vitest run`
Expected: all suites PASS.

- [ ] **Step 3: Manual end-to-end pass**

Start MongoDB, the API and the client. Then, in a browser, as an admin and following the steps in order:
1. Sign in. In Admin, create a bank account "Ops / Zenith / 1234567890" with opening balance 5,000.00 and a cash account "Petty cash" with 0.
2. In Admin, add one cashier and one accountant. Sign in as the cashier: only "Income" appears in the menu.
3. As the cashier, record 1,500.50 by transfer into "Ops". The receipt PDF opens showing `RCP-<year>-0001`, "NGN 1,500.50", the amount in words, the account and "Recorded by". Record a second payment by POS into "Petty cash".
4. Void the first receipt with a reason. It stays listed as void; re-open its receipt and confirm the VOID watermark and reason. Record the corrected payment and confirm it is `...-0003`.
5. As the accountant, record expenses: Recurrent > Hospital Consumables > Oxygen, Recurrent > Staff Wages (no item dropdown), Capital > Equipment > Radiology. Void one.
6. Dashboard for "This month": income, spending and net match a hand calculation that ignores voided rows. Balance per account equals opening + in - out for each account.
7. Reports: the chart and table match. Download Summary, Income and Expenses as Excel and as PDF; voided rows are marked and excluded from totals.
8. Stop the API and try saving a payment: the form keeps its values and shows the connection message. Restart the API and save again.
9. Deactivate the cashier in Admin: their next request returns them to the sign-in screen.

- [ ] **Step 4: Commit**

```bash
cd "/Users/mac/Documents/Solucio recipt and payment"
git add -A
git commit -m "docs: README with setup, tests and business rules" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

