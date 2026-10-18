/**
 * ARKA Unified Dynamic Cursor Suite
 * ARKA's signature tailless cursor system with dynamic contextual states:
 * - Arrow: Canvas, whitespace, background navigation
 * - Pointer Hand: Clickable buttons, links, controls
 * - Split Beam: Loading states, AI generation, waiting spinners, text/code inputs
 * - Blocked: Unclickable/disabled buttons, locked features, quota limits
 * - Precision Cross: Canvas panning, drag-to-move, precision positioning
 */

export const CURSOR_SIZES = [
  { id: 'small', label: 'Small', px: 24 },
  { id: 'medium', label: 'Medium', px: 32 },
  { id: 'large', label: 'Large', px: 40 },
  { id: 'xlarge', label: 'Extra Large', px: 48 },
];

const STORAGE_KEY_SIZE = 'arka-cursor-size';

export function getCursorSettings() {
  if (typeof window === 'undefined') {
    return { enabled: true, size: 'small' };
  }
  const sizeStr = localStorage.getItem(STORAGE_KEY_SIZE);
  return {
    enabled: true,
    size: ['small', 'medium', 'large', 'xlarge'].includes(sizeStr) ? sizeStr : 'small',
  };
}

export function buildTaillessArrowSvg(px) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24"><path fill="#FFF" stroke="#000" stroke-width="2" d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.35Z"/></svg>`;
}

export function buildPointerHandSvg(px) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24"><path fill="#FFF" stroke="#000" stroke-width="2" stroke-linejoin="round" d="M10 11V8.99c0-.88.59-1.64 1.44-1.86h.05A1.99 1.99 0 0 1 14 9.05V12v-2c0-.88.6-1.65 1.46-1.87h.05A1.98 1.98 0 0 1 18 10.06V13v-1.94a2 2 0 0 1 1.51-1.94h0A2 2 0 0 1 22 11.06V14c0 .6-.08 1.27-.21 1.97a7.96 7.96 0 0 1-7.55 6.48 54.98 54.98 0 0 1-4.48 0 7.96 7.96 0 0 1-7.55-6.48C2.08 15.27 2 14.59 2 14v-1.49c0-1.11.9-2.01 2.01-2.01h0a2 2 0 0 1 2.01 2.03l-.01.97v-10c0-1.1.9-2 2-2h0a2 2 0 0 1 2 2V11Z"/></svg>`;
}

export function buildSplitBeamSvg(px) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24"><path fill="#FFF" stroke="#000" stroke-width="2" d="M16.95 3h-9.9a2.06 2.06 0 0 0-1.34 3.62L11.99 12l6.28-5.38A2.06 2.06 0 0 0 16.93 3ZM7.05 21h9.89c1.9 0 2.78-2.38 1.34-3.62L12 12l-6.28 5.38A2.06 2.06 0 0 0 7.06 21Z"/></svg>`;
}

export function buildBlockedSvg(px) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24"><path fill="#000" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z"/><path fill="#FFF" d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 14a6 6 0 0 1-4.88-9.47l8.36 8.36A5.95 5.95 0 0 1 12.01 18Zm4.88-2.53L8.53 7.11a6 6 0 0 1 8.35 8.36Z"/></svg>`;
}

export function buildPawSvg(px) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24"><g fill="#000" stroke="#FFF" stroke-width="1" stroke-linejoin="round"><path d="M18 7c-3 0-5.5-1.5-9 2s-2 6-2 9c0 5 4.1 5.63 6 5 3-1 1-3 4-6s5-1 6-4c.63-1.9 0-6-5-6Z"/><circle cx="8.2" cy="4" r="2"/><circle cx="4" cy="8.2" r="2"/><circle cx="14" cy="3" r="2"/><circle cx="3" cy="14" r="2"/></g></svg>`;
}

export function buildThinPlusSvg(px) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24"><path fill="none" stroke="#000" stroke-width="2.4" stroke-linecap="round" d="M12 4v16M4 12h16"/><path fill="none" stroke="#FFF" stroke-width="1.1" stroke-linecap="round" d="M12 4v16M4 12h16"/></svg>`;
}

export function buildIBeamSvg(px) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24"><path fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M8.5 5h7M12 5v14M8.5 19h7"/><path fill="none" stroke="#FFF" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" d="M8.5 5h7M12 5v14M8.5 19h7"/></svg>`;
}

function svgToDataUri(svgString) {
  return `url("data:image/svg+xml,${encodeURIComponent(svgString)}")`;
}

export function applyCursorSettings(settings) {
  if (typeof document === 'undefined') return;

  const current = settings || getCursorSettings();
  const root = document.documentElement;

  const sizeObj = CURSOR_SIZES.find(s => s.id === current.size) || CURSOR_SIZES.find(s => s.id === 'small') || CURSOR_SIZES[0];
  const px = sizeObj.px;

  // Hotspots:
  // - Arrow tip: (5.5, 3.0)
  // - Pointer hand tip: (8.0, 2.0)
  // - Split beam / Blocked / Thin Plus / I-Beam center: (12.0, 12.0)
  // - Paw grab center: (10.0, 10.0)
  const defaultHotspot = `${Math.round(5.5 * px / 24)} ${Math.round(3.0 * px / 24)}`;
  const pointerHotspot = `${Math.round(8 * px / 24)} ${Math.max(1, Math.round(2 * px / 24))}`;
  const centerHotspot = `${Math.round(12 * px / 24)} ${Math.round(12 * px / 24)}`;
  const pawHotspot = `${Math.round(10 * px / 24)} ${Math.round(10 * px / 24)}`;

  const defaultUri = `${svgToDataUri(buildTaillessArrowSvg(px))} ${defaultHotspot}, default`;
  const pointerUri = `${svgToDataUri(buildPointerHandSvg(px))} ${pointerHotspot}, pointer`;
  const splitBeamUri = `${svgToDataUri(buildSplitBeamSvg(px))} ${centerHotspot}, wait`;
  const textUri = `${svgToDataUri(buildIBeamSvg(px))} ${centerHotspot}, text`;
  const blockedUri = `${svgToDataUri(buildBlockedSvg(px))} ${centerHotspot}, not-allowed`;
  const thinPlusUri = `${svgToDataUri(buildThinPlusSvg(px))} ${centerHotspot}, crosshair`;
  const pawUri = `${svgToDataUri(buildPawSvg(px))} ${pawHotspot}, grab`;
  const pawGrabbingUri = `${svgToDataUri(buildPawSvg(px))} ${pawHotspot}, grabbing`;

  root.style.setProperty('--cursor-default', defaultUri);
  root.style.setProperty('--cursor-pointer', pointerUri);
  root.style.setProperty('--cursor-text', textUri);
  root.style.setProperty('--cursor-wait', splitBeamUri);
  root.style.setProperty('--cursor-loading', splitBeamUri);
  root.style.setProperty('--cursor-not-allowed', blockedUri);
  root.style.setProperty('--cursor-disabled', blockedUri);
  root.style.setProperty('--cursor-crosshair', thinPlusUri);
  root.style.setProperty('--cursor-brush', thinPlusUri);
  root.style.setProperty('--cursor-grab', pawUri);
  root.style.setProperty('--cursor-grabbing', pawGrabbingUri);
  root.style.setProperty('--cursor-pan', pawUri);
  root.setAttribute('data-arka-cursor', current.size);
}

export function saveCursorSettings(settings) {
  if (typeof window === 'undefined') return;
  if (settings.size) {
    localStorage.setItem(STORAGE_KEY_SIZE, settings.size);
  }
  applyCursorSettings(settings);
}
