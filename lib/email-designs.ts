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
  {
    // 2026-11-23: Gigs launch. Three doors (creatives / brands / anyone hiring),
    // Ashdon's bridal role as the teaser with no company or pay named. Source +
    // hero builder: Marketing Assets/Gigs Launch Email 2026-11/.
    id: 'design-gigs-2026-11',
    name: 'Introducing Gigs · November',
    blurb: 'Gigs launch, light bridal theme: the first gig as a featured card, then creatives / brands / anyone hiring. Sent exactly as designed.',
    subject: 'Introducing Gigs: paid work, posted in the directory',
    html: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>Introducing Gigs</title>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: light only; }
  body { margin:0; padding:0; background:#ece6dc; }
  @media (max-width:640px) {
    .band { width:100% !important; }
    .pad { padding-left:22px !important; padding-right:22px !important; }
    .three td.cell { display:block !important; width:100% !important; padding:0 0 34px 0 !important; }
    .h2 { font-size:40px !important; }
    .tag { display:none !important; }
    .gigtitle { font-size:34px !important; }
    .gigbtn { display:block !important; text-align:center !important; }
    .chip { font-size:9.5px !important; letter-spacing:1px !important; padding:7px 8px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#ece6dc;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#ece6dc;">The first gig is live: a paid content creator role for a group of bridal brands.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ece6dc;">
<tr><td align="center" style="padding:0;">

<table role="presentation" class="band" width="900" cellpadding="0" cellspacing="0" border="0" style="width:900px;background:#f7f3ed;">

  <!-- masthead -->
  <tr><td class="pad" style="padding:24px 60px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-family:Anton,Impact,'Arial Narrow',Arial,sans-serif;font-size:22px;letter-spacing:2px;color:#181614;">MADE KULTURE</td>
      <td class="tag" align="right" style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:3px;color:#9c7c3e;">NEW FEATURE · NOVEMBER</td>
    </tr></table>
  </td></tr>

  <!-- hero: headline baked into the photo, fades into the page -->
  <tr><td style="padding:0;">
    <a href="https://madekulture.com/signup?as=creative&amp;next=%2Faccount%2Fgigs"><img src="https://madekulture.com/email/2026-11-gigs/hero.jpg" width="900" alt="Introducing Gigs. Paid creative work, posted where Houston creatives already are." style="display:block;width:100%;max-width:900px;height:auto;border:0;"></a>
  </td></tr>

  <!-- the first gig: its own card, front and center -->
  <tr><td class="pad" style="padding:30px 60px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e4dccf;border-top:4px solid #9c7c3e;">
      <tr><td style="padding:32px 34px 34px;">
        <div style="font-family:'Courier New',monospace;font-size:11px;font-weight:700;letter-spacing:3px;color:#9c7c3e;">NOW HIRING &middot; THE FIRST GIG</div>
        <div class="gigtitle" style="font-family:Anton,Impact,'Arial Narrow',Arial,sans-serif;font-size:42px;line-height:1.02;color:#181614;margin:12px 0 8px;">SOCIAL MEDIA<br>CONTENT CREATOR</div>
        <div style="font-family:Inter,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#5c5650;">For a group of established bridal brands. Shoot and edit photo and video in their stores, on studio days and on location.</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;"><tr>
          <td class="chip" style="font-family:'Courier New',monospace;font-size:10.5px;font-weight:700;letter-spacing:2px;color:#181614;background:#f3ece0;padding:8px 10px;white-space:nowrap;">PAID</td>
          <td style="width:8px;"></td>
          <td class="chip" style="font-family:'Courier New',monospace;font-size:10.5px;font-weight:700;letter-spacing:2px;color:#181614;background:#f3ece0;padding:8px 10px;white-space:nowrap;">ONGOING</td>
          <td style="width:8px;"></td>
          <td class="chip" style="font-family:'Courier New',monospace;font-size:10.5px;font-weight:700;letter-spacing:2px;color:#181614;background:#f3ece0;padding:8px 10px;white-space:nowrap;">PHOTO + VIDEO</td>
        </tr></table>
        <a class="gigbtn" href="https://madekulture.com/signup?as=creative&amp;next=%2Faccount%2Fgigs" style="display:inline-block;margin-top:24px;background:#181614;color:#f7f3ed;font-family:'Courier New',monospace;font-size:12px;font-weight:700;letter-spacing:2px;text-decoration:none;padding:17px 24px;">JOIN THE DIRECTORY TO SEE THE GIG &rarr;</a>
        <div style="font-family:Inter,Helvetica,Arial,sans-serif;font-size:12.5px;color:#8a8279;margin-top:12px;">Free to join. Company details and applications are for directory members.</div>
      </td></tr>
    </table>
  </td></tr>

  <!-- three doors -->
  <tr><td class="pad" style="padding:50px 60px 0;">
    <table role="presentation" class="three" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>

      <td class="cell" width="33%" valign="top" style="padding-right:22px;">
        <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:3px;color:#9c7c3e;">01 &middot; CREATIVES</div>
        <div style="font-family:Anton,Impact,'Arial Narrow',Arial,sans-serif;font-size:26px;line-height:1.05;color:#181614;margin:8px 0 12px;">GET PAID WORK</div>
        <div style="font-family:Inter,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.85;color:#5c5650;">
          &#8226;&nbsp; Paid gigs from brands and clients<br>
          &#8226;&nbsp; Alerts when one fits your role<br>
          &#8226;&nbsp; Your portfolio goes with every application
        </div>
        <a href="https://madekulture.com/signup?as=creative&amp;next=%2Faccount%2Fgigs" style="display:inline-block;margin-top:18px;border:1px solid #181614;color:#181614;font-family:'Courier New',monospace;font-size:11px;font-weight:700;letter-spacing:2px;text-decoration:none;padding:13px 17px;">JOIN THE DIRECTORY &rarr;</a>
      </td>

      <td class="cell" width="33%" valign="top" style="padding-right:22px;">
        <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:3px;color:#9c7c3e;">02 &middot; BRANDS</div>
        <div style="font-family:Anton,Impact,'Arial Narrow',Arial,sans-serif;font-size:26px;line-height:1.05;color:#181614;margin:8px 0 12px;">POST A ROLE</div>
        <div style="font-family:Inter,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.85;color:#5c5650;">
          &#8226;&nbsp; Free to post<br>
          &#8226;&nbsp; Goes only to matched Houston creatives<br>
          &#8226;&nbsp; Reviewed before it goes live
        </div>
        <a href="https://madekulture.com/signup?as=brand&amp;next=%2Faccount%2Fgigs%2Fnew" style="display:inline-block;margin-top:18px;border:1px solid #181614;color:#181614;font-family:'Courier New',monospace;font-size:11px;font-weight:700;letter-spacing:2px;text-decoration:none;padding:13px 17px;">POST A ROLE &rarr;</a>
      </td>

      <td class="cell" width="33%" valign="top">
        <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:3px;color:#9c7c3e;">03 &middot; ANYONE HIRING</div>
        <div style="font-family:Anton,Impact,'Arial Narrow',Arial,sans-serif;font-size:26px;line-height:1.05;color:#181614;margin:8px 0 12px;">HIRE A CREATIVE</div>
        <div style="font-family:Inter,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.85;color:#5c5650;">
          &#8226;&nbsp; Birthday, event, family shoot?<br>
          &#8226;&nbsp; Post your budget, creatives apply<br>
          &#8226;&nbsp; You pick. No profile needed.
        </div>
        <a href="https://madekulture.com/signup?next=%2Faccount%2Fhire" style="display:inline-block;margin-top:18px;border:1px solid #181614;color:#181614;font-family:'Courier New',monospace;font-size:11px;font-weight:700;letter-spacing:2px;text-decoration:none;padding:13px 17px;">HIRE SOMEONE &rarr;</a>
      </td>

    </tr></table>
  </td></tr>

  <!-- closer -->
  <tr><td class="pad" style="padding:56px 60px 46px;">
    <div class="h2" style="font-family:Anton,Impact,'Arial Narrow',Arial,sans-serif;font-size:46px;line-height:0.95;color:#181614;">FIND WORK.<br>POST WORK.<br><span style="color:#9c7c3e;">ALL IN ONE PLACE.</span></div>
    <div style="font-family:Inter,Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.6;color:#8a8279;margin-top:18px;">Every gig is paid and reviewed. Made Kulture never asks anyone to pay to apply.</div>
  </td></tr>

  <!-- footer -->
  <tr><td class="pad" style="padding:22px 60px 30px;border-top:1px solid #e4dccf;">
    <div style="font-family:Inter,Helvetica,Arial,sans-serif;font-size:11.5px;line-height:1.7;color:#8a8279;">
      Made Kulture &middot; 4825 Gulf Freeway, Houston TX 77023<br>
      You're getting this because you've booked with us. <a href="{{UNSUBSCRIBE_URL}}" style="color:#5c5650;">Unsubscribe</a>
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
