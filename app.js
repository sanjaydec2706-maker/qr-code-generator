/* app.js
   Advanced QR Code Generator Pro
   - Modular functions
   - Real-time generation with debounce
   - PNG/JPG/SVG downloads
   - vCard, WiFi, URL validation, Plain text
   - Loading animation, copy tooltip, accessible alerts
*/

/* -------------------------
   Utility & DOM references
   ------------------------- */
const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

const qrWrap = $('#qr-wrap');
const sizeInput = $('#size');
const sizeOutput = $('#size-output');
const ecSelect = $('#ec-level');
const fgColor = $('#fg-color');
const bgColor = $('#bg-color');
const dotStyle = $('#dot-style');
const renderSizeLabel = $('#render-size');
const renderEcLabel = $('#render-ec');
const loadingEl = $('#loading');
const alertsEl = $('#alerts');
const copyTooltip = $('#copy-tooltip');

const tabs = $$('.tab');
const panels = $$('.type-panel');

let currentType = 'url';
let qrCode = null; // qr-code-styling instance
let lastPayload = '';
let renderTimer = null;

/* -------------------------
   Default QR options
   ------------------------- */
const defaultOptions = () => ({
  width: parseInt(sizeInput.value, 10),
  height: parseInt(sizeInput.value, 10),
  margin: 10,
  image: undefined,
  dotsOptions: {
    color: fgColor.value,
    type: dotStyle.value === 'rounded' ? 'rounded' : (dotStyle.value === 'dots' ? 'dots' : 'square')
  },
  backgroundOptions: {
    color: bgColor.value,
  },
  cornersSquareOptions: {
    type: 'square'
  },
  cornersDotOptions: {
    type: 'square'
  },
  qrOptions: {
    // error correction level
    errorCorrectionLevel: ecSelect.value
  },
  // prefer SVG for crisp exports
  // the library will render to canvas or svg depending on toDataURL call
});

/* -------------------------
   Initialize QR instance
   ------------------------- */
function initQRCode() {
  // If an instance exists, clear it
  if (qrCode) {
    qrCode.clear();
    qrWrap.innerHTML = '';
  }

  // Create new instance with placeholder
  qrCode = new QRCodeStyling({
    width: parseInt(sizeInput.value, 10),
    height: parseInt(sizeInput.value, 10),
    data: "https://example.com",
    margin: 10,
    dotsOptions: {
      color: fgColor.value,
      type: dotStyle.value === 'rounded' ? 'rounded' : (dotStyle.value === 'dots' ? 'dots' : 'square')
    },
    backgroundOptions: {
      color: bgColor.value
    },
    cornersSquareOptions: { type: "square" },
    cornersDotOptions: { type: "square" },
    qrOptions: { errorCorrectionLevel: ecSelect.value }
  });

  // Append to DOM
  qrCode.append(qrWrap);
}

/* -------------------------
   Helpers: show/hide loading & alerts
   ------------------------- */
function showLoading(show = true) {
  loadingEl.style.display = show ? 'flex' : 'none';
  loadingEl.setAttribute('aria-hidden', String(!show));
}

function showAlert(message, type = 'error', timeout = 4000) {
  alertsEl.innerHTML = `<div class="alert" role="alert">${escapeHtml(message)}</div>`;
  if (timeout) {
    setTimeout(() => { alertsEl.innerHTML = ''; }, timeout);
  }
}

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

/* -------------------------
   Payload builders for types
   ------------------------- */
function buildPayload(type) {
  switch (type) {
    case 'url': {
      const url = $('#url-input').value.trim();
      if (!url) throw new Error('Please enter a URL.');
      if (!validateURL(url)) throw new Error('Invalid URL. Include protocol (https://).');
      return url;
    }

    case 'vcard': {
      const name = $('#vc-name').value.trim();
      const org = $('#vc-org').value.trim();
      const phone = $('#vc-phone').value.trim();
      const email = $('#vc-email').value.trim();
      if (!name && !phone && !email) throw new Error('Please provide at least a name, phone, or email for vCard.');
      // Build vCard 3.0
      const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        name ? `FN:${escapeVCard(name)}` : '',
        org ? `ORG:${escapeVCard(org)}` : '',
        phone ? `TEL;TYPE=CELL:${escapeVCard(phone)}` : '',
        email ? `EMAIL:${escapeVCard(email)}` : '',
        'END:VCARD'
      ].filter(Boolean);
      return lines.join('\n');
    }

    case 'wifi': {
      const ssid = $('#wifi-ssid').value.trim();
      const password = $('#wifi-password').value;
      const enc = $('#wifi-encryption').value;
      if (!ssid) throw new Error('SSID is required for WiFi QR.');
      // WiFi QR format: WIFI:T:WPA;S:SSID;P:password;;
      const esc = v => v.replace(/([\\;,:"])/g, '\\$1');
      const passPart = (enc === 'nopass') ? '' : `P:${esc(password)};`;
      const typePart = (enc === 'nopass') ? 'nopass' : enc;
      return `WIFI:T:${typePart};S:${esc(ssid)};${passPart};`;
    }

    case 'text': {
      const txt = $('#text-input').value.trim();
      if (!txt) throw new Error('Please enter text or a crypto address.');
      return txt;
    }

    default:
      throw new Error('Unknown QR type.');
  }
}

function escapeVCard(value) {
  return value.replace(/\n/g, '\\n').replace(/,/g, '\\,');
}

/* -------------------------
   Validation helpers
   ------------------------- */
function validateURL(value) {
  try {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol);
  } catch (e) {
    return false;
  }
}

/* -------------------------
   Render QR (debounced)
   ------------------------- */
function scheduleRender(delay = 250) {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderQRCode().catch(err => {
      showAlert(err.message || 'Failed to render QR.');
      showLoading(false);
    });
  }, delay);
}

async function renderQRCode() {
  showLoading(true);
  // Build payload
  let payload;
  try {
    payload = buildPayload(currentType);
  } catch (err) {
    showLoading(false);
    throw err;
  }

  // If payload unchanged and size/colors unchanged, skip heavy re-render
  lastPayload = payload;

  // Update options
  const opts = defaultOptions();
  opts.width = parseInt(sizeInput.value, 10);
  opts.height = opts.width;
  opts.dotsOptions = {
    color: fgColor.value,
    type: dotStyle.value === 'rounded' ? 'rounded' : (dotStyle.value === 'dots' ? 'dots' : 'square')
  };
  opts.backgroundOptions = { color: bgColor.value };
  opts.qrOptions = { errorCorrectionLevel: ecSelect.value };

  // Update labels
  renderSizeLabel.textContent = String(opts.width);
  renderEcLabel.textContent = ecSelect.value;

  // Update qrCode instance
  // qr-code-styling supports update method
  try {
    await qrCode.update({
      data: payload,
      width: opts.width,
      height: opts.height,
      dotsOptions: opts.dotsOptions,
      backgroundOptions: opts.backgroundOptions,
      qrOptions: opts.qrOptions
    });
  } catch (err) {
    console.error(err);
    showLoading(false);
    throw new Error('QR rendering failed.');
  }

  // small delay to ensure DOM updated
  setTimeout(() => showLoading(false), 120);
}

/* -------------------------
   Download handlers
   ------------------------- */
async function downloadPNG() {
  try {
    showLoading(true);
    // toDataURL returns PNG by default
    const dataUrl = await qrCode.getRawData('png'); // library helper
    triggerDownload(dataUrl, `qr-${Date.now()}.png`);
  } catch (err) {
    showAlert('Failed to export PNG.');
    console.error(err);
  } finally {
    showLoading(false);
  }
}

async function downloadJPG() {
  try {
    showLoading(true);
    // Convert PNG dataURL to JPG by drawing on canvas
    const pngDataUrl = await qrCode.getRawData('png');
    const img = await loadImage(pngDataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    // white background for JPG
    ctx.fillStyle = bgColor.value || '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const jpgData = canvas.toDataURL('image/jpeg', 0.95);
    triggerDownload(jpgData, `qr-${Date.now()}.jpg`);
  } catch (err) {
    showAlert('Failed to export JPG.');
    console.error(err);
  } finally {
    showLoading(false);
  }
}

async function downloadSVG() {
  try {
    showLoading(true);
    // qr-code-styling provides getRawData('svg') or getRawData('svg') depending on version
    const svgString = await qrCode.getRawData('svg');
    // Create blob and download
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `qr-${Date.now()}.svg`, true);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (err) {
    showAlert('Failed to export SVG.');
    console.error(err);
  } finally {
    showLoading(false);
  }
}

/* -------------------------
   Helpers: loadImage & triggerDownload
   ------------------------- */
function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function triggerDownload(dataUrlOrObjectUrl, filename, isObjectUrl = false) {
  const a = document.createElement('a');
  a.href = dataUrlOrObjectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (isObjectUrl) {
    // caller will revoke
  }
}

/* -------------------------
   Copy data to clipboard
   ------------------------- */
async function copyDataToClipboard() {
  try {
    const payload = lastPayload || buildPayload(currentType);
    await navigator.clipboard.writeText(payload);
    showCopyTooltip();
  } catch (err) {
    showAlert('Failed to copy to clipboard.');
    console.error(err);
  }
}

function showCopyTooltip() {
  copyTooltip.style.display = 'block';
  copyTooltip.setAttribute('aria-hidden', 'false');
  setTimeout(() => {
    copyTooltip.style.display = 'none';
    copyTooltip.setAttribute('aria-hidden', 'true');
  }, 1800);
}

/* -------------------------
   UI wiring & events
   ------------------------- */
function wireUI() {
  // Tabs
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentType = tab.dataset.type;
      panels.forEach(p => p.classList.add('hidden'));
      const panel = panels.find(p => p.dataset.panel === currentType);
      if (panel) panel.classList.remove('hidden');
      scheduleRender(120);
    });
  });

  // Inputs that affect payload
  const payloadInputs = ['#url-input','#vc-name','#vc-org','#vc-phone','#vc-email','#wifi-ssid','#wifi-password','#wifi-encryption','#text-input'];
  payloadInputs.forEach(sel => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener('input', () => scheduleRender(300));
  });

  // Customization inputs
  sizeInput.addEventListener('input', () => {
    sizeOutput.value = sizeInput.value;
    sizeOutput.textContent = sizeInput.value;
    scheduleRender(120);
  });
  ecSelect.addEventListener('change', () => scheduleRender(120));
  fgColor.addEventListener('input', () => scheduleRender(120));
  bgColor.addEventListener('input', () => scheduleRender(120));
  dotStyle.addEventListener('change', () => scheduleRender(120));

  // Buttons
  $('#download-png').addEventListener('click', downloadPNG);
  $('#download-jpg').addEventListener('click', downloadJPG);
  $('#download-svg').addEventListener('click', downloadSVG);
  $('#copy-data').addEventListener('click', copyDataToClipboard);

  // Keyboard accessibility: Enter on focused tab triggers click
  tabs.forEach(t => t.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t.click(); }
  }));
}

/* -------------------------
   Boot sequence
   ------------------------- */
function boot() {
  initQRCode();
  wireUI();
  // initial render
  scheduleRender(50);
}

/* -------------------------
   Expose some functions for debugging (optional)
   ------------------------- */
window.qrPro = {
  renderQRCode,
  downloadPNG,
  downloadJPG,
  downloadSVG,
  copyDataToClipboard
};

/* -------------------------
   Start app
   ------------------------- */
document.addEventListener('DOMContentLoaded', boot);
