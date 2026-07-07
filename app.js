// ===== DATA =====
let MP_LIST=['Shopee','Tokopedia','TikTok Shop','Lazada'];
let MP_COLORS={'Shopee':'#ee4d2d','Tokopedia':'#00aa5b','TikTok Shop':'#444','Lazada':'#1a0dab'};
const DEFAULT_MP=[{nama:'Shopee',color:'#ee4d2d'},{nama:'Tokopedia',color:'#00aa5b'},{nama:'TikTok Shop',color:'#444444'},{nama:'Lazada',color:'#1a0dab'}];
const MP_COLOR_CHOICES=['#ee4d2d','#00aa5b','#444444','#1a0dab','#4f3de8','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#10b981'];
const KAT_COLORS=['#4f3de8','#ee4d2d','#00aa5b','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#10b981','#f97316','#6366f1'];
const PRODUK=['Kaos Polos','Celana Cargo','Hoodie','Kemeja Flannel','Jaket Denim','Topi Baseball','Kaos Oversize','Celana Chino','Dress Casual','Rok Mini'];
const VARIAN=['Hitam S','Hitam M','Hitam L','Hitam XL','Putih S','Putih M','Putih L','Navy M','Navy L','Navy XL','Abu S','Abu M','Cream S','Cream M','Merah M'];
const STATUS_ARR=['Selesai','Selesai','Selesai','Selesai','Diproses','Dikirim','Dibatalkan'];
const DEFAULT_KAT=[{nama:'Atasan',color:'#4f3de8'},{nama:'Bawahan',color:'#ee4d2d'},{nama:'Outer',color:'#00aa5b'},{nama:'Aksesoris',color:'#f59e0b'},{nama:'Lainnya',color:'#888'}];
const DEFAULT_BIAYA={mp_fee:{Shopee:3.5,Tokopedia:2.5,'TikTok Shop':1.8,Lazada:4.0},extra:{ongkir:3000,packaging:1500,lain:500},hpp_mode:'pct',hpp_pct:45,hpp_per_produk:{}};

let DB={penjualan:[],stok:[],kategori:[...DEFAULT_KAT],marketplace:JSON.parse(JSON.stringify(DEFAULT_MP)),biaya:JSON.parse(JSON.stringify(DEFAULT_BIAYA)),pengaturan:{nama:'Toko Saya',pemilik:'',hp:'',batasStok:10,logo:''},pembelian:[],penggajian:[],lastUpdate:null};
let _editJualIdx=-1,_editStokIdx=-1,_editKatIdx=-1,_restockIdx=-1,_editMpIdx=-1,_editPembelianIdx=-1,_editPenggajianIdx=-1;
let filteredJual=[],filteredStok=[],_labaData=[],_labaFiltered=[],filteredPembelian=[],filteredPenggajian=[];
let pageJual=1,pageStok=1,pageLaba=1,pagePembelian=1,pagePenggajian=1;
let _invTab='pembelian';
const PER_PAGE=20;
let charts={};

// ===== MODE CETAK: pastikan SEMUA chart Chart.js ikut tampil penuh saat print =====
// Chart.js (responsive:true) hanya resize otomatis lewat ResizeObserver saat
// ukuran kontainer berubah di LAYAR. Perubahan layout dari @media print
// (grid 2 kolom -> 1 kolom, tinggi .chart-box berubah) tidak memicu event
// itu, sehingga tanpa perbaikan ini chart akan tampil terpotong/blank/kosong
// di hasil cetak/PDF walau kartunya sendiri tetap muncul. `beforeprint`
// dipakai untuk memaksa semua chart menyesuaikan ukuran barunya SEBELUM
// browser merender halaman cetak, dan `afterprint` mengembalikannya ke
// ukuran layar semula setelah selesai.
function resizeAllCharts(){Object.values(charts).forEach(c=>{if(c&&typeof c.resize==='function'){try{c.resize()}catch(e){}}})}
window.addEventListener('beforeprint',function(){resizeAllCharts();setTimeout(resizeAllCharts,50)});
window.addEventListener('afterprint',function(){setTimeout(resizeAllCharts,50)});

let _selectedKatColor=KAT_COLORS[0];
let _selectedMpColor=MP_COLOR_CHOICES[0];

// ===== MULTI-ITEM PESANAN (helper) =====
// Struktur 1 pesanan (DB.penjualan[i]):
//   {no, tanggal, _date, mp, status, biayaAdmin, biayaTambahan, total, items:[{prod,varian,kat,qty,harga,subtotal}]}
// `total` disimpan juga di level pesanan (denormalized = jumlah subtotal semua item)
// supaya kode lama yang membaca "total pesanan" langsung (dashboard, tabel, grafik
// per marketplace) tidak perlu diubah satu per satu.
function hitungTotalItems(items){return (items||[]).reduce((a,it)=>a+(Number(it.subtotal)||0),0)}
function hitungQtyItems(items){return (items||[]).reduce((a,it)=>a+(Number(it.qty)||0),0)}
function recalcOrderTotal(r){r.total=hitungTotalItems(r.items);return r.total}
// Ringkasan nama produk untuk ditampilkan di 1 baris tabel pesanan
function ringkasProdukPesanan(r){
  const items=r.items||[];
  if(!items.length)return '–';
  const nama=items[0].prod+(items[0].varian?' · '+items[0].varian:'');
  return items.length>1?nama+' <span style="color:var(--text3);font-weight:500">+'+(items.length-1)+' lainnya</span>':nama;
}
// Ubah semua pesanan (level header+item) menjadi daftar "baris datar": 1 baris per
// item, dipakai untuk semua laporan/laba/grafik yang menghitung per produk/kategori.
// Biaya admin & biaya tambahan (yang diisi di level PESANAN, bukan per barang)
// dialokasikan proporsional ke tiap item sesuai porsi subtotal-nya terhadap total
// pesanan, supaya penjumlahan laba per produk tetap akurat dan tidak dobel-hitung.
function flattenPenjualan(list){
  const out=[];
  (list||DB.penjualan).forEach(r=>{
    const items=r.items||[];
    const orderTotal=r.total!=null?r.total:hitungTotalItems(items);
    items.forEach(it=>{
      const share=orderTotal>0?(Number(it.subtotal)||0)/orderTotal:(items.length?1/items.length:0);
      out.push({
        no:r.no,tanggal:r.tanggal,_date:r._date,mp:r.mp,status:r.status,
        prod:it.prod,varian:it.varian||'',kat:it.kat||'Lainnya',qty:it.qty||1,
        total:Number(it.subtotal)||0,
        hpp:it.hpp!=null?it.hpp:null,
        biayaAdmin:r.biayaAdmin!=null?r.biayaAdmin*share:null,
        biayaTambahan:r.biayaTambahan!=null?r.biayaTambahan*share:null,
        _order:r
      });
    });
  });
  return out;
}
// Total laba 1 pesanan (jumlah laba semua item di dalamnya)
function hitungLabaOrder(r){
  const flat=flattenPenjualan([r]);
  let laba=0;flat.forEach(f=>laba+=hitungLaba(f).laba);
  return laba;
}

let _currentAdminUser=null;

// ===== MARKETPLACE (dinamis) =====
function refreshMpGlobals(){
  if(!DB.marketplace||!DB.marketplace.length)DB.marketplace=JSON.parse(JSON.stringify(DEFAULT_MP));
  MP_LIST=DB.marketplace.map(m=>m.nama);
  MP_COLORS={};DB.marketplace.forEach(m=>MP_COLORS[m.nama]=m.color);
}
function getMpColor(nama){return MP_COLORS[nama]||'#888'}
function mpTagStyle(nama){const c=getMpColor(nama);return `background:${c}22;color:${c}`}

// ===== UTILS =====
function rnd(a,b){return Math.floor(Math.random()*(b-a+1))+a}
function fmtRp(n){const v=Number(n);return 'Rp '+(isFinite(v)?Math.round(v):0).toLocaleString('id-ID')}
function fmtTgl(d){return d.toLocaleDateString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric'})}
// Format tanggal update jadi "waktu relatif" (mis. "5 menit lalu", "3 hari
// lalu") supaya sekilas kelihatan mana SKU yang datanya sudah lama tidak
// diperbarui — dipakai di kolom "Update Terakhir" menu Stok & Gudang.
function fmtWaktuRelatif(iso){
  if(!iso)return'–';
  const d=new Date(iso);if(isNaN(d))return'–';
  const detik=Math.floor((Date.now()-d.getTime())/1000);
  if(detik<60)return'Baru saja';
  const menit=Math.floor(detik/60);if(menit<60)return menit+' menit lalu';
  const jam=Math.floor(menit/60);if(jam<24)return jam+' jam lalu';
  const hari=Math.floor(jam/24);if(hari<30)return hari+' hari lalu';
  return fmtTgl(d);
}
function today(){return new Date().toISOString().split('T')[0]}
function getKatNames(){return DB.kategori.map(k=>k.nama)}
function getKatColor(nama){const k=DB.kategori.find(k=>k.nama===nama);return k?k.color:'#888'}

// ===== STORAGE =====
function saveDB(tables){
  DB.lastUpdate=new Date().toISOString();
  localStorage.setItem('omniseller_v2',JSON.stringify(DB));
  syncToSupabase(tables);
}
function loadDB(){const r=localStorage.getItem('omniseller_v2');if(r){DB=JSON.parse(r);if(DB.penjualan)DB.penjualan=migrasiPenjualanLama(DB.penjualan);return true}return false}

// ===== SUPABASE SYNC (skema relasional - 7 tabel, SELEKTIF) =====
// `tables`: array nama tabel logis yang berubah, mis. ['penjualan','stok'].
// Jika tidak diisi (undefined), semua tabel disinkronkan (dipakai untuk
// operasi besar seperti restore backup / reset data).
const SYNC_FN={
  kategori:syncKategori_, marketplace:syncMarketplace_, stok:syncStok_,
  penjualan:syncPenjualan_, biaya:syncBiayaPengaturan_, hpp_produk:syncHppProduk_,
  pengaturan:syncPengaturanToko_, pembelian:syncPembelian_, penggajian:syncPenggajian_
};
let _syncTimeout=null;
let _pendingTables=new Set();
function syncToSupabase(tables){
  if(!tables){Object.keys(SYNC_FN).forEach(t=>_pendingTables.add(t))}
  else{tables.forEach(t=>_pendingTables.add(t))}
  clearTimeout(_syncTimeout);
  _syncTimeout=setTimeout(async()=>{
    const todo=[..._pendingTables];_pendingTables.clear();
    try{
      await Promise.all(todo.map(t=>SYNC_FN[t]&&SYNC_FN[t]()));
      updateSyncBadge(true);
    }catch(e){
      console.warn('Supabase sync error:',e);
      updateSyncBadge(false,e.message);
      // Data lokal (localStorage) tetap aman (lihat catatan di safeReplace()),
      // tapi user perlu tahu perubahan terakhir BELUM tersimpan ke server,
      // supaya tidak menutup browser dalam keadaan itu.
      alert('⚠️ Gagal menyimpan perubahan ke server (Supabase).\n\nData Anda masih aman tersimpan di browser ini, tapi BELUM tersinkron ke cloud. Penyebab umum: ada No. Pesanan / SKU yang sama dipakai dua kali.\n\nDetail: '+e.message+'\n\nPerbaiki data yang bentrok lalu coba simpan lagi.');
    }
  },700);
}

// Strategi (DIPERBAIKI): dulu "hapus semua baris lalu insert ulang" (fullReplace).
// Bahaya: jika insert gagal (mis. ada 2 baris lokal dengan nilai kolom unik yang
// SAMA -> melanggar constraint UNIQUE di database), baris yang sudah kadung
// dihapus di langkah pertama TIDAK bisa kembali -> tabel di Supabase jadi KOSONG
// walau data lokal masih lengkap. Saat aplikasi dibuka lagi / login di device lain,
// data kosong dari Supabase ini menimpa localStorage -> data hilang permanen.
//
// Strategi baru "safeReplace": UPSERT dulu (insert baris baru / update baris yang
// sudah ada, berdasarkan kolom unik), baru SETELAH itu berhasil, hapus baris di
// server yang sudah tidak ada lagi di data lokal (mis. karena dihapus user).
// Dengan urutan ini, kalau ada error di langkah upsert (misal duplikat), proses
// berhenti SEBELUM ada apa pun yang terhapus -> data di server tetap aman.
async function safeReplace(table,rows,uniqueCol){
  if(!rows.length){ // memang sengaja dikosongkan semua oleh user
    const{error}=await supabaseClient.from(table).delete().gte('id',0);
    if(error)throw error; return;
  }
  const{error:upErr}=await supabaseClient.from(table).upsert(rows,{onConflict:uniqueCol});
  if(upErr)throw upErr;
  const{data:existing,error:selErr}=await supabaseClient.from(table).select(uniqueCol);
  if(selErr)throw selErr;
  const localSet=new Set(rows.map(r=>r[uniqueCol]));
  const toDelete=(existing||[]).map(r=>r[uniqueCol]).filter(v=>!localSet.has(v));
  if(toDelete.length){
    const{error:delErr}=await supabaseClient.from(table).delete().in(uniqueCol,toDelete);
    if(delErr)throw delErr;
  }
}
async function syncKategori_(){
  await safeReplace(TBL_KATEGORI, DB.kategori.map(k=>({nama:k.nama,color:k.color})), 'nama');
}
async function syncMarketplace_(){
  await safeReplace(TBL_MARKETPLACE, DB.marketplace.map(m=>{
    const fee=DB.biaya&&DB.biaya.mp_fee?DB.biaya.mp_fee[m.nama]:null;
    return{nama:m.nama,color:m.color,fee_persen:fee!=null?fee:3};
  }), 'nama');
}
async function syncStok_(){
  await safeReplace(TBL_STOK, DB.stok.map(s=>{
    return{sku:s.sku,produk:s.prod,varian:s.varian||'',kategori:s.kat||'Lainnya',stok:s.stok!=null?s.stok:0,terjual:s.terjual!=null?s.terjual:0,hpp:s.hpp!=null?s.hpp:0,updated_at:s.updatedAt||new Date().toISOString()};
  }), 'sku');
}
// Sinkron pesanan (skema BARU multi-item): header ke tabel `pesanan`,
// detail barang ke tabel `pesanan_item`. Tabel `penjualan` lama TIDAK lagi
// ditulis di sini (skemanya cuma 1 barang per baris, tidak cukup untuk
// pesanan dengan banyak barang).
async function syncPenjualan_(){
  const headerRows=DB.penjualan.map(r=>({
    no_pesanan:r.no,tanggal:r.tanggal,tgl_iso:r._date||new Date().toISOString(),
    marketplace:r.mp,status:r.status||'Selesai',
    biaya_admin:r.biayaAdmin!=null?r.biayaAdmin:null,
    biaya_tambahan:r.biayaTambahan!=null?r.biayaTambahan:null
  }));
  // 1) Upsert semua header pesanan dulu (aman: unique key no_pesanan, sama
  //    pola safeReplace seperti tabel lain -> tidak akan menghapus data
  //    server sebelum upsert baru benar-benar berhasil).
  await safeReplace(TBL_PESANAN, headerRows, 'no_pesanan');
  if(!DB.penjualan.length)return; // tidak ada pesanan sama sekali -> selesai (safeReplace sudah kosongkan tabel)

  // 2) Ambil id pesanan dari server (hasil upsert) untuk dipetakan ke no_pesanan,
  //    supaya baris pesanan_item tahu harus terhubung ke pesanan_id yang mana.
  const{data:idMap,error:idErr}=await supabaseClient.from(TBL_PESANAN).select('id,no_pesanan');
  if(idErr)throw idErr;
  const idByNo={};(idMap||[]).forEach(r=>{idByNo[r.no_pesanan]=r.id});

  // 3) Susun semua baris item lokal dengan pesanan_id yang sudah dipetakan.
  const itemRows=[];
  DB.penjualan.forEach(r=>{
    const pid=idByNo[r.no];
    if(pid==null)return; // seharusnya tidak terjadi kalau langkah 1 berhasil
    (r.items||[]).forEach(it=>{
      itemRows.push({
        pesanan_id:pid,produk:it.prod,varian:it.varian||'',kategori:it.kat||'Lainnya',
        qty:it.qty!=null?it.qty:1,harga_satuan:it.harga!=null?it.harga:0,
        subtotal:it.subtotal!=null?it.subtotal:(it.qty||1)*(it.harga||0),
        hpp_saat_transaksi:it.hpp!=null?it.hpp:null
      });
    });
  });
  // 4) Ganti seluruh baris item HANYA untuk pesanan-pesanan yang ada di data lokal
  //    saat ini (hapus dulu baris lama milik pesanan_id tersebut, lalu insert ulang
  //    baris barunya). Ini AMAN dari bug lama: tabel `pesanan_item` tidak punya
  //    kolom UNIQUE apa pun di data bisnisnya (hanya id auto-increment), jadi insert
  //    di sini tidak mungkin gagal karena bentrok data duplikat seperti kasus
  //    No. Pesanan dulu -- beda akar masalah dari bug yang sudah diperbaiki sebelumnya.
  const pesananIds=Object.values(idByNo);
  if(pesananIds.length){
    const{error:delErr}=await supabaseClient.from(TBL_PESANAN_ITEM).delete().in('pesanan_id',pesananIds);
    if(delErr)throw delErr;
  }
  if(itemRows.length){
    const{error:insErr}=await supabaseClient.from(TBL_PESANAN_ITEM).insert(itemRows);
    if(insErr)throw insErr;
  }
}
async function syncBiayaPengaturan_(){
  const b=DB.biaya||{};const ex=b.extra||{};
  const{error}=await supabaseClient.from(TBL_BIAYA).upsert({
    id:1,
    ongkir:ex.ongkir!=null?ex.ongkir:0,
    packaging:ex.packaging!=null?ex.packaging:0,
    lain:ex.lain!=null?ex.lain:0,
    hpp_mode:b.hpp_mode||'pct',
    hpp_pct:b.hpp_pct!=null?b.hpp_pct:45,
    updated_at:new Date().toISOString()
  });
  if(error)throw error;
}
async function syncHppProduk_(){
  const hpp=DB.biaya&&DB.biaya.hpp_per_produk||{};
  const rows=Object.keys(hpp).map(p=>({produk:p,hpp:hpp[p]}));
  const{error:delErr}=await supabaseClient.from(TBL_HPP_PRODUK).delete().neq('produk','__never__');
  if(delErr)throw delErr;
  if(rows.length){const{error:insErr}=await supabaseClient.from(TBL_HPP_PRODUK).insert(rows);if(insErr)throw insErr}
}
async function syncPengaturanToko_(){
  const p=DB.pengaturan||{};
  const{error}=await supabaseClient.from(TBL_PENGATURAN).upsert({
    id:1,
    nama_toko:p.nama||'Toko Saya',
    pemilik:p.pemilik||'',
    hp:p.hp||'',
    batas_stok:p.batasStok!=null?p.batasStok:10,
    logo:p.logo||'',
    updated_at:new Date().toISOString()
  });
  if(error)throw error;
}
// ===== INVENTORY: PEMBELIAN & PENGGAJIAN =====
// Kedua tabel ini tidak punya kolom "alami" yang unik dari sisi bisnis
// (beda dgn no_pesanan/SKU), jadi tiap baris diberi `kode` unik otomatis
// saat dibuat (lihat bukaModalTambahPembelian/Penggajian) supaya safeReplace()
// bisa upsert dengan aman seperti tabel lain.
async function syncPembelian_(){
  await safeReplace(TBL_PEMBELIAN, DB.pembelian.map(r=>({
    kode:r.kode,tanggal:r.tanggal,tgl_iso:r._date||new Date().toISOString(),
    supplier:r.supplier||'',item:r.item||'',qty:r.qty!=null?r.qty:1,satuan:r.satuan||'pcs',
    harga_satuan:r.hargaSatuan!=null?r.hargaSatuan:0,total:r.total!=null?r.total:0,catatan:r.catatan||''
  })), 'kode');
}
async function syncPenggajian_(){
  await safeReplace(TBL_PENGGAJIAN, DB.penggajian.map(r=>({
    kode:r.kode,tanggal:r.tanggal,tgl_iso:r._date||new Date().toISOString(),
    nama_karyawan:r.namaKaryawan||'',jabatan:r.jabatan||'',periode:r.periode||'',
    nominal:r.nominal!=null?r.nominal:0,catatan:r.catatan||''
  })), 'kode');
}

// Ambil semua data dari tabel relasional & susun ulang jadi struktur DB di memori
async function loadFromSupabase(){
  try{
    const[katRes,mpRes,stokRes,pesananRes,itemRes,biayaRes,hppRes,setRes,pembelianRes,penggajianRes,usersRes]=await Promise.all([
      supabaseClient.from(TBL_KATEGORI).select('*').order('id'),
      supabaseClient.from(TBL_MARKETPLACE).select('*').order('id'),
      supabaseClient.from(TBL_STOK).select('*').order('id'),
      supabaseClient.from(TBL_PESANAN).select('*').order('id'),
      supabaseClient.from(TBL_PESANAN_ITEM).select('*').order('id'),
      supabaseClient.from(TBL_BIAYA).select('*').eq('id',1).maybeSingle(),
      supabaseClient.from(TBL_HPP_PRODUK).select('*'),
      supabaseClient.from(TBL_PENGATURAN).select('*').eq('id',1).maybeSingle(),
      supabaseClient.from(TBL_PEMBELIAN).select('*').order('id'),
      supabaseClient.from(TBL_PENGGAJIAN).select('*').order('id'),
      supabaseClient.from('admin_users').select('id,nama,email'),
    ]);
    const errs=[katRes,mpRes,stokRes,pesananRes,itemRes,biayaRes,hppRes,setRes,pembelianRes,penggajianRes].map(r=>r.error).filter(Boolean);
    if(errs.length){console.warn('Gagal memuat dari Supabase:',errs[0].message);updateSyncBadge(false,errs[0].message);return null}

    // Peta user_id -> nama (fallback email), dipakai untuk menampilkan siapa
    // yang PERTAMA kali menginput tiap pesanan (kolom "Diinput oleh" di
    // Laporan Penjualan). Kalau gagal diambil (mis. tidak ada akses), biarkan
    // kosong saja — tidak menggagalkan pemuatan data lain.
    const usersMap={};
    (usersRes&&usersRes.data||[]).forEach(u=>{usersMap[u.id]=u.nama&&u.nama.trim()?u.nama:u.email});

    const kategori=(katRes.data||[]).map(k=>({nama:k.nama,color:k.color}));
    const marketplace=(mpRes.data||[]).map(m=>({nama:m.nama,color:m.color}));
    const stok=(stokRes.data||[]).map(s=>({sku:s.sku,prod:s.produk,varian:s.varian,kat:s.kategori,stok:s.stok,terjual:s.terjual,hpp:Number(s.hpp)||0,created_at:s.created_at||null,updatedAt:s.updated_at||s.created_at||null}));

    // Kelompokkan baris pesanan_item berdasarkan pesanan_id, lalu gabungkan
    // dengan header masing-masing dari tabel `pesanan` -> jadi 1 pesanan (bisa
    // berisi banyak barang) per elemen array `penjualan`.
    const itemsByPesanan={};
    (itemRes.data||[]).forEach(it=>{
      if(!itemsByPesanan[it.pesanan_id])itemsByPesanan[it.pesanan_id]=[];
      itemsByPesanan[it.pesanan_id].push({prod:it.produk,varian:it.varian||'',kat:it.kategori||'Lainnya',qty:it.qty,harga:Number(it.harga_satuan)||0,subtotal:Number(it.subtotal)||0,hpp:it.hpp_saat_transaksi!=null?Number(it.hpp_saat_transaksi):null});
    });
    const penjualan=(pesananRes.data||[]).map(r=>{
      const items=itemsByPesanan[r.id]||[];
      const order={no:r.no_pesanan,tanggal:r.tanggal,_date:r.tgl_iso,mp:r.marketplace,status:r.status,
        biayaAdmin:r.biaya_admin!=null?Number(r.biaya_admin):null,biayaTambahan:r.biaya_tambahan!=null?Number(r.biaya_tambahan):null,
        dibuatOleh:r.created_by?(usersMap[r.created_by]||null):null,
        items};
      recalcOrderTotal(order);
      return order;
    });

    const mp_fee={};(mpRes.data||[]).forEach(m=>mp_fee[m.nama]=Number(m.fee_persen));
    const hpp_per_produk={};(hppRes.data||[]).forEach(h=>hpp_per_produk[h.produk]=Number(h.hpp));
    const b=biayaRes.data||{};
    const biaya={
      mp_fee,
      extra:{
        ongkir:Number(b.ongkir!=null?b.ongkir:3000),
        packaging:Number(b.packaging!=null?b.packaging:1500),
        lain:Number(b.lain!=null?b.lain:500)
      },
      hpp_mode:b.hpp_mode||'pct',
      hpp_pct:Number(b.hpp_pct!=null?b.hpp_pct:45),
      hpp_per_produk
    };

    const s=setRes.data||{};
    const pengaturan={nama:s.nama_toko||'Toko Saya',pemilik:s.pemilik||'',hp:s.hp||'',batasStok:s.batas_stok!=null?s.batas_stok:10,logo:s.logo||''};

    const pembelian=(pembelianRes.data||[]).map(r=>({kode:r.kode,tanggal:r.tanggal,_date:r.tgl_iso,supplier:r.supplier||'',item:r.item||'',qty:r.qty,satuan:r.satuan||'pcs',hargaSatuan:Number(r.harga_satuan)||0,total:Number(r.total)||0,catatan:r.catatan||''}));
    const penggajian=(penggajianRes.data||[]).map(r=>({kode:r.kode,tanggal:r.tanggal,_date:r.tgl_iso,namaKaryawan:r.nama_karyawan||'',jabatan:r.jabatan||'',periode:r.periode||'',nominal:Number(r.nominal)||0,catatan:r.catatan||''}));

    updateSyncBadge(true);
    return{kategori,marketplace,stok,penjualan,biaya,pengaturan,pembelian,penggajian,lastUpdate:new Date().toISOString()};
  }catch(e){console.warn('Gagal memuat dari Supabase:',e);updateSyncBadge(false,e.message);return null}
}
function updateSyncBadge(ok,msg){
  const el=document.getElementById('sync-status');if(!el)return;
  el.title=msg||'';
  el.textContent=ok?'☁️ Tersinkron':'⚠️ Offline (lokal saja)';
  el.style.color=ok?'var(--success)':'var(--warning)';
}

// ===== SEED DATA =====
function seedData(){
  DB.kategori=[...DEFAULT_KAT];
  DB.marketplace=JSON.parse(JSON.stringify(DEFAULT_MP));
  DB.biaya=JSON.parse(JSON.stringify(DEFAULT_BIAYA));
  refreshMpGlobals();
  DB.penjualan=[];
  const katMap={'Kaos Polos':'Atasan','Celana Cargo':'Bawahan','Hoodie':'Outer','Kemeja Flannel':'Atasan','Jaket Denim':'Outer','Topi Baseball':'Aksesoris','Kaos Oversize':'Atasan','Celana Chino':'Bawahan','Dress Casual':'Atasan','Rok Mini':'Bawahan'};
  for(let i=0;i<160;i++){
    const mp=MP_LIST[rnd(0,3)];const d=new Date(2025,rnd(0,5),rnd(1,28));
    const jumlahBarang=rnd(1,3); // sebagian besar pesanan contoh berisi 1-3 barang berbeda
    const items=[];
    for(let j=0;j<jumlahBarang;j++){
      const prod=PRODUK[rnd(0,9)];const varian=VARIAN[rnd(0,14)];const qty=rnd(1,4);const harga=rnd(35000,450000);
      items.push({prod,varian,kat:katMap[prod]||'Lainnya',qty,harga,subtotal:qty*harga});
    }
    const order={no:mp.substring(0,3).toUpperCase()+'-'+(1000+i),tanggal:fmtTgl(d),_date:d.toISOString(),mp,status:STATUS_ARR[rnd(0,6)],items};
    recalcOrderTotal(order);
    DB.penjualan.push(order);
  }
  DB.stok=[];
  for(let i=0;i<120;i++){
    const prod=PRODUK[i%10];const varian=VARIAN[i%15];const stok=rnd(0,100);const terjual=rnd(3,60);const kat=katMap[prod]||'Lainnya';const hpp=rnd(15000,180000);
    DB.stok.push({sku:'SKU-'+String(i+1).padStart(4,'0'),prod,varian,kat,stok,terjual,hpp});
  }
  saveDB(['penjualan','stok']);
}

// ===== INIT (dipanggil setelah login admin berhasil) =====
async function initApp(){
  let hasData=loadDB(); // tampilkan cache lokal dulu (cepat, tetap jalan offline)

  // Database relasional Supabase adalah sumber kebenaran utama.
  // Jika berhasil diambil, selalu pakai itu (menggantikan cache lokal).
  const cloud=await loadFromSupabase();
  if(cloud){
    DB=cloud;
    localStorage.setItem('omniseller_v2',JSON.stringify(DB));
    hasData=true;
  }

  if(!hasData)seedData();
  // Auto-seed data dummy saat tabel kosong DIMATIKAN.
  // Jika Anda ingin tabel kosong tetap kosong (siap diisi data asli),
  // baris di bawah ini sengaja tidak dipakai lagi.
  // if(hasData&&DB.penjualan.length===0&&DB.stok.length===0)seedData();
  if(!DB.kategori||DB.kategori.length===0)DB.kategori=[...DEFAULT_KAT];
  if(!DB.marketplace||DB.marketplace.length===0)DB.marketplace=JSON.parse(JSON.stringify(DEFAULT_MP));
  if(!DB.biaya)DB.biaya=JSON.parse(JSON.stringify(DEFAULT_BIAYA));
  if(!DB.pembelian)DB.pembelian=[];
  if(!DB.penggajian)DB.penggajian=[];
  if(!DB.pengaturan.logo)DB.pengaturan.logo='';
  refreshMpGlobals();
  filteredStok=[...DB.stok];
  filteredPembelian=[...DB.pembelian];
  filteredPenggajian=[...DB.penggajian];
  applyPengaturan();
  applyLogo();
  ppInit('pp-dash',{mode:'30_hari'},()=>{renderDashboard();filterJual();});
  ppInit('pp-laporan',{mode:'7_hari'},()=>renderLaporan());
  ppInit('pp-inventory',{mode:'30_hari'},()=>{filterPembelian();filterPenggajian();renderInventorySummary();});
  ppInit('pp-kasirdash',{mode:'hari_ini'},()=>renderDashboardKasir());
  renderDashboard();
  filterJual();
  renderStokTable();
  populateKatDropdowns();
  populateMpDropdowns();
  document.getElementById('f-tgl').value=today();
  (function(){const t=localStorage.getItem('omni_theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark')})();
}

// ===== ADMIN AUTH (Supabase Auth) + ROLE/PRIVILEGE =====
let _currentAdminRole=null; // 'owner' | 'staff' | 'kasir' | 'viewer' | 'pending' | null
let _currentAdminNama=''; // nama tampilan admin yang sedang login (dari admin_users.nama)
function showLoginScreen(){
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('app-wrap').style.display='none';
  document.getElementById('pending-screen').style.display='none';
}
function showPendingScreen(email){
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app-wrap').style.display='none';
  document.getElementById('pending-screen').style.display='flex';
  document.getElementById('pending-email').textContent=email||'';
}
function showAppScreen(){
  document.getElementById('login-screen').style.display='none';
  document.getElementById('pending-screen').style.display='none';
  document.getElementById('app-wrap').style.display='';
}
// Daftar menu yang boleh diakses berdasarkan ROLE yang sedang login.
// null artinya tidak dibatasi (Owner & Staff — semua menu boleh).
function menusAllowedForRole(){
  const role=_currentAdminRole;
  if(role==='kasir')return['dashboard-kasir','penjualan','stok'];
  if(role==='viewer')return['dashboard','penjualan','stok','produk','laba','inventory','laporan'];
  return null;
}
function applyNavVisibility(){
  const allowed=menusAllowedForRole();
  // Data Laba/Margin di menu Penjualan (tabel & modal Tambah Pesanan)
  // disembunyikan khusus untuk Kasir — mereka boleh input/edit pesanan,
  // tapi angka laba/margin adalah data sensitif yang bukan urusan mereka.
  document.body.classList.toggle('hide-sensitive-laba',_currentAdminRole==='kasir');
  document.querySelectorAll('.nav-item').forEach(el=>{
    const m=el.getAttribute('data-menu');
    if(m==='dashboard-kasir'){el.style.display=(_currentAdminRole==='kasir')?'':'none';return}
    el.style.display=(!allowed||allowed.includes(m))?'':'none';
  });
  // Judul grup sidebar ("Analitik","Data") ikut disembunyikan kalau SEMUA
  // menu di bawahnya tidak ada yang boleh diakses role ini.
  document.querySelectorAll('.nav-section').forEach(sec=>{
    if(!allowed){sec.style.display='';return}
    let next=sec.nextElementSibling,adaYangTampil=false;
    while(next&&!next.classList.contains('nav-section')){
      if(next.classList.contains('nav-item')&&allowed.includes(next.getAttribute('data-menu')))adaYangTampil=true;
      next=next.nextElementSibling;
    }
    sec.style.display=adaYangTampil?'':'none';
  });
}
// Halaman kasir.html (path terpisah dari index.html) — sidebar dipangkas
// cuma menyisakan Penjualan & Stok Gudang, TERLEPAS dari role yang login
// (cocok untuk komputer/terminal kasir bersama). Ini pelengkap
// applyNavVisibility() di atas yang berbasis role.
function applyKasirPageMode(){
  if(!window.OMNI_KASIR_PAGE)return;
  document.querySelectorAll('.nav-section').forEach(el=>el.style.display='none');
  document.querySelectorAll('.nav-item').forEach(el=>{
    const m=el.getAttribute('data-menu');
    el.style.display=(m==='dashboard-kasir'||m==='penjualan'||m==='stok')?'':'none';
  });
}
// Dipanggil setiap kali ada user berhasil login/signup/sesi ditemukan.
// Mengecek role di tabel admin_users, lalu memutuskan layar mana yang tampil.
async function proceedAfterAuth(user){
  _currentAdminUser=user;
  try{
    const{data,error}=await supabaseClient.from('admin_users').select('role,nama,email').eq('id',user.id).maybeSingle();

    // Kasus 1: tabel admin_users belum ada (SETUP-ROLES.sql belum dijalankan)
    if(error&&(error.code==='42P01'||error.message.includes('does not exist'))){
      console.warn('Tabel admin_users belum ada — jalankan SETUP-ROLES.sql terlebih dahulu');
      loginAlert('⚠️ Tabel sistem belum disiapkan. Buka Supabase Dashboard → SQL Editor, jalankan file SETUP-ROLES.sql, lalu coba login lagi.','danger');
      return;
    }
    // Kasus 2: error lain dari Supabase
    if(error){
      console.warn('Gagal cek role:',error.message);
      loginAlert('Gagal memuat data akses akun: '+error.message);
      return;
    }
    // Kasus 3: akun belum ada di admin_users (SETUP-ROLES.sql sudah jalan tapi trigger belum insert user ini)
    if(!data){
      loginAlert('⚠️ Akun Anda belum terdaftar di sistem role. Hubungi Owner untuk menambahkan akses, atau jalankan query SQL manual di PANDUAN-ROLE-AKSES.md.','danger');
      return;
    }
    // Kasus 4: akun ada tapi belum di-approve
    if(data.role==='pending'){
      showPendingScreen(user.email);
      return;
    }
    // Kasus 5: normal — masuk app
    _currentAdminRole=data.role;
    _currentAdminNama=data.nama||'';
    showAppScreen();
    await initApp();             // render semua section
    applyKasirPageMode();        // pangkas sidebar kalau ini kasir.html
    handleHashRoute();           // buka menu sesuai path di URL (#/stok, dst) — bukan selalu Dashboard
    applyNavVisibility();        // pangkas sidebar sesuai ROLE (berlaku di index.html juga)
    applyRolePermissions();      // terapkan permission tombol SETELAH render selesai
    updateAdminInfo();
    catatAktivitas('Login','Sistem','Berhasil masuk ke aplikasi');
  }catch(e){
    console.warn('Gagal cek role:',e);
    loginAlert('Gagal memuat data akses akun: '+e.message);
  }
}
function loginAlert(msg,type){
  const el=document.getElementById('login-alert');
  el.innerHTML=msg?`<div class="alert alert-${type||'danger'}">${msg}</div>`:'';
}
function toggleAuthForm(mode){
  loginAlert('');
  if(mode==='signup'){
    document.getElementById('form-login').style.display='none';
    document.getElementById('form-signup').style.display='';
    document.getElementById('form-login-header').style.display='none';
    document.getElementById('form-signup-header').style.display='';
  }else{
    document.getElementById('form-signup').style.display='none';
    document.getElementById('form-login').style.display='';
    document.getElementById('form-signup-header').style.display='none';
    document.getElementById('form-login-header').style.display='';
  }
}
async function adminSignUp(){
  if(typeof supabaseClient==='undefined'||!supabaseClient){loginAlert('Koneksi ke Supabase gagal dimuat. Coba refresh halaman (Ctrl+Shift+R).');return}
  const nama=document.getElementById('signup-nama').value.trim();
  const email=document.getElementById('signup-email').value.trim();
  const password=document.getElementById('signup-password').value;
  const password2=document.getElementById('signup-password2').value;
  if(!email||!password){loginAlert('Email dan password wajib diisi');return}
  if(password.length<6){loginAlert('Password minimal 6 karakter');return}
  if(password!==password2){loginAlert('Konfirmasi password tidak sama');return}
  const btn=document.getElementById('btn-signup');btn.disabled=true;btn.textContent='Memproses...';
  loginAlert('');
  try{
    const{data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{nama:nama||email}}});
    if(error){loginAlert('Daftar gagal: '+error.message);btn.disabled=false;btn.textContent='Daftar Sebagai Administrator';return}
    if(data.session){
      // Auto-confirm aktif -> langsung dicek role (kemungkinan 'pending' jika bukan user pertama)
      await proceedAfterAuth(data.user);
    }else{
      // Perlu konfirmasi email dulu
      loginAlert('Pendaftaran berhasil! Cek email Anda untuk konfirmasi akun, lalu login.','success');
      toggleAuthForm('login');
      document.getElementById('login-email').value=email;
    }
  }catch(e){loginAlert('Daftar gagal: '+e.message)}
  btn.disabled=false;btn.textContent='Daftar Sebagai Administrator';
}
async function adminLogin(){
  if(typeof supabaseClient==='undefined'||!supabaseClient){loginAlert('Koneksi ke Supabase gagal dimuat. Coba refresh halaman (Ctrl+Shift+R).');return}
  const email=document.getElementById('login-email').value.trim();
  const password=document.getElementById('login-password').value;
  if(!email||!password){loginAlert('Email dan password wajib diisi');return}
  const btn=document.getElementById('btn-login');btn.disabled=true;btn.textContent='Memproses...';
  loginAlert('');
  try{
    const{data,error}=await supabaseClient.auth.signInWithPassword({email,password});
    if(error){loginAlert('Login gagal: '+error.message);btn.disabled=false;btn.textContent='🔐 Otentikasi';return}
    await proceedAfterAuth(data.user);
  }catch(e){loginAlert('Login gagal: '+e.message)}
  btn.disabled=false;btn.textContent='🔐 Otentikasi';
}
async function adminLogout(){
  if(!confirm('Keluar dari dashboard?'))return;
  await catatAktivitas('Logout','Sistem','Keluar dari aplikasi');
  try{await supabaseClient.auth.signOut()}catch(e){}
  _currentAdminUser=null;_currentAdminRole=null;_currentAdminNama='';_currentSection=null;
  history.replaceState(null,'','#/');
  document.getElementById('login-email').value='';
  document.getElementById('login-password').value='';
  loginAlert('');
  showLoginScreen();
}
// "Lupa kode akses?" — kirim email reset password lewat Supabase Auth.
async function lupaKodeAkses(){
  if(typeof supabaseClient==='undefined'||!supabaseClient){loginAlert('Koneksi ke Supabase gagal dimuat.');return}
  const email=(document.getElementById('login-email').value||'').trim();
  if(!email){loginAlert('Isi dulu ID Pengguna (email) Anda di atas, baru klik "Lupa kode akses?" lagi.');return}
  try{
    const{error}=await supabaseClient.auth.resetPasswordForEmail(email);
    if(error){loginAlert('Gagal mengirim email reset: '+error.message);return}
    loginAlert('✅ Link atur ulang kode akses sudah dikirim ke '+email+'. Cek inbox/folder spam Anda.','success');
  }catch(e){loginAlert('Gagal mengirim email reset: '+e.message)}
}
function updateAdminInfo(){
  const emailEl=document.getElementById('info-admin-email');
  const sinceEl=document.getElementById('info-admin-since');
  const email=_currentAdminUser?_currentAdminUser.email:'';
  const namaTampil=_currentAdminNama||email||'–';
  if(emailEl){
    emailEl.textContent=email||'–';
    sinceEl.textContent=_currentAdminUser&&_currentAdminUser.last_sign_in_at?new Date(_currentAdminUser.last_sign_in_at).toLocaleString('id-ID'):'–';
  }
  const roleLabelFull={owner:'👑 Owner (akses penuh)',staff:'🛠 Staff (kelola transaksi & stok)',kasir:'🧾 Kasir (kelola pesanan saja)',viewer:'👁 Viewer (hanya lihat)'}[_currentAdminRole]||_currentAdminRole||'–';
  const roleEl=document.getElementById('info-admin-role');
  if(roleEl)roleEl.textContent=roleLabelFull;

  // ===== Widget akun di sidebar ("menu login") =====
  const roleLabelSingkat={owner:'Owner',staff:'Staff',kasir:'Kasir',viewer:'Viewer'}[_currentAdminRole]||_currentAdminRole||'–';
  const avatarEl=document.getElementById('su-avatar');
  if(avatarEl)avatarEl.textContent=namaTampil.trim().charAt(0)||'?';
  const nameEl=document.getElementById('su-name');
  if(nameEl)nameEl.textContent=namaTampil;
  const roleBadgeEl=document.getElementById('su-role-badge');
  if(roleBadgeEl){roleBadgeEl.textContent=roleLabelSingkat;roleBadgeEl.className='su-role role-'+(_currentAdminRole||'');}
  const menuEmailEl=document.getElementById('su-menu-email');
  if(menuEmailEl)menuEmailEl.textContent=email||'–';
}
// Buka/tutup popover menu akun di sidebar (nama, role, ganti password, logout).
function toggleSidebarUserMenu(){
  document.getElementById('sidebar-user').classList.toggle('open');
}
function closeSidebarUserMenu(){
  document.getElementById('sidebar-user').classList.remove('open');
}
document.addEventListener('click',(e)=>{
  const wrap=document.getElementById('sidebar-user');
  if(wrap&&!wrap.contains(e.target))closeSidebarUserMenu();
});
function bukaModalGantiPassword(){
  document.getElementById('pw-baru').value='';document.getElementById('pw-ulang').value='';
  openModal('modal-ganti-password');
}
async function simpanPasswordBaru(){
  const a=document.getElementById('pw-baru').value,b=document.getElementById('pw-ulang').value;
  if(!a||a.length<6){alert('Password minimal 6 karakter');return}
  if(a!==b){alert('Konfirmasi password tidak sama');return}
  try{
    const{error}=await supabaseClient.auth.updateUser({password:a});
    if(error){alert('Gagal mengubah password: '+error.message);return}
    alert('Password berhasil diubah!');closeModal('modal-ganti-password');
  }catch(e){alert('Gagal mengubah password: '+e.message)}
}

// ===== HAK AKSES (ROLE PERMISSIONS) =====
function isOwner(){return _currentAdminRole==='owner'}
function canWrite(){return _currentAdminRole==='owner'||_currentAdminRole==='staff'} // boleh tambah/edit/hapus STOK, kategori, marketplace
function canWriteOrders(){return _currentAdminRole==='owner'||_currentAdminRole==='staff'||_currentAdminRole==='kasir'} // boleh tambah/edit PESANAN
function canDeleteOrders(){return _currentAdminRole==='owner'||_currentAdminRole==='staff'} // HAPUS pesanan dikecualikan dari Kasir — kasir cuma boleh input & edit
function canManageSettings(){return _currentAdminRole==='owner'} // boleh ubah biaya/pengaturan toko/marketplace/kategori/user
// Sembunyikan/disable elemen UI sesuai role. Dipanggil setelah login & setiap render ulang halaman besar.
function applyRolePermissions(){
  if(!_currentAdminRole)return;
  const write=canWrite(), settings=canManageSettings(), writeOrders=canWriteOrders();
  // Sembunyikan/tampilkan tombol sesuai role
  document.querySelectorAll('[data-need="write"]').forEach(el=>{
    el.style.display=write?'':'none';
  });
  document.querySelectorAll('[data-need="write-jual"]').forEach(el=>{
    el.style.display=writeOrders?'':'none';
  });
  document.querySelectorAll('[data-need="settings"]').forEach(el=>{
    el.style.display=settings?'':'none';
  });
  // Kartu Manajemen User hanya untuk owner
  const secUser=document.getElementById('sec-manajemen-user');
  if(secUser)secUser.style.display=settings?'':'none';
  // Isi daftar user kalau owner sedang di section pengaturan
  if(settings){
    const secPengaturan=document.getElementById('sec-pengaturan');
    if(secPengaturan&&secPengaturan.classList.contains('active'))renderUserList();
  }
}
// Dipakai di renderJualTable/renderStokTable/dst untuk sembunyikan tombol aksi kalau tidak berhak.
// kind='jual' -> pakai izin khusus pesanan (termasuk role Kasir); selain itu pakai izin staff/owner biasa.
function actionCellRW(html,kind){return(kind==='jual'?canWriteOrders():canWrite())?html:''}

// ===== HISTORY AKTIVITAS =====
// Mencatat SEMUA aktivitas penting (tambah/edit/hapus/login/dst) ke tabel
// `log_aktivitas` di Supabase, supaya Owner/Staff bisa lihat siapa melakukan
// apa & kapan lewat menu History (sidebar > Data > History). Dibuat
// fire-and-forget (tidak di-await pemanggilnya) supaya tidak memperlambat
// aksi utama, dan dibungkus try/catch supaya kegagalan mencatat log TIDAK
// pernah menggagalkan aksi utama (simpan data tetap jalan walau log gagal).
async function catatAktivitas(aksi,entitas,keterangan){
  try{
    if(typeof supabaseClient==='undefined'||!supabaseClient)return;
    const nama=_currentAdminNama||(_currentAdminUser?_currentAdminUser.email:'')||'Sistem';
    await supabaseClient.from(TBL_LOG_AKTIVITAS).insert({
      waktu:new Date().toISOString(),aktor:_currentAdminUser?_currentAdminUser.id:null,
      aktor_nama:nama,aksi,entitas,keterangan:keterangan||''
    });
    // Kalau menu History sedang terbuka, muat ulang biar aktivitas baru
    // langsung kelihatan tanpa harus pindah menu lalu balik lagi.
    if(_currentSection==='history')filterHistory();
  }catch(e){console.warn('Gagal mencatat histori aktivitas:',e)}
}
const AKSI_BADGE={Tambah:'badge-green',Edit:'badge-blue',Hapus:'badge-red',Restock:'badge-green',Import:'badge-blue',Restore:'badge-yellow',Reset:'badge-red',Rekonsiliasi:'badge-yellow',Login:'badge-blue',Logout:'badge-gray',Error:'badge-red',Peringatan:'badge-yellow'};

// ===== TANGKAP CONSOLE ERROR/WARNING JS OTOMATIS =====
// Supaya kalau ada fitur update/hapus yang diam-diam gagal karena error
// JavaScript (yang biasanya cuma kelihatan di DevTools browser orang yang
// mengalaminya), riwayatnya tetap tercatat ke History Aktivitas (aksi
// "Error"/"Peringatan", data "Console JS") — jadi bisa ditelusuri belakangan
// tanpa perlu minta orang itu buka Console sendiri.
// Dibungkus rapat dengan penjagaan anti-loop & anti-spam supaya TIDAK
// pernah membuat aplikasi lambat/nge-lag ataupun rekursi tak berujung
// (catatAktivitas sendiri juga memanggil console.warn saat gagal).
(function(){
  const _origError=console.error.bind(console);
  const _origWarn=console.warn.bind(console);
  let _sedangMencatatConsole=false;
  const _pesanTerbaruConsole=new Map();
  function ringkasArgsConsole(args){
    try{
      return args.map(a=>{
        if(a instanceof Error)return a.message+(a.stack?(' | '+String(a.stack).split('\n').slice(0,3).join(' > ')):'');
        if(typeof a==='object')return JSON.stringify(a);
        return String(a);
      }).join(' ').slice(0,500);
    }catch(e){return '(pesan tidak bisa dibaca)'}
  }
  function catatConsole(aksi,pesan){
    if(_sedangMencatatConsole||!pesan)return;
    const kunci=aksi+'|'+pesan;const now=Date.now();
    if((_pesanTerbaruConsole.get(kunci)||0)>now-8000)return; // dedupe 8 detik, anti-spam
    _pesanTerbaruConsole.set(kunci,now);
    _sedangMencatatConsole=true;
    catatAktivitas(aksi,'Console JS',pesan+' — halaman: '+(location.hash||'/')).finally(()=>{_sedangMencatatConsole=false});
  }
  console.error=function(...args){_origError(...args);catatConsole('Error',ringkasArgsConsole(args))};
  console.warn=function(...args){_origWarn(...args);catatConsole('Peringatan',ringkasArgsConsole(args))};
  window.addEventListener('error',ev=>catatConsole('Error','Uncaught: '+(ev.message||'')+(ev.filename?(' @ '+ev.filename.split('/').pop()+':'+ev.lineno):'')));
  window.addEventListener('unhandledrejection',ev=>catatConsole('Error','Unhandled Promise Rejection: '+(ev.reason&&ev.reason.message?ev.reason.message:String(ev.reason))));
})();
let _logRows=[],_logOffset=0,_logHasMore=true,_logLoading=false;
const LOG_PAGE_SIZE=50;
// Dipanggil setiap kali menu History dibuka, atau filter/pencarian diubah.
function filterHistory(){_logOffset=0;_logRows=[];_logHasMore=true;muatHistory()}
async function muatHistory(){
  const tbody=document.getElementById('tbl-history');
  if(!tbody)return;
  if(typeof supabaseClient==='undefined'||!supabaseClient)return;
  if(_logLoading)return;_logLoading=true;
  if(_logOffset===0)tbody.innerHTML='<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text3)">Memuat histori...</td></tr>';
  const q=(document.getElementById('q-history')?.value||'').trim();
  const aksi=document.getElementById('f-aksi-history')?.value||'';
  const entitas=document.getElementById('f-entitas-history')?.value||'';
  try{
    let query=supabaseClient.from(TBL_LOG_AKTIVITAS).select('*').order('waktu',{ascending:false}).range(_logOffset,_logOffset+LOG_PAGE_SIZE-1);
    if(aksi)query=query.eq('aksi',aksi);
    if(entitas)query=query.eq('entitas',entitas);
    if(q)query=query.or(`keterangan.ilike.%${q}%,aktor_nama.ilike.%${q}%`);
    const{data,error}=await query;
    _logLoading=false;
    if(error){
      const belumAda=/does not exist|could not find the table/i.test(error.message);
      tbody.innerHTML=`<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--danger)">Gagal memuat histori: ${error.message}${belumAda?' — tabel log_aktivitas belum ada. Jalankan ulang SETUP-LENGKAP-OMNISELLER.sql (Bagian 7) di Supabase SQL Editor, lalu refresh halaman ini.':''}</td></tr>`;
      const moreBtn=document.getElementById('btn-history-more');if(moreBtn)moreBtn.style.display='none';
      return;
    }
    const rows=data||[];
    _logRows=_logRows.concat(rows);
    _logHasMore=rows.length===LOG_PAGE_SIZE;
    _logOffset+=rows.length;
    renderHistoryTable();
  }catch(e){_logLoading=false;tbody.innerHTML=`<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--danger)">Gagal memuat histori: ${e.message}</td></tr>`}
}
function muatHistoryLebihBanyak(){muatHistory()}
// Export histori aktivitas (sesuai filter/pencarian yang sedang aktif) ke
// CSV. Mengambil ULANG dari Supabase (bukan cuma baris yang sudah ke-load
// di layar) supaya hasil export lengkap, dibatasi 5000 baris terbaru
// supaya tidak membebani browser/koneksi.
async function exportHistoryCSV(btn){
  if(typeof supabaseClient==='undefined'||!supabaseClient){alert('Supabase belum siap.');return}
  if(btn)btn.disabled=true;
  try{
    const q=(document.getElementById('q-history')?.value||'').trim();
    const aksi=document.getElementById('f-aksi-history')?.value||'';
    const entitas=document.getElementById('f-entitas-history')?.value||'';
    let query=supabaseClient.from(TBL_LOG_AKTIVITAS).select('*').order('waktu',{ascending:false}).limit(5000);
    if(aksi)query=query.eq('aksi',aksi);
    if(entitas)query=query.eq('entitas',entitas);
    if(q)query=query.or(`keterangan.ilike.%${q}%,aktor_nama.ilike.%${q}%`);
    const{data,error}=await query;
    if(error){alert('Gagal export histori: '+error.message);return}
    if(!data||!data.length){alert('Tidak ada data histori untuk diexport (sesuai filter saat ini).');return}
    const h=csvRow(['Waktu','Aktivitas','Data','Keterangan','Oleh'])+'\n';
    const body=data.map(r=>csvRow([new Date(r.waktu).toLocaleString('id-ID'),r.aksi,r.entitas,r.keterangan||'',r.aktor_nama||''])).join('\n');
    dlFile(h+body,'history_aktivitas_'+today()+'.csv','text/csv');
  }catch(e){alert('Gagal export histori: '+e.message)}
  finally{if(btn)btn.disabled=false}
}
function renderHistoryTable(){
  const el=document.getElementById('tbl-history');if(!el)return;
  el.innerHTML=_logRows.length?_logRows.map(r=>`
    <tr>
      <td style="color:var(--text2);white-space:nowrap">${new Date(r.waktu).toLocaleString('id-ID')}</td>
      <td><span class="badge ${AKSI_BADGE[r.aksi]||'badge-gray'}">${esc(r.aksi)}</span></td>
      <td>${esc(r.entitas)}</td>
      <td style="color:var(--text2)">${esc(r.keterangan||'–')}</td>
      <td style="color:var(--text2);white-space:nowrap">👤 ${esc(r.aktor_nama||'–')}</td>
    </tr>`).join(''):'<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text3)">Belum ada aktivitas tercatat di periode/filter ini</td></tr>';
  const moreBtn=document.getElementById('btn-history-more');
  if(moreBtn)moreBtn.style.display=_logHasMore?'':'none';
  const countEl=document.getElementById('history-count');
  if(countEl)countEl.textContent=_logRows.length+(_logHasMore?'+':'')+' aktivitas';
}

// ===== MANAJEMEN USER & HAK AKSES (khusus Owner) =====
async function renderUserList(){
  const el=document.getElementById('user-list-manage');
  if(!el||!isOwner())return;
  el.innerHTML=`<div style="text-align:center;padding:20px;color:var(--text3)">Memuat...</div>`;
  try{
    const{data,error}=await supabaseClient.from('admin_users').select('id,email,nama,role,created_at').order('created_at');
    if(error){el.innerHTML=`<div style="color:var(--danger);font-size:13px">Gagal memuat: ${error.message}</div>`;return}
    if(!data||!data.length){el.innerHTML=`<div style="color:var(--text3);text-align:center;padding:20px">Belum ada user</div>`;return}
    const roleBadge={owner:'background:#fef3c7;color:#92400e',staff:'background:#dbeafe;color:#1e40af',kasir:'background:#dcfce7;color:#166534',viewer:'background:#e5e7eb;color:#374151',pending:'background:#fee2e2;color:#991b1b'};
    el.innerHTML=data.map(u=>{
      const isMe=_currentAdminUser&&u.id===_currentAdminUser.id;
      return `<div class="mp-manage-row">
        <div class="mp-manage-left">
          <div>
            <div style="font-weight:600">${u.nama||u.email}${isMe?' <span style="font-size:11px;color:var(--text3)">(Anda)</span>':''}</div>
            <div style="font-size:11px;color:var(--text3)">${u.email}</div>
          </div>
        </div>
        <div class="mp-manage-actions" style="gap:8px;align-items:center">
          <span class="mp-tag" style="${roleBadge[u.role]||''}">${u.role==='pending'?'⏳ Pending':u.role}</span>
          ${isMe?'':`<select class="form-select" style="font-size:12px;padding:4px 6px" onchange="ubahRoleUser('${u.id}',this.value)">
            <option value="pending" ${u.role==='pending'?'selected':''}>Pending</option>
            <option value="viewer" ${u.role==='viewer'?'selected':''}>Viewer</option>
            <option value="kasir" ${u.role==='kasir'?'selected':''}>Kasir</option>
            <option value="staff" ${u.role==='staff'?'selected':''}>Staff</option>
            <option value="owner" ${u.role==='owner'?'selected':''}>Owner</option>
          </select>
          <button class="btn btn-sm btn-icon btn-danger" onclick="hapusAksesUser('${u.id}','${(u.nama||u.email).replace(/'/g,"")}')">🗑</button>`}
        </div>
      </div>`;
    }).join('');
  }catch(e){el.innerHTML=`<div style="color:var(--danger);font-size:13px">Gagal memuat: ${e.message}</div>`}
}
async function ubahRoleUser(userId,role){
  try{
    const{data,error}=await supabaseClient.from('admin_users').update({role}).eq('id',userId).select();
    if(error){alert('Gagal mengubah role: '+error.message);renderUserList();return}
    if(!data||!data.length){
      alert('⚠️ Perubahan TIDAK tersimpan ke database (kemungkinan ditolak oleh keamanan database/RLS).\n\nKemungkinan penyebab:\n- Akun Anda belum berstatus Owner di tabel admin_users\n- SETUP-ROLES.sql belum sepenuhnya dijalankan / ada langkah yang gagal\n\nCoba jalankan ulang FIX-MANAJEMEN-USER.sql, lalu logout & login kembali.');
      renderUserList();return;
    }
    catatAktivitas('Edit','User & Akses',`Role "${data[0].nama||data[0].email}" diubah menjadi ${role}`);
    renderUserList();
  }catch(e){alert('Gagal mengubah role: '+e.message)}
}
async function hapusAksesUser(userId,nama){
  if(!confirm(`Cabut akses untuk "${nama}"? Mereka tidak akan bisa masuk ke aplikasi lagi (akun login tetap ada, hanya hak aksesnya yang dicabut).`))return;
  try{
    const{data,error}=await supabaseClient.from('admin_users').delete().eq('id',userId).select();
    if(error){alert('Gagal mencabut akses: '+error.message);return}
    if(!data||!data.length){
      alert('⚠️ Penghapusan TIDAK tersimpan ke database (kemungkinan ditolak oleh keamanan database/RLS).\n\nCoba jalankan ulang FIX-MANAJEMEN-USER.sql, lalu logout & login kembali.');
      renderUserList();return;
    }
    catatAktivitas('Hapus','User & Akses',`Akses "${nama}" dicabut`);
    renderUserList();
  }catch(e){alert('Gagal mencabut akses: '+e.message)}
}


// Gerbang utama: cek sesi login saat halaman dibuka
window.onload=async function(){
  showLoginScreen();
  // Tampilkan logo custom dari cache lokal (jika ada) sebelum proses login selesai
  try{const cached=localStorage.getItem('omniseller_v2');if(cached){const d=JSON.parse(cached);if(d&&d.pengaturan){DB.pengaturan=d.pengaturan;applyLogo()}}}catch(e){}
  if(typeof supabaseClient==='undefined'||!supabaseClient){
    loginAlert('Gagal memuat koneksi Supabase. Periksa koneksi internet Anda lalu refresh halaman (Ctrl+Shift+R). Jika masih gagal, kemungkinan CDN Supabase diblokir oleh jaringan/firewall Anda.');
    return;
  }
  try{
    const{data}=await supabaseClient.auth.getSession();
    if(data&&data.session){
      await proceedAfterAuth(data.session.user);
    }
  }catch(e){console.warn('Gagal cek sesi login:',e)}
};
// Jika sesi berubah (login/logout dari tab lain, token refresh, dst)
if(typeof supabaseClient!=='undefined'&&supabaseClient){
  supabaseClient.auth.onAuthStateChange((event,session)=>{
    if(event==='SIGNED_OUT'){_currentAdminUser=null;_currentAdminRole=null;_currentAdminNama='';_currentSection=null;showLoginScreen()}
  });
}

// ===== SECTIONS =====
const PAGE_TITLES={dashboard:'Dashboard','dashboard-kasir':'Dashboard Kasir',penjualan:'Laporan Penjualan',stok:'Stok & Gudang',produk:'Produk & Kategori',laba:'Laba per Produk',inventory:'Inventory — Pembelian & Penggajian',laporan:'Laporan Keuangan',import:'Import Data',history:'History Aktivitas',pengaturan:'Pengaturan'};
const MENU_IDS=Object.keys(PAGE_TITLES);
let _currentSection=null;

// ===== ROUTING (path per menu, lewat URL hash: #/dashboard, #/stok, dst) =====
// Pakai hash (bukan history.pushState dgn path asli) supaya TIDAK butuh
// konfigurasi server tambahan (SPA fallback) — file statis apa adanya tetap
// bisa di-refresh langsung di URL #/menu manapun tanpa 404, di hosting mana pun.
function menuIdFromHash(){
  const h=(location.hash||'').replace(/^#\/?/,'').split('?')[0].split('/')[0];
  return MENU_IDS.includes(h)?h:null;
}
// Dipanggil saat hash berubah (klik menu, tombol back/forward browser, atau
// user mengetik/paste URL dengan #/menu langsung) -> pindah section tanpa reload.
function handleHashRoute(){
  if(document.getElementById('app-wrap').style.display==='none')return; // belum login, jangan pindah section dulu
  const id=menuIdFromHash();
  if(id&&id!==_currentSection)showSection(id);
  else if(!id)showSection((window.OMNI_KASIR_PAGE||_currentAdminRole==='kasir')?'dashboard-kasir':'dashboard'); // hash kosong -> default (Dashboard Kasir khusus role/halaman kasir)
}
// Set #/menu di address bar. `replace=true` dipakai untuk navigasi awal
// (biar tidak menambah entri baru di history browser tiap kali app dibuka).
function setRouteHash(id,replace){
  const h='#/'+id;
  if(location.hash===h)return;
  _routingInternal=true;
  if(replace)history.replaceState(null,'',h);else location.hash=h;
  _routingInternal=false;
}
let _routingInternal=false;
window.addEventListener('hashchange',()=>{if(!_routingInternal)handleHashRoute()});

function showSection(id,el){
  if(!MENU_IDS.includes(id))id='dashboard';
  // Halaman kasir.html (window.OMNI_KASIR_PAGE) hanya boleh menampilkan
  // Penjualan & Stok Gudang — kalau ada yang coba akses menu lain lewat
  // hash URL manual (mis. kasir.html#/pengaturan), paksa balik ke Penjualan.
  if(window.OMNI_KASIR_PAGE&&id!=='penjualan'&&id!=='stok'&&id!=='dashboard-kasir')id='dashboard-kasir';
  // Guard berbasis ROLE — berlaku di halaman mana pun (termasuk index.html
  // biasa). Kalau role sedang login tidak diizinkan mengakses menu `id`
  // (mis. Kasir coba buka #/laporan lewat hash manual), alihkan ke menu
  // pertama yang memang diizinkan untuk role tersebut.
  const allowed=menusAllowedForRole();
  if(allowed&&!allowed.includes(id))id=allowed[0];
  _currentSection=id;
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('sec-'+id).classList.add('active');
  const navEl=el||document.querySelector('.nav-item[data-menu="'+id+'"]');
  if(navEl)navEl.classList.add('active');
  document.getElementById('page-title').textContent=PAGE_TITLES[id]||id;
  setRouteHash(id,false);
  // Periode-picker + Ekspor CSV + Tambah Pesanan di topbar hanya relevan untuk
  // data Penjualan (dipakai Dashboard & tabel Penjualan). Section lain sudah
  // punya tombol export/tambah sendiri yang lebih tepat (Stok, Laba, Laporan),
  // jadi disembunyikan di sana supaya tidak membingungkan/duplikat.
  const jualTools=document.getElementById('topbar-jual-tools');
  if(jualTools)jualTools.style.display=(id==='dashboard'||id==='penjualan')?'flex':'none';
  if(id==='laporan')renderLaporan();
  if(id==='dashboard-kasir')renderDashboardKasir();
  if(id==='produk')renderProduk();
  if(id==='laba'){renderLabaSection();}
  if(id==='inventory'){filterPembelian();filterPenggajian();renderInventorySummary();}
  if(id==='pengaturan'){updateInfoPengaturan();if(canManageSettings())renderUserList();}
  if(id==='history')filterHistory();
  applyRolePermissions(); // selalu re-apply setiap ganti section
}

// ===== KATEGORI DROPDOWN POPULATE =====
function populateKatDropdowns(){
  const names=getKatNames();
  const ids=['f-kat-jual','s-kat','f-kat-stok','f-kat-laba'];
  ids.forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    const isFilter=id.startsWith('f-kat');
    el.innerHTML=(isFilter?'<option value="">Semua Kategori</option>':'')+names.map(n=>`<option>${n}</option>`).join('');
  });
}

// ===== DASHBOARD =====
function reloadData(){renderDashboard()}
// ===== DASHBOARD KASIR =====
// Ringkasan khusus untuk role Kasir — HANYA status pesanan (Dikirim/
// Diproses/Selesai/Dibatalkan), TIDAK ADA data omzet/laba/margin yang
// sensitif (itu tetap di Dashboard biasa, khusus Owner/Staff/Viewer).
function renderDashboardKasir(){
  const{start,end,label}=ppGetRange('pp-kasirdash');
  const labelEl=document.getElementById('kasirdash-periode-label');
  if(labelEl)labelEl.textContent=label;
  const dalamPeriode=DB.penjualan.filter(r=>r._date&&new Date(r._date)>=start&&new Date(r._date)<=end);
  const hitung=st=>dalamPeriode.filter(r=>r.status===st).length;
  const cards=[
    {status:'Dikirim',icon:'🚚',cls:'m-accent',val:hitung('Dikirim')},
    {status:'Diproses',icon:'⏳',cls:'m-warning',val:hitung('Diproses')},
    {status:'Selesai',icon:'✅',cls:'m-success',val:hitung('Selesai')},
    {status:'Dibatalkan',icon:'❌',cls:'m-danger',val:hitung('Dibatalkan')},
  ];
  const el=document.getElementById('kasirdash-metrics');
  if(el)el.innerHTML=cards.map(c=>`
    <div class="metric-card ${c.cls}">
      <div class="metric-icon">${c.icon}</div>
      <div class="metric-label">Total Pesanan ${c.status}</div>
      <div class="metric-value">${c.val.toLocaleString('id-ID')}</div>
      <div class="metric-sub" style="color:var(--text3)">pesanan di periode ini</div>
    </div>`).join('');

  // Daftar Stok Habis & Stok Rendah — supaya Kasir bisa langsung tahu
  // barang apa yang tidak bisa dijual/perlu diinfokan ke pelanggan, tanpa
  // harus bolak-balik buka menu Stok & Gudang.
  const batas=(DB.pengaturan.batasStok!=null?DB.pengaturan.batasStok:10);
  const habis=DB.stok.filter(s=>s.stok===0).sort((a,b)=>a.prod.localeCompare(b.prod));
  const rendah=DB.stok.filter(s=>s.stok>0&&s.stok<=batas).sort((a,b)=>a.stok-b.stok);
  const habisCountEl=document.getElementById('kasirdash-habis-count');if(habisCountEl)habisCountEl.textContent=habis.length;
  const rendahCountEl=document.getElementById('kasirdash-rendah-count');if(rendahCountEl)rendahCountEl.textContent=rendah.length;
  const renderStokList=(list,kosongMsg,tampilkanQty)=>list.length?list.map(s=>`
    <div class="prog-row" style="align-items:center">
      <div class="prog-label" style="flex:1">${esc(s.prod)}${s.varian?' — '+esc(s.varian):''}</div>
      ${tampilkanQty?`<span class="badge badge-yellow">${s.stok} pcs</span>`:`<span class="badge badge-red">Habis</span>`}
    </div>`).join(''):`<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px">${kosongMsg}</div>`;
  const habisListEl=document.getElementById('kasirdash-habis-list');
  if(habisListEl)habisListEl.innerHTML=renderStokList(habis,'🎉 Tidak ada stok yang habis',false);
  const rendahListEl=document.getElementById('kasirdash-rendah-list');
  if(rendahListEl)rendahListEl.innerHTML=renderStokList(rendah,'🎉 Tidak ada stok yang menipis',true);

  const tbl=document.getElementById('kasirdash-tbl');
  if(tbl){
    const terbaru=[...dalamPeriode].sort((a,b)=>new Date(b._date||0)-new Date(a._date||0)).slice(0,10);
    tbl.innerHTML=terbaru.length?terbaru.map(r=>`
      <tr>
        <td class="mono">${r.no}</td>
        <td style="color:var(--text2)">${r.tanggal}</td>
        <td><span class="mp-tag" style="${mpTagStyle(r.mp)}">${r.mp}</span></td>
        <td style="font-weight:600">${ringkasProdukPesanan(r)}</td>
        <td style="text-align:center;font-weight:600">${hitungQtyItems(r.items||[])}</td>
        <td><span class="badge ${ST_BADGE[r.status]||'badge-gray'}">${r.status}</span></td>
      </tr>`).join(''):`<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Belum ada pesanan di periode ini</td></tr>`;
  }
}

function renderDashboard(){
  const{start,end}=ppGetRange('pp-dash');
  const recent=DB.penjualan.filter(r=>r.status!=='Dibatalkan'&&r._date&&new Date(r._date)>=start&&new Date(r._date)<=end);
  const totalRev=recent.reduce((a,r)=>a+r.total,0);
  const totalOrd=recent.length;
  const batas=(DB.pengaturan.batasStok!=null?DB.pengaturan.batasStok:10);
  const kritis=DB.stok.filter(s=>s.stok<=batas).length;

  // Laba & HPP estimasi (dihitung per barang, bukan per pesanan, agar
  // pesanan dengan beberapa produk tetap akurat)
  let totalLaba=0,totalHpp=0;flattenPenjualan(recent).forEach(f=>{const h=hitungLaba(f);totalLaba+=h.laba;totalHpp+=h.hpp});
  // Pengeluaran operasional (Inventory: Pembelian & Penggajian) periode yang
  // sama dengan periode Dashboard ini, dikurangkan dari laba bersih supaya
  // angka "Estimasi Laba Bersih" benar-benar bersih, bukan cuma laba kotor
  // dari penjualan.
  const totalBeliOpex=totalPembelianPeriode(start,end);
  const totalGajiOpex=totalPenggajianPeriode(start,end);
  const totalOpex=totalBeliOpex+totalGajiOpex;
  totalLaba-=totalOpex;
  const margin=totalRev>0?totalLaba/totalRev*100:0;

  // Perbandingan vs periode SEBELUMNYA (durasi yang sama, persis sebelum
  // rentang saat ini) — dihitung real dari data, bukan angka tetap.
  const durMs=end.getTime()-start.getTime();
  const prevEnd=new Date(start.getTime()-1);
  const prevStart=new Date(prevEnd.getTime()-durMs);
  const prev=DB.penjualan.filter(r=>r.status!=='Dibatalkan'&&r._date&&new Date(r._date)>=prevStart&&new Date(r._date)<=prevEnd);
  const prevRev=prev.reduce((a,r)=>a+r.total,0);
  const prevOrd=prev.length;
  const pctRev=prevRev>0?((totalRev-prevRev)/prevRev*100):(totalRev>0?100:0);
  const pctOrd=prevOrd>0?((totalOrd-prevOrd)/prevOrd*100):(totalOrd>0?100:0);
  const panahSub=(pct)=>(pct>=0?'▲ ':'▼ ')+Math.abs(pct).toFixed(1)+'% vs periode lalu';

  const setTxt=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;return el};
  setTxt('m-omzet',fmtRp(totalRev));
  setTxt('m-omzet-sub',panahSub(pctRev));
  setTxt('m-hpp',fmtRp(totalHpp));
  setTxt('m-hpp-sub',totalRev>0?(totalHpp/totalRev*100).toFixed(1)+'% dari omzet':'–');
  setTxt('m-opex',fmtRp(totalOpex));
  setTxt('m-opex-sub','Pembelian '+fmtRp(totalBeliOpex)+' · Gaji '+fmtRp(totalGajiOpex));
  const marginEl=setTxt('m-margin-val',margin.toFixed(1)+'%');
  const marginColor=margin>=20?'var(--success)':margin>=0?'var(--warning)':'var(--danger)';
  if(marginEl)marginEl.style.color=marginColor;
  const ringEl=document.getElementById('margin-ring');
  if(ringEl){ringEl.style.setProperty('--pct',Math.max(0,Math.min(100,margin)));ringEl.style.setProperty('--ring-color',marginColor)}
  const labaEl=setTxt('m-laba',fmtRp(totalLaba));
  if(labaEl)labaEl.style.color=totalLaba>=0?'var(--success)':'var(--danger)';
  setTxt('m-laba-sub',totalLaba>=0?'📈 Untung':'📉 Rugi');
  setTxt('m-ord',totalOrd.toLocaleString('id-ID'));
  setTxt('m-ord-sub',panahSub(pctOrd));
  setTxt('nb-stok',kritis);

  // Sparkline mini di kartu Omzet (garis tren) & Total Pesanan (bar tren) —
  // gaya kartu "Revenue"/"Customers" pada dashboard referensi, digambar
  // manual di canvas (bukan Chart.js) supaya ringan & tidak perlu legend/axis.
  const unitSpark=unitOtomatis(start,end);
  const bucketsSpark=buatBucketLaporan(start,end,unitSpark);
  const revBuckets=bucketsSpark.map(b=>recent.filter(r=>new Date(r._date)>=b.start&&new Date(r._date)<=b.end).reduce((a,r)=>a+(r.total||0),0));
  const ordBuckets=bucketsSpark.map(b=>recent.filter(r=>new Date(r._date)>=b.start&&new Date(r._date)<=b.end).length);
  drawSparkline('spark-omzet',revBuckets,'line','#60a5fa');
  drawSparkline('spark-ord',ordBuckets,'bar','#60a5fa');

  // Alerts
  const habis=DB.stok.filter(s=>s.stok===0);const rendah=DB.stok.filter(s=>s.stok>0&&s.stok<=batas);
  let alertHTML='';
  if(habis.length)alertHTML+=`<div class="alert alert-danger">⚠ <strong>${habis.length} varian stok habis</strong> — ${habis.slice(0,3).map(s=>s.prod+' '+s.varian).join(', ')}${habis.length>3?'...':''}</div>`;
  if(rendah.length)alertHTML+=`<div class="alert alert-warning">⚡ <strong>${rendah.length} varian stok rendah</strong> (&lt;${batas} pcs) — perlu segera restock</div>`;
  if(totalOpex>0)alertHTML+=`<div class="alert alert-warning">🧾 <strong>Pengeluaran operasional periode ini: ${fmtRp(totalOpex)}</strong> (Pembelian ${fmtRp(totalBeliOpex)} + Penggajian ${fmtRp(totalGajiOpex)}) — sudah dikurangkan dari Estimasi Laba Bersih. <a href="javascript:void(0)" onclick="showSection('inventory')" style="color:inherit;text-decoration:underline">Lihat rincian di menu Inventory →</a></div>`;
  const alertAreaEl=document.getElementById('alert-area');if(alertAreaEl)alertAreaEl.innerHTML=alertHTML;

  // MP breakdown
  const mpRev={};const mpOrd={};MP_LIST.forEach(m=>{mpRev[m]=0;mpOrd[m]=0});
  recent.forEach(r=>{mpRev[r.mp]=(mpRev[r.mp]||0)+r.total;mpOrd[r.mp]=(mpOrd[r.mp]||0)+1});
  const maxRev=Math.max(...Object.values(mpRev))||1;
  const mpListEl=document.getElementById('mp-list-dash');
  if(mpListEl)mpListEl.innerHTML=MP_LIST.map(m=>`
    <div class="mp-row"><div class="mp-color-dot" style="background:${MP_COLORS[m]}"></div>
    <div class="mp-name-col">${m}</div>
    <div class="mp-bar-col"><div class="mp-bar-track"><div class="mp-bar-fill" style="width:${Math.round(mpRev[m]/maxRev*100)}%;background:${MP_COLORS[m]}"></div></div></div>
    <div class="mp-rev-col"><div class="mp-rev">${fmtRp(mpRev[m])}</div><div class="mp-orders-txt">${mpOrd[m]} pesanan</div></div></div>`).join('');

  // Top 5 (dihitung per barang di dalam pesanan, bukan per pesanan) —
  // ditampilkan sebagai "equalizer" bar vertikal berwarna-warni, gaya
  // kartu "NPS" pada dashboard referensi.
  const pm={};flattenPenjualan(recent).forEach(r=>{pm[r.prod]=(pm[r.prod]||0)+r.qty});
  const top5=Object.entries(pm).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxQ=top5.length?top5[0][1]:1;
  const eqColors=['#3b82f6','#22d3ee','#34d399','#fbbf24','#f87171'];
  const top5El=document.getElementById('top5-bars');
  if(top5El)top5El.innerHTML=top5.length?top5.map(([n,q],i)=>`
    <div class="eq-bar-col">
      <div class="eq-bar-value">${q}</div>
      <div class="eq-bar" style="height:${Math.max(8,Math.round(q/maxQ*100))}%;background:${eqColors[i%eqColors.length]}"></div>
      <div class="eq-bar-label" title="${n}">${n}</div>
    </div>`).join(''):'<div style="color:var(--text3);font-size:12.5px;padding:20px 0;text-align:center;width:100%">Belum ada data penjualan di periode ini</div>';

  renderTrendChart(start,end);
  renderStokPieChart();
}

// Menggambar sparkline mini (garis atau bar) di canvas kecil dalam kartu
// metrik Dashboard, gaya kartu "Revenue"/"Customers" pada referensi.
// Sengaja pakai Canvas 2D manual (bukan Chart.js) supaya ringan & instan,
// tanpa axis/legend/animasi berat untuk elemen sekecil ini.
function drawSparkline(canvasId,data,type,color){
  const canvas=document.getElementById(canvasId);
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  const w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);
  if(!data||!data.length||data.every(v=>!v)){
    ctx.strokeStyle='rgba(128,128,128,.25)';ctx.lineWidth=1.5;ctx.beginPath();
    ctx.moveTo(2,h/2);ctx.lineTo(w-2,h/2);ctx.stroke();
    return;
  }
  const max=Math.max(...data,1),min=Math.min(...data,0);
  const range=(max-min)||1;
  const pad=3;
  const stepX=(w-pad*2)/Math.max(1,data.length-1);
  if(type==='bar'){
    const bw=Math.max(2,(w-pad*2)/data.length-3);
    data.forEach((v,i)=>{
      const bh=Math.max(2,((v-min)/range)*(h-pad*2));
      const x=pad+i*((w-pad*2)/data.length)+1;
      const y=h-pad-bh;
      const grad=ctx.createLinearGradient(0,y,0,h-pad);
      grad.addColorStop(0,color);grad.addColorStop(1,color+'55');
      ctx.fillStyle=grad;
      ctx.beginPath();
      ctx.roundRect?ctx.roundRect(x,y,bw,bh,[2,2,0,0]):ctx.rect(x,y,bw,bh);
      ctx.fill();
    });
  }else{
    const pts=data.map((v,i)=>[pad+i*stepX,h-pad-((v-min)/range)*(h-pad*2)]);
    const grad=ctx.createLinearGradient(0,0,0,h);
    grad.addColorStop(0,color+'50');grad.addColorStop(1,color+'00');
    ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);
    for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);
    ctx.lineTo(pts[pts.length-1][0],h-pad);ctx.lineTo(pts[0][0],h-pad);ctx.closePath();
    ctx.fillStyle=grad;ctx.fill();
    ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);
    for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);
    ctx.strokeStyle=color;ctx.lineWidth=2;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
  }
}

function renderTrendChart(start,end){
  // Granularitas grafik menyesuaikan otomatis lebar rentang yang dipilih di
  // periode picker (harian utk rentang pendek, sampai tahunan utk rentang panjang).
  const canvas=document.getElementById('chartTrend');
  if(!canvas)return; // elemen belum ada di DOM (mis. file HTML belum disinkron) -> jangan jatuhkan seluruh Dashboard
  const unit=unitOtomatis(start,end);
  const buckets=buatBucketLaporan(start,end,unit);
  const aktif=DB.penjualan.filter(r=>r.status!=='Dibatalkan'&&r._date);
  const labels=buckets.map(b=>b.label);
  const ctx=canvas.getContext('2d');
  const datasets=MP_LIST.map(m=>{
    const color=getMpColor(m);
    const grad=ctx.createLinearGradient(0,0,0,210);
    grad.addColorStop(0,color+'55');
    grad.addColorStop(1,color+'00');
    return{
      label:m,
      data:buckets.map(b=>aktif.filter(r=>r.mp===m&&new Date(r._date)>=b.start&&new Date(r._date)<=b.end).reduce((a,r)=>a+(r.total||0),0)),
      borderColor:color,backgroundColor:grad,fill:true,tension:.42,borderWidth:2.25,
      pointRadius:0,pointHoverRadius:5,pointBackgroundColor:color,pointBorderColor:'#fff',pointBorderWidth:1.5,
      pointHoverBackgroundColor:'#fff',pointHoverBorderColor:color,pointHoverBorderWidth:2.25
    };
  });
  if(charts.trend)charts.trend.destroy();
  charts.trend=new Chart(canvas,{type:'line',data:{labels,datasets},
    plugins:[finGlowPlugin],
    options:{responsive:true,maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{position:'bottom',align:'center',labels:{font:{size:11},boxWidth:8,boxHeight:8,usePointStyle:true,pointStyle:'circle',padding:14}},
        tooltip:{padding:9,cornerRadius:10,titleFont:{size:11.5,weight:'700'},bodyFont:{size:11.5},
          callbacks:{
            label:(c)=>` ${c.dataset.label}: ${fmtRp(c.parsed.y||0)}`,
            footer:(items)=>{const total=items.reduce((a,it)=>a+(it.parsed.y||0),0);return 'Total: '+fmtRp(total)}
          },footerFont:{size:11,weight:'700'}}
      },
      scales:{x:{ticks:{color:'#888',font:{size:10},maxTicksLimit:8,autoSkip:true},grid:{display:false},border:{display:false}},
        y:{beginAtZero:true,ticks:{color:'#888',font:{size:10},callback:v=>fmtRingkas(v),maxTicksLimit:5},grid:{color:'rgba(128,128,128,.08)'},border:{display:false}}}}});
}

function renderStokPieChart(){
  const canvas=document.getElementById('chartStokPie');
  if(!canvas)return;
  const batas=(DB.pengaturan.batasStok!=null?DB.pengaturan.batasStok:10);
  const habis=DB.stok.filter(s=>s.stok===0).length,rendah=DB.stok.filter(s=>s.stok>0&&s.stok<=batas).length,aman=DB.stok.length-habis-rendah;
  if(charts.stokPie)charts.stokPie.destroy();
  charts.stokPie=new Chart(canvas,{type:'doughnut',data:{labels:['Aman','Rendah','Habis'],datasets:[{data:[aman,rendah,habis],backgroundColor:['#00aa5b','#f59e0b','#ef4444'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'65%'}});
  const legendEl=document.getElementById('pie-legend');
  if(legendEl)legendEl.innerHTML=[{l:'Aman',c:'#00aa5b',v:aman},{l:'Rendah',c:'#f59e0b',v:rendah},{l:'Habis',c:'#ef4444',v:habis}].map(x=>`<span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:${x.c}"></span>${x.l}: ${x.v}</span>`).join('');
  // Total nilai aset stok gudang yang masih ada (stok x HPP/pcs)
  const totalAset=DB.stok.reduce((a,s)=>a+(s.stok||0)*(s.hpp||0),0);
  const elAset=document.getElementById('stok-asset-total');
  if(elAset)elAset.textContent=fmtRp(totalAset);
}

// Chart "Nilai Aset per Kategori" di Laporan Keuangan — breakdown nilai
// stok gudang (stok x HPP) dikelompokkan per kategori produk, supaya
// kelihatan kategori mana yang paling banyak "menyimpan" modal.
function renderAsetStokChart(){
  const canvas=document.getElementById('chartAsetKategori');if(!canvas)return;
  const byKat={};DB.stok.forEach(s=>{const k=s.kat||'Lainnya';byKat[k]=(byKat[k]||0)+(s.stok||0)*(s.hpp||0)});
  const entries=Object.entries(byKat).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const labels=entries.map(e=>e[0]),vals=entries.map(e=>Math.round(e[1]));
  const colors=labels.map(k=>getKatColor(k));
  if(charts.asetKategori)charts.asetKategori.destroy();
  charts.asetKategori=new Chart(canvas,{type:'bar',data:{labels,datasets:[{data:vals,backgroundColor:colors,borderWidth:0,borderRadius:5}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{ticks:{color:'#888',font:{size:10},callback:v=>fmtRingkas(v)},grid:{color:'rgba(128,128,128,.1)'}},
        y:{ticks:{color:'#888',font:{size:11}},grid:{display:false}}}}});
  const totalAset=DB.stok.reduce((a,s)=>a+(s.stok||0)*(s.hpp||0),0);
  const totalVarian=DB.stok.length;
  const totalQty=DB.stok.reduce((a,s)=>a+(s.stok||0),0);
  const batas=(DB.pengaturan.batasStok!=null?DB.pengaturan.batasStok:10);
  const kritis=DB.stok.filter(s=>s.stok<=batas).length;
  const setTxt=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};
  setTxt('aset-total-display',fmtRp(totalAset));
  setTxt('aset-varian',totalVarian.toLocaleString('id-ID'));
  setTxt('aset-qty',totalQty.toLocaleString('id-ID')+' pcs');
  setTxt('aset-kritis',kritis.toLocaleString('id-ID'));
}

// ===== PENJUALAN TABLE =====
function filterJual(){
  pageJual=1;const q=(document.getElementById('q-jual').value||'').toLowerCase();const mp=document.getElementById('f-mp-jual').value;const st=document.getElementById('f-status-jual').value;
  const{start,end,label}=ppGetRange('pp-dash');
  filteredJual=DB.penjualan.filter(r=>(!q||r.no.toLowerCase().includes(q)||(r.items||[]).some(it=>it.prod.toLowerCase().includes(q)))&&(!mp||r.mp===mp)&&(!st||r.status===st)&&(!r._date||(new Date(r._date)>=start&&new Date(r._date)<=end)));
  sortJualArray(filteredJual);
  const lbl=document.getElementById('jual-periode-label');if(lbl)lbl.textContent=label;
  renderJualTable();
}
// Urutkan array pesanan IN-PLACE sesuai pilihan dropdown "f-sort-jual".
function sortJualArray(arr){
  const sortEl=document.getElementById('f-sort-jual');const mode=sortEl?sortEl.value:'terbaru';
  const waktu=r=>r._date?new Date(r._date).getTime():0;
  if(mode==='terlama')arr.sort((a,b)=>waktu(a)-waktu(b));
  else if(mode==='total-desc')arr.sort((a,b)=>(b.total||0)-(a.total||0));
  else if(mode==='total-asc')arr.sort((a,b)=>(a.total||0)-(b.total||0));
  else arr.sort((a,b)=>waktu(b)-waktu(a)); // default: 'terbaru'
  return arr;
}

const ST_BADGE={'Selesai':'badge-green','Dibatalkan':'badge-red','Diproses':'badge-yellow','Dikirim':'badge-blue'};
function renderJualTable(){
  const start=(pageJual-1)*PER_PAGE,slice=filteredJual.slice(start,start+PER_PAGE);
  document.getElementById('tbl-jual').innerHTML=slice.length?slice.map((r,i)=>{
    const ri=DB.penjualan.indexOf(r);
    const items=r.items||[];
    const laba=hitungLabaOrder(r);
    const margin=r.total>0?laba/r.total*100:0;
    const warnaLaba=laba>=0?'var(--success)':'var(--danger)';
    const warnaMargin=margin>=20?'var(--success)':margin>=0?'var(--warning)':'var(--danger)';
    const katUnik=[...new Set(items.map(it=>it.kat||'Lainnya'))];
    const katHTML=katUnik.slice(0,2).map(k=>`<span class="badge badge-gray" style="background:${getKatColor(k)}22;color:${getKatColor(k)}">${k}</span>`).join(' ')+(katUnik.length>2?` <span style="color:var(--text3);font-size:11px">+${katUnik.length-2}</span>`:'');
    const totalQty=hitungQtyItems(items);
    return `<tr>
      <td class="mono">${r.no}</td>
      <td style="color:var(--text2)">${r.tanggal}</td>
      <td><span class="mp-tag" style="${mpTagStyle(r.mp)}">${r.mp}</span></td>
      <td style="font-weight:600">${ringkasProdukPesanan(r)}</td>
      <td style="color:var(--text2)">${items.length} barang</td>
      <td>${katHTML||'–'}</td>
      <td style="text-align:center;font-weight:600">${totalQty}</td>
      <td style="font-weight:600">${fmtRp(r.total)}</td>
      <td style="color:var(--warning)">${fmtRp(r.biayaAdmin!=null?r.biayaAdmin:0)}</td>
      <td style="color:var(--text2)">${fmtRp(r.biayaTambahan!=null?r.biayaTambahan:0)}</td>
      <td class="sensitive-col" style="font-weight:700;color:${warnaLaba}">${fmtRp(laba)}</td>
      <td class="sensitive-col" style="font-weight:700;color:${warnaMargin}">${margin.toFixed(1)}%</td>
      <td style="color:var(--text2)">${r.dibuatOleh?`<span title="Diinput pertama kali oleh ${r.dibuatOleh}">👤 ${r.dibuatOleh}</span>`:'–'}</td>
      <td><span class="badge ${ST_BADGE[r.status]||'badge-gray'}">${r.status}</span></td>
      <td>${canWriteOrders()?`<div class="action-cell">
        <button class="btn btn-sm btn-icon" title="Edit" onclick="bukaEditJual(${ri})">✏️</button>
        ${canDeleteOrders()?`<button class="btn btn-sm btn-icon btn-danger" title="Hapus" onclick="konfirmHapus('jual',${ri})">🗑</button>`:''}
      </div>`:''}</td>
    </tr>`}).join(''):`<tr><td colspan="15" style="text-align:center;padding:32px;color:var(--text3)">Tidak ada data pesanan</td></tr>`;
  renderPagination('pag-jual',filteredJual.length,pageJual,p=>{pageJual=p;renderJualTable()});
}


// ===== MODAL PESANAN =====
function bukaEditJual(idx){
  const r=DB.penjualan[idx];_editJualIdx=idx;
  document.getElementById('modal-jual-title').textContent='✏️ Edit Pesanan';
  document.getElementById('btn-simpan-jual').textContent='Simpan Perubahan';
  document.getElementById('edit-jual-idx').value=idx;
  document.getElementById('f-no').value=r.no;
  document.getElementById('f-tgl').value=r._date?r._date.split('T')[0]:today();
  document.getElementById('f-mp').value=r.mp;
  document.getElementById('f-status').value=r.status;
  document.getElementById('f-biaya-admin').value=r.biayaAdmin!=null?r.biayaAdmin:Math.round(getSaranBiayaAdmin(r.mp,r.total));
  document.getElementById('f-biaya-tambahan').value=r.biayaTambahan!=null?r.biayaTambahan:Math.round(getSaranBiayaTambahan());
  populateKatDropdowns();
  populateProdukDatalist();
  _formItems=(r.items&&r.items.length?r.items:[{prod:'',varian:'',kat:'',qty:1,harga:0,hpp:null}]).map(it=>({prod:it.prod,varian:it.varian||'',kat:it.kat||'',qty:it.qty||1,harga:it.harga!=null?it.harga:(it.subtotal&&it.qty?Math.round(it.subtotal/it.qty):0),hpp:it.hpp!=null?it.hpp:null}));
  renderFormItems();
  openModal('modal-tambah-jual');
}
function bukaModalTambahJual(){
  _editJualIdx=-1;
  document.getElementById('modal-jual-title').textContent='➕ Tambah Pesanan';
  document.getElementById('btn-simpan-jual').textContent='Simpan Pesanan';
  document.getElementById('edit-jual-idx').value='';
  document.getElementById('f-no').value='';document.getElementById('f-tgl').value=today();
  document.getElementById('f-biaya-admin').value='';document.getElementById('f-biaya-tambahan').value=Math.round(getSaranBiayaTambahan());
  populateKatDropdowns();
  populateProdukDatalist();
  kosongkanFormItems();
  renderFormItems();
  openModal('modal-tambah-jual');
}
// ===== SARAN BIAYA ADMIN & BIAYA TAMBAHAN (berdasarkan riwayat pesanan) =====
// Mengganti pengaturan global lama (Biaya Admin per Marketplace % & Biaya
// Tambahan per Transaksi di menu Laba & Biaya) -> sekarang sarannya dihitung
// dari rata-rata pesanan yang sudah pernah diinput per marketplace (atau
// dari nilai default bawaan jika belum ada data sama sekali).
function getSaranBiayaAdmin(mp,total){
  const data=DB.penjualan.filter(r=>r.mp===mp&&r.biayaAdmin!=null&&r.total>0);
  if(data.length){
    const avgPct=data.reduce((a,r)=>a+(r.biayaAdmin/r.total),0)/data.length;
    return avgPct*(total||0);
  }
  const b=DB.biaya||DEFAULT_BIAYA;const pct=(b.mp_fee&&b.mp_fee[mp]!=null)?b.mp_fee[mp]:3;
  return pct/100*(total||0);
}
function getSaranBiayaTambahan(){
  const data=DB.penjualan.filter(r=>r.biayaTambahan!=null);
  if(data.length)return data.reduce((a,r)=>a+r.biayaTambahan,0)/data.length;
  const b=DB.biaya||DEFAULT_BIAYA;const ex=b.extra||{};
  return (ex.ongkir||0)+(ex.packaging||0)+(ex.lain||0);
}
function saranBiayaAdminPesanan(){
  const mp=document.getElementById('f-mp').value;const total=formTotalPesanan();
  document.getElementById('f-biaya-admin').value=Math.round(getSaranBiayaAdmin(mp,total));
  updateFormLabaMargin();
}
function saranBiayaTambahanPesanan(){
  document.getElementById('f-biaya-tambahan').value=Math.round(getSaranBiayaTambahan());
  updateFormLabaMargin();
}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function escAttr(s){return esc(s).replace(/`/g,'&#96;')}

// ===== ITEM BARANG DALAM PESANAN (multi-item) =====
// 1 pesanan bisa berisi beberapa barang berbeda (mis. checkout gabungan).
// `_formItems` menyimpan baris-baris barang yang sedang diedit di modal.
let _formItems=[];
// `hpp:null` berarti "belum dibekukan" -> akan otomatis terisi dari HPP Stok
// Gudang begitu produk/varian dipilih (lihat updateBarisItem). Setelah baris
// tersimpan sebagai pesanan, nilai hpp ini TIDAK berubah lagi walau HPP
// master di Stok Gudang naik/turun di kemudian hari (lihat hitungLaba()).
function kosongkanFormItems(){_formItems=[{prod:'',varian:'',kat:'',qty:1,harga:0,hpp:null}]}
function tambahBarisItem(){_formItems.push({prod:'',varian:'',kat:'',qty:1,harga:0,hpp:null});renderFormItems()}
function hapusBarisItem(i){if(_formItems.length<=1){alert('Pesanan harus punya minimal 1 barang.');return}_formItems.splice(i,1);renderFormItems()}
function updateBarisItem(i,field,val){
  const it=_formItems[i];if(!it)return;
  if(field==='qty')it.qty=Math.max(1,parseInt(val)||1);
  else if(field==='harga')it.harga=Math.max(0,parseFloat(val)||0);
  else it[field]=val;
  if(field==='prod'||field==='varian'){
    // Sinkron kategori otomatis: coba cocok PERSIS (produk+varian) dulu;
    // kalau varian belum diisi/tidak cocok, tetap coba cocokkan dari nama
    // produk saja (kategori varian pertama yang ditemukan) supaya kategori
    // langsung tersinkron begitu nama produk valid diketik, tanpa harus
    // menunggu varian juga persis sama.
    let si=cariStok((it.prod||'').trim(),(it.varian||'').trim());
    if(!si)si=DB.stok.find(s=>s.prod===(it.prod||'').trim());
    if(si){
      it.kat=si.kat;
      // Bekukan HPP produk ini SAAT INI ke baris pesanan (bukan mengambil HPP
      // live tiap kali laporan dibuka). Sengaja di-update setiap kali user
      // MENGUBAH produk/varian baris ini (karena barangnya memang berganti,
      // jadi wajar snapshot ikut berganti) — tapi TIDAK pernah ditimpa diam-diam
      // hanya karena laporan dibuka ulang atau HPP master berubah di kemudian hari.
      it.hpp=si.hpp!=null?si.hpp:0;
    }
  }
  // PENTING: jangan panggil renderFormItems() (rebuild total DOM) di sini —
  // itu penyebab bug "1 klik = 1 huruf/angka": setiap event oninput akan
  // menghancurkan & membuat ulang elemen <input>, sehingga fokus & posisi
  // kursor hilang dan user harus klik lagi untuk tiap karakter.
  // Cukup perbarui bagian yang perlu berubah (subtotal, datalist varian,
  // total, hint stok) tanpa mengganti elemen input yang sedang diketik.
  updateRowDisplay(i,field);
}
// Refresh MANUAL HPP baris ke harga terbaru di Stok Gudang (dipakai lewat
// tombol "🔄" di tiap baris saat Edit Pesanan). Sengaja hanya jalan kalau
// user klik sendiri -> supaya pembaruan HPP pesanan lama selalu merupakan
// tindakan sadar, bukan efek samping tersembunyi dari mengedit hal lain.
function refreshHppBaris(i){
  const it=_formItems[i];if(!it)return;
  const si=cariStok((it.prod||'').trim(),(it.varian||'').trim())||DB.stok.find(s=>s.prod===(it.prod||'').trim());
  if(!si){alert('Produk/varian ini tidak ditemukan di Stok Gudang.');return}
  it.hpp=si.hpp!=null?si.hpp:0;
  updateFormLabaMargin();
  alert('HPP baris ini diperbarui ke Rp '+Math.round(it.hpp).toLocaleString('id-ID')+'/pcs (harga Stok Gudang saat ini).');
}
function formTotalPesanan(){return _formItems.reduce((a,it)=>a+((it.qty||0)*(it.harga||0)),0)}
// ===== ESTIMASI LABA & MARGIN PER PESANAN (real-time di form Tambah/Edit) =====
// Dihitung dari data yang SEDANG diketik di form (belum tersimpan), pakai
// mesin hitung yang SAMA dengan laporan (hitungLaba/hitungLabaOrder) supaya
// angkanya konsisten dengan yang nanti muncul di Laba per Produk & Laporan
// Keuangan setelah pesanan ini disimpan. Kalau Biaya Admin/Biaya Tambahan
// dikosongkan, otomatis pakai estimasi default (sama seperti saat disimpan).
function hitungLabaFormPesanan(){
  const mpEl=document.getElementById('f-mp');const mp=mpEl?mpEl.value:'';
  const adminRaw=(document.getElementById('f-biaya-admin').value||'').trim();
  const tambahanRaw=(document.getElementById('f-biaya-tambahan').value||'').trim();
  const items=_formItems.map(it=>({prod:(it.prod||'').trim(),varian:(it.varian||'').trim(),kat:it.kat||'Lainnya',qty:it.qty||1,harga:it.harga||0,subtotal:(it.qty||0)*(it.harga||0),hpp:it.hpp!=null?it.hpp:null}));
  const tempOrder={mp,biayaAdmin:adminRaw!==''?(parseFloat(adminRaw)||0):null,biayaTambahan:tambahanRaw!==''?(parseFloat(tambahanRaw)||0):null,items};
  recalcOrderTotal(tempOrder);
  const laba=hitungLabaOrder(tempOrder);
  const margin=tempOrder.total>0?laba/tempOrder.total*100:0;
  return{laba,margin,omzet:tempOrder.total};
}
function updateFormLabaMargin(){
  const labaEl=document.getElementById('f-laba-display');const marginEl=document.getElementById('f-margin-display');
  if(!labaEl||!marginEl)return;
  const{laba,margin}=hitungLabaFormPesanan();
  const warna=laba>=0?'var(--success)':'var(--danger)';
  const warnaMargin=margin>=20?'var(--success)':margin>=0?'var(--warning)':'var(--danger)';
  labaEl.textContent=fmtRp(laba);labaEl.style.color=warna;
  marginEl.textContent=margin.toFixed(1)+'%';marginEl.style.color=warnaMargin;
}
// Perbarui tampilan 1 baris item TANPA membangun ulang elemen <input>
// (dipakai saat user sedang mengetik, supaya fokus tidak hilang).
function updateRowDisplay(i,field){
  const it=_formItems[i];if(!it)return;
  const wrap=document.getElementById('f-items-list');if(!wrap)return;
  const rowEl=wrap.children[i];
  if(rowEl){
    const subtotalEl=rowEl.querySelector('.item-subtotal');
    if(subtotalEl)subtotalEl.textContent=fmtRp((it.qty||0)*(it.harga||0));
    if(field==='prod'){
      const dl=rowEl.querySelector('datalist');
      if(dl){const opts=[...new Set(DB.stok.filter(s=>s.prod===it.prod).map(s=>s.varian).filter(Boolean))];dl.innerHTML=opts.map(v=>`<option value="${escAttr(v)}">`).join('')}
    }
  }
  const totalEl=document.getElementById('f-total-display');if(totalEl)totalEl.textContent=fmtRp(formTotalPesanan());
  renderFormStokHint();
  updateFormLabaMargin();
}
// Rebuild PENUH — hanya dipakai saat baris ditambah/dihapus/modal dibuka
// (BUKAN saat mengetik), supaya jumlah elemen <input> sesuai jumlah baris.
function renderFormItems(){
  const wrap=document.getElementById('f-items-list');if(!wrap)return;
  wrap.innerHTML=_formItems.map((it,i)=>`
    <div class="item-row" style="display:grid;grid-template-columns:2fr 1.2fr .8fr 1.2fr 1.2fr auto;gap:8px;align-items:end;margin-bottom:10px;padding-bottom:10px;border-bottom:1px dashed var(--border,#e5e5e5)">
      <div class="form-group" style="margin:0"><label style="font-size:11px">Produk</label>
        <input class="form-input" list="dl-produk-stok" placeholder="Nama produk" value="${escAttr(it.prod)}" oninput="updateBarisItem(${i},'prod',this.value)" autocomplete="off"></div>
      <div class="form-group" style="margin:0"><label style="font-size:11px">Varian</label>
        <input class="form-input" list="dl-varian-row-${i}" placeholder="M / Hitam" value="${escAttr(it.varian)}" oninput="updateBarisItem(${i},'varian',this.value)" autocomplete="off">
        <datalist id="dl-varian-row-${i}"></datalist></div>
      <div class="form-group" style="margin:0"><label style="font-size:11px">Qty</label>
        <input class="form-input" type="number" min="1" value="${it.qty}" oninput="updateBarisItem(${i},'qty',this.value)"></div>
      <div class="form-group" style="margin:0"><label style="font-size:11px">Harga Satuan (Rp)</label>
        <input class="form-input" type="number" min="0" value="${it.harga}" oninput="updateBarisItem(${i},'harga',this.value)"></div>
      <div class="form-group" style="margin:0"><label style="font-size:11px">Subtotal</label>
        <div class="item-subtotal" style="padding:8px 0;font-weight:700">${fmtRp((it.qty||0)*(it.harga||0))}</div></div>
      <button type="button" class="btn btn-sm btn-icon btn-danger" title="Hapus barang ini" onclick="hapusBarisItem(${i})">🗑</button>
    </div>
    <div class="sensitive-col" style="font-size:11px;color:var(--text3);margin:-8px 0 10px;display:flex;align-items:center;gap:6px">
      ${it.hpp!=null?`🔒 HPP dipakai untuk pesanan ini: <strong>${fmtRp(it.hpp)}</strong>/pcs (dibekukan, tidak ikut berubah walau HPP di Stok Gudang diubah nanti)`:'⚠️ HPP belum dibekukan — pastikan produk/varian cocok dengan data Stok Gudang'}
      <button type="button" class="btn btn-sm" style="padding:2px 8px;font-size:10px" title="Perbarui HPP baris ini ke harga terbaru di Stok Gudang" onclick="refreshHppBaris(${i})">🔄 Refresh HPP</button>
    </div>`).join('');
  _formItems.forEach((it,i)=>{
    const dl=document.getElementById('dl-varian-row-'+i);
    if(dl){const opts=[...new Set(DB.stok.filter(s=>s.prod===it.prod).map(s=>s.varian).filter(Boolean))];dl.innerHTML=opts.map(v=>`<option value="${escAttr(v)}">`).join('')}
  });
  const totalEl=document.getElementById('f-total-display');if(totalEl)totalEl.textContent=fmtRp(formTotalPesanan());
  renderFormStokHint();
  updateFormLabaMargin();
}
// Cek stok SETIAP barang di pesanan secara real-time (bukan cuma 1 produk seperti dulu)
function renderFormStokHint(){
  const el=document.getElementById('f-stok-hint-list');if(!el)return;
  const lines=_formItems.filter(it=>(it.prod||'').trim()).map(it=>{
    const si=cariStok(it.prod.trim(),(it.varian||'').trim());
    if(!si)return `<div style="font-size:11.5px;padding:7px 10px;border-radius:7px;background:var(--warning-bg);color:var(--warning);margin-bottom:4px">⚠️ <strong>${esc(it.prod)}</strong>${it.varian?' · '+esc(it.varian):''} tidak ditemukan persis di Stok Gudang — stok TIDAK otomatis berkurang untuk barang ini.</div>`;
    const sisa=si.stok-(it.qty||0);const kurang=sisa<0;
    return `<div style="font-size:11.5px;padding:7px 10px;border-radius:7px;background:${kurang?'var(--danger-bg)':'var(--success-bg)'};color:${kurang?'var(--danger)':'var(--success)'};margin-bottom:4px">${kurang?'⚠️ Stok tidak cukup':'✅ Cocok dengan Stok Gudang'} — <strong>${esc(it.prod)}</strong>${it.varian?' · '+esc(it.varian):''}: stok saat ini <strong>${si.stok} pcs</strong>${kurang?`, pesanan ini butuh ${it.qty} pcs`:`, sisa setelah pesanan ini <strong>${sisa} pcs</strong>`}.</div>`;
  });
  el.innerHTML=lines.join('');
}
function populateProdukDatalist(){
  const dl=document.getElementById('dl-produk-stok');if(!dl)return;
  const uniq=[...new Set(DB.stok.map(s=>s.prod))].sort();
  dl.innerHTML=uniq.map(p=>`<option value="${escAttr(p)}">`).join('');
}
// ===== SINKRONISASI STOK <-> PENJUALAN (otomatis & real-time) =====
// Pesanan berstatus 'Dibatalkan' dianggap tidak pernah mengurangi stok asli.
// Efek stok sekarang diterapkan PER BARANG di dalam pesanan, bukan per pesanan,
// supaya pesanan dengan beberapa produk mengurangi SKU yang tepat masing-masing.
function isStatusAktif(status){return status!=='Dibatalkan'}
function _normStokKey(s){return(s||'').trim().toLowerCase().replace(/\s+/g,' ')}
function cariStok(prod,varian){
  const np=_normStokKey(prod),nv=_normStokKey(varian);
  // 1) coba cocok persis dulu (case-sensitive) supaya perilaku lama tidak berubah
  let hit=DB.stok.find(s=>s.prod===prod&&(s.varian||'')===(varian||''));
  if(hit)return hit;
  // 2) fallback: cocok tanpa peduli huruf besar/kecil & spasi berlebih
  //    (mencegah pesanan "Breast milk 150 ML" gagal sinkron ke SKU "Breast Milk 150 ml")
  return DB.stok.find(s=>_normStokKey(s.prod)===np&&_normStokKey(s.varian)===nv);
}
// arah -1 = kurangi stok (pesanan baru/aktif), arah +1 = kembalikan stok (batal/hapus/edit)
function terapkanEfekStok(order,arah){
  if(!order||!isStatusAktif(order.status))return;
  (order.items||[]).forEach(item=>{
    const si=cariStok(item.prod,item.varian);
    if(!si)return;
    if(arah<0){
      si.stok=Math.max(0,(si.stok||0)-(item.qty||0));
      si.terjual=(si.terjual||0)+(item.qty||0);
    }else{
      si.stok=(si.stok||0)+(item.qty||0);
      si.terjual=Math.max(0,(si.terjual||0)-(item.qty||0));
    }
    si.updatedAt=new Date().toISOString(); // catat kapan stok SKU ini terakhir berubah
  });
}
// ===== REKONSILIASI: hitung ulang "terjual" per SKU dari SELURUH data
// Penjualan yang aktif (bukan "Dibatalkan"), lalu sesuaikan "stok" dengan
// SELISIHNYA (bukan ditimpa total) supaya stok fisik yang sudah dikoreksi
// manual oleh user tetap dihormati — hanya bagian yang "hilang" akibat bug
// sinkronisasi (mis. import CSV lama yang tidak memotong stok) yang dikoreksi.
function rekonsiliasiStok(){
  if(!canWriteOrders()){alert('Anda tidak punya izin untuk melakukan rekonsiliasi.');return}
  if(!confirm('Hitung ulang "terjual" & sesuaikan "stok" semua SKU berdasarkan seluruh Data Penjualan aktif saat ini?\n\nGunakan ini jika ada SKU yang jumlah terjualnya tidak sesuai dengan Data Penjualan (misal karena pernah import CSV sebelum perbaikan sinkronisasi).'))return;
  const terjualBaru={}; // key: sku -> total qty aktif dari Penjualan
  DB.penjualan.forEach(order=>{
    if(!isStatusAktif(order.status))return;
    (order.items||[]).forEach(item=>{
      const si=cariStok(item.prod,item.varian);
      if(!si)return;
      terjualBaru[si.sku]=(terjualBaru[si.sku]||0)+(item.qty||0);
    });
  });
  let jumlahDiperbaiki=0;
  DB.stok.forEach(si=>{
    const targetTerjual=terjualBaru[si.sku]||0;
    const selisih=targetTerjual-(si.terjual||0); // positif = ada penjualan yg belum pernah memotong stok
    if(selisih!==0){
      jumlahDiperbaiki++;
      si.stok=Math.max(0,(si.stok||0)-selisih);
      si.terjual=targetTerjual;
      si.updatedAt=new Date().toISOString();
    }
  });
  saveDB(['stok']);filteredStok=[...DB.stok];renderStokTable();renderDashboard();
  if(jumlahDiperbaiki)catatAktivitas('Rekonsiliasi','Stok Produk',`${jumlahDiperbaiki} SKU disesuaikan`);
  const res=document.getElementById('rekonsiliasi-result');
  if(res)res.innerHTML=jumlahDiperbaiki?`<div class="alert alert-success">✅ Selesai. <strong>${jumlahDiperbaiki} SKU</strong> disesuaikan agar "terjual" cocok dengan Data Penjualan.</div>`:`<div class="alert alert-success">✅ Semua SKU sudah sinkron, tidak ada yang perlu diperbaiki.</div>`;
}

function simpanPesanan(){
  if(!canWriteOrders()){alert("Anda tidak punya izin untuk menambah/mengubah pesanan.");return}
  const idx=document.getElementById('edit-jual-idx').value;
  const no=document.getElementById('f-no').value.trim();const tgl=document.getElementById('f-tgl').value;
  const itemsValid=_formItems.filter(it=>(it.prod||'').trim());
  if(!no||!tgl||!itemsValid.length){alert('Mohon isi No. Pesanan, Tanggal, dan minimal 1 Nama Produk');return}
  const idxSaatIni=idx!==''&&idx>=0?parseInt(idx):-1;
  const duplikat=DB.penjualan.findIndex((r,i)=>i!==idxSaatIni&&r.no.trim().toLowerCase()===no.toLowerCase());
  if(duplikat!==-1){alert('⚠️ No. Pesanan "'+no+'" sudah dipakai oleh pesanan lain.\n\nSetiap No. Pesanan harus unik. Ganti nomornya atau edit pesanan yang sudah ada.');return}
  const tanpaStok=itemsValid.filter(it=>!cariStok(it.prod.trim(),(it.varian||'').trim()));
  if(tanpaStok.length){
    const lanjut=confirm('⚠️ '+tanpaStok.length+' barang tidak ditemukan persis sama di Stok Gudang:\n'+tanpaStok.map(it=>'- '+it.prod+(it.varian?' - '+it.varian:'')).join('\n')+'\n\nStok TIDAK akan otomatis berkurang untuk barang tersebut.\n\nLanjutkan simpan? (Klik Batal untuk perbaiki nama produk/varian dulu)');
    if(!lanjut)return;
  }
  const items=itemsValid.map(it=>({prod:it.prod.trim(),varian:(it.varian||'').trim(),kat:it.kat||'Lainnya',qty:it.qty||1,harga:it.harga||0,subtotal:(it.qty||1)*(it.harga||0),hpp:it.hpp!=null?it.hpp:null}));
  const r={no,tanggal:fmtTgl(new Date(tgl)),_date:new Date(tgl).toISOString(),mp:document.getElementById('f-mp').value,
    status:document.getElementById('f-status').value,
    biayaAdmin:parseFloat(document.getElementById('f-biaya-admin').value)||0,
    biayaTambahan:parseFloat(document.getElementById('f-biaya-tambahan').value)||0,
    items};
  recalcOrderTotal(r);
  if(idx!==''&&idx>=0){
    const old=DB.penjualan[parseInt(idx)];
    terapkanEfekStok(old,+1);   // kembalikan dulu efek stok dari data lama (qty/produk/status lama)
    DB.penjualan[parseInt(idx)]=r;
    terapkanEfekStok(r,-1);     // terapkan efek stok dari data baru
  }else{
    DB.penjualan.unshift(r);
    terapkanEfekStok(r,-1);
  }
  saveDB(['penjualan','stok']);filteredStok=[...DB.stok];filterJual();renderStokTable();renderDashboard();closeModal('modal-tambah-jual');
}

// ===== STOK TABLE =====
function filterStok(){
  pageStok=1;const q=(document.getElementById('q-stok').value||'').toLowerCase();const st=document.getElementById('f-status-stok').value;const kat=document.getElementById('f-kat-stok').value;const batas=(DB.pengaturan.batasStok!=null?DB.pengaturan.batasStok:10);
  filteredStok=DB.stok.filter(r=>{const status=r.stok===0?'Habis':r.stok<=batas?'Rendah':'Aman';return(!q||r.prod.toLowerCase().includes(q)||r.sku.toLowerCase().includes(q))&&(!st||status===st)&&(!kat||r.kat===kat)});
  sortStokArray(filteredStok);
  renderStokTable();
}
// Urutkan array Stok IN-PLACE sesuai dropdown "f-sort-stok".
// "SKU Terbaru/Terlama" pakai timestamp created_at (diisi otomatis saat SKU
// dibuat/diimport). SKU lama sebelum fitur ini ada belum punya created_at —
// diperlakukan sebagai paling lama (fallback urutan tetap masuk akal).
function sortStokArray(arr){
  const sortEl=document.getElementById('f-sort-stok');const mode=sortEl?sortEl.value:'sku-terbaru';
  const waktu=r=>r.created_at?new Date(r.created_at).getTime():0;
  if(mode==='sku-terlama')arr.sort((a,b)=>waktu(a)-waktu(b));
  else if(mode==='stok-tertinggi')arr.sort((a,b)=>(b.stok||0)-(a.stok||0));
  else if(mode==='stok-terendah')arr.sort((a,b)=>(a.stok||0)-(b.stok||0));
  else arr.sort((a,b)=>waktu(b)-waktu(a)); // default: 'sku-terbaru'
  return arr;
}
function filterStokKritis(){document.getElementById('f-status-stok').value='';document.getElementById('q-stok').value='';document.getElementById('f-kat-stok').value='';const batas=(DB.pengaturan.batasStok!=null?DB.pengaturan.batasStok:10);filteredStok=DB.stok.filter(s=>s.stok<=batas);sortStokArray(filteredStok);pageStok=1;renderStokTable()}
function renderStokTable(){
  const batas=(DB.pengaturan.batasStok!=null?DB.pengaturan.batasStok:10);const start=(pageStok-1)*PER_PAGE;const slice=filteredStok.slice(start,start+PER_PAGE);
  document.getElementById('tbl-stok').innerHTML=slice.length?slice.map(r=>{
    const status=r.stok===0?'Habis':r.stok<=batas?'Rendah':'Aman';
    const badge=status==='Aman'?'badge-green':status==='Rendah'?'badge-yellow':'badge-red';
    const fc=status==='Aman'?'#00aa5b':status==='Rendah'?'#f59e0b':'#ef4444';
    const hariHabis=r.stok===0?'–':r.terjual>0?Math.round(r.stok/(r.terjual/30))+' hari':'∞';
    const ri=DB.stok.indexOf(r);
    return `<tr>
      <td class="mono">${r.sku}</td>
      <td style="font-weight:600">${r.prod}</td>
      <td style="color:var(--text2)">${r.varian}</td>
      <td><span class="badge badge-gray" style="background:${getKatColor(r.kat)}22;color:${getKatColor(r.kat)}">${r.kat||'–'}</span></td>
      <td><div class="stok-meter"><strong style="color:${fc}">${r.stok}</strong><div class="stok-bar"><div class="stok-fill" style="width:${Math.min(100,r.stok)}%;background:${fc}"></div></div></div></td>
      <td style="color:var(--text2)">${fmtRp(r.hpp||0)}</td>
      <td style="color:var(--text2)">${r.terjual} pcs</td>
      <td style="color:var(--text3)">${hariHabis}</td>
      <td style="color:var(--text2)" title="${r.updatedAt?new Date(r.updatedAt).toLocaleString('id-ID'):'–'}">🕓 ${fmtWaktuRelatif(r.updatedAt||r.created_at)}</td>
      <td><span class="badge ${badge}">${status}</span></td>
      <td>${actionCellRW(`<div class="action-cell">
        <button class="btn btn-sm btn-icon" title="Edit" onclick="bukaEditStok(${ri})">✏️</button>
        <button class="btn btn-sm btn-icon btn-success" title="Restock" onclick="bukaRestock(${ri})">+ Stok</button>
        <button class="btn btn-sm btn-icon btn-danger" title="Hapus" onclick="konfirmHapus('stok',${ri})">🗑</button>
      </div>`)}</td>
    </tr>`}).join(''):`<tr><td colspan="11" style="text-align:center;padding:32px;color:var(--text3)">Tidak ada data stok</td></tr>`;
  renderPagination('pag-stok',filteredStok.length,pageStok,p=>{pageStok=p;renderStokTable()});
}

// ===== MODAL STOK =====
function bukaEditStok(idx){
  const r=DB.stok[idx];_editStokIdx=idx;
  document.getElementById('modal-stok-title').textContent='✏️ Edit Produk Stok';
  document.getElementById('btn-simpan-stok').textContent='Simpan Perubahan';
  document.getElementById('edit-stok-idx').value=idx;
  document.getElementById('s-sku').value=r.sku;
  document.getElementById('s-prod').value=r.prod;
  document.getElementById('s-var').value=r.varian;
  document.getElementById('s-stok').value=r.stok;
  document.getElementById('s-terjual').value=r.terjual;
  document.getElementById('s-hpp').value=r.hpp!=null?r.hpp:0;
  populateKatDropdowns();
  document.getElementById('s-kat').value=r.kat||'';
  openModal('modal-tambah-stok');
}
function bukaModalTambahStok(){
  _editStokIdx=-1;
  document.getElementById('modal-stok-title').textContent='📦 Tambah Produk Stok';
  document.getElementById('btn-simpan-stok').textContent='Simpan';
  document.getElementById('edit-stok-idx').value='';
  document.getElementById('s-sku').value='SKU-'+String(DB.stok.length+1).padStart(4,'0');
  document.getElementById('s-prod').value='';document.getElementById('s-var').value='';
  document.getElementById('s-stok').value=0;document.getElementById('s-terjual').value=0;document.getElementById('s-hpp').value=0;
  populateKatDropdowns();
  openModal('modal-tambah-stok');
}
function simpanStok(){
  if(!canWrite()){alert("Anda tidak punya izin untuk menambah/mengubah stok.");return}
  const idx=document.getElementById('edit-stok-idx').value;
  const r={sku:document.getElementById('s-sku').value.trim(),prod:document.getElementById('s-prod').value.trim(),
    varian:document.getElementById('s-var').value.trim(),kat:document.getElementById('s-kat').value,
    stok:parseInt(document.getElementById('s-stok').value)||0,terjual:parseInt(document.getElementById('s-terjual').value)||0,
    hpp:parseFloat(document.getElementById('s-hpp').value)||0};
  if(!r.prod){alert('Nama produk wajib diisi');return}
  r.updatedAt=new Date().toISOString();
  const isEdit=idx!==''&&idx>=0;
  if(isEdit){DB.stok[parseInt(idx)]=Object.assign({},DB.stok[parseInt(idx)],r)}
  else{r.created_at=new Date().toISOString();DB.stok.unshift(r)}
  catatAktivitas(isEdit?'Edit':'Tambah','Stok Produk',`${r.prod}${r.varian?' - '+r.varian:''} (SKU ${r.sku})`);
  saveDB(['stok']);filteredStok=[...DB.stok];renderStokTable();renderDashboard();closeModal('modal-tambah-stok');
}
function bukaRestock(idx){
  _restockIdx=idx;const r=DB.stok[idx];
  document.getElementById('rs-sku').value=r.sku;document.getElementById('rs-produk').value=r.prod+' · '+r.varian;
  document.getElementById('rs-stok-lama').value=r.stok+' pcs';document.getElementById('rs-tambah').value=50;document.getElementById('rs-note').value='';
  document.getElementById('restock-title').textContent='🔄 Restock: '+r.prod;
  openModal('modal-restock');
}
function simpanRestock(){
  if(!canWrite()){alert("Anda tidak punya izin untuk restock.");return}
  if(_restockIdx<0)return;const tambah=parseInt(document.getElementById('rs-tambah').value)||0;
  const s=DB.stok[_restockIdx];
  s.stok+=tambah;s.updatedAt=new Date().toISOString();
  catatAktivitas('Restock','Stok Produk',`${s.prod}${s.varian?' - '+s.varian:''} +${tambah} pcs (SKU ${s.sku})`);
  saveDB(['stok']);filteredStok=[...DB.stok];renderStokTable();renderDashboard();closeModal('modal-restock');_restockIdx=-1;
}

// ===== HAPUS =====
function konfirmHapus(type,idx){
  const needSettings=(type==='kat'||type==='mp');
  if(needSettings&&!canManageSettings()){alert("Hanya Owner yang bisa menghapus kategori/marketplace.");return}
  if(type==='jual'&&!canDeleteOrders()){alert("Anda tidak punya izin untuk menghapus pesanan. Hubungi Owner/Staff.");return}
  if((type==='pembelian'||type==='penggajian')&&!canWrite()){alert("Anda tidak punya izin untuk menghapus data ini.");return}
  if(!needSettings&&type!=='jual'&&type!=='pembelian'&&type!=='penggajian'&&!canWrite()){alert("Anda tidak punya izin untuk menghapus data ini.");return}
  const msg=type==='jual'?`Hapus pesanan "${DB.penjualan[idx].no}"?`:type==='stok'?`Hapus produk "${DB.stok[idx].prod} ${DB.stok[idx].varian}"?`:type==='mp'?`Hapus marketplace "${DB.marketplace[idx].nama}"? Pesanan lama dengan marketplace ini tidak akan terhapus.`:type==='pembelian'?`Hapus data pembelian "${DB.pembelian[idx].item}"?`:type==='penggajian'?`Hapus data penggajian untuk "${DB.penggajian[idx].namaKaryawan}"?`:`Hapus kategori "${DB.kategori[idx].nama}"?`;
  document.getElementById('konfirm-msg').textContent=msg;
  document.getElementById('btn-konfirm-ya').onclick=function(){hapusData(type,idx);closeModal('modal-konfirm')};
  openModal('modal-konfirm');
}
function hapusData(type,idx){
  let affected=[];
  if(type==='jual'){
    const order=DB.penjualan[idx];
    terapkanEfekStok(order,+1); // kembalikan stok yang sebelumnya terpakai pesanan ini
    catatAktivitas('Hapus','Pesanan',`No. ${order.no} — ${order.mp} — ${fmtRp(order.total)}`);
    DB.penjualan.splice(idx,1);filteredStok=[...DB.stok];filterJual();renderStokTable();affected=['penjualan','stok'];
  }
  else if(type==='stok'){const s=DB.stok[idx];catatAktivitas('Hapus','Stok Produk',`${s.prod}${s.varian?' - '+s.varian:''} (SKU ${s.sku})`);DB.stok.splice(idx,1);filteredStok=[...DB.stok];renderStokTable();affected=['stok']}
  else if(type==='kat'){const k=DB.kategori[idx];catatAktivitas('Hapus','Kategori',k.nama);DB.kategori.splice(idx,1);renderKatList();populateKatDropdowns();affected=['kategori']}
  else if(type==='mp'){
    if(DB.marketplace.length<=1){alert('Minimal harus ada 1 marketplace.');return}
    const m=DB.marketplace[idx];catatAktivitas('Hapus','Marketplace',m.nama);
    DB.marketplace.splice(idx,1);refreshMpGlobals();populateMpDropdowns();renderMpList();affected=['marketplace'];
  }
  else if(type==='pembelian'){const p=DB.pembelian[idx];catatAktivitas('Hapus','Pembelian',`${p.item} — ${fmtRp(p.total)}`);DB.pembelian.splice(idx,1);filterPembelian();affected=['pembelian']}
  else if(type==='penggajian'){const p=DB.penggajian[idx];catatAktivitas('Hapus','Penggajian',`${p.namaKaryawan} — ${fmtRp(p.nominal)}`);DB.penggajian.splice(idx,1);filterPenggajian();affected=['penggajian']}
  saveDB(affected);renderDashboard();
}

// ===== INVENTORY: PEMBELIAN & PENGGAJIAN =====
// Kedua daftar ini adalah PENGELUARAN OPERASIONAL (di luar HPP/biaya admin
// marketplace yang sudah dihitung per pesanan) — dipakai untuk mengurangi
// Estimasi Laba Bersih di Dashboard, Laba per Produk (ringkasan), dan
// Laporan Keuangan. Sama seperti Stok, hanya Owner/Staff yang boleh
// menulis (lihat data-need="write" di tombol +Tambah pada index.html);
// Kasir tidak menyentuh data ini karena bukan bagian tugas input pesanan.
function buatKodeInventory(prefix){return prefix+'-'+Date.now().toString(36).toUpperCase()+'-'+rnd(100,999)}

// --- Total dalam rentang tanggal (dipakai Dashboard & Laporan Keuangan) ---
function totalPembelianPeriode(start,end){
  return DB.pembelian.filter(r=>r._date&&(!start||new Date(r._date)>=start)&&(!end||new Date(r._date)<=end)).reduce((a,r)=>a+(Number(r.total)||0),0);
}
function totalPenggajianPeriode(start,end){
  return DB.penggajian.filter(r=>r._date&&(!start||new Date(r._date)>=start)&&(!end||new Date(r._date)<=end)).reduce((a,r)=>a+(Number(r.nominal)||0),0);
}

// --- Tab switch (Pembelian / Penggajian) ---
function switchInventoryTab(tab,el){
  _invTab=tab;
  document.querySelectorAll('#sec-inventory .tab-pill').forEach(p=>p.classList.remove('active'));
  if(el)el.classList.add('active');
  document.querySelectorAll('#sec-inventory .inv-sub').forEach(s=>s.classList.remove('active'));
  document.getElementById('inv-'+tab).classList.add('active');
}

// --- Ringkasan kartu metrik di atas (sesuai periode pp-inventory) ---
function renderInventorySummary(){
  const el=document.getElementById('inv-metrics');if(!el)return;
  const{start,end,label}=ppGetRange('pp-inventory');
  const totalBeli=totalPembelianPeriode(start,end);
  const totalGaji=totalPenggajianPeriode(start,end);
  const totalOpex=totalBeli+totalGaji;
  const labelEl=document.getElementById('inv-periode-label');if(labelEl)labelEl.textContent=label;
  el.innerHTML=`
    <div class="metric-card m-warning"><div class="metric-icon">🛒</div><div class="metric-label">Total Pembelian</div><div class="metric-value">${fmtRp(totalBeli)}</div><div class="metric-sub" style="color:var(--text3)">${DB.pembelian.filter(r=>r._date&&new Date(r._date)>=start&&new Date(r._date)<=end).length} transaksi</div></div>
    <div class="metric-card m-warning"><div class="metric-icon">🧑‍💼</div><div class="metric-label">Total Penggajian</div><div class="metric-value">${fmtRp(totalGaji)}</div><div class="metric-sub" style="color:var(--text3)">${DB.penggajian.filter(r=>r._date&&new Date(r._date)>=start&&new Date(r._date)<=end).length} entri</div></div>
    <div class="metric-card metric-hero metric-hero-danger"><div class="metric-icon">🧾</div><div class="metric-label">Total Pengeluaran Operasional</div><div class="metric-value metric-value-lg">${fmtRp(totalOpex)}</div><div class="metric-sub">Mengurangi Estimasi Laba Bersih di Dashboard &amp; Laporan Keuangan</div></div>`;
}

// --- PEMBELIAN ---
function filterPembelian(){
  pagePembelian=1;const q=(document.getElementById('q-pembelian').value||'').toLowerCase();
  const{start,end}=ppGetRange('pp-inventory');
  filteredPembelian=DB.pembelian.filter(r=>(!q||(r.supplier||'').toLowerCase().includes(q)||(r.item||'').toLowerCase().includes(q))&&(!r._date||(new Date(r._date)>=start&&new Date(r._date)<=end)));
  filteredPembelian.sort((a,b)=>new Date(b._date||0)-new Date(a._date||0));
  renderPembelianTable();
  renderInventorySummary();
}
function renderPembelianTable(){
  const start=(pagePembelian-1)*PER_PAGE;const slice=filteredPembelian.slice(start,start+PER_PAGE);
  document.getElementById('tbl-pembelian').innerHTML=slice.length?slice.map(r=>{
    const ri=DB.pembelian.indexOf(r);
    return `<tr>
      <td>${r.tanggal}</td>
      <td style="font-weight:600">${esc(r.supplier)}</td>
      <td>${esc(r.item)}</td>
      <td style="text-align:center">${r.qty} ${esc(r.satuan||'pcs')}</td>
      <td>${fmtRp(r.hargaSatuan)}</td>
      <td style="font-weight:700">${fmtRp(r.total)}</td>
      <td style="color:var(--text3);font-size:12px">${esc(r.catatan||'–')}</td>
      <td>${actionCellRW(`<div class="action-cell">
        <button class="btn btn-sm btn-icon" title="Edit" onclick="bukaEditPembelian(${ri})">✏️</button>
        <button class="btn btn-sm btn-icon btn-danger" title="Hapus" onclick="konfirmHapus('pembelian',${ri})">🗑</button>
      </div>`)}</td>
    </tr>`}).join(''):`<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text3)">Belum ada data pembelian di periode ini</td></tr>`;
  renderPagination('pag-pembelian',filteredPembelian.length,pagePembelian,p=>{pagePembelian=p;renderPembelianTable()});
}
function bukaModalTambahPembelian(){
  _editPembelianIdx=-1;
  document.getElementById('modal-pembelian-title').textContent='🛒 Tambah Pembelian';
  document.getElementById('btn-simpan-pembelian').textContent='Simpan';
  document.getElementById('edit-pembelian-idx').value='';
  document.getElementById('pb-tgl').value=today();
  document.getElementById('pb-supplier').value='';document.getElementById('pb-item').value='';
  document.getElementById('pb-qty').value=1;document.getElementById('pb-satuan').value='pcs';
  document.getElementById('pb-harga').value=0;document.getElementById('pb-catatan').value='';
  openModal('modal-tambah-pembelian');
}
function bukaEditPembelian(idx){
  const r=DB.pembelian[idx];_editPembelianIdx=idx;
  document.getElementById('modal-pembelian-title').textContent='✏️ Edit Pembelian';
  document.getElementById('btn-simpan-pembelian').textContent='Simpan Perubahan';
  document.getElementById('edit-pembelian-idx').value=idx;
  document.getElementById('pb-tgl').value=(r._date||'').split('T')[0]||today();
  document.getElementById('pb-supplier').value=r.supplier||'';document.getElementById('pb-item').value=r.item||'';
  document.getElementById('pb-qty').value=r.qty||1;document.getElementById('pb-satuan').value=r.satuan||'pcs';
  document.getElementById('pb-harga').value=r.hargaSatuan||0;document.getElementById('pb-catatan').value=r.catatan||'';
  openModal('modal-tambah-pembelian');
}
function simpanPembelian(){
  if(!canWrite()){alert("Anda tidak punya izin untuk menambah/mengubah data pembelian.");return}
  const idx=document.getElementById('edit-pembelian-idx').value;
  const tglVal=document.getElementById('pb-tgl').value||today();
  const qty=parseFloat(document.getElementById('pb-qty').value)||0;
  const harga=parseFloat(document.getElementById('pb-harga').value)||0;
  const supplier=document.getElementById('pb-supplier').value.trim();
  const item=document.getElementById('pb-item').value.trim();
  if(!item){alert('Nama barang/item wajib diisi');return}
  const r={tanggal:fmtTgl(new Date(tglVal)),_date:new Date(tglVal).toISOString(),supplier,item,qty,
    satuan:document.getElementById('pb-satuan').value.trim()||'pcs',hargaSatuan:harga,total:qty*harga,
    catatan:document.getElementById('pb-catatan').value.trim()};
  if(idx!==''&&idx>=0){r.kode=DB.pembelian[parseInt(idx)].kode;DB.pembelian[parseInt(idx)]=r;catatAktivitas('Edit','Pembelian',`${r.item} — ${fmtRp(r.total)}`)}
  else{r.kode=buatKodeInventory('PB');DB.pembelian.unshift(r);catatAktivitas('Tambah','Pembelian',`${r.item} — ${fmtRp(r.total)}`)}
  saveDB(['pembelian']);filterPembelian();renderDashboard();closeModal('modal-tambah-pembelian');
}

// --- PENGGAJIAN ---
function filterPenggajian(){
  pagePenggajian=1;const q=(document.getElementById('q-penggajian').value||'').toLowerCase();
  const{start,end}=ppGetRange('pp-inventory');
  filteredPenggajian=DB.penggajian.filter(r=>(!q||(r.namaKaryawan||'').toLowerCase().includes(q)||(r.jabatan||'').toLowerCase().includes(q))&&(!r._date||(new Date(r._date)>=start&&new Date(r._date)<=end)));
  filteredPenggajian.sort((a,b)=>new Date(b._date||0)-new Date(a._date||0));
  renderPenggajianTable();
  renderInventorySummary();
}
function renderPenggajianTable(){
  const start=(pagePenggajian-1)*PER_PAGE;const slice=filteredPenggajian.slice(start,start+PER_PAGE);
  document.getElementById('tbl-penggajian').innerHTML=slice.length?slice.map(r=>{
    const ri=DB.penggajian.indexOf(r);
    return `<tr>
      <td>${r.tanggal}</td>
      <td style="font-weight:600">${esc(r.namaKaryawan)}</td>
      <td>${esc(r.jabatan||'–')}</td>
      <td>${esc(r.periode||'–')}</td>
      <td style="font-weight:700">${fmtRp(r.nominal)}</td>
      <td style="color:var(--text3);font-size:12px">${esc(r.catatan||'–')}</td>
      <td>${actionCellRW(`<div class="action-cell">
        <button class="btn btn-sm btn-icon" title="Edit" onclick="bukaEditPenggajian(${ri})">✏️</button>
        <button class="btn btn-sm btn-icon btn-danger" title="Hapus" onclick="konfirmHapus('penggajian',${ri})">🗑</button>
      </div>`)}</td>
    </tr>`}).join(''):`<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text3)">Belum ada data penggajian di periode ini</td></tr>`;
  renderPagination('pag-penggajian',filteredPenggajian.length,pagePenggajian,p=>{pagePenggajian=p;renderPenggajianTable()});
}
function bukaModalTambahPenggajian(){
  _editPenggajianIdx=-1;
  document.getElementById('modal-penggajian-title').textContent='🧑‍💼 Tambah Penggajian';
  document.getElementById('btn-simpan-penggajian').textContent='Simpan';
  document.getElementById('edit-penggajian-idx').value='';
  document.getElementById('pg-tgl').value=today();
  document.getElementById('pg-nama').value='';document.getElementById('pg-jabatan').value='';
  document.getElementById('pg-periode').value='';document.getElementById('pg-nominal').value=0;
  document.getElementById('pg-catatan').value='';
  openModal('modal-tambah-penggajian');
}
function bukaEditPenggajian(idx){
  const r=DB.penggajian[idx];_editPenggajianIdx=idx;
  document.getElementById('modal-penggajian-title').textContent='✏️ Edit Penggajian';
  document.getElementById('btn-simpan-penggajian').textContent='Simpan Perubahan';
  document.getElementById('edit-penggajian-idx').value=idx;
  document.getElementById('pg-tgl').value=(r._date||'').split('T')[0]||today();
  document.getElementById('pg-nama').value=r.namaKaryawan||'';document.getElementById('pg-jabatan').value=r.jabatan||'';
  document.getElementById('pg-periode').value=r.periode||'';document.getElementById('pg-nominal').value=r.nominal||0;
  document.getElementById('pg-catatan').value=r.catatan||'';
  openModal('modal-tambah-penggajian');
}
function simpanPenggajian(){
  if(!canWrite()){alert("Anda tidak punya izin untuk menambah/mengubah data penggajian.");return}
  const idx=document.getElementById('edit-penggajian-idx').value;
  const tglVal=document.getElementById('pg-tgl').value||today();
  const nama=document.getElementById('pg-nama').value.trim();
  if(!nama){alert('Nama karyawan wajib diisi');return}
  const r={tanggal:fmtTgl(new Date(tglVal)),_date:new Date(tglVal).toISOString(),namaKaryawan:nama,
    jabatan:document.getElementById('pg-jabatan').value.trim(),periode:document.getElementById('pg-periode').value.trim(),
    nominal:parseFloat(document.getElementById('pg-nominal').value)||0,catatan:document.getElementById('pg-catatan').value.trim()};
  if(idx!==''&&idx>=0){r.kode=DB.penggajian[parseInt(idx)].kode;DB.penggajian[parseInt(idx)]=r;catatAktivitas('Edit','Penggajian',`${r.namaKaryawan} — ${fmtRp(r.nominal)}`)}
  else{r.kode=buatKodeInventory('PG');DB.penggajian.unshift(r);catatAktivitas('Tambah','Penggajian',`${r.namaKaryawan} — ${fmtRp(r.nominal)}`)}
  saveDB(['penggajian']);filterPenggajian();renderDashboard();closeModal('modal-tambah-penggajian');
}
function exportPembelianCSV(){const h=csvRow(['Tanggal','Supplier','Item','Qty','Satuan','Harga Satuan','Total','Catatan'])+'\n';dlFile(h+DB.pembelian.map(r=>csvRow([r.tanggal,r.supplier,r.item,r.qty,r.satuan,r.hargaSatuan,r.total,r.catatan||''])).join('\n'),'pembelian_'+today()+'.csv','text/csv')}
function exportPenggajianCSV(){const h=csvRow(['Tanggal','Nama Karyawan','Jabatan','Periode','Nominal','Catatan'])+'\n';dlFile(h+DB.penggajian.map(r=>csvRow([r.tanggal,r.namaKaryawan,r.jabatan,r.periode,r.nominal,r.catatan||''])).join('\n'),'penggajian_'+today()+'.csv','text/csv')}

// ===== KATEGORI =====
function renderProduk(){
  const batas=(DB.pengaturan.batasStok!=null?DB.pengaturan.batasStok:10);
  document.getElementById('p-total-produk').textContent=[...new Set(DB.stok.map(s=>s.prod))].length;
  document.getElementById('p-total-varian').textContent=DB.stok.length.toLocaleString('id-ID');
  document.getElementById('p-total-kat').textContent=DB.kategori.length;
  document.getElementById('p-kritis').textContent=DB.stok.filter(s=>s.stok<=batas).length;
  renderKatList();renderKatPerf();renderMpList();renderMpDistChart();renderKatStokChart();
}

function renderKatList(){
  document.getElementById('kat-list').innerHTML=DB.kategori.length?DB.kategori.map((k,i)=>{
    const cnt=DB.stok.filter(s=>s.kat===k.nama).length;
    const jual=flattenPenjualan().filter(r=>r.kat===k.nama&&r.status!=='Dibatalkan').length;
    return `<div style="display:flex;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);gap:12px">
      <div style="width:16px;height:16px;border-radius:4px;background:${k.color};flex-shrink:0"></div>
      <div style="flex:1"><div style="font-weight:600;font-size:13px">${k.nama}</div><div style="font-size:11px;color:var(--text3)">${cnt} varian stok · ${jual} barang terjual</div></div>
      <div class="action-cell">
        <button class="btn btn-sm btn-icon" onclick="bukaEditKat(${i})">✏️</button>
        <button class="btn btn-sm btn-icon btn-danger" onclick="konfirmHapus('kat',${i})">🗑</button>
      </div></div>`}).join(''):`<div style="color:var(--text3);text-align:center;padding:24px">Belum ada kategori</div>`;
}

function renderKatPerf(){
  const pm={};DB.kategori.forEach(k=>pm[k.nama]={rev:0,qty:0,color:k.color});
  flattenPenjualan().filter(r=>r.status!=='Dibatalkan').forEach(r=>{if(pm[r.kat]){pm[r.kat].rev+=r.total;pm[r.kat].qty+=r.qty}});
  const arr=Object.entries(pm).sort((a,b)=>b[1].rev-a[1].rev);const maxR=Math.max(...arr.map(e=>e[1].rev))||1;
  document.getElementById('kat-perf-bars').innerHTML=arr.map(([n,d])=>`
    <div class="prog-row"><div class="prog-label">${n}</div>
    <div class="prog-track"><div class="prog-fill" style="width:${Math.round(d.rev/maxR*100)}%;background:${d.color}"></div></div>
    <div class="prog-val">${(d.rev/1e6).toFixed(1)}jt</div></div>`).join('');
}

function renderMpDistChart(){
  if(charts.mpDist)charts.mpDist.destroy();
  const cnt={};MP_LIST.forEach(m=>cnt[m]=0);DB.penjualan.forEach(r=>{if(cnt[r.mp]!==undefined)cnt[r.mp]++});
  charts.mpDist=new Chart(document.getElementById('chartMpDist'),{type:'doughnut',data:{labels:MP_LIST,datasets:[{data:MP_LIST.map(m=>cnt[m]),backgroundColor:MP_LIST.map(m=>getMpColor(m)),borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:11},boxWidth:12}}}}});
}

function renderKatStokChart(){
  const katStok={};DB.kategori.forEach(k=>katStok[k.nama]=0);DB.stok.forEach(s=>{if(katStok[s.kat]!==undefined)katStok[s.kat]+=s.stok});
  if(charts.katStok)charts.katStok.destroy();
  charts.katStok=new Chart(document.getElementById('chartKatStok'),{type:'bar',data:{labels:Object.keys(katStok),datasets:[{label:'Total Stok',data:Object.values(katStok),backgroundColor:DB.kategori.map(k=>k.color+'cc'),borderWidth:0,borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#888',font:{size:11}},grid:{display:false}},y:{ticks:{color:'#888',font:{size:10}},grid:{color:'rgba(128,128,128,.1)'}}}}});
}

function bukaModalTambahKat(){
  _editKatIdx=-1;_selectedKatColor=KAT_COLORS[DB.kategori.length%KAT_COLORS.length];
  document.getElementById('modal-kat-title').textContent='🏷️ Tambah Kategori';
  document.getElementById('edit-kat-idx').value='';document.getElementById('kat-nama').value='';
  renderColorSwatch();openModal('modal-tambah-kat');
}
function bukaEditKat(idx){
  _editKatIdx=idx;const k=DB.kategori[idx];_selectedKatColor=k.color;
  document.getElementById('modal-kat-title').textContent='✏️ Edit Kategori';
  document.getElementById('edit-kat-idx').value=idx;document.getElementById('kat-nama').value=k.nama;
  renderColorSwatch();openModal('modal-tambah-kat');
}
function renderColorSwatch(){
  document.getElementById('kat-color-swatch').innerHTML=KAT_COLORS.map(c=>`<span style="background:${c}" class="${c===_selectedKatColor?'selected':''}" onclick="selectKatColor('${c}')"></span>`).join('');
}
function selectKatColor(c){_selectedKatColor=c;renderColorSwatch()}
function simpanKategori(){
  if(!canManageSettings()){alert("Hanya Owner yang bisa mengelola kategori.");return}
  const nama=document.getElementById('kat-nama').value.trim();if(!nama){alert('Nama kategori wajib diisi');return}
  const idx=document.getElementById('edit-kat-idx').value;
  const isEdit=idx!==''&&idx>=0;
  if(isEdit)DB.kategori[parseInt(idx)]={nama,color:_selectedKatColor};else DB.kategori.push({nama,color:_selectedKatColor});
  catatAktivitas(isEdit?'Edit':'Tambah','Kategori',nama);
  saveDB(['kategori']);populateKatDropdowns();renderKatList();renderKatPerf();closeModal('modal-tambah-kat');
}

// ===== MARKETPLACE (CRUD) =====
function renderMpList(){
  const el=document.getElementById('mp-list-manage');if(!el)return;
  el.innerHTML=DB.marketplace.length?DB.marketplace.map((m,i)=>{
    const cnt=DB.penjualan.filter(r=>r.mp===m.nama).length;
    return `<div class="mp-manage-row">
      <div class="mp-manage-left">
        <span class="mp-manage-dot" style="background:${m.color}"></span>
        <div><div style="font-weight:600">${m.nama}</div><div style="font-size:11px;color:var(--text3)">${cnt} pesanan</div></div>
      </div>
      <div class="mp-manage-actions">
        <button class="btn btn-sm btn-icon" onclick="bukaEditMp(${i})">✏️</button>
        <button class="btn btn-sm btn-icon btn-danger" onclick="konfirmHapus('mp',${i})">🗑</button>
      </div></div>`}).join(''):`<div style="color:var(--text3);text-align:center;padding:24px">Belum ada marketplace</div>`;
}
function bukaModalTambahMp(){
  _editMpIdx=-1;_selectedMpColor=MP_COLOR_CHOICES[DB.marketplace.length%MP_COLOR_CHOICES.length];
  document.getElementById('modal-mp-title').textContent='🛒 Tambah Marketplace';
  document.getElementById('edit-mp-idx').value='';document.getElementById('mp-nama').value='';
  renderMpColorSwatch();openModal('modal-tambah-mp');
}
function bukaEditMp(idx){
  _editMpIdx=idx;const m=DB.marketplace[idx];_selectedMpColor=m.color;
  document.getElementById('modal-mp-title').textContent='✏️ Edit Marketplace';
  document.getElementById('edit-mp-idx').value=idx;document.getElementById('mp-nama').value=m.nama;
  renderMpColorSwatch();openModal('modal-tambah-mp');
}
function renderMpColorSwatch(){
  document.getElementById('mp-color-swatch').innerHTML=MP_COLOR_CHOICES.map(c=>`<span style="background:${c}" class="${c===_selectedMpColor?'selected':''}" onclick="selectMpColor('${c}')"></span>`).join('');
}
function selectMpColor(c){_selectedMpColor=c;renderMpColorSwatch()}
function simpanMarketplace(){
  if(!canManageSettings()){alert("Hanya Owner yang bisa mengelola marketplace.");return}
  const nama=document.getElementById('mp-nama').value.trim();if(!nama){alert('Nama marketplace wajib diisi');return}
  const idx=document.getElementById('edit-mp-idx').value;
  const dup=DB.marketplace.some((m,i)=>m.nama.toLowerCase()===nama.toLowerCase()&&i!==parseInt(idx));
  if(dup){alert('Nama marketplace sudah ada');return}
  const oldNama=(idx!==''&&idx>=0)?DB.marketplace[parseInt(idx)].nama:null;
  if(idx!==''&&idx>=0){
    DB.marketplace[parseInt(idx)]={nama,color:_selectedMpColor};
    // Jika nama marketplace diubah, update juga data transaksi & biaya yang mereferensikannya
    if(oldNama&&oldNama!==nama){
      DB.penjualan.forEach(r=>{if(r.mp===oldNama)r.mp=nama});
      if(DB.biaya&&DB.biaya.mp_fee&&DB.biaya.mp_fee[oldNama]!==undefined){DB.biaya.mp_fee[nama]=DB.biaya.mp_fee[oldNama];delete DB.biaya.mp_fee[oldNama]}
    }
  }else{
    DB.marketplace.push({nama,color:_selectedMpColor});
    if(DB.biaya&&DB.biaya.mp_fee&&DB.biaya.mp_fee[nama]===undefined)DB.biaya.mp_fee[nama]=3;
  }
  refreshMpGlobals();saveDB(['marketplace','biaya']);populateMpDropdowns();renderMpList();renderDashboard();closeModal('modal-tambah-mp');
  catatAktivitas(oldNama?'Edit':'Tambah','Marketplace',nama);
}
function populateMpDropdowns(){
  const ids=['f-mp','f-mp-jual','f-mp-laba'];
  ids.forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    const isFilter=id!=='f-mp';
    const current=el.value;
    el.innerHTML=(isFilter?'<option value="">Semua Marketplace</option>':'')+MP_LIST.map(n=>`<option>${n}</option>`).join('');
    if(current&&MP_LIST.includes(current))el.value=current;
  });
}

// Override button behavior from HTML to call proper functions
document.addEventListener('DOMContentLoaded',function(){
  document.querySelector('[onclick="openModal(\'modal-tambah-jual\')"]') && (document.querySelector('[onclick="openModal(\'modal-tambah-jual\')"]').onclick=bukaModalTambahJual);
});

// Cari HPP/pcs dari data Stok & Gudang untuk produk (+varian jika cocok).
// Mengganti sumber lama (input manual di Laba & Biaya) -> kini HPP diisi
// langsung di menu Tambah/Edit Produk Stok.
function getHppDariStok(prod,varian){
  if(!DB.stok||!DB.stok.length)return null;
  const exact=DB.stok.find(s=>s.prod===prod&&s.varian===varian&&s.hpp!=null&&s.hpp>0);
  if(exact)return exact.hpp;
  const sameProd=DB.stok.filter(s=>s.prod===prod&&s.hpp!=null&&s.hpp>0);
  if(sameProd.length)return sameProd.reduce((a,s)=>a+s.hpp,0)/sameProd.length;
  return null;
}

// ===== LABA PER PRODUK =====
// Menghitung laba untuk 1 BARIS ITEM (bukan 1 pesanan utuh — pesanan dengan
// beberapa barang harus dipecah dulu lewat flattenPenjualan() sebelum dipanggil
// di sini, supaya biaya admin/tambahan per pesanan teralokasi proporsional
// ke tiap barang, dan HPP dihitung sesuai produk masing-masing).
function hitungLaba(r){
  const biaya=DB.biaya||DEFAULT_BIAYA;const omzet=r.total||0;
  let mpFee;
  if(r.biayaAdmin!=null){mpFee=r.biayaAdmin}
  else{const feeMp=biaya.mp_fee[r.mp];mpFee=(feeMp!=null?feeMp:3)/100*omzet}
  let extra;
  if(r.biayaTambahan!=null){extra=r.biayaTambahan}
  else{extra=(biaya.extra.ongkir||0)+(biaya.extra.packaging||0)+(biaya.extra.lain||0)}
  // ===== HPP: HANYA dari data Stok & Gudang (tidak ada lagi mode %) =====
  let hpp=0;
  if(r.hpp!=null){
    // ✅ PAKAI HPP YANG SUDAH DIBEKUKAN saat pesanan ini dibuat/diedit —
    // supaya laba pesanan lama TIDAK ikut berubah kalau HPP produk di Stok
    // Gudang naik/turun setelahnya. Ini nilai yang disimpan di kolom
    // `hpp_saat_transaksi` (tabel pesanan_item).
    hpp=r.hpp*(r.qty||1);
  }else{
    // Fallback HANYA untuk data lama yang dibuat sebelum fitur pembekuan HPP
    // ini ada (belum punya snapshot) -> ambil HPP master Stok Gudang saat ini.
    // Kalau produk/varian tidak ditemukan sama sekali di Stok Gudang, HPP
    // dianggap Rp 0 (bukan estimasi %) — perbaiki data Stok Gudangnya, atau
    // buka & simpan ulang pesanan ini supaya HPP-nya bisa dibekukan.
    const ph=getHppDariStok(r.prod,r.varian);hpp=(ph!=null)?ph*(r.qty||1):0;
  }
  const laba=omzet-mpFee-extra-hpp;
  return{omzet,hpp,mpFee,extra,laba,margin:omzet>0?laba/omzet*100:0};
}

function getLabaPerProduk(filterMP,filterKat){
  const map={};
  flattenPenjualan().filter(r=>r.status!=='Dibatalkan'&&(!filterMP||r.mp===filterMP)&&(!filterKat||r.kat===filterKat)).forEach(r=>{
    const key=r.prod+'|||'+r.mp;
    if(!map[key])map[key]={prod:r.prod,kat:r.kat||'–',mp:r.mp,qty:0,omzet:0,hpp:0,mpFee:0,extra:0,laba:0};
    const h=hitungLaba(r);map[key].qty+=r.qty||1;map[key].omzet+=h.omzet;map[key].hpp+=h.hpp;map[key].mpFee+=h.mpFee;map[key].extra+=h.extra;map[key].laba+=h.laba;
  });
  return Object.values(map).map(p=>({...p,margin:p.omzet>0?p.laba/p.omzet*100:0}));
}

function renderLabaSection(){renderLabaRingkasan()}
function switchLabaTab(tab,el){
  document.querySelectorAll('.tab-pill').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.laba-sub').forEach(s=>s.classList.remove('active'));
  if(el)el.classList.add('active');
  document.getElementById('laba-'+tab).classList.add('active');
  if(tab==='pertabel'){_labaData=getLabaPerProduk();_labaFiltered=[..._labaData];populateKatDropdowns();renderLabaTable()}
  if(tab==='ringkasan')renderLabaRingkasan();
}
function renderLabaRingkasan(){
  const allOrders=DB.penjualan.filter(r=>r.status!=='Dibatalkan');
  const all=flattenPenjualan(allOrders);
  let to=0,th=0,tf=0,te=0,tl=0;all.forEach(r=>{const h=hitungLaba(r);to+=h.omzet;th+=h.hpp;tf+=h.mpFee;te+=h.extra;tl+=h.laba});
  // Sama seperti Dashboard & Laporan Keuangan: laba bersih di sini juga
  // sudah dikurangi pengeluaran operasional (Pembelian & Penggajian) —
  // dihitung sepanjang waktu (tanpa filter periode) karena kartu ini
  // menampilkan ringkasan keseluruhan, bukan per periode.
  const totalOpexAll=totalPembelianPeriode(null,null)+totalPenggajianPeriode(null,null);
  tl-=totalOpexAll;
  const margin=to>0?tl/to*100:0;
  document.getElementById('laba-metrics').innerHTML=`
    <div class="metric-card m-accent"><div class="metric-icon">💵</div><div class="metric-label">Total Omzet</div><div class="metric-value">${fmtRp(to)}</div><div class="metric-sub" style="color:var(--text3)">${allOrders.length} pesanan · ${all.length} barang</div></div>
    <div class="metric-card m-warning"><div class="metric-icon">🏬</div><div class="metric-label">Total Biaya Admin MP</div><div class="metric-value orange">${fmtRp(tf)}</div><div class="metric-sub orange">${to>0?(tf/to*100).toFixed(1):0}% dari omzet</div></div>
    <div class="metric-card m-danger"><div class="metric-icon">🏭</div><div class="metric-label">Total HPP</div><div class="metric-value red">${fmtRp(th)}</div><div class="metric-sub red">${to>0?(th/to*100).toFixed(1):0}% dari omzet</div></div>
    <div class="metric-card metric-hero${tl>=0?'':' metric-hero-danger'}"><div class="metric-icon">${tl>=0?'📈':'📉'}</div><div class="metric-label">Laba Bersih</div><div class="metric-value metric-value-lg">${fmtRp(tl)}</div><div class="metric-sub">${margin.toFixed(1)}% margin${totalOpexAll>0?' · sudah dikurangi opex '+fmtRp(totalOpexAll):''}</div></div>`;

  const mpData={};MP_LIST.forEach(m=>mpData[m]={laba:0,biaya:0});
  all.forEach(r=>{const h=hitungLaba(r);if(!mpData[r.mp])mpData[r.mp]={laba:0,biaya:0};mpData[r.mp].laba+=h.laba;mpData[r.mp].biaya+=h.omzet-h.laba});
  if(charts.labaMP)charts.labaMP.destroy();
  charts.labaMP=new Chart(document.getElementById('chartLabaMP'),{type:'bar',data:{labels:MP_LIST,datasets:[
    {label:'Laba Bersih',data:MP_LIST.map(m=>Math.round(mpData[m].laba/1000)),backgroundColor:'rgba(26,127,71,.8)',borderRadius:4},
    {label:'Total Biaya',data:MP_LIST.map(m=>Math.round(mpData[m].biaya/1000)),backgroundColor:'rgba(185,28,28,.5)',borderRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:11},boxWidth:12}}},
      scales:{x:{ticks:{color:'#888',font:{size:11}},grid:{display:false}},y:{ticks:{color:'#888',font:{size:10},callback:v=>v+'rb'},grid:{color:'rgba(128,128,128,.1)'}}}}});

  // Catatan: sejak biaya tambahan diisi sebagai 1 angka per pesanan (bukan
  // rincian ongkir/packaging/lain terpisah), grafik ini TIDAK LAGI membelah
  // angka itu dengan asumsi rasio tetap (dulu 60/40) karena itu memalsukan
  // data — sekarang ditampilkan apa adanya sebagai 1 kategori "Ongkir & Biaya Lain".
  if(charts.biayaPie)charts.biayaPie.destroy();
  charts.biayaPie=new Chart(document.getElementById('chartBiayaPie'),{type:'doughnut',data:{labels:['HPP','Admin MP','Ongkir & Biaya Lain'],datasets:[{data:[Math.round(th),Math.round(tf),Math.round(te)],backgroundColor:['#5b5ea6','#ee4d2d','#f59e0b'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'60%'}});
  const blabels=['HPP','Admin MP','Ongkir & Biaya Lain'];const bcolors=['#5b5ea6','#ee4d2d','#f59e0b'];const bvals=[th,tf,te];
  document.getElementById('biaya-pie-legend').innerHTML=blabels.map((l,i)=>`<span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:${bcolors[i]}"></span>${l}: ${to>0?(bvals[i]/to*100).toFixed(1):0}%</span>`).join('');

  const byProd={};all.forEach(r=>{if(!byProd[r.prod])byProd[r.prod]={prod:r.prod,laba:0,omzet:0};const h=hitungLaba(r);byProd[r.prod].laba+=h.laba;byProd[r.prod].omzet+=h.omzet});
  const pa=Object.values(byProd).map(p=>({...p,margin:p.omzet>0?p.laba/p.omzet*100:0}));
  const tt=[...pa].sort((a,b)=>b.laba-a.laba).slice(0,5);const tr=[...pa].sort((a,b)=>a.margin-b.margin).slice(0,5);
  document.getElementById('top-laba-tinggi').innerHTML=tt.map(p=>`<div class="prog-row"><div class="prog-label">${p.prod}</div><div class="prog-track"><div class="prog-fill" style="width:${Math.max(0,Math.min(100,p.margin))}%;background:var(--success)"></div></div><div class="prog-val green">+${(p.laba/1e6).toFixed(1)}jt</div></div>`).join('');
  document.getElementById('top-laba-rendah').innerHTML=tr.map(p=>`<div class="prog-row"><div class="prog-label">${p.prod}</div><div class="prog-track"><div class="prog-fill" style="width:${Math.max(0,Math.min(100,Math.abs(p.margin)))}%;background:var(--danger)"></div></div><div class="prog-val" style="color:var(--${p.margin<0?'danger':'warning'})">${p.margin.toFixed(1)}%</div></div>`).join('');

  // Biaya admin per marketplace tabel
  const b=DB.biaya||DEFAULT_BIAYA;
  const mpDetail={};MP_LIST.forEach(m=>{mpDetail[m]={omzet:0,fee:0,laba:0,trx:0}});
  all.forEach(r=>{const h=hitungLaba(r);if(mpDetail[r.mp]){mpDetail[r.mp].omzet+=h.omzet;mpDetail[r.mp].fee+=h.mpFee;mpDetail[r.mp].laba+=h.laba;mpDetail[r.mp].trx++}});
  const mpDetailEl=document.getElementById('laba-mp-admin-table');
  if(mpDetailEl)mpDetailEl.innerHTML=`<table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr>
      <th style="text-align:left;padding:8px 12px;color:var(--text3);font-size:11px;text-transform:uppercase;border-bottom:1px solid var(--border);background:var(--surface2)">Marketplace</th>
      <th style="text-align:left;padding:8px 12px;color:var(--text3);font-size:11px;text-transform:uppercase;border-bottom:1px solid var(--border);background:var(--surface2)">Tarif Admin</th>
      <th style="text-align:left;padding:8px 12px;color:var(--text3);font-size:11px;text-transform:uppercase;border-bottom:1px solid var(--border);background:var(--surface2)">Omzet</th>
      <th style="text-align:left;padding:8px 12px;color:var(--text3);font-size:11px;text-transform:uppercase;border-bottom:1px solid var(--border);background:var(--surface2)">Total Biaya Admin</th>
      <th style="text-align:left;padding:8px 12px;color:var(--text3);font-size:11px;text-transform:uppercase;border-bottom:1px solid var(--border);background:var(--surface2)">Laba Bersih</th>
      <th style="text-align:left;padding:8px 12px;color:var(--text3);font-size:11px;text-transform:uppercase;border-bottom:1px solid var(--border);background:var(--surface2)">Margin</th>
      <th style="text-align:left;padding:8px 12px;color:var(--text3);font-size:11px;text-transform:uppercase;border-bottom:1px solid var(--border);background:var(--surface2)">Transaksi</th>
    </tr></thead>
    <tbody>${MP_LIST.map(m=>{const d=mpDetail[m];const mg=d.omzet>0?d.laba/d.omzet*100:0;const mc=mg>=30?'var(--success)':mg>=15?'var(--warning)':'var(--danger)';return`<tr>
      <td style="padding:9px 12px;border-bottom:1px solid var(--border)"><span class="mp-tag" style="${mpTagStyle(m)}">${m}</span></td>
      <td style="padding:9px 12px;border-bottom:1px solid var(--border);color:var(--warning);font-weight:700">${b.mp_fee[m]!=null?b.mp_fee[m]:3}%</td>
      <td style="padding:9px 12px;border-bottom:1px solid var(--border);font-weight:600">${fmtRp(d.omzet)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid var(--border);color:var(--warning);font-weight:600">${fmtRp(d.fee)} <span style="font-size:10px;color:var(--text3)">(${d.omzet>0?(d.fee/d.omzet*100).toFixed(1):0}%)</span></td>
      <td style="padding:9px 12px;border-bottom:1px solid var(--border);font-weight:700;color:${d.laba>=0?'var(--success)':'var(--danger)'}">${fmtRp(d.laba)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid var(--border)"><div class="margin-bar"><div class="margin-track"><div class="margin-fill" style="width:${Math.max(0,Math.min(100,mg))}%;background:${mc}"></div></div><span style="font-weight:700;color:${mc}">${mg.toFixed(1)}%</span></div></td>
      <td style="padding:9px 12px;border-bottom:1px solid var(--border);color:var(--text2)">${d.trx}</td>
    </tr>`}).join('')}</tbody>
    <tfoot><tr style="background:var(--surface2)">
      <td style="padding:9px 12px;font-weight:700" colspan="2">TOTAL</td>
      <td style="padding:9px 12px;font-weight:700">${fmtRp(to)}</td>
      <td style="padding:9px 12px;font-weight:700;color:var(--warning)">${fmtRp(tf)}</td>
      <td style="padding:9px 12px;font-weight:700;color:${tl>=0?'var(--success)':'var(--danger)'}">${fmtRp(tl)}</td>
      <td style="padding:9px 12px;font-weight:700;color:${margin>=20?'var(--success)':'var(--danger)'}">${margin.toFixed(1)}%</td>
      <td style="padding:9px 12px;font-weight:700">${all.length}</td>
    </tr></tfoot>
  </table>`;

  // Laba per kategori
  const byKat={};DB.kategori.forEach(k=>byKat[k.nama]={nama:k.nama,color:k.color,omzet:0,laba:0,fee:0,trx:0});
  // Dihitung per BARANG (pakai `all` = hasil flattenPenjualan yang sudah dipecah per item),
  // bukan per pesanan -- karena 1 pesanan sekarang bisa berisi barang dari beberapa kategori sekaligus.
  all.forEach(r=>{const kat=r.kat||'Lainnya';if(!byKat[kat])byKat[kat]={nama:kat,color:'#888',omzet:0,laba:0,fee:0,trx:0};const h=hitungLaba(r);byKat[kat].omzet+=h.omzet;byKat[kat].laba+=h.laba;byKat[kat].fee+=h.mpFee;byKat[kat].trx++});
  const katArr=Object.values(byKat).filter(k=>k.trx>0).sort((a,b)=>b.laba-a.laba);const maxKatLaba=Math.max(...katArr.map(k=>k.laba),1);
  const katEl=document.getElementById('laba-per-kat');
  if(katEl)katEl.innerHTML=katArr.map(k=>`<div class="prog-row">
    <div style="width:10px;height:10px;border-radius:3px;background:${k.color};flex-shrink:0"></div>
    <div class="prog-label" style="width:100px">${k.nama}</div>
    <div class="prog-track"><div class="prog-fill" style="width:${Math.round(k.laba/maxKatLaba*100)}%;background:${k.color}"></div></div>
    <div class="prog-val" style="width:90px;color:var(--success);font-weight:600">${fmtRingkas(k.laba)}</div>
    <div style="width:45px;text-align:right;font-size:11px;color:var(--text3)">${k.omzet>0?(k.laba/k.omzet*100).toFixed(0):0}%</div>
  </div>`).join('');
}

function filterLabaTable(){
  pageLaba=1;const q=(document.getElementById('q-laba').value||'').toLowerCase();const mp=document.getElementById('f-mp-laba').value;const kat=document.getElementById('f-kat-laba').value;const sort=document.getElementById('f-sort-laba').value;
  _labaFiltered=_labaData.filter(r=>(!q||r.prod.toLowerCase().includes(q))&&(!mp||r.mp===mp)&&(!kat||r.kat===kat));
  if(sort==='laba_desc')_labaFiltered.sort((a,b)=>b.laba-a.laba);
  else if(sort==='laba_asc')_labaFiltered.sort((a,b)=>a.laba-b.laba);
  else if(sort==='margin_desc')_labaFiltered.sort((a,b)=>b.margin-a.margin);
  else if(sort==='margin_asc')_labaFiltered.sort((a,b)=>a.margin-b.margin);
  else if(sort==='omzet_desc')_labaFiltered.sort((a,b)=>b.omzet-a.omzet);
  renderLabaTable();
}
function renderLabaTable(){
  const start=(pageLaba-1)*PER_PAGE,slice=_labaFiltered.slice(start,start+PER_PAGE);
  document.getElementById('tbl-laba').innerHTML=slice.length?slice.map(r=>{
    const mc=r.margin>=30?'laba-positive':r.margin>=15?'laba-neutral':'laba-negative';
    const bc=r.margin>=30?'var(--success)':r.margin>=15?'var(--warning)':'var(--danger)';
    return `<tr>
      <td style="font-weight:600">${r.prod}</td>
      <td><span class="badge badge-gray" style="background:${getKatColor(r.kat)}22;color:${getKatColor(r.kat)}">${r.kat}</span></td>
      <td><span class="mp-tag" style="${mpTagStyle(r.mp)}">${r.mp}</span></td>
      <td style="text-align:center">${r.qty}</td>
      <td style="font-weight:600">${fmtRp(r.omzet)}</td>
      <td style="color:var(--text2)">${fmtRp(r.hpp)}</td>
      <td><span style="color:var(--warning);font-weight:600">${fmtRp(r.mpFee)}</span> <span style="font-size:10px;color:var(--text3)">(${r.omzet>0?(r.mpFee/r.omzet*100).toFixed(1):0}%)</span></td>
      <td style="color:var(--text2)">${fmtRp(r.extra)}</td>
      <td class="${r.laba>=0?'laba-positive':'laba-negative'}">${fmtRp(r.laba)}</td>
      <td><div class="margin-bar"><div class="margin-track"><div class="margin-fill" style="width:${Math.max(0,Math.min(100,r.margin))}%;background:${bc}"></div></div><span class="${mc}">${r.margin.toFixed(1)}%</span></div></td>
    </tr>`}).join(''):`<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text3)">Tidak ada data</td></tr>`;
  renderPagination('pag-laba',_labaFiltered.length,pageLaba,p=>{pageLaba=p;renderLabaTable()});
}

// Catatan: dulu ada mode "% Global dari omzet" untuk estimasi HPP cepat.
// Sekarang DIHAPUS — HPP selalu dihitung dari data Stok & Gudang (kolom HPP
// per produk-varian) atau dari snapshot HPP per transaksi (hitungLaba()).
// Kalau HPP sebuah produk berubah, cukup edit di menu Stok & Gudang.

// ===== LAPORAN =====
function renderLaporan(){
  const{start,end,label}=ppGetRange('pp-laporan');
  const semuaAktif=DB.penjualan.filter(r=>r.status!=='Dibatalkan'&&r._date);
  const dalamRentang=semuaAktif.filter(r=>{const d=new Date(r._date);return d>=start&&d<=end});
  // PENTING: hitungLaba() butuh baris per-BARANG (prod/varian/qty), bukan
  // per-PESANAN (yang sejak skema multi-item hanya punya `items:[]`, tanpa
  // field prod/varian di level header). Kalau dihitung langsung dari
  // `dalamRentang` (level pesanan), mode HPP "per produk" gagal mengenali
  // produknya (r.prod selalu undefined) dan diam-diam jatuh balik ke
  // estimasi %, sehingga HPP Estimasi / Estimasi Laba Bersih / Margin
  // Bersih di kartu Ringkasan Keuangan jadi salah. Flatten dulu di sini,
  // sama seperti yang sudah benar dilakukan di renderDashboard() &
  // renderLabaRingkasan().
  const dalamRentangFlat=flattenPenjualan(dalamRentang);

  const judulEl=document.getElementById('keuangan-title');
  if(judulEl)judulEl.textContent='Ringkasan Keuangan — '+label;

  const pMeta=document.getElementById('fin-print-periode');
  if(pMeta)pMeta.textContent='Periode: '+label;
  const tMeta=document.getElementById('fin-print-tanggal');
  if(tMeta)tMeta.textContent='Dicetak: '+new Date().toLocaleString('id-ID',{dateStyle:'long',timeStyle:'short'});
  const toko=document.getElementById('fin-print-toko');
  if(toko)toko.textContent=DB.pengaturan.nama||'Toko Saya';
  const printLogo=document.getElementById('fin-print-logo');
  if(printLogo){
    if(DB.pengaturan.logo){printLogo.src=DB.pengaturan.logo;printLogo.style.display='block'}
    else{printLogo.style.display='none'}
  }

  const rowsEl=document.getElementById('keuangan-rows');
  const{to,tl:tlKotor,tf,te,th}=hitungRingkasPeriode(dalamRentangFlat);
  // Pengeluaran operasional (Inventory: Pembelian & Penggajian) di periode
  // laporan yang sama, dikurangkan dari laba bersih penjualan supaya
  // "Estimasi Laba Bersih" di Laporan Keuangan konsisten dengan Dashboard.
  const totalBeliOpex=totalPembelianPeriode(start,end);
  const totalGajiOpex=totalPenggajianPeriode(start,end);
  const totalOpex=totalBeliOpex+totalGajiOpex;
  const tl=tlKotor-totalOpex;
  const margin=to>0?tl/to*100:0;
  if(rowsEl){
    // Grid seragam 3 kolom x 2 baris — Total Omzet & Estimasi Laba Bersih
    // sejajar rapi dengan kartu rincian biaya di baris masing-masing
    // (tidak ada lagi kartu "hero" yang melebar penuh):
    //   Baris 1: Total Omzet | Biaya Admin Marketplace | Ongkir & Biaya Lain
    //   Baris 2: HPP Estimasi | Pengeluaran Operasional | Estimasi Laba Bersih
    const cards=[
      {l:'Total Omzet',v:fmtRp(to),icon:'💵',cls:'fm-accent',sub:dalamRentang.length+' pesanan di periode ini'},
      {l:'Biaya Admin Marketplace',v:'− '+fmtRp(tf),icon:'🏬',cls:'fm-warning',sub:to>0?(tf/to*100).toFixed(1)+'% dari omzet':'–'},
      {l:'Ongkir & Biaya Lain-lain',v:'− '+fmtRp(te),icon:'📦',cls:'fm-warning',sub:to>0?(te/to*100).toFixed(1)+'% dari omzet':'–'},
      {l:'HPP Estimasi',v:'− '+fmtRp(th),icon:'🏭',cls:'fm-danger',sub:to>0?(th/to*100).toFixed(1)+'% dari omzet':'–'},
      {l:'Pengeluaran Operasional',v:'− '+fmtRp(totalOpex),icon:'🧾',cls:'fm-danger',sub:'Pembelian '+fmtRp(totalBeliOpex)+' · Gaji '+fmtRp(totalGajiOpex)},
      {l:'Estimasi Laba Bersih',v:fmtRp(tl),icon:tl>=0?'📈':'📉',cls:tl>=0?'fm-success':'fm-danger',sub:margin.toFixed(1)+'% margin bersih'},
    ];
    rowsEl.innerHTML=cards.map(c=>`
      <div class="fin-metric ${c.cls}">
        <div class="fin-metric-icon">${c.icon}</div>
        <div class="fin-metric-label">${c.l}</div>
        <div class="fin-metric-value">${c.v}</div>
        <div class="fin-metric-sub">${c.sub}</div>
      </div>`).join('');
  }

  // Donut komposisi biaya (HPP / Admin MP / Ongkir & Lain) — cerminan dari
  // total yang sama persis dengan kartu di atas, dihitung dari data yang
  // sudah difilter sesuai periode terpilih.
  const pieCanvas=document.getElementById('chartKeuanganPie');
  if(pieCanvas){
    if(charts.keuanganPie)charts.keuanganPie.destroy();
    charts.keuanganPie=new Chart(pieCanvas,{type:'doughnut',data:{labels:['HPP','Admin MP','Ongkir & Biaya Lain','Operasional (Beli+Gaji)'],datasets:[{data:[Math.round(th),Math.round(tf),Math.round(te),Math.round(totalOpex)],backgroundColor:['#5b5ea6','#ee4d2d','#f59e0b','#ef4444'],borderWidth:0,hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'68%'}});
    const blabels=['HPP','Admin MP','Ongkir & Biaya Lain','Operasional (Beli+Gaji)'];const bcolors=['#5b5ea6','#ee4d2d','#f59e0b','#ef4444'];const bvals=[th,tf,te,totalOpex];
    const legendEl=document.getElementById('keuangan-pie-legend');
    if(legendEl)legendEl.innerHTML=blabels.map((l,i)=>`<span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:${bcolors[i]}"></span>${l}: ${to>0?(bvals[i]/to*100).toFixed(1):0}%</span>`).join('');
  }

  if(charts.mpBar)charts.mpBar.destroy();
  const mpRev={};MP_LIST.forEach(m=>mpRev[m]=0);dalamRentang.forEach(r=>mpRev[r.mp]=(mpRev[r.mp]||0)+(r.total||0));
  charts.mpBar=new Chart(document.getElementById('chartMpBar'),{type:'bar',data:{labels:MP_LIST,datasets:[{label:'Revenue',data:MP_LIST.map(m=>Math.round(mpRev[m]/1e6*10)/10),backgroundColor:MP_LIST.map(m=>getMpColor(m)),borderWidth:0,borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#888',font:{size:11}},grid:{display:false}},y:{ticks:{color:'#888',font:{size:10},callback:v=>'Rp'+v+'jt'},grid:{color:'rgba(128,128,128,.1)'}}}}});

  renderAsetStokChart();
  renderTrenOmzetChart(start,end);
}

// Bucket bulan yang akan ditampilkan grafik "Tren Omzet" — mengikuti
// Periode Data, tapi kalau periodenya terlalu pendek (<3 bulan kalender)
// otomatis diperluas ke 6 bulan terakhir supaya tetap terasa sebagai TREN
// (bukan cuma 1-2 titik). Periode sangat panjang (mis. "Semua Waktu")
// dipersempit ke rentang transaksi yang benar-benar ada, maks 24 bulan.
function hitungBucketBulan(start,end){
  let rangeStart=new Date(start.getFullYear(),start.getMonth(),1);
  let rangeEnd=new Date(end.getFullYear(),end.getMonth(),1);
  const spanBulan=(rangeEnd.getFullYear()-rangeStart.getFullYear())*12+(rangeEnd.getMonth()-rangeStart.getMonth())+1;
  if(spanBulan<3){
    rangeStart=new Date(rangeEnd.getFullYear(),rangeEnd.getMonth()-5,1);
  }else if(spanBulan>24){
    const dataDates=DB.penjualan.filter(r=>r.status!=='Dibatalkan'&&r._date).map(r=>new Date(r._date)).filter(d=>!isNaN(d));
    if(dataDates.length){
      const minD=new Date(Math.min(...dataDates.map(d=>d.getTime())));
      const maxD=new Date(Math.max(...dataDates.map(d=>d.getTime())));
      const minM=new Date(minD.getFullYear(),minD.getMonth(),1);
      const maxM=new Date(maxD.getFullYear(),maxD.getMonth(),1);
      if(minM>rangeStart)rangeStart=minM;
      if(maxM<rangeEnd)rangeEnd=maxM;
    }
  }
  const bulanKe=[];
  let cursor=new Date(rangeStart);
  while(cursor<=rangeEnd&&bulanKe.length<24){
    bulanKe.push({key:cursor.getFullYear()+'-'+String(cursor.getMonth()+1).padStart(2,'0'),label:cursor.toLocaleDateString('id-ID',{month:'short',year:'2-digit'})});
    cursor=new Date(cursor.getFullYear(),cursor.getMonth()+1,1);
  }
  if(!bulanKe.length){const d=new Date();bulanKe.push({key:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),label:d.toLocaleDateString('id-ID',{month:'short',year:'2-digit'})})}
  return bulanKe;
}

// Plugin Chart.js kecil untuk efek "glow" (cahaya neon) di sekeliling garis
// line chart — menambahkan shadow pada canvas context sebelum tiap dataset
// digambar, lalu mengembalikannya seperti semula setelahnya.
const finGlowPlugin={
  id:'finGlow',
  beforeDatasetDraw(chart,args){
    const ds=chart.data.datasets[args.index];
    const ctx=chart.ctx;
    ctx.save();
    ctx.shadowColor=ds.borderColor;
    ctx.shadowBlur=12;
    ctx.shadowOffsetX=0;
    ctx.shadowOffsetY=0;
  },
  afterDatasetDraw(chart){chart.ctx.restore()}
};

// Grafik "Tren Omzet" — line chart bergaya futuristik: garis bercahaya
// (glow), area di bawah garis diberi gradasi memudar, kurva halus (tension),
// dan titik data dengan cincin putih supaya menonjol dari latar.
function renderTrenOmzetChart(start,end){
  const canvas=document.getElementById('chartTrenOmzet');if(!canvas)return;
  const bulanKe=hitungBucketBulan(start,end);
  const rangeLabel=bulanKe.length>1?bulanKe[0].label+' – '+bulanKe[bulanKe.length-1].label:bulanKe[0].label;
  const titleEl=document.getElementById('tren-omzet-title');
  if(titleEl)titleEl.textContent='✨ Tren Omzet — '+rangeLabel;

  const dataPerMp={};MP_LIST.forEach(m=>dataPerMp[m]=bulanKe.map(()=>0));
  DB.penjualan.filter(r=>r.status!=='Dibatalkan'&&r._date).forEach(r=>{
    const d=new Date(r._date);if(isNaN(d))return;
    const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    const idx=bulanKe.findIndex(b=>b.key===key);
    if(idx===-1)return;
    if(!dataPerMp[r.mp])dataPerMp[r.mp]=bulanKe.map(()=>0);
    dataPerMp[r.mp][idx]+=r.total||0;
  });

  const ctx=canvas.getContext('2d');
  const datasets=MP_LIST.map(m=>{
    const color=getMpColor(m);
    const grad=ctx.createLinearGradient(0,0,0,280);
    grad.addColorStop(0,color+'66');
    grad.addColorStop(1,color+'00');
    return{
      label:m,data:dataPerMp[m]||bulanKe.map(()=>0),
      borderColor:color,backgroundColor:grad,fill:true,
      tension:.42,borderWidth:2.5,
      pointRadius:3,pointHoverRadius:6,
      pointBackgroundColor:color,pointBorderColor:'#fff',pointBorderWidth:1.5,
      pointHoverBackgroundColor:'#fff',pointHoverBorderColor:color,pointHoverBorderWidth:2.5
    };
  });

  if(charts.trenOmzet)charts.trenOmzet.destroy();
  charts.trenOmzet=new Chart(canvas,{
    type:'line',
    data:{labels:bulanKe.map(b=>b.label),datasets},
    plugins:[finGlowPlugin],
    options:{
      responsive:true,maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{position:'bottom',align:'center',labels:{font:{size:11.5},boxWidth:8,boxHeight:8,usePointStyle:true,pointStyle:'circle',padding:16}},
        tooltip:{
          padding:10,cornerRadius:10,titleFont:{size:12,weight:'700'},bodyFont:{size:12},
          callbacks:{
            label:(c)=>` ${c.dataset.label}: ${fmtRp(c.parsed.y||0)}`,
            footer:(items)=>{const total=items.reduce((a,it)=>a+(it.parsed.y||0),0);return 'Total: '+fmtRp(total)}
          },footerFont:{size:11.5,weight:'700'}
        }
      },
      scales:{
        x:{ticks:{color:'#888',font:{size:11},maxRotation:0,autoSkip:true},grid:{display:false},border:{display:false}},
        y:{beginAtZero:true,ticks:{color:'#888',font:{size:10},callback:v=>fmtRingkas(v),maxTicksLimit:6},grid:{color:'rgba(128,128,128,.08)'},border:{display:false}}
      }
    }
  });
}
// Pilih satuan waktu (day/week/month/year) otomatis dari lebar rentang
// [start,end] — dipakai grafik Tren Penjualan di Dashboard supaya tetap
// enak dibaca meski orang memilih rentang sangat panjang (mis. 1 tahun).
function unitOtomatis(start,end){
  const hari=(end-start)/86400000;
  if(hari<=31)return 'day';
  if(hari<=210)return 'week';
  if(hari<=900)return 'month';
  return 'year';
}
// =========================================================
// PERIODE PICKER — komponen date-range picker custom (tombol + panel
// kalender/grid bulan/grid tahun), dipakai di topbar (Dashboard) & Laporan
// Keuangan. Satu fungsi builder dipakai berkali-kali lewat id container.
// =========================================================
const BULAN_ID=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const BULAN_SINGKAT=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const HARI_SINGKAT=['S','S','R','K','J','S','M']; // Senin..Minggu (kalender mulai Senin)
const ppState={}; // { [containerId]: {mode, tgl, bulan, tahun} }

function ppSeninMinggu(d){const x=new Date(d);const dow=x.getDay();x.setDate(x.getDate()+(dow===0?-6:1-dow));x.setHours(0,0,0,0);return x}
function ppSamaHari(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
function ppSamaMinggu(a,b){return ppSeninMinggu(a).getTime()===ppSeninMinggu(b).getTime()}
function ppFmtTgl(d){return d.getDate()+' '+BULAN_ID[d.getMonth()]+' '+d.getFullYear()}
function ppFmtTglSingkat(d){return d.getDate()+' '+BULAN_SINGKAT[d.getMonth()]}

// Label yang tampil di tombol & judul kartu, sesuai mode+pilihan tersimpan.
function ppLabel(state){
  const now=new Date();
  switch(state.mode){
    case 'semua':return 'Semua Waktu';
    case 'hari_ini':return 'Real-time  Hari Ini - Pk '+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0')+' (GMT+7)';
    case 'kemarin':return 'Kemarin';
    case '7_hari':return '7 Hari Terakhir';
    case '30_hari':return '30 Hari Terakhir';
    case 'per_hari':return ppFmtTgl(state.tgl);
    case 'per_minggu':{const s=ppSeninMinggu(state.tgl);const e=new Date(s);e.setDate(e.getDate()+6);return ppFmtTglSingkat(s)+' – '+ppFmtTgl(e);}
    case 'per_bulan':return BULAN_ID[state.bulan]+' '+state.tahun;
    case 'per_tahun':return String(state.tahun);
  }
  return '';
}
// Terjemahkan state picker menjadi rentang tanggal [start,end] + label siap-tampil.
function ppGetRange(containerId){
  const state=ppState[containerId]||{mode:'7_hari',tgl:new Date(),bulan:new Date().getMonth(),tahun:new Date().getFullYear()};
  const now=new Date();
  const startOfDay=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x};
  const endOfDay=d=>{const x=new Date(d);x.setHours(23,59,59,999);return x};
  let start,end=endOfDay(now);
  switch(state.mode){
    case 'semua': start=new Date(2000,0,1); end=endOfDay(new Date(2100,0,1)); break;
    case 'hari_ini': start=startOfDay(now); break;
    case 'kemarin': {const y=new Date(now);y.setDate(y.getDate()-1);start=startOfDay(y);end=endOfDay(y);break;}
    case '30_hari': {start=startOfDay(now);start.setDate(start.getDate()-29);break;}
    case 'per_hari': {start=startOfDay(state.tgl);end=endOfDay(state.tgl);break;}
    case 'per_minggu': {const s=ppSeninMinggu(state.tgl);const e=new Date(s);e.setDate(e.getDate()+6);start=startOfDay(s);end=endOfDay(e);break;}
    case 'per_bulan': {start=new Date(state.tahun,state.bulan,1);end=endOfDay(new Date(state.tahun,state.bulan+1,0));break;}
    case 'per_tahun': {start=new Date(state.tahun,0,1);end=endOfDay(new Date(state.tahun,11,31));break;}
    case '7_hari': default: {start=startOfDay(now);start.setDate(start.getDate()-6);break;}
  }
  return{start,end,label:ppLabel(state),mode:state.mode};
}
// Ubah mode periode secara terprogram (bukan lewat klik user), lalu sinkronkan
// label tombolnya. Dipakai mis. setelah restore/reset data supaya periode
// otomatis kembali ke "Semua Waktu" — jangan sampai data yang baru dipulihkan
// malah tersembunyi karena kebetulan periode lama tidak mencakupnya.
function ppSetMode(containerId,mode){
  const state=ppState[containerId];
  if(!state)return;
  state.mode=mode;
  const btn=document.getElementById(containerId+'-btn');
  if(btn){const val=btn.querySelector('.pp-value');if(val)val.textContent=ppLabel(state);}
}
// Bangun & pasang komponen picker di dalam <div id="containerId">.
// onChange(state) dipanggil setiap kali user memilih periode baru.
function ppInit(containerId,defaultState,onChange){
  const root=document.getElementById(containerId);
  if(!root)return;
  ppState[containerId]={mode:'7_hari',tgl:new Date(),bulan:new Date().getMonth(),tahun:new Date().getFullYear(),...defaultState};
  const state=ppState[containerId];

  root.innerHTML=`
    <button type="button" class="periode-btn" id="${containerId}-btn">
      <span class="pp-label">Periode Data</span><span class="pp-value"></span><span class="pp-cal-icon">📅</span>
    </button>
    <div class="periode-panel" id="${containerId}-panel" style="display:none">
      <div class="pp-list">
        <div class="pp-item" data-mode="semua">Semua Waktu</div>
        <div class="pp-sep"></div>
        <div class="pp-item" data-mode="hari_ini">Real-time</div>
        <div class="pp-item" data-mode="kemarin">Kemarin</div>
        <div class="pp-item" data-mode="7_hari">7 hari sebelumnya.</div>
        <div class="pp-item" data-mode="30_hari">30 hari sebelumnya.</div>
        <div class="pp-sep"></div>
        <div class="pp-item" data-mode="per_hari">Per Hari <span class="pp-chev">›</span></div>
        <div class="pp-item" data-mode="per_minggu">Per Minggu <span class="pp-chev">›</span></div>
        <div class="pp-item" data-mode="per_bulan">Per Bulan <span class="pp-chev">›</span></div>
        <div class="pp-item" data-mode="per_tahun">Berdasarkan Tahun <span class="pp-chev">›</span></div>
      </div>
      <div class="pp-side" id="${containerId}-side"></div>
    </div>`;

  const btn=document.getElementById(containerId+'-btn');
  const panel=document.getElementById(containerId+'-panel');
  const side=document.getElementById(containerId+'-side');

  function refreshBtn(){btn.querySelector('.pp-value').textContent=ppLabel(state)}
  function tandaiAktif(mode){root.querySelectorAll('.pp-item').forEach(x=>x.classList.toggle('pp-active',x.dataset.mode===mode))}
  function selesai(){refreshBtn();tandaiAktif(state.mode);panel.style.display='none';onChange({...state})}

  function renderKalender(viewDate,onPick,isHighlight){
    const y=viewDate.getFullYear(),m=viewDate.getMonth();
    const first=new Date(y,m,1);
    const startOffset=(first.getDay()+6)%7; // 0=Senin
    const daysInMonth=new Date(y,m+1,0).getDate();
    const daysInPrev=new Date(y,m,0).getDate();
    let cells='';
    for(let i=0;i<startOffset;i++)cells+=`<div class="pp-cal-day pp-muted">${daysInPrev-startOffset+1+i}</div>`;
    for(let d=1;d<=daysInMonth;d++){
      const dt=new Date(y,m,d);
      let cls='pp-cal-day';
      if(isHighlight&&isHighlight(dt))cls+=' pp-selected';
      else if(ppSamaHari(dt,new Date()))cls+=' pp-today';
      cells+=`<div class="${cls}" data-y="${y}" data-m="${m}" data-d="${d}">${d}</div>`;
    }
    const remain=(7-((startOffset+daysInMonth)%7))%7;
    for(let i=1;i<=remain;i++)cells+=`<div class="pp-cal-day pp-muted">${i}</div>`;
    side.innerHTML=`
      <div class="pp-cal-head">
        <button type="button" class="pp-cal-nav" data-nav="-year">«</button>
        <button type="button" class="pp-cal-nav" data-nav="-month">‹</button>
        <div class="pp-cal-title">${BULAN_ID[m]} ${y}</div>
        <button type="button" class="pp-cal-nav" data-nav="+month">›</button>
        <button type="button" class="pp-cal-nav" data-nav="+year">»</button>
      </div>
      <div class="pp-cal-grid pp-cal-grid-head">${HARI_SINGKAT.map(h=>`<div>${h}</div>`).join('')}</div>
      <div class="pp-cal-grid">${cells}</div>`;
    side.querySelectorAll('.pp-cal-nav').forEach(b=>b.addEventListener('click',(e)=>{
      e.stopPropagation(); // penting: side.innerHTML digambar ulang di bawah ini, yang
      // melepas tombol ini dari DOM — tanpa stopPropagation, klik ini akan tetap
      // "menggelembung" ke listener document (lihat bawah) dan salah dianggap
      // "klik di luar picker" karena root.contains(tombol-yang-sudah-lepas)=false,
      // sehingga seluruh panel periode tertutup paksa padahal user baru mau navigasi.
      const nav=b.dataset.nav;
      if(nav==='-year')viewDate.setFullYear(viewDate.getFullYear()-1);
      if(nav==='+year')viewDate.setFullYear(viewDate.getFullYear()+1);
      if(nav==='-month')viewDate.setMonth(viewDate.getMonth()-1);
      if(nav==='+month')viewDate.setMonth(viewDate.getMonth()+1);
      renderKalender(viewDate,onPick,isHighlight);
    }));
    side.querySelectorAll('.pp-cal-day:not(.pp-muted)').forEach(el=>el.addEventListener('click',(e)=>{
      e.stopPropagation();
      onPick(new Date(+el.dataset.y,+el.dataset.m,+el.dataset.d));
    }));
  }
  function renderBulanGrid(){
    side.innerHTML=`
      <div class="pp-cal-head">
        <button type="button" class="pp-cal-nav" data-nav="-year">«</button>
        <div class="pp-cal-title">${state.tahun}</div>
        <button type="button" class="pp-cal-nav" data-nav="+year">»</button>
      </div>
      <div class="pp-bulan-grid">${BULAN_SINGKAT.map((b,i)=>`<div class="pp-bulan-item${i===state.bulan&&state.mode==='per_bulan'?' pp-selected':''}" data-m="${i}">${b}</div>`).join('')}</div>`;
    side.querySelector('[data-nav="-year"]').addEventListener('click',(e)=>{e.stopPropagation();state.tahun--;renderBulanGrid()});
    side.querySelector('[data-nav="+year"]').addEventListener('click',(e)=>{e.stopPropagation();state.tahun++;renderBulanGrid()});
    side.querySelectorAll('.pp-bulan-item').forEach(el=>el.addEventListener('click',(e)=>{e.stopPropagation();state.mode='per_bulan';state.bulan=+el.dataset.m;selesai()}));
  }
  function renderTahunGrid(){
    const base=state.tahun-4;
    let items='';
    for(let i=0;i<9;i++){const y=base+i;items+=`<div class="pp-tahun-item${y===state.tahun&&state.mode==='per_tahun'?' pp-selected':''}" data-y="${y}">${y}</div>`}
    side.innerHTML=`<div class="pp-tahun-grid">${items}</div>`;
    side.querySelectorAll('.pp-tahun-item').forEach(el=>el.addEventListener('click',(e)=>{e.stopPropagation();state.mode='per_tahun';state.tahun=+el.dataset.y;selesai()}));
  }

  root.querySelectorAll('.pp-item').forEach(el=>{
    el.addEventListener('click',(e)=>{
      e.stopPropagation();
      const mode=el.dataset.mode;
      if(['semua','hari_ini','kemarin','7_hari','30_hari'].includes(mode)){state.mode=mode;selesai();return}
      tandaiAktif(mode);
      if(mode==='per_hari')renderKalender(new Date(state.tgl),(dt)=>{state.mode='per_hari';state.tgl=dt;selesai()},(dt)=>state.mode==='per_hari'&&ppSamaHari(dt,state.tgl));
      else if(mode==='per_minggu')renderKalender(new Date(state.tgl),(dt)=>{state.mode='per_minggu';state.tgl=dt;selesai()},(dt)=>state.mode==='per_minggu'&&ppSamaMinggu(dt,state.tgl));
      else if(mode==='per_bulan')renderBulanGrid();
      else if(mode==='per_tahun')renderTahunGrid();
    });
  });

  btn.addEventListener('click',(e)=>{
    e.stopPropagation();
    const sedangTerbuka=panel.style.display!=='none';
    document.querySelectorAll('.periode-panel').forEach(p=>p.style.display='none');
    if(!sedangTerbuka){panel.style.display='flex';tandaiAktif(state.mode)}
  });
  document.addEventListener('click',(e)=>{if(!root.contains(e.target))panel.style.display='none'});

  refreshBtn();
}
// Pecah rentang [start,end] jadi baris-baris satuan waktu (hari/minggu/bulan/tahun).
function buatBucketLaporan(start,end,groupBy){
  const buckets=[];
  if(groupBy==='day'){
    let d=new Date(start);
    while(d<=end){
      buckets.push({label:d.toLocaleDateString('id-ID',{weekday:'short',day:'2-digit',month:'short'}),start:new Date(d.setHours(0,0,0,0)),end:new Date(new Date(d).setHours(23,59,59,999))});
      d=new Date(d);d.setDate(d.getDate()+1);
    }
  }else if(groupBy==='week'){
    let d=new Date(start);
    const dow=d.getDay();d.setDate(d.getDate()+(dow===0?-6:1-dow));d.setHours(0,0,0,0); // mundur ke Senin
    while(d<=end){
      const s=new Date(d);const e=new Date(d);e.setDate(e.getDate()+6);e.setHours(23,59,59,999);
      buckets.push({label:s.toLocaleDateString('id-ID',{day:'2-digit',month:'short'})+' – '+e.toLocaleDateString('id-ID',{day:'2-digit',month:'short'}),start:s,end:e});
      d.setDate(d.getDate()+7);
    }
  }else if(groupBy==='month'){
    let d=new Date(start.getFullYear(),start.getMonth(),1);
    while(d<=end){
      const s=new Date(d.getFullYear(),d.getMonth(),1);const e=new Date(d.getFullYear(),d.getMonth()+1,0);e.setHours(23,59,59,999);
      buckets.push({label:d.toLocaleDateString('id-ID',{month:'long',year:'numeric'}),start:s,end:e});
      d.setMonth(d.getMonth()+1);
    }
  }else if(groupBy==='year'){
    let y=start.getFullYear();const endY=end.getFullYear();
    while(y<=endY){buckets.push({label:String(y),start:new Date(y,0,1),end:new Date(y,11,31,23,59,59,999)});y++}
  }
  return buckets;
}
// Jumlahkan Omzet/Laba/Biaya untuk sekumpulan pesanan (dipakai ringkasan total
// maupun tiap baris breakdown), konsisten pakai hitungLaba() yang sama.
function hitungRingkasPeriode(list){
  let to=0,tl=0,tf=0,te=0,th=0;
  list.forEach(r=>{const h=hitungLaba(r);to+=h.omzet;tl+=h.laba;tf+=h.mpFee;te+=h.extra;th+=h.hpp});
  return{to,tl,tf,te,th};
}
// Hitung total revenue per bulan & per marketplace, N bulan terakhir sampai
// bulan berjalan (dipakai grafik Tren Bulanan di Laporan Keuangan). Data
// diambil dari DB.penjualan asli (bukan dummy), dikelompokkan berdasarkan
// tahun-bulan dari r._date, hanya pesanan yang berstatus aktif.
// Tren Bulanan sekarang MENGIKUTI periode yang dipilih di "Periode Data"
// (pp-laporan) — bukan lagi dropdown 3/6/12 bulan terpisah. Supaya tetap
// enak dibaca walau orang memilih periode sangat panjang (mis. "Semua
// Waktu"), rentang bulan yang ditampilkan otomatis dipersempit mengikuti
// bulan-bulan yang BENAR-BENAR ada transaksinya di dalam periode itu
// (bukan dari tahun 2000 sampai 2100), dan dibatasi maksimal 24 bulan.
// Tren Bulanan MENGIKUTI periode yang dipilih di "Periode Data" (pp-laporan)
// — tapi supaya tetap terasa sebagai "TREN" (bukan cuma 1 batang tunggal),
// kalau periode yang dipilih terlalu pendek (kurang dari 2 bulan kalender —
// mis. "Hari Ini", "7 Hari", "Per Hari") maka rentang bulan otomatis
// diperluas jadi 6 bulan terakhir dihitung mundur dari akhir periode.
// Sebaliknya kalau periode sangat panjang (mis. "Semua Waktu"), rentang
// bulan dipersempit mengikuti bulan-bulan yang benar-benar ada
// transaksinya, dibatasi maksimal 24 bulan supaya chart tetap terbaca.
// Format angka Rupiah ringkas untuk sumbu grafik (rb/jt), menyesuaikan skala
// omzet toko kecil maupun besar (dulu selalu dibulatkan ke "jt" saja).
function fmtRingkas(v){
  if(v>=1e9)return 'Rp'+(v/1e9).toFixed(1)+'M';
  if(v>=1e6)return 'Rp'+(v/1e6).toFixed(1)+'jt';
  if(v>=1e3)return 'Rp'+(v/1e3).toFixed(0)+'rb';
  return 'Rp'+v;
}

// ===== PAGINATION =====
function renderPagination(containerId,total,current,cb){
  const totalPages=Math.ceil(total/PER_PAGE);const el=document.getElementById(containerId);
  if(totalPages<=1){el.innerHTML='';return}
  let html=`<span class="page-info">Total: ${total} | Hal ${current}/${totalPages}</span>`;
  if(current>1)html+=`<div class="page-btn" onclick="(${cb.toString()})(${current-1})">‹</div>`;
  const range=[...new Set([1,Math.max(1,current-1),current,Math.min(totalPages,current+1),totalPages])].filter(p=>p>=1&&p<=totalPages).sort((a,b)=>a-b);
  range.forEach(p=>{html+=`<div class="page-btn${p===current?' active':''}" onclick="(${cb.toString()})(${p})">${p}</div>`});
  if(current<totalPages)html+=`<div class="page-btn" onclick="(${cb.toString()})(${current+1})">›</div>`;
  el.innerHTML=html;
}

// ===== IMPORT =====
// Parser CSV yang benar (RFC 4180): mengerti sel yang dibungkus tanda kutip
// (boleh mengandung koma/baris baru di dalamnya) — dipakai untuk membaca file
// CSV, baik hasil export aplikasi ini sendiri maupun file dari Excel/Sheets.
function parseCSVLine(line){
  const out=[];let cur='',inQ=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(inQ){
      if(c==='"'){if(line[i+1]==='"'){cur+='"';i++}else inQ=false}
      else cur+=c;
    }else{
      if(c==='"')inQ=true;
      else if(c===','){out.push(cur);cur=''}
      else cur+=c;
    }
  }
  out.push(cur);
  return out;
}
function handleDrop(e,type){
  e.preventDefault();
  if(!canWrite()){alert("Anda tidak punya izin untuk mengimpor data. Hubungi Owner/Staff.");return}
  const f=e.dataTransfer.files[0];if(f)processCSV(f,type);
}
function importFile(e,type){
  if(!canWrite()){alert("Anda tidak punya izin untuk mengimpor data. Hubungi Owner/Staff.");e.target.value='';return}
  if(e.target.files[0])processCSV(e.target.files[0],type);
}
function processCSV(file,type){
  const reader=new FileReader();
  reader.onload=function(e){
    const lines=e.target.result.split(/\r?\n/).filter(l=>l.trim());
    const headers=parseCSVLine(lines[0]).map(h=>h.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,''));
    let imported=0,errors=0;
    if(type==='jual'){
      // Kelompokkan baris-baris CSV berdasarkan No. Pesanan yang sama -> jadi
      // 1 pesanan dengan banyak barang (mendukung pesanan multi-item saat import).
      const grouped={}; // no_pesanan -> {header fields, items:[]}
      const order=[];   // urutan kemunculan no_pesanan pertama kali, supaya hasil import rapi
      for(let i=1;i<lines.length;i++){
        const cols=parseCSVLine(lines[i]);const row={};headers.forEach((h,j)=>row[h]=(cols[j]||'').trim());
        try{
          const noImp=row.no_pesanan||row.no||('IMP-'+i);
          const key=noImp.trim().toLowerCase();
          const mpNama=row.marketplace||'Shopee';
          if(!DB.marketplace.some(m=>m.nama.toLowerCase()===mpNama.toLowerCase())){DB.marketplace.push({nama:mpNama,color:MP_COLOR_CHOICES[DB.marketplace.length%MP_COLOR_CHOICES.length]});refreshMpGlobals()}
          if(!grouped[key]){
            const d=row.tanggal||fmtTgl(new Date());
            grouped[key]={
              no:noImp,tanggal:d,_date:new Date(d.split('/').reverse().join('-')||d).toISOString(),mp:mpNama,
              status:row.status||'Selesai',
              biayaAdmin:row.biaya_admin!==undefined&&row.biaya_admin!==''?parseFloat(row.biaya_admin.replace(/[^0-9.]/g,'')):null,
              biayaTambahan:row.biaya_tambahan!==undefined&&row.biaya_tambahan!==''?parseFloat(row.biaya_tambahan.replace(/[^0-9.]/g,'')):null,
              items:[]
            };
            order.push(key);
          }
          const qty=parseInt(row.qty||1)||1;
          // Dukung 2 format kolom: format baru (harga_satuan/subtotal per barang)
          // maupun format lama (cuma kolom "total" per baris) untuk kompatibilitas
          // dengan file CSV yang diexport dari versi aplikasi sebelumnya.
          let harga=row.harga_satuan!==undefined&&row.harga_satuan!==''?parseFloat(row.harga_satuan.replace(/[^0-9.]/g,'')):null;
          let subtotal=row.subtotal!==undefined&&row.subtotal!==''?parseFloat(row.subtotal.replace(/[^0-9.]/g,'')):null;
          if(subtotal==null&&row.total!==undefined&&row.total!==''){subtotal=parseFloat((row.total).replace(/[^0-9.]/g,''))||0}
          if(harga==null)harga=subtotal!=null&&qty>0?Math.round(subtotal/qty):0;
          if(subtotal==null)subtotal=qty*harga;
          if((row.produk||'').trim()){
            grouped[key].items.push({prod:row.produk.trim(),varian:(row.varian||'').trim(),kat:row.kategori||'Lainnya',qty,harga,subtotal});
          }
          imported++;
        }catch(err){errors++}
      }
      order.forEach(key=>{
        const orderBaru=grouped[key];
        if(!orderBaru.items.length)orderBaru.items=[{prod:'–',varian:'',kat:'Lainnya',qty:1,harga:0,subtotal:0}];
        recalcOrderTotal(orderBaru);
        // Cegah No. Pesanan duplikat dengan data yang SUDAH ada sebelumnya di aplikasi
        // (yang menyebabkan gagal sinkron ke Supabase): timpa (update), jangan tambah baris baru.
        const idxAda=DB.penjualan.findIndex(r=>r.no.trim().toLowerCase()===key);
        if(idxAda!==-1){
          // PENTING: sebelumnya baris ini TIDAK memanggil terapkanEfekStok sama sekali,
          // sehingga pesanan yang masuk lewat import CSV tidak pernah mengurangi stok
          // gudang / menambah "terjual" di tabel Stok (penyebab data Penjualan & Stok
          // tidak sinkron). Sekarang: balikkan dulu efek pesanan lama, baru terapkan efek baru.
          terapkanEfekStok(DB.penjualan[idxAda],+1);
          DB.penjualan[idxAda]=orderBaru;
        }else{
          DB.penjualan.push(orderBaru);
        }
        terapkanEfekStok(orderBaru,-1);
      });
    }else{
      for(let i=1;i<lines.length;i++){
        const cols=parseCSVLine(lines[i]);const row={};headers.forEach((h,j)=>row[h]=(cols[j]||'').trim());
        try{
          DB.stok.push({sku:row.sku||'SKU-IMP-'+i,prod:row.produk||'–',varian:row.varian||'',kat:row.kategori||'Lainnya',stok:parseInt(row.stok||0),terjual:parseInt(row.terjual_30h||row.terjual||0),hpp:parseFloat((row.hpp||'0').replace(/[^0-9.]/g,''))||0,created_at:new Date().toISOString(),updatedAt:new Date().toISOString()});
          imported++;
        }catch(err){errors++}
      }
    }
    saveDB(['penjualan','stok','marketplace']);filteredStok=[...DB.stok];populateMpDropdowns();filterJual();renderStokTable();renderDashboard();
    catatAktivitas('Import',type==='jual'?'Pesanan':'Stok Produk',`Import CSV: ${imported} baris berhasil${errors?`, ${errors} gagal`:''}`);
    const res=document.getElementById(type==='jual'?'import-result':'import-stok-result');
    res.innerHTML=`<div class="alert alert-success">✅ Berhasil import <strong>${imported} baris</strong>${errors?` (${errors} baris gagal)`:''}</div>`;
  };
  reader.readAsText(file);
}

// ===== EXPORT =====
// Escape 1 sel CSV dengan benar (RFC 4180): bungkus dengan tanda kutip jika
// selnya mengandung koma, tanda kutip, atau baris baru — supaya nama
// produk/varian/kategori yang mengandung koma TIDAK memecah kolom saat
// dibuka di Excel/Sheets atau saat di-import ulang ke aplikasi ini.
function csvCell(v){
  const s=v==null?'':String(v);
  return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
function csvRow(arr){return arr.map(csvCell).join(',')}
// Ubah label periode (mis. "30 Hari Terakhir", "1 Jan – 7 Jan 2026") jadi
// potongan nama file yang aman: huruf kecil, spasi/simbol -> underscore.
function slugPeriode(label){
  return (label||'periode').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||'periode';
}
// Export CSV Penjualan — SATU sumber kebenaran dengan Dashboard & tabel Penjualan:
// - Rentang tanggal selalu mengikuti periode yang sedang dipilih di "Periode Data" (topbar).
// - Kalau dipanggil saat sedang membuka menu Penjualan, ikut juga filter pencarian/
//   marketplace/status serta urutan yang sedang aktif di tabel (filteredJual) —
//   supaya hasil export = persis apa yang sedang dilihat user di layar.
// - Kalau dipanggil dari menu lain (mis. Dashboard), export seluruh Penjualan
//   dalam periode terpilih tanpa filter tabel (karena tabelnya sedang tidak tampil).
function exportCSV(){
  const{start,end,label}=ppGetRange('pp-dash');
  const adaFilterTabel=_currentSection==='penjualan';
  let data;
  if(adaFilterTabel){
    data=[...filteredJual];
  }else{
    data=DB.penjualan.filter(r=>!r._date||(new Date(r._date)>=start&&new Date(r._date)<=end));
    sortJualArray(data);
  }
  if(!data.length){
    alert('Tidak ada data Penjualan untuk periode "'+label+'"'+(adaFilterTabel?' dengan filter yang sedang aktif':'')+'. Ubah periode atau filter, lalu coba lagi.');
    return;
  }
  const h=csvRow(['No. Pesanan','Tanggal','Marketplace','Produk','Varian','Kategori','Qty','Harga Satuan','Subtotal','Status','Biaya Admin','Biaya Tambahan','Laba Bersih','Margin (%)'])+'\n';
  const rows=[];
  data.forEach(r=>{
    const items=r.items&&r.items.length?r.items:null;
    // flattenPenjualan() mengalokasikan Biaya Admin/Biaya Tambahan per pesanan
    // secara proporsional ke tiap barang (sesuai porsi subtotal-nya) — sama
    // persis dengan perhitungan yang dipakai Laba per Produk & kartu Laba di
    // form Tambah Pesanan, supaya angka Laba/Margin di CSV ini konsisten
    // dengan yang tampil di tempat lain.
    const flat=items?flattenPenjualan([r]):[];
    (items||[{prod:'',varian:'',kat:'',qty:'',harga:'',subtotal:''}]).forEach((it,i)=>{
      const f=flat[i];const hl=f?hitungLaba(f):null;
      const laba=hl?Math.round(hl.laba):'';
      const margin=hl&&hl.omzet>0?hl.margin.toFixed(1):'';
      rows.push(csvRow([r.no,r.tanggal,r.mp,it.prod,it.varian||'',it.kat||'',it.qty,it.harga,it.subtotal,r.status,r.biayaAdmin!=null?Math.round(r.biayaAdmin):'',r.biayaTambahan!=null?Math.round(r.biayaTambahan):'',laba,margin]));
    });
  });
  dlFile(h+rows.join('\n'),'penjualan_'+slugPeriode(label)+'_'+today()+'.csv','text/csv');
}
function exportStokCSV(){const h=csvRow(['SKU','Produk','Varian','Kategori','Stok','HPP','Terjual 30h'])+'\n';dlFile(h+DB.stok.map(r=>csvRow([r.sku,r.prod,r.varian,r.kat||'',r.stok,r.hpp||0,r.terjual])).join('\n'),'stok_'+today()+'.csv','text/csv')}
function exportLabaCSV(){const data=_labaFiltered.length?_labaFiltered:getLabaPerProduk();const h=csvRow(['Produk','Kategori','Marketplace','Qty','Omzet','HPP','Biaya Admin MP (%)','Biaya Lain','Laba Bersih','Margin (%)'])+'\n';dlFile(h+data.map(r=>csvRow([r.prod,r.kat,r.mp,r.qty,r.omzet,Math.round(r.hpp),Math.round(r.mpFee),Math.round(r.extra),Math.round(r.laba),r.margin.toFixed(1)])).join('\n'),'laba_per_produk_'+today()+'.csv','text/csv')}
function exportLabaCSV2(){exportLabaCSV()}
function dlFile(content,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+content],{type}));a.download=name;a.click()}

// ===== MODAL =====
function openModal(id){document.getElementById(id).classList.add('open')}
function closeModal(id){document.getElementById(id).classList.remove('open')}
window.onclick=function(e){if(e.target.classList.contains('modal-overlay'))e.target.classList.remove('open')}

// ===== BACKUP / RESTORE =====
function backupData(){dlFile(JSON.stringify(DB,null,2),'omniseller_backup_'+today()+'.json','application/json')}
// Backup lama (sebelum fitur multi-item) menyimpan 1 pesanan = 1 barang
// langsung di level pesanan (field prod/varian/qty/total ada di `r`, bukan
// di `r.items[]`). Semua laporan sekarang membaca dari `r.items[]`, jadi
// tanpa migrasi ini pesanan lama akan tampak "kosong" (0 barang) di semua
// laporan/laba/grafik walau baris pesanannya sendiri masih ada.
function migrasiPenjualanLama(list){
  return (list||[]).map(r=>{
    if(r.items&&r.items.length)return r; // sudah format baru
    if(r.prod!=null){ // format lama: barang ada langsung di level pesanan
      const qty=r.qty||1,harga=r.harga!=null?r.harga:(r.total!=null?Math.round(r.total/qty):0);
      const items=[{prod:r.prod,varian:r.varian||'',kat:r.kat||'Lainnya',qty,harga,subtotal:r.total!=null?r.total:qty*harga}];
      const{prod,varian,kat,qty:_q,total,harga:_h,...rest}=r;
      const order={...rest,items};
      recalcOrderTotal(order);
      return order;
    }
    return{...r,items:r.items||[]};
  });
}
function restoreData(e){const reader=new FileReader();reader.onload=function(ev){try{DB=JSON.parse(ev.target.result);if(!DB.marketplace||!DB.marketplace.length)DB.marketplace=JSON.parse(JSON.stringify(DEFAULT_MP));DB.penjualan=migrasiPenjualanLama(DB.penjualan);if(!DB.pembelian)DB.pembelian=[];if(!DB.penggajian)DB.penggajian=[];refreshMpGlobals();saveDB();filteredStok=[...DB.stok];filteredPembelian=[...DB.pembelian];filteredPenggajian=[...DB.penggajian];applyPengaturan();populateKatDropdowns();populateMpDropdowns();ppSetMode('pp-dash','semua');renderDashboard();filterJual();renderStokTable();catatAktivitas('Restore','Data',`Pulihkan backup: ${DB.penjualan.length} pesanan, ${DB.stok.length} varian`);alert('Data dipulihkan! '+DB.penjualan.length+' pesanan, '+DB.stok.length+' varian.')}catch(err){alert('File backup tidak valid: '+err.message)}};reader.readAsText(e.target.files[0])}
function resetData(){if(!canManageSettings()){alert('Hanya Owner yang bisa reset data.');return}if(confirm('Hapus SEMUA data penjualan & stok? Tindakan ini tidak bisa dibatalkan.')){
  DB.penjualan=[];DB.stok=[];DB.kategori=[...DEFAULT_KAT];DB.marketplace=JSON.parse(JSON.stringify(DEFAULT_MP));DB.biaya=JSON.parse(JSON.stringify(DEFAULT_BIAYA));DB.pembelian=[];DB.penggajian=[];
  refreshMpGlobals();saveDB();filteredStok=[...DB.stok];filteredPembelian=[];filteredPenggajian=[];populateKatDropdowns();populateMpDropdowns();applyPengaturan();ppSetMode('pp-dash','semua');renderDashboard();filterJual();renderStokTable();
  catatAktivitas('Reset','Data','Semua data penjualan & stok dikosongkan');
  alert('Semua data berhasil dikosongkan. Silakan mulai input data Anda sendiri.');
}}

// ===== PENGATURAN =====
function simpanPengaturan(){
  if(!canManageSettings()){alert("Hanya Owner yang bisa mengubah pengaturan toko.");return}
  DB.pengaturan.nama=document.getElementById('set-nama').value;DB.pengaturan.pemilik=document.getElementById('set-pemilik').value;
  DB.pengaturan.hp=document.getElementById('set-hp').value;const vBatas=parseInt(document.getElementById('set-batas-stok').value);DB.pengaturan.batasStok=isNaN(vBatas)?10:vBatas;
  saveDB(['pengaturan']);applyPengaturan();renderDashboard();catatAktivitas('Edit','Pengaturan Toko',`${DB.pengaturan.nama} — batas stok ${DB.pengaturan.batasStok}`);alert('Pengaturan tersimpan!');
}
function applyPengaturan(){
  document.getElementById('set-nama').value=DB.pengaturan.nama||'';document.getElementById('set-pemilik').value=DB.pengaturan.pemilik||'';
  document.getElementById('set-hp').value=DB.pengaturan.hp||'';document.getElementById('set-batas-stok').value=(DB.pengaturan.batasStok!=null?DB.pengaturan.batasStok:10);
  document.title=(DB.pengaturan.nama||'OmniSeller')+' — Dashboard';
  applyLogo();
}
function updateInfoPengaturan(){
  document.getElementById('info-total-jual').textContent=DB.penjualan.length.toLocaleString('id-ID')+' pesanan';
  document.getElementById('info-total-stok').textContent=DB.stok.length.toLocaleString('id-ID')+' varian';
  document.getElementById('info-total-kat').textContent=DB.kategori.length+' kategori';
  document.getElementById('info-last-update').textContent=DB.lastUpdate?new Date(DB.lastUpdate).toLocaleString('id-ID'):'–';
  updateAdminInfo();
}

// ===== LOGO APLIKASI =====
function handleLogoUpload(e){
  const file=e.target.files[0];if(!file)return;
  if(file.size>1.5*1024*1024){alert('Ukuran logo maksimal 1.5MB');return}
  const reader=new FileReader();
  reader.onload=function(ev){
    DB.pengaturan.logo=ev.target.result;
    saveDB(['pengaturan']);applyLogo();
  };
  reader.readAsDataURL(file);
}
function hapusLogo(){
  if(!canManageSettings()){alert("Hanya Owner yang bisa mengubah logo.");return}
  if(!DB.pengaturan.logo){return}
  if(!confirm('Hapus logo aplikasi?'))return;
  DB.pengaturan.logo='';saveDB(['pengaturan']);applyLogo();
}
function applyLogo(){
  const logo=DB.pengaturan.logo||'';
  const previewImg=document.getElementById('logo-preview-img');
  const previewEmpty=document.getElementById('logo-preview-empty');
  if(previewImg&&previewEmpty){
    if(logo){previewImg.src=logo;previewImg.style.display='block';previewEmpty.style.display='none'}
    else{previewImg.style.display='none';previewEmpty.style.display='block'}
  }
  const sidebarH1=document.getElementById('sidebar-logo-h1');
  if(sidebarH1){
    if(logo){
      sidebarH1.innerHTML=`<img src="${logo}" class="app-logo" alt="logo"><em>${(DB.pengaturan.nama||'Omni Seller')}</em>`;
    }else{
      sidebarH1.innerHTML=`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--accent)"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg><em>Omni</em>Seller`;
    }
  }
  const loginLogoImg=document.getElementById('login-logo-img');
  const loginFallback=document.getElementById('login-logo-fallback');
  if(loginLogoImg&&loginFallback){
    if(logo){loginLogoImg.src=logo;loginLogoImg.style.display='block';loginFallback.style.display='none'}
    else{loginLogoImg.style.display='none';loginFallback.style.display='inline'}
  }
}

// ===== DARK MODE =====
function toggleTheme(){const c=document.documentElement.getAttribute('data-theme');const next=c==='dark'?'light':'dark';if(next==='dark')document.documentElement.setAttribute('data-theme','dark');else document.documentElement.removeAttribute('data-theme');localStorage.setItem('omni_theme',next)}

// ===== FIX BUTTON HANDLERS =====
// Override inline onclick for modal open to use proper functions
window.addEventListener('load',function(){
  // Fix all "Tambah Pesanan" buttons
  document.querySelectorAll('[onclick*="modal-tambah-jual"]').forEach(el=>{if(!el.onclick||el.onclick.toString().includes('openModal'))el.onclick=bukaModalTambahJual});
  document.querySelectorAll('[onclick*="modal-tambah-stok"]').forEach(el=>{if(!el.onclick||el.onclick.toString().includes('openModal'))el.onclick=bukaModalTambahStok});
  document.querySelectorAll('[onclick*="modal-tambah-kat"]').forEach(el=>{if(!el.onclick||el.onclick.toString().includes('openModal'))el.onclick=bukaModalTambahKat});
});
