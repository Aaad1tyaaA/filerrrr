// Run OCR checks with --require ./tests/no-network.cjs; Worker threads inherit this preload.
const deny = () => { throw new Error('Network access is disabled in this OCR test'); };
globalThis.fetch = deny;
for (const protocol of ['http','https']) {
  const transport = require(protocol); transport.request = deny; transport.get = deny;
}
const net = require('net'); net.connect = deny; net.createConnection = deny;
