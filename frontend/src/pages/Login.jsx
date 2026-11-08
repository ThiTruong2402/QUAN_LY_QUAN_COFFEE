import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const loggedUser = await login(form.username, form.password);
      toast.success('Đăng nhập thành công! Chào mừng bạn ☕');
      const roleHome = {
        admin: '/',
        cashier: '/',
        barista: '/barista',
        waiter: '/pos',
        warehouse: '/inventory',
      };
      navigate(roleHome[loggedUser?.role] || '/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Sai tài khoản hoặc mật khẩu');
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
        maxWidth: '860px',
        width: '100%',
        background: '#ffffff',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        display: 'grid',
        gridTemplateColumns: '1.05fr 1fr',
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
              fontSize: '2rem',
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
              fontSize: '0.9rem',
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
                  width: '180px',
                  height: '180px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  margin: '0 auto',
                  border: '4px solid rgba(245, 158, 11, 0.4)',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.4)'
                }}
              />
            </div>

            {/* Quote Card */}
            <div style={{
              background: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '12px',
              padding: '14px 18px',
              textAlign: 'center',
              marginTop: '16px'
            }}>
              <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>☕</div>
              <p style={{ fontStyle: 'italic', fontSize: '0.88rem', color: '#f3e8dc', margin: 0, lineHeight: 1.4 }}>
                “ Một tách cà phê ngon khởi đầu cho một ngày tuyệt vời ! ”
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
          padding: '40px 36px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <h1 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '1.8rem',
              fontWeight: 800,
              color: '#652b0f',
              marginBottom: '6px'
            }}>
              ĐĂNG NHẬP
            </h1>
            <p style={{ color: '#8c674b', fontSize: '0.9rem', margin: 0 }}>
              Chào mừng bạn quay trở lại!
            </p>
            <div style={{ width: '48px', height: '2px', background: '#d4822a', margin: '10px auto 0' }} />
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#543310', marginBottom: '6px' }}>
                👤 Tài khoản
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Nhập tên đăng nhập hoặc mã NV"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
                style={{ borderColor: '#d5c3b2', padding: '10px 14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#543310', marginBottom: '6px' }}>
                🔒 Mật khẩu
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="Nhập mật khẩu"
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
                marginTop: '6px'
              }}
            >
              {loading ? <div className="spinner" /> : <><span>➡️</span><span>ĐĂNG NHẬP</span></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
