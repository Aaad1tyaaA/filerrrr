// Archives with bsdtar: zip / 7z / tar / tar.gz a selection, extract zip, rar, 7z, tar, gz, bz2, xz, iso, cab,
// and re-pack one archive as another.
const fsp = require('fs').promises, path = require('path');
const { tar, tmpDir } = require('./common.cjs');

// -a picks the archive type from the output name (.zip, .7z, .tar, .tar.gz); ./ keeps a name starting with "-" a file.
const pack = (out, members) => tar(['-a', '-cf', out, ...members]);
const zip = (inputs, out) => pack(out, inputs.flatMap(f => ['-C', path.dirname(f), './' + path.basename(f)]));

async function extract(input, dir) {
  await fsp.mkdir(dir, { recursive: true });
  await tar(['-xf', input, '-C', dir]); // bsdtar refuses absolute paths and ".." entries by default
}

async function repack(input, out) {
  const dir = await tmpDir();
  try {
    await extract(input, dir);
    const entries = await fsp.readdir(dir);
    if (!entries.length) throw new Error('The archive is empty');
    await pack(out, ['-C', dir, ...entries.map(e => './' + e)]);
  } finally { await fsp.rm(dir, { recursive: true, force: true }); }
}

module.exports = { zip, extract, repack };
