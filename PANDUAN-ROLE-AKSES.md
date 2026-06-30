# Panduan Sistem Role / Hak Akses Admin — OmniSeller

Fitur ini menambahkan kontrol siapa boleh masuk dan apa yang boleh mereka
lakukan di dashboard, dengan 3 level akses + 1 status menunggu approval.

## Level akses

| Role | Bisa lihat data | Tambah/edit/hapus transaksi (pesanan, stok) | Ubah pengaturan (biaya, marketplace, kategori, logo, user) |
|---|---|---|---|
| **Owner** 👑 | ✅ | ✅ | ✅ |
| **Staff** 🛠 | ✅ | ✅ | ❌ |
| **Viewer** 👁 | ✅ | ❌ | ❌ |
| **Pending** ⏳ | ❌ (tidak bisa masuk app sama sekali) | ❌ | ❌ |

## LANGKAH 1 — Jalankan SQL setup role

1. Pastikan `SETUP-DATABASE.sql` sudah pernah dijalankan sebelumnya
2. Buka **Supabase Dashboard → SQL Editor → New query**
3. Copy-paste seluruh isi **`SETUP-ROLES.sql`** → **Run**

Script ini akan:
- Membuat tabel `admin_users` (profil + role tiap akun)
- Membuat trigger otomatis: setiap kali ada yang **Sign Up**, otomatis dibuatkan profil
- **Orang pertama** yang pernah Sign Up di aplikasi ini otomatis jadi **Owner**
- Orang-orang berikutnya yang Sign Up otomatis berstatus **Pending** (menunggu di-approve)
- Memperbarui semua kebijakan keamanan (RLS) tabel data supaya sesuai role

⚠️ **Jika Anda sudah pernah membuat akun admin sebelum menjalankan script ini**,
akun-akun lama itu **tidak otomatis** punya baris di `admin_users` (karena
trigger baru berlaku untuk sign up baru). Jalankan query ini secara manual
untuk akun lama Anda supaya bisa login lagi:

```sql
-- Ganti email di bawah dengan email akun admin lama Anda
insert into admin_users (id, email, nama, role)
select id, email, email, 'owner'
from auth.users
where email = 'email_admin_lama_anda@contoh.com'
on conflict (id) do update set role = 'owner';
```

## LANGKAH 2 — Update file aplikasi

Upload ulang `index.html` dan `app.js` versi terbaru ke GitHub → Vercel
auto re-deploy.

## Cara kerja di aplikasi

1. **Owner pertama**: daftar lewat halaman login → klik "Daftar Administrator
   Baru" → karena ini orang pertama, otomatis langsung jadi Owner & masuk app.
2. **Admin/staff baru**: daftar dengan cara yang sama → setelah submit, akan
   muncul layar **"⏳ Menunggu Persetujuan"** — mereka belum bisa masuk.
3. **Owner approve**: login sebagai Owner → buka menu **Pengaturan → 👥
   Manajemen User & Hak Akses** → cari nama user yang pending → ubah role-nya
   jadi **Staff** atau **Viewer** lewat dropdown. User tersebut langsung bisa
   masuk di percobaan login berikutnya.
4. **Cabut akses**: di kartu yang sama, klik 🗑 di sebelah user untuk mencabut
   akses mereka (akun login tetap ada di Supabase Auth, tapi tidak bisa lagi
   masuk ke dashboard).

## Catatan keamanan

- Pembatasan akses ditegakkan **di 2 lapis**: tampilan (tombol disembunyikan
  sesuai role) **dan** database (Row Level Security menolak permintaan dari
  role yang tidak berhak — bukan sekadar disembunyikan dari tampilan).
  Jadi walau seseorang mencoba akal-akalan lewat browser console, server
  tetap menolak.
- Hanya **Owner** yang bisa mengubah role orang lain atau mencabut akses.
- Owner tidak bisa mengubah role dirinya sendiri dari menu ini (untuk
  mencegah Owner tidak sengaja mengunci diri sendiri keluar) — kalau perlu
  ganti Owner, lakukan langsung lewat SQL Editor di Supabase.
