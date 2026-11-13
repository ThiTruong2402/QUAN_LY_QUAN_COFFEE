import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ username: '', password: '' });
  const [regForm, setRegForm] = useState({
    full_name: '',
    phone: '',
    password: '',
    confirmPassword: '',
    birthday: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const loggedUser = await login(form.username, form.password);
      toast.success(`Đăng nhập thành công! Chào mừng ${loggedUser?.full_name || 'bạn'} ☕`);
      const roleHome = {
        admin: '/accounts',
        manager: '/',
        cashier: '/',
        barista: '/barista',
        waiter: '/pos',
        warehouse: '/inventory',
        customer: '/customer',
      };
      navigate(roleHome[loggedUser?.role] || '/customer');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Sai tài khoản hoặc mật khẩu');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!regForm.full_name.trim() || regForm.full_name.trim().length < 2) {
      return toast.error('Vui lòng nhập họ và tên (tối thiểu 2 ký tự)');
    }
    const cleanPhone = regForm.phone.trim().replace(/\s/g, '');
    if (!/^(0|\+84)[0-9]{9,10}$/.test(cleanPhone)) {
      return toast.error('Số điện thoại không hợp lệ (Ví dụ: 0901234567)');
    }
    if (regForm.password.length < 6) {
      return toast.error('Mật khẩu cần có ít nhất 6 ký tự');
    }
    if (regForm.password !== regForm.confirmPassword) {
      return toast.error('Mật khẩu xác nhận không khớp');
    }

    setLoading(true);
    try {
      const registeredUser = await register({
        full_name: regForm.full_name.trim(),
        phone: cleanPhone,
        password: regForm.password,
        birthday: regForm.birthday || null,
      });
      toast.success('🎉 Đăng ký thành công! Dữ liệu tài khoản đã được lưu vào hệ thống.');
      navigate('/customer');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Đăng ký không thành công');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1c0d06 0%, #3a1a0c 50%, #200f07 100%)',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '920px',
        width: '100%',
        background: '#ffffff',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        display: 'grid',
        gridTemplateColumns: '1fr 1.15fr',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        {/* Left Coffee Atmosphere Panel */}
        <div style={{
          background: 'linear-gradient(180deg, #1f0f08 0%, #361a0e 100%)',
          padding: '40px 32px',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div>
            <div className="notranslate" translate="no" style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '1.9rem',
              fontWeight: 800,
              letterSpacing: '1px',
              color: '#f59e0b',
              textAlign: 'center',
              marginBottom: '4px'
            }}>
              MY COFFEE HOUSE
            </div>
            <div style={{
              textAlign: 'center',
              fontStyle: 'italic',
              color: '#d4b094',
              fontSize: '0.88rem',
              marginBottom: '20px'
            }}>
              ~ Good coffee – Good day ~
            </div>

            {/* Steaming Coffee Cup Photo */}
            <div style={{ textAlign: 'center', margin: '15px 0' }}>
              <img
                src="https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500&auto=format&fit=crop&q=80"
                alt="Coffee Cup"
                onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = 'https://images.unsplash.com/photo-1509785307050-d4066910ec1e?w=500&auto=format&fit=crop&q=80'; }}
                style={{
                  width: '160px',
                  height: '160px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  margin: '0 auto',
                  border: '4px solid rgba(245, 158, 11, 0.4)',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.4)'
                }}
              />
            </div>

            {/* Slogan Atmosphere Box */}
            <div style={{
              background: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'center',
              marginTop: '16px'
            }}>
              <p style={{ fontSize: '0.88rem', color: '#fef3c7', margin: 0, fontWeight: 600, fontStyle: 'italic', lineHeight: 1.5 }}>
                "Cà phê nguyên chất – Đậm đà phong vị – Phục vụ tận tâm"
              </p>
            </div>
          </div>

          {/* 3 Badges at Bottom */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '24px' }}>
            <div style={{ textAlign: 'center', flex: 1, padding: '8px 4px', background: 'rgba(255,255,255,0.06)', borderRadius: '8px' }}>
              <div style={{ fontSize: '1.1rem' }}>☕</div>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#fde68a', marginTop: '2px' }}>HƯƠNG VỊ<br/>TUYỆT HẢO</div>
            </div>
            <div style={{ textAlign: 'center', flex: 1, padding: '8px 4px', background: 'rgba(255,255,255,0.06)', borderRadius: '8px' }}>
              <div style={{ fontSize: '1.1rem' }}>🌾</div>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#fde68a', marginTop: '2px' }}>NGUYÊN LIỆU<br/>CHỌN LỌC</div>
            </div>
            <div style={{ textAlign: 'center', flex: 1, padding: '8px 4px', background: 'rgba(255,255,255,0.06)', borderRadius: '8px' }}>
              <div style={{ fontSize: '1.1rem' }}>🤎</div>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#fde68a', marginTop: '2px' }}>DỊCH VỤ<br/>TẬN TÂM</div>
            </div>
          </div>
        </div>

        {/* Right Form Panel */}
        <div style={{
          background: '#fffdfa',
          padding: '36px 32px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center'
        }}>
          {/* TAB SWITCHER: ĐĂNG NHẬP vs ĐĂNG KÝ */}
          <div style={{
            display: 'flex',
            background: '#f4ede4',
            borderRadius: '10px',
            padding: '4px',
            marginBottom: '20px'
          }}>
            <button
              type="button"
              onClick={() => setMode('login')}
              style={{
                flex: 1,
                padding: '9px',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer',
                background: mode === 'login' ? '#652b0f' : 'transparent',
                color: mode === 'login' ? '#ffffff' : '#652b0f',
                boxShadow: mode === 'login' ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              ĐĂNG NHẬP
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              style={{
                flex: 1,
                padding: '9px',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer',
                background: mode === 'register' ? '#b45309' : 'transparent',
                color: mode === 'register' ? '#ffffff' : '#652b0f',
                boxShadow: mode === 'register' ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              ✨ ĐĂNG KÝ MỚI
            </button>
          </div>

          {/* MODE: ĐĂNG NHẬP */}
          {mode === 'login' && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '22px' }}>
                <h2 style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: '1.6rem',
                  fontWeight: 800,
                  color: '#652b0f',
                  margin: 0
                }}>
                  ĐĂNG NHẬP HỆ THỐNG
                </h2>
              </div>

              <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#543310', marginBottom: '5px' }}>
                    👤 Tài khoản / Số điện thoại
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    required
                    style={{ borderColor: '#d5c3b2', padding: '10px 14px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#543310', marginBottom: '5px' }}>
                    🔒 Mật khẩu
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                    style={{ borderColor: '#d5c3b2', padding: '10px 14px' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6b4e3d', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={showPassword}
                      onChange={(e) => setShowPassword(e.target.checked)}
                    />
                    Hiện mật khẩu
                  </label>
                  <a href="#forgot" onClick={(e) => { e.preventDefault(); toast('Vui lòng liên hệ Quản lý để cấp lại mật khẩu!', { icon: 'ℹ️' }); }} style={{ color: '#0284c7', textDecoration: 'none' }}>
                    Quên mật khẩu?
                  </a>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    background: 'linear-gradient(90deg, #b45309 0%, #d97706 100%)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '1rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(180, 83, 9, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginTop: '4px'
                  }}
                >
                  {loading ? <div className="spinner" /> : <><span>➡️</span><span>ĐĂNG NHẬP NGAY</span></>}
                </button>

                <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '0.85rem', color: '#7c5843' }}>
                  Chưa có tài khoản?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('register')}
                    style={{ background: 'none', border: 'none', color: '#b45309', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                  >
                    Đăng ký tại đây
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* MODE: ĐĂNG KÝ THÀNH VIÊN MỚI */}
          {mode === 'register' && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <h2 style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: '1.5rem',
                  fontWeight: 800,
                  color: '#652b0f',
                  margin: 0
                }}>
                  ĐĂNG KÝ THÀNH VIÊN
                </h2>
              </div>

              <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#543310', marginBottom: '4px' }}>
                    👤 Họ và tên *
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={regForm.full_name}
                    onChange={(e) => setRegForm({ ...regForm, full_name: e.target.value })}
                    required
                    style={{ borderColor: '#d5c3b2', padding: '9px 12px', fontSize: '0.9rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#543310', marginBottom: '4px' }}>
                    📱 Số điện thoại *
                  </label>
                  <input
                    type="tel"
                    className="form-input"
                    value={regForm.phone}
                    onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                    required
                    style={{ borderColor: '#d5c3b2', padding: '9px 12px', fontSize: '0.9rem' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#543310', marginBottom: '4px' }}>
                      🔒 Mật khẩu *
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="form-input"
                      value={regForm.password}
                      onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                      required
                      style={{ borderColor: '#d5c3b2', padding: '9px 12px', fontSize: '0.9rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#543310', marginBottom: '4px' }}>
                      🔁 Xác nhận mật khẩu *
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="form-input"
                      value={regForm.confirmPassword}
                      onChange={(e) => setRegForm({ ...regForm, confirmPassword: e.target.value })}
                      required
                      style={{ borderColor: '#d5c3b2', padding: '9px 12px', fontSize: '0.9rem' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#543310', marginBottom: '4px' }}>
                    🎂 Ngày sinh
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={regForm.birthday}
                    onChange={(e) => setRegForm({ ...regForm, birthday: e.target.value })}
                    style={{ borderColor: '#d5c3b2', padding: '9px 12px', fontSize: '0.85rem' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6b4e3d', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={showPassword}
                      onChange={(e) => setShowPassword(e.target.checked)}
                    />
                    Hiện mật khẩu
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    background: 'linear-gradient(90deg, #b45309 0%, #d97706 100%)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(180, 83, 9, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginTop: '4px'
                  }}
                >
                  {loading ? <div className="spinner" /> : <span>ĐĂNG KÝ TÀI KHOẢN</span>}
                </button>

                <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '0.82rem', color: '#7c5843' }}>
                  Đã có tài khoản?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    style={{ background: 'none', border: 'none', color: '#b45309', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                  >
                    Đăng nhập tại đây
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
