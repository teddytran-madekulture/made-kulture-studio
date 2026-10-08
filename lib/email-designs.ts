// Fully-designed marketing emails (2026-10-08). Unlike lib/email-templates.ts
// these are complete HTML documents, sent as designed with NO shared shell —
// the design carries its own address footer. The ONE thing the sender injects
// is the per-recipient unsubscribe link, at the {{UNSUBSCRIBE_URL}} token;
// lib/marketing.ts refuses to send a design that lacks it (CAN-SPAM).
//
// Images live in public/email/<slug>/ so they're served from madekulture.com
// and never move. Source file: Marketing Assets/Launch Emails 2026-10/.

export const UNSUB_TOKEN = '{{UNSUBSCRIBE_URL}}'

export interface EmailDesign { id: string; name: string; blurb: string; subject: string; html: string }

export const DESIGNS: EmailDesign[] = [
  {
    id: 'design-launch-2026-10',
    name: 'Issue 01 · The new madekulture.com',
    blurb: 'October 2026 launch email: the new site + the Directory, with The Patient open call as the hook. Sent exactly as designed.',
    subject: 'The new madekulture.com is live',
    html: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>The new madekulture.com is live</title>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; background:#000000; }
  @media (max-width:640px) {
    .band { width:100% !important; }
    .col { width:100% !important; }
    .pad { padding-left:24px !important; padding-right:24px !important; }
    .h2 { font-size:40px !important; }
    .stack { display:block !important; width:100% !important; box-sizing:border-box; }
    .hookimg { width:100% !important; height:auto !important; }
    .three td { display:block !important; width:100% !important; padding:0 0 18px 0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#000000;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#000;">We rebuilt our website from the ground up, and it comes with the Directory. First up: The Patient.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#000000;">
<tr><td align="center" style="padding:0;">

<table role="presentation" class="band" width="900" cellpadding="0" cellspacing="0" border="0" style="width:900px;background:#0b0b0c;">

  <!-- masthead -->
  <tr><td class="pad" style="padding:24px 60px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-family:Anton,Impact,'Arial Narrow',Arial,sans-serif;font-size:22px;letter-spacing:2px;color:#ffffff;">MADE KULTURE</td>
      <td align="right" style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:3px;color:#c9b27e;">ISSUE 01 · OCTOBER</td>
    </tr></table>
  </td></tr>

  <!-- hero: photo melts into the page, headline baked in -->
  <tr><td style="padding:0;">
    <a href="https://madekulture.com/signup?next=%2Faccount%2Fdirectory"><img src="https://madekulture.com/email/2026-10-launch/hero-v4.jpg" width="900" alt="The new Made Kulture. Now live at madekulture.com." style="display:block;width:100%;max-width:900px;height:auto;border:0;"></a>
  </td></tr>

  <!-- primary CTA: visible on the first screen -->
  <tr><td class="pad" align="left" style="padding:6px 60px 0;">
    <a href="https://madekulture.com/signup?next=%2Faccount%2Fdirectory" style="display:inline-block;background:#ffffff;color:#000000;font-family:'Courier New',monospace;font-size:12px;font-weight:700;letter-spacing:3px;text-decoration:none;padding:17px 28px;">JOIN THE DIRECTORY &rarr;</a>
    <div style="font-family:Inter,Helvetica,Arial,sans-serif;font-size:12.5px;color:#6f6f6f;margin-top:12px;">Free. Your account also gets you member rates on every set.</div>
  </td></tr>

  <!-- the launch + the directory -->
  <tr><td class="pad" align="left" style="padding:0 60px;">
    <table role="presentation" class="col" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;">
      <tr><td style="padding:30px 0 0;font-family:Inter,Helvetica,Arial,sans-serif;font-size:17px;line-height:1.7;color:#c4c4c4;">
        We rebuilt madekulture.com from the ground up. The biggest part of it isn't the booking. It's <b style="color:#ffffff;">the Directory</b>: Houston's network of photographers, models, MUAs, stylists, brands and production pros, all people who shoot here.
      </td></tr>
      <tr><td style="padding:30px 0 0;">
        <table role="presentation" class="three" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="33%" valign="top" style="padding-right:16px;">
            <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;color:#c9b27e;">01</div>
            <div style="font-family:Anton,Impact,'Arial Narrow',Arial,sans-serif;font-size:22px;color:#fff;margin:6px 0 4px;">FIND YOUR CREW</div>
            <div style="font-family:Inter,Helvetica,Arial,sans-serif;font-size:13.5px;line-height:1.5;color:#8a8a8a;">Models, MUAs, stylists and vendors who already know the space.</div>
          </td>
          <td width="33%" valign="top" style="padding-right:16px;">
            <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;color:#c9b27e;">02</div>
            <div style="font-family:Anton,Impact,'Arial Narrow',Arial,sans-serif;font-size:22px;color:#fff;margin:6px 0 4px;">GET FOUND</div>
            <div style="font-family:Inter,Helvetica,Arial,sans-serif;font-size:13.5px;line-height:1.5;color:#8a8a8a;">Your work, your roles, and credit on every shoot you're tagged in.</div>
          </td>
          <td width="33%" valign="top">
            <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;color:#c9b27e;">03</div>
            <div style="font-family:Anton,Impact,'Arial Narrow',Arial,sans-serif;font-size:22px;color:#fff;margin:6px 0 4px;">GET FEATURED</div>
            <div style="font-family:Inter,Helvetica,Arial,sans-serif;font-size:13.5px;line-height:1.5;color:#8a8a8a;">Open calls, castings, and the vote on what we feature next.</div>
          </td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>

  <!-- the hook: The Patient (headline baked into the image, melts into the page) -->
  <tr><td style="padding:56px 0 0;">
    <a href="https://madekulture.com/submissions#the-patient"><img src="https://madekulture.com/email/2026-10-launch/hook-v4.jpg" width="900" alt="First up: The Patient. Shoot it. Submit it. We all vote." style="display:block;width:100%;max-width:900px;height:auto;border:0;"></a>
  </td></tr>
  <tr><td class="pad" align="left" style="padding:0 60px;">
    <table role="presentation" class="col" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;">
      <tr><td style="padding:22px 0 0;font-family:Inter,Helvetica,Arial,sans-serif;font-size:15.5px;line-height:1.65;color:#b5b5b5;">
        Our Halloween set is up in Studio One until Oct 31. Make something there, submit your series, and the Directory picks the feature. The winner gets a year of Plus.
      </td></tr>
      <tr><td style="padding:22px 0 0;">
        <a href="https://madekulture.com/submissions#the-patient" style="display:inline-block;font-family:'Courier New',monospace;font-size:12px;font-weight:700;letter-spacing:3px;color:#ffffff;text-decoration:none;border-bottom:1px solid #c9b27e;padding-bottom:4px;">SEE THE OPEN CALL &rarr;</a>
      </td></tr>
    </table>
  </td></tr>

  <!-- closing CTA -->
  <tr><td class="pad" align="left" style="padding:56px 60px 0;">
    <div style="font-family:'Courier New',monospace;font-size:10.5px;letter-spacing:4px;color:#c9b27e;">FREE TO JOIN</div>
    <div class="h2" style="font-family:Anton,Impact,'Arial Narrow',Arial,sans-serif;font-size:46px;line-height:0.95;color:#ffffff;margin:14px 0 22px;">PUT YOUR NAME<br>IN THE DIRECTORY.</div>
    <a href="https://madekulture.com/signup?next=%2Faccount%2Fdirectory" style="display:inline-block;background:#ffffff;color:#000000;font-family:'Courier New',monospace;font-size:12px;font-weight:700;letter-spacing:3px;text-decoration:none;padding:17px 28px;">JOIN THE DIRECTORY &rarr;</a>
  </td></tr>

  <!-- booking one-liner -->
  <tr><td class="pad" align="left" style="padding:0 60px;">
    <table role="presentation" class="col" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;">
      <tr><td style="padding:44px 0 44px;font-family:Inter,Helvetica,Arial,sans-serif;font-size:14.5px;line-height:1.7;color:#9a9a9a;">
        <b style="color:#ffffff;">Booking lives at madekulture.com now.</b> Live availability, check in from your phone, move your own booking. Already booked? Nothing changes. See you then.
      </td></tr>
    </table>
  </td></tr>

  <!-- footer -->
  <tr><td class="pad" style="padding:22px 60px 30px;border-top:1px solid #1d1d1d;">
    <div style="font-family:Inter,Helvetica,Arial,sans-serif;font-size:11.5px;line-height:1.7;color:#5f5f5f;">
      Made Kulture · 4825 Gulf Freeway, Houston TX 77023 · Cover: The Patient · Photographer <a href="https://www.instagram.com/musebyteddy/" style="color:#8a8a8a;">@musebyteddy</a> · Model <a href="https://www.instagram.com/ariellelovex/" style="color:#8a8a8a;">@ariellelovex</a><br>
      You're getting this because you've booked with us. <a href="{{UNSUBSCRIBE_URL}}" style="color:#8a8a8a;">Unsubscribe</a>
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>
`,
  },
]
