import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { getDefaultRouteByRole } from '../App';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await api.post('/auth/login', { username: username.trim(), password });
        if (res.data?.success) {
          const { accessToken, refreshToken, user } = res.data.data;
          login(accessToken, refreshToken, user);
          toast.success(`Xin chào, ${user.full_name}!`);
          navigate(getDefaultRouteByRole(user.role), { replace: true });
        }
      } else {
        const res = await api.post('/auth/register', { full_name: fullName.trim(), phone: phone.trim(), password });
        if (res.data?.success) {
          const { accessToken, refreshToken, user } = res.data.data;
          login(accessToken, refreshToken, user);
          toast.success(res.data.message || 'Đăng ký thành công!');
          navigate('/customer', { replace: true });
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Thao tác thất bại, vui lòng kiểm tra lại thông tin');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
      background: '#F6F3EE', fontFamily: "'Be Vietnam Pro', sans-serif"
    }}>
      {/* CỘT TRÁI: THƯƠNG HIỆU ESPRESSO */}
      <div style={{
        background: 'linear-gradient(145deg, #24160F 0%, #3E2315 55%, #5C331D 100%)',
        color: '#FAF6F0', padding: '48px 42px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
      }}>
        <div>
          <div style={{
            width: '44px', height: '44px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #F59E0B, #B45309)', color: '#FFFFFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.1rem', marginBottom: '20px'
          }}>MC</div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '2.2rem', margin: '0 0 12px', lineHeight: 1.2 }}>
            My Coffee House
          </h1>
          <p style={{ color: '#DFD2C3', fontSize: '0.94rem', lineHeight: 1.6, maxWidth: '420px' }}>
            Hệ thống quản lý bán hàng tại quầy (POS), pha chế thời gian thực (KDS) và cổng đặt món trực tuyến dành cho khách hàng thân thiết.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '32px' }}>
          <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '14px 16px' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#FDE68A' }}>Khách hàng muốn đặt món nhanh?</div>
            <div style={{ fontSize: '0.8rem', color: '#E7DFD5', margin: '4px 0 10px' }}>
              Bạn có thể xem thực đơn và đặt đồ uống ngay không cần tài khoản.
            </div>
            <button
              type="button"
              onClick={() => navigate('/customer')}
              style={{
                background: '#FFFFFF', color: '#24160F', border: 'none',
                padding: '8px 16px', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer'
              }}
            >
              Vào thực đơn đặt món ngay →
            </button>
          </div>
        </div>
      </div>

      {/* CỘT PHẢI: BIỂU MẪU ĐĂNG NHẬP / ĐĂNG KÝ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 20px' }}>
        <div style={{
          width: '100%', maxWidth: '420px', background: '#FFFFFF',
          border: '1px solid #E7DFD5', borderRadius: '20px', padding: '32px 28px',
          boxShadow: '0 16px 36px rgba(44, 26, 18, 0.08)'
        }}>
          {/* Chuyển đổi Đăng nhập / Đăng ký khách hàng */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: '#F6F3EE', padding: '4px', borderRadius: '12px', marginBottom: '22px' }}>
            <button
              type="button"
              onClick={() => setMode('login')}
              style={{
                padding: '9px', borderRadius: '9px', border: 'none', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer',
                background: mode === 'login' ? '#2C1A12' : 'transparent', color: mode === 'login' ? '#FFFFFF' : '#6E5D52'
              }}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              style={{
                padding: '9px', borderRadius: '9px', border: 'none', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer',
                background: mode === 'register' ? '#2C1A12' : 'transparent', color: mode === 'register' ? '#FFFFFF' : '#6E5D52'
              }}
            >
              Đăng ký hội viên
            </button>
          </div>

          <h2 style={{ margin: '0 0 6px', fontSize: '1.3rem', fontWeight: 800, color: '#1F1611' }}>
            {mode === 'login' ? 'Chào mừng trở lại' : 'Tạo tài khoản khách hàng'}
          </h2>
          <p style={{ margin: '0 0 20px', fontSize: '0.82rem', color: '#78716C' }}>
            {mode === 'login'
              ? 'Dùng tên đăng nhập nhân viên hoặc số điện thoại hội viên.'
              : 'Nhận ngay 50 điểm chào mừng và tích điểm trên mỗi đơn hàng.'}
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {mode === 'register' ? (
              <>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4A3225', display: 'block', marginBottom: '5px' }}>Họ và tên *</label>
                  <input className="mch-input" required placeholder="Nguyễn Văn A" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4A3225', display: 'block', marginBottom: '5px' }}>Số điện thoại *</label>
                  <input className="mch-input" required placeholder="0901234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </>
            ) : (
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4A3225', display: 'block', marginBottom: '5px' }}>Tài khoản hoặc Số điện thoại</label>
                <input className="mch-input" required placeholder="admin / cashier / 0901234567" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
            )}

            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4A3225', display: 'block', marginBottom: '5px' }}>Mật khẩu</label>
              <input className="mch-input" type="password" required placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mch-btn mch-btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '0.9rem', marginTop: '6px' }}
            >
              {loading ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập hệ thống' : 'Đăng ký & Tặng 50 điểm'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
