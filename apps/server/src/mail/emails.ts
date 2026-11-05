import { Inject, Injectable } from '@nestjs/common';
import type { Email } from './mailer.js';
import { FRONTEND_URL } from './mailer.js';

export type Language = 'es' | 'en';

const INTL: Record<Language, string> = { es: 'es-ES', en: 'en-GB' };

/** The two emails Runout sends, each in Spanish and English, links built from the web's URL. */
@Injectable()
export class EmailWriter {
  constructor(@Inject(FRONTEND_URL) private readonly frontendUrl: string) {}

  invitation(input: {
    to: string;
    language: Language;
    /** Who invited them, as Runout names them. */
    from: string;
    token: string;
    expiresAt: Date;
  }): Email {
    const link = `${this.frontendUrl}/invitation/${input.token}`;
    const expires = input.expiresAt.toLocaleDateString(INTL[input.language], {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const copy =
      input.language === 'es'
        ? {
            subject: 'Te han invitado a Runout',
            lead: `${input.from} te ha invitado a Runout, para repasar manos de póker en grupo.`,
            action: 'Crear tu cuenta',
            expiry: `El enlace es solo para ti y caduca el ${expires}.`,
            ignore:
              'Si no esperabas esta invitación, puedes ignorar este email.',
          }
        : {
            subject: "You're invited to Runout",
            lead: `${input.from} has invited you to Runout, to review poker hands as a group.`,
            action: 'Create your account',
            expiry: `The link is for you only and expires on ${expires}.`,
            ignore:
              "If you weren't expecting this invitation, you can ignore this email.",
          };
    return write(
      input.to,
      input.language,
      copy.subject,
      [copy.lead],
      copy.action,
      link,
      [copy.expiry, copy.ignore],
    );
  }

  passwordReset(input: {
    to: string;
    language: Language;
    token: string;
  }): Email {
    const link = `${this.frontendUrl}/reset-password/${input.token}`;
    const copy =
      input.language === 'es'
        ? {
            subject: 'Elige una nueva contraseña de Runout',
            lead: 'Alguien ha pedido cambiar la contraseña de tu cuenta de Runout.',
            action: 'Elegir una nueva contraseña',
            expiry: 'El enlace sirve una sola vez y durante una hora.',
            ignore:
              'Si no lo has pedido tú, ignora este email: tu contraseña no cambia.',
          }
        : {
            subject: 'Choose a new Runout password',
            lead: 'Someone asked to change the password of your Runout account.',
            action: 'Choose a new password',
            expiry: 'The link works once, for one hour.',
            ignore:
              "If it wasn't you, ignore this email: your password stays as it is.",
          };
    return write(
      input.to,
      input.language,
      copy.subject,
      [copy.lead],
      copy.action,
      link,
      [copy.expiry, copy.ignore],
    );
  }
}

const FALLBACK: Record<Language, string> = {
  es: 'Si el botón no funciona, copia este enlace en tu navegador:',
  en: "If the button doesn't work, copy this link into your browser:",
};

/*
 * The app's look, as far as email clients allow: its dark canvas and panel,
 * the brass action, Instrument Serif for the title. Tables and inline styles
 * only, since clients drop <style> and most layout; no images or SVG, which
 * many block, so the brand is the wave character and the wordmark.
 */
const LOOK = {
  canvas: '#0b0f0e',
  panel: '#0e1413',
  border: '#1a2321',
  primary: '#ecf1ef',
  secondary: '#a7b4b0',
  muted: '#75837f',
  brass: '#e0a050',
  onBrass: '#0b0f0e',
  serif: "'Instrument Serif', Georgia, 'Times New Roman', serif",
  sans: "'Instrument Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
};

function write(
  to: string,
  language: Language,
  subject: string,
  before: string[],
  action: string,
  link: string,
  after: string[],
): Email {
  const paragraphs = (lines: string[], color: string, size: number) =>
    lines
      .map(
        (line) =>
          `<p style="margin:0 0 12px;color:${color};font-size:${size}px;line-height:1.6;">${escape(line)}</p>`,
      )
      .join('\n');
  const href = escape(link);
  const html = `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${LOOK.canvas};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(before[0] ?? '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${LOOK.canvas};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;font-family:${LOOK.sans};">
<tr><td style="padding:0 4px 20px;color:${LOOK.primary};font-family:${LOOK.serif};font-size:17px;letter-spacing:0.18em;">
<span style="color:${LOOK.brass};font-size:24px;letter-spacing:0;vertical-align:-2px;">&#8767;</span>&nbsp; RUNOUT
</td></tr>
<tr><td style="background:${LOOK.panel};border:1px solid ${LOOK.border};border-radius:10px;padding:32px 28px;">
<h1 style="margin:0 0 16px;color:${LOOK.primary};font-family:${LOOK.serif};font-size:30px;font-weight:400;line-height:1.2;">${escape(subject)}</h1>
${paragraphs(before, LOOK.secondary, 15)}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
<tr><td style="background:${LOOK.brass};border-radius:8px;">
<a href="${href}" style="display:inline-block;padding:12px 22px;color:${LOOK.onBrass};font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">${escape(action)}</a>
</td></tr>
</table>
${paragraphs(after, LOOK.muted, 13)}
<p style="margin:20px 0 0;padding-top:16px;border-top:1px solid ${LOOK.border};color:${LOOK.muted};font-size:12px;line-height:1.6;">${escape(FALLBACK[language])}<br>
<a href="${href}" style="color:${LOOK.brass};word-break:break-all;">${href}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  const text = [...before, '', `${action}: ${link}`, '', ...after].join('\n');
  return { to, subject, html, text };
}

function escape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
