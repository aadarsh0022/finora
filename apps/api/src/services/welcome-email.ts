function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}

export function welcomeEmail(name: string, origin: string) {
  const firstName = name.trim().split(/\s+/)[0] || 'there';
  const support = new URL('/support', origin).toString();
  const privacy = new URL('/privacy', origin).toString();
  return {
    subject: 'Welcome to Finora AI',
    text: `Hi ${firstName},\nWelcome to Finora AI. Make room for what matters.\nStart with an account, record your first transaction, then set a goal that matters to you.\nOpen the Finora app to get started.\nNeed a hand? ${support}\nYou received this email because you created a Finora account.`,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Welcome to Finora AI</title></head>
<body style="margin:0;background:#f3f7f5;font-family:Arial,Helvetica,sans-serif;color:#172b25">
<div style="display:none;max-height:0;overflow:hidden">A little clarity. A little more confidence. Your Finora journey starts here.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:36px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e1eae5;border-radius:24px;overflow:hidden">
<tr><td style="padding:32px 32px 24px"><span style="font-size:22px;font-weight:700;letter-spacing:-.5px;color:#087e62">Finora AI</span><span style="display:block;margin-top:6px;font-size:12px;color:#71847b">YOUR PERSONAL MONEY MANAGER</span></td></tr>
<tr><td style="padding:32px;background:#e8f6ee"><p style="margin:0 0 12px;font-size:16px;color:#32735a">Hi ${escapeHtml(firstName)},</p><h1 style="margin:0;font-size:36px;line-height:1.15;letter-spacing:-1px">Make room for<br>what matters.</h1><p style="margin:20px 0 0;font-size:16px;line-height:1.7;color:#476558">Welcome to Finora AI. A clearer picture of your money starts with one small step.</p></td></tr>
<tr><td style="padding:32px"><h2 style="margin:0 0 24px;font-size:20px">Your first three steps</h2>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
<tr><td width="40" valign="top" style="padding:0 0 24px;color:#087e62;font-size:22px;font-weight:700">01</td><td style="padding:0 0 24px"><strong style="font-size:16px">Start with your accounts</strong><p style="margin:7px 0 0;font-size:14px;line-height:1.6;color:#718078">Add the accounts you want to track and their starting balances.</p></td></tr>
<tr><td width="40" valign="top" style="padding:0 0 24px;color:#087e62;font-size:22px;font-weight:700">02</td><td style="padding:0 0 24px"><strong style="font-size:16px">Capture your everyday money</strong><p style="margin:7px 0 0;font-size:14px;line-height:1.6;color:#718078">Record an expense or income and see your picture come together.</p></td></tr>
<tr><td width="40" valign="top" style="color:#087e62;font-size:22px;font-weight:700">03</td><td><strong style="font-size:16px">Give your money a direction</strong><p style="margin:7px 0 0;font-size:14px;line-height:1.6;color:#718078">Create a budget or a savings goal for something that matters to you.</p></td></tr>
</table><p style="margin:28px 0 0;padding:18px;background:#f5f8f6;border-radius:12px;font-size:14px;line-height:1.7;color:#476558">Ready when you are. Open the Finora app and take your first step.</p>
<p style="margin:28px 0 0;font-size:14px;line-height:1.7;color:#718078">Need a hand? <a href="${escapeHtml(support)}" style="color:#087e62;font-weight:700">We're here to help</a>.</p></td></tr>
<tr><td style="padding:24px 32px;border-top:1px solid #e8eeea;font-size:12px;line-height:1.7;color:#7c8b83">You received this welcome email because you created a Finora account.<br><a href="${escapeHtml(privacy)}" style="color:#718078">Privacy</a> &nbsp;·&nbsp; <a href="${escapeHtml(support)}" style="color:#718078">Support</a></td></tr>
</table><p style="margin:20px 0 0;color:#8b9991;font-size:12px">A little clarity. A little more confidence.</p>
</td></tr></table></body></html>`,
  };
}
