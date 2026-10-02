# Gogolabs Product Catalog & Dynamic Query System

Sistem manajemen katalog produk skala besar (500.000+ data) dengan Bun runtime, Native PostgreSQL (`bun:sql`), Drizzle ORM, Dynamic Filtering, Recursive Sorting, Generic Grouping dengan normalisasi otomatis, serta Frontend Admin Panel interaktif menggunakan Vite, React.js (TypeScript), dan Tailwind CSS v4.

---

## 🚀 Fitur Utama

### 1. Backend (Bun + PostgreSQL + Drizzle ORM)
- **High-Performance Querying**: Memanfaatkan PostgreSQL B-Tree + GIN Trigram indexes (`pg_trgm`) untuk pencarian substring cepat di 500.000 data.
- **Dynamic Query Engine (`src/lib/query-engine.ts`)**:
  - Filter rekursif `AND` dan `OR`.
  - Operator lengkap: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `in`, `is_null`, `is_not_null`.
  - Support direct `categoryId` filtering (tanpa join relasi jika hanya butuh ID) serta filter relasional `category.slug` / `category.name`.
  - Type-safe field whitelist: mencegah SQL injection atau unindexed column scans.
  - Normalisasi otomatis string ISO Date ke native JS `Date` untuk timestamp Drizzle.
- **Generic Grouping Engine (`src/lib/grouper.ts`)**:
  - Output standar: `{ groupKey, groupLabel, groupMeta, totalItems, items: [] }`.
  - Normalisasi otomatis field tanggal/timestamp (`year`, `month`, `day`, `hour`).
  - Normalisasi otomatis angka/integer (`numberBucket`, e.g. kelipatan 5.000.000).
  - Normalisasi boolean dan penanganan null-safe.
- **Production-Ready Logging (`src/lib/logger.ts`)**:
  - Dual-mode logger berbasis `pino`.
  - Mode development: `pino-pretty` dengan ANSI syntax-highlighted SQL box report & timing execution.
  - Mode production: Structured NDJSON log streaming.
- **CORS & Preflight Ready**: Mendukung akses langsung dari frontend dev server (`localhost:5173`) maupun direct API calls.

### 2. Frontend Admin Panel (`frontend/`)
- Dibangun dengan **Vite + React 19 + TypeScript + Tailwind CSS v4 + Lucide Icons**.
- **Admin Direct Category Select**: Otomatis mengambil daftar kategori dari `GET /api/categories`.
- **Search & Price Range Filter**: Real-time debounce input nama produk, filter rentang harga min/max, dan tombol Reset Filter.
- **Grouping Mode Switcher**:
  1. *Flat Table*: Tampilan tabel standar tanpa grup.
  2. *Group by Category*: Mengelompokkan produk berdasarkan kategori (dengan badge slug).
  3. *Group by Month / Day*: Mengelompokkan berdasarkan tanggal pembuatan (timestamp truncation).
  4. *Group by Price Range*: Mengelompokkan berdasarkan rentang harga per 5 juta rupiah.
- **Collapsible / Accordion Groups**: Baris grup dapat di-klik untuk membuka/menutup daftar item di dalamnya.
- **Dynamic Sorting & Pagination**: Dukungan sort field (Nama, Kategori, Harga, Tanggal) dan asc/desc, limit per halaman, serta indikator waktu eksekusi PostgreSQL (ms).

---

## 📦 Menjalankan Proyek

### 1. Menjalankan Database PostgreSQL
Pastikan container PostgreSQL berjalan (contoh Docker Compose atau lokal):
```bash
# Pastikan PostgreSQL aktif di port 5432
# Database: gogoskola_db | User: dev | Password: dev
```

Jika database baru dibuat, jalankan migrasi dan seeder:
```bash
bun run db:migrate
bun run seed:500k     # Memasukkan 500.000 data produk dalam ~6 detik
```

### 2. Menjalankan Backend Server
```bash
bun run dev
# Server berjalan di http://localhost:3000
```

### 3. Menjalankan Frontend Admin Panel
Buka terminal baru:
```bash
bun run frontend:dev
# Buka http://localhost:5173 di browser
```

---

## 🧪 Testing & Verifikasi

### Unit Test Otomatis
```bash
bun test
```
Menjalankan 12 automated unit tests mencakup query engine, direct category filtering, dynamic operators, nested recursive logic, field whitelisting, generic grouping normalization, dan API endpoints.

### API Testing (Postman & REST Client)
- **`API.http`**: 21 skenario pengujian siap pakai untuk ekstensi REST Client (VS Code) atau JetBrains HTTP Client.
- **`postman/`**: Koleksi Postman lengkap mencakup semua endpoint, parameter filtering, sorting, pagination, dan generic grouping payloads.
