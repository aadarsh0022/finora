function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character]!;
  });
}

export function passwordResetEmail(link: string) {
  const url = new URL(link);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid reset URL');
  const href = escapeHtml(url.toString());
  return {
    subject: 'Reset your Walleto password',
    text: `Reset your Walleto password: ${url.toString()}\nThis link expires in 30 minutes. If you did not request it, ignore this message.`,
    html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reset your Walleto password</title></head>
<body style="margin:0;padding:0;background:#f4f7f6;font-family:Arial,Helvetica,sans-serif;color:#172522">
<div style="display:none;max-height:0;overflow:hidden">Reset your password securely. Your link expires in 30 minutes.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7f6"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #e3ebe7;border-radius:20px"><tr><td style="padding:36px 28px">
<p style="margin:0 0 32px;font-size:22px;font-weight:700;color:#087e62">Walleto AI</p>
<h1 style="margin:0 0 16px;font-size:28px;line-height:1.25;letter-spacing:-0.5px">Reset your password</h1>
<p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#596b64">Let's get you back to your money. Choose a new password using the button below.</p>
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td align="center" bgcolor="#087e62" style="border-radius:10px"><a href="${href}" style="display:inline-block;padding:16px 28px;border:1px solid #087e62;border-radius:10px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none">Reset password</a></td></tr></table>
<p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#596b64">This link expires in 30 minutes and can only be used once.</p>
<p style="margin:24px 0 0;padding-top:24px;border-top:1px solid #e8eeeb;font-size:14px;line-height:1.6;color:#73817b">Didn't request a password reset? You can safely ignore this email. Your password will stay the same.</p>
</td></tr></table>
<p style="margin:20px 0 0;font-size:12px;color:#73817b">Walleto</p>
</td></tr></table></body></html>`,
  };
}
