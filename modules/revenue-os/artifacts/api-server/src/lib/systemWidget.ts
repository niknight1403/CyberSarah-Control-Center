/**
 * System Status Badge Widget - HTML/JS fuer Landing Page
 * Zeigt live System-Gesundheit, Agenten-Status, OpenAI/Stripe Verfuegbarkeit
 */
export function systemStatusBadgeHtml(): string {
  return [
    '<div id="sys-badge" style="position:fixed;top:10px;right:10px;z-index:99997;font-family:monospace;">',
    '<div onclick="toggleSysInfo()" style="background:#111118;border:1px solid #2a2a3e;border-radius:20px;padding:4px 12px;cursor:pointer;display:flex;align-items:center;gap:6px;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,0.3);">',
    '<span id="sys-dot" style="width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block;"></span>',
    '<span style="color:#9ca3af;">Live</span></div>',
    '<div id="sys-info" style="display:none;margin-top:4px;background:#111118;border:1px solid #2a2a3e;border-radius:12px;padding:12px;min-width:200px;font-size:12px;box-shadow:0 4px 20px rgba(0,0,0,0.4);">',
    '<div style="color:#f0f0f0;font-weight:600;margin-bottom:8px;">System Status</div>',
    '<div id="sys-content" style="color:#6b7280;">Lade...</div></div></div>',
    '<script>',
    'function toggleSysInfo(){',
    'var i=document.getElementById("sys-info");',
    'if(i.style.display==="block"){i.style.display="none";return;}',
    'i.style.display="block";',
    'fetch("/api/system-status").then(function(r){return r.json()}).then(function(d){',
    'var dot=document.getElementById("sys-dot");',
    'dot.style.background=d.systemGesund?"#22c55e":"#ef4444";',
    'var h="<div style=\\"display:flex;justify-content:space-between;margin-bottom:4px;\\"><span>Agenten</span><span style=\\"color:#f0f0f0;\\">"+d.agentenGesamt+"</span></div>"',
    '+"<div style=\\"display:flex;justify-content:space-between;margin-bottom:4px;\\"><span>Erfolgsrate</span><span style=\\"color:#f0f0f0;\\">"+d.erfolgsrate24h+"%</span></div>"',
    '+"<div style=\\"display:flex;justify-content:space-between;margin-bottom:4px;\\"><span>OpenAI</span><span style=\\"color:"+(d.openaiVerfuegbar?"#22c55e":"#ef4444")+";\\">"+(d.openaiVerfuegbar?"OK":"OFF")+"</span></div>"',
    '+"<div style=\\"display:flex;justify-content:space-between;margin-bottom:4px;\\"><span>Stripe</span><span style=\\"color:"+(d.stripeLiveKey?"#22c55e":"#ef4444")+";\\">"+(d.stripeLiveKey?"LIVE":"OFF")+"</span></div>"',
    '+"<div style=\\"display:flex;justify-content:space-between;\\"><span>Warnungen</span><span style=\\"color:#f0f0f0;\\">"+(d.warnungen?d.warnungen.length:0)+"</span></div>"',
    '+(d.warnungen&&d.warnungen.length?"<div style=\\"margin-top:6px;padding-top:6px;border-top:1px solid #2a2a3e;color:#ef4444;font-size:11px;\\">"+d.warnungen.join("<br>")+"</div>":"")',
    'document.getElementById("sys-content").innerHTML=h;',
    '}).catch(function(){document.getElementById("sys-content").textContent="Offline";});}',
    'setInterval(function(){',
    'fetch("/api/healthz").then(function(r){return r.json()}).then(function(d){',
    'var dot=document.getElementById("sys-dot");',
    'dot.style.background=d.status==="ok"?"#22c55e":"#ef4444";',
    '}).catch(function(){var dot=document.getElementById("sys-dot");dot.style.background="#ef4444";});',
    '},30000);',
    '<\\/script>'
  ].join("\n");
}
