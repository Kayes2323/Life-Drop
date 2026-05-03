import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, query, where, getDocs, doc,
  getDoc, updateDoc, addDoc, onSnapshot,
  serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let map, userMarker, donorMarkers = [];
let currentUser = null, currentUserData = null;
let pendingRatings = {};

// ── AUTH GUARD ────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = 'login.html'; return; }
  currentUser = user;
  currentUserData = await fetchUserData(user.uid);
  initUI();
  initMap();
  listenAllDonors();
});

async function fetchUserData(uid) {
  const snap = await getDoc(doc(db, 'donors', uid));
  return snap.exists() ? snap.data() : null;
}

// ── INIT UI ───────────────────────────────────────────────────
function initUI() {
  document.getElementById('user-name').textContent =
    currentUser.displayName || currentUser.email;

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'login.html';
  });

  // show availability toggle in profile
  renderMyProfile();
}

// ── MAP ───────────────────────────────────────────────────────
function initMap() {
  map = L.map('map').setView([23.7644, 90.3564], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap'
  }).addTo(map);
}

// ── REAL-TIME ALL DONORS ON MAP ───────────────────────────────
function listenAllDonors() {
  onSnapshot(collection(db, 'donors'), snapshot => {
    donorMarkers.forEach(m => map.removeLayer(m));
    donorMarkers = [];
    snapshot.forEach(docSnap => {
      const d = docSnap.data();
      if (!d.available || !d.lat) return;
      const m = L.marker([d.lat, d.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:#c0392b;color:#fff;font-size:10px;font-weight:700;
                 padding:3px 7px;border-radius:10px;border:2px solid #fff;
                 box-shadow:0 1px 4px rgba(0,0,0,.3);white-space:nowrap">${d.blood}</div>`,
          iconAnchor: [20, 10]
        })
      }).addTo(map);
      m.bindPopup(`<b>${d.name}</b><br>${d.blood} — ${d.address}<br>📞 ${d.phone}`);
      donorMarkers.push(m);
    });
  });
}

// ── SEARCH ────────────────────────────────────────────────────
window.searchDonors = async () => {
  const bg = document.getElementById('blood-filter').value;
  if (!bg) { showToast('Blood group select করো'); return; }

  setLoading(true);
  try {
    const q = query(
      collection(db, 'donors'),
      where('blood', '==', bg),
      where('available', '==', true)
    );
    const snap = await getDocs(q);
    const donors = [];
    snap.forEach(d => donors.push({ id: d.id, ...d.data() }));

    const refLat = currentUserData?.lat || 23.7644;
    const refLng = currentUserData?.lng || 90.3564;
    donors.forEach(d => d.distKm = dist(refLat, refLng, d.lat, d.lng));
    donors.sort((a, b) => a.distKm - b.distKm);

    renderResults(donors, bg);

    // fit map to results
    if (donors.length > 0) {
      const bounds = L.latLngBounds(donors.map(d => [d.lat, d.lng]));
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  } catch(e) {
    showToast('Error: ' + e.message);
  } finally {
    setLoading(false);
  }
};

function renderResults(donors, bg) {
  const el = document.getElementById('results-list');
  if (!donors.length) {
    el.innerHTML = `<div class="no-results">
      <div style="font-size:36px">🩸</div>
      <p style="margin-top:8px"><b>${bg}</b> blood donor পাওয়া যায়নি।</p>
    </div>`;
    return;
  }
  el.innerHTML = `<h3>${donors.length} জন ${bg} donor পাওয়া গেছে — দূরত্ব অনুযায়ী</h3>` +
    donors.map((d, i) => `
    <div class="donor-card ${i === 0 ? 'featured' : ''}">
      <div class="avatar">${ini(d.name)}</div>
      <div class="donor-info">
        <h4>${d.name}</h4>
        <div class="meta">
          <span class="blood-badge">${d.blood}</span>
          <span class="dist-badge">${d.distKm.toFixed(1)} km দূরে</span>
        </div>
        <div style="font-size:11px;color:#666;margin-top:2px">${d.address}</div>
        <div style="font-size:11px;color:#888;margin-top:2px">
          ${starsHtml(d.rating)} · ${d.donations} বার দান করেছেন
        </div>
        <div class="card-actions">
          <a class="btn-sm btn-call" href="tel:${d.phone}">📞 Call</a>
          ${d.wa ? `<a class="btn-sm btn-wa" href="https://wa.me/${d.wa.replace(/\D/g,'')}" target="_blank">💬 WhatsApp</a>` : ''}
          <button class="btn-sm btn-req"
            onclick="openRequestModal('${d.id}','${d.name}','${d.blood}')">
            রক্ত চাই
          </button>
        </div>
      </div>
    </div>`).join('');
}

// ── REQUEST MODAL ─────────────────────────────────────────────
window.openRequestModal = (donorId, donorName, blood) => {
  if (donorId === currentUser.uid) {
    showToast('নিজেকে request পাঠাতে পারবে না'); return;
  }
  document.getElementById('req-donor-id').value   = donorId;
  document.getElementById('req-donor-name').value = donorName;
  document.getElementById('req-blood').value      = blood;
  document.getElementById('req-msg').value        = '';
  document.getElementById('modal-title').textContent = `${donorName} (${blood}) কে অনুরোধ`;
  document.getElementById('modal-bg').classList.add('open');
};

window.sendRequest = async () => {
  const donorId   = document.getElementById('req-donor-id').value;
  const donorName = document.getElementById('req-donor-name').value;
  const blood     = document.getElementById('req-blood').value;
  const msg       = document.getElementById('req-msg').value.trim();
  if (!msg) { showToast('বিবরণ লিখুন'); return; }

  const btn = document.getElementById('req-submit-btn');
  btn.textContent = 'পাঠানো হচ্ছে...';
  btn.disabled = true;

  try {
    await addDoc(collection(db, 'requests'), {
      donorId, donorName, blood, msg,
      seekerUid  : currentUser.uid,
      seekerName : currentUser.displayName || currentUser.email,
      status     : 'pending',
      rated      : false,
      createdAt  : serverTimestamp()
    });
    document.getElementById('modal-bg').classList.remove('open');
    showToast(`✅ ${donorName} কে অনুরোধ পাঠানো হয়েছে!`);
  } catch(e) {
    showToast('Error: ' + e.message);
  } finally {
    btn.textContent = 'পাঠাও';
    btn.disabled = false;
  }
};

// ── MY REQUESTS ───────────────────────────────────────────────
window.loadMyRequests = async () => {
  const el = document.getElementById('requests-list');
  el.innerHTML = '<p style="color:#aaa;text-align:center;padding:20px">লোড হচ্ছে...</p>';
  try {
    const q = query(
      collection(db, 'requests'),
      where('seekerUid', '==', currentUser.uid)
    );
    const snap = await getDocs(q);
    const reqs = [];
    snap.forEach(d => reqs.push({ id: d.id, ...d.data() }));
    reqs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    renderRequests(reqs);
  } catch(e) {
    el.innerHTML = '<p style="color:red;text-align:center;padding:20px">লোড করতে সমস্যা হয়েছে।</p>';
  }
};

function renderRequests(reqs) {
  const el = document.getElementById('requests-list');
  if (!reqs.length) {
    el.innerHTML = '<div class="no-results"><p>কোনো request নেই।</p></div>'; return;
  }
  el.innerHTML = reqs.map(r => `
    <div class="req-card">
      <span class="status ${r.status}">${r.status === 'pending' ? 'অপেক্ষায়' : 'গৃহীত ✓'}</span>
      <h4 style="font-size:13px;font-weight:600">
        ${r.donorName} <span class="blood-badge">${r.blood}</span>
      </h4>
      <p style="font-size:12px;color:#666;margin-top:4px">"${r.msg}"</p>
      ${r.status === 'accepted' && !r.rated ? `
        <div class="rate-section">
          <div style="font-size:13px;font-weight:600;margin-bottom:4px">Rate দাও ও ধন্যবাদ জানাও</div>
          <div class="rate-stars" id="stars-${r.id}">
            ${[1,2,3,4,5].map(n =>
              `<span onclick="setRating('${r.id}',${n},'${r.donorId}')" data-v="${n}">★</span>`
            ).join('')}
          </div>
          <button class="rate-submit" onclick="submitRating('${r.id}','${r.donorId}')">Submit</button>
        </div>` : ''}
      ${r.rated ? '<div style="color:#27ae60;font-size:12px;margin-top:6px;font-weight:600">✓ Rating দেওয়া হয়েছে</div>' : ''}
    </div>`).join('');
}

window.setRating = (reqId, val, donorId) => {
  pendingRatings[reqId] = { val, donorId };
  document.querySelectorAll(`#stars-${reqId} span`).forEach(s =>
    s.classList.toggle('lit', parseInt(s.dataset.v) <= val));
};

window.submitRating = async (reqId, donorId) => {
  const r = pendingRatings[reqId];
  if (!r) { showToast('Star select করো'); return; }
  try {
    const donorRef  = doc(db, 'donors', donorId);
    const donorSnap = await getDoc(donorRef);
    const d = donorSnap.data();
    const newRating = ((d.rating * d.raters) + r.val) / (d.raters + 1);
    await updateDoc(donorRef, { rating: newRating, raters: increment(1) });
    await updateDoc(doc(db, 'requests', reqId), { rated: true });
    showToast('✅ Rating দেওয়া হয়েছে!');
    loadMyRequests();
  } catch(e) {
    showToast('Error: ' + e.message);
  }
};

// ── MY PROFILE ────────────────────────────────────────────────
function renderMyProfile() {
  const el = document.getElementById('my-profile-content');
  if (!currentUserData) {
    el.innerHTML = `<div class="no-profile-msg">
      <div style="font-size:40px">👤</div>
      <p style="margin-top:8px">Profile data পাওয়া যায়নি।</p>
    </div>`; return;
  }
  const d = currentUserData;
  el.innerHTML = `
    <div class="avail-toggle">
      <label>রক্ত দিতে available আছি</label>
      <label class="toggle-switch">
        <input type="checkbox" id="avail-toggle" ${d.available ? 'checked' : ''}
          onchange="toggleAvailability(this.checked)"/>
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="my-profile-card">
      <div class="my-profile-top">
        <div class="my-avatar">${ini(d.name)}</div>
        <div>
          <h3 style="font-size:16px;font-weight:700">${d.name}</h3>
          <span class="blood-badge">${d.blood}</span>
          <div style="font-size:12px;color:#666;margin-top:4px">${d.address}</div>
        </div>
      </div>
      <table class="profile-table">
        <tr><td>📞 Phone</td><td>${d.phone}</td></tr>
        ${d.email ? `<tr><td>✉️ Email</td><td>${d.email}</td></tr>` : ''}
        ${d.wa    ? `<tr><td>💬 WhatsApp</td><td>${d.wa}</td></tr>` : ''}
        <tr><td>🩸 Total Donations</td><td>${d.donations} বার</td></tr>
        <tr><td>⭐ Rating</td><td>${d.rating > 0 ? d.rating.toFixed(1) + ' / 5' : 'এখনো নেই'}</td></tr>
      </table>
    </div>`;
}

window.toggleAvailability = async (val) => {
  try {
    await updateDoc(doc(db, 'donors', currentUser.uid), { available: val });
    currentUserData.available = val;
    showToast(val ? '✅ তুমি এখন available' : '⏸ তুমি এখন unavailable');
  } catch(e) {
    showToast('Error: ' + e.message);
  }
};

// ── UTILS ─────────────────────────────────────────────────────
function ini(n) { return n.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase(); }
function starsHtml(r) {
  let s = '';
  for (let i = 1; i <= 5; i++)
    s += `<span style="color:${i <= Math.round(r) ? '#f39c12' : '#ddd'};font-size:12px">★</span>`;
  return s;
}
function dist(la1, lo1, la2, lo2) {
  const R = 6371, dL = (la2-la1)*Math.PI/180, dO = (lo2-lo1)*Math.PI/180;
  const a = Math.sin(dL/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dO/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
function setLoading(v) {
  document.getElementById('loading').classList.toggle('show', v);
}