import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const TARGET_URL = __ENV.TARGET_URL || "http://localhost:3000";

const trendLookup = new Trend("case_single_lookup_duration");
const trendBrowse = new Trend("case_browse_page_duration");
const trendInsert = new Trend("case_submit_data_duration");
const errorRate = new Rate("error_rate");

export const options = {
  scenarios: {
    // Simulasi traffic masal ujian/kelulusan/PPDB serentak
    ppdb_cbt_rush: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 50 },   // Step 1: 50 Siswa (Pemanasan)
        { duration: "20s", target: 150 },  // Step 2: 150 Siswa (Traffic Mulai Ramai)
        { duration: "30s", target: 300 },  // Step 3: 300 Siswa (Pengumuman Dibuka / Ujian Mulai)
        { duration: "20s", target: 400 },  // Step 4: 400 Siswa (Puncak Lonjakan Ekstrem)
        { duration: "10s", target: 0 },    // Step 5: Selesai / Cool down
      ],
      gracefulRampDown: "5s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],    // Toleransi error max 5%
    http_req_duration: ["p(95)<2000"],  // 95% request harus di bawah 2 detik
  },
};

export default function () {
  const rand = Math.random();

  if (rand < 0.60) {
    // 60% Read: Cek Status / Single Lookup (Read by ID / Categories)
    // Mirip siswa cek NISN / hasil seleksi kelulusan
    const res = http.get(`${TARGET_URL}/api/categories`);
    trendLookup.add(res.timings.duration);
    const ok = check(res, {
      "lookup status 200": (r) => r.status === 200,
    });
    errorRate.add(!ok);
  } else if (rand < 0.85) {
    // 25% Browse: Lihat daftar pengumuman / paginasi halaman awal (page 1..10)
    const page = Math.floor(Math.random() * 10) + 1;
    const res = http.get(`${TARGET_URL}/api/products?page=${page}&limit=10`);
    trendBrowse.add(res.timings.duration);
    const ok = check(res, {
      "browse page 200": (r) => r.status === 200,
      "has items": (r) => {
        const body = r.json();
        return Array.isArray(body?.data) && body.data.length > 0;
      },
    });
    errorRate.add(!ok);
  } else {
    // 15% Write: Kirim Jawaban CBT / Submit Formulir Pendaftaran PPDB
    const res = http.post(
      `${TARGET_URL}/api/products`,
      JSON.stringify({
        name: `Siswa_${__VU}_${Date.now()}`,
        price: 100000.00,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
    trendInsert.add(res.timings.duration);
    const ok = check(res, {
      "submit status 201": (r) => r.status === 201,
    });
    errorRate.add(!ok);
  }

  // Zero sleep for maximum hardware saturation
}
