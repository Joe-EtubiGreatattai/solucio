const Category = require('../models/Category');
const AppError = require('../utils/AppError');
const { DEFAULT_CATEGORIES } = require('../config/categories');

const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const dup = (what) => new AppError(409, `A ${what} with that name already exists here`, { name: 'Already exists' });
const active = (node) => node.active !== false;

// Copies the shipped list into the database once. Never overwrites what an admin has since changed.
async function ensureDefaultCategories() {
  if ((await Category.countDocuments()) > 0) return;
  const docs = Object.entries(DEFAULT_CATEGORIES).map(([name, groups], order) => ({
    name,
    order,
    groups: Object.entries(groups).map(([group, items]) => ({ name: group, items: items.map((item) => ({ name: item })) })),
  }));
  try {
    await Category.insertMany(docs);
  } catch (err) {
    if (err.code !== 11000) throw err; // another process seeded first
  }
}

// The whole tree. Forms use the active part; reports and the admin screen also need hidden nodes.
async function getTree({ includeInactive = false } = {}) {
  const docs = await Category.find().sort({ order: 1, createdAt: 1 }).lean();
  const keep = (node) => includeInactive || active(node);
  return docs.filter(keep).map((c) => ({
    type: c.name,
    active: active(c),
    groups: c.groups.filter(keep).map((g) => ({
      name: g.name,
      active: active(g),
      items: g.items.filter(keep).map((i) => ({ name: i.name, active: active(i) })),
    })),
  }));
}

// What the expense form needs: only what can be used now, with items as plain names.
async function publicTree() {
  return (await getTree()).map((c) => ({ type: c.type, groups: c.groups.map((g) => ({ name: g.name, items: g.items.map((i) => i.name) })) }));
}

// A new expense must use an active category > group, and an active item whenever the group has any.
async function assertValidCategory(type, group, item) {
  const bad = () => new AppError(400, 'Choose a valid category', { category: 'Choose a valid category' });
  const category = await Category.findOne({ name: type, active: true }).lean();
  if (!category) throw bad();
  const g = category.groups.find((x) => x.name === group && active(x));
  if (!g) throw bad();
  const items = g.items.filter(active);
  if (items.length === 0) {
    if (item) throw bad();
    return;
  }
  if (!items.some((i) => i.name === item)) throw bad();
}

async function load(type) {
  const category = await Category.findOne({ name: type });
  if (!category) throw new AppError(404, 'Category not found');
  return category;
}
async function save(category) {
  try {
    await category.save();
  } catch (err) {
    if (err.name === 'VersionError') throw new AppError(409, 'Someone else just changed the categories. Reload and try again.');
    throw err;
  }
  return category;
}

async function addType(name) {
  const last = await Category.findOne().sort({ order: -1 }).lean();
  try {
    return await Category.create({ name, order: last ? last.order + 1 : 0 });
  } catch (err) {
    if (err.code === 11000) throw dup('category');
    throw err;
  }
}
async function addGroup(type, name) {
  const category = await load(type);
  if (category.groups.some((g) => same(g.name, name))) throw dup('group');
  category.groups.push({ name });
  return save(category);
}
async function addItem(type, group, name) {
  const category = await load(type);
  const g = category.groups.find((x) => x.name === group);
  if (!g) throw new AppError(404, 'Group not found');
  if (g.items.some((i) => same(i.name, name))) throw dup('item');
  g.items.push({ name });
  return save(category);
}
async function setActive({ type, group, item, active: on }) {
  const category = await load(type);
  if (!group) {
    category.active = on;
  } else {
    const g = category.groups.find((x) => x.name === group);
    if (!g) throw new AppError(404, 'Group not found');
    if (!item) {
      g.active = on;
    } else {
      const i = g.items.find((x) => x.name === item);
      if (!i) throw new AppError(404, 'Item not found');
      i.active = on;
    }
  }
  return save(category);
}

// Remove a category, group or item for good, but only when nothing points at it: expenses store category
// names, so removing one in use would leave those records (and statements awaiting approval) dangling.
async function removeNode({ type, group, item }) {
  const Expense = require('../models/Expense');
  const Statement = require('../models/Statement');
  const category = await load(type);
  const g = group ? category.groups.find((x) => x.name === group) : null;
  if (group && !g) throw new AppError(404, 'Group not found');
  const i = item ? g.items.find((x) => x.name === item) : null;
  if (item && !i) throw new AppError(404, 'Item not found');

  const match = { type, ...(group && { group }), ...(item && { item }) };
  const label = `"${item || group || type}"`;
  const expenses = await Expense.countDocuments(match);
  if (expenses) {
    throw new AppError(409, `${label} is used by ${expenses} expense${expenses === 1 ? '' : 's'}. Hide it instead, so those records keep their category.`);
  }
  const statements = await Statement.countDocuments({ status: 'review', transactions: { $elemMatch: match } });
  if (statements) {
    throw new AppError(409, `${label} is used in ${statements} bank statement${statements === 1 ? '' : 's'} still in review. Change those transactions first, or hide it instead.`);
  }

  if (item) g.items.splice(g.items.indexOf(i), 1);
  else if (group) category.groups.splice(category.groups.indexOf(g), 1);
  else {
    await category.deleteOne();
    return category;
  }
  return save(category);
}

module.exports = { ensureDefaultCategories, getTree, publicTree, assertValidCategory, addType, addGroup, addItem, setActive, removeNode };
