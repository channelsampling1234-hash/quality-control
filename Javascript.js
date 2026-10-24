<script>
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
    // pad_chk ada di tab tersembunyi (offsetWidth=0), skip resize awal

    document.querySelectorAll('button[data-bs-toggle="pill"]').forEach(tabBtn => {
      tabBtn.addEventListener('shown.bs.tab', function () {
        // Simpan data TTD sebelum resize (resize menghapus canvas)
        const p5mData = sigPadP5M.toData();
        const chkData = sigPadChk.toData();
        resizeCanvas(document.getElementById('pad_p5m'));
        resizeCanvas(document.getElementById('pad_chk'));
        if (p5mData && p5mData.length > 0) sigPadP5M.fromData(p5mData);
        if (chkData && chkData.length > 0) sigPadChk.fromData(chkData);
      });
    });

    google.script.run
      .withSuccessHandler(initMasterData)
      .withFailureHandler(function(err) {
        console.error("Gagal mengambil master data: " + err);
        Swal.fire("Error", "Gagal memuat master data!", "error");
      })
      .getMasterData();
  });

  function resizeCanvas(canvas) {
    if (!canvas || canvas.offsetWidth === 0) return;
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
      toolsContainer.innerHTML = '<span class="text-danger small p-2 d-block">Belum ada data di sheet "Daftar_tools". Silakan tambahkan data alat terlebih dahulu.</span>';
      return;
    }

    masterTools.forEach((toolName, idx) => {
      const toolRow = document.createElement('div');
      toolRow.className = 'mb-2 p-2 rounded border d-flex justify-content-between align-items-center shadow-sm';
      toolRow.style.backgroundColor = 'rgba(11, 43, 38, 0.6)';
      toolRow.style.borderColor = '#235347';
      toolRow.innerHTML = `
        <span class="fw-semibold text-light small me-2">${idx + 1}. ${toolName}</span>
        <select class="form-select form-select-sm tool-status-item form-control-dark" data-tool-name="${toolName}" style="width: 120px;" required>
          <option value="Layak" style="background-color: #0b2b26; color: #fff;">Layak</option>
          <option value="Rusak" style="background-color: #0b2b26; color: #fff;">Rusak</option>
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
    if (emp) {
      document.getElementById('chk_nik').value = emp.nik;
    } else {
      document.getElementById('chk_nik').value = '';
    }
  }

  function toggleHealthNote() {
    checkObatAndHealthVisibility();
  }

  function toggleObatNote() {
    checkObatAndHealthVisibility();
  }

  function checkObatAndHealthVisibility() {
    const healthVal = document.getElementById('p5m_statusKesehatan').value;
    const obatVal = document.getElementById('p5m_isKonsumsiObat').value;

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
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Menyimpan...';

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
      Swal.fire({ icon: 'success', title: 'Berhasil! ✅', text: res.message, timer: 2500, showConfirmButton: false });
      document.getElementById('formP5M').reset();
      sigPadP5M.clear();
      document.getElementById('group_keluhan').classList.add('d-none');
      document.getElementById('group_materi').classList.add('d-none');
      btn.disabled = false;
      btn.innerText = "Submit P5M";
    }).withFailureHandler(err => {
      Swal.fire('Error', 'Gagal menyimpan data P5M. Silakan coba lagi.\n\nDetail: ' + err, 'error');
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
      toolsStatus.push({
        nama: selectEl.getAttribute('data-tool-name'),
        status: selectEl.value
      });
    });

    const btn = document.getElementById('btnSubmitChecklist');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Menyimpan...';

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
      Swal.fire({ icon: 'success', title: 'Berhasil! ✅', text: res.message, timer: 2500, showConfirmButton: false });
      document.getElementById('formChecklist').reset();
      document.getElementById('chk_nik').value = ''; // Explicit clear readonly field
      sigPadChk.clear();
      btn.disabled = false;
      btn.innerText = 'Submit Checklist';
    }).withFailureHandler(err => {
      Swal.fire('Error', 'Gagal menyimpan data Checklist. Silakan coba lagi.\n\nDetail: ' + err, 'error');
      btn.disabled = false;
      btn.innerText = 'Submit Checklist';
    }).submitChecklist(formData);
  });

</script>