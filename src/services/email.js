import { env } from '../config/env.js';

// "Name <a@b.com>"  ->  { name, email }
function parseFrom(from) {
  const m = from.match(/^(.*)<(.+)>$/);
  return m ? { name: m[1].trim().replace(/^"|"$/g, ''), email: m[2].trim() } : { name: '', email: from.trim() };
}

async function postJson(url, headers, body, label) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${label} responded with ${res.status}`);
}

// Providers: "console" (prints to the log), "resend", or "brevo" (both have free plans).
export async function sendEmail({ to, subject, text, html }) {
  const { provider, apiKey, from } = env.email;

  if (provider === 'console' || !apiKey) {
    console.log(`[email:console] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  if (provider === 'resend') {
    return postJson('https://api.resend.com/emails', { Authorization: `Bearer ${apiKey}` }, { from, to: [to], subject, html, text }, 'Resend');
  }
  if (provider === 'brevo') {
    const sender = parseFrom(from);
    return postJson(
      'https://api.brevo.com/v3/smtp/email',
      { 'api-key': apiKey },
      { sender, to: [{ email: to }], subject, htmlContent: html, textContent: text },
      'Brevo'
    );
  }
  throw new Error(`Unknown EMAIL_PROVIDER: ${provider}`);
}
