// Installer sidebar (164 x 314, the size NSIS's welcome and finish pages use): dark panel, the Dot F mark and the name.
const sharp = require('sharp'), path = require('path'), { execFileSync } = require('child_process');
const W = 164, H = 314, GAP = 22, R = 7.5, X0 = W / 2 - 1.5 * GAP, Y0 = 96;
const F = ['####', '#...', '###*', '#...', '#...'];
const dots = F.flatMap((row, y) => [...row].map((c, x) => `<circle cx="${X0 + x * GAP}" cy="${Y0 + y * GAP}" r="${R}" fill="${c === '*' ? '#ff5c38' : '#ededec'}" opacity="${c === '.' ? .13 : 1}"/>`));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#141416"/>${dots.join('')}
  <text x="${W / 2}" y="232" text-anchor="middle" font-family="Segoe UI" font-weight="600" font-size="20" fill="#ededec">Filerrrr</text>
  <text x="${W / 2}" y="254" text-anchor="middle" font-family="Segoe UI" font-size="11" fill="#8c8c87">Hold, drag, convert</text></svg>`;
(async () => {
  const build = path.join(__dirname, '..', 'build'), png = path.join(build, 'installerSidebar.png');
  await sharp(Buffer.from(svg)).png().toFile(png);
  for (const name of ['installerSidebar.bmp', 'uninstallerSidebar.bmp'])
    execFileSync(require('ffmpeg-static'), ['-y', '-loglevel', 'error', '-i', png, '-pix_fmt', 'bgr24', path.join(build, name)]);
  console.log('build/installerSidebar.bmp, build/uninstallerSidebar.bmp');
})();
