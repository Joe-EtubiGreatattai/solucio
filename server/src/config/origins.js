// The web addresses allowed to call the API and open a live connection, from CLIENT_ORIGIN (comma separated).
module.exports = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim()).filter(Boolean);
