# U-net Example Unlisted Site

A small Next.js example that can run in two modes:

- **Normal browser app**: uses QR-based Sign in with U-net.
- **Unlisted U-net miniapp**: serves `/.well-known/unet-miniapp.json`, opens from the U-net Apps tab with **Open by URL**, and logs in through `host.createServiceSession` without showing a QR.

It also includes a standalone over-18 verification QR using `@union-networks/verification`.

## Packages Used

- `@union-networks/web-login`
- `@union-networks/verification`
- `@union-networks/server`

## Local Development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Browser QR login will only work if the `serviceId + origin` pair is registered in U-net trust-plane. The unlisted miniapp launcher requires HTTPS, so test that path on Vercel or another HTTPS host.

## Vercel Setup

Recommended project name:

```text
unet-example-unlisted-site
```

That gives the default origin:

```text
https://unet-example-unlisted-site.vercel.app
```

Set these Vercel environment variables:

```bash
NEXT_PUBLIC_UNET_SERVICE_ID=unet-example-unlisted-site
NEXT_PUBLIC_UNET_ISSUER_BASE_URL=https://issuer.egress.live
NEXT_PUBLIC_UNET_VERIFIER_BASE_URL=https://verifier.egress.live
NEXT_PUBLIC_SITE_ORIGIN=https://unet-example-unlisted-site.vercel.app
UNET_WEB_LOGIN_ASSERTION_SECRET=dev-web-login-assertion-secret
```

`UNET_WEB_LOGIN_ASSERTION_SECRET` is the demo trust-plane assertion secret. Do not use that value for production.

## U-net Registration Requirement

For U-net login and Open by URL to work, trust-plane must have an active web-login service record for:

```text
serviceId: unet-example-unlisted-site
origin: https://unet-example-unlisted-site.vercel.app
```

The demo trust-plane seed includes this default Vercel origin. If you deploy to a different domain, register that exact origin in trust-plane and update `NEXT_PUBLIC_SITE_ORIGIN`.

## Miniapp Manifest

The app serves this dynamically:

```text
/.well-known/unet-miniapp.json
```

Example response:

```json
{
  "serviceId": "unet-example-unlisted-site",
  "name": "U-net Perks Example",
  "provider": "Union Networks Demo",
  "description": "A tiny rewards site that supports browser QR login and unlisted U-net miniapp launch.",
  "icon": "sparkles-outline",
  "launchUrl": "https://unet-example-unlisted-site.vercel.app/",
  "permissions": ["identity.scoped"]
}
```

Unlisted miniapps are intentionally limited to `identity.scoped` in this U-net version. Notifications and official-account messaging are reserved for official catalog entries.

## How To Test

1. Deploy this repo to Vercel.
2. Open the site in a normal browser and click **Sign in with U-net QR**.
3. Scan the QR with U-net mobile and approve.
4. In U-net mobile, open Apps -> **Open by URL**.
5. Enter the Vercel URL.
6. Accept the unlisted miniapp consent screen.
7. Tap **Connect inside U-net** and confirm that the same service-scoped ID is returned.
