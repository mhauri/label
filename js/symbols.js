// Built-in symbol library: 24x24 stroke icons (inner SVG markup).
const c = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;

export const SYMBOLS = [
  ['arrow-right', 'Arrow right', '<path d="M4 12h16M14 6l6 6-6 6"/>'],
  ['arrow-up', 'Arrow up', '<path d="M12 20V4M6 10l6-6 6 6"/>'],
  ['this-side-up', 'This side up', '<path d="M8 20V5M4 9l4-4 4 4M16 20V5M12 9l4-4 4 4"/>'],
  ['check', 'Check', '<path d="M4 12l5 5L20 6"/>'],
  ['cross', 'Cross', '<path d="M5 5l14 14M19 5L5 19"/>'],
  ['warning', 'Warning', '<path d="M12 3L2 21h20L12 3z"/><path d="M12 10v5M12 18v.5"/>'],
  ['info', 'Info', c(12, 12, 9) + '<path d="M12 11v6M12 7.5v.5"/>'],
  ['question', 'Question', c(12, 12, 9) + '<path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17v.5"/>'],
  ['forbidden', 'Forbidden', c(12, 12, 9) + '<path d="M5.6 5.6l12.8 12.8"/>'],
  ['heart', 'Heart', '<path d="M12 20S3 14.5 3 8.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 9 1.5C21 14.5 12 20 12 20z"/>'],
  ['star', 'Star', '<path d="M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.2l-5.6 3.1 1.2-6.3L3 9.6l6.3-.8L12 3z"/>'],
  ['home', 'Home', '<path d="M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6"/>'],
  ['phone', 'Phone', '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'],
  ['mail', 'Mail', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'],
  ['lock', 'Lock', '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'],
  ['key', 'Key', c(8, 15, 4) + '<path d="M11 12l9-9M16 7l3 3"/>'],
  ['flag', 'Flag', '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>'],
  ['bolt', 'Bolt', '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>'],
  ['drop', 'Drop', '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'],
  ['flame', 'Flame', '<path d="M12 22c4 0 7-3 7-7 0-3-2-5-3-7-1 2-2 3-3 3 0-4-2-7-4-9 0 4-4 6-4 12 0 4 3 8 7 8z"/>'],
  ['snowflake', 'Cold', '<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 2 3-2M9 20l3-2 3 2"/>'],
  ['thermometer', 'Temperature', '<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/>'],
  ['sun', 'Sun', c(12, 12, 4) + '<path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'],
  ['moon', 'Moon', '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>'],
  ['cloud', 'Cloud', '<path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5H7z"/>'],
  ['leaf', 'Leaf', '<path d="M5 19C5 10 10 4 20 4c0 10-6 15-15 15zM5 19l8-8"/>'],
  ['cart', 'Cart', '<path d="M2 3h3l2.5 12h11L21 7H6"/>' + c(9, 20, 1) + c(17, 20, 1)],
  ['box', 'Package', '<path d="M3 7l9-4 9 4v10l-9 4-9-4V7zM3 7l9 4 9-4M12 11v10"/>'],
  ['fragile', 'Fragile', '<path d="M7 3h10l-1 7a4 4 0 0 1-8 0L7 3zM12 14v7M8 21h8"/>'],
  ['tag', 'Tag', '<path d="M3 12V3h9l9 9-9 9-9-9z"/><path d="M7.5 7.5v.01"/>'],
  ['pin', 'Location', '<path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/>' + c(12, 9, 2.5)],
  ['clock', 'Clock', c(12, 12, 9) + '<path d="M12 7v5l3 2"/>'],
  ['calendar', 'Calendar', '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
  ['wifi', 'Wi-Fi', '<path d="M2 9a15 15 0 0 1 20 0M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M12 20v.1"/>'],
  ['bluetooth', 'Bluetooth', '<path d="M7 7l10 10-5 4V3l5 4L7 17"/>'],
  ['user', 'User', c(12, 8, 4) + '<path d="M4 21a8 8 0 0 1 16 0"/>'],
  ['gear', 'Settings', c(12, 12, 3) + c(12, 12, 7) + '<path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'],
  ['trash', 'Trash', '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>'],
  ['coffee', 'Coffee', '<path d="M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8zM16 9h2a2 2 0 0 1 0 5h-2M7 3v2M11 3v2"/>'],
];

export function symbolSVG(id, size = 96) {
  const s = SYMBOLS.find((x) => x[0] === id);
  if (!s) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${s[2]}</svg>`;
}
