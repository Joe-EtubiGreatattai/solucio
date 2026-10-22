const AuditLog = require('../models/AuditLog');
const { notifyAudit } = require('../realtime');

// Every change in the app is logged here, so this is also where connected screens are told to refresh.
async function logAudit({ actor, action, targetModel, targetId, details }) {
  const log = await AuditLog.create({ actor, action, targetModel, targetId, details });
  notifyAudit({ action, targetModel, targetId });
  return log;
}

// Write many audit entries in one insert, then signal the live screens once per affected model instead
// of once per row. Approving a statement can create hundreds of records at once; emitting a socket event
// per record (and inserting them one at a time) is a needless storm and a big part of what made approval
// slow enough to time out.
async function logAuditBatch(entries) {
  if (!entries.length) return [];
  const logs = await AuditLog.insertMany(entries);
  const signalled = new Set();
  for (const entry of entries) {
    if (signalled.has(entry.targetModel)) continue;
    signalled.add(entry.targetModel);
    notifyAudit({ action: entry.action, targetModel: entry.targetModel, targetId: entry.targetId });
  }
  return logs;
}

module.exports = { logAudit, logAuditBatch };
