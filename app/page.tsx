'use client';

import {
  createLoginSession,
  isApprovedLoginResult,
  pollLoginSession,
  renderLoginQrPayload,
} from '@union-networks/web-login';
import {
  createVerificationSession,
  listVerificationChecks,
  pollVerificationResult,
} from '@union-networks/verification';
import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(message: string): void };
    __unetReceiveHostMessage?: (message: BridgeResponse<unknown>) => void;
  }
}

type BridgeResponse<T> = { source?: string; id?: string; ok?: boolean; result?: T; error?: string };
type SessionView = { scopedUserId: string; serviceId: string; expiresAtIso?: string; source: 'miniapp' | 'browser' };
type VerificationView = 'idle' | 'creating' | 'waiting' | 'passed' | 'warning' | 'failed' | 'error';

const serviceId = process.env.NEXT_PUBLIC_UNET_SERVICE_ID ?? 'unet-example-unlisted-site';
const issuerBaseUrl = process.env.NEXT_PUBLIC_UNET_ISSUER_BASE_URL ?? 'https://issuer.egress.live';
const verifierBaseUrl = process.env.NEXT_PUBLIC_UNET_VERIFIER_BASE_URL ?? 'https://verifier.egress.live';

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `msg_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`;
}

function callUnetHost<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const bridge = window.ReactNativeWebView;
  if (!bridge) return Promise.reject(new Error('This page is not running inside U-net.'));
  const id = makeId();
  return new Promise<T>((resolve, reject) => {
    const previous = window.__unetReceiveHostMessage;
    const cleanup = () => {
      window.removeEventListener('message', onMessage as EventListener);
      window.__unetReceiveHostMessage = previous;
    };
    const handle = (message: BridgeResponse<T>) => {
      if (message?.id !== id) return;
      cleanup();
      if (message.ok) resolve(message.result as T);
      else reject(new Error(message.error ?? 'U-net bridge request failed'));
    };
    const onMessage = (event: MessageEvent) => handle(event.data as BridgeResponse<T>);
    window.__unetReceiveHostMessage = (message) => {
      handle(message as BridgeResponse<T>);
      previous?.(message);
    };
    window.addEventListener('message', onMessage as EventListener);
    bridge.postMessage(JSON.stringify({ id, action, payload }));
    setTimeout(() => {
      cleanup();
      reject(new Error('U-net bridge timed out'));
    }, 30_000);
  });
}

async function verifyAssertion(assertionJws: string, source: SessionView['source']): Promise<SessionView> {
  const response = await fetch('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ assertionJws }),
  });
  const payload = (await response.json()) as { ok?: boolean; scopedUserId?: string; serviceId?: string; expiresAtIso?: string; error?: string };
  if (!response.ok || !payload.ok || !payload.scopedUserId || !payload.serviceId) {
    throw new Error(payload.error ?? 'Could not verify U-net login assertion');
  }
  return { scopedUserId: payload.scopedUserId, serviceId: payload.serviceId, expiresAtIso: payload.expiresAtIso, source };
}

export default function Home() {
  const [isMiniapp, setIsMiniapp] = useState(false);
  const [session, setSession] = useState<SessionView | null>(null);
  const [loginQr, setLoginQr] = useState('');
  const [loginStatus, setLoginStatus] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [verificationQr, setVerificationQr] = useState('');
  const [verificationState, setVerificationState] = useState<VerificationView>('idle');
  const [verificationMessage, setVerificationMessage] = useState('');
  const miniappAutoLoginStartedRef = useRef(false);

  useEffect(() => {
    setIsMiniapp(Boolean(window.ReactNativeWebView));
  }, []);

  const shortScopedId = useMemo(() => {
    if (!session?.scopedUserId) return '';
    return `${session.scopedUserId.slice(0, 22)}...${session.scopedUserId.slice(-6)}`;
  }, [session]);

  const loginWithMiniappBridge = async () => {
    setLoginBusy(true);
    setLoginStatus('Asking U-net for a scoped service session...');
    setLoginQr('');
    try {
      const bridgeSession = await callUnetHost<{ assertionJws: string; scopedUserId: string }>('host.createServiceSession');
      const verified = await verifyAssertion(bridgeSession.assertionJws, 'miniapp');
      setSession(verified);
      setLoginStatus('Connected through the U-net miniapp bridge.');
    } catch (error) {
      setLoginStatus(error instanceof Error ? error.message : 'Miniapp login failed.');
    } finally {
      setLoginBusy(false);
    }
  };

  useEffect(() => {
    if (!isMiniapp || session || loginBusy || miniappAutoLoginStartedRef.current) return;
    miniappAutoLoginStartedRef.current = true;
    void loginWithMiniappBridge();
  }, [isMiniapp, loginBusy, session]);

  const loginWithQr = async () => {
    setLoginBusy(true);
    setLoginStatus('Creating one-time U-net QR...');
    setLoginQr('');
    try {
      const created = await createLoginSession(
        { serviceId, origin: window.location.origin, expiresInSeconds: 120 },
        { issuerBaseUrl },
      );
      setLoginQr(created.qrDataUrl ?? await QRCode.toDataURL(renderLoginQrPayload(created), { margin: 2, width: 280 }));
      setLoginStatus('Scan this QR with U-net, then approve the login.');
      const approved = await pollLoginSession(created.sessionId, { issuerBaseUrl, intervalMs: 1500, timeoutMs: 120_000 });
      if (!isApprovedLoginResult(approved) || !approved.assertionJws) {
        setLoginStatus(`Login ended as ${approved.status}.`);
        return;
      }
      const verified = await verifyAssertion(approved.assertionJws, 'browser');
      setSession(verified);
      setLoginStatus('Connected through browser QR login.');
    } catch (error) {
      setLoginStatus(error instanceof Error ? error.message : 'U-net login failed.');
    } finally {
      setLoginBusy(false);
    }
  };

  const requestAgeCheck = async () => {
    setVerificationState('creating');
    setVerificationMessage(isMiniapp ? 'Asking U-net to review the over-18 proof request...' : 'Finding the active over-18 check...');
    setVerificationQr('');
    try {
      if (isMiniapp) {
        const proof = await callUnetHost<{
          aggregateOutcome?: 'passed' | 'warning' | 'failed';
          status?: string;
          result?: { aggregateOutcome?: 'passed' | 'warning' | 'failed'; status?: string };
        }>('host.requestVerification', { requestedChecks: ['age_over_18'] });
        const outcome = proof.aggregateOutcome ?? proof.result?.aggregateOutcome ?? (proof.status === 'verified' || proof.result?.status === 'verified' ? 'passed' : 'failed');
        setVerificationState(outcome);
        setVerificationMessage(outcome === 'passed' ? 'Age check passed. Premium perk unlocked.' : `Age check finished as ${outcome}.`);
        return;
      }
      const catalog = await listVerificationChecks({ query: 'age', limit: 20 }, { verifierBaseUrl });
      const ageCheck = catalog.checks.find((check) => check.requestType === 'age_over_18');
      if (!ageCheck) throw new Error('The over-18 check is not available from U-net right now.');
      const created = await createVerificationSession(
        {
          verifierId: serviceId,
          verifierDisplayName: 'U-net Perks Example',
          requestedChecks: [ageCheck],
          ttlSeconds: 120,
        },
        { verifierBaseUrl },
      );
      setVerificationQr(await QRCode.toDataURL(created.qrPayload, { margin: 2, width: 280 }));
      setVerificationState('waiting');
      setVerificationMessage('Scan this QR with U-net to prove over-18 without sharing your birth date.');
      const result = await pollVerificationResult(created.sessionId, { verifierBaseUrl, intervalMs: 1500, timeoutMs: 120_000 });
      const outcome = result.aggregateOutcome ?? (result.status === 'verified' ? 'passed' : 'failed');
      setVerificationState(outcome);
      setVerificationMessage(outcome === 'passed' ? 'Age check passed. Premium perk unlocked.' : `Age check finished as ${outcome}.`);
    } catch (error) {
      setVerificationState('error');
      setVerificationMessage(error instanceof Error ? error.message : 'Could not run the age check.');
    }
  };

  return (
    <main className="pageShell">
      <section className="hero">
        <div className="eyebrow">Unlisted miniapp example</div>
        <h1>U-net Perks</h1>
        <p>
          A tiny Next.js site that works as a normal web app with QR login, and as an unlisted U-net miniapp with bridge login.
        </p>
        <div className="heroActions">
          {isMiniapp ? (
            <button type="button" onClick={loginWithMiniappBridge} disabled={loginBusy}>Connect inside U-net</button>
          ) : (
            <button type="button" onClick={loginWithQr} disabled={loginBusy}>Sign in with U-net QR</button>
          )}
          <a href="/.well-known/unet-miniapp.json">View manifest</a>
        </div>
      </section>

      <section className="grid">
        <article className="panel">
          <div className="panelHeader">
            <span>Scoped account</span>
            <strong>{session ? 'Connected' : 'Not connected'}</strong>
          </div>
          {session ? (
            <div className="accountBox">
              <div>
                <label>Scoped ID</label>
                <code>{shortScopedId}</code>
              </div>
              <div>
                <label>Source</label>
                <p>{session.source === 'miniapp' ? 'U-net miniapp bridge' : 'Browser QR login'}</p>
              </div>
              <p className="muted">This site only receives its own service-scoped ID and a verified login assertion.</p>
            </div>
          ) : (
            <div className="qrBox">
              {loginQr ? <img src={loginQr} alt="U-net login QR" /> : <div className="qrPlaceholder">QR</div>}
              <p>{loginStatus || 'Connect to create a scoped account for this demo service.'}</p>
            </div>
          )}
        </article>

        <article className="panel perkPanel">
          <div className="panelHeader">
            <span>Optional attestation check</span>
            <strong>{verificationState}</strong>
          </div>
          <h2>Premium tasting perk</h2>
          <p className="muted">Request an over-18 proof without learning the user’s birth date or public U-net ID.</p>
          <button type="button" onClick={requestAgeCheck} disabled={!session || verificationState === 'creating' || verificationState === 'waiting'}>
            Request over-18 proof
          </button>
          {verificationQr ? <img className="verifyQr" src={verificationQr} alt="U-net age verification QR" /> : null}
          <p className={`status ${verificationState}`}>{verificationMessage || (session ? 'Ready to request a proof.' : 'Sign in first, then request the proof.')}</p>
        </article>
      </section>

      <section className="developerNotes">
        <h2>Developer notes</h2>
        <ul>
          <li>Browser mode uses <code>@union-networks/web-login</code>.</li>
          <li>Proof mode uses <code>@union-networks/verification</code>.</li>
          <li>Server-side assertion checks use <code>@union-networks/server</code>.</li>
          <li>Miniapp mode calls <code>host.createServiceSession</code> through the U-net bridge.</li>
        </ul>
      </section>
    </main>
  );
}
