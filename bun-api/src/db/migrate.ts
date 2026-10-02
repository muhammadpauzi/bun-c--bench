import { client } from "./index";

export async function migrateAndSeed() {
  console.log("⏳ Creating tables in PostgreSQL...");

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

  console.log("✅ Tables created.");

  // Check if categories already exist
  const existingCategories = await client`SELECT count(*) FROM categories`;
  if (Number(existingCategories[0]?.count ?? 0) === 0) {
    console.log("🌱 Seeding initial data...");

    const [catBuku] = await client`
      INSERT INTO categories (name, slug)
      VALUES ('Buku Pelajaran', 'buku-pelajaran')
      RETURNING id;
    `;

    const [catGadget] = await client`
      INSERT INTO categories (name, slug)
      VALUES ('Gadget', 'gadget')
      RETURNING id;
    `;

    if (catBuku && catGadget) {
      await client`
        INSERT INTO products (name, price, category_id)
        VALUES 
          ('Buku Paket Matematika Kelas X', 120000.00, ${catBuku.id}),
          ('Buku Paket Fisika Kelas X', 135000.00, ${catBuku.id}),
          ('Buku Kimia Dasar', 95000.00, ${catBuku.id}),
          ('Samsung Galaxy A54', 4999000.00, ${catGadget.id}),
          ('Xiaomi Redmi Note 13', 2499000.00, ${catGadget.id});
      `;
      console.log("✅ Seed data inserted successfully!");
    }
  } else {
    console.log("ℹ️ Database already contains data. Skipped seeding.");
  }
}

if (import.meta.main) {
  migrateAndSeed()
    .then(() => {
      console.log("🚀 Migration & seed complete!");
      process.exit(0);
    })
    .catch((err) => {
      console.error("❌ Migration failed:", err);
      process.exit(1);
    });
}
