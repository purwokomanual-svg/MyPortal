/* =========================================================
   KONFIGURASI SUPABASE
   =========================================================
   1. Buat project baru di https://supabase.com
   2. Buka Project Settings -> API
   3. Salin "Project URL" ke SUPABASE_URL di bawah ini
   4. Salin "anon public" key ke SUPABASE_ANON_KEY di bawah ini

   Catatan keamanan: anon key AMAN untuk ditaruh di kode frontend/publik.
   Keamanan data per-user dijamin oleh Row Level Security (RLS) yang
   didefinisikan di file supabase/schema.sql — BUKAN oleh kerahasiaan
   anon key ini. Jangan pernah menaruh "service_role" key di frontend.
   ========================================================= */
const SUPABASE_URL = "https://lbwmmppaunqikpollvhg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxid21tcHBhdW5xaWtwb2xsdmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0NTk3NzAsImV4cCI6MjA5ODAzNTc3MH0.O-tEKALTaAwAgVRnC3CKfDxAFuqq8-f43Mlmr7X6F3s";
