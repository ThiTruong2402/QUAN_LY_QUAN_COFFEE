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
    if (!config.open_time || !config.close_time) {
      return toast.error('Vui lòng nhập đầy đủ giờ mở cửa và giờ đóng cửa!');
    }
    if (config.open_time === config.close_time) {
      return toast.error('Giờ mở cửa và giờ đóng cửa không được trùng nhau!');
    }
    if (Number(config.auto_dispatch_before_minutes) >= Number(config.min_lead_time_minutes)) {
      return toast.error('Thời gian tự động chuyển Barista phải nhỏ hơn thời gian đặt trước tối thiểu!');
    }
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
      <div style={{ textAlign: 'center', padding: '60px 0', color: '#A1A1AA' }}>
        <div style={{ fontSize: '2rem' }}>⚙️</div>
        <div style={{ marginTop: '8px', fontWeight: 600 }}>Đang tải cấu hình hệ thống...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 1. TRẠNG THÁI CỬA HÀNG GỌN GÀNG (Bỏ tiêu đề lặp TopBar) */}
      <div style={{
        background: '#18181B',
        border: '1px solid #2A2A30',
        borderRadius: '14px',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div style={{ fontSize: '0.84rem', color: '#A1A1AA' }}>
          Giờ mở/đóng cửa &amp; thông số đặt hẹn toàn hệ thống
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: config.isOpen ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)',
          border: config.isOpen ? '1px solid rgba(52, 211, 153, 0.3)' : '1px solid rgba(248, 113, 113, 0.3)',
          color: config.isOpen ? '#34D399' : '#F87171',
          padding: '6px 14px',
          borderRadius: '999px',
          fontWeight: 700,
          fontSize: '0.82rem'
        }}>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: config.isOpen ? '#10B981' : '#EF4444' }} />
          <span>{config.isOpen ? 'Quán đang mở cửa' : 'Quán đang đóng cửa'}</span>
          <span style={{ color: '#A1A1AA', fontWeight: 500, fontSize: '0.78rem' }}>({config.currentVietnamTime || 'GMT+7'})</span>
        </div>
      </div>

      {/* 2. FORM CONFIGURATION */}
      <form onSubmit={handleSave} style={{
        background: '#18181B',
        border: '1px solid #2A2A30',
        borderRadius: '16px',
        padding: '22px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}>
        {/* Section 1: Store Hours */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #2A2A30', paddingBottom: '10px', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '0.96rem', color: '#F4F1EC', fontWeight: 700 }}>
              1. Khung giờ mở cửa &amp; phục vụ
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                Giờ mở cửa đón khách
              </label>
              <input
                type="time"
                className="form-input"
                value={config.open_time}
                onChange={(e) => setConfig({ ...config, open_time: e.target.value })}
                required
                style={{ width: '100%', fontSize: '0.92rem', fontWeight: 700 }}
              />
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                Giờ đóng cửa ngừng phục vụ
              </label>
              <input
                type="time"
                className="form-input"
                value={config.close_time}
                onChange={(e) => setConfig({ ...config, close_time: e.target.value })}
                required
                style={{ width: '100%', fontSize: '0.92rem', fontWeight: 700 }}
              />
            </div>
          </div>
        </div>

        {/* Section 2: Advance Order Parameters */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #2A2A30', paddingBottom: '10px', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '0.96rem', color: '#F4F1EC', fontWeight: 700 }}>
              2. Thông số đặt trước &amp; hẹn giờ lấy món
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                Bước chọn khung giờ (phút)
              </label>
              <select
                className="form-select"
                value={config.slot_step_minutes}
                onChange={(e) => setConfig({ ...config, slot_step_minutes: Number(e.target.value) })}
                style={{ width: '100%', fontWeight: 600 }}
              >
                <option value={10}>10 phút / slot</option>
                <option value={15}>15 phút / slot (Khuyến nghị)</option>
                <option value={30}>30 phút / slot</option>
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                Đặt trước tối thiểu (phút)
              </label>
              <input
                type="number"
                min={10}
                max={120}
                className="form-input"
                value={config.min_lead_time_minutes}
                onChange={(e) => setConfig({ ...config, min_lead_time_minutes: Number(e.target.value) })}
                required
                style={{ width: '100%', fontWeight: 700 }}
              />
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                Tự động chuyển Barista trước (phút)
              </label>
              <input
                type="number"
                min={5}
                max={60}
                className="form-input"
                value={config.auto_dispatch_before_minutes}
                onChange={(e) => setConfig({ ...config, auto_dispatch_before_minutes: Number(e.target.value) })}
                required
                style={{ width: '100%', fontWeight: 700 }}
              />
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                Cho phép đặt trước tối đa (ngày)
              </label>
              <input
                type="number"
                min={1}
                max={7}
                className="form-input"
                value={config.max_advance_days}
                onChange={(e) => setConfig({ ...config, max_advance_days: Number(e.target.value) })}
                required
                style={{ width: '100%', fontWeight: 700 }}
              />
            </div>
          </div>
        </div>

        {/* Section 3: Action Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '12px',
          marginTop: '6px',
          borderTop: '1px solid #2A2A30',
          paddingTop: '16px'
        }}>
          <button
            type="button"
            className="ui-btn ui-btn-outline"
            onClick={loadSettings}
            disabled={saving}
          >
            Hoàn tác
          </button>
          <button
            type="submit"
            className="ui-btn ui-btn-brand"
            disabled={saving}
            style={{ minWidth: '150px', fontWeight: 700 }}
          >
            {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
          </button>
        </div>
      </form>
    </div>
  );
}
