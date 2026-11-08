(async () => {
  const urls = [
    'http://localhost:5173/images/snacks/hat_huong_duong_rang_moc.jpg',
    'http://localhost:5173/images/snacks/hat_huong_duong_vi_dua.jpg',
    'http://localhost:5173/images/snacks/hat_bi_rang_muoi.jpg',
    'http://localhost:5173/images/snacks/kho_ga_la_chanh.jpg',
    'http://localhost:5173/images/snacks/kho_bo_mieng_cay.jpg',
    'http://localhost:5173/images/snacks/dau_phong_toi_ot.jpg',
    'http://localhost:5173/images/snacks/banh_trang_nuong.jpg',
  ];

  for (const u of urls) {
    try {
      const res = await fetch(u);
      console.log(`${u} -> HTTP ${res.status} (${res.headers.get('content-type')})`);
    } catch (e) {
      console.error(`${u} -> Error: ${e.message}`);
    }
  }
  process.exit(0);
})();

