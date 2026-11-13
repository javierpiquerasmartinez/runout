import { Inject, Injectable } from '@nestjs/common';
import type { Email } from './mailer.js';
import { FRONTEND_URL } from './mailer.js';

export type Language = 'es' | 'en';

const INTL: Record<Language, string> = { es: 'es-ES', en: 'en-GB' };

const MB = 1024 * 1024;

/** The emails Runout sends to people, each in Spanish and English, links built from the web's URL. */
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
            lead: `${input.from} te ha invitado a Runout, para guardar tus manos de póker, ver tus resultados y estudiarlas, a solas o en grupo.`,
            action: 'Crear tu cuenta',
            expiry: `El enlace es solo para ti y caduca el ${expires}.`,
            ignore:
              'Si no esperabas esta invitación, puedes ignorar este email.',
          }
        : {
            subject: "You're invited to Runout",
            lead: `${input.from} has invited you to Runout, to keep your poker hands, see your results and study them, on your own or as a group.`,
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

  /** To the Importer of a Bulk Import that completed or failed. */
  bulkImportEnded(input: {
    to: string;
    language: Language;
    bulkImport: EndedBulkImport;
  }): Email {
    return bulkImportEnded(this.frontendUrl, input);
  }

  /** To an Administrator, when a Bulk Import has failed. */
  bulkImportFailed(input: {
    to: string;
    language: Language;
    bulkImport: FailedBulkImport;
  }): Email {
    const { language, bulkImport } = input;
    const number = new Intl.NumberFormat(INTL[language]);
    const n = (count: number) => number.format(count);
    const files = bulkImport.fileNames.join(', ');
    const es = language === 'es';
    return write(
      input.to,
      language,
      es ? 'Una importación ha fallado' : 'An import has failed',
      es
        ? [
            `La importación de ${files} de ${bulkImport.account} ha fallado tras ${n(bulkImport.processed)} de ${n(bulkImport.total ?? 0)} manos.`,
            `Importadas: ${n(bulkImport.imported)}`,
            `Motivo: ${bulkImport.failureCode}`,
            'Sus archivos se conservan 7 días: hasta entonces puedes reintentarla desde Administración.',
          ]
        : [
            `The import of ${files} by ${bulkImport.account} failed after ${n(bulkImport.processed)} of ${n(bulkImport.total ?? 0)} hands.`,
            `Imported: ${n(bulkImport.imported)}`,
            `Reason: ${bulkImport.failureCode}`,
            'Its files are kept for 7 days: until then you can retry it from Administration.',
          ],
      es ? 'Ver importaciones' : 'See imports',
      `${this.frontendUrl}/admin/imports`,
      [
        es
          ? 'Te escribimos porque eres administrador de Runout.'
          : 'You are receiving this because you are a Runout Administrator.',
      ],
    );
  }

  /** To an Administrator, the once a Bulk Import stalls. */
  bulkImportStalled(input: {
    to: string;
    language: Language;
    bulkImport: StalledBulkImport;
  }): Email {
    return bulkImportStalled(this.frontendUrl, input);
  }

  /** To an Administrator, when the database reaches its threshold and Bulk Imports pause. */
  bulkImportsPaused(input: {
    to: string;
    language: Language;
    storage: { paused: number; used: number; threshold: number };
  }): Email {
    const { language, storage } = input;
    const number = new Intl.NumberFormat(INTL[language]);
    const mb = (bytes: number) => `${number.format(Math.round(bytes / MB))} MB`;
    const es = language === 'es';
    const imports = es
      ? storage.paused === 1
        ? '1 importación'
        : `${number.format(storage.paused)} importaciones`
      : storage.paused === 1
        ? '1 import'
        : `${number.format(storage.paused)} imports`;
    return write(
      input.to,
      language,
      es ? 'Las importaciones están en pausa' : 'Imports are paused',
      es
        ? [
            `La base de datos ocupa ${mb(storage.used)} de ${mb(storage.threshold)}, su límite configurado. ${imports} ${storage.paused === 1 ? 'se ha puesto' : 'se han puesto'} en pausa, y las que empiecen ahora también lo harán. Las importaciones pequeñas siguen funcionando.`,
            'Se reanudan solas en la comprobación de cada hora en cuanto la base de datos esté por debajo del límite: al liberar espacio, o al subir STORAGE_THRESHOLD_MB tras ampliar el plan.',
          ]
        : [
            `The database takes ${mb(storage.used)} of ${mb(storage.threshold)}, its configured limit. ${imports} ${storage.paused === 1 ? 'has' : 'have'} been paused, and any started now will be too. Small imports still work.`,
            'They resume by themselves at the hourly check once the database is below the limit: by freeing space, or by raising STORAGE_THRESHOLD_MB after upgrading the plan.',
          ],
      es ? 'Ver importaciones' : 'See imports',
      `${this.frontendUrl}/admin/imports`,
      [
        es
          ? 'Te escribimos porque eres administrador de Runout. No volveremos a avisarte hasta que se reanuden y se vuelva a llegar al límite.'
          : 'You are receiving this because you are a Runout Administrator. We will not tell you again until they resume and the limit is reached again.',
      ],
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

/** A Bulk Import as it ended, as its Importer is told it. */
export interface EndedBulkImport {
  status: 'completed' | 'failed';
  /** Why it ended short of adding its Hands, when it did. */
  reason: string | null;
  fileNames: string[];
  total: number | null;
  processed: number;
  imported: number;
  duplicates: number;
  /** Hands not imported, per reason; `library-full` counts those that did not fit. */
  notImported: Record<string, number>;
}

/** A failed Bulk Import as Administrators are told it: never the text of a Hand. */
export interface FailedBulkImport {
  /** The Account, as Runout names it: its email, else its Display Name. */
  account: string;
  fileNames: string[];
  total: number | null;
  processed: number;
  imported: number;
  /** The technical code it failed with. */
  failureCode: string;
}

/** The email to an Importer whose Bulk Import ended, in their language. */
function bulkImportEnded(
  frontendUrl: string,
  input: { to: string; language: Language; bulkImport: EndedBulkImport },
): Email {
  const { language, bulkImport } = input;
  const number = new Intl.NumberFormat(INTL[language]);
  const n = (count: number) => number.format(count);
  const notFit = bulkImport.notImported['library-full'] ?? 0;
  const notRecognised = Object.entries(bulkImport.notImported)
    .filter(([reason]) => reason !== 'library-full')
    .reduce((sum, [, count]) => sum + count, 0);
  const files = bulkImport.fileNames.join(', ');
  const failed = bulkImport.status === 'failed';
  const es = language === 'es';

  const subject = failed
    ? es
      ? 'Tu importación se ha interrumpido'
      : 'Your import was interrupted'
    : es
      ? 'Tu importación ha terminado'
      : 'Your import has finished';
  const lead = failed
    ? es
      ? `La importación de ${files} se interrumpió tras ${n(bulkImport.processed)} de ${n(bulkImport.total ?? 0)} manos. Las ${n(bulkImport.imported)} manos importadas se conservan en tu biblioteca; el resto no se ha importado.`
      : `The import of ${files} was interrupted after ${n(bulkImport.processed)} of ${n(bulkImport.total ?? 0)} hands. The ${n(bulkImport.imported)} hands imported are kept in your Library; the rest were not imported.`
    : es
      ? `Ha terminado la importación de ${files}.`
      : `The import of ${files} has finished.`;
  const counts = es
    ? [
        `Importadas: ${n(bulkImport.imported)}`,
        `Duplicadas: ${n(bulkImport.duplicates)}`,
        `No reconocidas: ${n(notRecognised)}`,
      ]
    : [
        `Imported: ${n(bulkImport.imported)}`,
        `Duplicates: ${n(bulkImport.duplicates)}`,
        `Not recognised: ${n(notRecognised)}`,
      ];
  const why: Record<string, string> = es
    ? {
        'too-many-hands':
          'Tiene más de 2 millones de manos: no se ha importado ninguna.',
        'unreadable-file': 'No se ha podido abrir uno de los archivos.',
        'unrecognised-format':
          'No hemos reconocido el formato de ninguna mano.',
        'library-full': `Biblioteca llena: ${n(notFit)} ${notFit === 1 ? 'mano no cabía' : 'manos no cabían'}.`,
      }
    : {
        'too-many-hands':
          'It has more than 2 million hands: none was imported.',
        'unreadable-file': 'One of the files could not be opened.',
        'unrecognised-format': 'We did not recognise the format of any hand.',
        'library-full': `Library full: ${n(notFit)} ${notFit === 1 ? 'hand did not fit' : 'hands did not fit'}.`,
      };
  const reason = bulkImport.reason ? why[bulkImport.reason] : undefined;
  const footer = es
    ? 'Te escribimos porque empezaste esta importación en Runout.'
    : 'You are receiving this because you started this import on Runout.';
  return write(
    input.to,
    language,
    subject,
    [lead, ...(reason ? [reason] : []), ...counts],
    es ? 'Ver importaciones' : 'See imports',
    `${frontendUrl}/library/imports`,
    [footer],
  );
}

/** A Bulk Import without advance, as Administrators are told it. */
export interface StalledBulkImport {
  /** Its Account's email, or its id when it has none. */
  account: string;
  fileNames: string[];
  /** Null while its files are not counted yet. */
  total: number | null;
  processed: number;
}

/** The email to an Administrator about a Bulk Import that stalled, in their language. */
function bulkImportStalled(
  frontendUrl: string,
  input: { to: string; language: Language; bulkImport: StalledBulkImport },
): Email {
  const { language, bulkImport } = input;
  const number = new Intl.NumberFormat(INTL[language]);
  const n = (count: number) => number.format(count);
  const files = bulkImport.fileNames.join(', ');
  const es = language === 'es';
  const lead = es
    ? `La importación de ${files} de ${bulkImport.account} lleva más de 30 minutos sin avanzar.`
    : `The import of ${files} by ${bulkImport.account} has not advanced for over 30 minutes.`;
  const where =
    bulkImport.total === null
      ? es
        ? 'Aún no ha empezado a añadir manos.'
        : 'It has not started adding hands yet.'
      : es
        ? `Va por ${n(bulkImport.processed)} de ${n(bulkImport.total)} manos.`
        : `It is at ${n(bulkImport.processed)} of ${n(bulkImport.total)} hands.`;
  const footer = es
    ? 'Te escribimos porque eres administrador de Runout. No volveremos a avisarte de esta importación salvo que avance y se vuelva a atascar.'
    : 'You are receiving this because you are a Runout Administrator. We will not tell you about this import again unless it advances and stalls again.';
  return write(
    input.to,
    language,
    es ? 'Una importación está atascada' : 'An import has stalled',
    [lead, where],
    es ? 'Ver importaciones' : 'See imports',
    `${frontendUrl}/admin/imports`,
    [footer],
  );
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
