import { verifyLoginAssertion } from '@union-networks/server';
import { NextResponse } from 'next/server';

const serviceId = process.env.NEXT_PUBLIC_UNET_SERVICE_ID ?? 'unet-example-unlisted-site';
const assertionSecret = process.env.UNET_WEB_LOGIN_ASSERTION_SECRET ?? 'dev-web-login-assertion-secret';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { assertionJws?: string };
    if (!body.assertionJws) {
      return NextResponse.json({ ok: false, error: 'assertionJws is required' }, { status: 400 });
    }
    const claims = verifyLoginAssertion(body.assertionJws, { serviceId, secret: assertionSecret });
    return NextResponse.json({
      ok: true,
      scopedUserId: claims.scopedUserId,
      serviceId: claims.serviceId,
      sessionId: claims.sessionId,
      expiresAtIso: claims.expiresAtIso,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Invalid U-net login assertion' },
      { status: 401 },
    );
  }
}
