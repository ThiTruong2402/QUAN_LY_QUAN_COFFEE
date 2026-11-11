import { useEffect, useState } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    open_time: '06:30',
    close_time: '23:00',
    slot_step_minutes: 15,
    min_lead_time_minutes: 30,
    auto_dispatch_before_minutes: 15,
    max_advance_days: 2,
    isOpen: true,
    currentVietnamTime: ''
  });

  const loadSettings = async () => {
    try {
      setLoading(true);
      const res = await api.get('/settings/store-hours');
      if (res.data?.success && res.data?.data) {
        setConfig(res.data.data);
      }
    } catch {
      toast.error('Lỗi tải cấu hình hệ thống');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await api.put('/settings/store-hours', config);
      toast.success(res.data?.message || 'Lưu cấu hình hệ thống thành công!');
      loadSettings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi lưu cấu hình');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: '#fde68a' }}>
        <div style={{ fontSize: '2rem' }}>⚙️</div>
        <div>Đang tải cấu hình hệ thống...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: '850px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{
        background: 'rgba(32, 20, 13, 0.85)',
        border: '1px solid rgba(245, 158, 11, 0.25)',
        borderRadius: '12px',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '2rem' }}>⚙️</span>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#fef3c7', fontFamily: "'Playfair Display', Georgia, serif" }}>
              CẤU HÌNH HỆ THỐNG &amp; GIỜ PHỤC VỤ
            </h1>
            <div style={{ fontSize: '0.8rem', color: '#c4a482', marginTop: '2px' }}>
              Quyền quản trị cấp cao nhất (Chỉ dành riêng cho Admin / Chủ quán)
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: config.isOpen ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: config.isOpen ? '1px solid #10b981' : '1px solid #ef4444',
          color: config.isOpen ? '#34d399' : '#f87171',
          padding: '6px 14px',
          borderRadius: '8px',
          fontWeight: 800,
          fontSize: '0.82rem'
        }}>
          <span>{config.isOpen ? '🟢 Quán đang mở cửa' : '🔴 Quán đang đóng cửa'}</span>
          <span style={{ color: '#fef3c7', opacity: 0.8 }}>({config.currentVietnamTime})</span>
        </div>
      </div>

      <form onSubmit={handleSave} style={{
        background: 'rgba(32, 20, 13, 0.75)',
        border: '1px solid rgba(245, 158, 11, 0.2)',
        borderRadius: '12px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px'
      }}>
        <div style={{ borderBottom: '1px solid rgba(245, 158, 11, 0.15)', paddingBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#fbbf24', fontWeight: 700 }}>
            🕒 1. Khung Giờ Mở Cửa &amp; Phục Vụ
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#a89078' }}>
            Khách đặt hàng ngoài khung giờ này sẽ bắt buộc chuyển sang chế độ Đặt trước (SCHEDULED).
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label className="form-label" style={{ fontSize: '0.84rem' }}>⏰ Giờ mở cửa quán :</label>
            <input
              type="time"
              className="form-input"
              value={config.open_time}
              onChange={(e) => setConfig({ ...config, open_time: e.target.value })}
              required
              style={{ fontSize: '0.95rem', fontWeight: 700 }}
            />
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '0.84rem' }}>🌙 Giờ đóng cửa quán :</label>
            <input
              type="time"
              className="form-input"
              value={config.close_time}
              onChange={(e) => setConfig({ ...config, close_time: e.target.value })}
              required
              style={{ fontSize: '0.95rem', fontWeight: 700 }}
            />
          </div>
        </div>

        <div style={{ borderBottom: '1px solid rgba(245, 158, 11, 0.15)', paddingBottom: '10px', marginTop: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#fbbf24', fontWeight: 700 }}>
            🗓️ 2. Thông Số Đặt Trước Hẹn Giờ (Scheduled Orders)
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#a89078' }}>
            Điều khiển các bước chọn giờ và quy tắc tự động hóa đẩy đơn cho quầy pha chế Barista.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label className="form-label" style={{ fontSize: '0.84rem' }}>⏱️ Bước chọn giờ nhận (phút) :</label>
            <select
              className="form-select"
              value={config.slot_step_minutes}
              onChange={(e) => setConfig({ ...config, slot_step_minutes: Number(e.target.value) })}
              style={{ fontWeight: 700 }}
            >
              <option value={10}>10 phút (7:00, 7:10, 7:20...)</option>
              <option value={15}>15 phút (7:00, 7:15, 7:30...)</option>
              <option value={30}>30 phút (7:00, 7:30, 8:00...)</option>
            </select>
            <small style={{ color: '#8c7662', fontSize: '0.72rem' }}>Khoảng cách giữa các mốc giờ khách có thể chọn</small>
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '0.84rem' }}>⏳ Đặt trước tối thiểu (phút) :</label>
            <input
              type="number"
              min={10}
              max={120}
              className="form-input"
              value={config.min_lead_time_minutes}
              onChange={(e) => setConfig({ ...config, min_lead_time_minutes: Number(e.target.value) })}
              required
              style={{ fontWeight: 700 }}
            />
            <small style={{ color: '#8c7662', fontSize: '0.72rem' }}>Khoảng thời gian chuẩn bị tối thiểu kể từ lúc khách đặt</small>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label className="form-label" style={{ fontSize: '0.84rem' }}>🚀 Tự động chuyển Barista trước (phút) :</label>
            <input
              type="number"
              min={5}
              max={60}
              className="form-input"
              value={config.auto_dispatch_before_minutes}
              onChange={(e) => setConfig({ ...config, auto_dispatch_before_minutes: Number(e.target.value) })}
              required
              style={{ fontWeight: 700 }}
            />
            <small style={{ color: '#8c7662', fontSize: '0.72rem' }}>Hệ thống tự động chuyển SCHEDULED ➔ PENDING trước giờ hẹn nhận</small>
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '0.84rem' }}>📅 Cho phép đặt trước tối đa (ngày) :</label>
            <input
              type="number"
              min={1}
              max={7}
              className="form-input"
              value={config.max_advance_days}
              onChange={(e) => setConfig({ ...config, max_advance_days: Number(e.target.value) })}
              required
              style={{ fontWeight: 700 }}
            />
            <small style={{ color: '#8c7662', fontSize: '0.72rem' }}>Số ngày tương lai tối đa khách được phép đặt trước</small>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '14px', borderTop: '1px solid rgba(245, 158, 11, 0.15)', paddingTop: '16px' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={loadSettings}
            disabled={saving}
          >
            🔄 Hoàn tác
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving}
            style={{ minWidth: '150px', background: 'linear-gradient(135deg, #d97706, #b45309)', fontWeight: 800 }}
          >
            {saving ? 'Đang lưu...' : '💾 Lưu Cấu Hình'}
          </button>
        </div>
      </form>
    </div>
  );
}

