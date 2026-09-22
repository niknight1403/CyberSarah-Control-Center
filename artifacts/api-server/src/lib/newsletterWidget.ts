/**
 * Newsletter Signup Widget — HTML für Landing Page
 * Gleitet am unteren Bildschirmrand ein.
 */
export function newsletterWidgetHtml(): string {
  return `
<!-- Newsletter Signup Widget -->
<div id="newsletter-bar" style="position:fixed;bottom:0;left:0;right:0;z-index:99998;background:linear-gradient(135deg,#1a0a2e,#0d0d1a);border-top:1px solid #2a1a4e;padding:12px 20px;display:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;transform:translateY(100%);transition:transform 0.5s ease;">
  <div style="max-width:1200px;margin:0 auto;display:flex;align-items:center;gap:16px;flex-wrap:wrap;justify-content:center;">
    <div style="flex:1;min-width:200px;">
      <div style="color:#f0f0f0;font-weight:600;font-size:14px;">🚀 KI-Newsletter</div>
      <div style="color:#6b7280;font-size:12px;">Exklusive KI-Tipps + Angebote. Jede Woche.</div>
    </div>
    <form id="newsletter-form" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;" onsubmit="event.preventDefault();signupNewsletter()">
      <input id="nl-email" type="email" placeholder="Deine E-Mail-Adresse" required style="background:#1a1a2e;border:1px solid #2a2a3e;border-radius:8px;padding:10px 14px;color:#e0e0e0;font-size:14px;outline:none;min-width:240px;">
      <button type="submit" style="background:linear-gradient(90deg,#a855f7,#06b6d4);color:#fff;border:none;border-radius:8px;padding:10px 24px;cursor:pointer;font-weight:600;font-size:14px;white-space:nowrap;">📩 Kostenlos anmelden</button>
      <span onclick="dismissNewsletter()" style="cursor:pointer;color:#6b7280;font-size:18px;padding:4px;">✕</span>
    </form>
    <div id="nl-success" style="display:none;color:#22c55e;font-size:14px;font-weight:500;">✅ Anmeldung erfolgreich! Prüfe dein Postfach.</div>
  </div>
</div>
<script>
// Newsletter Bar nach 5 Sekunden einblenden
setTimeout(function(){var b=document.getElementById('newsletter-bar');if(b){b.style.display='block';setTimeout(function(){b.style.transform='translateY(0)';},100);}},5000);

function dismissNewsletter(){var b=document.getElementById('newsletter-bar');if(b){b.style.transform='translateY(100%)';setTimeout(function(){b.style.display='none';},500);}}

function signupNewsletter(){
  var email=document.getElementById('nl-email').value.trim();
  if(!email) return;
  var btn=document.querySelector('#newsletter-form button');if(btn){btn.disabled=true;btn.textContent='⏳';}
  fetch('/api/newsletter/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,quelle:'newsletter_bar'})})
  .then(function(r){return r.json()})
  .then(function(d){
    document.getElementById('newsletter-form').style.display='none';
    document.getElementById('nl-success').style.display='block';
    if(d.success){document.getElementById('nl-success').textContent=d.message||'✅ Erfolgreich angemeldet!';}
    setTimeout(function(){dismissNewsletter();},3000);
  })
  .catch(function(){
    if(btn){btn.disabled=false;btn.textContent='📩 Kostenlos anmelden';}
    alert('Fehler bei der Anmeldung. Bitte versuche es später.');
  });
}
</script>`;
}
