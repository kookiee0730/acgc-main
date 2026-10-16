# Vercel Deployment

## Deployment

Deploy the Vite frontend as a Vercel project with root directory `.`, build command `npm run build`, and output directory `dist`. The root `vercel.json` proxies `/api/*` to the backend deployment at `https://acgc-main-wtzi.vercel.app` and sends other paths to the frontend app.

The frontend API client reads `VITE_API_BASE_URL` (not `VITE_API_URL`). It defaults to the same-origin `/api` proxy, so no Vite API variable is required when the rewrite is deployed. If setting the variable in Vercel, use `VITE_API_BASE_URL=https://acgc-main-wtzi.vercel.app` and redeploy the frontend for the value to take effect.

## Cloudinary Storage

Configure the backend with an active Cloudinary account:

- Product photos are uploaded through the authenticated backend endpoint.
- Reviews, payment proofs, progress media, and contracts use short-lived signed uploads issued by the backend.
- Encrypted backup archives and temporary backup imports use authenticated raw assets.

Media URLs are Cloudinary URLs. Review access rules for payment proofs and signed contracts before storing sensitive customer documents.

## Admin Backup and Restore

In Admin Settings > Backup & Recovery, configure an owner-controlled recovery password before creating or restoring a backup. Use 12-128 characters; the known default value is rejected. The password is stored as a salted verifier and is required to authorize a restore.

Full backups include every non-system MongoDB collection and local files under `backend/uploads`. Cloudinary-hosted media is not copied into the archive; its database references remain in the snapshot and the media stays in Cloudinary. Keep Cloudinary retention and account access available when recovering the application.

`BACKUP_ENCRYPTION_KEY` remains a backend-only deployment secret for encrypted archive storage and existing archives. Admin users do not need to view or handle this key. Preserve it when rotating deployment configuration so existing archives remain readable.

New encrypted ZIP backups contain an `integrity.json` SHA-256 manifest for the compressed database snapshot. The backend verifies it when importing or restoring; older ZIPs without a manifest remain supported and rely on ZIP authentication.

## Backend Environment Variables

Set these in the backend service's Vercel environment settings:

- `MONGO_URI`
- `JWT_SECRET`
- `CLOUDINARY_URL` (copied from Cloudinary's API environment variable field), or `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`
- `BACKUP_ENCRYPTION_KEY` (backend-only key for encrypted archive storage; keep it stable to preserve archive access)
- `CRON_SECRET` (a newly generated long random secret)
- `EMAIL_FROM` using a Brevo-verified sender, for example `ACGC Services <no-reply@example.com>`
- Brevo Nodemailer SMTP: `BREVO_SMTP_LOGIN` and `BREVO_SMTP_KEY`
- Optional Brevo REST fallback: `BREVO_API_KEY`
- Optional SMTP fallback: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and either `SMTP_PASS` or `SMTP_PASSWORD`
- `ADMIN_EMAIL`
- `FRONTEND_URL=https://acgc-services-seven.vercel.app` (the frontend site origin; do not append `/login` or use the backend API domain)
- `SUPPORT_EMAIL` and `SUPPORT_PHONE` if configured
- `NODE_ENV=production`

Do not set `PORT`; Vercel supplies it. The Vercel Cron job calls `/api/auth/system-settings/cron-backup` daily and authenticates using `CRON_SECRET`.

Set `FRONTEND_URL=https://acgc-services-seven.vercel.app` in the backend Vercel project's Production environment. Set the matching Preview origin in Preview environments if preview emails should return to the preview app. Signup emails link to `/verify-email?token=...`; the app validates the existing token and then redirects to `/login`. Production email links fail safely rather than falling back to localhost when this variable is missing. Local development uses `http://localhost:5173` when `FRONTEND_URL` is unset.

## Brevo Transactional Email

The backend mailer tries Brevo SMTP through Nodemailer first whenever `BREVO_SMTP_LOGIN` and `BREVO_SMTP_KEY` are present. If those are missing, it can use the Brevo REST API when `BREVO_API_KEY` is present, then the generic SMTP fallback. This covers password reset codes, email verification, profile email-change codes, contract emails, and order notifications because they all use the shared `sendMail` helper.

Before deploying, complete these Brevo account steps:

- Rotate any API key or SMTP key that was stored locally or shared during setup.
- Verify the sender email or authenticate the sending domain in Brevo.
- If Brevo API security has authorized IPs enabled, either disable that restriction for Vercel or use infrastructure with a stable outbound IP and add that IP in Brevo. Vercel serverless outbound IPs are not a stable single value by default.
- Set `EMAIL_FROM` to the exact verified sender identity.
- Copy the SMTP login and SMTP key from Brevo > SMTP & API > SMTP. The SMTP key is not the same thing as the REST API key.

Recommended backend Vercel variables for email:

```env
EMAIL_FROM=ACGC Services <your_verified_sender@example.com>
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_LOGIN=your_brevo_smtp_login
BREVO_SMTP_KEY=your_brevo_smtp_key
BREVO_SENDER_NAME=ACGC Services
```

Optional Brevo REST fallback:

```env
BREVO_API_KEY=your_rotated_brevo_api_key
```

Optional Gmail SMTP fallback:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=yourgmail@gmail.com
SMTP_PASSWORD=your_gmail_app_password
```

## Before Production

- Migrate existing database file URLs that point to `localhost:5000/uploads/...`; those files are not automatically copied to Cloudinary.
- Test login, refreshes on nested routes, new uploads, email delivery, backup creation/download/restore, and scheduled backups in a Vercel Preview deployment first.
- Restrict CORS to the deployed site if you later serve the API from a different origin.
