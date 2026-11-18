/* ================================================================
   ABSENSI KELAS DIGITAL - SCRIPT.JS (VERSI PERBAIKAN KAMERA)
   Fitur: Mirror Kamera Depan, Paksa Kamera Belakang, Ganti Kamera Live
================================================================ */

/* ===== STATE ===== */
const STORE_KEYS = {
  students: 'ak_students',
  classes: 'ak_classes',
  attendance: 'ak_attendance',
  settings: 'ak_settings',
  profile: 'ak_profile',
  activity: 'ak_activity_log',
  theme: 'ak_theme',
  activeClass: 'ak_active_class'
};

let db = {
  students: [],
  classes: [],
  attendance: [],
  settings: {},
  profile: {},
  activity: []
};

let scanner = null;
let isScanning = false;
let lastScanTime = 0;
let lastScannedId = null;
const SCAN_COOLDOWN = 2500;

/* ===== STORAGE HELPERS ===== */
function loadData() {
  db.students = safeParse(localStorage.getItem(STORE_KEYS.students), []);
  db.classes = safeParse(localStorage.getItem(STORE_KEYS.classes), []);
  db.attendance = safeParse(localStorage.getItem(STORE_KEYS.attendance), []);
  db.activity = safeParse(localStorage.getItem(STORE_KEYS.activity), []);
  db.settings = safeParse(localStorage.getItem(STORE_KEYS.settings), getDefaultSettings());
  db.profile = safeParse(localStorage.getItem(STORE_KEYS.profile), getDefaultProfile());

  if (!db.classes.length) {
    db.classes = [{ id: 'class-default', name: 'Kelas Default' }];
    saveData('classes');
  }
}

function saveData(key) {
  if (key === 'students') localStorage.setItem(STORE_KEYS.students, JSON.stringify(db.students));
  if (key === 'classes') localStorage.setItem(STORE_KEYS.classes, JSON.stringify(db.classes));
  if (key === 'attendance') localStorage.setItem(STORE_KEYS.attendance, JSON.stringify(db.attendance));
  if (key === 'settings') localStorage.setItem(STORE_KEYS.settings, JSON.stringify(db.settings));
  if (key === 'profile') localStorage.setItem(STORE_KEYS.profile, JSON.stringify(db.profile));
  if (key === 'activity') localStorage.setItem(STORE_KEYS.activity, JSON.stringify(db.activity));
}

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try { const v = JSON.parse(raw); return v ?? fallback; } catch { return fallback; }
}

function getDefaultSettings() {
  return {
    startTime: '07:00',
    endTime: '09:00',
    lateTime: '07:15',
    activeDate: todayStr(),
    schoolName: 'SMA Digital Nusantara',
    teacherName: 'Ibu Sari, S.Pd'
  };
}

function getDefaultProfile() {
  return {
    school: 'SMA Digital Nusantara',
    npsn: '12345678',
    address: 'Jl. Pendidikan No. 1, Jakarta',
    headmaster: 'Drs. Bambang Sutrisno',
    teacher: 'Ibu Sari, S.Pd',
    year: '2024/2025'
  };
}

/* ===== UTILITIES ===== */
function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).substr(2, 7);
}

function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nowTimeStr() {
  return new Date().toTimeString().slice(0, 5);
}

function formatDateId(str) {
  if (!str) return '-';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function getActiveClassId() {
  return localStorage.getItem(STORE_KEYS.activeClass) || (db.classes[0]?.id ?? '');
}

function setActiveClass(id) {
  localStorage.setItem(STORE_KEYS.activeClass, id);
}

function getClassName(id) {
  const c = db.classes.find(x => x.id === id);
  return c ? c.name : '—';
}

/* ===== TOAST ===== */
function toast(msg, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${escapeHtml(msg)}</span>`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, duration);
}

/* ===== ACTIVITY LOG ===== */
function logActivity(text) {
  db.activity.unshift({ text, ts: new Date().toISOString() });
  db.activity = db.activity.slice(0, 200);
  saveData('activity');
  renderActivityLog();
}

/* ===== MODAL ===== */
function openModal(title, bodyHtml, footerHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalFooter').innerHTML = footerHtml || '';
  document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

/* ===== NAVIGATION ===== */
const pageTitles = {
  dashboard: ['Dashboard', 'Ringkasan kehadiran kelas'],
  scan: ['Scan Absensi', 'Pindai QR Code untuk absensi'],
  siswa: ['Data Siswa', 'Kelola data siswa'],
  kehadiran: ['Data Kehadiran', 'Catatan absensi siswa'],
  riwayat: ['Riwayat', 'Riwayat kehadiran per siswa'],
  laporan: ['Laporan', 'Laporan dan ekspor data'],
  kelas: ['Kelola Kelas', 'Manajemen kelas'],
  pengaturan: ['Pengaturan', 'Pengaturan sistem'],
  profil: ['Profil Sekolah', 'Identitas sekolah']
};

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  const t = pageTitles[page] || ['', ''];
  document.getElementById('pageTitle').textContent = t[0];
  document.getElementById('pageSubtitle').textContent = t[1];
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (page === 'dashboard') renderDashboard();
  if (page === 'siswa') renderStudents();
  if (page === 'kehadiran') renderAttendance();
  if (page === 'riwayat') renderHistory();
  if (page === 'kelas') renderClassList();
  if (page === 'pengaturan') renderSettings();
  if (page === 'profil') renderProfile();
  if (page === 'scan') renderScanSession();
}

/* ===== CLOCK ===== */
function tickClock() {
  const now = new Date();
  const dateEl = document.getElementById('currentDate');
  const timeEl = document.getElementById('currentTime');
  if (dateEl) dateEl.textContent = now.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  if (timeEl) timeEl.textContent = now.toLocaleTimeString('id-ID');
}

/* ================================================================
   CLASS SELECTOR
================================================================ */
function renderClassSelector() {
  const sel = document.getElementById('activeClassSelect');
  if (!sel) return;
  const active = getActiveClassId();
  sel.innerHTML = db.classes.map(c => `<option value="${c.id}" ${c.id === active ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('') || '<option value="">-</option>';
}

/* ================================================================
   DASHBOARD
================================================================ */
function renderDashboard() {
  const today = todayStr();
  const activeClassId = getActiveClassId();
  const classStudents = db.students.filter(s => s.classId === activeClassId);
  const total = classStudents.length;

  const todayAtt = db.attendance.filter(a => a.date === today);
  const classToday = todayAtt.filter(a => classStudents.some(s => s.id === a.studentId));

  const hadir = classToday.filter(a => a.status === 'Hadir').length;
  const izin = classToday.filter(a => a.status === 'Izin').length;
  const sakit = classToday.filter(a => a.status === 'Sakit').length;
  const alfa = classToday.filter(a => a.status === 'Alfa').length;
  const percent = total ? Math.round((hadir / total) * 100) : 0;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statHadir').textContent = hadir;
  document.getElementById('statIzin').textContent = izin;
  document.getElementById('statSakit').textContent = sakit;
  document.getElementById('statAlfa').textContent = alfa;
  document.getElementById('statPercent').textContent = percent + '%';

  drawBarChart();
  drawDonutChart();

  const recent = [...todayAtt].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 8);
  const el = document.getElementById('recentActivity');
  if (!recent.length) {
    el.innerHTML = '<p class="empty-state">Belum ada aktivitas hari ini</p>';
  } else {
    el.innerHTML = recent.map(a => {
      const s = db.students.find(x => x.id === a.studentId);
      return `<div class="activity-item">
        <span class="badge badge-${a.status.toLowerCase()}">${a.status}</span>
        <span>${escapeHtml(s?.name || '—')}</span>
        <span class="time">${a.time}</span>
      </div>`;
    }).join('');
  }
}

/* --- Charts via Canvas --- */
function drawBarChart() {
  const canvas = document.getElementById('chartBar');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight || 220;
  canvas.width = w * dpr; canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const activeClassId = getActiveClassId();
  const classStudents = db.students.filter(s => s.classId === activeClassId);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(todayStr(d));
  }
  const data = days.map(dstr => {
    const list = db.attendance.filter(a => a.date === dstr && classStudents.some(s => s.id === a.studentId));
    return list.filter(a => a.status === 'Hadir').length;
  });
  const maxV = Math.max(...data, 1);
  const pad = 32;
  const chartW = w - pad * 2;
  const chartH = h - pad - 24;
  const barW = chartW / days.length * 0.6;
  const gap = chartW / days.length;

  ctx.strokeStyle = getCssVar('--border');
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad + chartH * (i / 4);
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
  }

  days.forEach((d, i) => {
    const x = pad + gap * i + gap / 2 - barW / 2;
    const val = data[i];
    const bh = chartH * (val / maxV);
    const y = pad + chartH - bh;
    const grad = ctx.createLinearGradient(0, y, 0, y + bh);
    grad.addColorStop(0, '#3b82f6'); grad.addColorStop(1, '#06b6d4');
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, barW, bh, 6); else ctx.rect(x, y, barW, bh);
    ctx.fill();
    ctx.fillStyle = getCssVar('--text-muted');
    ctx.font = '11px Inter';
    ctx.textAlign = 'center';
    const label = new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short' });
    ctx.fillText(label, x + barW / 2, h - 6);
    if (val > 0) {
      ctx.fillStyle = getCssVar('--text');
      ctx.font = 'bold 11px Inter';
      ctx.fillText(val, x + barW / 2, y - 4);
    }
  });
}

function drawDonutChart() {
  const canvas = document.getElementById('chartDonut');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight || 220;
  canvas.width = w * dpr; canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const today = todayStr();
  const activeClassId = getActiveClassId();
  const classStudents = db.students.filter(s => s.classId === activeClassId);
  const todayAtt = db.attendance.filter(a => a.date === today && classStudents.some(s => s.id === a.studentId));
  const counts = {
    Hadir: todayAtt.filter(a => a.status === 'Hadir').length,
    Izin: todayAtt.filter(a => a.status === 'Izin').length,
    Sakit: todayAtt.filter(a => a.status === 'Sakit').length,
    Alfa: todayAtt.filter(a => a.status === 'Alfa').length
  };
  const colors = { Hadir: '#10b981', Izin: '#f59e0b', Sakit: '#06b6d4', Alfa: '#ef4444' };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const cx = w / 2, cy = h / 2 - 10, r = Math.min(w, h) / 2 - 40;
  let start = -Math.PI / 2;
  if (total === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = getCssVar('--border'); ctx.lineWidth = 24; ctx.stroke();
    ctx.fillStyle = getCssVar('--text-muted'); ctx.font = '13px Inter'; ctx.textAlign = 'center';
    ctx.fillText('Belum ada data', cx, cy + 5);
    return;
  }
  Object.entries(counts).forEach(([k, v]) => {
    if (!v) return;
    const angle = (v / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + angle);
    ctx.strokeStyle = colors[k]; ctx.lineWidth = 24; ctx.lineCap = 'round';
    ctx.stroke();
    start += angle;
  });

  let ly = h - 10;
  ctx.font = '11px Inter'; ctx.textAlign = 'left';
  let lx = 10;
  Object.entries(counts).forEach(([k, v]) => {
    ctx.fillStyle = colors[k];
    ctx.fillRect(lx, ly - 8, 10, 10);
    ctx.fillStyle = getCssVar('--text-muted');
    ctx.fillText(`${k}: ${v}`, lx + 14, ly);
    lx += 70;
  });
}

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

/* ================================================================
   SCAN PAGE (PERBAIKAN KAMERA & MIRROR)
================================================================ */
async function startScan() {
  if (isScanning) return;
  const readerEl = document.getElementById('qrReader');
  readerEl.innerHTML = '<p style="padding: 20px; color: #fff;">Memuat kamera...</p>';
  
  if (scanner) { 
    try { await scanner.clear(); } catch (e) {} 
  }

  try {
    scanner = new Html5Qrcode('qrReader');
    const cameraSelect = document.getElementById('cameraSelect');
    
    let cameraId = null;
    let cameras = [];
    let isFrontCamera = false;

    try {
      cameras = await Html5Qrcode.getCameras();
      if (cameras && cameras.length > 0) {
        cameraSelect.innerHTML = cameras.map((c, i) => `<option value="${c.id}">${escapeHtml(c.label || `Kamera ${i + 1}`)}</option>`).join('');
        
        // Cari kamera belakang
        const backCamera = cameras.find(c => 
          c.label.toLowerCase().includes('back') || 
          c.label.toLowerCase().includes('environment') || 
          c.label.toLowerCase().includes('belakang') ||
          c.label.toLowerCase().includes('rear')
        );
        
        // Cari kamera depan
        const frontCamera = cameras.find(c => 
          c.label.toLowerCase().includes('front') || 
          c.label.toLowerCase().includes('user') || 
          c.label.toLowerCase().includes('depan')
        );

        if (backCamera) {
          cameraId = backCamera.id;
          cameraSelect.value = backCamera.id;
          isFrontCamera = false;
        } else if (frontCamera) {
          cameraId = frontCamera.id;
          cameraSelect.value = frontCamera.id;
          isFrontCamera = true;
        } else {
          cameraId = cameraSelect.value;
        }
      }
    } catch (e) {
      console.warn('Gagal getCameras, mencoba fallback environment...', e);
    }

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    // Mulai scanner
    if (cameraId) {
      await scanner.start(cameraId, config, onScanSuccess, () => {});
    } else {
      await scanner.start({ facingMode: "environment" }, config, onScanSuccess, () => {});
    }

    // Terapkan efek mirror jika kamera depan
    applyMirrorEffect(isFrontCamera);

    isScanning = true;
    document.getElementById('startScanBtn').disabled = true;
    document.getElementById('stopScanBtn').disabled = false;
    setScanResult('info', '📷 Kamera aktif. Silakan arahkan QR Code...');

  } catch (err) {
    console.error(err);
    setScanResult('error', '❌ Gagal akses kamera: ' + (err?.message || 'Periksa izin kamera'));
    toast('Gagal akses kamera.', 'error');
    readerEl.innerHTML = '<p style="padding: 20px; color: #ef4444; text-align: center;">Kamera tidak tersedia / izin ditolak.</p>';
  }
}

async function stopScan() {
  if (!scanner) return;
  try { await scanner.stop(); await scanner.clear(); } catch (e) { console.warn(e); }
  isScanning = false;
  scanner = null;
  document.getElementById('startScanBtn').disabled = false;
  document.getElementById('stopScanBtn').disabled = true;
  setScanResult('', '');
}

function setScanResult(type, msg) {
  const el = document.getElementById('scanResult');
  el.className = 'scan-result ' + (type || '');
  el.innerHTML = msg;
}

function onScanSuccess(decodedText) {
  const now = Date.now();
  if (now - lastScanTime < SCAN_COOLDOWN && decodedText === lastScannedId) return;
  lastScanTime = now;
  lastScannedId = decodedText;

  const id = decodedText.trim();
  const student = db.students.find(s => s.id === id);

  if (!student) {
    setScanResult('error', `❌ QR Code tidak terdaftar (ID: ${escapeHtml(id)})`);
    toast('QR Code tidak terdaftar!', 'error');
    if (navigator.vibrate) navigator.vibrate(200);
    return;
  }

  if (student.status === 'Tidak Aktif') {
    setScanResult('error', `❌ Siswa ${escapeHtml(student.name)} tidak aktif`);
    toast('Siswa tidak aktif', 'error');
    return;
  }

  const today = todayStr();
  const existing = db.attendance.find(a => a.studentId === student.id && a.date === today);
  if (existing) {
    setScanResult('error', `⚠️ ${escapeHtml(student.name)} sudah absen hari ini (${existing.status} - ${existing.time})`);
    toast('Siswa sudah absen hari ini!', 'warning');
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    return;
  }

  const nowT = nowTimeStr();
  const s = db.settings;
  let late = false;
  if (s.lateTime && nowT > s.lateTime) late = true;

  const att = {
    id: uid('att-'),
    studentId: student.id,
    name: student.name,
    nis: student.nis,
    classId: student.classId,
    date: today,
    time: nowT,
    status: 'Hadir',
    method: 'QR Scan',
    late
  };
  db.attendance.push(att);
  saveData('attendance');
  logActivity(`Absensi ${student.name} (${late ? 'Terlambat' : 'Tepat Waktu'}) via QR`);

  setScanResult('success', `✅ ${escapeHtml(student.name)} - Hadir${late ? ' (Terlambat)' : ' (Tepat Waktu)'} @ ${nowT}`);
  toast(`Absensi ${student.name} berhasil!`, 'success');
  if (navigator.vibrate) navigator.vibrate([80, 40, 80]);

  renderScanSession();
  renderDashboard();
}

// Fungsi pembantu efek mirror
function applyMirrorEffect(isFront) {
  const video = document.querySelector('#qrReader video');
  if (video) {
    if (isFront) {
      video.style.transform = 'scaleX(-1)';
    } else {
      video.style.transform = 'scaleX(1)';
    }
  }
}

function renderScanSession() {
  const today = todayStr();
  const activeClassId = getActiveClassId();
  const classStudents = db.students.filter(s => s.classId === activeClassId);
  const list = db.attendance
    .filter(a => a.date === today && classStudents.some(s => s.id === a.studentId))
    .sort((a, b) => b.time.localeCompare(a.time));
  const el = document.getElementById('scanSessionList');
  if (!list.length) {
    el.innerHTML = '<p class="empty-state">Belum ada siswa yang absen hari ini</p>';
    return;
  }
  el.innerHTML = list.map(a => {
    const s = db.students.find(x => x.id === a.studentId);
    const initial = (s?.name || '?').charAt(0).toUpperCase();
    return `<div class="session-item">
      <div class="avatar">${initial}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;">${escapeHtml(s?.name || '—')}</div>
        <div style="font-size:11px;color:var(--text-muted);">${a.time} • ${a.method}${a.late ? ' • Terlambat' : ''}</div>
      </div>
      <span class="badge badge-${a.status.toLowerCase()}">${a.status}</span>
    </div>`;
  }).join('');
}

/* ================================================================
   STUDENTS
================================================================ */
function renderStudents() {
  const search = (document.getElementById('studentSearch')?.value || '').toLowerCase();
  const classFilter = document.getElementById('studentClassFilter')?.value || '';
  const statusFilter = document.getElementById('studentStatusFilter')?.value || '';

  let list = db.students.slice();
  if (search) list = list.filter(s => s.name.toLowerCase().includes(search) || (s.nis || '').toLowerCase().includes(search));
  if (classFilter) list = list.filter(s => s.classId === classFilter);
  if (statusFilter) list = list.filter(s => s.status === statusFilter);

  const tbody = document.getElementById('studentTableBody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Belum ada data siswa</td></tr>';
    return;
  }
  tbody.innerHTML = list.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.nis)}</td>
      <td style="font-size:11px;font-family:monospace;">${escapeHtml(s.id)}</td>
      <td>${escapeHtml(getClassName(s.classId))}</td>
      <td><span class="badge ${s.status === 'Aktif' ? 'badge-aktif' : 'badge-inactive'}">${s.status}</span></td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-secondary" onclick="showQR('${s.id}')">📱 QR</button>
          <button class="btn btn-sm btn-secondary" onclick="editStudent('${s.id}')">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="deleteStudent('${s.id}')">🗑</button>
        </div>
      </td>
    </tr>
  `).join('');

  const classFilterEl = document.getElementById('studentClassFilter');
  if (classFilterEl) {
    const v = classFilterEl.value;
    classFilterEl.innerHTML = '<option value="">Semua Kelas</option>' + db.classes.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    classFilterEl.value = v;
  }
}

function showStudentForm(student) {
  const isEdit = !!student;
  const s = student || { id: '', name: '', nis: '', classId: getActiveClassId(), status: 'Aktif' };
  const body = `
    <div class="form-group"><label>Nama Lengkap *</label><input id="fName" class="input" value="${escapeHtml(s.name)}"></div>
    <div class="form-group"><label>NIS *</label><input id="fNis" class="input" value="${escapeHtml(s.nis)}"></div>
    <div class="form-group"><label>Kelas *</label>
      <select id="fClass" class="input">${db.classes.map(c => `<option value="${c.id}" ${c.id === s.classId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>Status</label>
      <select id="fStatus" class="input">
        <option ${s.status === 'Aktif' ? 'selected' : ''}>Aktif</option>
        <option ${s.status === 'Tidak Aktif' ? 'selected' : ''}>Tidak Aktif</option>
      </select>
    </div>
    ${isEdit ? `<div class="form-group"><label>ID Unik</label><input class="input" value="${escapeHtml(s.id)}" disabled style="font-family:monospace;"></div>` : '<p class="muted">ID unik akan digenerate otomatis.</p>'}
  `;
  const footer = `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" onclick="${isEdit ? `saveStudentEdit('${s.id}')` : 'saveStudentNew()'}">💾 Simpan</button>
  `;
  openModal(isEdit ? '✏️ Edit Siswa' : '+ Tambah Siswa', body, footer);
  setTimeout(() => document.getElementById('fName')?.focus(), 100);
}

function saveStudentNew() {
  const name = document.getElementById('fName').value.trim();
  const nis = document.getElementById('fNis').value.trim();
  const classId = document.getElementById('fClass').value;
  const status = document.getElementById('fStatus').value;

  if (!name || !nis) return toast('Nama dan NIS wajib diisi', 'error');
  if (db.students.some(s => s.nis === nis)) return toast('NIS sudah terdaftar', 'error');

  const newStudent = {
    id: uid('std-'),
    name, nis, classId, status,
    createdAt: new Date().toISOString()
  };
  db.students.push(newStudent);
  saveData('students');
  logActivity(`Tambah siswa: ${name}`);
  toast('Siswa ditambahkan', 'success');
  closeModal();
  renderStudents();
  renderClassSelector();
}

function editStudent(id) {
  const s = db.students.find(x => x.id === id);
  if (!s) return;
  showStudentForm(s);
}

function saveStudentEdit(id) {
  const s = db.students.find(x => x.id === id);
  if (!s) return;
  const name = document.getElementById('fName').value.trim();
  const nis = document.getElementById('fNis').value.trim();
  const classId = document.getElementById('fClass').value;
  const status = document.getElementById('fStatus').value;

  if (!name || !nis) return toast('Nama dan NIS wajib diisi', 'error');
  if (db.students.some(x => x.nis === nis && x.id !== id)) return toast('NIS sudah dipakai siswa lain', 'error');

  s.name = name; s.nis = nis; s.classId = classId; s.status = status;
  saveData('students');
  logActivity(`Edit siswa: ${name}`);
  toast('Data siswa diperbarui', 'success');
  closeModal();
  renderStudents();
}

function deleteStudent(id) {
  const s = db.students.find(x => x.id === id);
  if (!s) return;
  openModal('🗑 Hapus Siswa',
    `<p>Yakin menghapus <b>${escapeHtml(s.name)}</b>? Data absensi siswa juga akan terpengaruh.</p>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Batal</button>
     <button class="btn btn-danger" onclick="confirmDeleteStudent('${id}')">Hapus</button>`);
}

function confirmDeleteStudent(id) {
  const s = db.students.find(x => x.id === id);
  db.students = db.students.filter(x => x.id !== id);
  db.attendance = db.attendance.filter(a => a.studentId !== id);
  saveData('students'); saveData('attendance');
  logActivity(`Hapus siswa: ${s?.name || id}`);
  toast('Siswa dihapus', 'success');
  closeModal();
  renderStudents();
  renderDashboard();
}

/* ================================================================
   QR CODE
================================================================ */
function showQR(studentId) {
  const s = db.students.find(x => x.id === studentId);
  if (!s) return;
  const body = `
    <div style="text-align:center;">
      <p style="margin-bottom:12px;font-weight:600;">${escapeHtml(s.name)}</p>
      <p class="muted" style="margin-bottom:16px;">${escapeHtml(s.nis)} • ${escapeHtml(getClassName(s.classId))}</p>
      <div id="qrTarget" style="display:inline-block;padding:16px;background:#fff;border-radius:12px;"></div>
      <p class="muted" style="margin-top:14px;font-size:11px;word-break:break-all;">ID: ${escapeHtml(s.id)}</p>
    </div>
  `;
  const footer = `
    <button class="btn btn-secondary" onclick="closeModal()">Tutup</button>
    <button class="btn btn-secondary" onclick="downloadQR('${s.id}')">⬇ Download PNG</button>
    <button class="btn btn-primary" onclick="printQR('${s.id}')">🖨 Cetak</button>
  `;
  openModal('📱 QR Code Siswa', body, footer);
  setTimeout(() => {
    const target = document.getElementById('qrTarget');
    if (target && window.QRCode) {
      target.innerHTML = '';
      new QRCode(target, {
        text: s.id,
        width: 200,
        height: 200,
        colorDark: '#0b1b3a',
        colorLight: '#ffffff'
      });
    }
  }, 50);
}

function downloadQR(studentId) {
  const s = db.students.find(x => x.id === studentId);
  const target = document.getElementById('qrTarget');
  const canvas = target?.querySelector('canvas');
  if (!canvas) return toast('QR belum siap', 'error');
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `QR_${(s?.name || 'siswa').replace(/\s+/g, '_')}.png`;
  a.click();
  toast('QR Code diunduh', 'success');
}

function printQR(studentId) {
  const s = db.students.find(x => x.id === studentId);
  const canvas = document.getElementById('qrTarget')?.querySelector('canvas');
  if (!canvas) return toast('QR belum siap', 'error');
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>QR ${escapeHtml(s.name)}</title>
    <style>body{font-family:sans-serif;text-align:center;padding:40px;} h2{margin:8px 0;} p{color:#555;margin:4px;}</style>
    </head><body>
    <h2>${escapeHtml(s.name)}</h2>
    <p>${escapeHtml(s.nis)} • ${escapeHtml(getClassName(s.classId))}</p>
    <img src="${canvas.toDataURL()}" style="margin:20px 0;width:240px;">
    <p style="font-size:11px;">ID: ${escapeHtml(s.id)}</p>
    <script>window.onload=()=>{window.print();}<\/script>
    </body></html>`);
  win.document.close();
}

/* ================================================================
   ATTENDANCE
================================================================ */
function renderAttendance() {
  const search = (document.getElementById('attSearch')?.value || '').toLowerCase();
  const dateF = document.getElementById('attDateFilter')?.value || '';
  const classF = document.getElementById('attClassFilter')?.value || '';
  const statusF = document.getElementById('attStatusFilter')?.value || '';

  let list = db.attendance.slice().sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  if (search) list = list.filter(a => (a.name || '').toLowerCase().includes(search));
  if (dateF) list = list.filter(a => a.date === dateF);
  if (classF) list = list.filter(a => a.classId === classF);
  if (statusF) list = list.filter(a => a.status === statusF);

  const tbody = document.getElementById('attTableBody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Belum ada data kehadiran</td></tr>';
    return;
  }
  tbody.innerHTML = list.map((a, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(a.name)}</td>
      <td>${escapeHtml(a.nis)}</td>
      <td>${escapeHtml(getClassName(a.classId))}</td>
      <td>${formatDateId(a.date)}</td>
      <td>${a.time}</td>
      <td><span class="badge badge-${a.status.toLowerCase()}">${a.status}</span></td>
      <td>${escapeHtml(a.method || 'Manual')}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-sm btn-secondary" onclick="editAttendance('${a.id}')">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="deleteAttendance('${a.id}')">🗑</button>
        </div>
      </td>
    </tr>
  `).join('');

  const classEl = document.getElementById('attClassFilter');
  if (classEl) {
    const v = classEl.value;
    classEl.innerHTML = '<option value="">Semua Kelas</option>' + db.classes.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    classEl.value = v;
  }
}

function editAttendance(id) {
  const a = db.attendance.find(x => x.id === id);
  if (!a) return;
  const body = `
    <p style="margin-bottom:12px;"><b>${escapeHtml(a.name)}</b> • ${formatDateId(a.date)} ${a.time}</p>
    <div class="form-group"><label>Status</label>
      <select id="editAttStatus" class="input">
        ${['Hadir', 'Izin', 'Sakit', 'Alfa'].map(s => `<option ${a.status === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
    </div>
  `;
  const footer = `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" onclick="saveAttendanceEdit('${id}')">💾 Simpan</button>
  `;
  openModal('✏️ Edit Kehadiran', body, footer);
}

function saveAttendanceEdit(id) {
  const a = db.attendance.find(x => x.id === id);
  if (!a) return;
  a.status = document.getElementById('editAttStatus').value;
  saveData('attendance');
  logActivity(`Edit kehadiran ${a.name} -> ${a.status}`);
  toast('Kehadiran diperbarui', 'success');
  closeModal();
  renderAttendance();
  renderDashboard();
}

function deleteAttendance(id) {
  const a = db.attendance.find(x => x.id === id);
  if (!a) return;
  openModal('🗑 Hapus Catatan',
    `<p>Hapus catatan kehadiran <b>${escapeHtml(a.name)}</b> (${formatDateId(a.date)})?</p>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Batal</button>
     <button class="btn btn-danger" onclick="confirmDeleteAttendance('${id}')">Hapus</button>`);
}

function confirmDeleteAttendance(id) {
  const a = db.attendance.find(x => x.id === id);
  db.attendance = db.attendance.filter(x => x.id !== id);
  saveData('attendance');
  logActivity(`Hapus kehadiran ${a?.name || ''}`);
  toast('Catatan dihapus', 'success');
  closeModal();
  renderAttendance();
  renderDashboard();
}

function exportAttendanceCSV() {
  if (!db.attendance.length) return toast('Tidak ada data untuk diekspor', 'warning');
  const rows = [['Tanggal', 'Jam', 'Nama', 'NIS', 'Kelas', 'Status', 'Metode', 'Terlambat']];
  db.attendance.forEach(a => {
    rows.push([a.date, a.time, a.name, a.nis, getClassName(a.classId), a.status, a.method || 'Manual', a.late ? 'Ya' : 'Tidak']);
  });
  downloadCSV(rows, `absensi_${todayStr()}.csv`);
  toast('CSV diunduh', 'success');
}

function downloadCSV(rows, filename) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ================================================================
   RIWAYAT
================================================================ */
function renderHistory() {
  const range = document.getElementById('historyRange')?.value || 'daily';
  const classF = document.getElementById('historyClassFilter')?.value || '';
  const el = document.getElementById('historyContent');

  const now = new Date();
  let startDate;
  if (range === 'daily') startDate = todayStr(now);
  else if (range === 'weekly') { const d = new Date(now); d.setDate(d.getDate() - 6); startDate = todayStr(d); }
  else { const d = new Date(now); d.setDate(d.getDate() - 29); startDate = todayStr(d); }

  let students = db.students.slice();
  if (classF) students = students.filter(s => s.classId === classF);

  if (!students.length) {
    el.innerHTML = '<p class="empty-state">Tidak ada siswa</p>';
    return;
  }

  const rows = students.map(s => {
    const atts = db.attendance.filter(a => a.studentId === s.id && a.date >= startDate);
    const hadir = atts.filter(a => a.status === 'Hadir').length;
    const izin = atts.filter(a => a.status === 'Izin').length;
    const sakit = atts.filter(a => a.status === 'Sakit').length;
    const alfa = atts.filter(a => a.status === 'Alfa').length;
    const total = atts.length;
    const percent = total ? Math.round((hadir / total) * 100) : 0;
    return { s, hadir, izin, sakit, alfa, total, percent };
  });

  el.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Nama</th><th>Kelas</th><th>Hadir</th><th>Izin</th><th>Sakit</th><th>Alfa</th><th>Total</th><th>% Kehadiran</th></tr></thead>
        <tbody>
          ${rows.map(r => `<tr>
            <td>${escapeHtml(r.s.name)}</td>
            <td>${escapeHtml(getClassName(r.s.classId))}</td>
            <td><span class="badge badge-hadir">${r.hadir}</span></td>
            <td><span class="badge badge-izin">${r.izin}</span></td>
            <td><span class="badge badge-sakit">${r.sakit}</span></td>
            <td><span class="badge badge-alfa">${r.alfa}</span></td>
            <td>${r.total}</td>
            <td><b>${r.percent}%</b></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="muted" style="margin-top:12px;font-size:11px;">Periode: ${range === 'daily' ? 'Hari ini' : range === 'weekly' ? '7 hari terakhir' : '30 hari terakhir'}</p>
  `;

  const classEl = document.getElementById('historyClassFilter');
  if (classEl) {
    const v = classEl.value;
    classEl.innerHTML = '<option value="">Semua Kelas</option>' + db.classes.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    classEl.value = v;
  }
}

/* ================================================================
   LAPORAN
================================================================ */
let lastReportRows = [];

function generateReport() {
  const start = document.getElementById('reportStart').value || todayStr();
  const end = document.getElementById('reportEnd').value || todayStr();
  const classF = document.getElementById('reportClass').value || '';
  const studentF = document.getElementById('reportStudent').value || '';

  let list = db.attendance.filter(a => a.date >= start && a.date <= end);
  if (classF) list = list.filter(a => a.classId === classF);
  if (studentF) list = list.filter(a => a.studentId === studentF);
  list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const rows = [['Tanggal', 'Jam', 'Nama', 'NIS', 'Kelas', 'Status', 'Metode', 'Terlambat']];
  list.forEach(a => rows.push([a.date, a.time, a.name, a.nis, getClassName(a.classId), a.status, a.method || 'Manual', a.late ? 'Ya' : 'Tidak']));
  lastReportRows = rows;

  const el = document.getElementById('reportOutput');
  if (!list.length) {
    el.innerHTML = '<p class="empty-state">Tidak ada data dalam periode ini</p>';
    return;
  }
  el.innerHTML = `
    <p style="margin-bottom:12px;font-size:13px;color:var(--text-muted);">
      Menampilkan ${list.length} catatan dari ${formatDateId(start)} s.d. ${formatDateId(end)}
    </p>
    <table>
      <thead><tr>${rows[0].map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.slice(1).map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  `;

  const studentEl = document.getElementById('reportStudent');
  if (studentEl) {
    const v = studentEl.value;
    studentEl.innerHTML = '<option value="">Semua Siswa</option>' + db.students.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    studentEl.value = v;
  }
  const classEl = document.getElementById('reportClass');
  if (classEl) {
    const v = classEl.value;
    classEl.innerHTML = '<option value="">Semua Kelas</option>' + db.classes.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    classEl.value = v;
  }
}

function downloadReportCSV() {
  if (!lastReportRows.length) return toast('Generate laporan dulu', 'warning');
  downloadCSV(lastReportRows, `laporan_${todayStr()}.csv`);
  toast('CSV diunduh', 'success');
}

function printReport() {
  if (!lastReportRows.length) return toast('Generate laporan dulu', 'warning');
  window.print();
}

/* ================================================================
   KELAS
================================================================ */
function renderClassList() {
  const el = document.getElementById('classList');
  if (!db.classes.length) {
    el.innerHTML = '<p class="empty-state">Belum ada kelas</p>';
    return;
  }
  el.innerHTML = db.classes.map(c => {
    const count = db.students.filter(s => s.classId === c.id).length;
    return `<div class="class-item">
      <h4>${escapeHtml(c.name)}</h4>
      <p>${count} siswa</p>
      <div class="actions">
        <button class="btn btn-sm btn-secondary" onclick="editClass('${c.id}')">✏️ Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteClass('${c.id}')">🗑 Hapus</button>
        <button class="btn btn-sm btn-primary" onclick="setActiveClass('${c.id}');renderClassSelector();toast('Kelas aktif: ${escapeHtml(c.name)}','success');renderDashboard()">Aktifkan</button>
      </div>
    </div>`;
  }).join('');
}

function showClassForm(cls) {
  const isEdit = !!cls;
  const name = cls?.name || '';
  const body = `<div class="form-group"><label>Nama Kelas *</label><input id="fClassName" class="input" value="${escapeHtml(name)}" placeholder="Contoh: X IPA 1"></div>`;
  const footer = `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" onclick="${isEdit ? `saveClassEdit('${cls.id}')` : 'saveClassNew()'}">💾 Simpan</button>
  `;
  openModal(isEdit ? '✏️ Edit Kelas' : '+ Tambah Kelas', body, footer);
  setTimeout(() => document.getElementById('fClassName')?.focus(), 100);
}

function saveClassNew() {
  const name = document.getElementById('fClassName').value.trim();
  if (!name) return toast('Nama kelas wajib diisi', 'error');
  db.classes.push({ id: uid('cls-'), name });
  saveData('classes');
  logActivity(`Tambah kelas: ${name}`);
  toast('Kelas ditambahkan', 'success');
  closeModal();
  renderClassList(); renderClassSelector();
}

function editClass(id) {
  const c = db.classes.find(x => x.id === id);
  if (c) showClassForm(c);
}

function saveClassEdit(id) {
  const c = db.classes.find(x => x.id === id);
  const name = document.getElementById('fClassName').value.trim();
  if (!name) return toast('Nama kelas wajib diisi', 'error');
  c.name = name;
  saveData('classes');
  logActivity(`Edit kelas: ${name}`);
  toast('Kelas diperbarui', 'success');
  closeModal();
  renderClassList(); renderClassSelector();
}

function deleteClass(id) {
  const c = db.classes.find(x => x.id === id);
  const count = db.students.filter(s => s.classId === id).length;
  if (count > 0) return toast('Kelas masih memiliki siswa. Pindahkan dulu.', 'error');
  openModal('🗑 Hapus Kelas',
    `<p>Hapus kelas <b>${escapeHtml(c.name)}</b>?</p>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Batal</button>
     <button class="btn btn-danger" onclick="confirmDeleteClass('${id}')">Hapus</button>`);
}

function confirmDeleteClass(id) {
  db.classes = db.classes.filter(c => c.id !== id);
  saveData('classes');
  if (getActiveClassId() === id) setActiveClass(db.classes[0]?.id || '');
  toast('Kelas dihapus', 'success');
  closeModal();
  renderClassList(); renderClassSelector(); renderDashboard();
}

/* ================================================================
   PENGATURAN
================================================================ */
function renderSettings() {
  const s = db.settings;
  document.getElementById('setStartTime').value = s.startTime || '07:00';
  document.getElementById('setEndTime').value = s.endTime || '09:00';
  document.getElementById('setLateTime').value = s.lateTime || '07:15';
  document.getElementById('setActiveDate').value = s.activeDate || todayStr();
  document.getElementById('setSchoolName').value = s.schoolName || '';
  document.getElementById('setTeacherName').value = s.teacherName || '';
  renderActivityLog();
}

function saveSettings() {
  db.settings = {
    startTime: document.getElementById('setStartTime').value,
    endTime: document.getElementById('setEndTime').value,
    lateTime: document.getElementById('setLateTime').value,
    activeDate: document.getElementById('setActiveDate').value,
    schoolName: document.getElementById('setSchoolName').value,
    teacherName: document.getElementById('setTeacherName').value
  };
  saveData('settings');
  logActivity('Pengaturan disimpan');
  toast('Pengaturan disimpan', 'success');
}

function renderActivityLog() {
  const el = document.getElementById('activityLog');
  if (!el) return;
  if (!db.activity.length) {
    el.innerHTML = '<p class="empty-state">Belum ada aktivitas</p>';
    return;
  }
  el.innerHTML = db.activity.slice(0, 30).map(a => {
    const d = new Date(a.ts);
    return `<div class="activity-item">
      <span>•</span>
      <span style="flex:1;">${escapeHtml(a.text)}</span>
      <span class="time">${d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
    </div>`;
  }).join('');
}

/* ================================================================
   PROFIL
================================================================ */
function renderProfile() {
  const p = db.profile;
  document.getElementById('profileSchool').value = p.school || '';
  document.getElementById('profileNpsn').value = p.npsn || '';
  document.getElementById('profileAddress').value = p.address || '';
  document.getElementById('profileHeadmaster').value = p.headmaster || '';
  document.getElementById('profileTeacher').value = p.teacher || '';
  document.getElementById('profileYear').value = p.year || '';
}

function saveProfile() {
  db.profile = {
    school: document.getElementById('profileSchool').value,
    npsn: document.getElementById('profileNpsn').value,
    address: document.getElementById('profileAddress').value,
    headmaster: document.getElementById('profileHeadmaster').value,
    teacher: document.getElementById('profileTeacher').value,
    year: document.getElementById('profileYear').value
  };
  saveData('profile');
  toast('Profil sekolah disimpan', 'success');
}

/* ================================================================
   BACKUP / RESTORE / RESET
================================================================ */
function backupData() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    students: db.students,
    classes: db.classes,
    attendance: db.attendance,
    settings: db.settings,
    profile: db.profile,
    activity: db.activity
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup_absensi_${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Backup berhasil diunduh', 'success');
}

function restoreData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.students || !data.classes) throw new Error('Format backup tidak valid');
      openModal('⚠️ Konfirmasi Restore',
        `<p>Data saat ini akan <b>diganti</b> dengan data backup. Lanjutkan?</p>
         <p class="muted" style="margin-top:8px;">${data.students.length} siswa, ${data.classes.length} kelas, ${(data.attendance || []).length} catatan absensi</p>`,
        `<button class="btn btn-secondary" onclick="closeModal()">Batal</button>
         <button class="btn btn-danger" onclick='applyRestore(${JSON.stringify(data).replace(/'/g, "&#39;")})'>Restore</button>`);
    } catch (err) {
      toast('File backup tidak valid: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function applyRestore(data) {
  db.students = data.students || [];
  db.classes = data.classes || [];
  db.attendance = data.attendance || [];
  db.settings = data.settings || getDefaultSettings();
  db.profile = data.profile || getDefaultProfile();
  db.activity = data.activity || [];
  saveData('students'); saveData('classes'); saveData('attendance');
  saveData('settings'); saveData('profile'); saveData('activity');
  logActivity('Data direstore dari backup');
  toast('Data berhasil direstore', 'success');
  closeModal();
  refreshAll();
}

function resetAllData() {
  openModal('⚠️ Reset Semua Data',
    `<p>Semua data (siswa, kelas, absensi, pengaturan) akan <b>dihapus permanen</b> dari browser ini.</p>
     <p style="margin-top:12px;color:var(--danger);font-weight:600;">Tindakan ini tidak dapat dibatalkan!</p>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Batal</button>
     <button class="btn btn-danger" onclick="confirmReset()">Reset Sekarang</button>`);
}

function confirmReset() {
  Object.values(STORE_KEYS).forEach(k => localStorage.removeItem(k));
  toast('Semua data telah direset', 'success');
  closeModal();
  setTimeout(() => location.reload(), 800);
}

/* ================================================================
   THEME
================================================================ */
function initTheme() {
  const saved = localStorage.getItem(STORE_KEYS.theme) || 'light';
  applyTheme(saved);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem(STORE_KEYS.theme, theme);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
  setTimeout(() => { renderDashboard(); }, 100);
}

/* ================================================================
   INIT
================================================================ */
function refreshAll() {
  renderClassSelector();
  renderDashboard();
  renderStudents();
  renderAttendance();
  renderHistory();
  renderScanSession();
  renderClassList();
}

function bindEvents() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(el.dataset.page);
    });
  });

  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('active');
  });
  document.getElementById('overlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('active');
  });

  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  document.getElementById('activeClassSelect').addEventListener('change', (e) => {
    setActiveClass(e.target.value);
    refreshAll();
    toast('Kelas aktif diganti', 'info', 1500);
  });

  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
  });

  // SCAN
  document.getElementById('startScanBtn').addEventListener('click', startScan);
  document.getElementById('stopScanBtn').addEventListener('click', async () => {
    if (isScanning) {
      if (confirm('Hentikan scan?')) await stopScan();
    }
  });

  // GANTI KAMERA LIVE (TANPA HARUS STOP/START)
  document.getElementById('cameraSelect').addEventListener('change', async (e) => {
    if (isScanning && scanner) {
      const newCameraId = e.target.value;
      try {
        await scanner.stop();
        await scanner.clear();
        scanner = new Html5Qrcode('qrReader');
        await scanner.start(
          newCameraId,
          { fps: 10, qrbox: { width: 250, height: 250 } },
          onScanSuccess,
          () => {}
        );
        
        // Deteksi apakah kamera baru adalah kamera depan
        const label = e.target.options[e.target.selectedIndex].text.toLowerCase();
        const isFront = label.includes('front') || label.includes('user') || label.includes('depan');
        applyMirrorEffect(isFront);

        toast('Kamera diganti', 'info');
      } catch (err) {
        toast('Gagal ganti kamera: ' + err.message, 'error');
      }
    }
  });

  document.getElementById('addStudentBtn').addEventListener('click', () => showStudentForm(null));
  document.getElementById('studentSearch').addEventListener('input', renderStudents);
  document.getElementById('studentClassFilter').addEventListener('change', renderStudents);
  document.getElementById('studentStatusFilter').addEventListener('change', renderStudents);

  document.getElementById('attSearch').addEventListener('input', renderAttendance);
  document.getElementById('attDateFilter').addEventListener('change', renderAttendance);
  document.getElementById('attClassFilter').addEventListener('change', renderAttendance);
  document.getElementById('attStatusFilter').addEventListener('change', renderAttendance);
  document.getElementById('exportCsvBtn').addEventListener('click', exportAttendanceCSV);

  document.getElementById('historyRange').addEventListener('change', renderHistory);
  document.getElementById('historyClassFilter').addEventListener('change', renderHistory);

  document.getElementById('generateReport').addEventListener('click', generateReport);
  document.getElementById('downloadReportCsv').addEventListener('click', downloadReportCSV);
  document.getElementById('printReport').addEventListener('click', printReport);

  document.getElementById('addClassBtn').addEventListener('click', () => showClassForm(null));

  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  document.getElementById('backupBtn').addEventListener('click', backupData);
  document.getElementById('restoreInput').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) restoreData(f);
    e.target.value = '';
  });
  document.getElementById('resetBtn').addEventListener('click', resetAllData);

  document.getElementById('saveProfile').addEventListener('click', saveProfile);

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'k') { e.preventDefault(); navigateTo('siswa'); setTimeout(() => document.getElementById('studentSearch')?.focus(), 100); }
    if (e.ctrlKey && e.key === 'd') { e.preventDefault(); navigateTo('dashboard'); }
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); navigateTo('scan'); }
    if (e.ctrlKey && e.key === 'p') { e.preventDefault(); navigateTo('pengaturan'); }
    if (e.key === 'Escape') closeModal();
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderDashboard(), 200);
  });
}

function init() {
  loadData();
  initTheme();
  bindEvents();
  renderClassSelector();
  renderDashboard();
  renderStudents();
  renderAttendance();
  renderHistory();
  renderScanSession();
  renderClassList();
  renderSettings();
  renderProfile();
  tickClock();
  setInterval(tickClock, 1000);
  document.getElementById('reportStart').value = todayStr();
  document.getElementById('reportEnd').value = todayStr();

  setTimeout(() => {
    document.getElementById('loader')?.classList.add('hidden');
  }, 400);
}

document.addEventListener('DOMContentLoaded', init);
