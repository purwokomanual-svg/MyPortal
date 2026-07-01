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
function fmtRp(n){return 'Rp '+Math.round(n).toLocaleString('id-ID')}
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
function loadDB(){const r=localStorage.getItem('omniseller_v2');if(r){DB=JSON.parse(r);return true}return false}

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
// ===== HELPER PESANAN MULTI-BARANG =====
// Setiap pesanan (DB.penjualan[i]) sekarang punya `items`: array barang
// [{sku,prod,varian,kat,qty,harga}]. Total pesanan SELALU dihitung dari
// penjumlahan item, tidak lagi disimpan manual.
function orderTotal(r){return(r.items||[]).reduce((a,it)=>a+(it.qty||0)*(it.harga||0),0)}
function orderQty(r){return(r.items||[]).reduce((a,it)=>a+(it.qty||0),0)}
function ringkasItem(r){
  const items=r.items||[];
  if(!items.length)return '–';
  const first=items[0].prod+(items[0].varian?' ('+items[0].varian+')':'');
  return items.length>1?`${first} +${items.length-1} barang lain`:first;
}

async function syncPenjualan_(){
  // 1. Upsert header pesanan
  const headers=DB.penjualan.map(r=>({
    no_pesanan:r.no,tanggal:r.tanggal,tgl_iso:r._date||new Date().toISOString(),
    marketplace:r.mp,status:r.status||'Selesai',
    biaya_admin:r.biayaAdmin!=null?r.biayaAdmin:null,
    biaya_tambahan:r.biayaTambahan!=null?r.biayaTambahan:null,
    catatan:r.catatan||''
  }));
  await safeReplace(TBL_PESANAN, headers, 'no_pesanan');
  if(!headers.length)return; // semua pesanan dihapus, tidak perlu proses item

  // 2. Ambil id pesanan (auto-increment) untuk memetakan item ke pesanan_id
  const{data:idRows,error:idErr}=await supabaseClient.from(TBL_PESANAN).select('id,no_pesanan');
  if(idErr)throw idErr;
  const idMap={};(idRows||[]).forEach(x=>idMap[x.no_pesanan]=x.id);

  // 3. Susun ulang seluruh baris item milik pesanan yang ada di data lokal
  const itemRows=[];
  DB.penjualan.forEach(r=>{
    const pid=idMap[r.no];if(pid==null)return;
    (r.items||[]).forEach(it=>{
      itemRows.push({pesanan_id:pid,sku:it.sku||null,produk:it.prod,varian:it.varian||'',kategori:it.kat||'Lainnya',qty:it.qty!=null?it.qty:1,harga_satuan:it.harga!=null?it.harga:0});
    });
  });
  const pids=Object.values(idMap);
  // 4. Ganti SEMUA baris item milik pesanan-pesanan tsb dengan versi lokal terbaru
  //    (aman: pesanan_item tidak direferensikan tabel lain, jadi delete+insert per-pesanan aman)
  if(pids.length){
    const{error:delErr}=await supabaseClient.from(TBL_PESANAN_ITEM).delete().in('pesanan_id',pids);
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

// Ambil semua data dari 7 tabel relasional & susun ulang jadi struktur DB di memori
async function loadFromSupabase(){
  try{
    const[katRes,mpRes,stokRes,jualRes,biayaRes,hppRes,setRes]=await Promise.all([
      supabaseClient.from(TBL_KATEGORI).select('*').order('id'),
      supabaseClient.from(TBL_MARKETPLACE).select('*').order('id'),
      supabaseClient.from(TBL_STOK).select('*').order('id'),
      supabaseClient.from(TBL_PESANAN).select('*, pesanan_item(*)').order('id'),
      supabaseClient.from(TBL_BIAYA).select('*').eq('id',1).maybeSingle(),
      supabaseClient.from(TBL_HPP_PRODUK).select('*'),
      supabaseClient.from(TBL_PENGATURAN).select('*').eq('id',1).maybeSingle(),
    ]);
    const errs=[katRes,mpRes,stokRes,jualRes,biayaRes,hppRes,setRes].map(r=>r.error).filter(Boolean);
    if(errs.length){
      console.warn('Gagal memuat dari Supabase:',errs[0].message);
      updateSyncBadge(false,errs[0].message);
      if(/relation .*pesanan.* does not exist/i.test(errs[0].message||'')){
        alert('⚠️ Tabel "pesanan" & "pesanan_item" belum ada. Jalankan file MULTI-ITEM-PESANAN.sql di Supabase Dashboard > SQL Editor terlebih dahulu.');
      }
      return null;
    }

    const kategori=(katRes.data||[]).map(k=>({nama:k.nama,color:k.color}));
    const marketplace=(mpRes.data||[]).map(m=>({nama:m.nama,color:m.color}));
    const stok=(stokRes.data||[]).map(s=>({sku:s.sku,prod:s.produk,varian:s.varian,kat:s.kategori,stok:s.stok,terjual:s.terjual,hpp:Number(s.hpp)||0}));
    const penjualan=(jualRes.data||[]).map(r=>({
      no:r.no_pesanan,tanggal:r.tanggal,_date:r.tgl_iso,mp:r.marketplace,status:r.status,
      biayaAdmin:r.biaya_admin!=null?Number(r.biaya_admin):null,
      biayaTambahan:r.biaya_tambahan!=null?Number(r.biaya_tambahan):null,
      catatan:r.catatan||'',
      items:(r.pesanan_item||[]).map(it=>({sku:it.sku||'',prod:it.produk,varian:it.varian||'',kat:it.kategori||'Lainnya',qty:it.qty,harga:Number(it.harga_satuan)}))
    }));

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
  for(let i=0;i<200;i++){
    const mp=MP_LIST[rnd(0,3)];const d=new Date(2025,rnd(0,5),rnd(1,28));
    const jmlItem=Math.random()<0.35?rnd(2,3):1; // ~35% pesanan berisi >1 barang, mirip kondisi nyata
    const items=[];
    for(let j=0;j<jmlItem;j++){
      const prod=PRODUK[rnd(0,9)];const varian=VARIAN[rnd(0,14)];const qty=rnd(1,3);const harga=rnd(35000,450000);
      items.push({sku:'',prod,varian,kat:katMap[prod]||'Lainnya',qty,harga});
    }
    DB.penjualan.push({no:mp.substring(0,3).toUpperCase()+'-'+(1000+i),tanggal:fmtTgl(d),_date:d.toISOString(),mp,status:STATUS_ARR[rnd(0,6)],biayaAdmin:null,biayaTambahan:null,items});
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
  renderDashboard();
  renderJualTable();
  renderStokTable();
  populateKatDropdowns();
  populateMpDropdowns();
  document.getElementById('f-tgl').value=today();
  (function(){const t=localStorage.getItem('omni_theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark')})();
}

// ===== ADMIN AUTH (Supabase Auth) + ROLE/PRIVILEGE =====
let _currentAdminRole=null; // 'owner' | 'staff' | 'viewer' | 'pending' | null
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
  _currentAdminUser=null;_currentAdminRole=null;
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
    const label={owner:'👑 Owner (akses penuh)',staff:'🛠 Staff (kelola transaksi & stok)',viewer:'👁 Viewer (hanya lihat)'}[_currentAdminRole]||_currentAdminRole||'–';
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
function canWrite(){return _currentAdminRole==='owner'||_currentAdminRole==='staff'} // boleh tambah/edit/hapus data transaksi
function canManageSettings(){return _currentAdminRole==='owner'} // boleh ubah biaya/pengaturan toko/marketplace/kategori/user
// Sembunyikan/disable elemen UI sesuai role. Dipanggil setelah login & setiap render ulang halaman besar.
function applyRolePermissions(){
  if(!_currentAdminRole)return;
  const write=canWrite(), settings=canManageSettings();
  // Sembunyikan/tampilkan tombol sesuai role
  document.querySelectorAll('[data-need="write"]').forEach(el=>{
    el.style.display=write?'':'none';
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
// Dipakai di renderJualTable/renderStokTable/dst untuk sembunyikan tombol aksi kalau viewer
function actionCellRW(html){return canWrite()?html:''}

// ===== MANAJEMEN USER & HAK AKSES (khusus Owner) =====
async function renderUserList(){
  const el=document.getElementById('user-list-manage');
  if(!el||!isOwner())return;
  el.innerHTML=`<div style="text-align:center;padding:20px;color:var(--text3)">Memuat...</div>`;
  try{
    const{data,error}=await supabaseClient.from('admin_users').select('id,email,nama,role,created_at').order('created_at');
    if(error){el.innerHTML=`<div style="color:var(--danger);font-size:13px">Gagal memuat: ${error.message}</div>`;return}
    if(!data||!data.length){el.innerHTML=`<div style="color:var(--text3);text-align:center;padding:20px">Belum ada user</div>`;return}
    const roleBadge={owner:'background:#fef3c7;color:#92400e',staff:'background:#dbeafe;color:#1e40af',viewer:'background:#e5e7eb;color:#374151',pending:'background:#fee2e2;color:#991b1b'};
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
    if(event==='SIGNED_OUT'){_currentAdminUser=null;_currentAdminRole=null;showLoginScreen()}
  });
}

// ===== SECTIONS =====
const PAGE_TITLES={dashboard:'Dashboard',penjualan:'Laporan Penjualan',stok:'Stok & Gudang',produk:'Produk & Kategori',laba:'Laba & Biaya Admin per Produk',laporan:'Laporan Keuangan',import:'Import Data',pengaturan:'Pengaturan'};
function showSection(id,el){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('sec-'+id).classList.add('active');
  if(el)el.classList.add('active');
  document.getElementById('page-title').textContent=PAGE_TITLES[id]||id;
  if(id==='laporan')renderLaporan();
  if(id==='produk')renderProduk();
  if(id==='laba'){renderLabaSection();renderBiayaInputs();renderHppMode();}
  if(id==='pengaturan'){updateInfoPengaturan();if(canManageSettings())renderUserList();}
  applyRolePermissions(); // selalu re-apply setiap ganti section
}

// ===== KATEGORI DROPDOWN POPULATE =====
function populateKatDropdowns(){
  const names=getKatNames();
  const ids=['s-kat','f-kat-stok','f-kat-laba'];
  ids.forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    const isFilter=id.startsWith('f-kat');
    el.innerHTML=(isFilter?'<option value="">Semua Kategori</option>':'')+names.map(n=>`<option>${n}</option>`).join('');
  });
}

// ===== DASHBOARD =====
function reloadData(){renderDashboard()}
function renderDashboard(){
  const p=parseInt(document.getElementById('periodeSelect').value);
  const cutoff=new Date();cutoff.setDate(cutoff.getDate()-p);
  const recent=DB.penjualan.filter(r=>r.status!=='Dibatalkan'&&new Date(r._date||r.tanggal.split('/').reverse().join('-'))>=cutoff);
  const totalRev=recent.reduce((a,r)=>a+orderTotal(r),0);
  const totalOrd=recent.length;
  const batas=(DB.pengaturan.batasStok!=null?DB.pengaturan.batasStok:10);
  const kritis=DB.stok.filter(s=>s.stok<=batas).length;

  // Laba estimasi
  let totalLaba=0;recent.forEach(r=>{totalLaba+=hitungLaba(r).laba});
  const margin=totalRev>0?totalLaba/totalRev*100:0;

  document.getElementById('m-rev').textContent=fmtRp(totalRev);
  document.getElementById('m-rev-sub').textContent='▲ 18.4% vs periode lalu';
  document.getElementById('m-ord').textContent=totalOrd.toLocaleString('id-ID');
  document.getElementById('m-ord-sub').textContent='▲ 12.1% vs periode lalu';
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
  recent.forEach(r=>{mpRev[r.mp]=(mpRev[r.mp]||0)+orderTotal(r);mpOrd[r.mp]=(mpOrd[r.mp]||0)+1});
  const maxRev=Math.max(...Object.values(mpRev))||1;
  document.getElementById('mp-list-dash').innerHTML=MP_LIST.map(m=>`
    <div class="mp-row"><div class="mp-color-dot" style="background:${MP_COLORS[m]}"></div>
    <div class="mp-name-col">${m}</div>
    <div class="mp-bar-col"><div class="mp-bar-track"><div class="mp-bar-fill" style="width:${Math.round(mpRev[m]/maxRev*100)}%;background:${MP_COLORS[m]}"></div></div></div>
    <div class="mp-rev-col"><div class="mp-rev">${fmtRp(mpRev[m])}</div><div class="mp-orders-txt">${mpOrd[m]} pesanan</div></div></div>`).join('');

  // Top 5 (dihitung per barang di dalam pesanan, bukan per pesanan)
  const pm={};recent.forEach(r=>(r.items||[]).forEach(it=>{pm[it.prod]=(pm[it.prod]||0)+(it.qty||0)}));
  const top5=Object.entries(pm).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxQ=top5.length?top5[0][1]:1;
  document.getElementById('top5-bars').innerHTML=top5.map(([n,q])=>`
    <div class="prog-row"><div class="prog-label">${n}</div>
    <div class="prog-track"><div class="prog-fill" style="width:${Math.round(q/maxQ*100)}%"></div></div>
    <div class="prog-val">${q} pcs</div></div>`).join('');

  renderTrendChart(recent,p);
  renderStokPieChart();
}

function renderTrendChart(recent,days){
  const labels=[],d1=[],d2=[],d3=[];
  for(let i=days-1;i>=0;i--){
    const d=new Date();d.setDate(d.getDate()-i);
    labels.push(`${d.getDate()}/${d.getMonth()+1}`);
    const ds=fmtTgl(d);const dr=recent.filter(r=>r.tanggal===ds);
    d1.push(dr.filter(r=>r.mp==='Shopee').reduce((a,r)=>a+orderTotal(r),0));
    d2.push(dr.filter(r=>r.mp==='Tokopedia').reduce((a,r)=>a+orderTotal(r),0));
    d3.push(dr.filter(r=>r.mp==='TikTok Shop').reduce((a,r)=>a+orderTotal(r),0));
  }
  if(charts.trend)charts.trend.destroy();
  charts.trend=new Chart(document.getElementById('chartTrend'),{type:'line',data:{labels,datasets:[
    {label:'Shopee',data:d1,borderColor:'#ee4d2d',tension:.4,pointRadius:0,borderWidth:1.5,fill:false},
    {label:'Tokopedia',data:d2,borderColor:'#00aa5b',tension:.4,pointRadius:0,borderWidth:1.5,fill:false},
    {label:'TikTok',data:d3,borderColor:'#888',tension:.4,pointRadius:0,borderWidth:1.5,fill:false}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{ticks:{color:'#888',font:{size:10},maxTicksLimit:8,autoSkip:true},grid:{color:'rgba(128,128,128,.1)'}},
        y:{ticks:{color:'#888',font:{size:10},callback:v=>'Rp'+(v/1e6).toFixed(1)+'jt'},grid:{color:'rgba(128,128,128,.1)'}}}}});
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
    const h=hitungLaba(r);
    const items=r.items||[];
    const barangHTML=items.length?`<div style="font-weight:600">${items[0].prod}${items[0].varian?' <span style="color:var(--text3);font-weight:400">('+items[0].varian+')</span>':''}</div>${items.length>1?`<div style="font-size:11px;color:var(--text3)">+${items.length-1} barang lain, ${orderQty(r)} pcs total</div>`:''}`:'<span style="color:var(--text3)">–</span>';
    return `<tr>
      <td class="mono">${r.no}</td>
      <td style="color:var(--text2)">${r.tanggal}</td>
      <td><span class="mp-tag" style="${mpTagStyle(r.mp)}">${r.mp}</span></td>
      <td>${barangHTML}</td>
      <td style="text-align:center;font-weight:600">${orderQty(r)}</td>
      <td style="font-weight:600">${fmtRp(h.omzet)}</td>
      <td style="color:var(--warning)">${fmtRp(h.mpFee)}</td>
      <td style="color:var(--text2)">${fmtRp(h.extra)}</td>
      <td><span class="badge ${ST_BADGE[r.status]||'badge-gray'}">${r.status}</span></td>
      <td>${actionCellRW(`<div class="action-cell">
        <button class="btn btn-sm btn-icon" title="Edit" onclick="bukaEditJual(${ri})">✏️</button>
        <button class="btn btn-sm btn-icon btn-danger" title="Hapus" onclick="konfirmHapus('jual',${ri})">🗑</button>
      </div>`)}</td>
    </tr>`}).join(''):`<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text3)">Tidak ada data pesanan</td></tr>`;
  renderPagination('pag-jual',filteredJual.length,pageJual,p=>{pageJual=p;renderJualTable()});
}

// ===== MODAL PESANAN (multi-barang) =====
// _formItems: daftar barang yang sedang diedit di form modal (di luar DB.penjualan
// sampai tombol "Simpan Pesanan" ditekan).
let _formItems=[];
function bukaEditJual(idx){
  const r=DB.penjualan[idx];_editJualIdx=idx;
  document.getElementById('modal-jual-title').textContent='✏️ Edit Pesanan';
  document.getElementById('btn-simpan-jual').textContent='Simpan Perubahan';
  document.getElementById('edit-jual-idx').value=idx;
  document.getElementById('f-no').value=r.no;
  document.getElementById('f-tgl').value=r._date?r._date.split('T')[0]:today();
  document.getElementById('f-mp').value=r.mp;
  document.getElementById('f-status').value=r.status;
  document.getElementById('f-biaya-admin').value=r.biayaAdmin!=null?r.biayaAdmin:Math.round(getSaranBiayaAdmin(r.mp,orderTotal(r)));
  document.getElementById('f-biaya-tambahan').value=r.biayaTambahan!=null?r.biayaTambahan:Math.round(getSaranBiayaTambahan());
  populateKatDropdowns();
  populateProdukDatalist();
  _formItems=(r.items&&r.items.length?r.items:[{sku:'',prod:'',varian:'',kat:'',qty:1,harga:0}]).map(it=>({...it}));
  renderFormItems();
  openModal('modal-tambah-jual');
}
function bukaModalTambahJual(){
  _editJualIdx=-1;
  document.getElementById('modal-jual-title').textContent='➕ Tambah Pesanan';
  document.getElementById('btn-simpan-jual').textContent='Simpan Pesanan';
  document.getElementById('edit-jual-idx').value='';
  document.getElementById('f-no').value='';document.getElementById('f-tgl').value=today();
  document.getElementById('f-status').value='Selesai';
  document.getElementById('f-biaya-admin').value='';document.getElementById('f-biaya-tambahan').value=Math.round(getSaranBiayaTambahan());
  populateKatDropdowns();
  populateProdukDatalist();
  _formItems=[{sku:'',prod:'',varian:'',kat:'',qty:1,harga:0}];
  renderFormItems();
  openModal('modal-tambah-jual');
}
// Tambah 1 baris barang kosong ke form pesanan yang sedang dibuka.
function tambahBarisBarang(){
  _formItems.push({sku:'',prod:'',varian:'',kat:'',qty:1,harga:0});
  renderFormItems();
}
function hapusBarisBarang(i){
  if(_formItems.length<=1){alert('Pesanan harus punya minimal 1 barang.');return}
  _formItems.splice(i,1);renderFormItems();
}
// Render ulang seluruh baris form barang + total & hint stok per baris.
function renderFormItems(){
  const wrap=document.getElementById('f-items-wrap');if(!wrap)return;
  wrap.innerHTML=_formItems.map((it,i)=>{
    const si=cariStok(it.prod,it.varian);
    const qty=it.qty||0;
    let hint='';
    if(it.prod){
      if(si){
        const sisa=si.stok-qty;const kurang=sisa<0;
        hint=`<div style="font-size:11px;padding:4px 8px;border-radius:6px;margin-top:4px;background:${kurang?'var(--danger-bg)':'var(--success-bg)'};color:${kurang?'var(--danger)':'var(--success)'}">${kurang?`⚠️ Stok kurang (tersisa ${si.stok} pcs)`:`✅ Stok cukup, sisa ${sisa} pcs`}</div>`;
      }else{
        hint=`<div style="font-size:11px;padding:4px 8px;border-radius:6px;margin-top:4px;background:var(--warning-bg);color:var(--warning)">⚠️ Tidak ditemukan di Stok Gudang — stok tidak otomatis berkurang</div>`;
      }
    }
    const subtotal=(it.qty||0)*(it.harga||0);
    return `<div style="border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px">
      <div style="display:grid;grid-template-columns:2fr 1.3fr;gap:8px">
        <div class="form-group" style="margin-bottom:6px"><label style="font-size:11px">Nama Produk</label>
          <input class="form-input" list="dl-produk-stok" value="${it.prod||''}" placeholder="Pilih/ketik produk" oninput="updateBarisBarang(${i},'prod',this.value)" autocomplete="off"></div>
        <div class="form-group" style="margin-bottom:6px"><label style="font-size:11px">Varian</label>
          <input class="form-input" list="dl-varian-stok-${i}" value="${it.varian||''}" placeholder="M / Hitam" oninput="updateBarisBarang(${i},'varian',this.value)" autocomplete="off">
          <datalist id="dl-varian-stok-${i}">${[...new Set(DB.stok.filter(s=>s.prod===it.prod).map(s=>s.varian).filter(Boolean))].map(v=>`<option value="${v}">`).join('')}</datalist></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end">
        <div class="form-group" style="margin-bottom:0"><label style="font-size:11px">Kategori</label>
          <select class="form-input" onchange="updateBarisBarang(${i},'kat',this.value)">${getKatNames().map(k=>`<option value="${k}" ${it.kat===k?'selected':''}>${k}</option>`).join('')}</select></div>
        <div class="form-group" style="margin-bottom:0"><label style="font-size:11px">Qty</label>
          <input class="form-input" type="number" min="1" value="${it.qty!=null?it.qty:1}" oninput="updateBarisBarang(${i},'qty',this.value)"></div>
        <div class="form-group" style="margin-bottom:0"><label style="font-size:11px">Harga Satuan (Rp)</label>
          <input class="form-input" type="number" min="0" value="${it.harga||0}" oninput="updateBarisBarang(${i},'harga',this.value)"></div>
        <button type="button" class="btn btn-sm btn-icon btn-danger" title="Hapus barang ini" onclick="hapusBarisBarang(${i})" style="margin-bottom:2px">🗑</button>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
        <span style="font-size:11px;color:var(--text3)">Subtotal: <strong style="color:var(--text1)">${fmtRp(subtotal)}</strong></span>
      </div>
      ${hint}
    </div>`;
  }).join('');
  const totalPesanan=_formItems.reduce((a,it)=>a+(it.qty||0)*(it.harga||0),0);
  const totalEl=document.getElementById('f-total-pesanan');
  if(totalEl)totalEl.textContent=fmtRp(totalPesanan);
}
function updateBarisBarang(i,field,val){
  if(!_formItems[i])return;
  if(field==='qty')_formItems[i].qty=parseInt(val)||1;
  else if(field==='harga')_formItems[i].harga=parseFloat(val)||0;
  else _formItems[i][field]=val;
  if(field==='prod'){
    // Auto-isi kategori dari Stok Gudang saat nama produk cocok
    const si=cariStok(val,_formItems[i].varian);
    if(si)_formItems[i].kat=si.kat;
  }
  renderFormItems();
}
// ===== SARAN BIAYA ADMIN & BIAYA TAMBAHAN (berdasarkan riwayat pesanan) =====
// Mengganti pengaturan global lama (Biaya Admin per Marketplace % & Biaya
// Tambahan per Transaksi di menu Laba & Biaya) -> sekarang sarannya dihitung
// dari rata-rata pesanan yang sudah pernah diinput per marketplace (atau
// dari nilai default bawaan jika belum ada data sama sekali).
function getSaranBiayaAdmin(mp,total){
  const data=DB.penjualan.filter(r=>r.mp===mp&&r.biayaAdmin!=null&&orderTotal(r)>0);
  if(data.length){
    const avgPct=data.reduce((a,r)=>a+(r.biayaAdmin/orderTotal(r)),0)/data.length;
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
  const mp=document.getElementById('f-mp').value;const total=_formItems.reduce((a,it)=>a+(it.qty||0)*(it.harga||0),0);
  document.getElementById('f-biaya-admin').value=Math.round(getSaranBiayaAdmin(mp,total));
}
function saranBiayaTambahanPesanan(){
  document.getElementById('f-biaya-tambahan').value=Math.round(getSaranBiayaTambahan());
}
function populateProdukDatalist(){
  const dl=document.getElementById('dl-produk-stok');if(!dl)return;
  const uniq=[...new Set(DB.stok.map(s=>s.prod))].sort();
  dl.innerHTML=uniq.map(p=>`<option value="${p}">`).join('');
}
// ===== SINKRONISASI STOK <-> PENJUALAN (otomatis & real-time) =====
// Pesanan berstatus 'Dibatalkan' dianggap tidak pernah mengurangi stok asli.
// Sejak pesanan bisa berisi banyak barang, efek stok diterapkan PER ITEM.
function isStatusAktif(status){return status!=='Dibatalkan'}
function cariStok(prod,varian){return DB.stok.find(s=>s.prod===prod&&s.varian===varian)}
// arah -1 = kurangi stok (pesanan baru/aktif), arah +1 = kembalikan stok (batal/hapus/edit)
function terapkanEfekStok(order,arah){
  if(!order||!isStatusAktif(order.status))return;
  (order.items||[]).forEach(it=>{
    const si=cariStok(it.prod,it.varian);
    if(!si)return;
    if(arah<0){
      si.stok=Math.max(0,(si.stok||0)-(it.qty||0));
      si.terjual=(si.terjual||0)+(it.qty||0);
    }else{
      si.stok=(si.stok||0)+(it.qty||0);
      si.terjual=Math.max(0,(si.terjual||0)-(it.qty||0));
    }
  });
}

function simpanPesanan(){
  if(!canWrite()){alert("Anda tidak punya izin untuk menambah/mengubah pesanan.");return}
  const idx=document.getElementById('edit-jual-idx').value;
  const no=document.getElementById('f-no').value.trim();const tgl=document.getElementById('f-tgl').value;
  const items=_formItems.filter(it=>it.prod&&it.prod.trim()).map(it=>({sku:it.sku||'',prod:it.prod.trim(),varian:(it.varian||'').trim(),kat:it.kat||'Lainnya',qty:parseInt(it.qty)||1,harga:parseFloat(it.harga)||0}));
  if(!no||!tgl){alert('Mohon isi No. Pesanan dan Tanggal');return}
  if(!items.length){alert('Mohon isi minimal 1 barang (Nama Produk) dalam pesanan ini');return}
  const idxSaatIni=idx!==''&&idx>=0?parseInt(idx):-1;
  const duplikat=DB.penjualan.findIndex((r,i)=>i!==idxSaatIni&&r.no.trim().toLowerCase()===no.toLowerCase());
  if(duplikat!==-1){alert('⚠️ No. Pesanan "'+no+'" sudah dipakai oleh pesanan lain.\n\nSetiap No. Pesanan harus unik. Ganti nomornya atau edit pesanan yang sudah ada.');return}
  const tidakDiStok=items.filter(it=>!cariStok(it.prod,it.varian));
  if(tidakDiStok.length){
    const lanjut=confirm('⚠️ '+tidakDiStok.length+' barang ('+tidakDiStok.map(it=>it.prod+(it.varian?' - '+it.varian:'')).join(', ')+') tidak ditemukan persis sama di Stok Gudang.\n\nStok TIDAK akan otomatis berkurang untuk barang tersebut.\n\nLanjutkan simpan? (Klik Batal untuk perbaiki nama produk/varian dulu)');
    if(!lanjut)return;
  }
  const r={no,tanggal:fmtTgl(new Date(tgl)),_date:new Date(tgl).toISOString(),mp:document.getElementById('f-mp').value,
    status:document.getElementById('f-status').value,
    biayaAdmin:parseFloat(document.getElementById('f-biaya-admin').value)||0,
    biayaTambahan:parseFloat(document.getElementById('f-biaya-tambahan').value)||0,
    items};
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
  if(!needSettings&&!canWrite()){alert("Anda tidak punya izin untuk menghapus data ini.");return}
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
    const jual=DB.penjualan.filter(r=>r.status!=='Dibatalkan'&&(r.items||[]).some(it=>it.kat===k.nama)).length;
    return `<div style="display:flex;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);gap:12px">
      <div style="width:16px;height:16px;border-radius:4px;background:${k.color};flex-shrink:0"></div>
      <div style="flex:1"><div style="font-weight:600;font-size:13px">${k.nama}</div><div style="font-size:11px;color:var(--text3)">${cnt} varian stok · ${jual} pesanan</div></div>
      <div class="action-cell">
        <button class="btn btn-sm btn-icon" onclick="bukaEditKat(${i})">✏️</button>
        <button class="btn btn-sm btn-icon btn-danger" onclick="konfirmHapus('kat',${i})">🗑</button>
      </div></div>`}).join(''):`<div style="color:var(--text3);text-align:center;padding:24px">Belum ada kategori</div>`;
}

function renderKatPerf(){
  const pm={};DB.kategori.forEach(k=>pm[k.nama]={rev:0,qty:0,color:k.color});
  DB.penjualan.filter(r=>r.status!=='Dibatalkan').forEach(r=>(r.items||[]).forEach(it=>{if(pm[it.kat]){pm[it.kat].rev+=(it.qty||0)*(it.harga||0);pm[it.kat].qty+=(it.qty||0)}}));
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
// Menghitung laba di level PESANAN (menjumlahkan seluruh barang di dalamnya).
// Biaya admin & biaya tambahan tetap di level pesanan (memang begitu cara
// marketplace memotongnya per transaksi/checkout, bukan per barang).
function hitungLaba(r){
  const biaya=DB.biaya||DEFAULT_BIAYA;const omzet=orderTotal(r);
  let mpFee;
  if(r.biayaAdmin!=null){mpFee=r.biayaAdmin}
  else{const feeMp=biaya.mp_fee[r.mp];mpFee=(feeMp!=null?feeMp:3)/100*omzet}
  let extra;
  if(r.biayaTambahan!=null){extra=r.biayaTambahan}
  else{extra=(biaya.extra.ongkir||0)+(biaya.extra.packaging||0)+(biaya.extra.lain||0)}
  const hppPct=biaya.hpp_pct!=null?biaya.hpp_pct:45;
  let hpp=0;
  (r.items||[]).forEach(it=>{
    const subtotal=(it.qty||0)*(it.harga||0);
    if(biaya.hpp_mode==='pct'){hpp+=hppPct/100*subtotal}
    else{const ph=getHppDariStok(it.prod,it.varian);hpp+=(ph!=null?ph:hppPct/100*(it.harga||0))*(it.qty||0)}
  });
  const laba=omzet-mpFee-extra-hpp;
  return{omzet,hpp,mpFee,extra,laba,margin:omzet>0?laba/omzet*100:0};
}

// Menghitung laba per BARANG (item) di dalam sebuah pesanan: biaya admin &
// biaya tambahan pesanan dialokasikan proporsional sesuai porsi subtotal
// barang tsb terhadap total pesanan.
function hitungLabaItem(r,it,h){
  h=h||hitungLaba(r);
  const biaya=DB.biaya||DEFAULT_BIAYA;
  const subtotal=(it.qty||0)*(it.harga||0);
  const share=h.omzet>0?subtotal/h.omzet:0;
  const mpFee=h.mpFee*share,extra=h.extra*share;
  const hppPct=biaya.hpp_pct!=null?biaya.hpp_pct:45;
  let hpp;
  if(biaya.hpp_mode==='pct'){hpp=hppPct/100*subtotal}
  else{const ph=getHppDariStok(it.prod,it.varian);hpp=(ph!=null?ph:hppPct/100*(it.harga||0))*(it.qty||0)}
  const laba=subtotal-mpFee-extra-hpp;
  return{omzet:subtotal,mpFee,extra,hpp,laba,margin:subtotal>0?laba/subtotal*100:0};
}

function getLabaPerProduk(filterMP,filterKat){
  const map={};
  DB.penjualan.filter(r=>r.status!=='Dibatalkan'&&(!filterMP||r.mp===filterMP)).forEach(r=>{
    const h=hitungLaba(r);
    (r.items||[]).forEach(it=>{
      if(filterKat&&it.kat!==filterKat)return;
      const key=it.prod+'|||'+r.mp;
      if(!map[key])map[key]={prod:it.prod,kat:it.kat||'–',mp:r.mp,qty:0,omzet:0,hpp:0,mpFee:0,extra:0,laba:0};
      const li=hitungLabaItem(r,it,h);
      map[key].qty+=it.qty||0;map[key].omzet+=li.omzet;map[key].hpp+=li.hpp;map[key].mpFee+=li.mpFee;map[key].extra+=li.extra;map[key].laba+=li.laba;
    });
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
  const all=DB.penjualan.filter(r=>r.status!=='Dibatalkan');
  let to=0,th=0,tf=0,te=0,tl=0;all.forEach(r=>{const h=hitungLaba(r);to+=h.omzet;th+=h.hpp;tf+=h.mpFee;te+=h.extra;tl+=h.laba});
  const margin=to>0?tl/to*100:0;
  document.getElementById('laba-metrics').innerHTML=`
    <div class="metric-card"><div class="metric-label">Total Omzet</div><div class="metric-value">${fmtRp(to)}</div><div class="metric-sub" style="color:var(--text3)">${all.length} transaksi</div></div>
    <div class="metric-card"><div class="metric-label">Total Biaya Admin MP</div><div class="metric-value orange">${fmtRp(tf)}</div><div class="metric-sub orange">${to>0?(tf/to*100).toFixed(1):0}% dari omzet</div></div>
    <div class="metric-card"><div class="metric-label">Total HPP</div><div class="metric-value red">${fmtRp(th)}</div><div class="metric-sub red">${to>0?(th/to*100).toFixed(1):0}% dari omzet</div></div>
    <div class="metric-card"><div class="metric-label">Laba Bersih</div><div class="metric-value ${tl>=0?'green':'red'}">${fmtRp(tl)}</div><div class="metric-sub ${tl>=0?'green':'red'}">${margin.toFixed(1)}% margin</div></div>`;

  const mpData={};MP_LIST.forEach(m=>mpData[m]={laba:0,biaya:0});
  DB.penjualan.filter(r=>r.status!=='Dibatalkan').forEach(r=>{const h=hitungLaba(r);if(!mpData[r.mp])mpData[r.mp]={laba:0,biaya:0};mpData[r.mp].laba+=h.laba;mpData[r.mp].biaya+=h.omzet-h.laba});
  if(charts.labaMP)charts.labaMP.destroy();
  charts.labaMP=new Chart(document.getElementById('chartLabaMP'),{type:'bar',data:{labels:MP_LIST,datasets:[
    {label:'Laba Bersih',data:MP_LIST.map(m=>Math.round(mpData[m].laba/1000)),backgroundColor:'rgba(26,127,71,.8)',borderRadius:4},
    {label:'Total Biaya',data:MP_LIST.map(m=>Math.round(mpData[m].biaya/1000)),backgroundColor:'rgba(185,28,28,.5)',borderRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:11},boxWidth:12}}},
      scales:{x:{ticks:{color:'#888',font:{size:11}},grid:{display:false}},y:{ticks:{color:'#888',font:{size:10},callback:v=>v+'rb'},grid:{color:'rgba(128,128,128,.1)'}}}}});

  if(charts.biayaPie)charts.biayaPie.destroy();
  charts.biayaPie=new Chart(document.getElementById('chartBiayaPie'),{type:'doughnut',data:{labels:['HPP','Admin MP','Ongkir','Packaging & Lain'],datasets:[{data:[Math.round(th),Math.round(tf),Math.round(te*.6),Math.round(te*.4)],backgroundColor:['#5b5ea6','#ee4d2d','#f59e0b','#6b7280'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'60%'}});
  const blabels=['HPP','Admin MP','Ongkir','Packaging'];const bcolors=['#5b5ea6','#ee4d2d','#f59e0b','#6b7280'];const bvals=[th,tf,te*.6,te*.4];
  document.getElementById('biaya-pie-legend').innerHTML=blabels.map((l,i)=>`<span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:${bcolors[i]}"></span>${l}: ${to>0?(bvals[i]/to*100).toFixed(1):0}%</span>`).join('');

  const byProd={};DB.penjualan.filter(r=>r.status!=='Dibatalkan').forEach(r=>{const h=hitungLaba(r);(r.items||[]).forEach(it=>{if(!byProd[it.prod])byProd[it.prod]={prod:it.prod,laba:0,omzet:0};const li=hitungLabaItem(r,it,h);byProd[it.prod].laba+=li.laba;byProd[it.prod].omzet+=li.omzet})});
  const pa=Object.values(byProd).map(p=>({...p,margin:p.omzet>0?p.laba/p.omzet*100:0}));
  const tt=[...pa].sort((a,b)=>b.laba-a.laba).slice(0,5);const tr=[...pa].sort((a,b)=>a.margin-b.margin).slice(0,5);
  document.getElementById('top-laba-tinggi').innerHTML=tt.map(p=>`<div class="prog-row"><div class="prog-label">${p.prod}</div><div class="prog-track"><div class="prog-fill" style="width:${Math.max(0,Math.min(100,p.margin))}%;background:var(--success)"></div></div><div class="prog-val green">+${(p.laba/1e6).toFixed(1)}jt</div></div>`).join('');
  document.getElementById('top-laba-rendah').innerHTML=tr.map(p=>`<div class="prog-row"><div class="prog-label">${p.prod}</div><div class="prog-track"><div class="prog-fill" style="width:${Math.max(0,Math.min(100,Math.abs(p.margin)))}%;background:var(--danger)"></div></div><div class="prog-val" style="color:var(--${p.margin<0?'danger':'warning'})">${p.margin.toFixed(1)}%</div></div>`).join('');

  // Biaya admin per marketplace tabel
  const b=DB.biaya||DEFAULT_BIAYA;
  const mpDetail={};MP_LIST.forEach(m=>{mpDetail[m]={omzet:0,fee:0,laba:0,trx:0}});
  DB.penjualan.filter(r=>r.status!=='Dibatalkan').forEach(r=>{const h=hitungLaba(r);if(mpDetail[r.mp]){mpDetail[r.mp].omzet+=h.omzet;mpDetail[r.mp].fee+=h.mpFee;mpDetail[r.mp].laba+=h.laba;mpDetail[r.mp].trx++}});
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
  DB.penjualan.filter(r=>r.status!=='Dibatalkan').forEach(r=>{const h=hitungLaba(r);(r.items||[]).forEach(it=>{const kat=it.kat||'Lainnya';if(!byKat[kat])byKat[kat]={nama:kat,color:'#888',omzet:0,laba:0,fee:0,trx:0};const li=hitungLabaItem(r,it,h);byKat[kat].omzet+=li.omzet;byKat[kat].laba+=li.laba;byKat[kat].fee+=li.mpFee;byKat[kat].trx++})});
  const katArr=Object.values(byKat).filter(k=>k.trx>0).sort((a,b)=>b.laba-a.laba);const maxKatLaba=Math.max(...katArr.map(k=>k.laba),1);
  const katEl=document.getElementById('laba-per-kat');
  if(katEl)katEl.innerHTML=katArr.map(k=>`<div class="prog-row">
    <div style="width:10px;height:10px;border-radius:3px;background:${k.color};flex-shrink:0"></div>
    <div class="prog-label" style="width:100px">${k.nama}</div>
    <div class="prog-track"><div class="prog-fill" style="width:${Math.round(k.laba/maxKatLaba*100)}%;background:${k.color}"></div></div>
    <div class="prog-val" style="width:90px;color:var(--success);font-weight:600">${fmtRp(k.laba/1000)}rb</div>
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
    const data=aktif.filter(r=>r.mp===m&&r.biayaAdmin!=null&&orderTotal(r)>0);
    if(!data.length)return `<div class="hpp-item"><label>${m}</label><div style="font-size:13px;color:var(--text3)">Belum ada data</div></div>`;
    const totalOmzet=data.reduce((a,r)=>a+orderTotal(r),0);const totalFee=data.reduce((a,r)=>a+r.biayaAdmin,0);
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
  const all=DB.penjualan.filter(r=>r.status!=='Dibatalkan');
  let to=0,tl=0,tf=0;all.forEach(r=>{const h=hitungLaba(r);to+=h.omzet;tl+=h.laba;tf+=h.mpFee});
  document.getElementById('keuangan-rows').innerHTML=[
    {l:'Total Omzet (30 hari)',v:fmtRp(to),c:''},
    {l:'Biaya Admin Marketplace',v:'− '+fmtRp(tf),c:'red'},
    {l:'Ongkos Kirim (subsidi)',v:'− Rp 3.240.000',c:'red'},
    {l:'HPP Estimasi',v:'− '+fmtRp(to*((DB.biaya&&DB.biaya.hpp_pct!=null)?DB.biaya.hpp_pct:45)/100),c:'red'},
    {l:'Estimasi Laba Bersih',v:fmtRp(tl),c:'green'},
    {l:'Margin Bersih',v:(to>0?tl/to*100:0).toFixed(1)+'%',c:'green'},
  ].map(r=>`<div class="sumrow"><span class="label">${r.l}</span><span class="${r.c}">${r.v}</span></div>`).join('');

  if(charts.mpBar)charts.mpBar.destroy();
  const mpRev={};MP_LIST.forEach(m=>mpRev[m]=0);DB.penjualan.filter(r=>r.status!=='Dibatalkan').forEach(r=>mpRev[r.mp]+=orderTotal(r));
  charts.mpBar=new Chart(document.getElementById('chartMpBar'),{type:'bar',data:{labels:MP_LIST,datasets:[{label:'Revenue',data:MP_LIST.map(m=>Math.round(mpRev[m]/1e6*10)/10),backgroundColor:MP_LIST.map(m=>getMpColor(m)),borderWidth:0,borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#888',font:{size:11}},grid:{display:false}},y:{ticks:{color:'#888',font:{size:10},callback:v=>'Rp'+v+'jt'},grid:{color:'rgba(128,128,128,.1)'}}}}});

  if(charts.bulanan)charts.bulanan.destroy();
  charts.bulanan=new Chart(document.getElementById('chartBulanan'),{type:'bar',data:{labels:['Jan','Feb','Mar','Apr','Mei','Jun'],datasets:[
    {label:'Shopee',data:[38,42,39,45,48,52].map(v=>v*1e6),backgroundColor:'#ee4d2d',borderRadius:3},
    {label:'Tokopedia',data:[28,31,29,33,35,38].map(v=>v*1e6),backgroundColor:'#00aa5b',borderRadius:3},
    {label:'TikTok Shop',data:[12,15,18,19,22,25].map(v=>v*1e6),backgroundColor:'#888',borderRadius:3},
    {label:'Lazada',data:[9,10,9,10,10,11].map(v=>v*1e6),backgroundColor:'#1a0dab',borderRadius:3}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:11},boxWidth:12}}},scales:{x:{stacked:true,ticks:{color:'#888',font:{size:11}},grid:{display:false}},y:{stacked:true,ticks:{color:'#888',font:{size:10},callback:v=>'Rp'+(v/1e6).toFixed(0)+'jt'},grid:{color:'rgba(128,128,128,.1)'}}}}});
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
function handleDrop(e,type){e.preventDefault();const f=e.dataTransfer.files[0];if(f)processCSV(f,type)}
function importFile(e,type){if(e.target.files[0])processCSV(e.target.files[0],type)}
function processCSV(file,type){
  const reader=new FileReader();
  reader.onload=function(e){
    const lines=e.target.result.split('\n').filter(l=>l.trim());
    const headers=lines[0].split(',').map(h=>h.trim().toLowerCase().replace(/\s+/g,'_'));
    let imported=0,errors=0;
    for(let i=1;i<lines.length;i++){
      const cols=lines[i].split(',');const row={};headers.forEach((h,j)=>row[h]=(cols[j]||'').trim());
      try{
        if(type==='jual'){const d=row.tanggal||fmtTgl(new Date());const mpNama=row.marketplace||'Shopee';if(!DB.marketplace.some(m=>m.nama.toLowerCase()===mpNama.toLowerCase())){DB.marketplace.push({nama:mpNama,color:MP_COLOR_CHOICES[DB.marketplace.length%MP_COLOR_CHOICES.length]});refreshMpGlobals()}
          const noImp=row.no_pesanan||row.no||'IMP-'+i;
          // Harga satuan: dukung kolom baru "harga_satuan", atau kolom lama "total"
          // (jika masih format lama 1-baris-1-pesanan, dianggap harga satuan = total/qty)
          const qtyImp=parseInt(row.qty||1)||1;
          let hargaImp;
          if(row.harga_satuan!==undefined&&row.harga_satuan!==''){hargaImp=parseFloat(row.harga_satuan.replace(/[^0-9.]/g,''))||0}
          else{const totalLama=parseInt((row.total||'0').replace(/[^0-9]/g,''))||0;hargaImp=qtyImp>0?Math.round(totalLama/qtyImp):0}
          const itemBaru={sku:'',prod:row.produk||'–',varian:row.varian||'',kat:row.kategori||'Lainnya',qty:qtyImp,harga:hargaImp};
          // Baris dengan No. Pesanan yang SAMA (baik dari data lama maupun baris
          // CSV sebelumnya) berarti barang tambahan untuk pesanan yang sama —
          // ditambahkan ke `items`, bukan dianggap pesanan baru.
          const idxAda=DB.penjualan.findIndex(r=>r.no.trim().toLowerCase()===noImp.trim().toLowerCase());
          if(idxAda!==-1){DB.penjualan[idxAda].items.push(itemBaru)}
          else{
            const orderBaru={no:noImp,tanggal:d,_date:new Date(d.split('/').reverse().join('-')||d).toISOString(),mp:mpNama,status:row.status||'Selesai',biayaAdmin:row.biaya_admin!==undefined&&row.biaya_admin!==''?parseFloat(row.biaya_admin.replace(/[^0-9.]/g,'')):null,biayaTambahan:row.biaya_tambahan!==undefined&&row.biaya_tambahan!==''?parseFloat(row.biaya_tambahan.replace(/[^0-9.]/g,'')):null,items:[itemBaru]};
            DB.penjualan.push(orderBaru);
          }
          imported++}
        else{DB.stok.push({sku:row.sku||'SKU-IMP-'+i,prod:row.produk||'–',varian:row.varian||'',kat:row.kategori||'Lainnya',stok:parseInt(row.stok||0),terjual:parseInt(row.terjual_30h||row.terjual||0),hpp:parseFloat((row.hpp||'0').replace(/[^0-9.]/g,''))||0});imported++}
      }catch(err){errors++}
    }
    saveDB(['penjualan','stok','marketplace']);filteredJual=[...DB.penjualan];filteredStok=[...DB.stok];populateMpDropdowns();renderJualTable();renderStokTable();renderDashboard();
    const res=document.getElementById(type==='jual'?'import-result':'import-stok-result');
    res.innerHTML=`<div class="alert alert-success">✅ Berhasil import <strong>${imported} baris</strong>${errors?` (${errors} baris gagal)`:''}</div>`;
  };
  reader.readAsText(file);
}

// ===== EXPORT =====
// Format: 1 baris = 1 BARANG. Barang-barang dengan No. Pesanan yang sama
// artinya satu pesanan berisi banyak barang (kolom Biaya Admin/Tambahan/Status
// milik pesanan diulang di tiap barisnya, memudahkan re-import).
function exportCSV(){
  const h='No. Pesanan,Tanggal,Marketplace,Produk,Varian,Kategori,Qty,Harga Satuan,Status,Biaya Admin,Biaya Tambahan\n';
  const rows=[];
  DB.penjualan.forEach(r=>(r.items||[]).forEach(it=>{
    rows.push([r.no,r.tanggal,r.mp,it.prod,it.varian||'',it.kat||'',it.qty,it.harga,r.status,r.biayaAdmin!=null?Math.round(r.biayaAdmin):'',r.biayaTambahan!=null?Math.round(r.biayaTambahan):''].join(','));
  }));
  dlFile(h+rows.join('\n'),'penjualan_'+today()+'.csv','text/csv');
}
function exportStokCSV(){const h='SKU,Produk,Varian,Kategori,Stok,HPP,Terjual 30h\n';dlFile(h+DB.stok.map(r=>[r.sku,r.prod,r.varian,r.kat||'',r.stok,r.hpp||0,r.terjual].join(',')).join('\n'),'stok_'+today()+'.csv','text/csv')}
function exportLabaCSV(){const data=_labaFiltered.length?_labaFiltered:getLabaPerProduk();const h='Produk,Kategori,Marketplace,Qty,Omzet,HPP,Biaya Admin MP (%),Biaya Lain,Laba Bersih,Margin (%)\n';dlFile(h+data.map(r=>[r.prod,r.kat,r.mp,r.qty,r.omzet,Math.round(r.hpp),Math.round(r.mpFee),Math.round(r.extra),Math.round(r.laba),r.margin.toFixed(1)].join(',')).join('\n'),'laba_per_produk_'+today()+'.csv','text/csv')}
function exportLabaCSV2(){exportLabaCSV()}
function dlFile(content,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+content],{type}));a.download=name;a.click()}

// ===== MODAL =====
function openModal(id){document.getElementById(id).classList.add('open')}
function closeModal(id){document.getElementById(id).classList.remove('open')}
window.onclick=function(e){if(e.target.classList.contains('modal-overlay'))e.target.classList.remove('open')}

// ===== BACKUP / RESTORE =====
function backupData(){dlFile(JSON.stringify(DB,null,2),'omniseller_backup_'+today()+'.json','application/json')}
function restoreData(e){const reader=new FileReader();reader.onload=function(ev){try{DB=JSON.parse(ev.target.result);if(!DB.marketplace||!DB.marketplace.length)DB.marketplace=JSON.parse(JSON.stringify(DEFAULT_MP));refreshMpGlobals();saveDB();filteredJual=[...DB.penjualan];filteredStok=[...DB.stok];applyPengaturan();populateKatDropdowns();populateMpDropdowns();renderDashboard();renderJualTable();renderStokTable();alert('Data dipulihkan! '+DB.penjualan.length+' pesanan, '+DB.stok.length+' varian.')}catch(err){alert('File backup tidak valid.')}};reader.readAsText(e.target.files[0])}
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
