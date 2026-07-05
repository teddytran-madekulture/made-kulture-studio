// Branded, responsive Made Kulture email templates.
//
// Pure string-building — safe to import on BOTH the client (live preview) and the
// server (send). No DB/Resend imports here. The compliance shell (header + address
// + unsubscribe) is applied by renderShell so every send stays CAN-SPAM-clean no
// matter which template is used.

const ADDRESS = '4825 Gulf Freeway, Houston TX 77023'
const GOLD = '#c9b27e'

export interface TemplateField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'image' | 'url'
  placeholder?: string
}
export interface EmailTemplate {
  id: string
  name: string
  blurb: string
  fields: TemplateField[]
  defaults: Record<string, string>
  render: (v: Record<string, string>, promoCode?: string) => string
}

// ── small building blocks ─────────────────────────────────────────────────────
const esc = (s = '') => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const nl2br = (s = '') => esc(s).replace(/\n/g, '<br/>')

function button(text?: string, url?: string, align: 'left' | 'center' = 'left'): string {
  if (!text || !url) return ''
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px ${align === 'center' ? 'auto' : '0'} 4px;"><tr>
    <td style="border-radius:6px;background:${GOLD};">
      <a href="${esc(url)}" style="display:inline-block;padding:14px 32px;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#0b0b0d;text-decoration:none;">${esc(text)}</a>
    </td></tr></table>`
}

function promoBlock(code?: string, align: 'left' | 'center' = 'left'): string {
  if (!code) return ''
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px ${align === 'center' ? 'auto' : '0'};"><tr>
    <td style="border:1px dashed ${GOLD};border-radius:8px;padding:14px 26px;text-align:center;">
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#8a7d5a;margin-bottom:4px;">Use code</div>
      <div style="font-family:'Courier New',monospace;font-size:22px;font-weight:700;letter-spacing:0.12em;color:${GOLD};">${esc(code)}</div>
    </td></tr></table>`
}

const eyebrow = (t?: string, align = 'left') =>
  t ? `<div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:${GOLD};margin-bottom:12px;text-align:${align};">${esc(t)}</div>` : ''
const heading = (t?: string, align = 'left', size = 30) =>
  t ? `<h1 style="font-family:'Arial Black',Arial,sans-serif;font-size:${size}px;line-height:1.08;color:#ffffff;letter-spacing:-0.01em;margin:0 0 14px;text-align:${align};">${esc(t)}</h1>` : ''
const bodyText = (t?: string, align = 'left') =>
  t ? `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#cfcfcf;text-align:${align};">${nl2br(t)}</div>` : ''
const img = (src?: string) =>
  src ? `<img src="${esc(src)}" width="600" style="width:100%;max-width:600px;display:block;border:0;" alt=""/>` : ''

// ── the compliance shell (header + body + footer/unsubscribe) ─────────────────
export function renderShell(bodyHtml: string, unsubUrl: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:24px 12px;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#141416;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#000000;padding:16px 28px;border-bottom:2px solid ${GOLD};">
        <span style="font-family:'Courier New',monospace;font-size:16px;font-weight:700;letter-spacing:0.35em;color:#ffffff;">MADE KULTURE</span>
      </td></tr>
      <tr><td>${bodyHtml}</td></tr>
      <tr><td style="padding:22px 28px;border-top:1px solid #2a2a2a;color:#777777;font-size:11px;line-height:1.7;font-family:Helvetica,Arial,sans-serif;">
        Made Kulture · ${ADDRESS} · by appointment · (832) 408-1631<br/>
        You're receiving this because you've booked with us. <a href="${unsubUrl}" style="color:#999999;">Unsubscribe</a>.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`
}

// ── templates ─────────────────────────────────────────────────────────────────
export const TEMPLATES: EmailTemplate[] = [
  {
    id: 'hero',
    name: 'Hero Announcement',
    blurb: 'Full-width image up top, bold headline, and a call-to-action. Great for new sets, events, or big news.',
    fields: [
      { key: 'imageUrl', label: 'Hero image URL', type: 'image', placeholder: 'https://…/your-photo.jpg' },
      { key: 'eyebrow', label: 'Eyebrow (small label)', type: 'text', placeholder: 'NEW THIS MONTH' },
      { key: 'heading', label: 'Headline', type: 'text', placeholder: 'Introducing The Watering Hole' },
      { key: 'body', label: 'Body', type: 'textarea', placeholder: 'A shallow black pool set built for editorial…' },
      { key: 'ctaText', label: 'Button text', type: 'text', placeholder: 'BOOK THE SET' },
      { key: 'ctaUrl', label: 'Button link', type: 'url', placeholder: 'https://madekulture.com/book' },
    ],
    defaults: { imageUrl: '', eyebrow: 'NEW THIS MONTH', heading: 'A new set just dropped', body: 'Come shoot it first.', ctaText: 'BOOK NOW', ctaUrl: 'https://madekulture.com/book' },
    render: (v, promo) => `${img(v.imageUrl)}<div style="padding:32px 28px;">
      ${eyebrow(v.eyebrow)}${heading(v.heading)}${bodyText(v.body)}${promoBlock(promo)}${button(v.ctaText, v.ctaUrl)}
    </div>`,
  },
  {
    id: 'feature',
    name: 'Feature (image + text)',
    blurb: 'Headline first, an image in the middle, then your story and a button. Clean and editorial.',
    fields: [
      { key: 'eyebrow', label: 'Eyebrow (small label)', type: 'text', placeholder: 'STUDIO UPDATE' },
      { key: 'heading', label: 'Headline', type: 'text', placeholder: 'Phase 3 is (almost) done' },
      { key: 'imageUrl', label: 'Image URL', type: 'image', placeholder: 'https://…/your-photo.jpg' },
      { key: 'body', label: 'Body', type: 'textarea', placeholder: 'New roof, partial A/C, makeup vanity…' },
      { key: 'ctaText', label: 'Button text', type: 'text', placeholder: 'SEE THE SPACE' },
      { key: 'ctaUrl', label: 'Button link', type: 'url', placeholder: 'https://madekulture.com/sets' },
    ],
    defaults: { eyebrow: 'STUDIO UPDATE', heading: 'Something new at the studio', body: '', ctaText: 'LEARN MORE', ctaUrl: 'https://madekulture.com', imageUrl: '' },
    render: (v, promo) => `<div style="padding:32px 28px 8px;">${eyebrow(v.eyebrow)}${heading(v.heading)}</div>
      ${v.imageUrl ? `<div style="padding:8px 0;">${img(v.imageUrl)}</div>` : ''}
      <div style="padding:20px 28px 32px;">${bodyText(v.body)}${promoBlock(promo)}${button(v.ctaText, v.ctaUrl)}</div>`,
  },
  {
    id: 'promo',
    name: 'Promo / Sale',
    blurb: 'Centered, discount-forward layout with a highlighted promo code. Best paired with an attached code.',
    fields: [
      { key: 'eyebrow', label: 'Eyebrow (small label)', type: 'text', placeholder: 'LIMITED TIME' },
      { key: 'heading', label: 'Big headline', type: 'text', placeholder: '20% off your next shoot' },
      { key: 'body', label: 'Body', type: 'textarea', placeholder: 'Book any set through the end of the month…' },
      { key: 'ctaText', label: 'Button text', type: 'text', placeholder: 'CLAIM IT' },
      { key: 'ctaUrl', label: 'Button link', type: 'url', placeholder: 'https://madekulture.com/book' },
    ],
    defaults: { eyebrow: 'LIMITED TIME', heading: 'A little something off', body: '', ctaText: 'BOOK NOW', ctaUrl: 'https://madekulture.com/book' },
    render: (v, promo) => `<div style="padding:40px 28px;text-align:center;">
      ${eyebrow(v.eyebrow, 'center')}${heading(v.heading, 'center', 34)}${bodyText(v.body, 'center')}
      ${promoBlock(promo, 'center')}${button(v.ctaText, v.ctaUrl, 'center')}
    </div>`,
  },
  {
    id: 'plain',
    name: 'Simple Note',
    blurb: 'Clean typography, no image — just a headline, your message, and an optional button. Feels personal.',
    fields: [
      { key: 'heading', label: 'Headline', type: 'text', placeholder: 'Thanks for shooting with us' },
      { key: 'body', label: 'Body', type: 'textarea', placeholder: 'Write your message…' },
      { key: 'ctaText', label: 'Button text (optional)', type: 'text', placeholder: 'BOOK AGAIN' },
      { key: 'ctaUrl', label: 'Button link (optional)', type: 'url', placeholder: 'https://madekulture.com/book' },
    ],
    defaults: { heading: 'A quick note', body: '', ctaText: '', ctaUrl: '' },
    render: (v, promo) => `<div style="padding:36px 28px;">
      ${heading(v.heading)}${bodyText(v.body)}${promoBlock(promo)}${button(v.ctaText, v.ctaUrl)}
    </div>`,
  },
]

export function getTemplate(id?: string | null): EmailTemplate | undefined {
  return TEMPLATES.find(t => t.id === id)
}

// Render just the inner body for a template + values (used by send + preview).
export function renderTemplateBody(templateId: string, values: Record<string, string>, promoCode?: string): string {
  const t = getTemplate(templateId)
  if (!t) return ''
  return t.render(values || {}, promoCode)
}

// Full email (shell + body) — used for the live preview with a dummy unsubscribe.
export function renderTemplateEmail(templateId: string, values: Record<string, string>, promoCode?: string): string {
  return renderShell(renderTemplateBody(templateId, values, promoCode), '#')
}
