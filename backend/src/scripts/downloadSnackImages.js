const fs = require('fs');
const path = require('path');

const targetDir = path.resolve(__dirname, '../../../frontend/public/images/snacks');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const imagesToDownload = [
  {
    name: 'hat_huong_duong_rang_moc.jpg',
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Sunflower_Seeds_Kaldari.jpg?width=600',
  },
  {
    name: 'hat_huong_duong_vi_dua.jpg',
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Sunflowers_seeds.jpg?width=600',
  },
  {
    name: 'hat_bi_rang_muoi.jpg',
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Pumpkin_seeds.jpg?width=600',
  },
  {
    name: 'kho_bo_mieng_cay.jpg',
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Beef-jerky.jpg?width=600',
  },
  {
    name: 'dau_phong_toi_ot.jpg',
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Roasted_peanuts.jpg?width=600',
  },
  {
    name: 'banh_trang_nuong.jpg',
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Pizzabanhtrangnuong1.jpg?width=600',
  },
  {
    name: 'kho_ga_la_chanh.jpg',
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Ch%C3%A0_b%C3%B4ng_nh%C3%A0_l%C3%A0m_ng21th8n2019_%281%29.jpg?width=600',
  },
];

async function downloadAll() {
  for (const item of imagesToDownload) {
    const dest = path.join(targetDir, item.name);
    try {
      console.log(`Downloading ${item.name}...`);
      const res = await fetch(item.url, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'MyCoffeeHouse/1.0 (https://mycoffeehouse.vn; contact@mycoffeehouse.vn) bot'
        }
      });
      if (!res.ok) {
        console.error(`Failed ${item.name}: HTTP ${res.status}`);
        continue;
      }
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(dest, buffer);
      console.log(`✓ Saved ${item.name} (${buffer.length} bytes)`);
    } catch (err) {
      console.error(`Error downloading ${item.name}:`, err.message);
    }
  }
}

downloadAll();
