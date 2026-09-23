const db = require("../db");

async function audit(userId, action, metadata, ipAddress) {
  await db.query(
    `INSERT INTO audit_logs(user_id, action, metadata, ip_address)
     VALUES($1,$2,$3,$4)`,
    [userId || null, action, JSON.stringify(metadata || {}), ipAddress || null]
  );
}

module.exports = { audit };
