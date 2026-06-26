/**
 * OmniSeller — Supabase Realtime Database Sync Engine
 * Menghubungkan UI Dashboard langsung ke Database PostgreSQL Supabase Anda
 */

// 1. Validasi & Inisialisasi Supabase Client
if (typeof supabase === 'undefined') {
    console.error("Supabase CDN Library belum dimuat! Pastikan script CDN terpasang di <head>.");
}

// Inisialisasi variabel global untuk menyimpan state data jika diperlukan
let localDatabaseState = {
    penjualan: [],
    stok: [],
    kategori: [],
    pengaturan: {}
};

/**
 * ===== CORE READ LOGIC (FETCH DATA FROM SUPABASE) =====
 */

// A. Fetch Semua Kategori
async function fetchKategoriFromSupabase() {
    showTableLoading('tbl-kat');
    const { data, error } = await supabase
        .from('kategori')
        .select('*')
        .order('nama', { ascending: true });

    if (error) {
        showToast("Gagal mengambil data kategori: " + error.message, "danger");
        return [];
    }
    
    localDatabaseState.kategori = data;
    renderKategoriUI(data);
    updateKategoriDropdowns(data);
    return data;
}

// B. Fetch Data Stok & Produk
async function fetchStokFromSupabase() {
    showTableLoading('tbl-stok');
    const { data, error } = await supabase
        .from('stok')
        .select('*, kategori(nama, warna)')
        .order('stok', { ascending: true }); // Mengurutkan yang paling menipis

    if (error) {
        showToast("Gagal mengambil data stok: " + error.message, "danger");
        return [];
    }

    localDatabaseState.stok = data;
    renderStokUI(data);
    return data;
}

// C. Fetch Data Penjualan / Pesanan (Dengan Filter Tanggal jika ada)
async function fetchPenjualanFromSupabase() {
    showTableLoading('tbl-jual');
    const { data, error } = await supabase
        .from('penjualan')
        .select('*, kategori(nama)')
        .order('tanggal', { ascending: false });

    if (error) {
        showToast("Gagal mengambil data transaksi: " + error.message, "danger");
        return [];
    }

    localDatabaseState.penjualan = data;
    renderPenjualanUI(data);
    hitungUlangMataUangDashboard(data); // Update Ringkasan Omzet, Margin, Laba Bersih di Atas UI
    return data;
}

/**
 * ===== CORE CREATE/UPDATE/DELETE LOGIC (WRITE ACTIONS) =====
 */

// A. Aksi Tambah Pesanan Baru ke Supabase
async function handleTambahPesanan(event) {
    event.preventDefault();
    setButtonLoading('btn-save-jual', true);

    const payload = {
        no_pesanan: document.getElementById('input-no-pesanan').value,
        marketplace: document.getElementById('input-marketplace').value,
        produk: document.getElementById('input-produk').value,
        varian: document.getElementById('input-varian').value || null,
        kategori_id: document.getElementById('select-kategori-jual').value || null,
        qty: parseInt(document.getElementById('input-qty').value) || 1,
        total: parseFloat(document.getElementById('input-total-omzet').value) || 0,
        hpp: parseFloat(document.getElementById('input-hpp').value) || 0,
        biaya_admin: parseFloat(document.getElementById('input-biaya-admin').value) || 0,
        biaya_lain: parseFloat(document.getElementById('input-biaya-lain').value) || 0,
        status: document.getElementById('input-status-jual').value || 'Selesai'
    };

    const { data, error } = await supabase
        .from('penjualan')
        .insert([payload])
        .select();

    setButtonLoading('btn-save-jual', false);

    if (error) {
        showToast("Gagal menyimpan transaksi: " + error.message, "danger");
    } else {
        showToast("Pesanan Baru Berhasil Disinkronkan ke Supabase!", "success");
        closeModal('modal-tambah-jual');
        document.getElementById('form-tambah-jual').reset();
        
        // Refresh & Sync Realtime
        await fetchPenjualanFromSupabase();
        // Kurangi stok otomatis berdasarkan SKU/Produk jika diperlukan logic lanjutannya
    }
}

// B. Aksi Tambah Stok / Produk Baru ke Supabase
async function handleTambahStok(event) {
    event.preventDefault();
    setButtonLoading('btn-save-stok', true);

    const payload = {
        sku: document.getElementById('input-sku').value,
        produk: document.getElementById('input-produk-stok').value,
        varian: document.getElementById('input-varian-stok').value || null,
        kategori_id: document.getElementById('select-kategori-stok').value || null,
        stok: parseInt(document.getElementById('input-jumlah-stok').value) || 0,
        status: parseInt(document.getElementById('input-jumlah-stok').value) > 10 ? 'Aman' : 'Menipis'
    };

    const { data, error } = await supabase
        .from('stok')
        .insert([payload]);

    setButtonLoading('btn-save-stok', false);

    if (error) {
        showToast("Gagal menyimpan produk: " + error.message, "danger");
    } else {
        showToast("Data Stok Berhasil Ditambahkan ke Supabase!", "success");
        closeModal('modal-tambah-stok');
        document.getElementById('form-tambah-stok').reset();
        await fetchStokFromSupabase();
    }
}

// C. Aksi Hapus Transaksi (Delete)
async function handleHapusPenjualan(id) {
    if(!confirm("Apakah Anda yakin ingin menghapus transaksi ini dari database Supabase?")) return;

    const { error } = await supabase
        .from('penjualan')
        .delete()
        .eq('id', id);

    if (error) {
        showToast("Gagal menghapus data: " + error.message, "danger");
    } else {
        showToast("Transaksi Berhasil Dihapus!", "success");
        await fetchPenjualanFromSupabase();
    }
}

/**
 * ===== HELPER FUNCTIONS (INTEGRASI KE UI SEBELUMNYA) =====
 */
function showTableLoading(tableId) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    if(tbody) {
        tbody.innerHTML = `<tr><td colspan="10"><div class="skeleton-loading"></div></td></tr>`;
    }
}

function setButtonLoading(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        btn.dataset.oldText = btn.innerHTML;
        btn.innerHTML = '⚡ Menyimpan ke Supabase...';
    } else {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.oldText || 'Simpan';
    }
}

function showToast(message, type = "success") {
    alert(`[${type.toUpperCase()}] ${message}`); 
    // Anda bisa menggantinya dengan custom UI toast bawaan OmniSeller Anda
}

// Inisialisasi awal sinkronisasi data saat halaman dimuat
async function initOmniSellerSupabaseSync() {
    console.log("Menginisialisasi Jaringan Sinkronisasi Supabase...");
    await fetchKategoriFromSupabase();
    await fetchStokFromSupabase();
    await fetchPenjualanFromSupabase();
}