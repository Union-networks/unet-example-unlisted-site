import { NextRequest, NextResponse } from 'next/server';

const serviceId = process.env.NEXT_PUBLIC_UNET_SERVICE_ID ?? 'unet-example-unlisted-site';

function normalizeOrigin(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '');
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(withProtocol).origin;
}

export function GET(request: NextRequest) {
  const origin = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_ORIGIN ?? new URL(request.url).origin);
  return NextResponse.json(
    {
      serviceId,
      name: 'U-net Perks Example',
      provider: 'Union Networks Demo',
      description: 'A tiny rewards site that supports browser QR login and unlisted U-net miniapp launch.',
      icon: 'sparkles-outline',
      launchUrl: `${origin}/`,
      permissions: ['identity.scoped'],
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
