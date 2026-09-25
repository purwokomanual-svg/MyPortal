/* =========================================================
   CRM APP — Vanilla JS + Supabase (Postgres relasional + Realtime)
   ========================================================= */
const STAGES = ['New','Qualified','Proposal','Won','Lost'];
const STAGE_COLOR = { New:'#38bdf8', Qualified:'#818cf8', Proposal:'#c084fc', Won:'#10b981', Lost:'#f87171' };
const QUOTE_STATUS_COLOR = { Draft:'#64748b', Sent:'#38bdf8', Accepted:'#10b981', Declined:'#f87171' };

let state = {
  contacts: [], deals: [], tasks: [], activities: [], companies: [], notes: [],
  products: [], quotes: [], team: [],
  settings: {
    monthlyTarget: 300000000, autoTaskProposal: true, autoLossReason: true, autoQuoteLog: true,
    company: {
      name: 'PT SINERGI SEMPURNA SOLUSINDO',
      headOfficeLabel: 'Head Office',
      headOfficeAddress: 'Jln. Angkasa Blok B.10 Kav 4\nKota Baru Bandar Kemayoran, Jakarta Pusat 10610',
      branchOfficeLabel: 'Branch Office',
      branchOfficeAddress: 'Jln. Raya Ngagel no 214 1, Wonokromo\nSurabaya, Jawa Timur 60246',
      contactPhone: '+6221 2605 5968 / +6231 9902 2709',
      contactEmail: 'info@smartsystemsecurity.com',
      contactWebsite: 'www.smartsystemsecurity.co.id',
      footerAddress: 'Jl. Raya Ngagel No 213, Wonokromo, Surabaya',
      footerPhone: 'Phone : (+62) 31 9902 2709, Fax :(+62) 31 9902 2709',
      footerWebsite: 'www.cameracctvsurabaya.com',
      bankInfo: 'Pembayaran ke BCA atas nama PT SINERGI SEMPURNA SOLUSINDO No. 003.3112.219',
      signerName: 'Purwoko',
      signerPhone: '031 - 9902 2709',
      signerMobile: '0857 9100 1105',
    }
  },
  profile: { name:'Alex Pratama', role:'Sales Manager', avatar:'https://randomuser.me/api/portraits/men/32.jpg' }
};
let charts = {};
let tagFilter = null;
let calState = (()=>{ const n=new Date(); return { year:n.getFullYear(), month:n.getMonth() }; })();

/* ---------- Supabase client & auth state ---------- */
const sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;

/* ---------- Relational data layer (Postgres tables, one per entity) ----------
   Setiap "part" di atas (contacts, deals, dst) punya tabelnya sendiri di
   Postgres (lihat supabase/schema.sql) — bukan lagi satu blob JSON.
   `state[part]` tetap array biasa berisi objek camelCase seperti sebelumnya
   (supaya seluruh kode render/CRUD di file ini TIDAK perlu diubah), tapi
   setiap kali `persist(part)` dipanggil, fungsi ini membandingkan isi
   `state[part]` sekarang dengan snapshot terakhir yang berhasil disinkronkan
   (`lastSynced[part]`), lalu mengirim HANYA baris yang berubah sebagai
   insert / update / delete ke tabel yang sesuai. Ini membuat penyimpanan
   data rapi secara relasional di database, tanpa perlu menulis ulang setiap
   fungsi save/delete yang sudah ada. */
const LIST_PARTS = ['companies','contacts','deals','tasks','notes','activities','products','quotes','team'];
let lastSynced = {}; // part -> deep copy of the last array successfully written to DB

const ROW_MAPPERS = {
  companies: {
    toRow: c => ({ id:c.id, name:c.name, industry:c.industry||'', website:c.website||'', size:c.size||'', address:c.address||'', created_at:c.createdAt||new Date().toISOString() }),
    fromRow: r => ({ id:r.id, name:r.name, industry:r.industry||'', website:r.website||'', size:r.size||'', address:r.address||'', createdAt:r.created_at }),
  },
  contacts: {
    toRow: c => ({ id:c.id, name:c.name, company_id:c.companyId||null, email:c.email||'', phone:c.phone||'', status:c.status||'lead', tags:c.tags||[], owner_id:c.ownerId||null, created_at:c.createdAt||new Date().toISOString() }),
    fromRow: r => ({ id:r.id, name:r.name, companyId:r.company_id, email:r.email||'', phone:r.phone||'', status:r.status||'lead', tags:r.tags||[], ownerId:r.owner_id, createdAt:r.created_at }),
  },
  deals: {
    toRow: d => ({ id:d.id, title:d.title, contact_id:d.contactId||null, value:Number(d.value)||0, stage:d.stage||'New', probability:Number(d.probability)||0, owner_id:d.ownerId||null, loss_reason:d.lossReason||null, items:d.items||[], created_at:d.createdAt||new Date().toISOString() }),
    fromRow: r => ({ id:r.id, title:r.title, contactId:r.contact_id, value:Number(r.value)||0, stage:r.stage, probability:r.probability, ownerId:r.owner_id, lossReason:r.loss_reason, items:r.items||[], createdAt:r.created_at }),
  },
  tasks: {
    toRow: t => ({ id:t.id, title:t.title, due:t.due||null, priority:t.priority||'medium', done:!!t.done, contact_id:t.contactId||null }),
    fromRow: r => ({ id:r.id, title:r.title, due:r.due, priority:r.priority||'medium', done:!!r.done, contactId:r.contact_id }),
  },
  notes: {
    toRow: n => ({ id:n.id, entity_type:n.entityType, entity_id:n.entityId, text:n.text, at:n.at||new Date().toISOString() }),
    fromRow: r => ({ id:r.id, entityType:r.entity_type, entityId:r.entity_id, text:r.text, at:r.at }),
  },
  activities: {
    toRow: a => ({ id:a.id, text:a.text, deal_id:a.dealId||null, contact_id:a.contactId||null, at:a.at||new Date().toISOString() }),
    fromRow: r => ({ id:r.id, text:r.text, dealId:r.deal_id, contactId:r.contact_id, at:r.at }),
  },
  products: {
    toRow: p => ({ id:p.id, name:p.name, model:p.model||'', sku:p.sku||'', category:p.category||'', unit:p.unit||'Unit', price:Number(p.price)||0, description:p.description||'' }),
    fromRow: r => ({ id:r.id, name:r.name, model:r.model||'', sku:r.sku||'', category:r.category||'', unit:r.unit||'Unit', price:Number(r.price)||0, description:r.description||'' }),
  },
  quotes: {
    toRow: q => ({ id:q.id, number:q.number, date:q.date||null, subject:q.subject||'', project_name:q.projectName||'', your_ref:q.yourRef||'', pages:q.pages||'1 Lembar', deal_id:q.dealId||null, contact_id:q.contactId||null, to_name:q.toName||'', to_address:q.toAddress||'', attn_name:q.attnName||'', attn_phone:q.attnPhone||'', attn_fax:q.attnFax||'', attn_email:q.attnEmail||'', sections:q.sections||[], notes_list:q.notesList||[], terms:q.terms||[], status:q.status||'Draft', created_at:q.createdAt||new Date().toISOString() }),
    fromRow: r => ({ id:r.id, number:r.number, date:r.date, subject:r.subject||'', projectName:r.project_name||'', yourRef:r.your_ref||'', pages:r.pages||'1 Lembar', dealId:r.deal_id, contactId:r.contact_id, toName:r.to_name||'', toAddress:r.to_address||'', attnName:r.attn_name||'', attnPhone:r.attn_phone||'', attnFax:r.attn_fax||'', attnEmail:r.attn_email||'', sections:r.sections||[], notesList:r.notes_list||[], terms:r.terms||[], status:r.status||'Draft', createdAt:r.created_at }),
  },
  team: {
    toRow: m => ({ id:m.id, name:m.name, role:m.role||'', email:m.email||'', avatar:m.avatar||'', created_at:m.createdAt||new Date().toISOString() }),
    fromRow: r => ({ id:r.id, name:r.name, role:r.role||'', email:r.email||'', avatar:r.avatar||'', createdAt:r.created_at }),
  },
};
const clone = (v) => JSON.parse(JSON.stringify(v));

async function dbListAll(part){
  const { data, error } = await sbClient.from(part).select('*').eq('user_id', currentUser.id).order('created_at', { ascending:false });
  if (error){ console.error('load failed', part, error); return []; }
  return (data||[]).map(ROW_MAPPERS[part].fromRow);
}

/* Sinkronisasi diff: bandingkan state[part] vs lastSynced[part], kirim
   hanya insert/update/delete yang benar-benar berubah. Dipakai oleh SEMUA
   fungsi save/delete yang sudah ada lewat pemanggilan persist(part) —
   tidak ada perubahan yang diperlukan di fungsi-fungsi tersebut. */
async function persist(part){
  if (part === 'settings' || part === 'profile'){ await persistUserSettings(); return; }
  const mapper = ROW_MAPPERS[part];
  if (!mapper || !currentUser) return;
  const prevList = lastSynced[part] || [];
  const currList = state[part] || [];
  const prevMap = new Map(prevList.map(x=>[x.id, x]));
  const currMap = new Map(currList.map(x=>[x.id, x]));
  const ops = [];

  for (const item of currList){
    const prev = prevMap.get(item.id);
    if (!prev){
      ops.push(sbClient.from(part).insert({ ...mapper.toRow(item), user_id: currentUser.id }));
    } else if (JSON.stringify(prev) !== JSON.stringify(item)){
      ops.push(sbClient.from(part).update(mapper.toRow(item)).eq('id', item.id).eq('user_id', currentUser.id));
    }
  }
  for (const prev of prevList){
    if (!currMap.has(prev.id)){
      ops.push(sbClient.from(part).delete().eq('id', prev.id).eq('user_id', currentUser.id));
    }
  }
  if (ops.length){
    const results = await Promise.all(ops);
    results.forEach(r=>{ if (r && r.error) console.error('sync error on', part, r.error); });
  }
  lastSynced[part] = clone(currList);
}
async function persistUserSettings(){
  if (!currentUser) return;
  try {
    const payload = {
      user_id: currentUser.id,
      monthly_target: Number(state.settings.monthlyTarget)||0,
      auto_task_proposal: !!state.settings.autoTaskProposal,
      auto_loss_reason: !!state.settings.autoLossReason,
      auto_quote_log: !!state.settings.autoQuoteLog,
      company: state.settings.company || {},
      profile: state.profile || {},
    };
    const { error } = await sbClient.from('user_settings').upsert(payload, { onConflict:'user_id' });
    if (error) throw error;
  } catch(e){ console.error('settings/profile persist failed', e); }
}
async function loadUserSettings(){
  const { data, error } = await sbClient.from('user_settings').select('*').eq('user_id', currentUser.id).maybeSingle();
  if (error){ console.error('load user_settings failed', error); return null; }
  if (!data) return null;
  state.settings = Object.assign({}, state.settings, {
    monthlyTarget: Number(data.monthly_target)||0,
    autoTaskProposal: !!data.auto_task_proposal,
    autoLossReason: !!data.auto_loss_reason,
    autoQuoteLog: !!data.auto_quote_log,
    company: (data.company && Object.keys(data.company).length) ? data.company : state.settings.company,
  });
  if (data.profile && Object.keys(data.profile).length) state.profile = data.profile;
  return data;
}

/* ---------- Realtime: sinkron otomatis lintas tab/device untuk user yang sama ---------- */
let realtimeChannels = [];
let realtimeStatus = { total: 0, subscribed: 0, error: false };
function updateRealtimeBadge(){
  const el = document.getElementById('realtime-status');
  if (!el) return;
  if (realtimeStatus.error){
    el.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-red-400 inline-block"></span> Terputus — klik untuk sambung ulang';
    el.className = 'flex items-center gap-1.5 text-[10px] text-red-400 font-medium cursor-pointer';
  } else if (realtimeStatus.total > 0 && realtimeStatus.subscribed >= realtimeStatus.total){
    el.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span> Realtime aktif';
    el.className = 'flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium';
  } else {
    el.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block animate-pulse"></span> Menghubungkan...';
    el.className = 'flex items-center gap-1.5 text-[10px] text-amber-400 font-medium';
  }
}
function teardownRealtime(){
  realtimeChannels.forEach(ch=>{ try{ sbClient.removeChannel(ch); }catch(e){} });
  realtimeChannels = [];
  realtimeStatus = { total: 0, subscribed: 0, error: false };
  updateRealtimeBadge();
}
function applyRemoteRowChange(part, eventType, newRow, oldRow){
  const mapper = ROW_MAPPERS[part];
  const arr = state[part];
  if (eventType === 'DELETE'){
    const id = oldRow && oldRow.id;
    const idx = arr.findIndex(x=>x.id===id);
    if (idx>-1) arr.splice(idx,1);
  } else {
    const obj = mapper.fromRow(newRow);
    const idx = arr.findIndex(x=>x.id===obj.id);
    if (idx>-1) arr[idx] = obj; else arr.unshift(obj);
  }
  lastSynced[part] = clone(arr); // mencegah persist() berikutnya mengira ini perubahan lokal yang perlu di-diff ulang
}
function trackChannelStatus(status){
  if (status === 'SUBSCRIBED'){ realtimeStatus.subscribed++; realtimeStatus.error = false; }
  else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'){ realtimeStatus.error = true; }
  updateRealtimeBadge();
}
function setupRealtime(){
  teardownRealtime();
  realtimeStatus.total = LIST_PARTS.length + 1; // + user_settings
  updateRealtimeBadge();
  LIST_PARTS.forEach(part=>{
    const ch = sbClient
      .channel(`rt:${part}:${currentUser.id}`)
      .on('postgres_changes', { event:'*', schema:'public', table:part, filter:`user_id=eq.${currentUser.id}` }, (payload)=>{
        applyRemoteRowChange(part, payload.eventType, payload.new, payload.old);
        renderAll();
      })
      .subscribe(trackChannelStatus);
    realtimeChannels.push(ch);
  });
  const settingsCh = sbClient
    .channel(`rt:user_settings:${currentUser.id}`)
    .on('postgres_changes', { event:'*', schema:'public', table:'user_settings', filter:`user_id=eq.${currentUser.id}` }, (payload)=>{
      if (payload.new){
        state.settings = Object.assign({}, state.settings, {
          monthlyTarget: Number(payload.new.monthly_target)||0,
          autoTaskProposal: !!payload.new.auto_task_proposal,
          autoLossReason: !!payload.new.auto_loss_reason,
          autoQuoteLog: !!payload.new.auto_quote_log,
          company: payload.new.company || state.settings.company,
        });
        if (payload.new.profile && Object.keys(payload.new.profile).length) state.profile = payload.new.profile;
        renderAll();
      }
    })
    .subscribe(trackChannelStatus);
  realtimeChannels.push(settingsCh);
}

function uid(){
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // fallback RFC4122 v4 generator untuk browser lama yang belum punya crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
    const r = Math.random()*16|0, v = c==='x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
function money(n){ return 'Rp ' + Number(n||0).toLocaleString('id-ID'); }
function timeAgo(iso){
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff/60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return m + ' menit lalu';
  const h = Math.floor(m/60);
  if (h < 24) return h + ' jam lalu';
  return Math.floor(h/24) + ' hari lalu';
}
function esc(s){ return (s||'').toString().replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function daysAgoISO(n){ const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString(); }
function daysFromNowISO(n){ const d = new Date(); d.setDate(d.getDate()+n); return d.toISOString(); }

function logActivity(text, refs){
  state.activities.unshift({ id: uid(), text, at: new Date().toISOString(), ...(refs||{}) });
  state.activities = state.activities.slice(0, 60);
  persist('activities');
}
function toast(msg, tone='ok'){
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  const colors = { ok:'border-emerald-500/40 text-emerald-300', err:'border-red-500/40 text-red-300', info:'border-purple-500/40 text-purple-300' };
  el.className = `toast pointer-events-auto glass-card rounded-xl px-4 py-2.5 text-xs font-medium border ${colors[tone]||colors.ok}`;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(()=> el.remove(), 3000);
}

/* ---------- helpers: relations ---------- */
function getCompany(id){ return state.companies.find(c=>c.id===id); }
function getContact(id){ return state.contacts.find(c=>c.id===id); }
function contactCompanyName(contact){ if(!contact) return '—'; const co = getCompany(contact.companyId); return co ? co.name : '—'; }
function dealsForContact(contactId){ return state.deals.filter(d=>d.contactId===contactId); }
function dealsForCompany(companyId){ const ids = state.contacts.filter(c=>c.companyId===companyId).map(c=>c.id); return state.deals.filter(d=>ids.includes(d.contactId)); }
function tasksForContact(contactId){ return state.tasks.filter(t=>t.contactId===contactId); }
function notesFor(entityType, entityId){ return state.notes.filter(n=>n.entityType===entityType && n.entityId===entityId).sort((a,b)=>new Date(b.at)-new Date(a.at)); }
function activitiesFor(field, id){ return state.activities.filter(a=>a[field]===id); }
function leadScore(contact){
  const deals = dealsForContact(contact.id);
  const dealScore = Math.min(50, deals.length*10);
  const valueScore = Math.min(30, Math.round(deals.reduce((s,d)=>s+d.value,0)/10000000));
  const noteScore = Math.min(20, notesFor('contact', contact.id).length*4);
  return Math.min(100, dealScore+valueScore+noteScore);
}
function scoreColor(score){ return score>=70 ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : score>=40 ? 'text-purple-400 border-purple-500/30 bg-purple-500/10' : 'text-slate-400 border-slate-500/30 bg-slate-500/10'; }

/* ---------- helpers: team / owners ---------- */
function teamOptionsHTML(selectedId, includeAll){
  const owners = [{id:'me', name: state.profile.name}, ...state.team];
  let html = includeAll ? `<option value="">Semua Owner</option>` : `<option value="">— Tanpa owner —</option>`;
  html += owners.map(o=>`<option value="${o.id}" ${selectedId===o.id?'selected':''}>${esc(o.name)}</option>`).join('');
  return html;
}
function ownerName(id){
  if (!id) return '—';
  if (id==='me') return state.profile.name;
  const m = state.team.find(t=>t.id===id);
  return m ? m.name : '—';
}
function populateOwnerFilters(){
  const c = document.getElementById('contacts-owner-filter');
  const d = document.getElementById('deals-owner-filter');
  if (c) c.innerHTML = teamOptionsHTML(c.value||'', true);
  if (d) d.innerHTML = teamOptionsHTML(d.value||'', true);
}

/* ---------- seed demo data ---------- */
function seedDemoData(){
  const co1=uid(), co2=uid(), co3=uid(), co4=uid();
  state.companies = [
    { id:co1, name:'PT Maju Jaya', industry:'Manufaktur', website:'majujaya.co.id', size:'250+', address:'Surabaya, ID', createdAt: daysAgoISO(60) },
    { id:co2, name:'CV Sentral Bening', industry:'Retail', website:'sentralbening.id', size:'50-100', address:'Jakarta, ID', createdAt: daysAgoISO(30) },
    { id:co3, name:'PT Uee Banging', industry:'Teknologi', website:'ueebanging.com', size:'100-250', address:'Bandung, ID', createdAt: daysAgoISO(20) },
    { id:co4, name:'PT Cocoon Nusantara', industry:'F&B', website:'cocoon.co.id', size:'10-50', address:'Surabaya, ID', createdAt: daysAgoISO(90) },
  ];
  const t1=uid(), t2=uid();
  state.team = [
    { id:t1, name:'Rangga Pramudita', role:'Account Executive', email:'rangga@company.id', avatar:'https://randomuser.me/api/portraits/men/45.jpg', createdAt: daysAgoISO(80) },
    { id:t2, name:'Maria Angelina', role:'Sales Development Rep', email:'maria@company.id', avatar:'https://randomuser.me/api/portraits/women/44.jpg', createdAt: daysAgoISO(50) },
  ];
  const c1=uid(), c2=uid(), c3=uid(), c4=uid();
  state.contacts = [
    { id:c1, name:'Budi Santoso', companyId:co1, email:'budi@majujaya.co.id', phone:'0812-3456-7890', status:'customer', tags:['VIP','Enterprise'], ownerId:'me', createdAt: daysAgoISO(40) },
    { id:c2, name:'Siti Rahma', companyId:co2, email:'siti@sentralbening.id', phone:'0813-1122-3344', status:'lead', tags:['Inbound'], ownerId:t1, createdAt: daysAgoISO(12) },
    { id:c3, name:'Andi Wijaya', companyId:co3, email:'andi@ueebanging.com', phone:'0857-9988-7766', status:'lead', tags:['Referral'], ownerId:t2, createdAt: daysAgoISO(5) },
    { id:c4, name:'Dewi Lestari', companyId:co4, email:'dewi@cocoon.co.id', phone:'0821-4455-6677', status:'customer', tags:['VIP'], ownerId:'me', createdAt: daysAgoISO(70) },
  ];
  state.deals = [
    { id:uid(), title:'Implementasi CRM Enterprise', contactId:c1, value:227000000, stage:'Won', probability:100, ownerId:'me', lossReason:null, createdAt: daysAgoISO(35) },
    { id:uid(), title:'Paket Integrasi AI', contactId:c2, value:150000000, stage:'Proposal', probability:87, ownerId:t1, lossReason:null, createdAt: daysAgoISO(8) },
    { id:uid(), title:'Lisensi Tahunan', contactId:c3, value:97000000, stage:'Qualified', probability:60, ownerId:t2, lossReason:null, createdAt: daysAgoISO(3) },
    { id:uid(), title:'Kontrak Perpanjangan', contactId:c4, value:57900000, stage:'New', probability:30, ownerId:'me', lossReason:null, createdAt: daysAgoISO(1) },
  ];
  state.tasks = [
    { id:uid(), title:'Review respon deal PT Maju Jaya', due: daysFromNowISO(1), priority:'high', done:false, contactId:c1 },
    { id:uid(), title:'Finalisasi kontrak Sentral Bening', due: daysFromNowISO(3), priority:'medium', done:false, contactId:c2 },
    { id:uid(), title:'Setup integrasi AI untuk Uee Banging', due: daysAgoISO(1), priority:'medium', done:false, contactId:c3 },
  ];
  state.notes = [
    { id:uid(), entityType:'contact', entityId:c1, text:'Sangat tertarik dengan fitur otomasi AI, minta demo lanjutan.', at: daysAgoISO(6) },
  ];
  state.products = [
    { id:uid(), name:'Lisensi CRM Enterprise (Tahunan)', model:'CRM-ENT-Y', sku:'CRM-ENT-Y', category:'SOFTWARE', unit:'Lisensi', price:150000000, description:'Akses penuh modul CRM untuk seluruh tim.' },
    { id:uid(), name:'Add-on Integrasi AI', model:'AI-ADDON', sku:'AI-ADDON', category:'SOFTWARE', unit:'Paket', price:57000000, description:'Skoring lead & rekomendasi otomatis berbasis AI.' },
    { id:uid(), name:'Jasa Onboarding & Training', model:'SVC-ONB', sku:'SVC-ONB', category:'JASA & ACCESSORIES', unit:'Sesi', price:15000000, description:'Sesi pelatihan penggunaan sistem untuk tim sales.' },
    { id:uid(), name:'Conventional Fire Alarm Control Panel, 4 Zone', model:'GST104A', sku:'GST104A', category:'EQUIPMENT FIRE ALARM', unit:'Unit', price:14850000, description:'3 Programmable Sounder Circuit, 1 Fire Alarm Output, 1 Fault Output, Excluding Batteries (Certified by LPCB)' },
    { id:uid(), name:'Battery Backup 12Volt', model:'BATT-12V', sku:'BATT-12V', category:'EQUIPMENT FIRE ALARM', unit:'Unit', price:825000, description:'Aksesori baterai cadangan untuk panel.' },
    { id:uid(), name:'Conventional Photoelectric Smoke Detector', model:'DC-9102E', sku:'DC-9102E', category:'EQUIPMENT FIRE ALARM', unit:'Unit', price:660000, description:'Detektor asap fotoelektrik konvensional.' },
    { id:uid(), name:'Conventional Rate of Rise & Fixed Temperature Heat Detector', model:'DC-9103E', sku:'DC-9103E', category:'EQUIPMENT FIRE ALARM', unit:'Unit', price:643500, description:'Detektor panas konvensional.' },
    { id:uid(), name:'Innovative Conventional Manual Call Point', model:'DC-9204E', sku:'DC-9204E', category:'EQUIPMENT FIRE ALARM', unit:'Unit', price:759000, description:'Titik panggilan manual konvensional.' },
    { id:uid(), name:'Addressable Sounder Strobe', model:'C-9401', sku:'C-9401', category:'EQUIPMENT FIRE ALARM', unit:'Unit', price:1270500, description:'Sounder strobe addressable.' },
    { id:uid(), name:'Jasa Instalasi Detector c/w Cable Belden STP AWG 18 & Conduit 20mm', model:'', sku:'SVC-DET', category:'JASA & ACCESSORIES', unit:'Unit', price:1300000, description:'' },
    { id:uid(), name:'Jasa Instalasi MCP c/w Cable Belden STP AWG 18 & Conduit 20mm', model:'', sku:'SVC-MCP', category:'JASA & ACCESSORIES', unit:'Unit', price:1300000, description:'' },
    { id:uid(), name:'Jasa Instalasi Horn Strobe c/w Cable Belden STP AWG 18 & Conduit 20mm', model:'', sku:'SVC-HS', category:'JASA & ACCESSORIES', unit:'Unit', price:1300000, description:'' },
    { id:uid(), name:'Accessories', model:'', sku:'SVC-ACC', category:'JASA & ACCESSORIES', unit:'Lot', price:8000000, description:'' },
    { id:uid(), name:'Seting & Tescomisioning', model:'', sku:'SVC-TEST', category:'JASA & ACCESSORIES', unit:'Lot', price:10000000, description:'' },
  ];

  const coQ=uid();
  state.companies.push({ id:coQ, name:'PT. SURABAYA PRAKARSA F. S', industry:'Konstruksi & Fire Safety', website:'', size:'', address:'Jl.Darmo Harapan IX/EB 27, Surabaya 60187', createdAt: daysAgoISO(2) });
  const cQ=uid();
  state.contacts.push({ id:cQ, name:'Mr. Billie', companyId:coQ, email:'suprafireservice@yahoo.com', phone:'0812 3062 572', status:'lead', tags:['Fire Alarm'], ownerId:'me', createdAt: daysAgoISO(2) });
  const dQ=uid();
  state.deals.push({ id:dQ, title:'Fire Alarm System - Samator Bambe LPCB', contactId:cQ, value:74285400, stage:'Proposal', probability:70, ownerId:'me', lossReason:null, items:[], createdAt: daysAgoISO(2) });

  state.quotes = [
    {
      id: uid(), number:'QPW012/MKT-SSS/I/26 rev01', date: daysAgoISO(2).slice(0,10),
      subject:'Fire Alarm System', projectName:'Samator Bambe - LPCB', yourRef:'', pages:'1 Lembar',
      dealId: dQ, contactId: cQ,
      toName:'PT. SURABAYA PRAKARSA F. S', toAddress:'Jl.Darmo Harapan IX/EB 27, Surabaya 60187',
      attnName:'Mr. Billie', attnPhone:'0812 3062 572', attnFax:'031 7347620', attnEmail:'suprafireservice@yahoo.com',
      sections: [
        {
          name:'A. EQUIPMENT FIRE ALARM', discountPct:55,
          items: [
            { model:'GST104A', description:'Conventional Fire Alarm Control Panel,4 Zone, 3 Programmable Sounder Circuit, 1 Fire Alarm Output, 1 Fault Output, 1 Disalbe/Supervisory Output,1 AUX power output, Repeater Output against per zone,Built-in Battery Charger, Excluding Batteries (Certified by LPCB)', qty:1, unit:'Unit', price:14850000 },
            { model:'', description:'Accessories: Battery Backup 12Volt', qty:2, unit:'Unit', price:825000 },
            { model:'DC-9102E', description:'Conventional Photoelectric Smoke Detector', qty:23, unit:'Unit', price:660000 },
            { model:'DC-9103E', description:'Conventional Rate of Rise and Fixed Temperature Heat Detector', qty:1, unit:'Unit', price:643500 },
            { model:'DC-9204E', description:'Innovative Conventional Manual Call Point', qty:3, unit:'Unit', price:759000 },
            { model:'C-9401', description:'Addressable Souder Strobe', qty:3, unit:'Unit', price:1270500 },
          ]
        },
        {
          name:'B. JASA & ACCESSORIES', discountPct:0,
          items: [
            { model:'', description:'Jasa Istalasi Detector c/w Cable Belden STP AWG 18 & Conduit 20mm', qty:24, unit:'Unit', price:1300000 },
            { model:'', description:'Jasa Instalasi MCP c/w Cable Belden STP AWG 18 & Conduit 20mm', qty:3, unit:'Unit', price:1300000 },
            { model:'', description:'Jasa Instalasi Horn Strobe c/w Cable Belden STP AWG 18 & Conduit 20mm', qty:3, unit:'Unit', price:1300000 },
            { model:'', description:'Accessories', qty:1, unit:'Lot', price:8000000 },
            { model:'', description:'Seting & Tescomisioning', qty:1, unit:'Lot', price:10000000 },
          ]
        }
      ],
      notesList: [
        'Harga belum termasuk PPn 11%',
        'Harga tidak termsuk material kabel & jasa penarikanya',
        'Untuk harga termasuk transportasi & akomodasi pekerjaan tescom',
      ],
      terms: [
        '1 Year Warranty Repair and spare parts. Does not apply to damage caused by lightning, electrical voltage, floods, fires and other extraordinary events.',
        'Franco Surabaya Area Price & Exclude PPn 11%',
        'Delivery Time : 2-8 weeks after received P.O. & Payment',
        'Payment :100% Before delivery',
        'Quotation Validity : 14 days',
      ],
      status:'Sent', createdAt: daysAgoISO(2),
    }
  ];
  state.activities = [ { id:uid(), text:'Data demo dimuat ke workspace Anda', at: new Date().toISOString() } ];
}

/* ---------- load / init ---------- */
const LEGACY_KEY_TO_PART = { 'crm:contacts':'contacts','crm:deals':'deals','crm:tasks':'tasks','crm:activities':'activities','crm:companies':'companies','crm:notes':'notes','crm:products':'products','crm:quotes':'quotes','crm:team':'team' };
/* Migrasi satu kali dari skema lama (tabel crm_store: satu blob JSON per
   key, id berupa string base36 -- BUKAN uuid valid) ke skema relasional
   baru (kolom id bertipe uuid). Setiap id lama diganti uuid baru yang
   valid, dan semua referensi silang antar entity (companyId, contactId,
   dealId, ownerId, entityId pada notes) ikut dipetakan ulang supaya
   keterhubungan data tetap utuh. Aman dipanggil berkali-kali — hanya
   benar-benar memindahkan data kalau tabel relasional baru masih kosong
   untuk user tsb (dicek oleh pemanggilnya di loadAll). */
async function tryMigrateLegacyData(){
  try {
    const { data, error } = await sbClient.from('crm_store').select('key,value').eq('user_id', currentUser.id);
    if (error || !data || !data.length) return false;
    const map = {};
    data.forEach(row=>{ map[row.key] = row.value; });

    const hasLegacyList = Object.keys(LEGACY_KEY_TO_PART).some(k => Array.isArray(map[k]) && map[k].length);
    if (!hasLegacyList) return false;

    // id lama -> id baru (uuid valid), per jenis entity
    const idMaps = {};
    Object.entries(LEGACY_KEY_TO_PART).forEach(([key, part])=>{
      const list = Array.isArray(map[key]) ? map[key] : [];
      idMaps[part] = {};
      list.forEach(item=>{ if (item && item.id) idMaps[part][item.id] = uid(); });
    });
    const remap = (part, oldId) => (oldId && idMaps[part] && idMaps[part][oldId]) ? idMaps[part][oldId] : null;
    const remapOwner = (oldOwnerId) => {
      if (!oldOwnerId || oldOwnerId === 'me') return oldOwnerId || null;
      return idMaps.team && idMaps.team[oldOwnerId] ? idMaps.team[oldOwnerId] : null;
    };

    Object.entries(LEGACY_KEY_TO_PART).forEach(([key, part])=>{
      const list = Array.isArray(map[key]) ? map[key] : [];
      state[part] = list.map(item=>{
        const copy = { ...item, id: idMaps[part][item.id] };
        if ('companyId' in copy) copy.companyId = remap('companies', copy.companyId);
        if ('contactId' in copy) copy.contactId = remap('contacts', copy.contactId);
        if ('dealId' in copy) copy.dealId = remap('deals', copy.dealId);
        if ('ownerId' in copy) copy.ownerId = remapOwner(copy.ownerId);
        if (part === 'notes' && copy.entityType){
          copy.entityId = remap(copy.entityType === 'contact' ? 'contacts' : 'deals', copy.entityId);
        }
        return copy;
      }).filter(x => x.id); // buang baris yang id-nya gagal terpetakan
    });

    if (map['crm:profile']) state.profile = map['crm:profile'];
    if (map['crm:settings']) state.settings = Object.assign({}, state.settings, map['crm:settings']);

    toast('Data lama dari versi sebelumnya berhasil dimigrasikan', 'info');
    return true;
  } catch(e){ console.error('legacy migration check failed', e); return false; }
}
async function loadAll(){
  const settingsRow = await loadUserSettings();
  const isBrandNewUser = settingsRow === null;

  const loaded = {};
  await Promise.all(LIST_PARTS.map(async part=>{ loaded[part] = await dbListAll(part); }));

  const hasAnyData = LIST_PARTS.some(part => loaded[part].length > 0);

  if (isBrandNewUser && !hasAnyData){
    const migrated = await tryMigrateLegacyData();
    if (!migrated) seedDemoData();
    LIST_PARTS.forEach(part=>{ lastSynced[part] = []; }); // belum ada apa-apa di tabel relasional baru
    await Promise.all(LIST_PARTS.map(persist));
    await persistUserSettings();
  } else {
    LIST_PARTS.forEach(part=>{
      state[part] = loaded[part];
      lastSynced[part] = clone(loaded[part]);
    });
  }
  setupRealtime();
}
async function resetDemoData(){
  if(!confirm('Ganti data Anda saat ini dengan data demo? Data lama akan hilang.')) return;
  seedDemoData();
  await Promise.all(LIST_PARTS.map(persist));
  await persistUserSettings();
  renderAll(); toast('Data demo dimuat ulang', 'info');
}
async function clearAllData(){
  if(!confirm('Hapus semua data CRM Anda secara permanen?')) return;
  state.contacts=[]; state.deals=[]; state.tasks=[]; state.activities=[]; state.companies=[]; state.notes=[];
  state.products=[]; state.quotes=[]; state.team=[];
  await Promise.all(LIST_PARTS.map(persist));
  renderAll(); toast('Semua data telah dihapus', 'err');
}

/* ---------- navigation ---------- */
document.querySelectorAll('.nav-btn').forEach(btn=> btn.addEventListener('click', ()=> switchView(btn.dataset.view)));
const VIEW_TITLES = { dashboard:'Dashboard', contacts:'Contacts', companies:'Companies', deals:'Deals Pipeline', tasks:'Tasks', calendar:'Calendar', reports:'Reports', products:'Products & Price Book', quotes:'Quotations', team:'Team', settings:'Settings' };
function switchView(view){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
  document.getElementById('page-title').textContent = VIEW_TITLES[view];
  if (view==='dashboard') updateCharts();
  if (view==='calendar') renderCalendar();
  if (view==='reports') renderReports();
  if (view==='products') renderProducts();
  if (view==='quotes') renderQuotes();
  if (view==='team') renderTeam();
}

/* ---------- clock ---------- */
function tickClock(){
  const now = new Date();
  const datePart = now.toLocaleDateString('en-GB', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
  document.getElementById('live-clock').textContent = `${datePart}, ${now.toLocaleTimeString('en-GB')}`;
}
setInterval(tickClock, 1000);

/* ---------- theme (dark/light) ---------- */
function toggleTheme(){
  const root = document.documentElement;
  const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  root.setAttribute('data-theme', next);
  try { localStorage.setItem('crm-theme', next); } catch(e){}
  toast(next === 'light' ? 'Mode terang diaktifkan' : 'Mode gelap diaktifkan', 'info');
}

/* ---------- MODALS ---------- */
function openModal(html){
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 z-[80] flex items-center justify-center p-4 modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="glass-card ai-floating-card rounded-3xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto">${html}</div>
    </div>`;
}
function closeModal(){ document.getElementById('modal-root').innerHTML = ''; }

/* ---------- DRAWER (detail panel) ---------- */
function openDrawer(html){
  document.getElementById('drawer-root').innerHTML = `
    <div class="fixed inset-0 z-[75] flex justify-end modal-overlay" onclick="if(event.target===this) closeDrawer()">
      <div class="drawer-panel glass-card ai-floating-card w-full max-w-md h-full overflow-y-auto p-6">${html}</div>
    </div>`;
}
function closeDrawer(){ document.getElementById('drawer-root').innerHTML = ''; }
function switchTab(prefix, tab){
  document.querySelectorAll(`[data-tabgroup="${prefix}"]`).forEach(el=>{
    el.classList.toggle('hidden', el.dataset.tab !== tab);
  });
  document.querySelectorAll(`[data-tabbtn="${prefix}"]`).forEach(el=>{
    el.classList.toggle('active', el.dataset.tab === tab);
  });
}

/* ---- Contact: modal (create/edit) ---- */
function openContactModal(id){
  const c = id ? getContact(id) : null;
  const companyOptions = state.companies.map(co=>`<option value="${co.id}" ${c&&c.companyId===co.id?'selected':''}>${esc(co.name)}</option>`).join('');
  openModal(`
    <h3 class="text-sm font-bold text-white mb-4">${c?'Edit Kontak':'Tambah Kontak'}</h3>
    <form id="contact-form" class="space-y-3 text-sm">
      <input type="hidden" name="id" value="${c?c.id:''}">
      <div><label class="text-xs text-textMuted block mb-1">Nama</label><input name="name" required class="field-input rounded-xl px-3 py-2 w-full" value="${c?esc(c.name):''}"></div>
      <div><label class="text-xs text-textMuted block mb-1">Perusahaan</label>
        <select name="companyId" class="field-input rounded-xl px-3 py-2 w-full"><option value="">— Tidak terhubung —</option>${companyOptions}</select>
      </div>
      <div><label class="text-xs text-textMuted block mb-1">Email</label><input type="email" name="email" class="field-input rounded-xl px-3 py-2 w-full" value="${c?esc(c.email):''}"></div>
      <div><label class="text-xs text-textMuted block mb-1">Telepon</label><input name="phone" class="field-input rounded-xl px-3 py-2 w-full" value="${c?esc(c.phone):''}"></div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label class="text-xs text-textMuted block mb-1">Status</label>
          <select name="status" class="field-input rounded-xl px-3 py-2 w-full">
            <option value="lead" ${c&&c.status==='lead'?'selected':''}>Lead</option>
            <option value="customer" ${c&&c.status==='customer'?'selected':''}>Customer</option>
          </select>
        </div>
        <div><label class="text-xs text-textMuted block mb-1">Owner</label>
          <select name="ownerId" class="field-input rounded-xl px-3 py-2 w-full">${teamOptionsHTML(c?c.ownerId:'me')}</select>
        </div>
      </div>
      <div><label class="text-xs text-textMuted block mb-1">Tag (pisahkan dengan koma)</label><input name="tags" class="field-input rounded-xl px-3 py-2 w-full" value="${c?esc((c.tags||[]).join(', ')):''}" placeholder="VIP, Enterprise"></div>
      <div class="flex justify-between items-center pt-2">
        ${c?`<button type="button" onclick="deleteContact('${c.id}')" class="text-xs text-red-400 hover:underline">Hapus kontak</button>`:'<span></span>'}
        <div class="flex gap-2">
          <button type="button" onclick="closeModal()" class="text-xs px-4 py-2 rounded-xl border border-panelBorder text-slate-300">Batal</button>
          <button type="submit" class="text-xs font-semibold px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white">Simpan</button>
        </div>
      </div>
    </form>
  `);
  document.getElementById('contact-form').addEventListener('submit', saveContact);
}
async function saveContact(e){
  e.preventDefault();
  const f = new FormData(e.target);
  const id = f.get('id');
  const tags = (f.get('tags')||'').split(',').map(s=>s.trim()).filter(Boolean);
  const data = { name:f.get('name').trim(), companyId:f.get('companyId')||null, email:f.get('email').trim(), phone:f.get('phone').trim(), status:f.get('status'), ownerId:f.get('ownerId')||'me', tags };
  if (!data.name) return;
  if (id){
    Object.assign(getContact(id), data);
    logActivity(`Kontak "${data.name}" diperbarui`, {contactId:id});
    toast('Kontak diperbarui');
  } else {
    const newId = uid();
    state.contacts.unshift({ id:newId, ...data, createdAt: new Date().toISOString() });
    logActivity(`Kontak baru "${data.name}" ditambahkan`, {contactId:newId});
    toast('Kontak ditambahkan');
  }
  await persist('contacts'); closeModal(); closeDrawer(); renderAll();
}
async function deleteContact(id){
  if(!confirm('Hapus kontak ini? Deal & tugas terkait tetap ada namun tidak lagi terhubung.')) return;
  const c = getContact(id);
  state.contacts = state.contacts.filter(x=>x.id!==id);
  logActivity(`Kontak "${c?c.name:''}" dihapus`);
  await persist('contacts'); closeModal(); closeDrawer(); renderAll();
  toast('Kontak dihapus', 'err');
}

/* ---- Contact: detail drawer ---- */
function openContactDetail(id){
  const c = getContact(id); if(!c) return;
  const co = getCompany(c.companyId);
  const score = leadScore(c);
  const deals = dealsForContact(id);
  const tasks = tasksForContact(id);
  const notes = notesFor('contact', id);
  openDrawer(`
    <div class="flex justify-between items-start mb-1">
      <div>
        <h3 class="font-display text-lg font-bold text-white">${esc(c.name)}</h3>
        <p class="text-xs text-textMuted">${co?esc(co.name):'Tidak terhubung ke perusahaan'}</p>
      </div>
      <span class="text-[10px] font-bold px-2 py-1 rounded-full border ${scoreColor(score)}">Skor ${score}</span>
    </div>
    <div class="flex gap-2 mt-3 mb-4">
      <button onclick="openContactModal('${c.id}')" class="text-xs px-3 py-1.5 rounded-lg border border-panelBorder text-slate-300 hover:bg-white/5">Edit</button>
      <button onclick="deleteContact('${c.id}')" class="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10">Hapus</button>
      <span class="ml-auto text-[9px] font-bold uppercase px-2 py-1.5 rounded-full ${c.status==='customer'?'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20':'bg-purple-500/10 text-purple-400 border border-purple-500/20'}">${c.status}</span>
    </div>
    <div class="flex gap-1.5 flex-wrap mb-4">${(c.tags||[]).map(t=>`<span class="tag-chip">${esc(t)}</span>`).join('') || '<span class="text-[10px] text-textMuted">Belum ada tag</span>'}</div>
    <div class="text-xs text-slate-400 space-y-1 mb-5 bg-panelBg/60 border border-white/5 rounded-xl p-3">
      <p>✉ ${esc(c.email)||'—'}</p>
      <p>☎ ${esc(c.phone)||'—'}</p>
      <p>👤 Owner: ${esc(ownerName(c.ownerId))}</p>
    </div>

    <div class="flex gap-4 border-b border-white/10 mb-4 text-xs font-semibold">
      <button data-tabbtn="contact" data-tab="notes" onclick="switchTab('contact','notes')" class="tab-btn active pb-2 border-b-2">Notes</button>
      <button data-tabbtn="contact" data-tab="deals" onclick="switchTab('contact','deals')" class="tab-btn pb-2 border-b-2">Deals (${deals.length})</button>
      <button data-tabbtn="contact" data-tab="tasks" onclick="switchTab('contact','tasks')" class="tab-btn pb-2 border-b-2">Tasks (${tasks.length})</button>
    </div>

    <div data-tabgroup="contact" data-tab="notes">
      <form onsubmit="return addNote(event,'contact','${c.id}')" class="flex gap-2 mb-3">
        <input name="text" required placeholder="Tulis catatan..." class="field-input rounded-xl px-3 py-2 text-xs flex-1">
        <button class="text-xs font-semibold px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white">Tambah</button>
      </form>
      <div class="space-y-2.5">
        ${notes.map(n=>`<div class="bg-panelBg/60 border border-white/5 rounded-xl p-3 text-xs"><p class="text-slate-300">${esc(n.text)}</p><p class="text-[10px] text-textMuted mt-1">${timeAgo(n.at)}</p></div>`).join('') || '<p class="text-xs text-textMuted">Belum ada catatan.</p>'}
      </div>
    </div>
    <div data-tabgroup="contact" data-tab="deals" class="hidden space-y-2">
      ${deals.map(d=>`<div class="bg-panelBg/60 border border-white/5 rounded-xl p-3 text-xs flex justify-between items-center cursor-pointer hover:border-purple-500/30" onclick="openDealDetail('${d.id}')">
        <div><p class="font-semibold text-white">${esc(d.title)}</p><p class="text-[10px]" style="color:${STAGE_COLOR[d.stage]}">${d.stage}</p></div>
        <span class="font-mono text-cyan-400">${money(d.value)}</span>
      </div>`).join('') || '<p class="text-xs text-textMuted">Belum ada deal.</p>'}
    </div>
    <div data-tabgroup="contact" data-tab="tasks" class="hidden space-y-2">
      ${tasks.map(t=>`<div class="bg-panelBg/60 border border-white/5 rounded-xl p-3 text-xs flex justify-between items-center cursor-pointer hover:border-purple-500/30" onclick="openTaskModal('${t.id}')">
        <p class="${t.done?'line-through text-textMuted':'text-slate-300'}">${esc(t.title)}</p>
        <span class="text-[10px] text-textMuted">${new Date(t.due).toLocaleDateString('id-ID',{day:'2-digit',month:'short'})}</span>
      </div>`).join('') || '<p class="text-xs text-textMuted">Belum ada tugas.</p>'}
    </div>
  `);
}
async function addNote(e, entityType, entityId){
  e.preventDefault();
  const text = new FormData(e.target).get('text').trim();
  if (!text) return false;
  state.notes.unshift({ id: uid(), entityType, entityId, text, at: new Date().toISOString() });
  await persist('notes');
  const refs = entityType==='contact' ? {contactId:entityId} : {dealId:entityId};
  logActivity(`Catatan baru ditambahkan`, refs);
  if (entityType==='contact') openContactDetail(entityId); else openDealDetail(entityId);
  renderDashboardStats();
  toast('Catatan ditambahkan');
  return false;
}

/* ---- Company: modal + detail ---- */
function openCompanyModal(id){
  const co = id ? getCompany(id) : null;
  openModal(`
    <h3 class="text-sm font-bold text-white mb-4">${co?'Edit Perusahaan':'Tambah Perusahaan'}</h3>
    <form id="company-form" class="space-y-3 text-sm">
      <input type="hidden" name="id" value="${co?co.id:''}">
      <div><label class="text-xs text-textMuted block mb-1">Nama Perusahaan</label><input name="name" required class="field-input rounded-xl px-3 py-2 w-full" value="${co?esc(co.name):''}"></div>
      <div><label class="text-xs text-textMuted block mb-1">Industri</label><input name="industry" class="field-input rounded-xl px-3 py-2 w-full" value="${co?esc(co.industry):''}"></div>
      <div><label class="text-xs text-textMuted block mb-1">Website</label><input name="website" class="field-input rounded-xl px-3 py-2 w-full" value="${co?esc(co.website):''}"></div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label class="text-xs text-textMuted block mb-1">Jumlah Karyawan</label><input name="size" class="field-input rounded-xl px-3 py-2 w-full" value="${co?esc(co.size):''}"></div>
        <div><label class="text-xs text-textMuted block mb-1">Lokasi</label><input name="address" class="field-input rounded-xl px-3 py-2 w-full" value="${co?esc(co.address):''}"></div>
      </div>
      <div class="flex justify-between items-center pt-2">
        ${co?`<button type="button" onclick="deleteCompany('${co.id}')" class="text-xs text-red-400 hover:underline">Hapus perusahaan</button>`:'<span></span>'}
        <div class="flex gap-2">
          <button type="button" onclick="closeModal()" class="text-xs px-4 py-2 rounded-xl border border-panelBorder text-slate-300">Batal</button>
          <button type="submit" class="text-xs font-semibold px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white">Simpan</button>
        </div>
      </div>
    </form>
  `);
  document.getElementById('company-form').addEventListener('submit', saveCompany);
}
async function saveCompany(e){
  e.preventDefault();
  const f = new FormData(e.target);
  const id = f.get('id');
  const data = { name:f.get('name').trim(), industry:f.get('industry').trim(), website:f.get('website').trim(), size:f.get('size').trim(), address:f.get('address').trim() };
  if (!data.name) return;
  if (id){ Object.assign(getCompany(id), data); logActivity(`Perusahaan "${data.name}" diperbarui`); toast('Perusahaan diperbarui'); }
  else { state.companies.unshift({ id:uid(), ...data, createdAt:new Date().toISOString() }); logActivity(`Perusahaan baru "${data.name}" ditambahkan`); toast('Perusahaan ditambahkan'); }
  await persist('companies'); closeModal(); closeDrawer(); renderAll();
}
async function deleteCompany(id){
  if(!confirm('Hapus perusahaan ini? Kontak terkait tidak akan terhubung lagi.')) return;
  const co = getCompany(id);
  state.companies = state.companies.filter(x=>x.id!==id);
  state.contacts.forEach(c=>{ if(c.companyId===id) c.companyId=null; });
  logActivity(`Perusahaan "${co?co.name:''}" dihapus`);
  await Promise.all([persist('companies'), persist('contacts')]);
  closeModal(); closeDrawer(); renderAll(); toast('Perusahaan dihapus', 'err');
}
function openCompanyDetail(id){
  const co = getCompany(id); if(!co) return;
  const contacts = state.contacts.filter(c=>c.companyId===id);
  const deals = dealsForCompany(id);
  const total = deals.reduce((s,d)=>s+d.value,0);
  openDrawer(`
    <h3 class="font-display text-lg font-bold text-white">${esc(co.name)}</h3>
    <p class="text-xs text-textMuted mb-4">${esc(co.industry)||'—'} • ${esc(co.address)||'—'}</p>
    <div class="flex gap-2 mb-5">
      <button onclick="openCompanyModal('${co.id}')" class="text-xs px-3 py-1.5 rounded-lg border border-panelBorder text-slate-300 hover:bg-white/5">Edit</button>
      <button onclick="deleteCompany('${co.id}')" class="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10">Hapus</button>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5 text-xs">
      <div class="bg-panelBg/60 border border-white/5 rounded-xl p-3"><p class="text-textMuted text-[10px] mb-1">Total Nilai Deal</p><p class="font-mono font-bold text-cyan-400">${money(total)}</p></div>
      <div class="bg-panelBg/60 border border-white/5 rounded-xl p-3"><p class="text-textMuted text-[10px] mb-1">Website</p><p class="text-slate-300">${esc(co.website)||'—'}</p></div>
    </div>
    <h4 class="text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">Kontak (${contacts.length})</h4>
    <div class="space-y-2 mb-5">
      ${contacts.map(c=>`<div class="bg-panelBg/60 border border-white/5 rounded-xl p-3 text-xs cursor-pointer hover:border-purple-500/30" onclick="openContactDetail('${c.id}')">${esc(c.name)}</div>`).join('') || '<p class="text-xs text-textMuted">Belum ada kontak.</p>'}
    </div>
    <h4 class="text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">Deal (${deals.length})</h4>
    <div class="space-y-2">
      ${deals.map(d=>`<div class="bg-panelBg/60 border border-white/5 rounded-xl p-3 text-xs flex justify-between items-center cursor-pointer hover:border-purple-500/30" onclick="openDealDetail('${d.id}')"><span>${esc(d.title)}</span><span class="font-mono text-cyan-400">${money(d.value)}</span></div>`).join('') || '<p class="text-xs text-textMuted">Belum ada deal.</p>'}
    </div>
  `);
}

/* ---- Deal: modal + detail ---- */
let dealDraftItems = [];
function renderDealDraftItemsHTML(){
  const total = dealDraftItems.reduce((s,i)=>s+i.qty*i.price,0);
  return `
    <div id="deal-items-list" class="space-y-1.5 mb-2">
      ${dealDraftItems.map((it,idx)=>`<div class="flex items-center justify-between gap-2 bg-panelBg/60 border border-white/5 rounded-lg px-2.5 py-1.5 text-[11px]">
        <span class="text-slate-300">${esc(it.name)} × ${it.qty}</span>
        <div class="flex items-center gap-2"><span class="font-mono text-cyan-400">${money(it.qty*it.price)}</span>
        <button type="button" onclick="removeDealDraftItem(${idx})" class="text-red-400">✕</button></div>
      </div>`).join('') || '<p class="text-[11px] text-textMuted">Belum ada item produk ditambahkan.</p>'}
    </div>
    ${dealDraftItems.length ? `<p class="text-[11px] text-textMuted mb-2">Total item: <span class="font-mono text-emerald-400 font-bold">${money(total)}</span></p>` : ''}
  `;
}
function refreshDealItemsUI(){
  document.getElementById('deal-items-wrap').innerHTML = renderDealDraftItemsHTML();
}
function addDealDraftItem(){
  const sel = document.getElementById('deal-item-product');
  const qtyInput = document.getElementById('deal-item-qty');
  const p = state.products.find(x=>x.id===sel.value);
  if (!p) return;
  const qty = Math.max(1, Number(qtyInput.value)||1);
  dealDraftItems.push({ productId:p.id, name:p.name, price:p.price, qty });
  refreshDealItemsUI();
  const total = dealDraftItems.reduce((s,i)=>s+i.qty*i.price,0);
  document.querySelector('#deal-form [name="value"]').value = total;
}
function removeDealDraftItem(idx){
  dealDraftItems.splice(idx,1);
  refreshDealItemsUI();
  const total = dealDraftItems.reduce((s,i)=>s+i.qty*i.price,0);
  if (dealDraftItems.length) document.querySelector('#deal-form [name="value"]').value = total;
}
function openDealModal(id, prefillContactId){
  const d = id ? state.deals.find(x=>x.id===id) : null;
  dealDraftItems = d && d.items ? JSON.parse(JSON.stringify(d.items)) : [];
  const contactOptions = state.contacts.map(c=>`<option value="${c.id}" ${(d?d.contactId===c.id:prefillContactId===c.id)?'selected':''}>${esc(c.name)} — ${esc(contactCompanyName(c))}</option>`).join('');
  const productOptions = state.products.map(p=>`<option value="${p.id}">${esc(p.name)} — ${money(p.price)}</option>`).join('');
  openModal(`
    <h3 class="text-sm font-bold text-white mb-4">${d?'Edit Deal':'Tambah Deal'}</h3>
    <form id="deal-form" class="space-y-3 text-sm">
      <input type="hidden" name="id" value="${d?d.id:''}">
      <div><label class="text-xs text-textMuted block mb-1">Nama Deal</label><input name="title" required class="field-input rounded-xl px-3 py-2 w-full" value="${d?esc(d.title):''}"></div>
      <div><label class="text-xs text-textMuted block mb-1">Kontak</label>
        <select name="contactId" class="field-input rounded-xl px-3 py-2 w-full"><option value="">— Tanpa kontak —</option>${contactOptions}</select>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label class="text-xs text-textMuted block mb-1">Nilai (Rp)</label><input type="number" min="0" name="value" class="field-input rounded-xl px-3 py-2 w-full" value="${d?d.value:0}"></div>
        <div><label class="text-xs text-textMuted block mb-1">Probabilitas (%)</label><input type="number" min="0" max="100" name="probability" class="field-input rounded-xl px-3 py-2 w-full" value="${d?d.probability:50}"></div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label class="text-xs text-textMuted block mb-1">Stage</label>
          <select name="stage" class="field-input rounded-xl px-3 py-2 w-full">${STAGES.map(s=>`<option value="${s}" ${d&&d.stage===s?'selected':''}>${s}</option>`).join('')}</select>
        </div>
        <div><label class="text-xs text-textMuted block mb-1">Owner</label>
          <select name="ownerId" class="field-input rounded-xl px-3 py-2 w-full">${teamOptionsHTML(d?d.ownerId:'me')}</select>
        </div>
      </div>
      <div class="pt-1 border-t border-white/10">
        <label class="text-xs text-textMuted block mb-1 mt-2">Item Produk (opsional, dari Price Book)</label>
        <div class="flex gap-2 mb-2">
          <select id="deal-item-product" class="field-input rounded-xl px-2 py-2 w-full text-xs">${productOptions || '<option value="">Belum ada produk</option>'}</select>
          <input id="deal-item-qty" type="number" min="1" value="1" class="field-input rounded-xl px-2 py-2 w-16 text-xs">
          <button type="button" onclick="addDealDraftItem()" class="text-xs font-semibold px-3 rounded-xl border border-panelBorder text-slate-300 hover:bg-white/5">+</button>
        </div>
        <div id="deal-items-wrap">${renderDealDraftItemsHTML()}</div>
      </div>
      <div class="flex justify-between items-center pt-2">
        ${d?`<button type="button" onclick="deleteDeal('${d.id}')" class="text-xs text-red-400 hover:underline">Hapus deal</button>`:'<span></span>'}
        <div class="flex gap-2">
          <button type="button" onclick="closeModal()" class="text-xs px-4 py-2 rounded-xl border border-panelBorder text-slate-300">Batal</button>
          <button type="submit" class="text-xs font-semibold px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white">Simpan</button>
        </div>
      </div>
    </form>
  `);
  document.getElementById('deal-form').addEventListener('submit', saveDeal);
}
async function saveDeal(e){
  e.preventDefault();
  const f = new FormData(e.target);
  const id = f.get('id');
  const data = { title:f.get('title').trim(), contactId:f.get('contactId')||null, value:Number(f.get('value'))||0, probability:Math.max(0,Math.min(100,Number(f.get('probability'))||0)), stage:f.get('stage'), ownerId:f.get('ownerId')||'me', items: JSON.parse(JSON.stringify(dealDraftItems)) };
  if (!data.title) return;
  if (id){
    const existing = state.deals.find(x=>x.id===id);
    Object.assign(existing, data);
    logActivity(`Deal "${data.title}" diperbarui`, {dealId:id, contactId:data.contactId});
    toast('Deal diperbarui');
  } else {
    const newId = uid();
    state.deals.unshift({ id:newId, ...data, lossReason:null, createdAt: new Date().toISOString() });
    logActivity(`Deal baru "${data.title}" ditambahkan`, {dealId:newId, contactId:data.contactId});
    toast('Deal ditambahkan');
  }
  await persist('deals'); closeModal(); closeDrawer(); renderAll();
}
async function deleteDeal(id){
  if(!confirm('Hapus deal ini?')) return;
  const d = state.deals.find(x=>x.id===id);
  state.deals = state.deals.filter(x=>x.id!==id);
  logActivity(`Deal "${d?d.title:''}" dihapus`);
  await persist('deals'); closeModal(); closeDrawer(); renderAll();
  toast('Deal dihapus', 'err');
}
async function updateDealStage(id, stage){
  const d = state.deals.find(x=>x.id===id);
  if (!d || d.stage===stage) return;
  if (stage==='Lost' && state.settings.autoLossReason){
    const reason = prompt('Alasan deal ini kalah? (contoh: Harga, Kompetitor, Timing, Tidak responsif)');
    d.lossReason = (reason||'').trim() || 'Tidak disebutkan';
  }
  d.stage = stage;
  if (stage==='Won') d.probability = 100;
  if (stage==='Lost') d.probability = 0;
  logActivity(`Deal "${d.title}" dipindahkan ke ${stage}`, {dealId:id});
  if (stage==='Proposal' && state.settings.autoTaskProposal){
    const contact = getContact(d.contactId);
    state.tasks.unshift({ id: uid(), title:`Follow up proposal: ${d.title}`, due: daysFromNowISO(3), priority:'high', done:false, contactId:d.contactId });
    logActivity(`Tugas follow-up otomatis dibuat untuk "${d.title}"`, {dealId:id, contactId:d.contactId});
    await persist('tasks');
  }
  await persist('deals'); renderAll();
}
function openDealDetail(id){
  const d = state.deals.find(x=>x.id===id); if(!d) return;
  const contact = getContact(d.contactId);
  const notes = notesFor('deal', id);
  openDrawer(`
    <div class="flex justify-between items-start mb-1">
      <div><h3 class="font-display text-lg font-bold text-white">${esc(d.title)}</h3><p class="text-xs text-textMuted">${contact?esc(contact.name)+' — '+esc(contactCompanyName(contact)):'Tanpa kontak'}</p></div>
      <span class="text-[10px] font-bold px-2 py-1 rounded-full border" style="color:${STAGE_COLOR[d.stage]};border-color:${STAGE_COLOR[d.stage]}55">${d.stage}</span>
    </div>
    <div class="flex gap-2 mt-3 mb-4">
      <button onclick="openDealModal('${d.id}')" class="text-xs px-3 py-1.5 rounded-lg border border-panelBorder text-slate-300 hover:bg-white/5">Edit</button>
      <button onclick="openQuoteModal(null,'${d.id}')" class="text-xs px-3 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10">Buat Quotation</button>
      <button onclick="deleteDeal('${d.id}')" class="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10">Hapus</button>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 text-xs">
      <div class="bg-panelBg/60 border border-white/5 rounded-xl p-3"><p class="text-textMuted text-[10px] mb-1">Nilai</p><p class="font-mono font-bold text-cyan-400">${money(d.value)}</p></div>
      <div class="bg-panelBg/60 border border-white/5 rounded-xl p-3"><p class="text-textMuted text-[10px] mb-1">Probabilitas</p><p class="font-mono font-bold text-emerald-400">${d.probability}%</p></div>
      <div class="bg-panelBg/60 border border-white/5 rounded-xl p-3"><p class="text-textMuted text-[10px] mb-1">Owner</p><p class="text-slate-300">👤 ${esc(ownerName(d.ownerId))}</p></div>
      <div class="bg-panelBg/60 border border-white/5 rounded-xl p-3"><p class="text-textMuted text-[10px] mb-1">Item Produk</p><p class="text-slate-300">${(d.items||[]).length} item</p></div>
    </div>
    ${d.stage==='Lost' && d.lossReason ? `<div class="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-300 mb-3">Alasan kalah: ${esc(d.lossReason)}</div>` : ''}
    <div class="flex flex-wrap gap-1.5 mb-5">
      ${STAGES.map(s=>`<button onclick="updateDealStage('${d.id}','${s}'); openDealDetail('${d.id}')" class="text-[10px] font-semibold px-2.5 py-1 rounded-full border ${s===d.stage?'text-textMain':'text-textMuted'}" style="border-color:${STAGE_COLOR[s]}55; ${s===d.stage?`background:${STAGE_COLOR[s]}33;`:''}">${s}</button>`).join('')}
    </div>
    <h4 class="text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">Notes</h4>
    <form onsubmit="return addNote(event,'deal','${d.id}')" class="flex gap-2 mb-3">
      <input name="text" required placeholder="Tulis catatan..." class="field-input rounded-xl px-3 py-2 text-xs flex-1">
      <button class="text-xs font-semibold px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white">Tambah</button>
    </form>
    <div class="space-y-2.5">
      ${notes.map(n=>`<div class="bg-panelBg/60 border border-white/5 rounded-xl p-3 text-xs"><p class="text-slate-300">${esc(n.text)}</p><p class="text-[10px] text-textMuted mt-1">${timeAgo(n.at)}</p></div>`).join('') || '<p class="text-xs text-textMuted">Belum ada catatan.</p>'}
    </div>
  `);
}

/* ---- Task: modal ---- */
function openTaskModal(id, prefillDate){
  const t = id ? state.tasks.find(x=>x.id===id) : null;
  const contactOptions = state.contacts.map(c=>`<option value="${c.id}" ${t&&t.contactId===c.id?'selected':''}>${esc(c.name)}</option>`).join('');
  const dueVal = t ? t.due.slice(0,10) : (prefillDate || '');
  openModal(`
    <h3 class="text-sm font-bold text-white mb-4">${t?'Edit Tugas':'Tambah Tugas'}</h3>
    <form id="task-form" class="space-y-3 text-sm">
      <input type="hidden" name="id" value="${t?t.id:''}">
      <div><label class="text-xs text-textMuted block mb-1">Judul Tugas</label><input name="title" required class="field-input rounded-xl px-3 py-2 w-full" value="${t?esc(t.title):''}"></div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label class="text-xs text-textMuted block mb-1">Jatuh Tempo</label><input type="date" name="due" class="field-input rounded-xl px-3 py-2 w-full" value="${dueVal}"></div>
        <div><label class="text-xs text-textMuted block mb-1">Prioritas</label>
          <select name="priority" class="field-input rounded-xl px-3 py-2 w-full">
            <option value="high" ${t&&t.priority==='high'?'selected':''}>Tinggi</option>
            <option value="medium" ${(!t)||t.priority==='medium'?'selected':''}>Sedang</option>
            <option value="low" ${t&&t.priority==='low'?'selected':''}>Rendah</option>
          </select>
        </div>
      </div>
      <div><label class="text-xs text-textMuted block mb-1">Kontak Terkait</label>
        <select name="contactId" class="field-input rounded-xl px-3 py-2 w-full"><option value="">— Tidak ada —</option>${contactOptions}</select>
      </div>
      <div class="flex justify-between items-center pt-2">
        ${t?`<button type="button" onclick="deleteTask('${t.id}')" class="text-xs text-red-400 hover:underline">Hapus tugas</button>`:'<span></span>'}
        <div class="flex gap-2">
          <button type="button" onclick="closeModal()" class="text-xs px-4 py-2 rounded-xl border border-panelBorder text-slate-300">Batal</button>
          <button type="submit" class="text-xs font-semibold px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white">Simpan</button>
        </div>
      </div>
    </form>
  `);
  document.getElementById('task-form').addEventListener('submit', saveTask);
}
async function saveTask(e){
  e.preventDefault();
  const f = new FormData(e.target);
  const id = f.get('id');
  const due = f.get('due') ? new Date(f.get('due')).toISOString() : new Date().toISOString();
  const data = { title:f.get('title').trim(), due, priority:f.get('priority'), contactId:f.get('contactId')||null };
  if (!data.title) return;
  if (id){ Object.assign(state.tasks.find(x=>x.id===id), data); logActivity(`Tugas "${data.title}" diperbarui`, {contactId:data.contactId}); toast('Tugas diperbarui'); }
  else { state.tasks.unshift({ id: uid(), ...data, done:false }); logActivity(`Tugas baru "${data.title}" ditambahkan`, {contactId:data.contactId}); toast('Tugas ditambahkan'); }
  await persist('tasks'); closeModal(); renderAll();
}
async function deleteTask(id){
  const t = state.tasks.find(x=>x.id===id);
  state.tasks = state.tasks.filter(x=>x.id!==id);
  logActivity(`Tugas "${t?t.title:''}" dihapus`);
  await persist('tasks'); closeModal(); renderAll(); toast('Tugas dihapus', 'err');
}
async function toggleTask(id){
  const t = state.tasks.find(x=>x.id===id);
  t.done = !t.done;
  logActivity(`Tugas "${t.title}" ditandai ${t.done?'selesai':'belum selesai'}`);
  await persist('tasks'); renderAll();
}

/* ---------- RENDER: CONTACTS ---------- */
function renderTagFilterRow(){
  const allTags = [...new Set(state.contacts.flatMap(c=>c.tags||[]))];
  const row = document.getElementById('tag-filter-row');
  row.innerHTML = allTags.map(t=>`<button onclick="toggleTagFilter('${esc(t)}')" class="tag-chip ${tagFilter===t?'filter-active':''}">${esc(t)}</button>`).join('');
}
function toggleTagFilter(tag){ tagFilter = tagFilter===tag ? null : tag; renderContacts(); }
function renderContacts(){
  const q = (document.getElementById('contacts-search').value||'').toLowerCase();
  const ownerFilter = document.getElementById('contacts-owner-filter').value;
  const list = state.contacts.filter(c=>{
    const matchesQ = !q || c.name.toLowerCase().includes(q) || contactCompanyName(c).toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q);
    const matchesTag = !tagFilter || (c.tags||[]).includes(tagFilter);
    const matchesOwner = !ownerFilter || c.ownerId===ownerFilter;
    return matchesQ && matchesTag && matchesOwner;
  });
  renderTagFilterRow();
  const grid = document.getElementById('contacts-grid');
  document.getElementById('contacts-empty').classList.toggle('hidden', state.contacts.length>0);
  grid.innerHTML = list.map(c=>{
    const score = leadScore(c);
    return `
    <div class="glass-card glass-card-hover rounded-2xl p-4 cursor-pointer" onclick="openContactDetail('${c.id}')">
      <div class="flex justify-between items-start mb-2">
        <div>
          <p class="font-bold text-white text-sm">${esc(c.name)}</p>
          <p class="text-xs text-textMuted">${esc(contactCompanyName(c))}</p>
        </div>
        <div class="flex flex-col items-end gap-1">
          <span class="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${c.status==='customer'?'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20':'bg-purple-500/10 text-purple-400 border border-purple-500/20'}">${c.status}</span>
          <span class="text-[9px] font-bold px-2 py-0.5 rounded-full border ${scoreColor(score)}">Skor ${score}</span>
        </div>
      </div>
      <div class="text-[11px] text-slate-400 space-y-0.5 mb-2">
        <p>${esc(c.email)||'—'}</p>
        <p>${esc(c.phone)||'—'}</p>
      </div>
      <div class="flex items-center justify-between">
        <div class="flex flex-wrap gap-1">${(c.tags||[]).slice(0,3).map(t=>`<span class="tag-chip">${esc(t)}</span>`).join('')}</div>
        <span class="text-[10px] text-textMuted">👤 ${esc(ownerName(c.ownerId))}</span>
      </div>
    </div>`;
  }).join('');
}

/* ---------- RENDER: COMPANIES ---------- */
function renderCompanies(){
  const q = (document.getElementById('companies-search').value||'').toLowerCase();
  const list = state.companies.filter(co=> !q || co.name.toLowerCase().includes(q));
  document.getElementById('companies-empty').classList.toggle('hidden', state.companies.length>0);
  document.getElementById('companies-grid').innerHTML = list.map(co=>{
    const contactsCount = state.contacts.filter(c=>c.companyId===co.id).length;
    const total = dealsForCompany(co.id).reduce((s,d)=>s+d.value,0);
    return `<div class="glass-card glass-card-hover rounded-2xl p-4 cursor-pointer" onclick="openCompanyDetail('${co.id}')">
      <p class="font-bold text-white text-sm mb-1">${esc(co.name)}</p>
      <p class="text-xs text-textMuted mb-3">${esc(co.industry)||'—'} • ${esc(co.address)||'—'}</p>
      <div class="flex justify-between text-[11px]">
        <span class="text-slate-400">${contactsCount} kontak</span>
        <span class="font-mono text-cyan-400 font-bold">${money(total)}</span>
      </div>
    </div>`;
  }).join('');
}

/* ---------- RENDER: DEALS KANBAN ---------- */
function renderDeals(){
  const q = (document.getElementById('deals-search').value||'').toLowerCase();
  const ownerFilter = document.getElementById('deals-owner-filter').value;
  const board = document.getElementById('kanban-board');
  board.innerHTML = STAGES.map(stage=>{
    const deals = state.deals.filter(d=>d.stage===stage && (!q || d.title.toLowerCase().includes(q)) && (!ownerFilter || d.ownerId===ownerFilter));
    const total = deals.reduce((s,d)=>s+d.value,0);
    return `
    <div class="kanban-col glass-card rounded-2xl p-3 flex flex-col min-h-[200px]" data-stage="${stage}"
         ondragover="event.preventDefault(); this.classList.add('drag-over')"
         ondragleave="this.classList.remove('drag-over')"
         ondrop="handleDrop(event,'${stage}')">
      <div class="flex justify-between items-center mb-3 px-1">
        <span class="text-[11px] font-bold uppercase tracking-wider" style="color:${STAGE_COLOR[stage]}">${stage}</span>
        <span class="text-[10px] text-textMuted">${deals.length}</span>
      </div>
      <div class="space-y-2 flex-1">
        ${deals.map(d=>{
          const contact = getContact(d.contactId);
          return `<div class="kanban-card bg-slate-900/50 border border-white/5 rounded-xl p-3 text-xs hover:border-purple-500/30"
                draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${d.id}')" onclick="openDealDetail('${d.id}')">
            <p class="font-semibold text-white mb-1">${esc(d.title)}</p>
            <p class="text-textMuted text-[10px] mb-2">${contact?esc(contact.name):'Tanpa kontak'}</p>
            <div class="flex justify-between items-center mb-1.5">
              <span class="font-mono font-bold text-cyan-400">${money(d.value)}</span>
              <span class="text-[10px] text-emerald-400">${d.probability}%</span>
            </div>
            <p class="text-[9px] text-textMuted">👤 ${esc(ownerName(d.ownerId))}</p>
          </div>`;
        }).join('') || '<p class="text-[10px] text-textMuted text-center py-6">Kosong</p>'}
      </div>
      <p class="text-[10px] text-textMuted mt-2 pt-2 border-t border-white/5">Total: <span class="font-mono">${money(total)}</span></p>
    </div>`;
  }).join('');
}
function handleDrop(e, stage){
  e.preventDefault(); e.currentTarget.classList.remove('drag-over');
  updateDealStage(e.dataTransfer.getData('text/plain'), stage);
}

/* ---------- RENDER: TASKS ---------- */
function renderTasks(){
  const sorted = [...state.tasks].sort((a,b)=> a.done-b.done || new Date(a.due)-new Date(b.due));
  document.getElementById('tasks-empty').classList.toggle('hidden', state.tasks.length>0);
  const prColor = { high:'bg-pink-500/10 text-pink-400 border-pink-500/20', medium:'bg-cyan-500/10 text-cyan-400 border-cyan-500/20', low:'bg-slate-500/10 text-slate-400 border-slate-500/20' };
  document.getElementById('tasks-list').innerHTML = sorted.map(t=>{
    const contact = getContact(t.contactId);
    const overdue = !t.done && new Date(t.due) < new Date(new Date().toDateString());
    return `<div class="glass-card glass-card-hover rounded-2xl p-4 flex items-center gap-3 ${t.done?'opacity-50':''}">
      <input type="checkbox" class="task-check w-4 h-4" ${t.done?'checked':''} onchange="toggleTask('${t.id}')">
      <div class="flex-1 cursor-pointer" onclick="openTaskModal('${t.id}')">
        <p class="text-sm font-medium text-white ${t.done?'line-through':''}">${esc(t.title)}</p>
        <p class="text-[11px] ${overdue?'text-red-400':'text-textMuted'}">${contact?esc(contact.name)+' • ':''}${overdue?'Terlambat • ':''}Jatuh tempo ${new Date(t.due).toLocaleDateString('id-ID',{day:'2-digit',month:'short'})}</p>
      </div>
      <span class="text-[9px] font-bold uppercase px-2 py-1 rounded-full border ${prColor[t.priority]}">${t.priority}</span>
    </div>`;
  }).join('');
}

/* ---------- RENDER: CALENDAR ---------- */
function changeMonth(delta, reset){
  if (reset){ const n=new Date(); calState={year:n.getFullYear(), month:n.getMonth()}; }
  else { calState.month += delta; if(calState.month<0){calState.month=11; calState.year--;} if(calState.month>11){calState.month=0; calState.year++;} }
  renderCalendar();
}
function renderCalendar(){
  const label = new Date(calState.year, calState.month, 1).toLocaleDateString('id-ID',{month:'long', year:'numeric'});
  document.getElementById('calendar-label').textContent = label;
  const firstDay = new Date(calState.year, calState.month, 1).getDay();
  const daysInMonth = new Date(calState.year, calState.month+1, 0).getDate();
  const todayStr = new Date().toDateString();
  const prColor = { high:'bg-pink-500/80', medium:'bg-cyan-500/80', low:'bg-slate-500/80' };
  let cells = '';
  for (let i=0;i<firstDay;i++) cells += `<div></div>`;
  for (let day=1; day<=daysInMonth; day++){
    const dateObj = new Date(calState.year, calState.month, day);
    const dateStr = dateObj.toISOString().slice(0,10);
    const isToday = dateObj.toDateString()===todayStr;
    const dayTasks = state.tasks.filter(t=> t.due.slice(0,10)===dateStr);
    cells += `<div onclick="openTaskModal(null,'${dateStr}')" class="glass-card rounded-xl p-2 min-h-[84px] cursor-pointer hover:border-purple-500/30 ${isToday?'border-purple-500/50':''}">
      <p class="text-[10px] font-bold ${isToday?'text-purple-400':'text-slate-400'} mb-1">${day}</p>
      <div class="space-y-1">
        ${dayTasks.slice(0,3).map(t=>`<div onclick="event.stopPropagation(); openTaskModal('${t.id}')" class="text-[9px] text-white ${prColor[t.priority]} rounded px-1.5 py-0.5 truncate ${t.done?'opacity-40 line-through':''}">${esc(t.title)}</div>`).join('')}
        ${dayTasks.length>3 ? `<p class="text-[9px] text-textMuted">+${dayTasks.length-3} lagi</p>` : ''}
      </div>
    </div>`;
  }
  document.getElementById('calendar-grid').innerHTML = cells;
}

/* ---------- RENDER: REPORTS ---------- */
function renderReports(){
  const openDeals = state.deals.filter(d=>d.stage!=='Won'&&d.stage!=='Lost');
  const forecast = openDeals.reduce((s,d)=>s+ d.value*(d.probability/100), 0);
  document.getElementById('report-forecast').textContent = money(forecast);
  const wonTotal = state.deals.filter(d=>d.stage==='Won').reduce((s,d)=>s+d.value,0);
  document.getElementById('report-won-total').textContent = money(wonTotal);
  const avgDeal = state.deals.length ? state.deals.reduce((s,d)=>s+d.value,0)/state.deals.length : 0;
  document.getElementById('report-avg-deal').textContent = money(avgDeal);

  const ctxFunnel = document.getElementById('funnelChart').getContext('2d');
  if (charts.funnel) charts.funnel.destroy();
  charts.funnel = new Chart(ctxFunnel, {
    type:'bar',
    data:{ labels: STAGES, datasets:[{ data: STAGES.map(s=>state.deals.filter(d=>d.stage===s).length), backgroundColor: STAGES.map(s=>STAGE_COLOR[s]), borderRadius:8 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{ticks:{color:'#64748b',font:{size:10}}, grid:{display:false}}, y:{ticks:{color:'#64748b',font:{size:10}}, grid:{color:'rgba(255,255,255,0.05)'}} } }
  });

  const months = [];
  const now = new Date();
  for (let i=5;i>=0;i--){ const d = new Date(now.getFullYear(), now.getMonth()-i, 1); months.push({label: d.toLocaleDateString('id-ID',{month:'short'}), y:d.getFullYear(), m:d.getMonth()}); }
  const revData = months.map(mo => state.deals.filter(d=>{ if(d.stage!=='Won') return false; const cd=new Date(d.createdAt); return cd.getFullYear()===mo.y && cd.getMonth()===mo.m; }).reduce((s,d)=>s+d.value,0));
  const ctxRev = document.getElementById('revenueChart').getContext('2d');
  if (charts.revenue) charts.revenue.destroy();
  charts.revenue = new Chart(ctxRev, {
    type:'line',
    data:{ labels: months.map(m=>m.label), datasets:[{ data: revData, borderColor:'#10b981', backgroundColor:'rgba(16,185,129,0.15)', fill:true, tension:0.35, pointRadius:3 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{ticks:{color:'#64748b',font:{size:10}}, grid:{display:false}}, y:{ticks:{color:'#64748b',font:{size:9}}, grid:{color:'rgba(255,255,255,0.05)'}} } }
  });

  const companyTotals = state.companies.map(co=>({ co, total: dealsForCompany(co.id).reduce((s,d)=>s+d.value,0) })).filter(x=>x.total>0).sort((a,b)=>b.total-a.total).slice(0,5);
  document.getElementById('top-companies-list').innerHTML = companyTotals.map((x,i)=>`
    <div class="flex items-center gap-3 bg-panelBg/60 border border-white/5 rounded-xl p-3 cursor-pointer hover:border-purple-500/30" onclick="openCompanyDetail('${x.co.id}')">
      <span class="text-textMuted font-mono w-5">${i+1}</span>
      <span class="flex-1 text-slate-200 font-medium">${esc(x.co.name)}</span>
      <span class="font-mono text-cyan-400 font-bold">${money(x.total)}</span>
    </div>`).join('') || '<p class="text-textMuted">Belum ada data cukup untuk peringkat perusahaan.</p>';

  const owners = [{id:'me', name: state.profile.name}, ...state.team];
  const leaderboard = owners.map(o=>{
    const ownedWon = state.deals.filter(d=>d.stage==='Won' && d.ownerId===o.id);
    return { name:o.name, total: ownedWon.reduce((s,d)=>s+d.value,0), count: ownedWon.length };
  }).sort((a,b)=>b.total-a.total);
  document.getElementById('leaderboard-list').innerHTML = leaderboard.map((x,i)=>`
    <div class="flex items-center gap-3 bg-panelBg/60 border border-white/5 rounded-xl p-3">
      <span class="text-textMuted font-mono w-5">${i+1}</span>
      <span class="flex-1 text-slate-200 font-medium">${esc(x.name)}</span>
      <span class="text-[10px] text-textMuted">${x.count} deal</span>
      <span class="font-mono text-emerald-400 font-bold">${money(x.total)}</span>
    </div>`).join('') || '<p class="text-textMuted">Belum ada data.</p>';

  const lostDeals = state.deals.filter(d=>d.stage==='Lost');
  const reasonMap = {};
  lostDeals.forEach(d=>{ const r = d.lossReason || 'Tidak disebutkan'; reasonMap[r] = (reasonMap[r]||0)+1; });
  const reasonList = Object.entries(reasonMap).sort((a,b)=>b[1]-a[1]);
  document.getElementById('lost-reasons-list').innerHTML = reasonList.map(([reason,count])=>`
    <div class="flex items-center gap-3 bg-panelBg/60 border border-white/5 rounded-xl p-3">
      <span class="flex-1 text-slate-200">${esc(reason)}</span>
      <span class="font-mono text-red-400 font-bold">${count} deal</span>
    </div>`).join('') || '<p class="text-textMuted">Belum ada deal yang kalah. 🎉</p>';
}

/* ---------- RENDER: DASHBOARD ---------- */
function renderDashboardStats(){
  document.getElementById('stat-contacts').textContent = state.contacts.length;
  const pipelineValue = state.deals.filter(d=>d.stage!=='Lost').reduce((s,d)=>s+d.value,0);
  document.getElementById('stat-pipeline').textContent = money(pipelineValue);
  const closed = state.deals.filter(d=>d.stage==='Won'||d.stage==='Lost');
  const won = state.deals.filter(d=>d.stage==='Won');
  document.getElementById('stat-winrate').textContent = (closed.length ? Math.round((won.length/closed.length)*100) : 0) + '%';
  document.getElementById('stat-tasks').textContent = state.tasks.filter(t=>!t.done).length;

  const now = new Date();
  const wonThisMonth = state.deals.filter(d=>{ if(d.stage!=='Won') return false; const cd=new Date(d.createdAt); return cd.getFullYear()===now.getFullYear() && cd.getMonth()===now.getMonth(); }).reduce((s,d)=>s+d.value,0);
  const target = state.settings.monthlyTarget || 0;
  const pct = target>0 ? Math.min(100, Math.round((wonThisMonth/target)*100)) : 0;
  document.getElementById('target-caption').textContent = `${money(wonThisMonth)} / ${money(target)} (${pct}%)`;
  document.getElementById('target-bar').style.width = pct+'%';

  const open = state.tasks.filter(t=>!t.done).sort((a,b)=>new Date(a.due)-new Date(b.due)).slice(0,3);
  const dotColor = { high:'bg-pink-400', medium:'bg-cyan-400', low:'bg-purple-400' };
  document.getElementById('dash-priority-tasks').innerHTML = open.length ? open.map(t=>`
    <div class="flex items-center gap-2.5"><span class="w-2 h-2 rounded-full ${dotColor[t.priority]}"></span><p class="text-slate-400">${esc(t.title)}</p></div>`).join('') : '<p class="text-textMuted">Tidak ada tugas mendesak 🎉</p>';

  document.getElementById('dash-recent-activity').innerHTML = state.activities.slice(0,5).map(a=>`
    <div class="flex items-start gap-3"><span class="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 flex-shrink-0"></span><div><p class="text-slate-300">${esc(a.text)}</p><p class="text-[10px] text-slate-500">${timeAgo(a.at)}</p></div></div>`).join('') || '<p class="text-textMuted">Belum ada aktivitas</p>';

  const openDeals = state.deals.filter(d=>d.stage!=='Won'&&d.stage!=='Lost').sort((a,b)=>b.probability-a.probability);
  const top = openDeals[0];
  const card = document.getElementById('ai-recommendation-card');
  if (top){
    const contact = getContact(top.contactId);
    card.innerHTML = `
      <div class="flex items-center gap-2.5 mb-4">
        <div class="w-7 h-7 rounded-lg bg-purple-500/20 border border-purple-400/30 flex items-center justify-center">
          <svg class="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM5.879 4.879a1 1 0 00-1.414 1.414l.707.707a1 1 0 001.414-1.414l-.707-.707zM16.5 8a1 1 0 100-2 2.25 2.25 0 01-2.25-2.25 1 1 0 10-2 0A2.25 2.25 0 1010 1.5 1 1 0 1010 3.5 2.25 2.25 0 0112.25 5.75 1 1 0 1014.25 5.75 2.25 2.25 0 0116.5 8zM3 10a1 1 0 011-1h1a1 1 0 110 2H4a1 1 0 01-1-1zM10 14a4 4 0 100-8 4 4 0 000 8zm0 2a6 6 0 110-12 6 6 0 010 12z"></path></svg>
        </div>
        <h2 class="text-xs font-bold text-white uppercase tracking-wider">AI-Driven Personalization</h2>
      </div>
      <div class="bg-panelBg/80 border border-white/10 rounded-2xl p-4 space-y-3 cursor-pointer" onclick="openDealDetail('${top.id}')">
        <div class="flex justify-between items-start">
          <div>
            <p class="text-[9px] text-purple-400 font-bold uppercase tracking-wider mb-1">AI Smart Recommendation</p>
            <h3 class="text-xl font-extrabold text-white tracking-tight">${esc(contact?contactCompanyName(contact):top.title)}</h3>
          </div>
          <span class="text-xs font-extrabold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">${top.probability}% PROBABILITY</span>
        </div>
        <div class="w-full bg-slate-800/80 h-2 rounded-full overflow-hidden p-0.5 border border-white/5"><div class="bg-gradient-to-r from-cyan-400 via-purple-400 to-emerald-400 h-full rounded-full" style="width:${top.probability}%"></div></div>
        <div class="pt-3 border-t border-white/5 space-y-1.5">
          <p class="text-xs font-bold text-slate-200">Insights</p>
          <ul class="text-[11px] text-slate-400 list-disc pl-4 space-y-1 leading-relaxed">
            <li>Deal "${esc(top.title)}" bernilai ${money(top.value)} pada stage ${top.stage}.</li>
            <li>Prioritaskan follow-up minggu ini untuk menaikkan peluang closing.</li>
          </ul>
        </div>
      </div>`;
  } else {
    card.innerHTML = `<div class="text-center py-6"><p class="text-xs text-textMuted">Belum ada deal aktif untuk direkomendasikan AI. Tambahkan deal baru di menu Deals.</p></div>`;
  }
}

function updateCharts(){
  const stageVals = STAGES.map(s => state.deals.filter(d=>d.stage===s).reduce((sum,d)=>sum+d.value,0));
  const ctxBar = document.getElementById('pipelineBarChart').getContext('2d');
  if (charts.bar) charts.bar.destroy();
  charts.bar = new Chart(ctxBar, { type:'bar', data:{ labels: STAGES, datasets:[{ data: stageVals, backgroundColor:['#38bdf8','#818cf8','#c084fc','#10b981','#f87171'], borderRadius:6, barThickness:8 }] },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{display:false}, y:{ ticks:{color:'#64748b', font:{size:10,family:'Plus Jakarta Sans'}}, grid:{display:false} } } } });

  const months = [];
  const now = new Date();
  for (let i=4;i>=0;i--){ const d = new Date(now.getFullYear(), now.getMonth()-i, 1); months.push({ label: d.toLocaleDateString('id-ID',{month:'short'}), y:d.getFullYear(), m:d.getMonth() }); }
  const counts = months.map(mo => state.deals.filter(d=>{ const cd = new Date(d.createdAt); return cd.getFullYear()===mo.y && cd.getMonth()===mo.m; }).length);
  const ctxVert = document.getElementById('pipelineVerticalChart').getContext('2d');
  if (charts.vert) charts.vert.destroy();
  charts.vert = new Chart(ctxVert, { type:'bar', data:{ labels: months.map(m=>m.label), datasets:[{ data: counts, backgroundColor:'#06b6d4', borderRadius:6, barThickness:12 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{ ticks:{color:'#64748b', font:{size:10,family:'Plus Jakarta Sans'}}, grid:{display:false} }, y:{display:false} } } });

  const avgProbability = state.deals.length ? Math.round(state.deals.reduce((s,d)=>s+d.probability,0)/state.deals.length) : 0;
  const activityScore = Math.min(100, state.activities.length * 4);
  const closed = state.deals.filter(d=>d.stage==='Won'||d.stage==='Lost');
  const won = state.deals.filter(d=>d.stage==='Won');
  const winRateScore = closed.length ? Math.round((won.length/closed.length)*100) : 50;
  const avgDealValue = state.deals.length ? state.deals.reduce((s,d)=>s+d.value,0)/state.deals.length : 0;
  const dealSizeScore = Math.min(100, Math.round((avgDealValue/300000000)*100));
  const doneTasks = state.tasks.filter(t=>t.done).length;
  const taskScore = state.tasks.length ? Math.round((doneTasks/state.tasks.length)*100) : 50;
  const custRatio = state.contacts.length ? Math.round((state.contacts.filter(c=>c.status==='customer').length/state.contacts.length)*100) : 0;

  const ctxRadar = document.getElementById('mainRadarChart').getContext('2d');
  const fillGradient = ctxRadar.createRadialGradient(180,180,10,180,180,160);
  fillGradient.addColorStop(0,'rgba(6,182,212,0.45)'); fillGradient.addColorStop(0.5,'rgba(168,85,247,0.35)'); fillGradient.addColorStop(1,'rgba(236,72,153,0.15)');
  if (charts.radar) charts.radar.destroy();
  charts.radar = new Chart(ctxRadar, { type:'radar',
    data:{ labels:[['Lead Score','(Avg Probabilitas)'],['Interaction','(Aktivitas)'],['Win Rate',''],['Deal Size','(Rata-rata Nilai)'],['Task Completion',''],['Customer Ratio','']],
      datasets:[{ data:[avgProbability, activityScore, winRateScore, dealSizeScore, taskScore, custRatio], backgroundColor:fillGradient, borderColor:'#38bdf8', borderWidth:2, pointBackgroundColor:['#06b6d4','#f97316','#ec4899','#a855f7','#10b981','#38bdf8'], pointBorderColor:'#ffffff', pointBorderWidth:2, pointRadius:5 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ r:{ angleLines:{color:'rgba(168,85,247,0.25)'}, grid:{color:'rgba(255,255,255,0.06)'}, pointLabels:{color:'#cbd5e1', font:{size:10,weight:'600',family:'Plus Jakarta Sans'}}, ticks:{display:false,max:100} } } } });
}

/* ---------- NOTIFICATIONS ---------- */
function toggleNotif(){ document.getElementById('notif-wrap').classList.toggle('open'); }
function renderNotifications(){
  const today = new Date(new Date().toDateString());
  const due = state.tasks.filter(t=>!t.done && new Date(t.due) <= new Date(today.getTime()+86400000-1)).sort((a,b)=>new Date(a.due)-new Date(b.due));
  const badge = document.getElementById('notif-badge');
  if (due.length){ badge.textContent = due.length; badge.classList.remove('hidden'); } else { badge.classList.add('hidden'); }
  document.getElementById('notif-list').innerHTML = due.length ? due.map(t=>{
    const overdue = new Date(t.due) < today;
    return `<div class="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-white/5 cursor-pointer" onclick="openTaskModal('${t.id}')">
      <div><p class="text-xs text-slate-200">${esc(t.title)}</p><p class="text-[10px] ${overdue?'text-red-400':'text-cyan-400'}">${overdue?'Terlambat':'Jatuh tempo hari ini'}</p></div>
    </div>`;
  }).join('') : '<p class="text-xs text-textMuted p-2">Tidak ada pengingat mendesak.</p>';
}
document.addEventListener('click', (e)=>{
  const wrap = document.getElementById('notif-wrap');
  if (wrap && !wrap.contains(e.target)) wrap.classList.remove('open');
});

/* ---------- GLOBAL SEARCH ---------- */
document.getElementById('global-search').addEventListener('input', (e)=>{
  const q = e.target.value.trim().toLowerCase();
  const wrap = document.getElementById('search-wrap');
  if (!q){ wrap.classList.remove('open'); return; }
  const contacts = state.contacts.filter(c=>c.name.toLowerCase().includes(q)).slice(0,4);
  const companies = state.companies.filter(c=>c.name.toLowerCase().includes(q)).slice(0,4);
  const deals = state.deals.filter(d=>d.title.toLowerCase().includes(q)).slice(0,4);
  const tasks = state.tasks.filter(t=>t.title.toLowerCase().includes(q)).slice(0,4);
  const products = state.products.filter(p=>p.name.toLowerCase().includes(q)).slice(0,4);
  const quotes = state.quotes.filter(qt=>qt.number.toLowerCase().includes(q)).slice(0,4);
  const results = document.getElementById('search-results');
  function section(label, items, renderFn){ return items.length ? `<p class="text-[9px] uppercase font-bold text-textMuted px-2 pt-2 pb-1">${label}</p>${items.map(renderFn).join('')}` : ''; }
  results.innerHTML =
    section('Kontak', contacts, c=>`<div class="px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer text-xs text-slate-200" onclick="switchView('contacts'); openContactDetail('${c.id}'); closeSearch()">${esc(c.name)}</div>`) +
    section('Perusahaan', companies, c=>`<div class="px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer text-xs text-slate-200" onclick="switchView('companies'); openCompanyDetail('${c.id}'); closeSearch()">${esc(c.name)}</div>`) +
    section('Deal', deals, d=>`<div class="px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer text-xs text-slate-200" onclick="switchView('deals'); openDealDetail('${d.id}'); closeSearch()">${esc(d.title)}</div>`) +
    section('Tugas', tasks, t=>`<div class="px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer text-xs text-slate-200" onclick="switchView('tasks'); openTaskModal('${t.id}'); closeSearch()">${esc(t.title)}</div>`) +
    section('Produk', products, p=>`<div class="px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer text-xs text-slate-200" onclick="switchView('products'); closeSearch()">${esc(p.name)}</div>`) +
    section('Quotation', quotes, qt=>`<div class="px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer text-xs text-slate-200" onclick="switchView('quotes'); openQuoteDetail('${qt.id}'); closeSearch()">${esc(qt.number)}</div>`)
    || '<p class="text-xs text-textMuted p-2">Tidak ditemukan.</p>';
  wrap.classList.add('open');
});
function closeSearch(){ document.getElementById('search-wrap').classList.remove('open'); document.getElementById('global-search').value=''; }
document.addEventListener('click', (e)=>{
  const wrap = document.getElementById('search-wrap');
  if (wrap && !wrap.contains(e.target)) wrap.classList.remove('open');
});

/* ---------- CSV EXPORT ---------- */
function toCSV(rows, headers){
  const esc2 = v => `"${String(v??'').replace(/"/g,'""')}"`;
  return [headers.join(','), ...rows.map(r=>headers.map(h=>esc2(r[h])).join(','))].join('\n');
}
function downloadCSV(filename, csv){
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function exportContactsCSV(){
  const rows = state.contacts.map(c=>({ Nama:c.name, Perusahaan:contactCompanyName(c), Email:c.email, Telepon:c.phone, Status:c.status, Owner: ownerName(c.ownerId), Tag:(c.tags||[]).join('; ') }));
  downloadCSV('contacts.csv', toCSV(rows, ['Nama','Perusahaan','Email','Telepon','Status','Owner','Tag']));
  toast('Kontak diekspor ke CSV');
}
function exportDealsCSV(){
  const rows = state.deals.map(d=>({ Deal:d.title, Kontak: getContact(d.contactId)?.name||'', Nilai:d.value, Probabilitas:d.probability+'%', Stage:d.stage, Owner: ownerName(d.ownerId), AlasanKalah: d.lossReason||'' }));
  downloadCSV('deals.csv', toCSV(rows, ['Deal','Kontak','Nilai','Probabilitas','Stage','Owner','AlasanKalah']));
  toast('Deal diekspor ke CSV');
}
function exportProductsCSV(){
  const rows = state.products.map(p=>({ Nama:p.name, Model:p.model||'', SKU:p.sku||'', Kategori:p.category||'', Satuan:p.unit||'', Harga:p.price, Deskripsi:p.description||'' }));
  downloadCSV('products.csv', toCSV(rows, ['Nama','Model','SKU','Kategori','Satuan','Harga','Deskripsi']));
  toast('Price book diekspor ke CSV');
}

/* ---------- PRODUCTS (Price Book) ---------- */
function renderProducts(){
  const q = (document.getElementById('products-search').value||'').toLowerCase();
  const list = state.products.filter(p=> !q || p.name.toLowerCase().includes(q) || (p.sku||'').toLowerCase().includes(q) || (p.model||'').toLowerCase().includes(q) || (p.category||'').toLowerCase().includes(q));
  document.getElementById('products-empty').classList.toggle('hidden', state.products.length>0);
  const groups = {};
  list.forEach(p=>{ const g = p.category || 'Tanpa Kategori'; (groups[g] = groups[g]||[]).push(p); });
  const groupNames = Object.keys(groups).sort();
  document.getElementById('products-grid').innerHTML = groupNames.map(g=>`
    <div class="md:col-span-2 xl:col-span-3 -mb-2 mt-2 first:mt-0">
      <p class="text-[10px] font-bold uppercase tracking-wider text-purple-400">${esc(g)}</p>
    </div>
    ${groups[g].map(p=>`
    <div class="glass-card glass-card-hover rounded-2xl p-4">
      <div class="flex justify-between items-start mb-2">
        <div><p class="font-bold text-white text-sm">${esc(p.name)}</p><p class="text-[10px] text-textMuted font-mono">${esc(p.model)||esc(p.sku)||'—'}</p></div>
        <span class="font-mono font-bold text-cyan-400 text-sm">${money(p.price)}</span>
      </div>
      <p class="text-xs text-slate-400 mb-3">${esc(p.description)||'—'}</p>
      <div class="flex justify-between items-center">
        <span class="text-[10px] text-textMuted">per ${esc(p.unit)||'Unit'}</span>
        <div class="flex gap-2">
          <button onclick="openProductModal('${p.id}')" class="text-[10px] px-2.5 py-1 rounded-lg border border-panelBorder text-slate-300 hover:bg-white/5">Edit</button>
          <button onclick="deleteProduct('${p.id}')" class="text-[10px] px-2.5 py-1 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10">Hapus</button>
        </div>
      </div>
    </div>`).join('')}
  `).join('');
}
function productCategoryOptions(selected){
  const cats = Array.from(new Set(state.products.map(p=>p.category).filter(Boolean)));
  if (!cats.length) cats.push('EQUIPMENT', 'JASA & ACCESSORIES');
  return cats.map(c=>`<option value="${esc(c)}" ${selected===c?'selected':''}>${esc(c)}</option>`).join('');
}
function openProductModal(id){
  const p = id ? state.products.find(x=>x.id===id) : null;
  openModal(`
    <h3 class="text-sm font-bold text-white mb-4">${p?'Edit Produk':'Tambah Produk / Layanan'}</h3>
    <form id="product-form" class="space-y-3 text-sm">
      <input type="hidden" name="id" value="${p?p.id:''}">
      <div><label class="text-xs text-textMuted block mb-1">Nama Produk / Layanan</label><input name="name" required class="field-input rounded-xl px-3 py-2 w-full" value="${p?esc(p.name):''}"></div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label class="text-xs text-textMuted block mb-1">Model / Kode</label><input name="model" placeholder="cth. GST104A" class="field-input rounded-xl px-3 py-2 w-full" value="${p?esc(p.model):''}"></div>
        <div><label class="text-xs text-textMuted block mb-1">SKU (internal)</label><input name="sku" class="field-input rounded-xl px-3 py-2 w-full" value="${p?esc(p.sku):''}"></div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label class="text-xs text-textMuted block mb-1">Kategori Grup Quotation</label>
          <input name="category" list="product-category-list" placeholder="cth. EQUIPMENT FIRE ALARM" class="field-input rounded-xl px-3 py-2 w-full" value="${p?esc(p.category):''}">
          <datalist id="product-category-list">${productCategoryOptions(p?p.category:'')}</datalist>
        </div>
        <div><label class="text-xs text-textMuted block mb-1">Satuan</label><input name="unit" placeholder="Unit / Lot / Set" class="field-input rounded-xl px-3 py-2 w-full" value="${p?esc(p.unit):'Unit'}"></div>
      </div>
      <div><label class="text-xs text-textMuted block mb-1">Harga (Rp)</label><input type="number" min="0" name="price" required class="field-input rounded-xl px-3 py-2 w-full" value="${p?p.price:0}"></div>
      <div><label class="text-xs text-textMuted block mb-1">Deskripsi</label><textarea name="description" rows="2" class="field-input rounded-xl px-3 py-2 w-full">${p?esc(p.description):''}</textarea></div>
      <div class="flex justify-between items-center pt-2">
        ${p?`<button type="button" onclick="deleteProduct('${p.id}')" class="text-xs text-red-400 hover:underline">Hapus produk</button>`:'<span></span>'}
        <div class="flex gap-2">
          <button type="button" onclick="closeModal()" class="text-xs px-4 py-2 rounded-xl border border-panelBorder text-slate-300">Batal</button>
          <button type="submit" class="text-xs font-semibold px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white">Simpan</button>
        </div>
      </div>
    </form>
  `);
  document.getElementById('product-form').addEventListener('submit', saveProduct);
}
async function saveProduct(e){
  e.preventDefault();
  const f = new FormData(e.target);
  const id = f.get('id');
  const data = { name:f.get('name').trim(), model:f.get('model').trim(), sku:f.get('sku').trim(), category:f.get('category').trim(), unit:f.get('unit').trim()||'Unit', price:Number(f.get('price'))||0, description:f.get('description').trim() };
  if (!data.name) return;
  if (id){ Object.assign(state.products.find(x=>x.id===id), data); toast('Produk diperbarui'); }
  else { state.products.unshift({ id:uid(), ...data }); toast('Produk ditambahkan'); }
  await persist('products'); closeModal(); renderProducts();
}
async function deleteProduct(id){
  if(!confirm('Hapus produk ini dari price book?')) return;
  state.products = state.products.filter(x=>x.id!==id);
  await persist('products'); closeModal(); renderProducts(); toast('Produk dihapus', 'err');
}

/* ---------- QUOTATIONS (multi-section, sesuai format quotation resmi) ---------- */
function blankQuoteSection(name){ return { name: name||'', discountPct: 0, items: [] }; }
function blankQuoteItem(){ return { model:'', description:'', qty:1, unit:'Unit', price:0 }; }
function sectionSubtotal(sec){ return (sec.items||[]).reduce((s,i)=> s + (Number(i.qty)||0)*(Number(i.price)||0), 0); }
function sectionDiscountAmount(sec){ return sectionSubtotal(sec) * ((Number(sec.discountPct)||0)/100); }
function sectionTotal(sec){ return sectionSubtotal(sec) - sectionDiscountAmount(sec); }
function quoteGrandTotal(q){ return (q.sections||[]).reduce((s,sec)=> s + sectionTotal(sec), 0); }
function quoteTotal(q){ return quoteGrandTotal(q); }

function renderQuotes(){
  document.getElementById('quotes-empty').classList.toggle('hidden', state.quotes.length>0);
  const sorted = [...state.quotes].sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));
  document.getElementById('quotes-list').innerHTML = sorted.map(q=>{
    const d = state.deals.find(x=>x.id===q.dealId);
    const contact = getContact(q.contactId);
    return `<div class="glass-card glass-card-hover rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 cursor-pointer" onclick="openQuoteDetail('${q.id}')">
      <div>
        <p class="font-bold text-white text-sm">${esc(q.number)} — ${esc(q.subject||(d?d.title:''))}</p>
        <p class="text-xs text-textMuted">${esc(q.toName || (contact?contact.name:'Tanpa penerima'))} • ${esc(q.projectName)||'—'} • Dibuat ${timeAgo(q.createdAt)}</p>
      </div>
      <div class="flex items-center gap-3">
        <span class="font-mono font-bold text-cyan-400">${money(quoteGrandTotal(q))}</span>
        <span class="text-[10px] font-bold px-2 py-1 rounded-full border" style="color:${QUOTE_STATUS_COLOR[q.status]};border-color:${QUOTE_STATUS_COLOR[q.status]}55">${q.status}</span>
      </div>
    </div>`;
  }).join('');
}

/* ---- Quote builder (draft state + dynamic sections/items) ---- */
let quoteDraft = null;
function nextQuoteNumber(){
  const n = new Date();
  return `QT/${(state.quotes.length+1).toString().padStart(3,'0')}/${n.getFullYear()}`;
}
function newQuoteDraftFromDeal(deal){
  const contact = deal ? getContact(deal.contactId) : null;
  const co = contact ? getCompany(contact.companyId) : null;
  const sections = [];
  if (deal && deal.items && deal.items.length){
    sections.push({ name:'A. PRODUK & LAYANAN', discountPct:0, items: deal.items.map(it=>({ model:'', description: it.name, qty: it.qty, unit:'Unit', price: it.price })) });
  } else {
    sections.push(blankQuoteSection('A. EQUIPMENT'));
  }
  return {
    number: nextQuoteNumber(),
    subject: deal ? deal.title : '',
    projectName: deal ? deal.title : '',
    yourRef: '',
    pages: '1 Lembar',
    date: new Date().toISOString().slice(0,10),
    dealId: deal ? deal.id : '',
    contactId: contact ? contact.id : '',
    toName: co ? co.name : (contact ? contact.name : ''),
    toAddress: co ? co.address : '',
    attnName: contact ? contact.name : '',
    attnPhone: contact ? contact.phone : '',
    attnFax: '',
    attnEmail: contact ? contact.email : '',
    sections,
    notesList: [
      'Harga belum termasuk PPn 11%',
      'Harga tidak termasuk material kabel & jasa penarikannya',
    ],
    terms: [
      '1 Year Warranty Repair and spare parts. Does not apply to damage caused by lightning, electrical voltage, floods, fires and other extraordinary events.',
      'Franco harga & Exclude PPn 11%',
      'Delivery Time : 2-8 weeks after received P.O. & Payment',
      'Payment : 100% Before delivery',
      'Quotation Validity : 14 days',
    ],
  };
}
function productPickerOptions(){
  return state.products.map(p=>`<option value="${p.id}">${esc(p.category?('['+p.category+'] '):'')}${esc(p.name)} — ${money(p.price)}</option>`).join('') || '<option value="">Belum ada produk di Price Book</option>';
}
function renderQuoteSectionsHTML(){
  return quoteDraft.sections.map((sec, sIdx)=>{
    const sub = sectionSubtotal(sec), disc = sectionDiscountAmount(sec), tot = sectionTotal(sec);
    return `
    <div class="border border-white/10 rounded-xl p-3 mb-3 bg-panelBg/40">
      <div class="flex gap-2 items-center mb-2">
        <input value="${esc(sec.name)}" oninput="updateSectionField(${sIdx},'name',this.value)" placeholder="Nama Section, contoh: A. EQUIPMENT FIRE ALARM" class="field-input flex-1 rounded-lg px-2 py-1.5 text-xs font-bold">
        <input type="number" min="0" max="100" value="${sec.discountPct}" oninput="updateSectionDiscount(${sIdx},this.value)" class="field-input w-16 rounded-lg px-2 py-1.5 text-xs" title="Diskon %">
        <span class="text-[10px] text-textMuted">% disc</span>
        <button type="button" onclick="removeQuoteSection(${sIdx})" class="text-[10px] text-red-400 hover:underline whitespace-nowrap">Hapus Section</button>
      </div>
      <div class="overflow-x-auto">
      <table class="w-full text-[11px] mb-2 border-collapse">
        <thead><tr class="text-textMuted text-left border-b border-white/10">
          <th class="py-1 pr-1 w-24">Model</th><th class="py-1 pr-1">Deskripsi</th><th class="py-1 pr-1 w-12">Qty</th><th class="py-1 pr-1 w-16">Satuan</th><th class="py-1 pr-1 w-28">Harga</th><th class="py-1 pr-1 w-28">Subtotal</th><th class="w-6"></th>
        </tr></thead>
        <tbody>
          ${(sec.items||[]).map((it,iIdx)=>`<tr class="border-b border-white/5">
            <td class="py-1 pr-1"><input value="${esc(it.model)}" oninput="updateItemField(${sIdx},${iIdx},'model',this.value)" class="field-input w-full rounded px-1.5 py-1 text-[11px]"></td>
            <td class="py-1 pr-1"><input value="${esc(it.description)}" oninput="updateItemField(${sIdx},${iIdx},'description',this.value)" class="field-input w-full rounded px-1.5 py-1 text-[11px]"></td>
            <td class="py-1 pr-1"><input type="number" min="0" value="${it.qty}" oninput="updateItemNumber(${sIdx},${iIdx},'qty',this.value)" class="field-input w-full rounded px-1.5 py-1 text-[11px]"></td>
            <td class="py-1 pr-1"><input value="${esc(it.unit)}" oninput="updateItemField(${sIdx},${iIdx},'unit',this.value)" class="field-input w-full rounded px-1.5 py-1 text-[11px]"></td>
            <td class="py-1 pr-1"><input type="number" min="0" value="${it.price}" oninput="updateItemNumber(${sIdx},${iIdx},'price',this.value)" class="field-input w-full rounded px-1.5 py-1 text-[11px]"></td>
            <td class="py-1 pr-1 font-mono text-cyan-400" id="qi-sub-${sIdx}-${iIdx}">${money((Number(it.qty)||0)*(Number(it.price)||0))}</td>
            <td class="py-1"><button type="button" onclick="removeQuoteItem(${sIdx},${iIdx})" class="text-red-400">✕</button></td>
          </tr>`).join('') || `<tr><td colspan="7" class="text-textMuted py-2">Belum ada item di section ini.</td></tr>`}
        </tbody>
      </table>
      </div>
      <div class="flex flex-wrap gap-2 mb-2">
        <select id="qpick-${sIdx}" class="field-input text-[11px] rounded px-2 py-1.5 flex-1 min-w-[160px]">${productPickerOptions()}</select>
        <button type="button" onclick="addQuoteItemFromProduct(${sIdx})" class="text-[10px] px-2.5 py-1.5 rounded-lg border border-panelBorder text-slate-300 hover:bg-white/5">+ dari Price Book</button>
        <button type="button" onclick="addQuoteItemBlank(${sIdx})" class="text-[10px] px-2.5 py-1.5 rounded-lg border border-panelBorder text-slate-300 hover:bg-white/5">+ Item Manual</button>
      </div>
      <div class="text-[11px] text-right space-y-0.5">
        <p class="text-textMuted">Sub Total: <span class="font-mono text-slate-300" id="qs-sub-${sIdx}">${money(sub)}</span></p>
        <p class="text-textMuted">Diskon (<span id="qs-discpct-${sIdx}">${sec.discountPct}</span>%): <span class="font-mono text-red-400" id="qs-disc-${sIdx}">${money(disc)}</span></p>
        <p class="font-bold text-white">Total ${sIdx+1}: <span class="font-mono text-emerald-400" id="qs-total-${sIdx}">${money(tot)}</span></p>
      </div>
    </div>`;
  }).join('');
}
function refreshQuoteSectionsUI(){
  document.getElementById('quote-sections-wrap').innerHTML = renderQuoteSectionsHTML();
  recomputeQuoteTotals();
}
function recomputeQuoteTotals(){
  quoteDraft.sections.forEach((sec, sIdx)=>{
    (sec.items||[]).forEach((it,iIdx)=>{
      const el = document.getElementById(`qi-sub-${sIdx}-${iIdx}`);
      if (el) el.textContent = money((Number(it.qty)||0)*(Number(it.price)||0));
    });
    const subEl = document.getElementById(`qs-sub-${sIdx}`); if (subEl) subEl.textContent = money(sectionSubtotal(sec));
    const discPctEl = document.getElementById(`qs-discpct-${sIdx}`); if (discPctEl) discPctEl.textContent = sec.discountPct;
    const discEl = document.getElementById(`qs-disc-${sIdx}`); if (discEl) discEl.textContent = money(sectionDiscountAmount(sec));
    const totEl = document.getElementById(`qs-total-${sIdx}`); if (totEl) totEl.textContent = money(sectionTotal(sec));
  });
  const grandEl = document.getElementById('quote-grand-total');
  if (grandEl) grandEl.textContent = money(quoteDraft.sections.reduce((s,sec)=>s+sectionTotal(sec),0));
}
function updateSectionField(sIdx, field, val){ quoteDraft.sections[sIdx][field] = val; }
function updateSectionDiscount(sIdx, val){ quoteDraft.sections[sIdx].discountPct = Math.max(0, Math.min(100, Number(val)||0)); recomputeQuoteTotals(); }
function updateItemField(sIdx, iIdx, field, val){ quoteDraft.sections[sIdx].items[iIdx][field] = val; }
function updateItemNumber(sIdx, iIdx, field, val){ quoteDraft.sections[sIdx].items[iIdx][field] = Number(val)||0; recomputeQuoteTotals(); }
function addQuoteItemFromProduct(sIdx){
  const sel = document.getElementById(`qpick-${sIdx}`);
  const p = state.products.find(x=>x.id===sel.value);
  if (!p){ toast('Pilih produk dari daftar dahulu','err'); return; }
  quoteDraft.sections[sIdx].items.push({ model:p.model||p.sku||'', description:p.name + (p.description?(' — '+p.description):''), qty:1, unit:p.unit||'Unit', price:p.price });
  refreshQuoteSectionsUI();
}
function addQuoteItemBlank(sIdx){ quoteDraft.sections[sIdx].items.push(blankQuoteItem()); refreshQuoteSectionsUI(); }
function removeQuoteItem(sIdx, iIdx){ quoteDraft.sections[sIdx].items.splice(iIdx,1); refreshQuoteSectionsUI(); }
function addQuoteSection(){
  const letter = String.fromCharCode(65 + quoteDraft.sections.length);
  quoteDraft.sections.push(blankQuoteSection(`${letter}. SECTION BARU`));
  refreshQuoteSectionsUI();
}
function removeQuoteSection(sIdx){
  if (quoteDraft.sections.length<=1){ toast('Quotation minimal harus punya 1 section','err'); return; }
  quoteDraft.sections.splice(sIdx,1); refreshQuoteSectionsUI();
}
function fillQuoteToFromContact(){
  const contactId = document.getElementById('quote-contact-select').value;
  const contact = getContact(contactId);
  if (!contact) return;
  const co = getCompany(contact.companyId);
  document.querySelector('#quote-form [name="toName"]').value = co ? co.name : contact.name;
  document.querySelector('#quote-form [name="toAddress"]').value = co ? (co.address||'') : '';
  document.querySelector('#quote-form [name="attnName"]').value = contact.name;
  document.querySelector('#quote-form [name="attnPhone"]').value = contact.phone||'';
  document.querySelector('#quote-form [name="attnEmail"]').value = contact.email||'';
}
function openQuoteModal(id, prefillDealId){
  const q = id ? state.quotes.find(x=>x.id===id) : null;
  const deal = q ? state.deals.find(x=>x.id===q.dealId) : (prefillDealId ? state.deals.find(x=>x.id===prefillDealId) : null);
  quoteDraft = q ? JSON.parse(JSON.stringify(q)) : newQuoteDraftFromDeal(deal);
  const dealOptions = state.deals.map(d=>`<option value="${d.id}" ${quoteDraft.dealId===d.id?'selected':''}>${esc(d.title)}</option>`).join('');
  const contactOptions = state.contacts.map(c=>`<option value="${c.id}" ${quoteDraft.contactId===c.id?'selected':''}>${esc(c.name)} — ${esc(contactCompanyName(c))}</option>`).join('');
  openModal(`
    <h3 class="text-sm font-bold text-white mb-4">${q?'Edit Quotation':'Buat Quotation'}</h3>
    <form id="quote-form" class="space-y-3 text-sm">
      <input type="hidden" name="id" value="${q?q.id:''}">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label class="text-xs text-textMuted block mb-1">No. Quotation (Ref#)</label><input name="number" required class="field-input rounded-xl px-3 py-2 w-full" value="${esc(quoteDraft.number)}"></div>
        <div><label class="text-xs text-textMuted block mb-1">Tanggal</label><input type="date" name="date" required class="field-input rounded-xl px-3 py-2 w-full" value="${quoteDraft.date}"></div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label class="text-xs text-textMuted block mb-1">Subject / Sistem</label><input name="subject" placeholder="cth. Fire Alarm System" class="field-input rounded-xl px-3 py-2 w-full" value="${esc(quoteDraft.subject)}"></div>
        <div><label class="text-xs text-textMuted block mb-1">Nama Project</label><input name="projectName" class="field-input rounded-xl px-3 py-2 w-full" value="${esc(quoteDraft.projectName)}"></div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label class="text-xs text-textMuted block mb-1">Deal Terkait (opsional)</label>
          <select name="dealId" class="field-input rounded-xl px-3 py-2 w-full"><option value="">— Tanpa deal —</option>${dealOptions}</select>
        </div>
        <div><label class="text-xs text-textMuted block mb-1">Kontak Penerima</label>
          <select id="quote-contact-select" name="contactId" onchange="fillQuoteToFromContact()" class="field-input rounded-xl px-3 py-2 w-full"><option value="">— Pilih kontak —</option>${contactOptions}</select>
        </div>
      </div>
      <div class="pt-1 border-t border-white/10 mt-2">
        <p class="text-xs text-textMuted mb-2 mt-2 font-semibold">Ditujukan Kepada (blok "To")</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
          <div><label class="text-xs text-textMuted block mb-1">Nama Perusahaan / Penerima</label><input name="toName" class="field-input rounded-xl px-3 py-2 w-full" value="${esc(quoteDraft.toName)}"></div>
          <div><label class="text-xs text-textMuted block mb-1">Alamat</label><input name="toAddress" class="field-input rounded-xl px-3 py-2 w-full" value="${esc(quoteDraft.toAddress)}"></div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
          <div><label class="text-xs text-textMuted block mb-1">Attn (PIC)</label><input name="attnName" class="field-input rounded-xl px-3 py-2 w-full" value="${esc(quoteDraft.attnName)}"></div>
          <div><label class="text-xs text-textMuted block mb-1">Telp</label><input name="attnPhone" class="field-input rounded-xl px-3 py-2 w-full" value="${esc(quoteDraft.attnPhone)}"></div>
          <div><label class="text-xs text-textMuted block mb-1">Fax</label><input name="attnFax" class="field-input rounded-xl px-3 py-2 w-full" value="${esc(quoteDraft.attnFax)}"></div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label class="text-xs text-textMuted block mb-1">Email</label><input name="attnEmail" class="field-input rounded-xl px-3 py-2 w-full" value="${esc(quoteDraft.attnEmail)}"></div>
          <div><label class="text-xs text-textMuted block mb-1">Your Ref.</label><input name="yourRef" class="field-input rounded-xl px-3 py-2 w-full" value="${esc(quoteDraft.yourRef)}"></div>
        </div>
      </div>
      <div class="pt-1 border-t border-white/10 mt-2">
        <div class="flex items-center justify-between mt-2 mb-2">
          <p class="text-xs text-textMuted font-semibold">Item Penawaran (per Section)</p>
          <button type="button" onclick="addQuoteSection()" class="text-[10px] px-2.5 py-1.5 rounded-lg border border-panelBorder text-slate-300 hover:bg-white/5">+ Tambah Section</button>
        </div>
        <div id="quote-sections-wrap">${renderQuoteSectionsHTML()}</div>
        <p class="text-right text-sm font-bold text-white pt-1">Grand Total: <span class="font-mono text-emerald-400" id="quote-grand-total">${money(quoteDraft.sections.reduce((s,sec)=>s+sectionTotal(sec),0))}</span></p>
      </div>
      <div class="pt-1 border-t border-white/10 mt-2">
        <label class="text-xs text-textMuted block mb-1 mt-2">Catatan (satu baris = satu poin, ditandai *)</label>
        <textarea name="notesList" rows="3" class="field-input rounded-xl px-3 py-2 w-full text-xs">${esc((quoteDraft.notesList||[]).join('\n'))}</textarea>
      </div>
      <div>
        <label class="text-xs text-textMuted block mb-1">Term & Conditions (satu baris = satu poin)</label>
        <textarea name="terms" rows="5" class="field-input rounded-xl px-3 py-2 w-full text-xs">${esc((quoteDraft.terms||[]).join('\n'))}</textarea>
      </div>
      <div class="flex justify-between items-center pt-2">
        ${q?`<button type="button" onclick="deleteQuote('${q.id}')" class="text-xs text-red-400 hover:underline">Hapus quotation</button>`:'<span></span>'}
        <div class="flex gap-2">
          <button type="button" onclick="closeModal()" class="text-xs px-4 py-2 rounded-xl border border-panelBorder text-slate-300">Batal</button>
          <button type="submit" class="text-xs font-semibold px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white">Simpan Quotation</button>
        </div>
      </div>
    </form>
  `);
  document.getElementById('quote-form').addEventListener('submit', saveQuote);
}
async function saveQuote(e){
  e.preventDefault();
  const f = new FormData(e.target);
  const id = f.get('id');
  const notesList = (f.get('notesList')||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const terms = (f.get('terms')||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const data = {
    number: f.get('number').trim(), date: f.get('date'), subject: f.get('subject').trim(), projectName: f.get('projectName').trim(),
    dealId: f.get('dealId')||null, contactId: f.get('contactId')||null,
    toName: f.get('toName').trim(), toAddress: f.get('toAddress').trim(),
    attnName: f.get('attnName').trim(), attnPhone: f.get('attnPhone').trim(), attnFax: f.get('attnFax').trim(), attnEmail: f.get('attnEmail').trim(),
    yourRef: f.get('yourRef').trim(), pages: quoteDraft.pages || '1 Lembar',
    sections: JSON.parse(JSON.stringify(quoteDraft.sections)),
    notesList, terms,
  };
  if (!data.number){ toast('Nomor quotation wajib diisi','err'); return; }
  if (id){ const ex = state.quotes.find(x=>x.id===id); Object.assign(ex, data); toast('Quotation diperbarui'); }
  else {
    state.quotes.unshift({ id:uid(), ...data, status:'Draft', createdAt:new Date().toISOString() });
    logActivity(`Quotation "${data.number}" dibuat${data.projectName?(' untuk project "'+data.projectName+'"'):''}`, {dealId:data.dealId, contactId:data.contactId});
    toast('Quotation dibuat');
  }
  await persist('quotes'); closeModal(); closeDrawer(); renderQuotes();
}
async function deleteQuote(id){
  if(!confirm('Hapus quotation ini?')) return;
  state.quotes = state.quotes.filter(x=>x.id!==id);
  await persist('quotes'); closeModal(); closeDrawer(); renderQuotes(); toast('Quotation dihapus','err');
}
async function updateQuoteStatus(id, status){
  const q = state.quotes.find(x=>x.id===id); if(!q) return;
  q.status = status;
  if (status==='Sent' && state.settings.autoQuoteLog){
    logActivity(`Quotation "${q.number}" dikirim ke klien`, {dealId:q.dealId, contactId:q.contactId});
  }
  await persist('quotes'); openQuoteDetail(id); renderQuotes();
}
function openQuoteDetail(id){
  const q = state.quotes.find(x=>x.id===id); if(!q) return;
  const deal = state.deals.find(x=>x.id===q.dealId);
  const total = quoteGrandTotal(q);
  openDrawer(`
    <div class="flex justify-between items-start mb-1">
      <div><h3 class="font-display text-lg font-bold text-white">${esc(q.number)}</h3><p class="text-xs text-textMuted">${esc(q.subject)||''} ${deal?'• '+esc(deal.title):''}</p></div>
      <span class="text-[10px] font-bold px-2 py-1 rounded-full border" style="color:${QUOTE_STATUS_COLOR[q.status]};border-color:${QUOTE_STATUS_COLOR[q.status]}55">${q.status}</span>
    </div>
    <div class="flex gap-2 mt-3 mb-4 flex-wrap">
      <button onclick="openQuoteModal('${q.id}')" class="text-xs px-3 py-1.5 rounded-lg border border-panelBorder text-slate-300 hover:bg-white/5">Edit</button>
      <button onclick="printQuote('${q.id}')" class="text-xs px-3 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10">Cetak / PDF</button>
      <button onclick="deleteQuote('${q.id}')" class="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10">Hapus</button>
    </div>
    <div class="flex flex-wrap gap-1.5 mb-5">
      ${Object.keys(QUOTE_STATUS_COLOR).map(s=>`<button onclick="updateQuoteStatus('${q.id}','${s}')" class="text-[10px] font-semibold px-2.5 py-1 rounded-full border ${s===q.status?'text-textMain':'text-textMuted'}" style="border-color:${QUOTE_STATUS_COLOR[s]}55; ${s===q.status?`background:${QUOTE_STATUS_COLOR[s]}33;`:''}">${s}</button>`).join('')}
    </div>
    <div class="text-xs text-slate-400 space-y-1 mb-4 bg-panelBg/60 border border-white/5 rounded-xl p-3">
      <p><b class="text-slate-300">To:</b> ${esc(q.toName)||'—'}</p>
      <p>${esc(q.toAddress)||''}</p>
      <p><b class="text-slate-300">Attn:</b> ${esc(q.attnName)||'—'} ${q.attnPhone?('• '+esc(q.attnPhone)):''}</p>
    </div>
    <h4 class="text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">Ringkasan Section</h4>
    <div class="space-y-1.5 mb-3">
      ${(q.sections||[]).map((sec,i)=>`<div class="flex items-center justify-between gap-2 bg-panelBg/60 border border-white/5 rounded-lg px-3 py-2 text-xs">
        <span class="text-slate-300">${esc(sec.name)||('Section '+(i+1))} <span class="text-textMuted">(${(sec.items||[]).length} item${sec.discountPct?', disc '+sec.discountPct+'%':''})</span></span>
        <span class="font-mono text-cyan-400">${money(sectionTotal(sec))}</span>
      </div>`).join('') || '<p class="text-xs text-textMuted">Belum ada section.</p>'}
    </div>
    <p class="text-sm font-bold text-white mb-4">Grand Total: <span class="font-mono text-emerald-400">${money(total)}</span></p>
    ${(q.notesList&&q.notesList.length) ? `<h4 class="text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">Catatan</h4><ul class="text-xs text-textMuted list-disc pl-4 mb-4 space-y-0.5">${q.notesList.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    ${(q.terms&&q.terms.length) ? `<h4 class="text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">Term & Conditions</h4><ul class="text-xs text-textMuted list-disc pl-4 space-y-0.5">${q.terms.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>` : ''}
  `);
}

/* ---- Cetak Quotation: replika layout dokumen resmi (letterhead 2 kolom, tabel bersection, kotak total, TTD) ---- */
function fmtQuoteDate(dstr){
  try { const d = new Date(dstr); return d.toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'}); }
  catch(e){ return dstr; }
}
function printQuote(id){
  const q = state.quotes.find(x=>x.id===id); if(!q) return;
  const co = state.settings.company || {};
  const sections = q.sections || [];
  const grand = quoteGrandTotal(q);

  let rowsHTML = '';
  sections.forEach((sec, sIdx)=>{
    rowsHTML += `<tr><td colspan="7" style="background:#eef1f5;font-weight:bold;padding:5px 6px;border:1px solid #999;">${String.fromCharCode(65+sIdx)}&nbsp;&nbsp;${esc((sec.name||'').replace(/^[A-Z]\.?\s*/,''))}</td></tr>`;
    (sec.items||[]).forEach((it,iIdx)=>{
      rowsHTML += `<tr>
        <td style="border:1px solid #999;padding:4px 6px;text-align:center;">${iIdx+1}</td>
        <td style="border:1px solid #999;padding:4px 6px;font-weight:bold;">${esc(it.model)}</td>
        <td style="border:1px solid #999;padding:4px 6px;">${esc(it.description)}</td>
        <td style="border:1px solid #999;padding:4px 6px;text-align:center;">${it.qty}</td>
        <td style="border:1px solid #999;padding:4px 6px;text-align:center;">${esc(it.unit)}</td>
        <td style="border:1px solid #999;padding:4px 6px;text-align:right;">Rp&nbsp;${Number(it.price).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
        <td style="border:1px solid #999;padding:4px 6px;text-align:right;">Rp&nbsp;${((Number(it.qty)||0)*(Number(it.price)||0)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
      </tr>`;
    });
    const sub = sectionSubtotal(sec), disc = sectionDiscountAmount(sec), tot = sectionTotal(sec);
    rowsHTML += `<tr><td colspan="5" style="border:none;"></td><td style="border:1px solid #999;padding:3px 6px;background:#fff;">SUB TOTAL</td><td style="border:1px solid #999;padding:3px 6px;text-align:right;">Rp ${sub.toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>`;
    if (sec.discountPct){
      rowsHTML += `<tr><td colspan="5" style="border:none;"></td><td style="border:1px solid #999;padding:3px 6px;background:#fff;">DISCOUNT ${sec.discountPct}%</td><td style="border:1px solid #999;padding:3px 6px;text-align:right;">Rp ${disc.toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>`;
    }
    rowsHTML += `<tr><td colspan="5" style="border:none;"></td><td style="border:1px solid #999;padding:3px 6px;background:#fff59d;font-weight:bold;">TOTAL ${sIdx+1}</td><td style="border:1px solid #999;padding:3px 6px;text-align:right;background:#fff59d;font-weight:bold;">Rp ${tot.toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>`;
  });

  const totalsBoxRows = sections.map((sec,i)=>`<tr><td style="border:1px solid #999;padding:3px 8px;">TOTAL ${i+1}</td><td style="border:1px solid #999;padding:3px 8px;text-align:right;">Rp&nbsp;${sectionTotal(sec).toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>`).join('');

  const notesHTML = (q.notesList||[]).map(n=>`<p style="margin:2px 0;">* ${esc(n)}</p>`).join('');
  const termsHTML = (q.terms||[]).map(t=>`<p style="margin:3px 0;padding-left:12px;text-indent:-12px;">- ${esc(t)}</p>`).join('');

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(q.number)}</title>
  <style>
    @page { size:A4; margin:14mm; }
    * { box-sizing:border-box; }
    body{ font-family:Arial,Helvetica,sans-serif; color:#111; font-size:12px; margin:0; padding:0; }
    table{ width:100%; border-collapse:collapse; }
    .no-print{ position:fixed; top:10px; right:10px; }
    @media print { .no-print{ display:none; } }
    .head-table td{ vertical-align:top; border:none; padding:0; }
    .letter-title{ font-weight:800; font-size:20px; letter-spacing:0.5px; }
    .letter-sub{ font-weight:800; font-size:11px; color:#333; }
    .co-box{ border:2px solid #111; padding:6px 10px; font-size:9.5px; line-height:1.35; }
    .co-box b{ display:block; font-size:10.5px; margin-bottom:2px; }
    .info-table td{ border:none; padding:1.5px 4px; font-size:11.5px; vertical-align:top; }
    .info-table td.lbl{ width:78px; color:#111; }
    .item-table th{ border:1px solid #999; background:#d9dde3; padding:5px 6px; font-size:10.5px; text-align:center; }
    .item-table td{ font-size:11px; }
    .totals-box td{ font-size:11px; }
    .grand{ background:#c6efce !important; font-weight:800; font-size:12.5px; }
  </style></head>
  <body onload="window.print()">
  <button class="no-print" onclick="window.print()" style="padding:8px 14px;">Print / Save PDF</button>

  <table class="head-table" style="margin-bottom:10px;">
    <tr>
      <td style="width:55%;"><span class="letter-title">${esc(co.name || 'PT PERUSAHAAN ANDA')}</span></td>
      <td style="width:45%;">
        <table class="head-table"><tr>
          <td style="width:50%;" class="co-box">
            <b>${esc(co.headOfficeLabel||'Head Office')}</b>
            ${(co.headOfficeAddress||'').split('\n').map(l=>esc(l)).join('<br>')}
            <br><br>Contact<br>${esc(co.contactPhone||'')}<br>${esc(co.contactEmail||'')}<br>${esc(co.contactWebsite||'')}
          </td>
          <td style="width:50%;" class="co-box">
            <b>${esc(co.branchOfficeLabel||'Branch Office')}</b>
            ${(co.branchOfficeAddress||'').split('\n').map(l=>esc(l)).join('<br>')}
          </td>
        </tr></table>
      </td>
    </tr>
  </table>
  <hr style="border:none;border-top:3px solid #111;margin:0 0 12px 0;">

  <table class="head-table" style="margin-bottom:10px;">
    <tr>
      <td style="width:52%;">
        <table class="info-table">
          <tr><td class="lbl">Re.</td><td>: <b>Quotation</b><br><b>${esc(q.subject)||''}</b></td></tr>
          <tr><td class="lbl">Date</td><td>: ${fmtQuoteDate(q.date)}</td></tr>
          <tr><td class="lbl">Ref. #</td><td>: ${esc(q.number)}</td></tr>
          <tr><td class="lbl">Project</td><td>: ${esc(q.projectName)||''}</td></tr>
          <tr><td class="lbl">Your Ref.</td><td>: ${esc(q.yourRef)||''}</td></tr>
          <tr><td class="lbl">Page(s)</td><td>: ${esc(q.pages)||'1 Lembar'}</td></tr>
        </table>
      </td>
      <td style="width:48%;">
        <table class="info-table">
          <tr><td class="lbl">To</td><td>: <b>${esc(q.toName)||''}</b><br>${esc(q.toAddress)||''}</td></tr>
          <tr><td class="lbl">Attn.</td><td>: ${esc(q.attnName)||''}</td></tr>
          <tr><td class="lbl">Telp</td><td>: ${esc(q.attnPhone)||''}</td></tr>
          <tr><td class="lbl">Fax</td><td>: ${esc(q.attnFax)||''}</td></tr>
          <tr><td class="lbl">Email</td><td>: ${esc(q.attnEmail)||''}</td></tr>
        </table>
      </td>
    </tr>
  </table>

  <p style="margin:10px 0 4px 0;">Dear Sir / Madam,</p>
  <p style="margin:0 0 8px 0;">We are pleased to quote you The Security System Equipment for above project as follows :</p>

  <table class="item-table" style="margin-bottom:8px;">
    <thead><tr>
      <th style="width:4%;">NO.</th><th style="width:12%;">MODEL</th><th>DESCRIPTION</th><th style="width:6%;">QTY</th><th style="width:8%;">SAT</th><th style="width:14%;">UNIT</th><th style="width:15%;">TOTAL PRICE<br>(IDR)</th>
    </tr></thead>
    <tbody>${rowsHTML}</tbody>
  </table>

  <div style="font-size:10.5px;margin-bottom:10px;">${notesHTML}</div>

  <table class="head-table" style="margin-top:6px;">
    <tr>
      <td style="width:62%;vertical-align:top;">
        <p style="font-weight:bold;margin:0 0 4px 0;">Term & Conditions :</p>
        <div style="font-size:10.5px;">${termsHTML}</div>
        <p style="font-size:10.5px;margin-top:6px;"><b>* ${esc(co.bankInfo||'')}</b></p>
      </td>
      <td style="width:38%;vertical-align:top;">
        <table class="totals-box" style="width:100%;">
          ${totalsBoxRows}
          <tr><td style="border:1px solid #999;padding:3px 8px;">Sub Total</td><td style="border:1px solid #999;padding:3px 8px;text-align:right;">Rp&nbsp;${grand.toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>
          <tr class="grand"><td style="border:1px solid #999;padding:5px 8px;">Grand Total</td><td style="border:1px solid #999;padding:5px 8px;text-align:right;">Rp&nbsp;${grand.toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>
        </table>
      </td>
    </tr>
  </table>

  <table class="head-table" style="margin-top:12px;border-top:1px solid #999;">
    <tr>
      <td style="width:60%;padding-top:8px;font-size:11px;">
        We believe that our quotation will meet your requirement.<br>
        If you have any further question, please do not hesitate to contact.<br>
        Phone&nbsp;&nbsp;&nbsp;: ${esc(co.signerPhone)||''}<br>
        Mobile&nbsp;: ${esc(co.signerMobile)||''}<br><br>
        Thank you for your kind attention and cooperation.
      </td>
      <td style="width:20%;padding-top:8px;font-size:11px;text-align:center;">
        Approved by<br><br><br><br>
        (&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)
      </td>
      <td style="width:20%;padding-top:8px;font-size:11px;text-align:center;">
        Faithfully yours,<br><br><br>
        <b>${esc(co.signerName)||''}</b><br>${esc(co.signerName)||''}
      </td>
    </tr>
  </table>

  <p style="text-align:center;font-size:10px;margin-top:24px;border-top:1px solid #999;padding-top:8px;">
    <b>${esc(co.name)||''}</b><br>
    ${esc(co.footerAddress)||''}<br>
    ${esc(co.footerPhone)||''}<br>
    ${esc(co.footerWebsite)||''}
  </p>
  </body></html>`);
  win.document.close();
}


/* ---------- TEAM ---------- */
function renderTeam(){
  document.getElementById('team-empty').classList.toggle('hidden', state.team.length>0);
  const members = [{ id:'me', name: state.profile.name, role: state.profile.role, avatar: state.profile.avatar, isMe:true }, ...state.team];
  document.getElementById('team-grid').innerHTML = members.map(m=>{
    const ownedDeals = state.deals.filter(d=>d.ownerId===m.id);
    const won = ownedDeals.filter(d=>d.stage==='Won');
    const wonValue = won.reduce((s,d)=>s+d.value,0);
    return `<div class="glass-card glass-card-hover rounded-2xl p-4">
      <div class="flex items-center gap-3 mb-3">
        <img src="${m.avatar||'https://randomuser.me/api/portraits/lego/1.jpg'}" class="w-10 h-10 rounded-full ring-2 ring-purple-500/40">
        <div><p class="font-bold text-white text-sm">${esc(m.name)} ${m.isMe?'<span class=\"text-[9px] text-purple-400\">(Anda)</span>':''}</p><p class="text-xs text-textMuted">${esc(m.role)||'—'}</p></div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] mb-3">
        <div class="bg-panelBg/60 border border-white/5 rounded-lg p-2"><p class="text-textMuted text-[9px]">Deal Aktif</p><p class="font-bold text-slate-200">${ownedDeals.length}</p></div>
        <div class="bg-panelBg/60 border border-white/5 rounded-lg p-2"><p class="text-textMuted text-[9px]">Revenue Won</p><p class="font-bold text-emerald-400 font-mono">${money(wonValue)}</p></div>
      </div>
      ${m.isMe ? '' : `<div class="flex gap-2">
        <button onclick="openTeamModal('${m.id}')" class="text-[10px] px-2.5 py-1 rounded-lg border border-panelBorder text-slate-300 hover:bg-white/5">Edit</button>
        <button onclick="deleteTeamMember('${m.id}')" class="text-[10px] px-2.5 py-1 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10">Hapus</button>
      </div>`}
    </div>`;
  }).join('');
}
function openTeamModal(id){
  const m = id ? state.team.find(x=>x.id===id) : null;
  openModal(`
    <h3 class="text-sm font-bold text-white mb-4">${m?'Edit Anggota Tim':'Tambah Anggota Tim'}</h3>
    <form id="team-form" class="space-y-3 text-sm">
      <input type="hidden" name="id" value="${m?m.id:''}">
      <div><label class="text-xs text-textMuted block mb-1">Nama</label><input name="name" required class="field-input rounded-xl px-3 py-2 w-full" value="${m?esc(m.name):''}"></div>
      <div><label class="text-xs text-textMuted block mb-1">Peran</label><input name="role" class="field-input rounded-xl px-3 py-2 w-full" value="${m?esc(m.role):''}" placeholder="Account Executive"></div>
      <div><label class="text-xs text-textMuted block mb-1">Email</label><input type="email" name="email" class="field-input rounded-xl px-3 py-2 w-full" value="${m?esc(m.email):''}"></div>
      <div><label class="text-xs text-textMuted block mb-1">URL Avatar</label><input name="avatar" class="field-input rounded-xl px-3 py-2 w-full" value="${m?esc(m.avatar):''}"></div>
      <div class="flex justify-between items-center pt-2">
        ${m?`<button type="button" onclick="deleteTeamMember('${m.id}')" class="text-xs text-red-400 hover:underline">Hapus anggota</button>`:'<span></span>'}
        <div class="flex gap-2">
          <button type="button" onclick="closeModal()" class="text-xs px-4 py-2 rounded-xl border border-panelBorder text-slate-300">Batal</button>
          <button type="submit" class="text-xs font-semibold px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white">Simpan</button>
        </div>
      </div>
    </form>
  `);
  document.getElementById('team-form').addEventListener('submit', saveTeamMember);
}
async function saveTeamMember(e){
  e.preventDefault();
  const f = new FormData(e.target);
  const id = f.get('id');
  const data = { name:f.get('name').trim(), role:f.get('role').trim(), email:f.get('email').trim(), avatar:f.get('avatar').trim() };
  if (!data.name) return;
  if (id){ Object.assign(state.team.find(x=>x.id===id), data); toast('Anggota tim diperbarui'); }
  else { state.team.unshift({ id:uid(), ...data, createdAt:new Date().toISOString() }); toast('Anggota tim ditambahkan'); }
  await persist('team'); closeModal(); renderAll();
}
async function deleteTeamMember(id){
  if(!confirm('Hapus anggota tim ini? Deal & kontak yang dimiliki akan menjadi tanpa owner.')) return;
  state.team = state.team.filter(x=>x.id!==id);
  state.contacts.forEach(c=>{ if(c.ownerId===id) c.ownerId=null; });
  state.deals.forEach(d=>{ if(d.ownerId===id) d.ownerId=null; });
  await Promise.all([persist('team'), persist('contacts'), persist('deals')]);
  closeModal(); renderAll(); toast('Anggota tim dihapus','err');
}

/* ---------- profile ---------- */
function renderProfile(){
  document.getElementById('profile-avatar').src = state.profile.avatar || 'https://randomuser.me/api/portraits/men/32.jpg';
  document.getElementById('profile-name').textContent = state.profile.name;
  const form = document.getElementById('profile-form');
  form.name.value = state.profile.name; form.role.value = state.profile.role; form.avatar.value = state.profile.avatar || '';
}
document.getElementById('profile-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const f = new FormData(e.target);
  state.profile = { name: f.get('name').trim(), role: f.get('role').trim(), avatar: f.get('avatar').trim() };
  await persist('profile'); renderProfile(); toast('Profil disimpan');
});

/* ---------- render all ---------- */
function renderAll(){
  populateOwnerFilters();
  renderContacts(); renderCompanies(); renderDeals(); renderTasks();
  renderDashboardStats(); updateCharts(); renderProfile(); renderNotifications();
  renderProducts(); renderQuotes(); renderTeam(); renderAutomationSettings(); renderTargetForm(); renderCompanyProfileForm();
  if (document.getElementById('view-calendar').classList.contains('active')) renderCalendar();
  if (document.getElementById('view-reports').classList.contains('active')) renderReports();
}

document.getElementById('contacts-search').addEventListener('input', renderContacts);
document.getElementById('companies-search').addEventListener('input', renderCompanies);
document.getElementById('deals-search').addEventListener('input', renderDeals);
document.getElementById('contacts-owner-filter').addEventListener('change', renderContacts);
document.getElementById('deals-owner-filter').addEventListener('change', renderDeals);
document.getElementById('products-search').addEventListener('input', renderProducts);

/* ---------- Sales Target ---------- */
function renderTargetForm(){
  document.getElementById('target-form').monthlyTarget.value = state.settings.monthlyTarget || 0;
}
document.getElementById('target-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  state.settings.monthlyTarget = Number(new FormData(e.target).get('monthlyTarget'))||0;
  await persist('settings'); renderDashboardStats(); toast('Target bulanan disimpan');
});
function renderCompanyProfileForm(){
  const f = document.getElementById('company-profile-form');
  if (!f) return;
  const co = state.settings.company || {};
  Object.keys(co).forEach(k=>{ if (f.elements[k]) f.elements[k].value = co[k] || ''; });
}
document.getElementById('company-profile-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const f = new FormData(e.target);
  const fields = ['name','headOfficeLabel','headOfficeAddress','branchOfficeLabel','branchOfficeAddress','contactPhone','contactEmail','contactWebsite','bankInfo','signerName','signerPhone','signerMobile','footerAddress','footerPhone','footerWebsite'];
  const company = {};
  fields.forEach(k=> company[k] = (f.get(k)||'').trim());
  state.settings.company = company;
  await persist('settings');
  toast('Profil perusahaan disimpan');
});
function renderAutomationSettings(){
  document.getElementById('auto-task-proposal').checked = !!state.settings.autoTaskProposal;
  document.getElementById('auto-loss-reason').checked = !!state.settings.autoLossReason;
  document.getElementById('auto-quote-log').checked = !!state.settings.autoQuoteLog;
}
async function saveAutomationSettings(){
  state.settings.autoTaskProposal = document.getElementById('auto-task-proposal').checked;
  state.settings.autoLossReason = document.getElementById('auto-loss-reason').checked;
  state.settings.autoQuoteLog = document.getElementById('auto-quote-log').checked;
  await persist('settings'); toast('Pengaturan automasi disimpan', 'info');
}

/* ---------- CSV IMPORT (Contacts) ---------- */
function parseCSVText(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim().length);
  if (!lines.length) return [];
  const splitRow = row => row.match(/(".*?"|[^,]+)(?=,|$)/g).map(v=>v.replace(/^"|"$/g,'').replace(/""/g,'"').trim());
  const headers = splitRow(lines[0]).map(h=>h.toLowerCase());
  return lines.slice(1).map(line=>{
    const vals = splitRow(line);
    const row = {};
    headers.forEach((h,i)=> row[h] = vals[i] || '');
    return row;
  });
}
async function importContactsCSV(e){
  const file = e.target.files[0]; if (!file) return;
  const text = await file.text();
  let rows;
  try { rows = parseCSVText(text); } catch(err){ toast('Format CSV tidak valid', 'err'); return; }
  let count = 0;
  rows.forEach(r=>{
    const name = r['nama'] || r['name'];
    if (!name) return;
    let companyId = null;
    const companyName = r['perusahaan'] || r['company'];
    if (companyName){
      let co = state.companies.find(x=>x.name.toLowerCase()===companyName.toLowerCase());
      if (!co){ co = { id: uid(), name: companyName, industry:'', website:'', size:'', address:'', createdAt:new Date().toISOString() }; state.companies.push(co); }
      companyId = co.id;
    }
    const tags = (r['tag']||r['tags']||'').split(';').map(s=>s.trim()).filter(Boolean);
    state.contacts.unshift({ id: uid(), name, companyId, email: r['email']||'', phone: r['telepon']||r['phone']||'', status: (r['status']||'lead').toLowerCase()==='customer'?'customer':'lead', tags, ownerId:'me', createdAt: new Date().toISOString() });
    count++;
  });
  await Promise.all([persist('contacts'), persist('companies')]);
  logActivity(`${count} kontak diimpor dari CSV`);
  renderAll(); toast(`${count} kontak berhasil diimpor`);
  e.target.value = '';
}
async function importProductsCSV(e){
  const file = e.target.files[0]; if (!file) return;
  const text = await file.text();
  let rows;
  try { rows = parseCSVText(text); } catch(err){ toast('Format CSV tidak valid', 'err'); return; }
  let count = 0;
  rows.forEach(r=>{
    const name = r['nama'] || r['name'];
    if (!name) return;
    state.products.unshift({
      id: uid(), name,
      model: r['model']||r['kode']||'',
      sku: r['sku']||'',
      category: r['kategori']||r['category']||'',
      unit: r['satuan']||r['unit']||'Unit',
      price: Number(String(r['harga']||r['price']||'0').replace(/[^0-9.-]/g,''))||0,
      description: r['deskripsi']||r['description']||'',
    });
    count++;
  });
  await persist('products');
  logActivity(`${count} produk diimpor dari CSV ke price book`);
  renderAll(); toast(`${count} produk berhasil diimpor`);
  e.target.value = '';
}

/* ---------- AUTH (Supabase email/password) ---------- */
function showAuthScreen(){
  document.getElementById('loading-overlay').classList.add('hidden');
  document.getElementById('auth-overlay').classList.remove('hidden');
}
async function hideAuthAndBoot(user){
  currentUser = user;
  const authEl = document.getElementById('auth-overlay');
  if (authEl) authEl.remove();
  const loadingEl = document.getElementById('loading-overlay');
  if (loadingEl){ loadingEl.classList.remove('hidden'); loadingEl.style.opacity = '1'; }
  document.getElementById('account-email').textContent = user.email || '';
  await init();
}
function setAuthMode(mode){
  document.getElementById('auth-mode').value = mode;
  document.getElementById('auth-submit-btn').textContent = mode==='signup' ? 'Daftar Akun' : 'Masuk';
  document.getElementById('auth-title').textContent = mode==='signup' ? 'Buat akun baru' : 'Masuk ke workspace Anda';
  document.getElementById('auth-toggle-text').textContent = mode==='signup' ? 'Sudah punya akun?' : 'Belum punya akun?';
  document.getElementById('auth-toggle-link').textContent = mode==='signup' ? 'Masuk di sini' : 'Daftar di sini';
  document.getElementById('auth-error').classList.add('hidden');
}
function toggleAuthMode(){ setAuthMode(document.getElementById('auth-mode').value==='signin' ? 'signup' : 'signin'); }
document.getElementById('auth-toggle-link').addEventListener('click', toggleAuthMode);
document.getElementById('auth-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const f = new FormData(e.target);
  const email = (f.get('email')||'').trim();
  const password = f.get('password')||'';
  const mode = document.getElementById('auth-mode').value;
  const btn = document.getElementById('auth-submit-btn');
  const errEl = document.getElementById('auth-error');
  errEl.classList.add('hidden');
  btn.disabled = true; btn.textContent = 'Memproses...';
  try {
    if (mode === 'signup'){
      const { data, error } = await sbClient.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session && data.user){ await hideAuthAndBoot(data.user); }
      else {
        errEl.textContent = 'Akun dibuat. Cek email Anda untuk konfirmasi, lalu masuk.';
        errEl.classList.remove('hidden','text-red-400'); errEl.classList.add('text-emerald-400');
        setAuthMode('signin');
      }
    } else {
      const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await hideAuthAndBoot(data.user);
    }
  } catch(err){
    errEl.textContent = err.message || 'Terjadi kesalahan, silakan coba lagi.';
    errEl.classList.remove('hidden','text-emerald-400'); errEl.classList.add('text-red-400');
  } finally {
    btn.disabled = false; btn.textContent = mode==='signup' ? 'Daftar Akun' : 'Masuk';
  }
});
async function signOutUser(){
  if (!confirm('Keluar dari workspace ini?')) return;
  teardownRealtime();
  await sbClient.auth.signOut();
  location.reload();
}

/* ---------- boot ---------- */
async function init(){
  tickClock();
  await loadAll();
  renderAll();
  const overlay = document.getElementById('loading-overlay');
  if (overlay){ overlay.style.opacity = '0'; setTimeout(()=> overlay.remove(), 400); }
}
(async function bootstrapAuth(){
  const { data: { session } } = await sbClient.auth.getSession();
  if (session && session.user){ await hideAuthAndBoot(session.user); }
  else { showAuthScreen(); }
})();
