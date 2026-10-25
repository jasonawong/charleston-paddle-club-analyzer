import { prepareTrack } from './model.js';

export function parseGPX(xml, options = {}) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'gpx') throw new Error('That file is not valid GPX XML. Choose a GPX export with coordinates and timestamps.');
  const raw = [], segments = [...doc.getElementsByTagNameNS('*', 'trkseg')];
  if (!segments.length) throw new Error('No track segments found. Export a recorded track with timestamps from Paddle Logger.');
  segments.forEach((segment, index) => {
    for (const node of segment.getElementsByTagNameNS('*', 'trkpt')) {
      const time = node.getElementsByTagNameNS('*', 'time')[0]?.textContent;
      const lat = node.getAttribute('lat'), lon = node.getAttribute('lon');
      raw.push({ lat: lat === null ? NaN : Number(lat), lon: lon === null ? NaN : Number(lon), time: Date.parse(time), segment: index });
    }
  });
  if (raw.length > 200000) throw new Error('This first version supports up to 200,000 GPS points per recording.');
  return prepareTrack(raw, doc.getElementsByTagNameNS('*', 'trk')[0]?.getElementsByTagNameNS('*', 'name')[0]?.textContent?.slice(0, 120) || 'Your paddle', options);
}
