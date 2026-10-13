import { useEffect, useState } from "react";
import { checkSession, endSession, startSession } from "../lib/api";

export default function AccessGate({ children }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [opened, setOpened] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    checkSession().then(() => {
      if (active) { setAuthenticated(true); setOpened(true); }
    }).catch((e) => {
      if (active && e.status !== 401) setError(e.message);
    }).finally(() => { if (active) setChecking(false); });
    function expired() {
      setAuthenticated(false);
      setError("Your session expired. Enter the team code to continue. Your draft is still here.");
    }
    window.addEventListener("morscout-session-expired", expired);
    return () => { active = false; window.removeEventListener("morscout-session-expired", expired); };
  }, []);

  async function signIn(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await startSession(accessCode);
      setAccessCode("");
      setAuthenticated(true);
      setOpened(true);
      window.dispatchEvent(new Event("morscout-session-restored"));
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true);
    try {
      await endSession();
      setAuthenticated(false);
      setOpened(false);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      {opened && (
        <div inert={authenticated ? undefined : ""} aria-hidden={!authenticated}>
          <div className="access-tools">
            <button className="secondary-button" type="button" disabled={busy} onClick={signOut}>Sign out</button>
            {authenticated && error && <p role="alert">{error}</p>}
          </div>
          {children}
        </div>
      )}
      {!authenticated && (
        <div className="access-overlay">
          <form className="form access-form" onSubmit={signIn} aria-label="Team sign in">
            <h1>MorScout 2026</h1>
            <p>Enter your team access code to scout and view rankings.</p>
            {checking ? <p role="status">Checking your session...</p> : (
              <>
                <label>Team access code
                  <input type="password" autoComplete="current-password" autoFocus required maxLength={256}
                    value={accessCode} onChange={(e) => setAccessCode(e.target.value)} />
                </label>
                <button className="primary-button" type="submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
              </>
            )}
            {error && <p role="alert">{error}</p>}
          </form>
        </div>
      )}
    </>
  );
}
