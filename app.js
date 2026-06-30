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
function saveDB(){
  DB.lastUpdate=new Date().toISOString();
  localStorage.setItem('omniseller_v2',JSON.stringify(DB));
  syncToSupabase();
}
function loadDB(){const r=localStorage.getItem('omniseller_v2');if(r){DB=JSON.parse(r);return true}return false}

// ===== SUPABASE SYNC (skema relasional - 7 tabel) =====
let _syncTimeout=null;
function syncToSupabase(){
  clearTimeout(_syncTimeout);
  _syncTimeout=setTimeout(async()=>{
    try{
      await Promise.all([
        syncKategori(), syncMarketplace(), syncStok(), syncPenjualan(),
        syncBiayaPengaturan(), syncHppProduk(), syncPengaturanToko()
      ]);
      updateSyncBadge(true);
    }catch(e){console.warn('Supabase sync error:',e);updateSyncBadge(false,e.message)}
  },700);
}

// Strategi: full-replace per tabel (hapus semua baris lalu insert ulang).
// Sederhana & aman untuk skala UMKM (ratusan-ribuan baris), tidak perlu diff manual.
async function fullReplace(table,rows){
  if(!rows.length){ // tetap hapus semua kalau memang kosong
    const{error}=await supabaseClient.from(table).delete().gte('id',0);
    if(error)throw error; return;
  }
  const{error:delErr}=await supabaseClient.from(table).delete().gte('id',0);
  if(delErr)throw delErr;
  const{error:insErr}=await supabaseClient.from(table).insert(rows);
  if(insErr)throw insErr;
}
async function syncKategori(){
  await fullReplace(TBL_KATEGORI, DB.kategori.map(k=>({nama:k.nama,color:k.color})));
}
async function syncMarketplace(){
  await fullReplace(TBL_MARKETPLACE, DB.marketplace.map(m=>({nama:m.nama,color:m.color,fee_persen:(DB.biaya.mp_fee&&DB.biaya.mp_fee[m.nama])||3})));
}
async function syncStok(){
  await fullReplace(TBL_STOK, DB.stok.map(s=>({sku:s.sku,produk:s.prod,varian:s.varian||'',kategori:s.kat||'Lainnya',stok:s.stok||0,terjual:s.terjual||0,hpp:(DB.biaya.hpp_per_produk&&DB.biaya.hpp_per_produk[s.prod])||0})));
}
async function syncPenjualan(){
  await fullReplace(TBL_PENJUALAN, DB.penjualan.map(r=>({no_pesanan:r.no,tanggal:r.tanggal,tgl_iso:r._date||new Date().toISOString(),marketplace:r.mp,produk:r.prod,varian:r.varian||'',kategori:r.kat||'Lainnya',qty:r.qty||1,total:r.total||0,status:r.status||'Selesai'})));
}
async function syncBiayaPengaturan(){
  const b=DB.biaya||{};const ex=b.extra||{};
  const{error}=await supabaseClient.from(TBL_BIAYA).upsert({id:1,ongkir:ex.ongkir||0,packaging:ex.packaging||0,lain:ex.lain||0,hpp_mode:b.hpp_mode||'pct',hpp_pct:b.hpp_pct||45,updated_at:new Date().toISOString()});
  if(error)throw error;
}
async function syncHppProduk(){
  const hpp=DB.biaya&&DB.biaya.hpp_per_produk||{};
  const rows=Object.keys(hpp).map(p=>({produk:p,hpp:hpp[p]}));
  const{error:delErr}=await supabaseClient.from(TBL_HPP_PRODUK).delete().neq('produk','__never__');
  if(delErr)throw delErr;
  if(rows.length){const{error:insErr}=await supabaseClient.from(TBL_HPP_PRODUK).insert(rows);if(insErr)throw insErr}
}
async function syncPengaturanToko(){
  const p=DB.pengaturan||{};
  const{error}=await supabaseClient.from(TBL_PENGATURAN).upsert({id:1,nama_toko:p.nama||'Toko Saya',pemilik:p.pemilik||'',hp:p.hp||'',batas_stok:p.batasStok||10,logo:p.logo||'',updated_at:new Date().toISOString()});
  if(error)throw error;
}

// Ambil semua data dari 7 tabel relasional & susun ulang jadi struktur DB di memori
async function loadFromSupabase(){
  try{
    const[katRes,mpRes,stokRes,jualRes,biayaRes,hppRes,setRes]=await Promise.all([
      supabaseClient.from(TBL_KATEGORI).select('*').order('id'),
      supabaseClient.from(TBL_MARKETPLACE).select('*').order('id'),
      supabaseClient.from(TBL_STOK).select('*').order('id'),
      supabaseClient.from(TBL_PENJUALAN).select('*').order('id'),
      supabaseClient.from(TBL_BIAYA).select('*').eq('id',1).maybeSingle(),
      supabaseClient.from(TBL_HPP_PRODUK).select('*'),
      supabaseClient.from(TBL_PENGATURAN).select('*').eq('id',1).maybeSingle(),
    ]);
    const errs=[katRes,mpRes,stokRes,jualRes,biayaRes,hppRes,setRes].map(r=>r.error).filter(Boolean);
    if(errs.length){console.warn('Gagal memuat dari Supabase:',errs[0].message);updateSyncBadge(false,errs[0].message);return null}

    const kategori=(katRes.data||[]).map(k=>({nama:k.nama,color:k.color}));
    const marketplace=(mpRes.data||[]).map(m=>({nama:m.nama,color:m.color}));
    const stok=(stokRes.data||[]).map(s=>({sku:s.sku,prod:s.produk,varian:s.varian,kat:s.kategori,stok:s.stok,terjual:s.terjual}));
    const penjualan=(jualRes.data||[]).map(r=>({no:r.no_pesanan,tanggal:r.tanggal,_date:r.tgl_iso,mp:r.marketplace,prod:r.produk,varian:r.varian,kat:r.kategori,qty:r.qty,total:Number(r.total),status:r.status}));

    const mp_fee={};(mpRes.data||[]).forEach(m=>mp_fee[m.nama]=Number(m.fee_persen));
    const hpp_per_produk={};(hppRes.data||[]).forEach(h=>hpp_per_produk[h.produk]=Number(h.hpp));
    const b=biayaRes.data||{};
    const biaya={mp_fee,extra:{ongkir:Number(b.ongkir||3000),packaging:Number(b.packaging||1500),lain:Number(b.lain||500)},hpp_mode:b.hpp_mode||'pct',hpp_pct:Number(b.hpp_pct||45),hpp_per_produk};

    const s=setRes.data||{};
    const pengaturan={nama:s.nama_toko||'Toko Saya',pemilik:s.pemilik||'',hp:s.hp||'',batasStok:s.batas_stok||10,logo:s.logo||''};

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
    const mp=MP_LIST[rnd(0,3)];const prod=PRODUK[rnd(0,9)];const varian=VARIAN[rnd(0,14)];const qty=rnd(1,5);const harga=rnd(35000,450000);
    const d=new Date(2025,rnd(0,5),rnd(1,28));
    DB.penjualan.push({no:mp.substring(0,3).toUpperCase()+'-'+(1000+i),tanggal:fmtTgl(d),_date:d.toISOString(),mp,prod,varian,kat:katMap[prod]||'Lainnya',qty,total:qty*harga,status:STATUS_ARR[rnd(0,6)]});
  }
  DB.stok=[];
  for(let i=0;i<120;i++){
    const prod=PRODUK[i%10];const varian=VARIAN[i%15];const stok=rnd(0,100);const terjual=rnd(3,60);const kat=katMap[prod]||'Lainnya';
    DB.stok.push({sku:'SKU-'+String(i+1).padStart(4,'0'),prod,varian,kat,stok,terjual});
  }
  saveDB();
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
  if(hasData&&DB.penjualan.length===0&&DB.stok.length===0)seedData(); // database baru & masih kosong -> isi data contoh
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

// ===== ADMIN AUTH (Supabase Auth) =====
function showLoginScreen(){
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('app-wrap').style.display='none';
}
function showAppScreen(){
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app-wrap').style.display='';
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
    document.getElementById('login-screen-subtitle').textContent='Daftar Administrator Baru';
  }else{
    document.getElementById('form-signup').style.display='none';
    document.getElementById('form-login').style.display='';
    document.getElementById('login-screen-subtitle').textContent='Login Administrator';
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
      // Auto-confirm aktif di project Supabase -> langsung login
      _currentAdminUser=data.user;
      showAppScreen();
      await initApp();
      updateAdminInfo();
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
    _currentAdminUser=data.user;
    showAppScreen();
    await initApp();
    updateAdminInfo();
  }catch(e){loginAlert('Login gagal: '+e.message)}
  btn.disabled=false;btn.textContent='Masuk';
}
async function adminLogout(){
  if(!confirm('Keluar dari dashboard?'))return;
  try{await supabaseClient.auth.signOut()}catch(e){}
  _currentAdminUser=null;
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

// Gerbang utama: cek sesi login saat halaman dibuka
window.onload=async function(){
  showLoginScreen();
  if(typeof supabaseClient==='undefined'||!supabaseClient){
    loginAlert('Gagal memuat koneksi Supabase. Periksa koneksi internet Anda lalu refresh halaman (Ctrl+Shift+R). Jika masih gagal, kemungkinan CDN Supabase diblokir oleh jaringan/firewall Anda.');
    return;
  }
  try{
    const{data}=await supabaseClient.auth.getSession();
    if(data&&data.session){
      _currentAdminUser=data.session.user;
      showAppScreen();
      await initApp();
      updateAdminInfo();
    }
  }catch(e){console.warn('Gagal cek sesi login:',e)}
};
// Jika sesi berubah (login/logout dari tab lain, token refresh, dst)
if(typeof supabaseClient!=='undefined'&&supabaseClient){
  supabaseClient.auth.onAuthStateChange((event,session)=>{
    if(event==='SIGNED_OUT'){_currentAdminUser=null;showLoginScreen()}
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
  if(id==='pengaturan')updateInfoPengaturan();
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
  const p=parseInt(document.getElementById('periodeSelect').value);
  const cutoff=new Date();cutoff.setDate(cutoff.getDate()-p);
  const recent=DB.penjualan.filter(r=>r.status!=='Dibatalkan'&&new Date(r._date||r.tanggal.split('/').reverse().join('-'))>=cutoff);
  const totalRev=recent.reduce((a,r)=>a+r.total,0);
  const totalOrd=recent.length;
  const batas=DB.pengaturan.batasStok||10;
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
  recent.forEach(r=>{mpRev[r.mp]=(mpRev[r.mp]||0)+r.total;mpOrd[r.mp]=(mpOrd[r.mp]||0)+1});
  const maxRev=Math.max(...Object.values(mpRev))||1;
  document.getElementById('mp-list-dash').innerHTML=MP_LIST.map(m=>`
    <div class="mp-row"><div class="mp-color-dot" style="background:${MP_COLORS[m]}"></div>
    <div class="mp-name-col">${m}</div>
    <div class="mp-bar-col"><div class="mp-bar-track"><div class="mp-bar-fill" style="width:${Math.round(mpRev[m]/maxRev*100)}%;background:${MP_COLORS[m]}"></div></div></div>
    <div class="mp-rev-col"><div class="mp-rev">${fmtRp(mpRev[m])}</div><div class="mp-orders-txt">${mpOrd[m]} pesanan</div></div></div>`).join('');

  // Top 5
  const pm={};recent.forEach(r=>{pm[r.prod]=(pm[r.prod]||0)+r.qty});
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
    d1.push(dr.filter(r=>r.mp==='Shopee').reduce((a,r)=>a+r.total,0));
    d2.push(dr.filter(r=>r.mp==='Tokopedia').reduce((a,r)=>a+r.total,0));
    d3.push(dr.filter(r=>r.mp==='TikTok Shop').reduce((a,r)=>a+r.total,0));
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
  const batas=DB.pengaturan.batasStok||10;
  const habis=DB.stok.filter(s=>s.stok===0).length,rendah=DB.stok.filter(s=>s.stok>0&&s.stok<=batas).length,aman=DB.stok.length-habis-rendah;
  if(charts.stokPie)charts.stokPie.destroy();
  charts.stokPie=new Chart(document.getElementById('chartStokPie'),{type:'doughnut',data:{labels:['Aman','Rendah','Habis'],datasets:[{data:[aman,rendah,habis],backgroundColor:['#00aa5b','#f59e0b','#ef4444'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'65%'}});
  document.getElementById('pie-legend').innerHTML=[{l:'Aman',c:'#00aa5b',v:aman},{l:'Rendah',c:'#f59e0b',v:rendah},{l:'Habis',c:'#ef4444',v:habis}].map(x=>`<span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:${x.c}"></span>${x.l}: ${x.v}</span>`).join('');
}

// ===== PENJUALAN TABLE =====
function filterJual(){
  pageJual=1;const q=(document.getElementById('q-jual').value||'').toLowerCase();const mp=document.getElementById('f-mp-jual').value;const st=document.getElementById('f-status-jual').value;
  filteredJual=DB.penjualan.filter(r=>(!q||r.prod.toLowerCase().includes(q)||r.no.toLowerCase().includes(q))&&(!mp||r.mp===mp)&&(!st||r.status===st));
  renderJualTable();
}

const ST_BADGE={'Selesai':'badge-green','Dibatalkan':'badge-red','Diproses':'badge-yellow','Dikirim':'badge-blue'};
function renderJualTable(){
  const start=(pageJual-1)*PER_PAGE,slice=filteredJual.slice(start,start+PER_PAGE);
  document.getElementById('tbl-jual').innerHTML=slice.length?slice.map((r,i)=>{
    const ri=DB.penjualan.indexOf(r);
    return `<tr>
      <td class="mono">${r.no}</td>
      <td style="color:var(--text2)">${r.tanggal}</td>
      <td><span class="mp-tag" style="${mpTagStyle(r.mp)}">${r.mp}</span></td>
      <td style="font-weight:600">${r.prod}</td>
      <td style="color:var(--text2)">${r.varian||'–'}</td>
      <td><span class="badge badge-gray" style="background:${getKatColor(r.kat)}22;color:${getKatColor(r.kat)}">${r.kat||'–'}</span></td>
      <td style="text-align:center;font-weight:600">${r.qty}</td>
      <td style="font-weight:600">${fmtRp(r.total)}</td>
      <td><span class="badge ${ST_BADGE[r.status]||'badge-gray'}">${r.status}</span></td>
      <td><div class="action-cell">
        <button class="btn btn-sm btn-icon" title="Edit" onclick="bukaEditJual(${ri})">✏️</button>
        <button class="btn btn-sm btn-icon btn-danger" title="Hapus" onclick="konfirmHapus('jual',${ri})">🗑</button>
      </div></td>
    </tr>`}).join(''):`<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text3)">Tidak ada data pesanan</td></tr>`;
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
  document.getElementById('f-prod').value=r.prod;
  document.getElementById('f-var').value=r.varian||'';
  document.getElementById('f-qty').value=r.qty;
  document.getElementById('f-total').value=r.total;
  populateKatDropdowns();
  document.getElementById('f-kat-jual').value=r.kat||'';
  openModal('modal-tambah-jual');
}
function bukaModalTambahJual(){
  _editJualIdx=-1;
  document.getElementById('modal-jual-title').textContent='➕ Tambah Pesanan';
  document.getElementById('btn-simpan-jual').textContent='Simpan Pesanan';
  document.getElementById('edit-jual-idx').value='';
  document.getElementById('f-no').value='';document.getElementById('f-prod').value='';
  document.getElementById('f-var').value='';document.getElementById('f-qty').value=1;
  document.getElementById('f-total').value='';document.getElementById('f-tgl').value=today();
  populateKatDropdowns();
  openModal('modal-tambah-jual');
}
function autocompleteKat(){
  const prod=document.getElementById('f-prod').value.trim();
  const match=DB.penjualan.find(r=>r.prod===prod);
  if(match&&match.kat){const el=document.getElementById('f-kat-jual');if(el)el.value=match.kat;}
}
function simpanPesanan(){
  const idx=document.getElementById('edit-jual-idx').value;
  const no=document.getElementById('f-no').value.trim();const prod=document.getElementById('f-prod').value.trim();const tgl=document.getElementById('f-tgl').value;
  if(!no||!prod||!tgl){alert('Mohon isi No. Pesanan, Tanggal, dan Nama Produk');return}
  const r={no,tanggal:fmtTgl(new Date(tgl)),_date:new Date(tgl).toISOString(),mp:document.getElementById('f-mp').value,
    prod,varian:document.getElementById('f-var').value,kat:document.getElementById('f-kat-jual').value,
    qty:parseInt(document.getElementById('f-qty').value)||1,total:parseInt(document.getElementById('f-total').value)||0,
    status:document.getElementById('f-status').value};
  if(idx!==''&&idx>=0){DB.penjualan[parseInt(idx)]=r}else{
    DB.penjualan.unshift(r);
    const si=DB.stok.find(s=>s.prod===prod&&s.varian===r.varian);
    if(si&&si.stok>=r.qty){si.stok-=r.qty;si.terjual+=r.qty}
  }
  saveDB();filteredJual=[...DB.penjualan];renderJualTable();renderDashboard();closeModal('modal-tambah-jual');
}

// ===== STOK TABLE =====
function filterStok(){
  pageStok=1;const q=(document.getElementById('q-stok').value||'').toLowerCase();const st=document.getElementById('f-status-stok').value;const kat=document.getElementById('f-kat-stok').value;const batas=DB.pengaturan.batasStok||10;
  filteredStok=DB.stok.filter(r=>{const status=r.stok===0?'Habis':r.stok<=batas?'Rendah':'Aman';return(!q||r.prod.toLowerCase().includes(q)||r.sku.toLowerCase().includes(q))&&(!st||status===st)&&(!kat||r.kat===kat)});
  renderStokTable();
}
function filterStokKritis(){document.getElementById('f-status-stok').value='';document.getElementById('q-stok').value='';document.getElementById('f-kat-stok').value='';const batas=DB.pengaturan.batasStok||10;filteredStok=DB.stok.filter(s=>s.stok<=batas);pageStok=1;renderStokTable()}
function renderStokTable(){
  const batas=DB.pengaturan.batasStok||10;const start=(pageStok-1)*PER_PAGE;const slice=filteredStok.slice(start,start+PER_PAGE);
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
      <td style="color:var(--text2)">${r.terjual} pcs</td>
      <td style="color:var(--text3)">${hariHabis}</td>
      <td><span class="badge ${badge}">${status}</span></td>
      <td><div class="action-cell">
        <button class="btn btn-sm btn-icon" title="Edit" onclick="bukaEditStok(${ri})">✏️</button>
        <button class="btn btn-sm btn-icon btn-success" title="Restock" onclick="bukaRestock(${ri})">+ Stok</button>
        <button class="btn btn-sm btn-icon btn-danger" title="Hapus" onclick="konfirmHapus('stok',${ri})">🗑</button>
      </div></td>
    </tr>`}).join(''):`<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text3)">Tidak ada data stok</td></tr>`;
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
  document.getElementById('s-stok').value=0;document.getElementById('s-terjual').value=0;
  populateKatDropdowns();
  openModal('modal-tambah-stok');
}
function simpanStok(){
  const idx=document.getElementById('edit-stok-idx').value;
  const r={sku:document.getElementById('s-sku').value.trim(),prod:document.getElementById('s-prod').value.trim(),
    varian:document.getElementById('s-var').value.trim(),kat:document.getElementById('s-kat').value,
    stok:parseInt(document.getElementById('s-stok').value)||0,terjual:parseInt(document.getElementById('s-terjual').value)||0};
  if(!r.prod){alert('Nama produk wajib diisi');return}
  if(idx!==''&&idx>=0)DB.stok[parseInt(idx)]=r;else DB.stok.unshift(r);
  saveDB();filteredStok=[...DB.stok];renderStokTable();renderDashboard();closeModal('modal-tambah-stok');
}
function bukaRestock(idx){
  _restockIdx=idx;const r=DB.stok[idx];
  document.getElementById('rs-sku').value=r.sku;document.getElementById('rs-produk').value=r.prod+' · '+r.varian;
  document.getElementById('rs-stok-lama').value=r.stok+' pcs';document.getElementById('rs-tambah').value=50;document.getElementById('rs-note').value='';
  document.getElementById('restock-title').textContent='🔄 Restock: '+r.prod;
  openModal('modal-restock');
}
function simpanRestock(){
  if(_restockIdx<0)return;const tambah=parseInt(document.getElementById('rs-tambah').value)||0;
  DB.stok[_restockIdx].stok+=tambah;saveDB();filteredStok=[...DB.stok];renderStokTable();renderDashboard();closeModal('modal-restock');_restockIdx=-1;
}

// ===== HAPUS =====
function konfirmHapus(type,idx){
  const msg=type==='jual'?`Hapus pesanan "${DB.penjualan[idx].no}"?`:type==='stok'?`Hapus produk "${DB.stok[idx].prod} ${DB.stok[idx].varian}"?`:type==='mp'?`Hapus marketplace "${DB.marketplace[idx].nama}"? Pesanan lama dengan marketplace ini tidak akan terhapus.`:`Hapus kategori "${DB.kategori[idx].nama}"?`;
  document.getElementById('konfirm-msg').textContent=msg;
  document.getElementById('btn-konfirm-ya').onclick=function(){hapusData(type,idx);closeModal('modal-konfirm')};
  openModal('modal-konfirm');
}
function hapusData(type,idx){
  if(type==='jual'){DB.penjualan.splice(idx,1);filteredJual=[...DB.penjualan];renderJualTable()}
  else if(type==='stok'){DB.stok.splice(idx,1);filteredStok=[...DB.stok];renderStokTable()}
  else if(type==='kat'){DB.kategori.splice(idx,1);renderKatList();populateKatDropdowns()}
  else if(type==='mp'){
    if(DB.marketplace.length<=1){alert('Minimal harus ada 1 marketplace.');return}
    DB.marketplace.splice(idx,1);refreshMpGlobals();populateMpDropdowns();renderMpList();
  }
  saveDB();renderDashboard();
}

// ===== KATEGORI =====
function renderProduk(){
  const batas=DB.pengaturan.batasStok||10;
  document.getElementById('p-total-produk').textContent=[...new Set(DB.stok.map(s=>s.prod))].length;
  document.getElementById('p-total-varian').textContent=DB.stok.length.toLocaleString('id-ID');
  document.getElementById('p-total-kat').textContent=DB.kategori.length;
  document.getElementById('p-kritis').textContent=DB.stok.filter(s=>s.stok<=batas).length;
  renderKatList();renderKatPerf();renderMpList();renderMpDistChart();renderKatStokChart();
}

function renderKatList(){
  document.getElementById('kat-list').innerHTML=DB.kategori.length?DB.kategori.map((k,i)=>{
    const cnt=DB.stok.filter(s=>s.kat===k.nama).length;
    const jual=DB.penjualan.filter(r=>r.kat===k.nama&&r.status!=='Dibatalkan').length;
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
  DB.penjualan.filter(r=>r.status!=='Dibatalkan').forEach(r=>{if(pm[r.kat]){pm[r.kat].rev+=r.total;pm[r.kat].qty+=r.qty}});
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
  const nama=document.getElementById('kat-nama').value.trim();if(!nama){alert('Nama kategori wajib diisi');return}
  const idx=document.getElementById('edit-kat-idx').value;
  if(idx!==''&&idx>=0)DB.kategori[parseInt(idx)]={nama,color:_selectedKatColor};else DB.kategori.push({nama,color:_selectedKatColor});
  saveDB();populateKatDropdowns();renderKatList();renderKatPerf();closeModal('modal-tambah-kat');
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
  refreshMpGlobals();saveDB();populateMpDropdowns();renderMpList();renderDashboard();closeModal('modal-tambah-mp');
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

// ===== LABA PER PRODUK =====
function hitungLaba(r){
  const biaya=DB.biaya||DEFAULT_BIAYA;const omzet=r.total||0;
  const mpFee=(biaya.mp_fee[r.mp]||3)/100*omzet;
  const extra=(biaya.extra.ongkir||0)+(biaya.extra.packaging||0)+(biaya.extra.lain||0);
  let hpp=0;
  if(biaya.hpp_mode==='pct')hpp=(biaya.hpp_pct||45)/100*omzet;
  else{const ph=biaya.hpp_per_produk[r.prod];hpp=ph?ph*(r.qty||1):(biaya.hpp_pct||45)/100*omzet}
  const laba=omzet-mpFee-extra-hpp;
  return{omzet,hpp,mpFee,extra,laba,margin:omzet>0?laba/omzet*100:0};
}

function getLabaPerProduk(filterMP,filterKat){
  const map={};
  DB.penjualan.filter(r=>r.status!=='Dibatalkan'&&(!filterMP||r.mp===filterMP)&&(!filterKat||r.kat===filterKat)).forEach(r=>{
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

  const byProd={};DB.penjualan.filter(r=>r.status!=='Dibatalkan').forEach(r=>{if(!byProd[r.prod])byProd[r.prod]={prod:r.prod,laba:0,omzet:0};const h=hitungLaba(r);byProd[r.prod].laba+=h.laba;byProd[r.prod].omzet+=h.omzet});
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
      <td style="padding:9px 12px;border-bottom:1px solid var(--border);color:var(--warning);font-weight:700">${b.mp_fee[m]||3}%</td>
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
  DB.penjualan.filter(r=>r.status!=='Dibatalkan').forEach(r=>{const kat=r.kat||'Lainnya';if(!byKat[kat])byKat[kat]={nama:kat,color:'#888',omzet:0,laba:0,fee:0,trx:0};const h=hitungLaba(r);byKat[kat].omzet+=h.omzet;byKat[kat].laba+=h.laba;byKat[kat].fee+=h.mpFee;byKat[kat].trx++});
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

// ===== BIAYA INPUTS =====
function renderBiayaInputs(){
  const b=DB.biaya||DEFAULT_BIAYA;
  document.getElementById('mp-fee-inputs').innerHTML=MP_LIST.map(m=>`<div class="hpp-item"><label>${m} — biaya admin (%)</label><input type="number" step="0.1" id="mpfee-${m.replace(/\s/g,'_')}" value="${b.mp_fee[m]||3}"></div>`).join('');
  document.getElementById('extra-fee-inputs').innerHTML=`
    <div class="hpp-item"><label>Subsidi Ongkir (Rp/transaksi)</label><input type="number" id="fee-ongkir" value="${b.extra.ongkir||3000}"></div>
    <div class="hpp-item"><label>Biaya Packaging (Rp/transaksi)</label><input type="number" id="fee-packaging" value="${b.extra.packaging||1500}"></div>
    <div class="hpp-item"><label>Biaya Lain-lain (Rp/transaksi)</label><input type="number" id="fee-lain" value="${b.extra.lain||500}"></div>`;
}
function renderHppMode(){
  const b=DB.biaya||DEFAULT_BIAYA;const mode=document.getElementById('hpp-mode').value||b.hpp_mode||'pct';
  if(mode==='pct'){
    document.getElementById('hpp-mode-content').innerHTML=`<div class="form-group"><label>HPP Global (% dari harga jual)</label><input class="form-input" type="number" step="1" id="hpp-pct-val" value="${b.hpp_pct||45}" max="100" min="1"><div style="font-size:11px;color:var(--text3);margin-top:4px">Contoh: nilai 45 berarti HPP = 45% dari harga jual</div></div>`;
  } else {
    const prodNames=[...new Set(DB.penjualan.map(r=>r.prod))].slice(0,24);
    document.getElementById('hpp-mode-content').innerHTML=`<div class="hpp-grid">${prodNames.map(p=>`<div class="hpp-item"><label>${p}</label><input type="number" id="hpp-${p.replace(/[\s/]/g,'_')}" placeholder="Rp/unit" value="${b.hpp_per_produk[p]||''}"></div>`).join('')}</div>`;
  }
}
function simpanBiaya(){
  if(!DB.biaya)DB.biaya=JSON.parse(JSON.stringify(DEFAULT_BIAYA));
  const b=DB.biaya;
  MP_LIST.forEach(m=>{const el=document.getElementById('mpfee-'+m.replace(/\s/g,'_'));if(el)b.mp_fee[m]=parseFloat(el.value)||3});
  b.extra.ongkir=parseInt(document.getElementById('fee-ongkir').value)||0;
  b.extra.packaging=parseInt(document.getElementById('fee-packaging').value)||0;
  b.extra.lain=parseInt(document.getElementById('fee-lain').value)||0;
  b.hpp_mode=document.getElementById('hpp-mode').value||'pct';
  if(b.hpp_mode==='pct'){b.hpp_pct=parseFloat(document.getElementById('hpp-pct-val').value)||45}
  else{const pn=[...new Set(DB.penjualan.map(r=>r.prod))].slice(0,24);pn.forEach(p=>{const el=document.getElementById('hpp-'+p.replace(/[\s/]/g,'_'));if(el&&el.value)b.hpp_per_produk[p]=parseFloat(el.value)})}
  saveDB();alert('✅ Pengaturan biaya disimpan! Laporan laba diperbarui.');renderLabaRingkasan();
}
function resetBiaya(){if(confirm('Reset biaya ke default?')){DB.biaya=JSON.parse(JSON.stringify(DEFAULT_BIAYA));saveDB();renderBiayaInputs();renderHppMode();alert('Biaya direset.')}}

// ===== LAPORAN =====
function renderLaporan(){
  const all=DB.penjualan.filter(r=>r.status!=='Dibatalkan');
  let to=0,tl=0,tf=0;all.forEach(r=>{const h=hitungLaba(r);to+=h.omzet;tl+=h.laba;tf+=h.mpFee});
  document.getElementById('keuangan-rows').innerHTML=[
    {l:'Total Omzet (30 hari)',v:fmtRp(to),c:''},
    {l:'Biaya Admin Marketplace',v:'− '+fmtRp(tf),c:'red'},
    {l:'Ongkos Kirim (subsidi)',v:'− Rp 3.240.000',c:'red'},
    {l:'HPP Estimasi',v:'− '+fmtRp(to*(DB.biaya?.hpp_pct||45)/100),c:'red'},
    {l:'Estimasi Laba Bersih',v:fmtRp(tl),c:'green'},
    {l:'Margin Bersih',v:(to>0?tl/to*100:0).toFixed(1)+'%',c:'green'},
  ].map(r=>`<div class="sumrow"><span class="label">${r.l}</span><span class="${r.c}">${r.v}</span></div>`).join('');

  if(charts.mpBar)charts.mpBar.destroy();
  const mpRev={};MP_LIST.forEach(m=>mpRev[m]=0);DB.penjualan.filter(r=>r.status!=='Dibatalkan').forEach(r=>mpRev[r.mp]+=r.total);
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
        if(type==='jual'){const d=row.tanggal||fmtTgl(new Date());const mpNama=row.marketplace||'Shopee';if(!DB.marketplace.some(m=>m.nama.toLowerCase()===mpNama.toLowerCase())){DB.marketplace.push({nama:mpNama,color:MP_COLOR_CHOICES[DB.marketplace.length%MP_COLOR_CHOICES.length]});refreshMpGlobals()}DB.penjualan.push({no:row.no_pesanan||row.no||'IMP-'+i,tanggal:d,_date:new Date(d.split('/').reverse().join('-')||d).toISOString(),mp:mpNama,prod:row.produk||'–',varian:row.varian||'',kat:row.kategori||'Lainnya',qty:parseInt(row.qty||1),total:parseInt((row.total||'0').replace(/[^0-9]/g,'')),status:row.status||'Selesai'});imported++}
        else{DB.stok.push({sku:row.sku||'SKU-IMP-'+i,prod:row.produk||'–',varian:row.varian||'',kat:row.kategori||'Lainnya',stok:parseInt(row.stok||0),terjual:parseInt(row.terjual_30h||row.terjual||0)});imported++}
      }catch(err){errors++}
    }
    saveDB();filteredJual=[...DB.penjualan];filteredStok=[...DB.stok];populateMpDropdowns();renderJualTable();renderStokTable();renderDashboard();
    const res=document.getElementById(type==='jual'?'import-result':'import-stok-result');
    res.innerHTML=`<div class="alert alert-success">✅ Berhasil import <strong>${imported} baris</strong>${errors?` (${errors} baris gagal)`:''}</div>`;
  };
  reader.readAsText(file);
}

// ===== EXPORT =====
function exportCSV(){const h='No. Pesanan,Tanggal,Marketplace,Produk,Varian,Kategori,Qty,Total,Status\n';dlFile(h+DB.penjualan.map(r=>[r.no,r.tanggal,r.mp,r.prod,r.varian||'',r.kat||'',r.qty,r.total,r.status].join(',')).join('\n'),'penjualan_'+today()+'.csv','text/csv')}
function exportStokCSV(){const h='SKU,Produk,Varian,Kategori,Stok,Terjual 30h\n';dlFile(h+DB.stok.map(r=>[r.sku,r.prod,r.varian,r.kat||'',r.stok,r.terjual].join(',')).join('\n'),'stok_'+today()+'.csv','text/csv')}
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
function resetData(){if(confirm('Hapus SEMUA data? Tidak bisa dibatalkan.')){localStorage.removeItem('omniseller_v2');seedData();loadDB();refreshMpGlobals();filteredJual=[...DB.penjualan];filteredStok=[...DB.stok];populateKatDropdowns();populateMpDropdowns();applyPengaturan();renderDashboard();renderJualTable();renderStokTable();alert('Data direset ke contoh.')}}

// ===== PENGATURAN =====
function simpanPengaturan(){
  DB.pengaturan.nama=document.getElementById('set-nama').value;DB.pengaturan.pemilik=document.getElementById('set-pemilik').value;
  DB.pengaturan.hp=document.getElementById('set-hp').value;DB.pengaturan.batasStok=parseInt(document.getElementById('set-batas-stok').value)||10;
  saveDB();applyPengaturan();renderDashboard();alert('Pengaturan tersimpan!');
}
function applyPengaturan(){
  document.getElementById('set-nama').value=DB.pengaturan.nama||'';document.getElementById('set-pemilik').value=DB.pengaturan.pemilik||'';
  document.getElementById('set-hp').value=DB.pengaturan.hp||'';document.getElementById('set-batas-stok').value=DB.pengaturan.batasStok||10;
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
    saveDB();applyLogo();
  };
  reader.readAsDataURL(file);
}
function hapusLogo(){
  if(!DB.pengaturan.logo){return}
  if(!confirm('Hapus logo aplikasi?'))return;
  DB.pengaturan.logo='';saveDB();applyLogo();
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
    else{loginLogoImg.style.display='none';loginFallback.style.display='flex'}
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
