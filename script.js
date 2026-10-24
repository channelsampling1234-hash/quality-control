/* ==========================================
   KONFIGURASI SUPABASE
   ========================================== */
const SUPABASE_URL  = 'https://efmtnlybsskxeeaeidzs.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmbXRubHlic3NreGVlYWVpZHpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NDQxOTYsImV4cCI6MjEwODQyMDE5Nn0.G81x3CcM52sXpKExeFZA_pl3rumjDPHdcZvuAX-_vJY';

// Inisialisasi Supabase client
const _supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/* ==========================================
   MOCK google.script.run — LOCALHOST ONLY
   Di GAS: blok ini di-skip karena `google` sudah ada.
   Di localhost: pakai Supabase langsung.
   ========================================== */
(function () {
  if (typeof google !== 'undefined') return;

  // Tampilkan env-banner
  document.addEventListener('DOMContentLoaded', function () {
    var banner = document.getElementById('env-banner');
    if (banner) banner.style.display = 'flex';
  });

  function createRunner() {
    let _success = null;
    let _failure  = null;

    const runner = {
      withSuccessHandler(fn) { _success = fn; return runner; },
      withFailureHandler(fn) { _failure  = fn; return runner; },

      // Ambil data karyawan & tools dari Supabase
      async getMasterData() {
        try {
          const [karyawanRes, toolsRes] = await Promise.all([
            _supa.from('master_karyawan').select('nama, nik, jabatan').order('nama'),
            _supa.from('daftar_tools').select('nama_tool').order('id')
          ]);
          if (karyawanRes.error) throw new Error(karyawanRes.error.message);
          if (toolsRes.error)   throw new Error(toolsRes.error.message);

          const data = {
            karyawan: karyawanRes.data,
            tools:    toolsRes.data.map(t => t.nama_tool)
          };
          if (_success) _success(data);
        } catch (e) {
          if (_failure) _failure(e.message);
        }
      },

      // Simpan data P5M ke Supabase
      async submitP5M(formData) {
        try {
          // Upload signature ke Supabase Storage
          let signatureUrl = null;
          if (formData.signature && formData.signature.startsWith('data:')) {
            const blob = await (await fetch(formData.signature)).blob();
            const fileName = `p5m_${Date.now()}.png`;
            const { data: uploadData, error: uploadErr } = await _supa.storage
              .from('signatures')
              .upload(fileName, blob, { contentType: 'image/png', upsert: true });
            if (!uploadErr) {
              const { data: urlData } = _supa.storage.from('signatures').getPublicUrl(fileName);
              signatureUrl = urlData.publicUrl;
            }
          }

          const { error } = await _supa.from('data_p5m').insert({
            tanggal:           formData.tanggal,
            nama:              formData.nama,
            nik:               formData.nik,
            jabatan:           formData.jabatan,
            materi:            formData.materi,
            jam_tidur:         parseFloat(formData.jamTidur) || null,
            status_kesehatan:  formData.statusKesehatan,
            konsumsi_obat:     formData.isKonsumsiObat,
            rincian_obat:      formData.rincianObat,
            tindakan_pengawas: formData.tindakanPengawas,
            catatan:           formData.catatan,
            signature_url:     signatureUrl
          });

          if (error) throw new Error(error.message);
          if (_success) _success({ status: 'success', message: 'Data P5M berhasil disimpan!' });
        } catch (e) {
          if (_failure) _failure(e.message);
        }
      },

      // Simpan data Checklist ke Supabase
      async submitChecklist(formData) {
        try {
          let signatureUrl = null;
          if (formData.signature && formData.signature.startsWith('data:')) {
            const blob = await (await fetch(formData.signature)).blob();
            const fileName = `chk_${Date.now()}.png`;
            const { data: uploadData, error: uploadErr } = await _supa.storage
              .from('signatures')
              .upload(fileName, blob, { contentType: 'image/png', upsert: true });
            if (!uploadErr) {
              const { data: urlData } = _supa.storage.from('signatures').getPublicUrl(fileName);
              signatureUrl = urlData.publicUrl;
            }
          }

          const { error } = await _supa.from('data_checklist').insert({
            tanggal:      formData.tanggal,
            area:         formData.area,
            nama:         formData.nama,
            nik:          formData.nik,
            tools_status: formData.toolsStatus,
            catatan:      formData.catatan,
            signature_url: signatureUrl
          });

          if (error) throw new Error(error.message);
          if (_success) _success({ status: 'success', message: 'Data Checklist berhasil disimpan!' });
        } catch (e) {
          if (_failure) _failure(e.message);
        }
      },
    };
    return runner;
  }

  window.google = {
    script: { get run() { return createRunner(); } },
  };
})();

/* ==========================================
   KODE DI BAWAH INI = SAMA PERSIS DENGAN GAS LIVE
   ========================================== */
  let masterKaryawan = [];
  let masterTools = [];
  let sigPadP5M, sigPadChk;

  document.addEventListener("DOMContentLoaded", function () {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('p5m_tanggal').value = today;
    document.getElementById('chk_tanggal').value = today;

    sigPadP5M = new SignaturePad(document.getElementById('pad_p5m'));
    sigPadChk = new SignaturePad(document.getElementById('pad_chk'));

    resizeCanvas(document.getElementById('pad_p5m'));
    resizeCanvas(document.getElementById('pad_chk'));

    // ---- Manual Tab Switcher (custom nav-item class) ----
    document.querySelectorAll('[data-bs-toggle="pill"]').forEach(btn => {
      btn.addEventListener('click', function () {
        const target = this.getAttribute('data-bs-target');

        // Update active nav button
        document.querySelectorAll('[data-bs-toggle="pill"]').forEach(b => b.classList.remove('active'));
        this.classList.add('active');

        // Hide all tab panes
        document.querySelectorAll('.tab-pane').forEach(pane => {
          pane.classList.remove('show', 'active');
        });

        // Show target pane
        const targetPane = document.querySelector(target);
        if (targetPane) {
          targetPane.classList.add('show', 'active');
          // Resize canvas setelah tab muncul
          setTimeout(() => {
            resizeCanvas(document.getElementById('pad_p5m'));
            resizeCanvas(document.getElementById('pad_chk'));
          }, 50);
        }
      });
    });

    google.script.run
      .withSuccessHandler(initMasterData)
      .withFailureHandler(function(err) {
        console.error("Gagal mengambil master data: " + err);
        Swal.fire("Error", "Gagal memuat master data: " + err, "error");
      })
      .getMasterData();
  });

  function resizeCanvas(canvas) {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d").scale(ratio, ratio);
  }

  function clearSignature(canvasId) {
    if (canvasId === 'pad_p5m') sigPadP5M.clear();
    if (canvasId === 'pad_chk') sigPadChk.clear();
  }

  function initMasterData(data) {
    if (!data) return;

    masterKaryawan = data.karyawan || [];
    masterTools = data.tools || [];
    
    const selectP5M = document.getElementById('p5m_nama');
    const selectChk = document.getElementById('chk_nama');

    selectP5M.innerHTML = '<option value="">-- Pilih Karyawan --</option>';
    selectChk.innerHTML = '<option value="">-- Pilih Karyawan --</option>';

    masterKaryawan.forEach(emp => {
      let opt1 = document.createElement('option');
      opt1.value = emp.nama;
      opt1.text = emp.nama;
      selectP5M.appendChild(opt1);

      let opt2 = document.createElement('option');
      opt2.value = emp.nama;
      opt2.text = emp.nama;
      selectChk.appendChild(opt2);
    });

    const toolsContainer = document.getElementById('container_tools_list');
    toolsContainer.innerHTML = '';

    if (masterTools.length === 0) {
      toolsContainer.innerHTML = '<span class="text-danger small p-2 d-block">Belum ada data di tabel "daftar_tools" Supabase.</span>';
      return;
    }

    masterTools.forEach((toolName, idx) => {
      const toolRow = document.createElement('div');
      toolRow.className = 'tool-row';
      toolRow.innerHTML = `
        <span class="tool-number">${String(idx + 1).padStart(2,'0')}</span>
        <span class="tool-name">${toolName}</span>
        <select class="tool-select tool-status-item" data-tool-name="${toolName}" required>
          <option value="Layak">✓ Layak</option>
          <option value="Rusak">✗ Rusak</option>
        </select>
      `;
      toolsContainer.appendChild(toolRow);
    });
  }

  function onSelectKaryawanP5M() {
    const selectedNama = document.getElementById('p5m_nama').value;
    const emp = masterKaryawan.find(e => e.nama === selectedNama);
    if (emp) {
      document.getElementById('p5m_nik').value = emp.nik;
      document.getElementById('p5m_jabatan').value = emp.jabatan;
      if (emp.jabatan && emp.jabatan.toLowerCase().includes('foreman')) {
        document.getElementById('group_materi').classList.remove('d-none');
      } else {
        document.getElementById('group_materi').classList.add('d-none');
      }
    } else {
      document.getElementById('p5m_nik').value = '';
      document.getElementById('p5m_jabatan').value = '';
      document.getElementById('group_materi').classList.add('d-none');
    }
  }

  function onSelectKaryawanChecklist() {
    const selectedNama = document.getElementById('chk_nama').value;
    const emp = masterKaryawan.find(e => e.nama === selectedNama);
    document.getElementById('chk_nik').value = emp ? emp.nik : '';
  }

  function toggleHealthNote() { checkObatAndHealthVisibility(); }
  function toggleObatNote()   { checkObatAndHealthVisibility(); }

  function checkObatAndHealthVisibility() {
    const healthVal = document.getElementById('p5m_statusKesehatan').value;
    const obatVal   = document.getElementById('p5m_isKonsumsiObat').value;
    if (healthVal === 'Kurang Fit' || obatVal === 'Ya') {
      document.getElementById('group_keluhan').classList.remove('d-none');
    } else {
      document.getElementById('group_keluhan').classList.add('d-none');
    }
  }

  document.getElementById('formP5M').addEventListener('submit', function (e) {
    e.preventDefault();
    if (sigPadP5M.isEmpty()) {
      Swal.fire("Peringatan", "Harap bubuhkan tanda tangan terlebih dahulu!", "warning");
      return;
    }
    const btn = document.getElementById('btnSubmitP5M');
    btn.disabled = true;
    btn.innerText = "Lagi menyimpan...";
    const formData = {
      tanggal: document.getElementById('p5m_tanggal').value,
      nama: document.getElementById('p5m_nama').value,
      nik: document.getElementById('p5m_nik').value,
      jabatan: document.getElementById('p5m_jabatan').value,
      materi: document.getElementById('p5m_materi').value,
      jamTidur: document.getElementById('p5m_jamTidur').value,
      statusKesehatan: document.getElementById('p5m_statusKesehatan').value,
      isKonsumsiObat: document.getElementById('p5m_isKonsumsiObat').value,
      rincianObat: document.getElementById('p5m_rincianObat').value,
      tindakanPengawas: document.getElementById('p5m_tindakanPengawas').value,
      catatan: document.getElementById('p5m_catatan').value,
      signature: sigPadP5M.toDataURL()
    };
    google.script.run.withSuccessHandler(res => {
      Swal.fire("Berhasil", res.message, "success");
      document.getElementById('formP5M').reset();
      sigPadP5M.clear();
      document.getElementById('group_keluhan').classList.add('d-none');
      document.getElementById('group_materi').classList.add('d-none');
      btn.disabled = false;
      btn.innerText = "Submit P5M";
    }).withFailureHandler(err => {
      Swal.fire('Error', 'Gagal menyimpan: ' + err, 'error');
      btn.disabled = false;
      btn.innerText = "Submit P5M";
    }).submitP5M(formData);
  });

  document.getElementById('formChecklist').addEventListener('submit', function (e) {
    e.preventDefault();
    if (sigPadChk.isEmpty()) {
      Swal.fire("Peringatan", "Harap bubuhkan tanda tangan terlebih dahulu!", "warning");
      return;
    }
    const toolSelects = document.querySelectorAll('.tool-status-item');
    const toolsStatus = [];
    toolSelects.forEach(selectEl => {
      toolsStatus.push({ nama: selectEl.getAttribute('data-tool-name'), status: selectEl.value });
    });
    const btn = document.getElementById('btnSubmitChecklist');
    btn.disabled = true;
    btn.innerText = "Lagi menyimpan...";
    const formData = {
      tanggal: document.getElementById('chk_tanggal').value,
      area: document.getElementById('chk_area').value,
      nama: document.getElementById('chk_nama').value,
      nik: document.getElementById('chk_nik').value,
      toolsStatus: toolsStatus,
      catatan: document.getElementById('chk_catatan').value,
      signature: sigPadChk.toDataURL()
    };
    google.script.run.withSuccessHandler(res => {
      Swal.fire("Berhasil", res.message, "success");
      document.getElementById('formChecklist').reset();
      sigPadChk.clear();
      btn.disabled = false;
      btn.innerText = "Submit Checklist";
    }).withFailureHandler(err => {
      Swal.fire('Error', 'Gagal menyimpan: ' + err, 'error');
      btn.disabled = false;
      btn.innerText = "Submit Checklist";
    }).submitChecklist(formData);
  });

/* ==========================================
   DATA P5M — LOAD & RENDER TABLE
   ========================================== */
async function loadDataP5M() {
  const dari    = document.getElementById('filter_dari').value;
  const sampai  = document.getElementById('filter_sampai').value;

  document.getElementById('datap5m_loading').style.display = 'flex';
  document.getElementById('datap5m_empty').style.display   = 'none';
  document.getElementById('datap5m_table_wrapper').style.display = 'none';

  let query = _supa
    .from('data_p5m')
    .select('*')
    .order('tanggal', { ascending: false })
    .order('created_at', { ascending: false });

  if (dari)   query = query.gte('tanggal', dari);
  if (sampai) query = query.lte('tanggal', sampai);

  const { data, error } = await query;

  document.getElementById('datap5m_loading').style.display = 'none';

  if (error) {
    Swal.fire('Error', 'Gagal memuat data: ' + error.message, 'error');
    return;
  }

  document.getElementById('datap5m_count').textContent = `${data.length} data`;

  if (data.length === 0) {
    document.getElementById('datap5m_empty').style.display = 'block';
    return;
  }

  document.getElementById('datap5m_table_wrapper').style.display = 'block';
  const tbody = document.getElementById('datap5m_tbody');
  tbody.innerHTML = '';

  data.forEach((row, i) => {
    const kesehatan = row.status_kesehatan || '-';
    const badgeClass = kesehatan === 'Fit' ? 'badge-fit' : 'badge-kurang-fit';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-no">${String(i + 1).padStart(2,'0')}</td>
      <td>${formatTanggal(row.tanggal)}</td>
      <td style="font-weight:500;">${row.nama || '-'}</td>
      <td style="color:var(--text-muted);font-size:0.75rem;">${row.nik || '-'}</td>
      <td>${row.jabatan || '-'}</td>
      <td style="text-align:center;">${row.jam_tidur != null ? row.jam_tidur + ' jam' : '-'}</td>
      <td><span class="${badgeClass}">${kesehatan}</span></td>
      <td style="text-align:center;">${row.konsumsi_obat || '-'}</td>
      <td>
        <button class="btn-pdf" onclick='viewP5M(${JSON.stringify(row)})'>
          <i class="bi bi-eye"></i> Lihat
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function formatTanggal(str) {
  if (!str) return '-';
  const d = new Date(str);
  return d.toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });
}

/* ==========================================
   VIEW MODAL P5M
   ========================================== */
function viewP5M(row) {
  window._previewRow = row;

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || '—';
  };

  const docNo = `P5M-${row.nik || 'XXX'}-${(row.tanggal || '').replace(/-/g,'')}`;
  set('prev_nodoc',   `No. Dokumen: ${docNo}   ·   Dibuat: ${new Date(row.created_at).toLocaleString('id-ID')}`);
  set('prev_tanggal', formatTanggal(row.tanggal));
  set('prev_nama',    row.nama);
  set('prev_nik',     row.nik);
  set('prev_jabatan', row.jabatan);
  set('prev_materi',  row.materi);
  set('prev_jamtidur', row.jam_tidur != null ? row.jam_tidur + ' Jam' : '—');
  set('prev_kesehatan', row.status_kesehatan);
  set('prev_obat',    row.konsumsi_obat);
  set('prev_rincian', row.rincian_obat);
  set('prev_tindakan', row.tindakan_pengawas);
  set('prev_catatan', row.catatan);
  set('prev_sig_nama', row.nama);
  set('prev_docid',   docNo);

  // Tanda tangan
  const sigImg   = document.getElementById('prev_signature');
  const sigEmpty = document.getElementById('prev_sig_empty');
  if (row.signature_url) {
    sigImg.src = row.signature_url;
    sigImg.style.display = 'block';
    sigEmpty.style.display = 'none';
  } else {
    sigImg.style.display = 'none';
    sigEmpty.style.display = 'block';
  }

  // Tampilkan modal
  const modal = document.getElementById('modal-p5m-preview');
  modal.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closePreview() {
  document.getElementById('modal-p5m-preview').style.display = 'none';
  document.body.style.overflow = '';
}

// Tutup modal kalau klik di luar
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-p5m-preview').addEventListener('click', function(e) {
    if (e.target === this) closePreview();
  });
});

/* ==========================================
   GENERATE PDF P5M — FORMAT A4 PREMIUM
   ========================================== */
async function downloadPDFP5M(row) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const W = 210, H = 297;
  const margin = 18;
  const colW = W - margin * 2;

  /* ---- Warna ---- */
  const DARK    = [4, 13, 11];
  const GOLD    = [201, 169, 110];
  const EMERALD = [46, 204, 142];
  const WHITE   = [255, 255, 255];
  const GRAY    = [140, 155, 150];
  const LGRAY   = [220, 230, 225];
  const BLACK   = [20, 30, 25];

  /* ---- HEADER BG ---- */
  doc.setFillColor(...DARK);
  doc.rect(0, 0, W, 38, 'F');
  // Gold line bawah header
  doc.setFillColor(...GOLD);
  doc.rect(0, 38, W, 0.8, 'F');

  /* ---- LOGO ---- */
  try {
    const logoImg = new Image();
    logoImg.src = 'logo_ptgam.png';
    await new Promise(res => { logoImg.onload = res; logoImg.onerror = res; });
    if (logoImg.complete && logoImg.naturalWidth > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = logoImg.naturalWidth;
      canvas.height = logoImg.naturalHeight;
      canvas.getContext('2d').drawImage(logoImg, 0, 0);
      const imgData = canvas.toDataURL('image/png');
      doc.addImage(imgData, 'PNG', margin, 8, 22, 22);
    }
  } catch(e) { /* skip logo jika gagal */ }

  /* ---- Company Name & Doc Title ---- */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...GOLD);
  doc.text('PT GANDA ALAM MAKMUR', 44, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...LGRAY);
  doc.text('Site Operations — Health & Safety Division', 44, 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  doc.text('LAPORAN ABSENSI P5M HARIAN', 44, 30);

  /* ---- Doc Number & Tanggal ---- */
  const docNo = `P5M-${row.nik || 'XXX'}-${(row.tanggal || '').replace(/-/g,'')}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...GRAY);
  doc.text(`No. Dokumen: ${docNo}`, W - margin, 24, { align: 'right' });
  doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID', {day:'2-digit',month:'long',year:'numeric'})}`, W - margin, 28.5, { align: 'right' });

  let y = 46;

  /* ---- SECTION: Informasi Karyawan ---- */
  const drawSection = (title, startY) => {
    doc.setFillColor(12, 28, 22);
    doc.roundedRect(margin, startY, colW, 7, 2, 2, 'F');
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.4);
    doc.line(margin + 3, startY + 3.5, margin + 6, startY + 3.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...GOLD);
    doc.text(title.toUpperCase(), margin + 9, startY + 4.8);
    return startY + 10;
  };

  const drawField = (label, value, x, yPos, w) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(label, x, yPos);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...BLACK);
    doc.text(String(value || '-'), x, yPos + 5);
    // underline
    doc.setDrawColor(...LGRAY);
    doc.setLineWidth(0.3);
    doc.line(x, yPos + 6.5, x + w, yPos + 6.5);
  };

  // Section 1 — Informasi Karyawan
  y = drawSection('Informasi Karyawan', y);
  drawField('Tanggal Kegiatan', formatTanggal(row.tanggal), margin, y, colW / 3 - 3);
  drawField('Nama Karyawan', row.nama, margin + colW/3, y, colW / 3 - 3);
  drawField('NIK', row.nik, margin + (colW/3)*2, y, colW / 3);
  y += 14;
  drawField('Jabatan / Posisi', row.jabatan, margin, y, colW / 2 - 3);
  drawField('Materi P5M', row.materi || '—', margin + colW/2, y, colW / 2);
  y += 16;

  // Section 2 — Kondisi Kesehatan
  y = drawSection('Kondisi Kesehatan', y);
  drawField('Jam Tidur Semalam', (row.jam_tidur != null ? row.jam_tidur + ' Jam' : '-'), margin, y, colW/4 - 3);
  drawField('Status Kesehatan', row.status_kesehatan, margin + colW/4, y, colW/4 - 3);
  drawField('Konsumsi Obat', row.konsumsi_obat, margin + colW/2, y, colW/4 - 3);
  drawField('Rincian Obat / Keluhan', row.rincian_obat || '—', margin + (colW/4)*3, y, colW/4);
  y += 14;
  drawField('Tindakan Pengawas', row.tindakan_pengawas || '—', margin, y, colW);
  y += 14;

  // Section 3 — Catatan
  y = drawSection('Catatan Tambahan', y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...BLACK);
  const catatanLines = doc.splitTextToSize(row.catatan || '—', colW);
  doc.text(catatanLines, margin, y);
  doc.setDrawColor(...LGRAY);
  doc.setLineWidth(0.3);
  doc.rect(margin, y - 4, colW, Math.max(14, catatanLines.length * 5));
  y += Math.max(16, catatanLines.length * 5 + 4);

  // Section 4 — Tanda Tangan Karyawan
  y = drawSection('Tanda Tangan Karyawan', y);
  const sigBoxH = 36;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, colW / 2 - 5, sigBoxH, 2, 2);

  if (row.signature_url) {
    try {
      const sigImg = new Image();
      sigImg.crossOrigin = 'anonymous';
      sigImg.src = row.signature_url;
      await new Promise(res => { sigImg.onload = res; sigImg.onerror = res; });
      if (sigImg.complete && sigImg.naturalWidth > 0) {
        const sc = document.createElement('canvas');
        sc.width = sigImg.naturalWidth; sc.height = sigImg.naturalHeight;
        sc.getContext('2d').drawImage(sigImg, 0, 0);
        doc.addImage(sc.toDataURL('image/png'), 'PNG', margin + 2, y + 2, colW/2 - 9, sigBoxH - 4, '', 'FAST');
      }
    } catch(e) {}
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...GRAY);
  doc.text('Tanda tangan karyawan', margin + 2, y + sigBoxH + 4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...BLACK);
  doc.text(row.nama || '', margin + 2, y + sigBoxH + 9);

  y += sigBoxH + 14;

  /* ======================================
     APPROVAL PENGAWAS (bottom section)
     ====================================== */
  // Garis emas pemisah
  doc.setFillColor(...GOLD);
  doc.rect(margin, y, colW, 0.6, 'F');
  y += 5;

  // Section header Approval
  doc.setFillColor(8, 22, 16);
  doc.roundedRect(margin, y, colW, 7, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...GOLD);
  doc.text('✦  PERSETUJUAN & APPROVAL PENGAWAS', margin + 4, y + 4.8);
  y += 10;

  // Approval boxes — 3 kolom: Nama, TTD, Tanggal
  const apBoxW = (colW - 10) / 3;
  const apBoxH = 38;

  const labels = ['Nama Pengawas', 'Tanda Tangan Pengawas', 'Tanggal Persetujuan'];
  const xPositions = [margin, margin + apBoxW + 5, margin + (apBoxW + 5) * 2];

  labels.forEach((lbl, idx) => {
    const bx = xPositions[idx];
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.4);
    doc.roundedRect(bx, y, apBoxW, apBoxH, 2, 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...GRAY);
    doc.text(lbl.toUpperCase(), bx + apBoxW / 2, y + 5, { align: 'center' });
    // Garis isian di dalam box
    doc.setDrawColor(...LGRAY);
    doc.setLineWidth(0.25);
    for (let li = 0; li < 3; li++) {
      doc.line(bx + 4, y + 16 + li * 7, bx + apBoxW - 4, y + 16 + li * 7);
    }
  });

  // Note bawah
  y += apBoxH + 6;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(...GRAY);
  doc.text('Dokumen ini merupakan laporan resmi keselamatan kerja PT Ganda Alam Makmur. Harap dijaga kerahasiaannya.', W / 2, y, { align: 'center' });

  // Footer line
  y += 5;
  doc.setFillColor(...DARK);
  doc.rect(0, H - 10, W, 10, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, H - 10, W, 0.5, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...GRAY);
  doc.text('PT Ganda Alam Makmur  |  Sistem Manajemen K3  |  P5M & Checklist Tools', W / 2, H - 4, { align: 'center' });
  doc.text(`Halaman 1 dari 1`, W - margin, H - 4, { align: 'right' });

  /* ---- Save PDF ---- */
  const fileName = `P5M_${(row.nama || 'Karyawan').replace(/\s+/g,'_')}_${row.tanggal || 'nodate'}.pdf`;
  doc.save(fileName);
}
