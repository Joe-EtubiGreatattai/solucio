const path = require('path');

// The Solucio Clinic logo, bundled with the server so exports look the same wherever they run.
const LOGO_PATH = path.join(__dirname, '../assets/logo.png');

const COLOR = {
  maroon: '#5c1938',
  maroonDark: '#43132a',
  green: '#9cc23a',
  ink: '#22202a',
  muted: '#8a8492',
  line: '#e7e2eb',
  stripe: '#faf8fc',
  void: '#a29ca8',
};

module.exports = { LOGO_PATH, COLOR };
