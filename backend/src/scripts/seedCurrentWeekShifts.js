const pool = require('../config/db');

async function seedCurrentWeekShifts() {
  try {
    console.log('🗓️ Seeding work shifts for current week and surrounding dates...');

    // Users:
    // 1: Nguyễn Hoàng Long (Admin)
    // 3: Lê Thu Hà (Cashier)
    // 4: Hoàng Văn Nam (Waiter)
    // 5: Đặng Minh Tuấn (Barista)
    // 6: Vũ Khánh Linh (Barista)
    // 7: Phạm Thúy An (Waiter)
    // 8: Bùi Quốc Hoàng (Warehouse)
    // 9: Ngô Tiến Đức (Admin)

    const shiftsToInsert = [];
    let shiftCounter = 200;

    // Date range: 2026-11-01 to 2026-11-15 (15 days)
    for (let day = 1; day <= 15; day++) {
      const dayStr = day < 10 ? `0${day}` : `${day}`;
      const dateStr = `2026-11-${dayStr}`;
      const dateObj = new Date(dateStr);
      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

      // 1. Nguyễn Hoàng Long (Admin): Hành chính Thứ 2 - Thứ 6
      if (!isWeekend) {
        shiftCounter++;
        shiftsToInsert.push({
          code: `CA11${dayStr}-${shiftCounter}`,
          user_id: 1,
          type: 'Ca Hành Chính (08:00 - 17:00)',
          date: dateStr,
          status: day < 7 ? 'Hoàn thành' : (day === 7 ? 'Đang làm việc' : 'Chưa bắt đầu'),
          note: 'Quản lý vận hành toàn quán & doanh thu POS'
        });
      }

      // 2. Lê Thu Hà (Cashier): Ca Sáng các ngày chẵn, Ca Tối các ngày lẻ
      shiftCounter++;
      const cashierMorning = day % 2 === 0;
      shiftsToInsert.push({
        code: `CA11${dayStr}-${shiftCounter}`,
        user_id: 3,
        type: cashierMorning ? 'Ca Sáng (06:30 - 14:30)' : 'Ca Chiều / Tối (14:30 - 22:30)',
        date: dateStr,
        status: day < 7 ? 'Hoàn thành' : (day === 7 ? 'Đang làm việc' : 'Chưa bắt đầu'),
        note: cashierMorning ? 'Thu ngân quầy chính, kiểm đếm két đầu ca' : 'Thu ngân quầy tối, chốt doanh thu cuối ngày'
      });

      // 3. Đặng Minh Tuấn (Barista 1): Ca Sáng
      shiftCounter++;
      shiftsToInsert.push({
        code: `CA11${dayStr}-${shiftCounter}`,
        user_id: 5,
        type: 'Ca Sáng (06:30 - 14:30)',
        date: dateStr,
        status: day < 7 ? 'Hoàn thành' : (day === 7 ? 'Đang làm việc' : 'Chưa bắt đầu'),
        note: 'Trưởng quầy pha chế ca sáng, chuẩn bị cốt cà phê & trà'
      });

      // 4. Vũ Khánh Linh (Barista 2): Ca Chiều / Tối
      shiftCounter++;
      shiftsToInsert.push({
        code: `CA11${dayStr}-${shiftCounter}`,
        user_id: 6,
        type: 'Ca Chiều / Tối (14:30 - 22:30)',
        date: dateStr,
        status: day < 7 ? 'Hoàn thành' : (day === 7 ? 'Đang làm việc' : 'Chưa bắt đầu'),
        note: 'Pha chế ca tối, vệ sinh máy pha espresso cuối ca'
      });

      // 5. Hoàng Văn Nam (Waiter 1): Ca Sáng
      shiftCounter++;
      shiftsToInsert.push({
        code: `CA11${dayStr}-${shiftCounter}`,
        user_id: 4,
        type: 'Ca Sáng (06:30 - 14:30)',
        date: dateStr,
        status: day < 7 ? 'Hoàn thành' : (day === 7 ? 'Đang làm việc' : 'Chưa bắt đầu'),
        note: 'Bê đồ uống ra bàn, hỗ trợ khách'
      });

      // 6. Phạm Thúy An (Waiter 2): Ca Chiều / Tối
      shiftCounter++;
      shiftsToInsert.push({
        code: `CA11${dayStr}-${shiftCounter}`,
        user_id: 7,
        type: 'Ca Chiều / Tối (14:30 - 22:30)',
        date: dateStr,
        status: day < 7 ? 'Hoàn thành' : (day === 7 ? 'Đang làm việc' : 'Chưa bắt đầu'),
        note: 'Phục vụ bàn ca tối, dọn dẹp sảnh'
      });

      // 7. Bùi Quốc Hoàng (Thủ kho): Thứ 2 - Thứ 7
      if (dateObj.getDay() !== 0) {
        shiftCounter++;
        shiftsToInsert.push({
          code: `CA11${dayStr}-${shiftCounter}`,
          user_id: 8,
          type: 'Ca Hành Chính (08:00 - 17:00)',
          date: dateStr,
          status: day < 7 ? 'Hoàn thành' : (day === 7 ? 'Đang làm việc' : 'Chưa bắt đầu'),
          note: 'Kiểm kê tồn kho, xuất nguyên liệu cho quầy bar'
        });
      }

      // 8. Ngô Tiến Đức (Admin): Ca Chiều / Tối cuối tuần & Thứ 4
      if (isWeekend || day % 4 === 0) {
        shiftCounter++;
        shiftsToInsert.push({
          code: `CA11${dayStr}-${shiftCounter}`,
          user_id: 9,
          type: 'Ca Chiều / Tối (14:30 - 22:30)',
          date: dateStr,
          status: day < 7 ? 'Hoàn thành' : (day === 7 ? 'Đang làm việc' : 'Chưa bắt đầu'),
          note: 'Giám sát dịch vụ giờ cao điểm tối'
        });
      }
    }

    // Clear any existing shifts in Nov 2026 to avoid duplicates
    await pool.query("DELETE FROM work_shifts WHERE shift_date >= '2026-11-01'");

    // Bulk insert
    for (const s of shiftsToInsert) {
      await pool.query(
        'INSERT INTO work_shifts (shift_code, user_id, shift_type, shift_date, status, note) VALUES (?, ?, ?, ?, ?, ?)',
        [s.code, s.user_id, s.type, s.date, s.status, s.note]
      );
    }

    console.log(`✅ Successfully seeded ${shiftsToInsert.length} work shifts for 2026-11-01 to 2026-11-15!`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding shifts:', err);
    process.exit(1);
  }
}

seedCurrentWeekShifts();

