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
      <div style={{ textAlign: 'center', padding: '60px 0', color: '#8C5E3C' }}>
        <div style={{ fontSize: '2rem' }}>⚙️</div>
        <div style={{ marginTop: '8px', fontWeight: 600 }}>Đang tải cấu hình hệ thống...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. HEADER CARD */}
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E7DFD5',
        borderRadius: '14px',
        padding: '18px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px',
        boxShadow: '0 2px 8px rgba(44, 26, 18, 0.04)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #FFF4E5 0%, #FFE6CC 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.4rem'
          }}>
            ⚙️
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#2C1A12', fontFamily: "'Playfair Display', Georgia, serif" }}>
              CẤU HÌNH HỆ THỐNG &amp; GIỜ PHỤC VỤ
            </h1>
            <div style={{ fontSize: '0.82rem', color: '#8C5E3C', marginTop: '2px' }}>
              Kiểm soát giờ mở/đóng cửa và thông số lập lịch nhận đồ uống toàn hệ thống
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: config.isOpen ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: config.isOpen ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
          color: config.isOpen ? '#059669' : '#dc2626',
          padding: '8px 16px',
          borderRadius: '10px',
          fontWeight: 700,
          fontSize: '0.86rem'
        }}>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: config.isOpen ? '#10b981' : '#ef4444' }} />
          <span>{config.isOpen ? 'Quán đang mở cửa' : 'Quán đang đóng cửa'}</span>
          <span style={{ color: '#6B5E55', fontWeight: 500, fontSize: '0.8rem' }}>({config.currentVietnamTime || 'GMT+7'})</span>
        </div>
      </div>

      {/* 2. FORM CONFIGURATION */}
      <form onSubmit={handleSave} style={{
        background: '#FFFFFF',
        border: '1px solid #E7DFD5',
        borderRadius: '14px',
        padding: '24px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: '22px',
        boxShadow: '0 2px 8px rgba(44, 26, 18, 0.04)'
      }}>
        {/* Section 1: Store Hours */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #E7DFD5', paddingBottom: '10px', marginBottom: '16px' }}>
            <span style={{ fontSize: '1.15rem' }}>🕒</span>
            <h3 style={{ margin: 0, fontSize: '1.02rem', color: '#2C1A12', fontWeight: 800 }}>
              1. Khung Giờ Mở Cửa &amp; Phục Vụ
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.84rem', fontWeight: 700, color: '#2C1A12', marginBottom: '6px', display: 'block' }}>
                ⏰ Giờ mở cửa đón khách :
              </label>
              <input
                type="time"
                className="form-input"
                value={config.open_time}
                onChange={(e) => setConfig({ ...config, open_time: e.target.value })}
                required
                style={{ fontSize: '0.95rem', fontWeight: 700 }}
              />
              <span style={{ fontSize: '0.74rem', color: '#8C5E3C', marginTop: '4px', display: 'block' }}>
                Hệ thống bắt đầu nhận đơn tại quầy &amp; trực tuyến
              </span>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.84rem', fontWeight: 700, color: '#2C1A12', marginBottom: '6px', display: 'block' }}>
                🌙 Giờ đóng cửa ngừng phục vụ :
              </label>
              <input
                type="time"
                className="form-input"
                value={config.close_time}
                onChange={(e) => setConfig({ ...config, close_time: e.target.value })}
                required
                style={{ fontSize: '0.95rem', fontWeight: 700 }}
              />
              <span style={{ fontSize: '0.74rem', color: '#8C5E3C', marginTop: '4px', display: 'block' }}>
                Các đơn hàng sau giờ này sẽ tự động chuyển sang hẹn lịch hôm sau
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Advance Order Parameters */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #E7DFD5', paddingBottom: '10px', marginBottom: '16px' }}>
            <span style={{ fontSize: '1.15rem' }}>🗓️</span>
            <h3 style={{ margin: 0, fontSize: '1.02rem', color: '#2C1A12', fontWeight: 800 }}>
              2. Thông Số Đặt Trước &amp; Hẹn Giờ Lấy Món
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.84rem', fontWeight: 700, color: '#2C1A12', marginBottom: '6px', display: 'block' }}>
                ⏱️ Bước chọn khung giờ (phút) :
              </label>
              <select
                className="form-select"
                value={config.slot_step_minutes}
                onChange={(e) => setConfig({ ...config, slot_step_minutes: Number(e.target.value) })}
                style={{ fontWeight: 700 }}
              >
                <option value={10}>10 phút / slot</option>
                <option value={15}>15 phút / slot (Khuyến nghị)</option>
                <option value={30}>30 phút / slot</option>
              </select>
              <span style={{ fontSize: '0.74rem', color: '#8C5E3C', marginTop: '4px', display: 'block' }}>
                Khoảng giãn cách giữa các mốc giờ khách có thể chọn
              </span>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.84rem', fontWeight: 700, color: '#2C1A12', marginBottom: '6px', display: 'block' }}>
                ⏳ Đặt trước tối thiểu (phút) :
              </label>
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
              <span style={{ fontSize: '0.74rem', color: '#8C5E3C', marginTop: '4px', display: 'block' }}>
                Thời gian tối thiểu Barista cần chuẩn bị món hẹn giờ
              </span>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.84rem', fontWeight: 700, color: '#2C1A12', marginBottom: '6px', display: 'block' }}>
                🚀 Tự động bắn lệnh Barista trước (phút) :
              </label>
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
              <span style={{ fontSize: '0.74rem', color: '#8C5E3C', marginTop: '4px', display: 'block' }}>
                Hệ thống tự động kích hoạt vé pha chế trước giờ hẹn lấy
              </span>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.84rem', fontWeight: 700, color: '#2C1A12', marginBottom: '6px', display: 'block' }}>
                📅 Cho phép đặt trước tối đa (ngày) :
              </label>
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
              <span style={{ fontSize: '0.74rem', color: '#8C5E3C', marginTop: '4px', display: 'block' }}>
                Số ngày tới tối đa khách hàng có thể lên lịch đơn
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Action Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '12px',
          marginTop: '10px',
          borderTop: '1px solid #E7DFD5',
          paddingTop: '18px'
        }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={loadSettings}
            disabled={saving}
            style={{ fontWeight: 600, padding: '8px 18px' }}
          >
            🔄 Hoàn tác
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving}
            style={{
              minWidth: '160px',
              background: 'linear-gradient(135deg, #C86A28 0%, #A85318 100%)',
              borderColor: '#C86A28',
              fontWeight: 800,
              padding: '9px 22px',
              boxShadow: '0 4px 12px rgba(200, 106, 40, 0.25)'
            }}
          >
            {saving ? 'Đang lưu...' : '💾 Lưu Cấu Hình'}
          </button>
        </div>
      </form>
    </div>
  );
}
