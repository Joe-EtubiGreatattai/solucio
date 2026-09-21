// pdf-parse's bundled pdf.js keeps global state, so load a fresh copy per call.
// It also ignores a Buffer's byteOffset (small Buffers live in Node's shared pool),
// which makes parsing flaky, so hand it a Uint8Array copy that owns its ArrayBuffer.
const pdfText = async (buffer) => {
  let parse;
  jest.isolateModules(() => {
    parse = require('pdf-parse/lib/pdf-parse.js');
  });
  const { text } = await parse(new Uint8Array(buffer));
  return text;
};

module.exports = { pdfText };
