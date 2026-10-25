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

          // foto_urls sudah di-upload dari form, tinggal simpan array URL-nya
          const fotoUrlsJson = formData.fotoUrls && formData.fotoUrls.length > 0
            ? JSON.stringify(formData.fotoUrls)
            : null;

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
            signature_url:     signatureUrl,
            foto_urls:         fotoUrlsJson
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

  // ---- Utilitas: tanggal lokal (bukan UTC) ----
  function getLocalDateStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  document.addEventListener("DOMContentLoaded", function () {
    const today = getLocalDateStr();
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
        // Clear foto jika bukan foreman
        document.getElementById('p5m_foto_input').value = '';
        document.getElementById('foto_preview_grid').innerHTML = '';
      }
    } else {
      document.getElementById('p5m_nik').value = '';
      document.getElementById('p5m_jabatan').value = '';
      document.getElementById('group_materi').classList.add('d-none');
    }
  }

  /* ==========================================
     PREVIEW FOTO DOKUMENTASI
     ========================================== */
  function previewFoto(input) {
    const grid = document.getElementById('foto_preview_grid');
    grid.innerHTML = '';
    const files = Array.from(input.files).slice(0, 5);
    if (files.length === 0) return;
    grid.style.display = 'grid';

    files.forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = e => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;border-radius:8px;overflow:hidden;aspect-ratio:1;';

        const img = document.createElement('img');
        img.src = e.target.result;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';

        const del = document.createElement('button');
        del.type = 'button';
        del.innerHTML = '&times;';
        del.style.cssText = 'position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;border:none;background:rgba(220,50,50,0.85);color:#fff;font-size:0.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;';
        del.onclick = () => { wrap.remove(); if (!grid.children.length) grid.style.display = 'none'; };

        wrap.appendChild(img);
        wrap.appendChild(del);
        grid.appendChild(wrap);
      };
      reader.readAsDataURL(file);
    });

    // Update drop zone label
    document.getElementById('foto_drop_zone').querySelector('span').textContent =
      `${files.length} foto dipilih — klik untuk ganti`;
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

  document.getElementById('formP5M').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (sigPadP5M.isEmpty()) {
      Swal.fire("Peringatan", "Harap bubuhkan tanda tangan terlebih dahulu!", "warning");
      return;
    }
    const btn = document.getElementById('btnSubmitP5M');
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Menyimpan...';

    // ---- Upload foto dokumentasi (foreman) ----
    const jabatan = document.getElementById('p5m_jabatan').value;
    let fotoUrls = [];
    if (jabatan && jabatan.toLowerCase().includes('foreman')) {
      const fotoInput = document.getElementById('p5m_foto_input');
      const fotoFiles = Array.from(fotoInput.files).slice(0, 5);
      for (const file of fotoFiles) {
        try {
          const ext  = file.name.split('.').pop();
          const name = `foto_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const { error: upErr } = await _supa.storage
            .from('signatures')
            .upload(name, file, { contentType: file.type, upsert: true });
          if (!upErr) {
            const { data: urlData } = _supa.storage.from('signatures').getPublicUrl(name);
            fotoUrls.push(urlData.publicUrl);
          }
        } catch(err) { console.warn('foto upload error', err); }
      }
    }

    const formData = {
      tanggal: document.getElementById('p5m_tanggal').value,
      nama: document.getElementById('p5m_nama').value,
      nik: document.getElementById('p5m_nik').value,
      jabatan: jabatan,
      materi: document.getElementById('p5m_materi').value,
      jamTidur: document.getElementById('p5m_jamTidur').value,
      statusKesehatan: document.getElementById('p5m_statusKesehatan').value,
      isKonsumsiObat: document.getElementById('p5m_isKonsumsiObat').value,
      rincianObat: document.getElementById('p5m_rincianObat').value,
      tindakanPengawas: document.getElementById('p5m_tindakanPengawas').value,
      catatan: document.getElementById('p5m_catatan').value,
      signature: sigPadP5M.toDataURL(),
      fotoUrls: fotoUrls
    };

    google.script.run.withSuccessHandler(res => {
      Swal.fire("Berhasil", res.message, "success");
      document.getElementById('formP5M').reset();
      sigPadP5M.clear();
      document.getElementById('group_keluhan').classList.add('d-none');
      document.getElementById('group_materi').classList.add('d-none');
      document.getElementById('foto_preview_grid').innerHTML = '';
      document.getElementById('foto_drop_zone').querySelector('span').textContent = 'Klik untuk pilih foto / ambil kamera';
      // reset date
      document.getElementById('p5m_tanggal').value = getLocalDateStr();
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-send-check me-2"></i>Submit P5M';
    }).withFailureHandler(err => {
      Swal.fire('Error', 'Gagal menyimpan: ' + err, 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-send-check me-2"></i>Submit P5M';
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
   GENERATE PDF P5M — FORM ABSENSI P5M (GROUP PER TANGGAL)
   ========================================== */
async function downloadPDFP5M(row) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const W = 210, H = 297;
  const margin = 14;
  const colW = W - margin * 2;

  /* ---- Warna ---- */
  const WHITE   = [255, 255, 255];
  const BLACK   = [20, 20, 20];
  const GRAY    = [120, 120, 120];
  const GOLD    = [180, 120, 30];
  const LGRAY   = [210, 210, 210];
  const DKGREEN = [0, 80, 40];

  /* ============================================================
     AMBIL SEMUA DATA P5M PADA TANGGAL YANG SAMA
     ============================================================ */
  const { data: allRows } = await _supa
    .from('data_p5m')
    .select('*')
    .eq('tanggal', row.tanggal)
    .order('created_at', { ascending: true });

  const rows = (allRows && allRows.length > 0) ? allRows : [row];

  /* ---- Foreman & Materi ---- */
  const foremanRows  = rows.filter(r => r.jabatan && r.jabatan.toLowerCase().includes('foreman'));
  const foremanNames = [...new Set(foremanRows.map(r => r.nama).filter(Boolean))];
  const uniqueMateri = [...new Set(foremanRows.map(r => (r.materi || '').trim()).filter(Boolean))];
  const materiText   = uniqueMateri.length > 0 ? uniqueMateri.join('; ') : '-';
  const pembicara    = foremanNames.length > 0 ? foremanNames.join(', ') : '-';
  const hasForeman   = foremanNames.length > 0;

  /* ---- Pengawas (non-foreman) ---- */
  const pengawasRows = rows.filter(r => r.jabatan && !r.jabatan.toLowerCase().includes('foreman'));

  /* ---- Tanggal ---- */
  const tgl     = new Date(row.tanggal + 'T00:00:00');
  const HARI    = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const tglStr  = `${HARI[tgl.getDay()]}, ${tgl.toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'})}`;

  /* ============================================================
     HEADER
     ============================================================ */
  // Logo
  try {
    const logoImg = new Image();
    logoImg.src = 'logo_ptgam.png';
    await new Promise(res => { logoImg.onload = res; logoImg.onerror = res; });
    if (logoImg.complete && logoImg.naturalWidth > 0) {
      const cv = document.createElement('canvas');
      cv.width = logoImg.naturalWidth; cv.height = logoImg.naturalHeight;
      cv.getContext('2d').drawImage(logoImg, 0, 0);
      doc.addImage(cv.toDataURL('image/png'), 'PNG', margin, 8, 22, 22);
    }
  } catch(e) {}

  // Title box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...BLACK);
  doc.text('FORM ABSENSI PEMBICARAAN 5 MENIT', W / 2 + 10, 18, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text('PT GANDA ALAM MAKMUR', W / 2 + 10, 24, { align: 'center' });

  // Border header
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.6);
  doc.line(margin, 30, W - margin, 30);

  let y = 35;

  /* ============================================================
     INFO FIELDS (Hari/Tanggal, Waktu, Lokasi, Materi, Pembicara)
     ============================================================ */
  const infoFields = [
    { label: 'Hari/Tanggal', value: tglStr },
    { label: 'Waktu',        value: '-' },
    { label: 'Lokasi',       value: 'HO' },
    { label: 'Materi',       value: materiText },
    { label: 'Pembicara',    value: pembicara },
  ];

  const labelX = margin;
  const colonX = margin + 28;
  const valueX = colonX + 4;
  const lineH  = 6.5;

  infoFields.forEach(f => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...GOLD);
    doc.text(f.label, labelX, y);
    doc.setTextColor(...BLACK);
    doc.text(':', colonX, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...BLACK);
    const lines = doc.splitTextToSize(f.value, colW - (valueX - margin));
    doc.text(lines, valueX, y);
    y += lineH * Math.max(1, lines.length);
  });

  y += 3;

  /* ============================================================
     TABEL ABSENSI
     ============================================================ */
  // Column definitions (% of colW)
  const cols = [
    { h: 'NOMOR',             w: 0.055, a: 'center' },
    { h: 'NAMA',              w: 0.175, a: 'left'   },
    { h: 'NIK',               w: 0.105, a: 'center' },
    { h: 'JABATAN',           w: 0.115, a: 'left'   },
    { h: 'JAM\nTIDUR',        w: 0.07,  a: 'center' },
    { h: 'KETERANGAN\nSEHAT',w: 0.08,  a: 'center' },
    { h: 'KONSUMSI\nOBAT',   w: 0.085, a: 'center' },
    { h: 'TINDAKAN\nPENGAWAS',w: 0.145, a: 'left'  },
    { h: 'TTD',               w: 0.07,  a: 'center' },
  ];
  cols.forEach(c => c.pw = c.w * colW);

  const tHeadH = 11;
  const tRowH  = 8;
  const minR   = 15;
  const nRows  = Math.max(minR, rows.length);

  // Header background
  doc.setFillColor(...BLACK);
  doc.rect(margin, y, colW, tHeadH, 'F');

  // Header text
  let cx = margin;
  cols.forEach(col => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(...WHITE);
    const hLines = col.h.split('\n');
    const baseY = y + (tHeadH - hLines.length * 3.5) / 2 + 2.5;
    hLines.forEach((hl, hi) => {
      doc.text(hl, cx + col.pw / 2, baseY + hi * 3.5, { align: 'center' });
    });
    cx += col.pw;
  });

  // Vertical header separators
  cx = margin;
  cols.forEach(col => {
    doc.setDrawColor(...LGRAY);
    doc.setLineWidth(0.2);
    doc.line(cx, y, cx, y + tHeadH);
    cx += col.pw;
  });
  doc.line(cx, y, cx, y + tHeadH); // right edge

  y += tHeadH;

  // Rows
  for (let i = 0; i < nRows; i++) {
    const r  = i < rows.length ? rows[i] : null;
    const rY = y + i * tRowH;

    // Alternate fill
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 248);
      doc.rect(margin, rY, colW, tRowH, 'F');
    }

    if (r) {
      const cells = [
        String(i + 1),
        r.nama || '',
        r.nik  || '',
        r.jabatan || '',
        r.jam_tidur != null ? String(r.jam_tidur) : '',
        r.status_kesehatan || '',
        r.konsumsi_obat || '',
        r.tindakan_pengawas || '',
        '', // TTD — blank for signature
      ];
      let cellX = margin;
      cells.forEach((txt, ci) => {
        const cw = cols[ci].pw;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...BLACK);
        const tlines = doc.splitTextToSize(txt, cw - 2.5);
        const tx = cols[ci].a === 'center' ? cellX + cw / 2 : cellX + 1.5;
        doc.text(tlines[0] || '', tx, rY + tRowH / 2 + 2.2, { align: cols[ci].a });
        cellX += cw;
      });
    }

    // Row bottom line
    doc.setDrawColor(...LGRAY);
    doc.setLineWidth(0.2);
    doc.line(margin, rY + tRowH, margin + colW, rY + tRowH);
  }

  // Vertical column lines through all rows
  cx = margin;
  cols.forEach(col => {
    doc.setDrawColor(...LGRAY);
    doc.setLineWidth(0.2);
    doc.line(cx, y, cx, y + nRows * tRowH);
    cx += col.pw;
  });
  doc.line(cx, y, cx, y + nRows * tRowH);

  // Table outer border
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.5);
  doc.rect(margin, y - tHeadH, colW, tHeadH + nRows * tRowH);

  y += nRows * tRowH + 6;

  /* ============================================================
     DOKUMENTASI (hanya jika ada Foreman)
     ============================================================ */
  if (hasForeman) {
    // Kumpulkan semua foto dari baris foreman
    let allFotoUrls = [];
    foremanRows.forEach(fr => {
      if (fr.foto_urls) {
        try {
          const urls = typeof fr.foto_urls === 'string' ? JSON.parse(fr.foto_urls) : fr.foto_urls;
          if (Array.isArray(urls)) allFotoUrls = allFotoUrls.concat(urls);
        } catch(e) {}
      }
    });
    // Deduplicate
    allFotoUrls = [...new Set(allFotoUrls)].slice(0, 9);

    const nPhoto   = Math.max(allFotoUrls.length, 3); // minimum 3 slot
    const nCols    = Math.min(nPhoto, 3);
    const photoGap = 3;
    const pW       = (colW - photoGap * (nCols - 1)) / nCols;
    const pH       = 50;

    // Hitung berapa baris foto
    const nPhotoRows = Math.ceil(nPhoto / nCols);
    const dokBoxH    = nPhotoRows * (pH + photoGap) + 8;

    // Cek page overflow
    if (y + dokBoxH + 20 > H - 15) { doc.addPage(); y = 14; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...GOLD);
    doc.text('Dokumentasi', margin, y + 5);
    y += 8;

    // Outer box
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.5);
    doc.rect(margin, y, colW, dokBoxH);

    // Render tiap foto / placeholder
    for (let p = 0; p < nPhoto; p++) {
      const col = p % nCols;
      const row2 = Math.floor(p / nCols);
      const px = margin + 3 + col * (pW + photoGap);
      const py = y + 4 + row2 * (pH + photoGap);
      const url = allFotoUrls[p] || null;

      if (url) {
        try {
          const fImg = new Image();
          fImg.crossOrigin = 'anonymous';
          fImg.src = url;
          await new Promise(r => { fImg.onload = r; fImg.onerror = r; });
          if (fImg.complete && fImg.naturalWidth > 0) {
            const fc = document.createElement('canvas');
            fc.width = fImg.naturalWidth; fc.height = fImg.naturalHeight;
            fc.getContext('2d').drawImage(fImg, 0, 0);
            doc.addImage(fc.toDataURL('image/jpeg'), 'JPEG', px, py, pW, pH, '', 'FAST');
          } else {
            // fallback placeholder
            doc.setDrawColor(...LGRAY); doc.setLineWidth(0.3);
            doc.setLineDashPattern([2,2],0); doc.rect(px, py, pW, pH); doc.setLineDashPattern([],0);
            doc.setFont('helvetica','italic'); doc.setFontSize(6); doc.setTextColor(...GRAY);
            doc.text('[ Foto ]', px + pW/2, py + pH/2 + 2, { align:'center' });
          }
        } catch(e) {
          doc.setDrawColor(...LGRAY); doc.setLineWidth(0.3);
          doc.setLineDashPattern([2,2],0); doc.rect(px, py, pW, pH); doc.setLineDashPattern([],0);
          doc.setFont('helvetica','italic'); doc.setFontSize(6); doc.setTextColor(...GRAY);
          doc.text('[ Foto ]', px + pW/2, py + pH/2 + 2, { align:'center' });
        }
      } else {
        doc.setDrawColor(...LGRAY); doc.setLineWidth(0.3);
        doc.setLineDashPattern([2,2],0); doc.rect(px, py, pW, pH); doc.setLineDashPattern([],0);
        doc.setFont('helvetica','italic'); doc.setFontSize(6); doc.setTextColor(...GRAY);
        doc.text('[ Foto Dokumentasi ]', px + pW/2, py + pH/2 + 2, { align:'center' });
      }
    }
    y += dokBoxH + 6;
  }


  /* ============================================================
     APPROVAL PENGAWAS
     ============================================================ */
  if (y + 50 > H - 15) { doc.addPage(); y = 14; }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...BLACK);
  doc.text('Pengawas', margin, y + 6);
  y += 10;

  // Determine jumlah kotak approval
  const apRows   = pengawasRows.length > 0 ? pengawasRows.slice(0, 3) : [null];
  const nAp      = apRows.length;
  const apGap    = 5;
  const apW      = (colW - apGap * (nAp - 1)) / nAp;
  const apH      = 40;

  for (let ai = 0; ai < nAp; ai++) {
    const sr = apRows[ai];
    const bx = margin + ai * (apW + apGap);

    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.4);
    doc.rect(bx, y, apW, apH);

    // Signature image
    if (sr && sr.signature_url) {
      try {
        const sImg = new Image();
        sImg.crossOrigin = 'anonymous';
        sImg.src = sr.signature_url;
        await new Promise(r => { sImg.onload = r; sImg.onerror = r; });
        if (sImg.complete && sImg.naturalWidth > 0) {
          const sc = document.createElement('canvas');
          sc.width = sImg.naturalWidth; sc.height = sImg.naturalHeight;
          sc.getContext('2d').drawImage(sImg, 0, 0);
          doc.addImage(sc.toDataURL('image/png'), 'PNG', bx + 2, y + 4, apW - 4, apH - 16, '', 'FAST');
        }
      } catch(e) {}
    }

    // Name line at bottom of box
    doc.setDrawColor(...LGRAY);
    doc.setLineWidth(0.2);
    doc.line(bx + 4, y + apH - 10, bx + apW - 4, y + apH - 10);

    doc.setFont('helvetica', sr && sr.nama ? 'bold' : 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...BLACK);
    doc.text(sr && sr.nama ? sr.nama : '(Nama Pengawas)', bx + apW / 2, y + apH - 5, { align: 'center' });
  }

  y += apH + 10;

  /* ============================================================
     FOOTER
     ============================================================ */
  doc.setFillColor(...BLACK);
  doc.rect(0, H - 10, W, 10, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(180, 180, 180);
  doc.text('PT Ganda Alam Makmur  |  Sistem Manajemen K3  |  Form Absensi P5M', W / 2, H - 4, { align: 'center' });
  doc.text('Halaman 1 dari 1', W - margin, H - 4, { align: 'right' });

  /* ---- Save ---- */
  doc.save(`P5M_Absensi_${row.tanggal || 'nodate'}.pdf`);
}

