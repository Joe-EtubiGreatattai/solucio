const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
// Behind nginx, believe its X-Forwarded-For so rate limiting sees each visitor, not the proxy.
// Off unless TRUST_PROXY is set, because otherwise a visitor could fake their address.
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isNaN(hops) ? process.env.TRUST_PROXY : hops);
}
app.use(helmet());
// One or more web addresses allowed to call the API, comma separated.
const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: origins }));
app.use(express.json());
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
