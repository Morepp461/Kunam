from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "src" / "App.tsx").read_text(encoding="utf-8")
WORKSPACE_CSS = (ROOT / "src" / "workspace.css").read_text(encoding="utf-8")
STYLES_CSS = (ROOT / "src" / "styles.css").read_text(encoding="utf-8")
MOTION = (ROOT / "cinematic-motion.js").read_text(encoding="utf-8")

# Privacy consent must not be a browser-restorable native checkbox.
consent_role_index = APP.index('role="checkbox"')
consent_start = APP.rfind("<button", 0, consent_role_index)
consent_end = APP.index("</button>", consent_role_index)
consent_markup = APP[consent_start:consent_end]
assert 'role="checkbox"' in consent_markup
assert "aria-checked={privacyAccepted}" in consent_markup
assert "onClick={()=>{setPrivacyAccepted(value=>!value)" in consent_markup
assert "<input" not in consent_markup
assert "if(!privacyAccepted)next.privacy=" in APP
assert ".privacy-consent-box" in WORKSPACE_CSS
assert ".privacy-consent.is-checked .privacy-consent-box" in WORKSPACE_CSS

# Supabase token refreshes for the same user must not reset the app's profile gate.
application = APP[APP.index("function Application()"):APP.index("function Home()")]
assert "const userId=session?.user.id??null;" in application
assert "},[userId,toast]);" in application
auth_callback = application[application.index("supabase.auth.onAuthStateChange"):application.index("useEffect(()=>{if(authReady)")]
assert "identityChanged=sessionUserIdRef.current!==nextUserId" in auth_callback
assert "if(identityChanged||event===\"USER_UPDATED\")setProfileReady(false)" in auth_callback
assert "setSession(s);setProfileReady(false);setAuthReady(true)" not in auth_callback

# Background/restore lifecycle should pause effects without reloading or dropping auth.
assert 'document.addEventListener("visibilitychange",markBackground)' in application
assert 'window.addEventListener("pageshow",onPageShow)' in application
assert 'window.addEventListener("pagehide",onPageHide)' in application
assert "location.reload" not in application

# Keep mobile's visual identity but disable layered animation/blur effects to reduce GPU pressure.
mobile_rules = STYLES_CSS[STYLES_CSS.index("/* Mobile background mode:"):]
assert ".scene-image{animation:none;transform:none}" in mobile_rules
assert ".scene-light,.scene-reflection,.scene-depth,.scene-flare,.dust-canvas{display:none!important}" in mobile_rules
assert "backdrop-filter:none" in mobile_rules

# Resume the cinematic canvas correctly after a BFCache/page restore.
assert 'window.addEventListener("pagehide", onPageHide)' in MOTION
assert 'window.addEventListener("pageshow", onPageShow)' in MOTION
assert "observer.observe(host);" in MOTION
assert "if (!document.hidden) start();" in MOTION

print("Mobile lifecycle and Paddock Access consent regression checks passed.")
