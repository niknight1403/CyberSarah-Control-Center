/**
 * AI Sales Chat Widget - HTML/JS fuer Landing Page
 * Floating Chat Button + Overlay
 */
export function chatWidgetHtml(): string {
  return [
    '<div id="cybersarah-chat" style="position:fixed;bottom:20px;right:20px;z-index:99999;font-family:monospace;">',
    '<div id="chat-button" style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#a855f7,#06b6d4);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 20px rgba(168,85,247,0.4);font-size:24px;" onclick="toggleChat()">B</div>',
    '<div id="chat-box" style="display:none;position:absolute;bottom:70px;right:0;width:360px;background:#111118;border:1px solid #2a2a3e;border-radius:16px;overflow:hidden;">',
    '<div style="background:#1a0a2e;padding:12px;border-bottom:1px solid #2a2a3e;display:flex;justify-content:space-between;">',
    '<div><b style="color:#f0f0f0;">KI Sales Assist</b><br><span style="color:#6b7280;font-size:12px;">Fragen? Kaufberatung?</span></div>',
    '<span onclick="toggleChat()" style="cursor:pointer;color:#6b7280;">X</span></div>',
    '<div id="chat-messages" style="height:300px;overflow-y:auto;padding:12px;background:#0a0a0f;">',
    '<div style="background:#1a1a2e;color:#e0e0e0;padding:10px;border-radius:12px;font-size:14px;">Hallo! Ich bin dein KI-Sales-Assistent.</div></div>',
    '<div style="padding:12px;border-top:1px solid #2a2a3e;display:flex;gap:8px;background:#111118;">',
    '<input id="chat-input" type="text" placeholder="Nachricht..." style="flex:1;background:#1a1a2e;border:1px solid #2a2a3e;border-radius:8px;padding:10px;color:#e0e0e0;font-size:14px;" onkeydown="if(event.key===\"Enter\")sendChat()">',
    '<button onclick="sendChat()" style="background:linear-gradient(90deg,#a855f7,#06b6d4);color:#fff;border:none;border-radius:8px;width:40px;cursor:pointer;">></button>',
    '</div></div></div>',
    '<script>',
    'var chatSession=localStorage.getItem("cs_chat_session")||"chat_"+Date.now()+"_"+Math.random().toString(36).substr(2,6);',
    'if(!localStorage.getItem("cs_chat_session"))localStorage.setItem("cs_chat_session",chatSession);',
    'function toggleChat(){var b=document.getElementById("chat-box");var btn=document.getElementById("chat-button");var d=b.style.display==="block";b.style.display=d?"none":"block";btn.style.display=d?"flex":"none";}',
    'function sendChat(){var inp=document.getElementById("chat-input");var msg=inp.value.trim();if(!msg)return;',
    'var m=document.getElementById("chat-messages");m.innerHTML+="<div style=\"margin-bottom:8px;text-align:right;\"><div style=\"display:inline-block;background:linear-gradient(90deg,#a855f7,#06b6d4);color:#fff;padding:10px;border-radius:12px;font-size:14px;\">"+msg.replace(/</g,"&lt;")+"</div></div>";',
    'm.scrollTop=m.scrollHeight;inp.value="";inp.disabled=true;',
    'm.innerHTML+="<div style=\"margin-bottom:8px;\"><div style=\"display:inline-block;background:#1a1a2e;color:#6b7280;padding:10px;border-radius:12px;font-size:14px;\">Lade...</div></div>";',
    'fetch("/api/sales-chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:msg,sessionId:chatSession})})',
    '.then(function(r){return r.json()}).then(function(d){m.removeChild(m.lastChild);if(d.reply){',
    'm.innerHTML+="<div style=\"margin-bottom:8px;\"><div style=\"display:inline-block;background:#1a1a2e;color:#e0e0e0;padding:10px;border-radius:12px;font-size:14px;\">"+d.reply.replace(/\\n/g,"<br>")+"</div></div>";}',
    'm.scrollTop=m.scrollHeight;inp.disabled=false;inp.focus();',
    '}).catch(function(){m.removeChild(m.lastChild);inp.disabled=false;});}',
    '<\\/script>'
  ].join("\n");
}
