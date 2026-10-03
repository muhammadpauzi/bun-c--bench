import { client } from "./index";

export async function seed500k() {
  console.log("🚀 Starting database optimization and 500k seeding...");
  const overallStart = performance.now();

  // 1. Ensure extensions and schema
  await client`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`;
  await client`CREATE EXTENSION IF NOT EXISTS pg_trgm;`;

  await client`
    CREATE TABLE IF NOT EXISTS categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await client`
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      price NUMERIC(12, 2) NOT NULL,
      category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  // 2. Insert 15 rich realistic categories
  console.log("📂 Ensuring categories exist...");
  const categoriesList = [
    { name: "Buku Pelajaran & Edukasi", slug: "buku-pelajaran" },
    { name: "Gadget & Smartphone", slug: "gadget-smartphone" },
    { name: "Laptop & Komputer", slug: "laptop-komputer" },
    { name: "Elektronik Rumah Tangga", slug: "elektronik-rumah" },
    { name: "Pakaian Pria & Fashion", slug: "pakaian-pria" },
    { name: "Pakaian Wanita & Dress", slug: "pakaian-wanita" },
    { name: "Sepatu & Sandal", slug: "sepatu-sandal" },
    { name: "Makanan & Minuman Segar", slug: "makanan-minuman" },
    { name: "Otomotif & Aksesoris Motor Mobil", slug: "otomotif-aksesoris" },
    { name: "Olahraga & Perlengkapan Outdoor", slug: "olahraga-outdoor" },
    { name: "Kecantikan & Perawatan Diri", slug: "kecantikan-perawatan" },
    { name: "Mainan & Hobi Edukasi", slug: "mainan-hobi" },
    { name: "Perlengkapan & Seragam Sekolah", slug: "perlengkapan-sekolah" },
    { name: "Furniture & Dekorasi Rumah", slug: "furniture-dekorasi" },
    { name: "Alat Tulis Kantor & Kertas", slug: "alat-tulis-kantor" },
  ];

  for (const cat of categoriesList) {
    await client`
      INSERT INTO categories (name, slug)
      VALUES (${cat.name}, ${cat.slug})
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;
    `;
  }

  // 3. Clear existing products to ensure clean exactly 500,000 data
  console.log("🧹 Clearing old products data for fresh 500k seed...");
  await client`TRUNCATE TABLE products CASCADE;`;

  // 4. Generate 500,000 realistic products with high performance SQL generate_series
  console.log("🌱 Inserting 500,000 products via PostgreSQL bulk generator...");
  const insertStart = performance.now();

  await client`
    WITH cats AS (
      SELECT array_agg(id) AS cat_ids FROM categories
    ),
    prefixes AS (
      SELECT ARRAY[
        'Buku Paket', 'Smartphone', 'Laptop Gaming', 'Sepatu Lari', 'Kemeja Formal',
        'Celana Jeans', 'Smart TV LED', 'Kopi Bubuk', 'Helm Fullface', 'Raket Badminton',
        'Serum Wajah', 'Lego Robotik', 'Tas Ransel', 'Meja Kerja Minimalis', 'Bolpoin Gel Premium'
      ] AS pfx
    ),
    brands AS (
      SELECT ARRAY[
        'Matematika SMA', 'Samsung Galaxy S24', 'Asus ROG Strix', 'Nike Air Zoom', 'Uniqlo Oxford',
        'Levis 501 Original', 'LG OLED Evo', 'Robusta Gayo Premium', 'KYT TT Course', 'Yonex Astrox 99',
        'Somethinc 5% Niacinamide', 'Star Wars Millennium', 'Eiger Wanderlust 45L', 'IKEA Bekant Height', 'Pilot G2 0.5',
        'Fisika Terapan SMK', 'Xiaomi Redmi Note 13', 'Lenovo Legion Pro', 'Adidas Ultraboost Light', 'Erigo Streetwear',
        'Zara Dress Floral', 'Sony Bravia 4K', 'Arabica Mandheling Gold', 'Shoei NXR 2', 'Li-Ning Axforce 80',
        'Skintific 5X Ceramide', 'Marvel Avengers Tower', 'Consina Everest 60L', 'Informa Standing Desk', 'Faber-Castell Grip 2011'
      ] AS brd
    ),
    suffixes AS (
      SELECT ARRAY[
        'Edisi Kurikulum Merdeka', 'Pro Max 5G 256GB', 'Ultra Edition RTX 4080', 'Series 2026', 'Limited Special Edition',
        'Original Premium Garansi Resmi', '4K Ultra HD HDR10', 'Special Blend Roast 500g', 'Carbon Double D Ring', 'Super Light Carbon Graphite',
        'Barrier Repair 50ml', 'Collector Edition 1500 Pcs', 'Waterproof Outdoor Series', 'Ergonomic Dual Motor', 'Pack of 12 pcs Box',
        'Revisi Terbaru Guru & Siswa', 'Snapdragon 8 Gen 3', '32GB RAM DDR5 1TB SSD', 'Breathable Cushioning Sole', 'Oversized Vintage Washed'
      ] AS sfx
    )
    INSERT INTO products (id, name, price, category_id, created_at, updated_at)
    SELECT
      gen_random_uuid(),
      pfx[1 + ((i * 7) % array_length(pfx, 1))] || ' ' ||
      brd[1 + ((i * 13) % array_length(brd, 1))] || ' ' ||
      sfx[1 + ((i * 19) % array_length(sfx, 1))] || ' #' || i,
      (10000 + ((i * 37) % 24990000))::numeric(12, 2),
      cat_ids[1 + (i % array_length(cat_ids, 1))],
      NOW() - ((i % 365) || ' days')::interval - ((i % 86400) || ' seconds')::interval,
      NOW()
    FROM generate_series(1, 500000) AS i, cats, prefixes, brands, suffixes;
  `;

  const insertDuration = ((performance.now() - insertStart) / 1000).toFixed(2);
  console.log(`✅ 500,000 products inserted in ${insertDuration} seconds!`);

  // 5. Build high performance indexes
  console.log("⚡ Building optimized database indexes...");
  const indexStart = performance.now();

  await client`CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);`;
  await client`CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);`;
  await client`CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);`;
  await client`CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin(name gin_trgm_ops);`;
  await client`CREATE INDEX IF NOT EXISTS idx_products_name_fts ON products USING gin(to_tsvector('simple', name));`;
  await client`CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);`;

  const indexDuration = ((performance.now() - indexStart) / 1000).toFixed(2);
  console.log(`✅ Indexes built in ${indexDuration} seconds!`);

  // 6. Verify total count
  const countRes = await client`SELECT count(*) FROM products;`;
  const catCount = await client`SELECT count(*) FROM categories;`;

  const totalTime = ((performance.now() - overallStart) / 1000).toFixed(2);
  console.log(`\n🎉 SEED 500K COMPLETE!`);
  console.log(`📊 Categories in DB : ${catCount[0]?.count}`);
  console.log(`📊 Products in DB   : ${countRes[0]?.count}`);
  console.log(`⏱️ Total Time Taken : ${totalTime} seconds\n`);
}

if (import.meta.main) {
  seed500k()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Seeding failed:", err);
      process.exit(1);
    });
}
