const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function layout(name, intro, link, buttonText, outro) {
  const safeName = escapeHtml(name);
  const text = `Hi ${name},\n\n${intro}\n\n${link}\n\n${outro}\n\nmexMovies`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#111">
<h2 style="margin:0 0 16px"><span style="color:#d62828">mex</span>Movies</h2>
<p>Hi ${safeName},</p><p>${escapeHtml(intro)}</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#d62828;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">${escapeHtml(buttonText)}</a></p>
<p style="color:#555;font-size:14px">${escapeHtml(outro)}</p></div>`;
  return { text, html };
}

export function verifyEmailMessage(name, link) {
  return {
    subject: 'Confirm your mexMovies email',
    ...layout(
      name,
      'Welcome to mexMovies! Please confirm your email address to finish setting up your account.',
      link,
      'Confirm email',
      'This link works for 24 hours. If you did not create an account, you can ignore this email.'
    ),
  };
}

export function resetPasswordMessage(name, link) {
  return {
    subject: 'Reset your mexMovies password',
    ...layout(
      name,
      'We received a request to reset your password. Use the button below to choose a new one.',
      link,
      'Reset password',
      'This link works for 1 hour. If you did not ask for this, you can ignore this email and your password will stay the same.'
    ),
  };
}
