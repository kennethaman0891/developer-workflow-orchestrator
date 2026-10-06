'use client';

import { type ReactNode } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProvider } from '@/contexts/AuthContext';
/**
 * Pre-paint theme script — runs synchronously before first paint so the
 * production static export (`out/index.html`) doesn't flash the wrong theme
 * before ThemeContext hydrates from localStorage. Sets `data-theme`, and the
 * static per-theme CSS below resolves every --dwo-* var immediately.
 * Must stay dependency-free and exception-safe (private mode / file://).
 */
const THEME_PREPAINT_SCRIPT = `(function(){try{var k=localStorage.getItem('dwo-theme');var ok={seti:1,dark:1,midnight:1,ocean:1,carbon:1};if(k&&ok[k]){document.documentElement.setAttribute('data-theme',k);}}catch(e){}})();`;

/**
 * WebKit style-attribute repair (macOS 26 WebKit regression, tauri:// pages).
 *
 * On macOS 26's WebKit, inline `style` attributes on pages served from a
 * custom scheme (Tauri's `tauri://` asset protocol in RELEASE builds) are
 * silently dropped: the HTML parser and `Element.setAttribute('style')`
 * leave the element's CSSOM declaration block EMPTY, even for trivial
 * values like `display:flex`. http(s) origins (dev server) parse normally,
 * which is why `tauri dev` works and the installed app renders a collapsed,
 * unstyled shell.
 *
 * The app's layout is built almost entirely from inline `style` attributes,
 * so a dropped parse collapses the whole UI (top bar 21px, main row to
 * content height, terminal panes to 0x0).
 *
 * This script SELF-DETECTS the broken behavior with a probe element:
 *  - Normal engines (dev server, older macOS, browsers): probe parses fine,
 *    script exits immediately — zero behavior change.
 *  - Broken engine: re-applies every existing [style] attribute through the
 *    CSSOM (el.style.cssText = attr), which WebKit still parses correctly,
 *    and patches Element.prototype.setAttribute/removeAttribute for the
 *    'style' name so JS-driven style writes (React hydration, xterm, etc.)
 *    are applied via CSSOM as well.
 *
 * Runs in <head> before the app's async chunks, so the first paint is
 * already repaired. Must stay dependency-free and exception-safe.
 */
const STYLE_ATTR_REPAIR_SCRIPT = `(function(){try{
// WebKit regression (macOS 26), tauri:// (custom-scheme) pages:
//  1) inline style attributes parse to EMPTY CSSOM blocks
//     (HTML parser + setAttribute('style') + innerHTML all affected);
//  2) JS-inserted <style> tags and data:/blob: <link> stylesheets never
//     build a CSSOM sheet (el.sheet stays null), so injected CSS
//     (xterm theme styles, Monaco via style-loader, ...) is dropped;
//  3) the CSSOM write APIs still work: el.style.cssText=, new
//     CSSStyleSheet().replaceSync() + document.adoptedStyleSheets.
// This script SELF-DETECTS with a probe element: healthy engines (dev
// server, older macOS, browsers) parse style attrs fine and exit early —
// zero behavior change. Broken engines get:
//  - a re-apply of every [style] attr through el.style.cssText;
//  - patched Element.setAttribute/removeAttribute for the 'style' name;
//  - a MutationObserver that keeps repairing new/changed elements and
//    migrates every <style> tag that failed to build a sheet into an
//    adopted CSSStyleSheet (same text, via replaceSync).
var probe=document.createElement('div');
probe.setAttribute('style','display:flex');
if(probe.style.display!==''){return} // healthy engine — do nothing
function repairEl(el){
if(el.style&&!el.style.length){
var attr=el.getAttribute('style');
if(attr){el.style.cssText=attr;}
}
}
function repairAll(){
var els=document.querySelectorAll('[style]');
for(var i=0;i<els.length;i++){repairEl(els[i]);}
}
var setAttr=Element.prototype.setAttribute;
Element.prototype.setAttribute=function(name,value){
setAttr.call(this,name,value);
if(name==='style'&&this.style){this.style.cssText=String(value);}
};
var rmAttr=Element.prototype.removeAttribute;
Element.prototype.removeAttribute=function(name){
rmAttr.call(this,name);
if(name==='style'&&this.style){this.style.cssText='';}
};
if(document.readyState==='loading'){
document.addEventListener('DOMContentLoaded',repairAll);
}else{repairAll();}
window.addEventListener('load',repairAll);
// --- CSSOM sheet migration for broken <style> elements -------------------
var migrated=new WeakMap();
function syncAdopted(extra){
if(extra){document.adoptedStyleSheets=document.adoptedStyleSheets.concat(extra);}
}
function migrate(el){
if(!el||el.nodeType!==1||el.tagName!=='STYLE'){return}
var prev=migrated.get(el);
var text=el.textContent||'';
if(!text){return}
try{
var s=new CSSStyleSheet();
s.replaceSync(text);
migrated.set(el,s);
if(prev){syncAdopted();}else{syncAdopted([s]);}
}catch(e){}
}
function migrateAll(){
var ss=document.querySelectorAll('style');
for(var i=0;i<ss.length;i++){migrate(ss[i]);}
}
if(document.readyState==='loading'){
document.addEventListener('DOMContentLoaded',migrateAll);
}else{migrateAll();}
window.addEventListener('load',migrateAll);
// WebKit still fires harmless 'error' events on <style> elements whose
// sheets failed to build. We compensate for those via adopted sheets, so
// swallow them. Installed on WINDOW (capture) — this script runs at
// parse time, i.e. before the app's own listeners register — so
// stopImmediatePropagation keeps both the app's ErrorReporter and any
// later-registered listeners from seeing the expected engine errors.
window.addEventListener('error', function(e){
var t = e.target;
if (t && t.nodeType === 1 && t.tagName === 'STYLE') {
// The sheet failed to build; migrate its content into an adopted sheet
// right now (the MutationObserver's microtask would do it a beat later,
// but the error event fires first).
migrate(t);
e.stopImmediatePropagation();
}
}, true);
// Watch the tree: repair new/changed style attributes (HTML-parser path)
// and migrate/refresh <style> elements whose sheets never built.
function repairNode(node){
if(node.nodeType!==1){return}
repairEl(node);
if(node.querySelectorAll){
var subs=node.querySelectorAll('[style]');
for(var j=0;j<subs.length;j++){repairEl(subs[j]);}
var stys=node.querySelectorAll('style');
for(var k=0;k<stys.length;k++){migrate(stys[k]);}
}
}
var mo=new MutationObserver(function(muts){
for(var m=0;m<muts.length;m++){
var mut=muts[m];
if(mut.type==='childList'){
for(var c=0;c<mut.addedNodes.length;c++){repairNode(mut.addedNodes[c]);}
}else if(mut.type==='attributes'){
repairNode(mut.target);
}else if(mut.type==='characterData'){
var host=mut.target.parentNode;
if(host&&host.tagName==='STYLE'){migrate(host);}
}
}
});
mo.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['style']});
mo.observe(document.head,{childList:true,subtree:true,characterData:true});
}catch(e){}})();`;

/**
 * Static first-paint theme vars — mirrors src/lib/themes.ts so var(--dwo-*)
 * consumers resolve correctly BEFORE ThemeContext's post-mount effect runs.
 * :root carries the seti default (the app's initial theme); each saved theme
 * overrides via the data-theme attribute the pre-paint script sets.
 * ThemeContext keeps ownership at runtime; this block is paint-time only.
 */
const THEME_STATIC_CSS = `
*, *::before, *::after {
  box-sizing: border-box;
}
:root{
--dwo-color-bg:#1e1e1e;--dwo-color-bg-secondary:#252526;--dwo-color-bg-tertiary:#2d2d2d;
--dwo-color-text:#f8f8f2;--dwo-color-text-muted:#868a8f;--dwo-color-accent:#ff9600;
--dwo-color-accent-hover:#ffb44d;--dwo-color-border:#3e4452;--dwo-color-success:#5ec4b0;
--dwo-color-warning:#d19a66;--dwo-color-error:#f44747;--dwo-color-surface:#2d2d2d;
--dwo-font-mono:"JetBrains Mono","Fira Code","Consolas",monospace;
--dwo-font-sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
background:#1e1e1e;color:#f8f8f2;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
}
html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  margin: 0;
  padding: 0;
  font-family: var(--dwo-font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  background: var(--dwo-color-bg, #1e1e1e);
  color: var(--dwo-color-text, #f8f8f2);
  -webkit-font-smoothing: antialiased;
}
/* The app shell (the only element carrying data-dwo-root) must propagate 100%
   height and flex layout so the sidebar+main split works.
   IMPORTANT: this rule is scoped to [data-dwo-root] on purpose. A blanket
   body > div:not([hidden]) would also hit foreign divs injected into <body>
   (browser extensions, Next.js dev-tools wrappers), turning them into
   full-height in-flow flex siblings that starve the app shell of space and
   collapse the whole UI to 0px. */
body > [data-dwo-root],
#__next,
[data-nextjs-scroll-focus-boundary] {
  width: 100%;
  height: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}
button {
  background: transparent;
  border: none;
  margin: 0;
  padding: 0;
  color: inherit;
  font-family: inherit;
  font-size: inherit;
  cursor: pointer;
  box-sizing: border-box;
  -webkit-appearance: none;
  appearance: none;
}
input, select, textarea {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  box-sizing: border-box;
}
[data-theme="dark"]{
--dwo-color-bg:#0a0a0a;--dwo-color-bg-secondary:#111111;--dwo-color-bg-tertiary:#1a1a1a;
--dwo-color-text:#e8e8e8;--dwo-color-text-muted:#888888;--dwo-color-accent:#4a9eff;
--dwo-color-accent-hover:#6ab0ff;--dwo-color-border:#2a2a2a;--dwo-color-success:#4ade80;
--dwo-color-warning:#fbbf24;--dwo-color-error:#f87171;--dwo-color-surface:#1a1a1a;
background:#0a0a0a;color:#e8e8e8;
}
[data-theme="midnight"]{
--dwo-color-bg:#0d1b2a;--dwo-color-bg-secondary:#142438;--dwo-color-bg-tertiary:#1b2d42;
--dwo-color-text:#e0e6ed;--dwo-color-text-muted:#7aa2c0;--dwo-color-accent:#5ba4e6;
--dwo-color-accent-hover:#7ec0f5;--dwo-color-border:#1e3a54;--dwo-color-success:#4ade80;
--dwo-color-warning:#fbbf24;--dwo-color-error:#f87171;--dwo-color-surface:#1b2d42;
background:#0d1b2a;color:#e0e6ed;
}
[data-theme="ocean"]{
--dwo-color-bg:#1a1b26;--dwo-color-bg-secondary:#202330;--dwo-color-bg-tertiary:#262a38;
--dwo-color-text:#c0caf5;--dwo-color-text-muted:#565f89;--dwo-color-accent:#7aa2f7;
--dwo-color-accent-hover:#8db0f8;--dwo-color-border:#2e3c5e;--dwo-color-success:#9ece6a;
--dwo-color-warning:#e0af68;--dwo-color-error:#f7768e;--dwo-color-surface:#262a38;
background:#1a1b26;color:#c0caf5;
}
[data-theme="carbon"]{
--dwo-color-bg:#161616;--dwo-color-bg-secondary:#262626;--dwo-color-bg-tertiary:#393939;
--dwo-color-text:#f4f4f4;--dwo-color-text-muted:#a8a8a8;--dwo-color-accent:#4589ff;
--dwo-color-accent-hover:#78a9ff;--dwo-color-border:#393939;--dwo-color-success:#42be65;
--dwo-color-warning:#f1c21b;--dwo-color-error:#fa4d56;--dwo-color-surface:#393939;
background:#161616;color:#f4f4f4;
}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>DWO — Developer Workflow Orchestrator</title>
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <script dangerouslySetInnerHTML={{ __html: THEME_PREPAINT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: STYLE_ATTR_REPAIR_SCRIPT }} />
        <style>{`
          ${THEME_STATIC_CSS}
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
          @keyframes pop { 0% { transform: scale(0.8); opacity: 0; } 60% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
          @keyframes fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
          .dwo-icon-btn { transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s, color 0.15s; }
          .dwo-icon-btn:hover { background: var(--dwo-color-bg-tertiary, #1a1a1a) !important; opacity: 1 !important; }
          .dwo-close-btn:hover { color: var(--dwo-color-text, #e8e8e8) !important; }
          .dwo-divider-v:hover, .dwo-divider-h:hover { background: var(--dwo-color-accent, #4a9eff) !important; }
          /* Thin scrollbars for webkit */
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: var(--dwo-color-border, #2a2a2a); border-radius: 3px; }
          ::-webkit-scrollbar-thumb:hover { background: var(--dwo-color-text-muted, #888); }
          /* Global focus ring using theme accent */
          :focus-visible { outline: 2px solid var(--dwo-color-accent, #4a9eff); outline-offset: 2px; border-radius: 2px; }
        `}</style>
      </head>
      <body>
        <AuthProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
