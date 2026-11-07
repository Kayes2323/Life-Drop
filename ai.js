// ══════════════════════════════════════════════════════════
// Sondhan AI — চ্যাট ইন্টারফেস (ফ্রন্টএন্ড)।
//
// এখানে কোনো API key নেই। প্রতিটা বার্তা যায় /api/ai-তে, Firebase ID token
// সহ — Gemini-র চাবি শুধু সার্ভারেই (api/ai.js) থাকে।
//
// কথোপকথন sessionStorage-এ রাখা হয় (ট্যাব বন্ধ করলেই মুছে যায়) — Stage 1-এ
// ইচ্ছাকৃতভাবে সার্ভারে কোনো চ্যাট ইতিহাস সংরক্ষণ করা হচ্ছে না।
// ══════════════════════════════════════════════════════════
import { auth } from './firebase-config-auth.js';
import { esc } from './app.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const $ = id => document.getElementById(id);
const scrollEl = $('scroll'), threadEl = $('thread'), welcomeEl = $('welcome');
const gateEl = $('gate'), composerWrap = $('composer-wrap');
const inputEl = $('input'), sendBtn = $('send'), newBtn = $('btn-new');

let CU = null;            // বর্তমান ব্যবহারকারী
let MESSAGES = [];        // [{role:'user'|'model', text}]
let busy = false;
let lastFailed = null;    // retry-র জন্য

const MAX_KEEP = 24;      // সার্ভারের সীমার নিচে থাকতে — পুরনো বার্তা ছেঁটে ফেলি

// ── Stage 1-এ যেগুলো সত্যিই কাজ করে, শুধু সেগুলোই দেখাই ──────────
const SUGGESTIONS = [
  { icon: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    text: 'CBC পরীক্ষার সরকারি দাম কত?' },
  { icon: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    text: 'TSH পরীক্ষা কেন করতে হয়?' },
  { icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    text: 'প্রেসক্রিপশনে OD, BD, TDS মানে কী?' },
  { icon: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    text: 'Sondhan-এ রক্তদাতা কীভাবে খুঁজব?' },
];

// ── মডেলের উত্তর নিরাপদে HTML-এ রূপান্তর ───────────────────────────
// নিয়ম: আগে সব escape, তারপর শুধু নির্দিষ্ট কয়েকটা ট্যাগ ফিরিয়ে আনি।
// মডেলের কাঁচা লেখা কখনো সরাসরি innerHTML-এ বসানো হয় না।
function renderMarkdown(raw) {
  // ১) কোড-স্প্যান আলাদা করে রাখি (escape-এর আগে, কারণ esc() backtick-ও বদলায়)
  const codes = [];
  let s = String(raw || '').replace(/`([^`\n]+)`/g, (_, c) => {
    codes.push(c);
    return '\u0001C' + (codes.length - 1) + '\u0001';
  });

  s = esc(s);   // ← এখানেই সব বিপজ্জনক অক্ষর নিরাপদ হয়ে যায়

  // ২) ইনলাইন রূপান্তর (escape করা লেখার উপর, তাই নিরাপদ)
  const inline = (t) => t
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // ৩) ব্লক গঠন (লাইন ধরে)
  const out = [];
  let list = null;   // 'ul' | 'ol' | null
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

  for (const line of s.split('\n')) {
    const t = line.trim();
    if (!t) { closeList(); continue; }

    const h = /^#{2,4}\s+(.+)$/.exec(t);
    if (h) { closeList(); out.push(`<h3>${inline(h[1])}</h3>`); continue; }

    const ul = /^[-*•]\s+(.+)$/.exec(t);
    if (ul) {
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(ul[1])}</li>`); continue;
    }

    const ol = /^\d+[.)]\s+(.+)$/.exec(t);
    if (ol) {
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(ol[1])}</li>`); continue;
    }

    closeList();
    out.push(`<p>${inline(t)}</p>`);
  }
  closeList();

  // ৪) কোড-স্প্যান ফেরত (নিজেরাও escape করে)
  return out.join('').replace(/\u0001C(\d+)\u0001/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
}

// ── DOM তৈরি ───────────────────────────────────────────────────────
const MARK_SVG = '<svg viewBox="0 0 24 24"><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z"/></svg>';

function addUserMsg(text) {
  const d = document.createElement('div');
  d.className = 'msg user';
  d.innerHTML = `<div class="bubble"></div>`;
  d.querySelector('.bubble').textContent = text;   // ইউজারের লেখা — শুধু টেক্সট
  threadEl.appendChild(d);
  return d;
}

function addAiMsg() {
  const d = document.createElement('div');
  d.className = 'msg ai';
  d.innerHTML = `<div class="ai-row"><div class="ai-av" aria-hidden="true">${MARK_SVG}</div><div class="ai-body"></div></div>`;
  threadEl.appendChild(d);
  return d;
}

function showTyping() {
  const d = addAiMsg();
  d.dataset.typing = '1';
  d.querySelector('.ai-body').innerHTML = '<div class="dots"><i></i><i></i><i></i></div>';
  scrollToEnd();
  return d;
}

function fillAi(node, text, toolsUsed) {
  delete node.dataset.typing;
  const body = node.querySelector('.ai-body');
  body.innerHTML = renderMarkdown(text);
  if (Array.isArray(toolsUsed) && toolsUsed.includes('searchMedicalTests')) {
    const b = document.createElement('div');
    b.className = 'src-badge';
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>Sondhan-এর যাচাইকৃত মূল্যতালিকা থেকে';
    body.appendChild(b);
  }
}

const ERRORS = {
  'rate-limited': 'একটু বেশি অনুরোধ হয়ে গেছে। কিছুক্ষণ পর আবার চেষ্টা করুন।',
  'upstream-rate-limited': 'এই মুহূর্তে সেবাটি ব্যস্ত। একটু পর আবার চেষ্টা করুন।',
  'not-configured': 'Sondhan AI এখনো চালু করা হয়নি (সার্ভারে কনফিগার করা বাকি)।',
  'no-token': 'লগইন মেয়াদ শেষ হয়ে গেছে — আবার লগইন করুন।',
  'bad-token': 'লগইন মেয়াদ শেষ হয়ে গেছে — আবার লগইন করুন।',
  'conversation-too-long': 'কথোপকথন অনেক লম্বা হয়ে গেছে। "নতুন" চেপে নতুন করে শুরু করুন।',
  'message-too-long': 'বার্তাটি অনেক বড়। একটু ছোট করে লিখুন।',
  // BUGFIX: এই reason-গুলো আগে ম্যাপ করা ছিল না, তাই সার্ভার-সাইড সমস্যাতেও
  // (যেমন Gemini নিজেই ব্যর্থ হলে) ভুলভাবে "ইন্টারনেট দেখুন" দেখাতো —
  // ব্যবহারকারীকে ভুল দিকে পাঠাতো। এখন প্রতিটা আসল কারণের নিজস্ব স্পষ্ট বার্তা।
  'upstream-unreachable': 'Sondhan AI-এর সার্ভারে সাময়িক সমস্যা হচ্ছে। একটু পর আবার চেষ্টা করুন।',
  'upstream-auth': 'Sondhan AI এই মুহূর্তে কনফিগার করা যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।',
  'upstream-error': 'উত্তর তৈরি করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।',
  'empty-response': 'উত্তর তৈরি করা যায়নি। প্রশ্নটা একটু ভিন্নভাবে জিজ্ঞাসা করে দেখুন।',
  'tool-loop-exhausted': 'উত্তর তৈরি করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।',
  'server-error': 'একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।',
  'network': 'ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।',
};

function fillError(node, reason) {
  delete node.dataset.typing;
  const body = node.querySelector('.ai-body');
  body.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'err-box';
  const p = document.createElement('div');
  p.textContent = ERRORS[reason] || 'একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।';
  box.appendChild(p);
  const btn = document.createElement('button');
  btn.textContent = 'আবার চেষ্টা করুন';
  btn.onclick = () => { node.remove(); if (lastFailed) send(lastFailed, true); };
  box.appendChild(btn);
  body.appendChild(box);
  scrollToEnd();
}

function scrollToEnd() {
  requestAnimationFrame(() => { scrollEl.scrollTop = scrollEl.scrollHeight; });
}

// ── sessionStorage (ট্যাব বন্ধ = মুছে যায়) ──────────────────────────
const storeKey = () => 'sondhan-ai:' + (CU ? CU.uid : 'anon');
function saveHistory() {
  try { sessionStorage.setItem(storeKey(), JSON.stringify(MESSAGES.slice(-MAX_KEEP))); } catch (_) {}
}
function loadHistory() {
  try {
    const raw = sessionStorage.getItem(storeKey());
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}

function redrawAll() {
  threadEl.innerHTML = '';
  for (const m of MESSAGES) {
    if (m.role === 'user') addUserMsg(m.text);
    else fillAi(addAiMsg(), m.text, m.toolsUsed);
  }
  welcomeEl.hidden = MESSAGES.length > 0;
  newBtn.hidden = MESSAGES.length === 0;
  scrollToEnd();
}

// ── পাঠানো ─────────────────────────────────────────────────────────
async function send(text, isRetry = false) {
  if (busy || !CU) return;
  text = String(text || '').trim();
  if (!text) return;

  busy = true;
  sendBtn.disabled = true;

  if (!isRetry) {
    MESSAGES.push({ role: 'user', text });
    addUserMsg(text);
    welcomeEl.hidden = true;
    newBtn.hidden = false;
    saveHistory();
  }
  lastFailed = text;

  const typing = showTyping();

  try {
    const token = await CU.getIdToken();
    const r = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ messages: MESSAGES.slice(-MAX_KEEP).map(m => ({ role: m.role, text: m.text })) }),
    });
    const j = await r.json().catch(() => ({}));

    if (!r.ok || !j.ok) {
      fillError(typing, j.reason);
    } else {
      fillAi(typing, j.text, j.toolsUsed);
      MESSAGES.push({ role: 'model', text: j.text, toolsUsed: j.toolsUsed });
      saveHistory();
      lastFailed = null;
      scrollToEnd();
    }
  } catch (_) {
    fillError(typing, 'network');
  } finally {
    busy = false;
    sendBtn.disabled = !inputEl.value.trim();
  }
}

// ── ইনপুট ──────────────────────────────────────────────────────────
function autoGrow() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 130) + 'px';
}
inputEl.addEventListener('input', () => { autoGrow(); sendBtn.disabled = busy || !inputEl.value.trim(); });
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 700px)').matches) {
    e.preventDefault(); submit();
  }
});
function submit() {
  const t = inputEl.value.trim();
  if (!t || busy) return;
  inputEl.value = ''; autoGrow(); sendBtn.disabled = true;
  send(t);
}
sendBtn.addEventListener('click', submit);

newBtn.addEventListener('click', () => {
  if (busy) return;
  MESSAGES = []; lastFailed = null;
  saveHistory();
  redrawAll();
  inputEl.focus();
});

// ── সাজেশন ─────────────────────────────────────────────────────────
function drawSuggestions() {
  const box = $('sugg');
  box.innerHTML = '';
  for (const s of SUGGESTIONS) {
    const b = document.createElement('button');
    b.className = 'sugg-btn';
    b.innerHTML = `<span class="sugg-ic"><svg viewBox="0 0 24 24">${s.icon}</svg></span><span></span>`;
    b.querySelector('span:last-child').textContent = s.text;
    b.onclick = () => send(s.text);
    box.appendChild(b);
  }
}

// ── শুরু ───────────────────────────────────────────────────────────
drawSuggestions();

onAuthStateChanged(auth, user => {
  CU = user || null;
  if (!CU) {
    gateEl.hidden = false;
    welcomeEl.hidden = true;
    composerWrap.hidden = true;
    threadEl.innerHTML = '';
    newBtn.hidden = true;
    return;
  }
  gateEl.hidden = true;
  composerWrap.hidden = false;
  MESSAGES = loadHistory();
  redrawAll();
});

// মডিউল সত্যিই চালু হয়েছে — পেজের সেফটি-নেট এটা দেখে বুঝবে
window.__sondhanAiReady = true;
