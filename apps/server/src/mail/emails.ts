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
    return write(input.to, copy.subject, [copy.lead], copy.action, link, [
      copy.expiry,
      copy.ignore,
    ]);
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
    return write(input.to, copy.subject, [copy.lead], copy.action, link, [
      copy.expiry,
      copy.ignore,
    ]);
  }
}

function write(
  to: string,
  subject: string,
  before: string[],
  action: string,
  link: string,
  after: string[],
): Email {
  const paragraphs = (lines: string[]) =>
    lines.map((line) => `<p>${escape(line)}</p>`).join('\n');
  const html = `<!doctype html>
<html><body style="font-family: sans-serif; line-height: 1.5; color: #1b1f1d;">
${paragraphs(before)}
<p><a href="${escape(link)}">${escape(action)}</a></p>
${paragraphs(after)}
</body></html>`;
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
