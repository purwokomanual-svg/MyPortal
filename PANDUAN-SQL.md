# Panduan SQL Database Relasional — OmniSeller Dashboard

Dokumen ini menjelaskan skema database baru yang **menggantikan** tabel lama
`omniseller_data` (1 baris JSON besar) menjadi 7 tabel terpisah yang rapi,
sesuai struktur data yang dipakai aplikasi OmniSeller.

## Daftar tabel & kegunaannya

| Tabel | Untuk menyimpan | Sesuai data di app |
|---|---|---|
| `kategori` | Daftar kategori produk | `DB.kategori` |
| `marketplace` | Daftar marketplace + biaya admin | `DB.marketplace` + `DB.biaya.mp_fee` |
| `stok` | Stok/varian produk | `DB.stok` |
| `penjualan` | Riwayat pesanan/penjualan | `DB.penjualan` |
| `biaya_pengaturan` | Biaya ongkir/packaging/HPP (1 baris) | `DB.biaya.extra` & `hpp_mode/pct` |
| `hpp_per_produk` | HPP manual per produk | `DB.biaya.hpp_per_produk` |
| `pengaturan_toko` | Nama toko, pemilik, logo (1 baris) | `DB.pengaturan` |

---

## LANGKAH 1 — Jalankan skema baru

1. Buka **Supabase Dashboard → SQL Editor → New query**
2. Copy seluruh isi `SETUP-DATABASE.sql` → paste → **Run**
3. Ini akan membuat 7 tabel di atas, mengaktifkan **Row Level Security**
   (hanya admin yang login bisa akses), dan mengisi data awal (kategori &
   marketplace default).

✅ Cek di **Table Editor**: harus muncul 7 tabel baru.

> ⚠️ Jika sebelumnya Anda sudah pakai tabel lama `omniseller_data` dan
> punya data penting di sana, lakukan **LANGKAH 2 (migrasi)** dulu sebelum
> menghapusnya. Tabel lama tidak otomatis terhapus oleh script ini — aman
> dibiarkan, atau hapus manual nanti via `drop table omniseller_data;`

---

## LANGKAH 2 — Migrasi data lama (opsional, jika ada data di `omniseller_data`)

Jalankan query ini satu per satu di SQL Editor untuk memindahkan data lama
ke tabel baru:

```sql
-- Migrasi kategori
insert into kategori (nama, color)
select x.nama, x.color
from omniseller_data d,
     jsonb_to_recordset(d.data->'kategori') as x(nama text, color text)
where d.id = 1
on conflict (nama) do nothing;

-- Migrasi marketplace
insert into marketplace (nama, color, fee_persen)
select x.nama, x.color, coalesce((d.data->'biaya'->'mp_fee'->>x.nama)::numeric, 3)
from omniseller_data d,
     jsonb_to_recordset(d.data->'marketplace') as x(nama text, color text)
where d.id = 1
on conflict (nama) do nothing;

-- Migrasi stok
insert into stok (sku, produk, varian, kategori, stok, terjual)
select x.sku, x.prod, x.varian, x.kat, x.stok, x.terjual
from omniseller_data d,
     jsonb_to_recordset(d.data->'stok') as x(sku text, prod text, varian text, kat text, stok int, terjual int)
where d.id = 1
on conflict (sku) do nothing;

-- Migrasi penjualan
insert into penjualan (no_pesanan, tanggal, tgl_iso, marketplace, produk, varian, kategori, qty, total, status)
select x.no, x.tanggal, x."_date"::timestamptz, x.mp, x.prod, x.varian, x.kat, x.qty, x.total, x.status
from omniseller_data d,
     jsonb_to_recordset(d.data->'penjualan') as x(no text, tanggal text, "_date" text, mp text, prod text, varian text, kat text, qty int, total bigint, status text)
where d.id = 1
on conflict (no_pesanan) do nothing;

-- Migrasi biaya & pengaturan
update biaya_pengaturan set
  ongkir = (select (data->'biaya'->'extra'->>'ongkir')::numeric from omniseller_data where id=1),
  packaging = (select (data->'biaya'->'extra'->>'packaging')::numeric from omniseller_data where id=1),
  lain = (select (data->'biaya'->'extra'->>'lain')::numeric from omniseller_data where id=1),
  hpp_mode = (select data->'biaya'->>'hpp_mode' from omniseller_data where id=1),
  hpp_pct = (select (data->'biaya'->>'hpp_pct')::numeric from omniseller_data where id=1)
where id = 1;

update pengaturan_toko set
  nama_toko = (select data->'pengaturan'->>'nama' from omniseller_data where id=1),
  pemilik = (select data->'pengaturan'->>'pemilik' from omniseller_data where id=1),
  hp = (select data->'pengaturan'->>'hp' from omniseller_data where id=1),
  batas_stok = (select (data->'pengaturan'->>'batasStok')::int from omniseller_data where id=1),
  logo = (select data->'pengaturan'->>'logo' from omniseller_data where id=1)
where id = 1;
```

✅ Cek tiap tabel di **Table Editor** untuk memastikan data lama sudah pindah.

---

## LANGKAH 3 — Update file aplikasi

File `app.js` dan `supabase-config.js` di project Anda **sudah diperbarui**
untuk membaca/menulis ke 7 tabel ini secara otomatis (bukan lagi 1 JSON).
Tinggal:
1. Upload ulang `app.js` dan `supabase-config.js` yang baru ke GitHub
2. Vercel akan auto re-deploy
3. Login seperti biasa — data akan otomatis tersinkron ke tabel-tabel baru

---

## Contoh query yang berguna

**Total omzet bulan ini per marketplace:**
```sql
select marketplace, sum(total) as omzet, count(*) as jumlah_pesanan
from penjualan
where tgl_iso >= date_trunc('month', now())
  and status = 'Selesai'
group by marketplace
order by omzet desc;
```

**Produk dengan stok menipis (di bawah batas):**
```sql
select s.produk, s.varian, s.stok
from stok s, pengaturan_toko p
where s.stok < p.batas_stok
order by s.stok asc;
```

**Laba kotor per produk (omzet - HPP):**
```sql
select
  p.produk,
  sum(p.total) as omzet,
  sum(p.qty * coalesce(h.hpp, 0)) as total_hpp,
  sum(p.total) - sum(p.qty * coalesce(h.hpp, 0)) as laba_kotor
from penjualan p
left join hpp_per_produk h on h.produk = p.produk
where p.status = 'Selesai'
group by p.produk
order by laba_kotor desc;
```

**5 produk terlaris (qty terjual):**
```sql
select produk, sum(qty) as total_terjual
from penjualan
where status = 'Selesai'
group by produk
order by total_terjual desc
limit 5;
```

**Riwayat pesanan 1 marketplace tertentu:**
```sql
select no_pesanan, tanggal, produk, varian, qty, total, status
from penjualan
where marketplace = 'Shopee'
order by tgl_iso desc
limit 50;
```

---

## Catatan penting

- Aplikasi melakukan sinkronisasi dengan strategi **"full replace"**: setiap
  ada perubahan data, tabel terkait dihapus isinya lalu diisi ulang dari data
  terbaru di browser. Ini sederhana & aman untuk skala UMKM (ratusan–ribuan
  baris), tapi bukan cara paling efisien untuk data sangat besar (puluhan
  ribu baris ke atas).
- Tabel `biaya_pengaturan` dan `pengaturan_toko` sengaja dibuat **singleton**
  (selalu 1 baris, id=1) karena hanya ada 1 set pengaturan per toko.
- Semua tabel diberi **Row Level Security**: hanya user yang sudah login
  (`authenticated`) yang bisa baca/tulis. Tidak ada akses publik/anonim.
