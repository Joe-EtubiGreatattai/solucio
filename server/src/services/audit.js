const AuditLog = require('../models/AuditLog');

const logAudit = ({ actor, action, targetModel, targetId, details }) =>
  AuditLog.create({ actor, action, targetModel, targetId, details });

module.exports = { logAudit };
