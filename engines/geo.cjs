// Map data: GeoJSON ↔ KML ↔ GPX. KML/GPX are read with @tmcw/togeojson; KML and GPX are written here.
const fsp = require('fs').promises;
const { esc } = require('./common.cjs');

async function toGeoJson(input, ext) {
  const text = await fsp.readFile(input, 'utf8');
  if (ext === 'geojson') {
    const g = JSON.parse(text);
    return g.type === 'FeatureCollection' ? g : g.type === 'Feature' ? { type: 'FeatureCollection', features: [g] } : { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: g }] };
  }
  const { DOMParser } = require('@xmldom/xmldom'), tj = require('@tmcw/togeojson');
  const dom = new DOMParser().parseFromString(text, 'text/xml');
  return ext === 'kml' ? tj.kml(dom) : tj.gpx(dom);
}

const coord = c => `${c[0]},${c[1]}${c.length > 2 ? `,${c[2]}` : ''}`;
function kmlGeometry(g) {
  if (!g) return '';
  switch (g.type) {
    case 'Point': return `<Point><coordinates>${coord(g.coordinates)}</coordinates></Point>`;
    case 'LineString': return `<LineString><coordinates>${g.coordinates.map(coord).join(' ')}</coordinates></LineString>`;
    case 'Polygon': return `<Polygon>${g.coordinates.map((ring, i) => `<${i ? 'innerBoundaryIs' : 'outerBoundaryIs'}><LinearRing><coordinates>${ring.map(coord).join(' ')}</coordinates></LinearRing></${i ? 'innerBoundaryIs' : 'outerBoundaryIs'}>`).join('')}</Polygon>`;
    case 'MultiPoint': return `<MultiGeometry>${g.coordinates.map(c => kmlGeometry({ type: 'Point', coordinates: c })).join('')}</MultiGeometry>`;
    case 'MultiLineString': return `<MultiGeometry>${g.coordinates.map(c => kmlGeometry({ type: 'LineString', coordinates: c })).join('')}</MultiGeometry>`;
    case 'MultiPolygon': return `<MultiGeometry>${g.coordinates.map(c => kmlGeometry({ type: 'Polygon', coordinates: c })).join('')}</MultiGeometry>`;
    case 'GeometryCollection': return `<MultiGeometry>${g.geometries.map(kmlGeometry).join('')}</MultiGeometry>`;
  }
  return '';
}
function toKml(fc) {
  const marks = fc.features.map(f => {
    const p = f.properties || {}, name = p.name ?? p.title ?? '';
    const data = Object.entries(p).filter(([k, v]) => k !== 'name' && v != null && typeof v !== 'object').map(([k, v]) => `<Data name="${esc(k)}"><value>${esc(v)}</value></Data>`).join('');
    return `<Placemark>${name !== '' ? `<name>${esc(name)}</name>` : ''}${p.description ? `<description>${esc(p.description)}</description>` : ''}${data ? `<ExtendedData>${data}</ExtendedData>` : ''}${kmlGeometry(f.geometry)}</Placemark>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${marks.join('\n')}</Document></kml>\n`;
}
// GPX holds points (waypoints) and lines (tracks); polygons are written as their outer ring.
function toGpx(fc) {
  const pt = (tag, c, extra = '') => `<${tag} lat="${c[1]}" lon="${c[0]}">${c.length > 2 ? `<ele>${c[2]}</ele>` : ''}${extra}</${tag}>`;
  const wpts = [], trks = [];
  const walk = (g, name) => {
    if (!g) return;
    const n = name !== undefined && name !== '' ? `<name>${esc(name)}</name>` : '';
    if (g.type === 'Point') wpts.push(pt('wpt', g.coordinates, n));
    else if (g.type === 'MultiPoint') g.coordinates.forEach(c => wpts.push(pt('wpt', c, n)));
    else if (g.type === 'LineString') trks.push(`<trk>${n}<trkseg>${g.coordinates.map(c => pt('trkpt', c)).join('')}</trkseg></trk>`);
    else if (g.type === 'MultiLineString') trks.push(`<trk>${n}${g.coordinates.map(l => `<trkseg>${l.map(c => pt('trkpt', c)).join('')}</trkseg>`).join('')}</trk>`);
    else if (g.type === 'Polygon') walk({ type: 'LineString', coordinates: g.coordinates[0] }, name);
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => walk({ type: 'LineString', coordinates: p[0] }, name));
    else if (g.type === 'GeometryCollection') g.geometries.forEach(x => walk(x, name));
  };
  fc.features.forEach(f => walk(f.geometry, (f.properties || {}).name));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Filerrrr" xmlns="http://www.topografix.com/GPX/1/1">\n${[...wpts, ...trks].join('\n')}\n</gpx>\n`;
}

async function convert(input, ext, T, out) {
  const fc = await toGeoJson(input, ext);
  if (T === 'GEO') return fsp.writeFile(out, JSON.stringify(fc, null, 2) + '\n');
  if (T === 'KML') return fsp.writeFile(out, toKml(fc));
  if (T === 'GPX') return fsp.writeFile(out, toGpx(fc));
  throw new Error(`Can't convert .${ext} to ${T}`);
}

module.exports = { convert, toGeoJson, toKml, toGpx };
