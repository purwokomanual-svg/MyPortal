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

let DB={penjualan:[],stok:[],kategori:[...DEFAULT_KAT],marketplace:JSON.parse(JSON.stringify(DEFAULT_MP)),biaya:JSON.parse(JSON.stringify(DEFAULT_BIAYA)),pengaturan:{nama:'Toko Saya',pemilik:'',hp:'',batasStok:10,logo:''},lastUpdate:null};
let _editJualIdx=-1,_editStokIdx=-1,_editKatIdx=-1,_restockIdx=-1,_editMpIdx=-1;
let filteredJual=[],filteredStok=[],_labaData=[],_labaFiltered=[];
let pageJual=1,pageStok=1,pageLaba=1;
const PER_PAGE=20;
let charts={};
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
  pengaturan:syncPengaturanToko_
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
    return{sku:s.sku,produk:s.prod,varian:s.varian||'',kategori:s.kat||'Lainnya',stok:s.stok!=null?s.stok:0,terjual:s.terjual!=null?s.terjual:0,hpp:s.hpp!=null?s.hpp:0};
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
        subtotal:it.subtotal!=null?it.subtotal:(it.qty||1)*(it.harga||0)
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

// Ambil semua data dari tabel relasional & susun ulang jadi struktur DB di memori
async function loadFromSupabase(){
  try{
    const[katRes,mpRes,stokRes,pesananRes,itemRes,biayaRes,hppRes,setRes]=await Promise.all([
      supabaseClient.from(TBL_KATEGORI).select('*').order('id'),
      supabaseClient.from(TBL_MARKETPLACE).select('*').order('id'),
      supabaseClient.from(TBL_STOK).select('*').order('id'),
      supabaseClient.from(TBL_PESANAN).select('*').order('id'),
      supabaseClient.from(TBL_PESANAN_ITEM).select('*').order('id'),
      supabaseClient.from(TBL_BIAYA).select('*').eq('id',1).maybeSingle(),
      supabaseClient.from(TBL_HPP_PRODUK).select('*'),
      supabaseClient.from(TBL_PENGATURAN).select('*').eq('id',1).maybeSingle(),
    ]);
    const errs=[katRes,mpRes,stokRes,pesananRes,itemRes,biayaRes,hppRes,setRes].map(r=>r.error).filter(Boolean);
    if(errs.length){console.warn('Gagal memuat dari Supabase:',errs[0].message);updateSyncBadge(false,errs[0].message);return null}

    const kategori=(katRes.data||[]).map(k=>({nama:k.nama,color:k.color}));
    const marketplace=(mpRes.data||[]).map(m=>({nama:m.nama,color:m.color}));
    const stok=(stokRes.data||[]).map(s=>({sku:s.sku,prod:s.produk,varian:s.varian,kat:s.kategori,stok:s.stok,terjual:s.terjual,hpp:Number(s.hpp)||0}));

    // Kelompokkan baris pesanan_item berdasarkan pesanan_id, lalu gabungkan
    // dengan header masing-masing dari tabel `pesanan` -> jadi 1 pesanan (bisa
    // berisi banyak barang) per elemen array `penjualan`.
    const itemsByPesanan={};
    (itemRes.data||[]).forEach(it=>{
      if(!itemsByPesanan[it.pesanan_id])itemsByPesanan[it.pesanan_id]=[];
      itemsByPesanan[it.pesanan_id].push({prod:it.produk,varian:it.varian||'',kat:it.kategori||'Lainnya',qty:it.qty,harga:Number(it.harga_satuan)||0,subtotal:Number(it.subtotal)||0});
    });
    const penjualan=(pesananRes.data||[]).map(r=>{
      const items=itemsByPesanan[r.id]||[];
      const order={no:r.no_pesanan,tanggal:r.tanggal,_date:r.tgl_iso,mp:r.marketplace,status:r.status,
        biayaAdmin:r.biaya_admin!=null?Number(r.biaya_admin):null,biayaTambahan:r.biaya_tambahan!=null?Number(r.biaya_tambahan):null,
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

    updateSyncBadge(true);
    return{kategori,marketplace,stok,penjualan,biaya,pengaturan,lastUpdate:new Date().toISOString()};
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
  if(!DB.pengaturan.logo)DB.pengaturan.logo='';
  refreshMpGlobals();
  filteredJual=[...DB.penjualan];filteredStok=[...DB.stok];
  applyPengaturan();
  applyLogo();
  ppInit('pp-dash',{mode:'30_hari'},()=>renderDashboard());
  ppInit('pp-laporan',{mode:'7_hari'},()=>renderLaporan());
  renderDashboard();
  renderJualTable();
  renderStokTable();
  populateKatDropdowns();
  populateMpDropdowns();
  document.getElementById('f-tgl').value=today();
  (function(){const t=localStorage.getItem('omni_theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark')})();
}

// ===== ADMIN AUTH (Supabase Auth) + ROLE/PRIVILEGE =====
let _currentAdminRole=null; // 'owner' | 'staff' | 'kasir' | 'viewer' | 'pending' | null
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
    showAppScreen();
    await initApp();             // render semua section
    handleHashRoute();           // buka menu sesuai path di URL (#/stok, dst) — bukan selalu Dashboard
    applyRolePermissions();      // terapkan permission SETELAH render selesai
    updateAdminInfo();
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
    if(error){loginAlert('Login gagal: '+error.message);btn.disabled=false;btn.textContent='Masuk';return}
    await proceedAfterAuth(data.user);
  }catch(e){loginAlert('Login gagal: '+e.message)}
  btn.disabled=false;btn.textContent='Masuk';
}
async function adminLogout(){
  if(!confirm('Keluar dari dashboard?'))return;
  try{await supabaseClient.auth.signOut()}catch(e){}
  _currentAdminUser=null;_currentAdminRole=null;_currentSection=null;
  history.replaceState(null,'','#/');
  document.getElementById('login-email').value='';
  document.getElementById('login-password').value='';
  loginAlert('');
  showLoginScreen();
}
function updateAdminInfo(){
  const emailEl=document.getElementById('info-admin-email');
  const sinceEl=document.getElementById('info-admin-since');
  if(!emailEl)return;
  emailEl.textContent=_currentAdminUser?_currentAdminUser.email:'–';
  sinceEl.textContent=_currentAdminUser&&_currentAdminUser.last_sign_in_at?new Date(_currentAdminUser.last_sign_in_at).toLocaleString('id-ID'):'–';
  const roleEl=document.getElementById('info-admin-role');
  if(roleEl){
    const label={owner:'👑 Owner (akses penuh)',staff:'🛠 Staff (kelola transaksi & stok)',kasir:'🧾 Kasir (kelola pesanan saja)',viewer:'👁 Viewer (hanya lihat)'}[_currentAdminRole]||_currentAdminRole||'–';
    roleEl.textContent=label;
  }
}
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
function canWriteOrders(){return _currentAdminRole==='owner'||_currentAdminRole==='staff'||_currentAdminRole==='kasir'} // boleh tambah/edit/hapus PESANAN saja
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
    if(event==='SIGNED_OUT'){_currentAdminUser=null;_currentAdminRole=null;_currentSection=null;showLoginScreen()}
  });
}

// ===== SECTIONS =====
const PAGE_TITLES={dashboard:'Dashboard',penjualan:'Laporan Penjualan',stok:'Stok & Gudang',produk:'Produk & Kategori',laba:'Laba & Biaya Admin per Produk',laporan:'Laporan Keuangan',import:'Import Data',pengaturan:'Pengaturan'};
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
  else if(!id)showSection('dashboard'); // hash kosong/tidak dikenal -> default ke dashboard
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
  _currentSection=id;
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('sec-'+id).classList.add('active');
  const navEl=el||document.querySelector('.nav-item[data-menu="'+id+'"]');
  if(navEl)navEl.classList.add('active');
  document.getElementById('page-title').textContent=PAGE_TITLES[id]||id;
  setRouteHash(id,false);
  if(id==='laporan')renderLaporan();
  if(id==='produk')renderProduk();
  if(id==='laba'){renderLabaSection();renderBiayaInputs();renderHppMode();}
  if(id==='pengaturan'){updateInfoPengaturan();if(canManageSettings())renderUserList();}
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
function renderDashboard(){
  const{start,end}=ppGetRange('pp-dash');
  const recent=DB.penjualan.filter(r=>r.status!=='Dibatalkan'&&r._date&&new Date(r._date)>=start&&new Date(r._date)<=end);
  const totalRev=recent.reduce((a,r)=>a+r.total,0);
  const totalOrd=recent.length;
  const batas=(DB.pengaturan.batasStok!=null?DB.pengaturan.batasStok:10);
  const kritis=DB.stok.filter(s=>s.stok<=batas).length;

  // Laba estimasi (dihitung per barang, bukan per pesanan, agar pesanan
  // dengan beberapa produk tetap akurat)
  let totalLaba=0;flattenPenjualan(recent).forEach(f=>{totalLaba+=hitungLaba(f).laba});
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

  document.getElementById('m-rev').textContent=fmtRp(totalRev);
  document.getElementById('m-rev-sub').textContent=panahSub(pctRev);
  document.getElementById('m-ord').textContent=totalOrd.toLocaleString('id-ID');
  document.getElementById('m-ord-sub').textContent=panahSub(pctOrd);
  document.getElementById('m-laba').textContent=fmtRp(totalLaba);
  document.getElementById('m-margin').textContent=margin.toFixed(1)+'% margin bersih';
  document.getElementById('m-kritis').textContent=kritis;
  document.getElementById('nb-stok').textContent=kritis;

  // Alerts
  const habis=DB.stok.filter(s=>s.stok===0);const rendah=DB.stok.filter(s=>s.stok>0&&s.stok<=batas);
  let alertHTML='';
  if(habis.length)alertHTML+=`<div class="alert alert-danger">⚠ <strong>${habis.length} varian stok habis</strong> — ${habis.slice(0,3).map(s=>s.prod+' '+s.varian).join(', ')}${habis.length>3?'...':''}</div>`;
  if(rendah.length)alertHTML+=`<div class="alert alert-warning">⚡ <strong>${rendah.length} varian stok rendah</strong> (&lt;${batas} pcs) — perlu segera restock</div>`;
  document.getElementById('alert-area').innerHTML=alertHTML;

  // MP breakdown
  const mpRev={};const mpOrd={};MP_LIST.forEach(m=>{mpRev[m]=0;mpOrd[m]=0});
  recent.forEach(r=>{mpRev[r.mp]=(mpRev[r.mp]||0)+r.total;mpOrd[r.mp]=(mpOrd[r.mp]||0)+1});
  const maxRev=Math.max(...Object.values(mpRev))||1;
  document.getElementById('mp-list-dash').innerHTML=MP_LIST.map(m=>`
    <div class="mp-row"><div class="mp-color-dot" style="background:${MP_COLORS[m]}"></div>
    <div class="mp-name-col">${m}</div>
    <div class="mp-bar-col"><div class="mp-bar-track"><div class="mp-bar-fill" style="width:${Math.round(mpRev[m]/maxRev*100)}%;background:${MP_COLORS[m]}"></div></div></div>
    <div class="mp-rev-col"><div class="mp-rev">${fmtRp(mpRev[m])}</div><div class="mp-orders-txt">${mpOrd[m]} pesanan</div></div></div>`).join('');

  // Top 5 (dihitung per barang di dalam pesanan, bukan per pesanan)
  const pm={};flattenPenjualan(recent).forEach(r=>{pm[r.prod]=(pm[r.prod]||0)+r.qty});
  const top5=Object.entries(pm).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxQ=top5.length?top5[0][1]:1;
  document.getElementById('top5-bars').innerHTML=top5.map(([n,q])=>`
    <div class="prog-row"><div class="prog-label">${n}</div>
    <div class="prog-track"><div class="prog-fill" style="width:${Math.round(q/maxQ*100)}%"></div></div>
    <div class="prog-val">${q} pcs</div></div>`).join('');

  renderTrendChart(start,end);
  renderStokPieChart();
}

function renderTrendChart(start,end){
  // Granularitas grafik menyesuaikan otomatis lebar rentang yang dipilih di
  // periode picker (harian utk rentang pendek, sampai tahunan utk rentang panjang).
  const unit=unitOtomatis(start,end);
  const buckets=buatBucketLaporan(start,end,unit);
  const aktif=DB.penjualan.filter(r=>r.status!=='Dibatalkan'&&r._date);
  const labels=buckets.map(b=>b.label);
  const datasets=MP_LIST.map(m=>({
    label:m,
    data:buckets.map(b=>aktif.filter(r=>r.mp===m&&new Date(r._date)>=b.start&&new Date(r._date)<=b.end).reduce((a,r)=>a+(r.total||0),0)),
    borderColor:getMpColor(m),tension:.4,pointRadius:0,borderWidth:1.5,fill:false
  }));
  if(charts.trend)charts.trend.destroy();
  charts.trend=new Chart(document.getElementById('chartTrend'),{type:'line',data:{labels,datasets},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{ticks:{color:'#888',font:{size:10},maxTicksLimit:8,autoSkip:true},grid:{color:'rgba(128,128,128,.1)'}},
        y:{ticks:{color:'#888',font:{size:10},callback:v=>fmtRingkas(v)},grid:{color:'rgba(128,128,128,.1)'}}}}});
}

function renderStokPieChart(){
  const batas=(DB.pengaturan.batasStok!=null?DB.pengaturan.batasStok:10);
  const habis=DB.stok.filter(s=>s.stok===0).length,rendah=DB.stok.filter(s=>s.stok>0&&s.stok<=batas).length,aman=DB.stok.length-habis-rendah;
  if(charts.stokPie)charts.stokPie.destroy();
  charts.stokPie=new Chart(document.getElementById('chartStokPie'),{type:'doughnut',data:{labels:['Aman','Rendah','Habis'],datasets:[{data:[aman,rendah,habis],backgroundColor:['#00aa5b','#f59e0b','#ef4444'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'65%'}});
  document.getElementById('pie-legend').innerHTML=[{l:'Aman',c:'#00aa5b',v:aman},{l:'Rendah',c:'#f59e0b',v:rendah},{l:'Habis',c:'#ef4444',v:habis}].map(x=>`<span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:${x.c}"></span>${x.l}: ${x.v}</span>`).join('');
  // Total nilai aset stok gudang yang masih ada (stok x HPP/pcs)
  const totalAset=DB.stok.reduce((a,s)=>a+(s.stok||0)*(s.hpp||0),0);
  const elAset=document.getElementById('stok-asset-total');
  if(elAset)elAset.textContent=fmtRp(totalAset);
}

// ===== PENJUALAN TABLE =====
function filterJual(){
  pageJual=1;const q=(document.getElementById('q-jual').value||'').toLowerCase();const mp=document.getElementById('f-mp-jual').value;const st=document.getElementById('f-status-jual').value;
  filteredJual=DB.penjualan.filter(r=>(!q||r.no.toLowerCase().includes(q)||(r.items||[]).some(it=>it.prod.toLowerCase().includes(q)))&&(!mp||r.mp===mp)&&(!st||r.status===st));
  renderJualTable();
}

const ST_BADGE={'Selesai':'badge-green','Dibatalkan':'badge-red','Diproses':'badge-yellow','Dikirim':'badge-blue'};
function renderJualTable(){
  const start=(pageJual-1)*PER_PAGE,slice=filteredJual.slice(start,start+PER_PAGE);
  document.getElementById('tbl-jual').innerHTML=slice.length?slice.map((r,i)=>{
    const ri=DB.penjualan.indexOf(r);
    const items=r.items||[];
    const laba=hitungLabaOrder(r);
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
      <td><span class="badge ${ST_BADGE[r.status]||'badge-gray'}">${r.status}</span></td>
      <td>${actionCellRW(`<div class="action-cell">
        <button class="btn btn-sm btn-icon" title="Edit" onclick="bukaEditJual(${ri})">✏️</button>
        <button class="btn btn-sm btn-icon btn-danger" title="Hapus" onclick="konfirmHapus('jual',${ri})">🗑</button>
      </div>`,'jual')}</td>
    </tr>`}).join(''):`<tr><td colspan="12" style="text-align:center;padding:32px;color:var(--text3)">Tidak ada data pesanan</td></tr>`;
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
  _formItems=(r.items&&r.items.length?r.items:[{prod:'',varian:'',kat:'',qty:1,harga:0}]).map(it=>({prod:it.prod,varian:it.varian||'',kat:it.kat||'',qty:it.qty||1,harga:it.harga!=null?it.harga:(it.subtotal&&it.qty?Math.round(it.subtotal/it.qty):0)}));
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
}
function saranBiayaTambahanPesanan(){
  document.getElementById('f-biaya-tambahan').value=Math.round(getSaranBiayaTambahan());
}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function escAttr(s){return esc(s).replace(/`/g,'&#96;')}

// ===== ITEM BARANG DALAM PESANAN (multi-item) =====
// 1 pesanan bisa berisi beberapa barang berbeda (mis. checkout gabungan).
// `_formItems` menyimpan baris-baris barang yang sedang diedit di modal.
let _formItems=[];
function kosongkanFormItems(){_formItems=[{prod:'',varian:'',kat:'',qty:1,harga:0}]}
function tambahBarisItem(){_formItems.push({prod:'',varian:'',kat:'',qty:1,harga:0});renderFormItems()}
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
    if(si)it.kat=si.kat;
  }
  // PENTING: jangan panggil renderFormItems() (rebuild total DOM) di sini —
  // itu penyebab bug "1 klik = 1 huruf/angka": setiap event oninput akan
  // menghancurkan & membuat ulang elemen <input>, sehingga fokus & posisi
  // kursor hilang dan user harus klik lagi untuk tiap karakter.
  // Cukup perbarui bagian yang perlu berubah (subtotal, datalist varian,
  // total, hint stok) tanpa mengganti elemen input yang sedang diketik.
  updateRowDisplay(i,field);
}
function formTotalPesanan(){return _formItems.reduce((a,it)=>a+((it.qty||0)*(it.harga||0)),0)}
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
    </div>`).join('');
  _formItems.forEach((it,i)=>{
    const dl=document.getElementById('dl-varian-row-'+i);
    if(dl){const opts=[...new Set(DB.stok.filter(s=>s.prod===it.prod).map(s=>s.varian).filter(Boolean))];dl.innerHTML=opts.map(v=>`<option value="${escAttr(v)}">`).join('')}
  });
  const totalEl=document.getElementById('f-total-display');if(totalEl)totalEl.textContent=fmtRp(formTotalPesanan());
  renderFormStokHint();
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
function cariStok(prod,varian){return DB.stok.find(s=>s.prod===prod&&s.varian===varian)}
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
  });
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
  const items=itemsValid.map(it=>({prod:it.prod.trim(),varian:(it.varian||'').trim(),kat:it.kat||'Lainnya',qty:it.qty||1,harga:it.harga||0,subtotal:(it.qty||1)*(it.harga||0)}));
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
  saveDB(['penjualan','stok']);filteredJual=[...DB.penjualan];filteredStok=[...DB.stok];renderJualTable();renderStokTable();renderDashboard();closeModal('modal-tambah-jual');
}

// ===== STOK TABLE =====
function filterStok(){
  pageStok=1;const q=(document.getElementById('q-stok').value||'').toLowerCase();const st=document.getElementById('f-status-stok').value;const kat=document.getElementById('f-kat-stok').value;const batas=(DB.pengaturan.batasStok!=null?DB.pengaturan.batasStok:10);
  filteredStok=DB.stok.filter(r=>{const status=r.stok===0?'Habis':r.stok<=batas?'Rendah':'Aman';return(!q||r.prod.toLowerCase().includes(q)||r.sku.toLowerCase().includes(q))&&(!st||status===st)&&(!kat||r.kat===kat)});
  renderStokTable();
}
function filterStokKritis(){document.getElementById('f-status-stok').value='';document.getElementById('q-stok').value='';document.getElementById('f-kat-stok').value='';const batas=(DB.pengaturan.batasStok!=null?DB.pengaturan.batasStok:10);filteredStok=DB.stok.filter(s=>s.stok<=batas);pageStok=1;renderStokTable()}
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
      <td><span class="badge ${badge}">${status}</span></td>
      <td>${actionCellRW(`<div class="action-cell">
        <button class="btn btn-sm btn-icon" title="Edit" onclick="bukaEditStok(${ri})">✏️</button>
        <button class="btn btn-sm btn-icon btn-success" title="Restock" onclick="bukaRestock(${ri})">+ Stok</button>
        <button class="btn btn-sm btn-icon btn-danger" title="Hapus" onclick="konfirmHapus('stok',${ri})">🗑</button>
      </div>`)}</td>
    </tr>`}).join(''):`<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text3)">Tidak ada data stok</td></tr>`;
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
  if(idx!==''&&idx>=0)DB.stok[parseInt(idx)]=r;else DB.stok.unshift(r);
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
  DB.stok[_restockIdx].stok+=tambah;saveDB(['stok']);filteredStok=[...DB.stok];renderStokTable();renderDashboard();closeModal('modal-restock');_restockIdx=-1;
}

// ===== HAPUS =====
function konfirmHapus(type,idx){
  const needSettings=(type==='kat'||type==='mp');
  if(needSettings&&!canManageSettings()){alert("Hanya Owner yang bisa menghapus kategori/marketplace.");return}
  if(type==='jual'&&!canWriteOrders()){alert("Anda tidak punya izin untuk menghapus pesanan.");return}
  if(!needSettings&&type!=='jual'&&!canWrite()){alert("Anda tidak punya izin untuk menghapus data ini.");return}
  const msg=type==='jual'?`Hapus pesanan "${DB.penjualan[idx].no}"?`:type==='stok'?`Hapus produk "${DB.stok[idx].prod} ${DB.stok[idx].varian}"?`:type==='mp'?`Hapus marketplace "${DB.marketplace[idx].nama}"? Pesanan lama dengan marketplace ini tidak akan terhapus.`:`Hapus kategori "${DB.kategori[idx].nama}"?`;
  document.getElementById('konfirm-msg').textContent=msg;
  document.getElementById('btn-konfirm-ya').onclick=function(){hapusData(type,idx);closeModal('modal-konfirm')};
  openModal('modal-konfirm');
}
function hapusData(type,idx){
  let affected=[];
  if(type==='jual'){
    const order=DB.penjualan[idx];
    terapkanEfekStok(order,+1); // kembalikan stok yang sebelumnya terpakai pesanan ini
    DB.penjualan.splice(idx,1);filteredJual=[...DB.penjualan];filteredStok=[...DB.stok];renderJualTable();renderStokTable();affected=['penjualan','stok'];
  }
  else if(type==='stok'){DB.stok.splice(idx,1);filteredStok=[...DB.stok];renderStokTable();affected=['stok']}
  else if(type==='kat'){DB.kategori.splice(idx,1);renderKatList();populateKatDropdowns();affected=['kategori']}
  else if(type==='mp'){
    if(DB.marketplace.length<=1){alert('Minimal harus ada 1 marketplace.');return}
    DB.marketplace.splice(idx,1);refreshMpGlobals();populateMpDropdowns();renderMpList();affected=['marketplace'];
  }
  saveDB(affected);renderDashboard();
}

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
  if(idx!==''&&idx>=0)DB.kategori[parseInt(idx)]={nama,color:_selectedKatColor};else DB.kategori.push({nama,color:_selectedKatColor});
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
  let hpp=0;
  const hppPct=biaya.hpp_pct!=null?biaya.hpp_pct:45;
  if(biaya.hpp_mode==='pct')hpp=hppPct/100*omzet;
  else{const ph=getHppDariStok(r.prod,r.varian);hpp=(ph!=null)?ph*(r.qty||1):hppPct/100*omzet}
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
  if(tab==='biayaadmin'){renderBiayaInputs();renderHppMode()}
}
function renderLabaRingkasan(){
  const allOrders=DB.penjualan.filter(r=>r.status!=='Dibatalkan');
  const all=flattenPenjualan(allOrders);
  let to=0,th=0,tf=0,te=0,tl=0;all.forEach(r=>{const h=hitungLaba(r);to+=h.omzet;th+=h.hpp;tf+=h.mpFee;te+=h.extra;tl+=h.laba});
  const margin=to>0?tl/to*100:0;
  document.getElementById('laba-metrics').innerHTML=`
    <div class="metric-card"><div class="metric-label">Total Omzet</div><div class="metric-value">${fmtRp(to)}</div><div class="metric-sub" style="color:var(--text3)">${allOrders.length} pesanan · ${all.length} barang</div></div>
    <div class="metric-card"><div class="metric-label">Total Biaya Admin MP</div><div class="metric-value orange">${fmtRp(tf)}</div><div class="metric-sub orange">${to>0?(tf/to*100).toFixed(1):0}% dari omzet</div></div>
    <div class="metric-card"><div class="metric-label">Total HPP</div><div class="metric-value red">${fmtRp(th)}</div><div class="metric-sub red">${to>0?(th/to*100).toFixed(1):0}% dari omzet</div></div>
    <div class="metric-card"><div class="metric-label">Laba Bersih</div><div class="metric-value ${tl>=0?'green':'red'}">${fmtRp(tl)}</div><div class="metric-sub ${tl>=0?'green':'red'}">${margin.toFixed(1)}% margin</div></div>`;

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
    <tbody>${MP_LIST.map(m=>{const d=mpDetail[m];const mg=d.omzet>0?d.laba/d.omzet*100:0;const mc=mg>=30?'#1a7f47':mg>=15?'#8a5c00':'#b91c1c';return`<tr>
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
    const bc=r.margin>=30?'#1a7f47':r.margin>=15?'#f59e0b':'#b91c1c';
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

// ===== RINGKASAN BIAYA ADMIN & BIAYA TAMBAHAN (read-only) =====
// Sumber data sekarang dari Penjualan (per pesanan), bukan input global lagi.
function renderBiayaInputs(){
  const aktif=DB.penjualan.filter(r=>r.status!=='Dibatalkan');
  document.getElementById('mp-fee-summary').innerHTML=MP_LIST.map(m=>{
    const data=aktif.filter(r=>r.mp===m&&r.biayaAdmin!=null&&r.total>0);
    if(!data.length)return `<div class="hpp-item"><label>${m}</label><div style="font-size:13px;color:var(--text3)">Belum ada data</div></div>`;
    const totalOmzet=data.reduce((a,r)=>a+r.total,0);const totalFee=data.reduce((a,r)=>a+r.biayaAdmin,0);
    const pct=totalOmzet>0?totalFee/totalOmzet*100:0;
    return `<div class="hpp-item"><label>${m}</label><div style="font-weight:600;font-size:14px">${fmtRp(totalFee/data.length)} <span style="font-weight:400;font-size:11px;color:var(--text3)">/transaksi (~${pct.toFixed(1)}%)</span></div></div>`;
  }).join('');
  const dataExtra=aktif.filter(r=>r.biayaTambahan!=null);
  if(!dataExtra.length){
    document.getElementById('extra-fee-summary').innerHTML=`<div class="hpp-item" style="grid-column:1/-1"><div style="font-size:13px;color:var(--text3)">Belum ada data biaya tambahan dari pesanan.</div></div>`;
  }else{
    const avgExtra=dataExtra.reduce((a,r)=>a+r.biayaTambahan,0)/dataExtra.length;
    document.getElementById('extra-fee-summary').innerHTML=`<div class="hpp-item" style="grid-column:1/-1"><label>Rata-rata semua marketplace</label><div style="font-weight:600;font-size:14px">${fmtRp(avgExtra)} /transaksi</div></div>`;
  }
}
function renderHppMode(){
  const b=DB.biaya||DEFAULT_BIAYA;const mode=document.getElementById('hpp-mode').value||b.hpp_mode||'pct';
  if(mode==='pct'){
    document.getElementById('hpp-mode-content').innerHTML=`<div class="form-group"><label>HPP Global (% dari harga jual)</label><input class="form-input" type="number" step="1" id="hpp-pct-val" value="${b.hpp_pct!=null?b.hpp_pct:45}" max="100" min="0"><div style="font-size:11px;color:var(--text3);margin-top:4px">Contoh: nilai 45 berarti HPP = 45% dari harga jual</div></div>`;
  } else {
    // Mode "produk": HPP sekarang diambil otomatis dari data Stok & Gudang
    // (kolom HPP di tiap produk-varian), bukan input manual di sini lagi.
    const map={};
    DB.stok.forEach(s=>{if(!map[s.prod])map[s.prod]=[];if(s.hpp!=null&&s.hpp>0)map[s.prod].push(s.hpp)});
    const prodNames=Object.keys(map).sort();
    if(!prodNames.length){
      document.getElementById('hpp-mode-content').innerHTML=`<div class="info-box" style="margin-bottom:0">Belum ada data HPP. Isi kolom <strong>HPP (Harga Pokok Produksi)</strong> saat menambah/mengedit produk di menu <strong>Stok & Gudang</strong>.</div>`;
      return;
    }
    document.getElementById('hpp-mode-content').innerHTML=`
      <div style="font-size:11px;color:var(--text3);margin-bottom:10px">HPP per produk berikut diambil otomatis dari data Stok & Gudang (rata-rata jika produk punya beberapa varian dengan HPP berbeda). Untuk mengubahnya, edit di menu Stok & Gudang.</div>
      <div class="hpp-grid">${prodNames.map(p=>{
        const vals=map[p];const avg=vals.length?vals.reduce((a,v)=>a+v,0)/vals.length:0;
        return `<div class="hpp-item"><label>${p}</label><div style="font-weight:600;font-size:14px">${vals.length?fmtRp(avg):'<span style="color:var(--text3);font-weight:400">Belum diisi</span>'}</div></div>`;
      }).join('')}</div>
      <button class="btn btn-sm" style="margin-top:14px" onclick="showSection('stok')">📦 Buka Stok & Gudang</button>`;
  }
}
function simpanBiaya(){
  if(!canManageSettings()){alert("Hanya Owner yang bisa mengubah pengaturan biaya.");return}
  if(!DB.biaya)DB.biaya=JSON.parse(JSON.stringify(DEFAULT_BIAYA));
  const b=DB.biaya;
  b.hpp_mode=document.getElementById('hpp-mode').value||'pct';
  if(b.hpp_mode==='pct'){const v=parseFloat(document.getElementById('hpp-pct-val').value);b.hpp_pct=isNaN(v)?45:v}
  saveDB(['biaya','marketplace','stok']);alert('✅ Pengaturan HPP disimpan! Laporan laba diperbarui.');renderLabaRingkasan();
}
function resetBiaya(){if(!canManageSettings()){alert("Hanya Owner yang bisa reset biaya.");return}if(confirm('Reset pengaturan HPP ke default?')){DB.biaya=JSON.parse(JSON.stringify(DEFAULT_BIAYA));saveDB(['biaya','marketplace','stok']);renderBiayaInputs();renderHppMode();alert('Pengaturan HPP direset.')}}

// ===== LAPORAN =====
function renderLaporan(){
  const{start,end,label}=ppGetRange('pp-laporan');
  const semuaAktif=DB.penjualan.filter(r=>r.status!=='Dibatalkan'&&r._date);
  const dalamRentang=semuaAktif.filter(r=>{const d=new Date(r._date);return d>=start&&d<=end});

  const judulEl=document.getElementById('keuangan-title');
  if(judulEl)judulEl.textContent='Ringkasan Keuangan — '+label;

  const rowsEl=document.getElementById('keuangan-rows');
  const{to,tl,tf,te,th}=hitungRingkasPeriode(dalamRentang);
  if(rowsEl){
    rowsEl.innerHTML=[
      {l:'Total Omzet',v:fmtRp(to),c:''},
      {l:'Biaya Admin Marketplace',v:'− '+fmtRp(tf),c:'red'},
      {l:'Ongkir & Biaya Lain-lain',v:'− '+fmtRp(te),c:'red'},
      {l:'HPP Estimasi',v:'− '+fmtRp(th),c:'red'},
      {l:'Estimasi Laba Bersih',v:fmtRp(tl),c:'green'},
      {l:'Margin Bersih',v:(to>0?tl/to*100:0).toFixed(1)+'%',c:'green'},
    ].map(r=>`<div class="sumrow"><span class="label">${r.l}</span><span class="${r.c}">${r.v}</span></div>`).join('');
  }

  if(charts.mpBar)charts.mpBar.destroy();
  const mpRev={};MP_LIST.forEach(m=>mpRev[m]=0);dalamRentang.forEach(r=>mpRev[r.mp]=(mpRev[r.mp]||0)+(r.total||0));
  charts.mpBar=new Chart(document.getElementById('chartMpBar'),{type:'bar',data:{labels:MP_LIST,datasets:[{label:'Revenue',data:MP_LIST.map(m=>Math.round(mpRev[m]/1e6*10)/10),backgroundColor:MP_LIST.map(m=>getMpColor(m)),borderWidth:0,borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#888',font:{size:11}},grid:{display:false}},y:{ticks:{color:'#888',font:{size:10},callback:v=>'Rp'+v+'jt'},grid:{color:'rgba(128,128,128,.1)'}}}}});

  if(charts.bulanan)charts.bulanan.destroy();
  const selBulan=document.getElementById('f-periode-bulanan');
  const bulanCount=selBulan?parseInt(selBulan.value)||6:6;
  const titleEl=document.getElementById('bulanan-title');
  if(titleEl)titleEl.textContent='Tren Bulanan ('+bulanCount+' Bulan Terakhir)';
  const tren=hitungTrenBulanan(bulanCount);
  charts.bulanan=new Chart(document.getElementById('chartBulanan'),{type:'bar',data:{labels:tren.labels,datasets:MP_LIST.map(m=>({label:m,data:tren.data[m]||tren.labels.map(()=>0),backgroundColor:getMpColor(m),borderRadius:3}))},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:11},boxWidth:12}}},scales:{x:{stacked:true,ticks:{color:'#888',font:{size:11}},grid:{display:false}},y:{stacked:true,ticks:{color:'#888',font:{size:10},callback:v=>fmtRingkas(v)},grid:{color:'rgba(128,128,128,.1)'}}}}});
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
      if(['hari_ini','kemarin','7_hari','30_hari'].includes(mode)){state.mode=mode;selesai();return}
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
function hitungTrenBulanan(bulanCount){
  const now=new Date();
  const bulanKe=[];
  for(let i=bulanCount-1;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    bulanKe.push({key:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),label:d.toLocaleDateString('id-ID',{month:'short',year:'2-digit'})});
  }
  const data={};MP_LIST.forEach(m=>data[m]=bulanKe.map(()=>0));
  DB.penjualan.filter(r=>r.status!=='Dibatalkan'&&r._date).forEach(r=>{
    const d=new Date(r._date);if(isNaN(d))return;
    const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    const idx=bulanKe.findIndex(b=>b.key===key);
    if(idx===-1)return;
    if(!data[r.mp])data[r.mp]=bulanKe.map(()=>0);
    data[r.mp][idx]+=r.total||0;
  });
  return{labels:bulanKe.map(b=>b.label),data};
}
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
function handleDrop(e,type){e.preventDefault();const f=e.dataTransfer.files[0];if(f)processCSV(f,type)}
function importFile(e,type){if(e.target.files[0])processCSV(e.target.files[0],type)}
function processCSV(file,type){
  const reader=new FileReader();
  reader.onload=function(e){
    const lines=e.target.result.split(/\r?\n/).filter(l=>l.trim());
    const headers=parseCSVLine(lines[0]).map(h=>h.trim().toLowerCase().replace(/\s+/g,'_'));
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
        if(idxAda!==-1)DB.penjualan[idxAda]=orderBaru;else DB.penjualan.push(orderBaru);
      });
    }else{
      for(let i=1;i<lines.length;i++){
        const cols=parseCSVLine(lines[i]);const row={};headers.forEach((h,j)=>row[h]=(cols[j]||'').trim());
        try{
          DB.stok.push({sku:row.sku||'SKU-IMP-'+i,prod:row.produk||'–',varian:row.varian||'',kat:row.kategori||'Lainnya',stok:parseInt(row.stok||0),terjual:parseInt(row.terjual_30h||row.terjual||0),hpp:parseFloat((row.hpp||'0').replace(/[^0-9.]/g,''))||0});
          imported++;
        }catch(err){errors++}
      }
    }
    saveDB(['penjualan','stok','marketplace']);filteredJual=[...DB.penjualan];filteredStok=[...DB.stok];populateMpDropdowns();renderJualTable();renderStokTable();renderDashboard();
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
function exportCSV(){
  const h=csvRow(['No. Pesanan','Tanggal','Marketplace','Produk','Varian','Kategori','Qty','Harga Satuan','Subtotal','Status','Biaya Admin','Biaya Tambahan'])+'\n';
  const rows=[];
  DB.penjualan.forEach(r=>{
    (r.items&&r.items.length?r.items:[{prod:'',varian:'',kat:'',qty:'',harga:'',subtotal:''}]).forEach(it=>{
      rows.push(csvRow([r.no,r.tanggal,r.mp,it.prod,it.varian||'',it.kat||'',it.qty,it.harga,it.subtotal,r.status,r.biayaAdmin!=null?Math.round(r.biayaAdmin):'',r.biayaTambahan!=null?Math.round(r.biayaTambahan):'']));
    });
  });
  dlFile(h+rows.join('\n'),'penjualan_'+today()+'.csv','text/csv');
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
function restoreData(e){const reader=new FileReader();reader.onload=function(ev){try{DB=JSON.parse(ev.target.result);if(!DB.marketplace||!DB.marketplace.length)DB.marketplace=JSON.parse(JSON.stringify(DEFAULT_MP));DB.penjualan=migrasiPenjualanLama(DB.penjualan);refreshMpGlobals();saveDB();filteredJual=[...DB.penjualan];filteredStok=[...DB.stok];applyPengaturan();populateKatDropdowns();populateMpDropdowns();renderDashboard();renderJualTable();renderStokTable();alert('Data dipulihkan! '+DB.penjualan.length+' pesanan, '+DB.stok.length+' varian.')}catch(err){alert('File backup tidak valid: '+err.message)}};reader.readAsText(e.target.files[0])}
function resetData(){if(!canManageSettings()){alert('Hanya Owner yang bisa reset data.');return}if(confirm('Hapus SEMUA data penjualan & stok? Tindakan ini tidak bisa dibatalkan.')){
  DB.penjualan=[];DB.stok=[];DB.kategori=[...DEFAULT_KAT];DB.marketplace=JSON.parse(JSON.stringify(DEFAULT_MP));DB.biaya=JSON.parse(JSON.stringify(DEFAULT_BIAYA));
  refreshMpGlobals();saveDB();filteredJual=[...DB.penjualan];filteredStok=[...DB.stok];populateKatDropdowns();populateMpDropdowns();applyPengaturan();renderDashboard();renderJualTable();renderStokTable();
  alert('Semua data berhasil dikosongkan. Silakan mulai input data Anda sendiri.');
}}

// ===== PENGATURAN =====
function simpanPengaturan(){
  if(!canManageSettings()){alert("Hanya Owner yang bisa mengubah pengaturan toko.");return}
  DB.pengaturan.nama=document.getElementById('set-nama').value;DB.pengaturan.pemilik=document.getElementById('set-pemilik').value;
  DB.pengaturan.hp=document.getElementById('set-hp').value;const vBatas=parseInt(document.getElementById('set-batas-stok').value);DB.pengaturan.batasStok=isNaN(vBatas)?10:vBatas;
  saveDB(['pengaturan']);applyPengaturan();renderDashboard();alert('Pengaturan tersimpan!');
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
function toggleTheme(){const c=document.documentElement.getAttribute('data-theme');document.documentElement.setAttribute('data-theme',c==='dark'?'':'dark');localStorage.setItem('omni_theme',c==='dark'?'':'dark')}

// ===== FIX BUTTON HANDLERS =====
// Override inline onclick for modal open to use proper functions
window.addEventListener('load',function(){
  // Fix all "Tambah Pesanan" buttons
  document.querySelectorAll('[onclick*="modal-tambah-jual"]').forEach(el=>{if(!el.onclick||el.onclick.toString().includes('openModal'))el.onclick=bukaModalTambahJual});
  document.querySelectorAll('[onclick*="modal-tambah-stok"]').forEach(el=>{if(!el.onclick||el.onclick.toString().includes('openModal'))el.onclick=bukaModalTambahStok});
  document.querySelectorAll('[onclick*="modal-tambah-kat"]').forEach(el=>{if(!el.onclick||el.onclick.toString().includes('openModal'))el.onclick=bukaModalTambahKat});
});
