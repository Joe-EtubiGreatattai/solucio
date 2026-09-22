const AuditLog = require('../models/AuditLog');
const { notifyAudit } = require('../realtime');

// Every change in the app is logged here, so this is also where connected screens are told to refresh.
async function logAudit({ actor, action, targetModel, targetId, details }) {
  const log = await AuditLog.create({ actor, action, targetModel, targetId, details });
  notifyAudit({ action, targetModel, targetId });
  return log;
}

module.exports = { logAudit };
