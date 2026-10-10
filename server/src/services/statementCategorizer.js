const Statement = require('../models/Statement');
const { publicTree } = require('./categories');

// Keyword rules point at category *names*; they are resolved against the live tree at run time, so an
// admin renaming or hiding a category never produces a suggestion that would fail on approval.
// A trailing * means "starts with" (PHARM* matches PHARMACY, PHARMACEUTICALS). Order sets priority.
const RULES = [
  { group: 'Staff Wages', words: ['SALARY', 'SALARIES', 'PAYROLL', 'WAGE', 'WAGES', 'STIPEND', 'OVERTIME', 'STAFF PAY', 'ALLOWANCE*'] },
  { group: 'Tax and Dues', item: 'PAYE', words: ['PAYE', 'PERSONAL INCOME TAX', 'INTERNAL REVENUE', 'IRS'] },
  { group: 'Tax and Dues', item: 'WHT', words: ['WHT', 'WITHHOLDING'] },
  { group: 'Hospital Consumables', item: 'Oxygen', words: ['OXYGEN', 'O2 CYLINDER*', 'CYLINDER REFILL'] },
  { group: 'Servicing & Maintenance', item: 'Electricity', words: ['IBEDC', 'IKEDC', 'EKEDC', 'AEDC', 'PHED', 'EEDC', 'KEDCO', 'JEDC', 'BEDC', 'YEDC', 'KAEDCO', 'ELECTRICITY', 'PREPAID METER', 'POSTPAID METER', 'NEPA', 'POWER BILL', 'DISCO'] },
  { group: 'Servicing & Maintenance', item: 'Data & Airtime', words: ['AIRTEL', 'MTN', 'GLO', '9MOBILE', 'ETISALAT', 'AIRTIME', 'DATA', 'RECHARGE', 'SPECTRANET', 'SMILE', 'IPNX', 'STARLINK', 'INTERNET', 'BROADBAND', 'WIFI', 'VTU'] },
  { group: 'Servicing & Maintenance', item: 'Fuel', words: ['FUEL', 'DIESEL', 'PETROL', 'PMS', 'AGO', 'FILLING STATION', 'NNPC', 'TOTALENERGIES', 'OANDO', 'CONOIL', 'ARDOVA', 'ETERNA'] },
  { group: 'Servicing & Maintenance', item: 'Gas', words: ['LPG', 'COOKING GAS', 'GAS REFILL', 'GAS'] },
  { group: 'Servicing & Maintenance', item: 'Plumbing', words: ['PLUMB*', 'BOREHOLE', 'WATER PUMP', 'SOAKAWAY', 'SEPTIC'] },
  { group: 'Servicing & Maintenance', item: 'Electrical', words: ['ELECTRICIAN*', 'REWIR*', 'GENERATOR REPAIR', 'GEN REPAIR', 'INVERTER*', 'AC REPAIR', 'AIR CONDITION*'] },
  { group: 'Hospital Consumables', item: 'Drugs', words: ['PHARM*', 'DRUG*', 'MEDICINE*', 'MEDICATION*', 'EMZOR', 'FIDSON', 'MAY AND BAKER', 'MAY & BAKER', 'HEALTHPLUS', 'MEDPLUS', 'SWIPHA', 'JUHEL', 'VACCINE*', 'INJECTION*', 'INFUSION*', 'ANTIBIOTIC*'] },
  { group: 'Hospital Consumables', item: 'Laboratory Consumables', words: ['REAGENT*', 'TEST KIT*', 'TEST STRIP*', 'LAB CONSUMABLE*', 'VACUTAINER*', 'SAMPLE BOTTLE*', 'RAPID TEST*'] },
  { group: 'Hospital Consumables', item: 'Theatre Consumables', words: ['SUTURE*', 'SURGICAL', 'BIOPSY', 'CATHETER*', 'CANNULA*', 'GAUZE', 'SYRINGE*', 'GLOVE*'] },
  { group: 'Hospital Consumables', item: 'Toiletries & Stationeries', confidence: 'medium', words: ['STATIONER*', 'TOILETR*', 'TISSUE*', 'DETERGENT*', 'DISINFECTANT*', 'SOAP', 'TONER*', 'PRINTING', 'A4 PAPER', 'SUPERMARKET*'] },
  { group: 'Outsource Services', item: 'Specialist Consultation', words: ['CONSULTANT*', 'CONSULTANCY', 'CONSUL', 'SPECIALIST*', 'LOCUM', 'CONSULTATION*'] },
  { group: 'Outsource Services', item: 'Laboratory', words: ['LANCET', 'SYNLAB', 'DIAGNOSTIC*', 'PATHOLOG*', 'HISTOPATHOLOG*', 'OUTSOURCED LAB*', 'LAB TEST*', 'LAB INVESTIGATION*'] },
  { group: 'Outsource Services', item: 'Opticals', words: ['OPTICAL*', 'OPTICIAN*', 'SPECTACLE*', 'EYEGLASS*', 'LENS', 'LENSES'] },
  { group: 'Rents', words: ['RENT', 'RENTAL', 'LEASE', 'LANDLORD'] },
  { group: 'Charity', confidence: 'medium', words: ['DONATION*', 'CHARITY', 'OFFERING', 'TITHE', 'ZAKAT', 'WELFARE'] },
  { group: 'Tax and Dues', item: 'Others', confidence: 'medium', words: ['FIRS', 'TAX', 'TAXES', 'LEVY', 'PENSION', 'NHF', 'NSITF', 'LICENSE', 'LICENCE', 'PERMIT', 'DUES'] },
  { type: 'Capital', group: 'Equipment', item: 'Radiology', confidence: 'medium', words: ['X RAY', 'XRAY', 'ULTRASOUND', 'RADIOLOG*', 'CT SCAN', 'MRI'] },
  { type: 'Capital', group: 'Equipment', item: 'Laboratory', confidence: 'medium', words: ['MICROSCOPE*', 'CENTRIFUGE*', 'ANALYZER*', 'ANALYSER*', 'INCUBATOR*', 'HAEMATOLOGY', 'HEMATOLOGY'] },
  { type: 'Capital', group: 'Equipment', item: 'Theatre', confidence: 'medium', words: ['AUTOCLAVE*', 'DIATHERMY', 'OPERATING TABLE', 'ANAESTHE*', 'ANESTHE*'] },
  { type: 'Capital', group: 'Equipment', item: 'Ophthalmology', confidence: 'medium', words: ['SLIT LAMP', 'OPHTHALM*', 'TONOMETER*', 'AUTOREFRACT*'] },
  { type: 'Capital', group: 'Equipment', item: 'Nursing', confidence: 'medium', words: ['SPHYGMO*', 'STETHOSCOPE*', 'WHEELCHAIR*', 'HOSPITAL BED*', 'NEBULI*', 'CONCENTRATOR*', 'PULSE OXIMETER*', 'THERMOMETER*', 'PATIENT MONITOR*'] },
  { type: 'Capital', group: 'Structural', item: 'Furniture', confidence: 'medium', words: ['FURNITURE', 'CHAIRS', 'OFFICE CHAIR*', 'DESK', 'DESKS', 'CABINET*', 'WARDROBE*', 'SHELVES', 'CARPENTER*'] },
  { type: 'Capital', group: 'Structural', item: 'Building', confidence: 'medium', words: ['CEMENT', 'BLOCKS', 'GRANITE', 'IRON ROD*', 'ROOFING', 'TILES', 'PAINT*', 'CONSTRUCTION', 'BUILDER*', 'MASON*', 'RENOVATION'] },
  { type: 'Capital', group: 'Structural', item: 'Plumbing', confidence: 'medium', words: ['PVC', 'PIPES', 'WATER TANK', 'GEEPEE TANK', 'WATER HEATER*'] },
  { type: 'Capital', group: 'Structural', item: 'Electricals', confidence: 'medium', words: ['CABLES', 'WIRING', 'ELECTRICAL FITTING*', 'SOCKETS', 'BULBS', 'TRANSFORMER*'] },
];

// Bank charges are unambiguous and must be caught before payee learning: "COMMISSION MOBILE TRF TO ADA"
// is the bank's fee on a transfer to Ada, not another payment to Ada.
const CHARGE_START = /^(?:COMMISSION\b|VAT\b|HANDLING CHARGE|SMS ALERT|FGN STAMP DUTY|STAMP DUTY|EMTL\b|NIP CHARGE|TRANSFER CHARGE|CHARGES?\b|ACC(?:OUN)?T MAINT|COT\b)/i;
const CHARGE_ANY = /POS COMM(?:ISSION)? SETTLEMENT|SMS CHARGE|CHARGE\s*\+\s*VAT|SMS ALERT FEE|STAMP DUTY|MAINT(?:ENANCE)? FEE|E-?STATEMENT|CARD ISSUANCE|CARD MAINT|MONEY TRANSFER LEVY|\bEMTL\b|TOKEN FEE|CHEQUE BOOK/i;

const PROCESSORS = /\b(?:PAYSTACK|FLUTTERWAVE|MONIEPOINT|OPAY|PALMPAY|INTERSWITCH|REMITA|PAYONEER|RAENEST|LEMFI|SETTLEMENT|POS SETTLEMENT|TEAMAPT)\b/i;
const HMOS = /\b(?:HMO|NHIS|NHIA|HYGEIA|AXA MANSARD|RELIANCE|LEADWAY|AVON|CLEARLINE|HEALTHCARE INTERNATIONAL|TOTAL HEALTH TRUST|PROHEALTH|REDCARE|WELLNESS HMO)\b/i;
const INBOUND = /\b(?:TFR|TRF|FRM|TRANSFER|TRSF|NIP|USSD|MOBILEUNION|INWARD|INFLOW|CREDIT|DEPOSIT|CASH DEP|PAYOUT|CQ|CHQ|CHEQUE)\b/i;
const MEDICAL_BILL = /\b(?:MED(?:ICAL)?|MEDI|HOSPITAL)\s+(?:BILLS?|EXPENSES?)\b/i;
// NIP credits often read "SENDER NAME/what it was for".
const SENDER_NOTE = /^[A-Z][A-Z ,.'&-]{3,}\/\s*\S/i;
const LOAN = /\b(?:LEND|LOAN|BORROW(?:ED)?)\b/i;
const REVERSAL = /^REVERSAL\b(?:\s*OF)?\s*-?\s*/i;

const CHANNELS = [
  /^REVERSAL\b(?:\s*OF)?\s*-?\s*/i,
  /^MOBILE TRF TO [A-Z0-9]+\/+\s*\/?\s*/i,
  /^MOBILE BILLS PYMT\/?\s*/i,
  /^(?:NIP|USSD)\s+(?:TFR|TRANSFER)\s+(?:FROM|TO)\s*/i,
  /^(?:TFR|TRF|TRANSFER)\s+(?:FROM|FRM|TO)\s*/i,
  /^NIP(?:\s*CR)?\/[^/]*\/\s*/i,
  /^MC\s+(?:LOC|INTL)?\s*(?:POS|WEB)\s+PRCH[-\s\d]*/i,
  /^MC\s+AGENCY\s+CASHOUT[-\s\d]*/i,
  /^TRSF\/+/i,
  /^WEB PYMT\s*/i,
  /^POS PYMT\s*/i,
  /^POS TRANSFER\s*-?\s*/i,
];
const NOISE = (token) => /^\d+$/.test(token) || /\d{5,}/.test(token) || /^00[A-Z]{2}$/.test(token) || token === 'LANG' || token === 'NG';

const spaced = (text) => ` ${String(text).toUpperCase().replace(/[^A-Z0-9&]+/g, ' ').trim()} `;
const compact = (text) => String(text).toUpperCase().replace(/[^A-Z0-9]/g, '');

// A word may also start right after a number, because bank narrations often run them together ("2CONSULTATION").
const wordPatterns = new Map();
function hasWord(haystack, word) {
  let pattern = wordPatterns.get(word);
  if (!pattern) {
    const escaped = word.replace('*', '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern = new RegExp(word.endsWith('*') ? `[ 0-9]${escaped}` : `[ 0-9]${escaped}(?:S|ES)? `);
    wordPatterns.set(word, pattern);
  }
  return pattern.test(haystack);
}

// The counterparty with bank wording, references and location noise removed. `key` ignores word order
// and line-wrap hyphens so "GIFT ENYO-OJO" and "GIFT ENYO- OJO" are the same payee.
function payeeOf(narration) {
  let rest = String(narration || '').trim();
  for (let changed = true; changed;) {
    changed = false;
    for (const channel of CHANNELS) {
      const next = rest.replace(channel, '');
      if (next !== rest) { rest = next.trim(); changed = true; }
    }
  }
  // Whatever follows the first "/" is usually a memo ("TRF TO ADA/March allowance"), not part of the payee.
  const party = rest.split('/').map((part) => part.trim()).find(Boolean) || '';
  const tokens = party.toUpperCase().split(/[^A-Z0-9]+/).filter((token) => token && !NOISE(token));
  if (!tokens.length) return { label: '', key: '' };
  const label = tokens.slice(0, 8).join(' ');
  const key = [...new Set(tokens.filter((token) => token.length > 1))].sort().join(' ');
  return { label, key };
}

const isBankCharge = (narration) => CHARGE_START.test(narration) || CHARGE_ANY.test(narration);

// Is the counterparty the account holder themselves (a transfer between their own accounts)? Only the start of
// the counterparty counts: incoming narrations often name the holder as the *recipient* ("TRF TO SOLUCIO CLINICS").
function isOwner(narration, ownerName) {
  if (!ownerName) return false;
  const payee = payeeOf(narration);
  const ownerCompact = compact(ownerName);
  if (ownerCompact.length >= 6 && compact(payee.label).startsWith(ownerCompact)) return true;
  const ownerWords = ownerName.toUpperCase().split(/[^A-Z0-9]+/).filter((word) => word.length >= 3);
  if (!ownerWords.length) return false;
  const payeeWords = new Set(payee.label.split(' ').slice(0, ownerWords.length + 1));
  const shared = ownerWords.filter((word) => payeeWords.has(word)).length;
  return shared >= Math.min(3, ownerWords.length);
}

function resolver(tree) {
  const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  return ({ type, group, item }) => {
    for (const node of tree) {
      if (type && !same(node.type, type)) continue;
      const g = node.groups.find((entry) => same(entry.name, group));
      if (!g) continue;
      if (!g.items.length) return { type: node.type, group: g.name, item: null, exact: !item };
      const exactItem = item && g.items.find((entry) => same(entry, item));
      if (exactItem) return { type: node.type, group: g.name, item: exactItem, exact: true };
      const others = g.items.find((entry) => same(entry, 'Others'));
      if (others) return { type: node.type, group: g.name, item: others, exact: false };
      return null;
    }
    return null;
  };
}

// Item names (and groups with no items) that appear once in the tree, so an admin-added item like
// "Generator Servicing" is matched when a narration mentions it.
function treeNames(tree) {
  const seen = new Map();
  for (const node of tree) {
    for (const g of node.groups) {
      const leaves = g.items.length ? g.items.map((item) => ({ name: item, item })) : [{ name: g.name, item: null }];
      for (const leaf of leaves) {
        const phrase = spaced(leaf.name).trim();
        if (!phrase || /^OTHERS?\b/.test(phrase) || phrase.length < 3) continue;
        const list = seen.get(phrase) || [];
        list.push({ type: node.type, group: g.name, item: leaf.item, name: leaf.name });
        seen.set(phrase, list);
      }
    }
  }
  return [...seen.entries()].filter(([, list]) => list.length === 1).map(([phrase, [target]]) => ({ phrase, ...target }));
}

// Learn payee -> category from rows a person decided (or approved), across earlier statements.
function buildMemory(statements, direction = 'expense') {
  const memory = new Map();
  for (const statement of statements) {
    for (const t of statement.transactions || []) {
      if (t.direction !== direction || !t.type || !t.group) continue;
      if (direction === 'expense' && isBankCharge(t.narration)) continue;
      const decidedByPerson = ['reviewer', 'similar'].includes(t.categorySource)
        || (!t.categorySource && t.reviewedAt && t.confidence === 'high');
      const approved = statement.status === 'approved' && t.included !== false;
      if (!decidedByPerson && !approved) continue;
      const { key } = payeeOf(t.narration);
      if (!key) continue;
      const choice = `${t.type}\u0000${t.group}\u0000${t.item || ''}`;
      const counts = memory.get(key) || new Map();
      counts.set(choice, (counts.get(choice) || 0) + 1);
      memory.set(key, counts);
    }
  }
  return memory;
}

function recall(memory, key) {
  const counts = memory.get(key);
  if (!counts) return null;
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((sum, [, n]) => sum + n, 0);
  return ranked.map(([choice, n]) => {
    const [type, group, item] = choice.split('\u0000');
    return { type, group, item: item || null, count: n, total };
  });
}

const label = (r) => [r.group, r.item].filter(Boolean).join(' › ');
const blank = { type: null, group: null, item: null };

function describeUnknown(narration, payee) {
  const upper = narration.toUpperCase();
  const who = payee.label || 'this payee';
  if (/CASHOUT|CASH WITHDRAWAL|\bATM\b/.test(upper)) return `Cash withdrawal (${who}). Choose what the cash was for.`;
  if (/^WEB PYMT|WEB PRCH/.test(upper)) return `Online payment to ${who}. Choose a category once and later payments here will follow.`;
  if (/^POS PYMT|POS PRCH/.test(upper)) return `Card payment at ${who}. Choose a category once and later payments here will follow.`;
  if (/^WEB PYMT/.test(upper)) return `Online payment to ${who}. Choose a category once and later payments here will follow.`;
  if (/TRF|TRANSFER|TRSF/.test(upper)) return `Transfer to ${who}. Choose a category once and other payments to this payee will follow.`;
  return 'No rule matched this narration. Choose a category.';
}

function categorizeExpense(t, { resolve, memory, names, ownerName }) {
  const narration = t.narration || '';
  if (isBankCharge(narration)) {
    const target = resolve({ group: 'Tax and Dues', item: 'Others' });
    if (target) return { ...target, confidence: 'high', categorySource: 'rule', reason: 'Bank charge' };
  }

  const payee = payeeOf(narration);
  const remembered = payee.key ? recall(memory, payee.key) : null;
  if (remembered) {
    const top = remembered.find((entry) => resolve(entry)?.exact);
    if (top) {
      const target = resolve(top);
      const unanimous = top.count === top.total;
      return {
        ...target,
        confidence: unanimous ? 'high' : 'medium',
        categorySource: 'memory',
        reason: unanimous
          ? `Same payee as ${top.total} reviewed transaction${top.total === 1 ? '' : 's'}`
          : `Same payee as earlier transactions; ${top.count} of ${top.total} were ${label(target)}`,
      };
    }
  }

  const text = spaced(narration);
  const hits = [];
  for (const rule of RULES) {
    const word = rule.words.find((w) => hasWord(text, w));
    if (!word) continue;
    const target = resolve(rule);
    if (target) hits.push({ rule, word: word.replace('*', ''), target });
  }
  const named = names.find((entry) => text.includes(` ${entry.phrase} `));
  const first = hits[0];

  if (first && (first.target.exact || !named)) {
    const others = hits.filter((hit) => hit.target.group !== first.target.group);
    let confidence = first.target.exact ? (first.rule.confidence || 'high') : 'medium';
    let reason = `Mentions ${first.word}`;
    if (!first.target.exact) reason += `; ${first.rule.item || first.rule.group} isn't in your categories, so Others was used`;
    if (others.length) {
      confidence = 'medium';
      reason += `, but also mentions ${others[0].word} (${label(others[0].target)})`;
    }
    return { ...first.target, confidence, categorySource: 'rule', reason };
  }
  if (named) {
    return { type: named.type, group: named.group, item: named.item, confidence: 'medium', categorySource: 'rule', reason: `Mentions "${named.name}"` };
  }

  if (isOwner(narration, ownerName)) {
    return { ...blank, confidence: 'needs-review', categorySource: 'rule', reason: 'Looks like a transfer to the account holder\'s own account, which is usually not an expense. Leave it out or choose a category.' };
  }
  return { ...blank, confidence: 'needs-review', categorySource: 'rule', reason: describeUnknown(narration, payee) };
}

function categorizeIncome(t, { resolve, memory, names, ownerName }) {
  const narration = t.narration || '';
  const result = (confidence, reason) => ({ ...blank, confidence, categorySource: 'rule', reason });
  if (REVERSAL.test(narration)) return result('needs-review', 'Reversal of an earlier payment, not new income. Usually left out.');
  if (LOAN.test(narration)) return result('needs-review', 'Looks like a loan rather than earned income');
  if (isOwner(narration, ownerName)) return result('needs-review', 'Looks like a transfer from the account holder\'s own account, not income');

  // An income payee a reviewer has categorized before gets that income category.
  const payee = payeeOf(narration);
  const remembered = payee.key ? recall(memory, payee.key) : null;
  if (remembered) {
    const top = remembered.find((entry) => resolve(entry)?.exact);
    if (top) {
      const target = resolve(top);
      const unanimous = top.count === top.total;
      return {
        ...target,
        confidence: unanimous ? 'high' : 'medium',
        categorySource: 'memory',
        reason: unanimous
          ? `Same payee as ${top.total} reviewed transaction${top.total === 1 ? '' : 's'}`
          : `Same payee as earlier transactions; ${top.count} of ${top.total} were ${label(target)}`,
      };
    }
  }
  const named = names.find((entry) => spaced(narration).includes(` ${entry.phrase} `));
  if (named) return { type: named.type, group: named.group, item: named.item, confidence: 'medium', categorySource: 'rule', reason: `Mentions "${named.name}"` };

  // Otherwise flag what kind of income it looks like; a category can still be chosen (it is optional).
  if (MEDICAL_BILL.test(narration)) return result('high', 'Payment for medical bills');
  if (HMOS.test(narration)) return result('high', 'HMO payment');
  if (PROCESSORS.test(narration)) return result('high', 'Card or online payment settlement');
  if (INBOUND.test(narration) || SENDER_NOTE.test(narration)) return result('medium', 'Money received by transfer');
  return result('needs-review', 'Unrecognised money in. Confirm it is income.');
}

// A reversal puts back money from an earlier debit (or takes back an earlier credit). When both halves
// are in this statement, neither should reach the books.
function pairReversals(rows, results) {
  const norm = (text) => compact(String(text).replace(REVERSAL, '')).replace(/^HANDLINGCHARGE/, 'COMMISSION');
  const used = new Set();
  rows.forEach((reversal, i) => {
    if (!REVERSAL.test(reversal.narration || '')) return;
    const target = norm(reversal.narration);
    const j = rows.findIndex((original, k) => k !== i && !used.has(k)
      && original.direction !== reversal.direction
      && original.amount === reversal.amount
      && !REVERSAL.test(original.narration || '')
      && norm(original.narration) === target);
    if (j === -1) return;
    used.add(j);
    used.add(i);
    results[i] = { ...results[i], included: false, confidence: 'high', reason: 'Reversal of an earlier debit in this statement. Both are left out.' };
    results[j] = { ...results[j], included: false, confidence: 'high', reason: 'Reversed later in this statement. Both are left out.' };
  });
}

// Pure: suggests type/group/item, confidence, a plain-English reason and (for reversal pairs) inclusion.
function categorizeTransactions(rows, { tree = [], memory = new Map(), incomeTree = [], incomeMemory = new Map(), ownerName = '' } = {}) {
  const expenseCtx = { resolve: resolver(tree), memory, names: treeNames(tree), ownerName };
  const incomeCtx = { resolve: resolver(incomeTree), memory: incomeMemory, names: treeNames(incomeTree), ownerName };
  const results = rows.map((t) => (t.direction === 'income' ? categorizeIncome(t, incomeCtx) : categorizeExpense(t, expenseCtx)));
  pairReversals(rows, results);
  return results;
}

async function loadCategorizerContext() {
  const [tree, incomeTree, statements] = await Promise.all([
    publicTree('expense'),
    publicTree('income'),
    Statement.find({}, {
      status: 1,
      'transactions.narration': 1, 'transactions.direction': 1, 'transactions.type': 1, 'transactions.group': 1,
      'transactions.item': 1, 'transactions.categorySource': 1, 'transactions.reviewedAt': 1,
      'transactions.confidence': 1, 'transactions.included': 1,
    }).lean(),
  ]);
  return { tree, incomeTree, memory: buildMemory(statements, 'expense'), incomeMemory: buildMemory(statements, 'income') };
}

module.exports = { categorizeTransactions, loadCategorizerContext, buildMemory, payeeOf, isBankCharge };
