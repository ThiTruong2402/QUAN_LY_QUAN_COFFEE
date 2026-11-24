import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import './Login.css';
 
const PHONE_REGEX = /^(0|\+84)[0-9]{9,10}$/;
 
const getHomeRouteByRole = (role) => {
  switch (role) {
    case 'admin':
    case 'manager':
    case 'cashier':
    case 'waiter':
      return '/';
    case 'barista':
      return '/barista';
    case 'warehouse':
      return '/inventory';
    case 'customer':
    default:
      return '/customer';
  }
};
 
const DEMO_ACCOUNTS = [
  { label: 'Admin', username: 'admin' },
  { label: 'Quản lý', username: 'manager' },
  { label: 'Thu ngân', username: 'cashier' },
  { label: 'Pha chế', username: 'barista' },
  { label: 'Thủ kho', username: 'warehouse' },
];
 
// Bộ SVG Icon nét mảnh đồng bộ
const Icon = {
  User: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  Phone: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  ),
  Lock: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  Eye: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  EyeOff: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>
    </svg>
  ),
  Check: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  Gift: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>
    </svg>
  ),
};
 
export default function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
 
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showExtraFields, setShowExtraFields] = useState(false);
  const [showDemoBox, setShowDemoBox] = useState(false);
 
  // State Đăng nhập
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
 
  // State Đăng ký hội viên
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [birthday, setBirthday] = useState('');
 
  // Lỗi theo từng trường
  const [errors, setErrors] = useState({});
 
  // Đánh giá độ mạnh mật khẩu khi đăng ký (0 -> 4)
  const passwordStrength = useMemo(() => {
    if (!regPassword) return { score: 0, label: '', color: '#EAE2D7' };
    let score = 0;
    if (regPassword.length >= 6) score++;
    if (regPassword.length >= 9) score++;
    if (/[A-Z]/.test(regPassword) && /[0-9]/.test(regPassword)) score++;
    if (/[^A-Za-z0-9]/.test(regPassword)) score++;
 
    const levels = [
      { label: 'Quá ngắn', color: '#DC2626' },
      { label: 'Cơ bản', color: '#EA580C' },
      { label: 'Khá tốt', color: '#D97706' },
      { label: 'Mạnh', color: '#16A34A' },
      { label: 'Rất mạnh', color: '#15803D' },
    ];
    return { score, ...levels[score] };
  }, [regPassword]);
 
  // Lưu phiên đăng nhập tương thích linh hoạt với mọi cách viết AuthContext
  const applyAuthSession = async (data) => {
    const { accessToken, refreshToken, user } = data;
    localStorage.setItem('accessToken', accessToken);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(user));
 
    if (typeof auth?.setUser === 'function') {
      auth.setUser(user);
    } else if (typeof auth?.refreshUser === 'function') {
      await auth.refreshUser();
    }
    return user;
  };
 
  const switchMode = (nextMode) => {
    setMode(nextMode);
    setErrors({});
    setShowPassword(false);
  };
 
  const validateRegister = () => {
    const nextErr = {};
    if (fullName.trim().length < 2) nextErr.fullName = 'Họ và tên cần tối thiểu 2 ký tự';
    const cleanPhone = phone.trim().replace(/\s/g, '');
    if (!PHONE_REGEX.test(cleanPhone)) nextErr.phone = 'Số điện thoại không hợp lệ (VD: 0901234567)';
    if (regPassword.length < 6) nextErr.regPassword = 'Mật khẩu tối thiểu 6 ký tự';
    if (confirmPassword !== regPassword) nextErr.confirmPassword = 'Mật khẩu nhập lại không khớp';
    setErrors(nextErr);
    return Object.keys(nextErr).length === 0;
  };
 
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    const cleanUser = username.trim();
    if (!cleanUser || !password) {
      setErrors({ login: 'Vui lòng nhập đầy đủ tài khoản và mật khẩu' });
      return;
    }
 
    setLoading(true);
    setErrors({});
    try {
      // Nếu AuthContext của bạn có sẵn hàm login(username, password) thì dùng trực tiếp,
      // nếu không sẽ gọi trực tiếp API /auth/login
      const res = await api.post('/auth/login', { username: cleanUser, password });
      if (res.data?.success && res.data?.data) {
        const loggedUser = await applyAuthSession(res.data.data);
        if (!rememberMe) {
          sessionStorage.setItem('accessToken', res.data.data.accessToken);
        }
        toast.success(`Chào mừng ${loggedUser.full_name || loggedUser.username}!`);
        navigate(getHomeRouteByRole(loggedUser.role), { replace: true });
      }
    } catch (err) {
      let msg = 'Sai tài khoản hoặc mật khẩu';
      if (!err.response) {
        msg = 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền mạng hoặc khởi động backend!';
      } else if (err.response.status >= 500) {
        msg = err.response.data?.message || 'Máy chủ đang bảo trì hoặc gặp sự cố (HTTP 500). Vui lòng thử lại sau!';
      } else {
        msg = err.response.data?.message || 'Sai tài khoản hoặc mật khẩu';
      }
      setErrors({ login: msg });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };
 
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!validateRegister()) return;
 
    setLoading(true);
    try {
      const res = await api.post('/auth/register', {
        full_name: fullName.trim(),
        phone: phone.trim().replace(/\s/g, ''),
        password: regPassword,
        email: email.trim() || undefined,
        birthday: birthday || undefined,
      });
 
      if (res.data?.success && res.data?.data) {
        await applyAuthSession(res.data.data);
        toast.success(res.data.message || 'Đăng ký thành công! Bạn được tặng 50 điểm chào mừng.');
        navigate('/customer', { replace: true });
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Không thể đăng ký lúc này';
      setErrors({ register: msg });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };
 
  return (
    <div className="mch-auth-page">
      {/* LỚP NỀN ẢNH QUÁN CÀ PHÊ + LỚP PHỦ CHIỀU SÂU */}
      <div className="mch-auth-bg-image" aria-hidden="true" />
      <div className="mch-auth-bg-overlay" aria-hidden="true" />
 
      {/* THẺ NỔI 2 CỘT TRUNG TÂM */}
      <main className="mch-auth-shell">
        {/* CỘT TRÁI: THƯƠNG HIỆU & ẢNH NGHỆ THUẬT */}
        <section className="mch-auth-showcase">
          <div className="mch-brand-pill">
            <span className="mch-brand-mark">MC</span>
            <span className="mch-brand-name">My Coffee House</span>
          </div>
 
          <div>
            <h1 className="mch-showcase-title">
              Hương vị thủ công,<br />trọn vẹn từng khoảnh khắc.
            </h1>
            <p className="mch-showcase-sub">
              Đặt trước ly cà phê yêu thích không cần xếp hàng chờ, hoặc đăng nhập không gian điều hành POS thời gian thực dành cho đội ngũ cửa hàng.
            </p>
 
            <div className="mch-feature-list">
              <div className="mch-feature-item">
                <span className="mch-feature-dot"><Icon.Check /></span>
                <span>Tặng ngay 50 điểm chào mừng khi đăng ký hội viên</span>
              </div>
              <div className="mch-feature-item">
                <span className="mch-feature-dot"><Icon.Check /></span>
                <span>Tích 1 điểm mỗi 10.000đ • Quy đổi giảm giá trực tiếp</span>
              </div>
              <div className="mch-feature-item">
                <span className="mch-feature-dot"><Icon.Check /></span>
                <span>Hẹn giờ nhận món chủ động & theo dõi tiến độ pha chế live</span>
              </div>
            </div>
 
            <div className="mch-guest-banner">
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#FFFFFF' }}>
                  Đặt món ngay không cần tài khoản
                </div>
                <div style={{ fontSize: '0.73rem', color: '#E2D3C3', marginTop: '2px' }}>
                  Xem thực đơn 57+ món & quét mã VietQR tức thì
                </div>
              </div>
              <button
                type="button"
                className="mch-guest-btn"
                onClick={() => navigate('/customer')}
              >
                Vào thực đơn →
              </button>
            </div>
          </div>
        </section>
 
        {/* CỘT PHẢI: BIỂU MẪU ĐĂNG NHẬP / ĐĂNG KÝ */}
        <section className="mch-auth-form-panel">
          <div className="mch-mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={`mch-mode-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => switchMode('login')}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={`mch-mode-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => switchMode('register')}
            >
              Đăng ký hội viên
            </button>
          </div>
 
          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} noValidate>
              <h2 className="mch-form-heading">Chào mừng trở lại</h2>
              <p className="mch-form-desc">
                Nhập tên tài khoản nhân viên hoặc số điện thoại hội viên của bạn.
              </p>
 
              {errors.login && (
                <div style={{
                  background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C',
                  padding: '10px 12px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 600, marginBottom: '14px'
                }}>
                  {errors.login}
                </div>
              )}
 
              <div className="mch-field-group">
                <div>
                  <label className="mch-label" htmlFor="login-user">Tài khoản / Số điện thoại</label>
                  <div className="mch-input-wrap">
                    <span className="mch-input-icon"><Icon.User /></span>
                    <input
                      id="login-user"
                      type="text"
                      className="mch-field"
                      placeholder="VD: 0901234567 hoặc cashier"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                    />
                  </div>
                </div>
 
                <div>
                  <label className="mch-label" htmlFor="login-pass">Mật khẩu</label>
                  <div className="mch-input-wrap">
                    <span className="mch-input-icon"><Icon.Lock /></span>
                    <input
                      id="login-pass"
                      type={showPassword ? 'text' : 'password'}
                      className="mch-field has-eye"
                      placeholder="Nhập mật khẩu của bạn"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="mch-eye-btn"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label="Ẩn hoặc hiện mật khẩu"
                    >
                      {showPassword ? <Icon.EyeOff /> : <Icon.Eye />}
                    </button>
                  </div>
                </div>
 
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', color: '#5A463A', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <span>Ghi nhớ phiên đăng nhập</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => switchMode('register')}
                    style={{ background: 'none', border: 'none', color: '#C25C20', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}
                  >
                    Chưa có tài khoản?
                  </button>
                </div>
 
                <button type="submit" disabled={loading} className="mch-submit-btn">
                  {loading ? 'Đang xác thực...' : 'Đăng nhập hệ thống'}
                </button>
              </div>
 
              {/* Ngăn kéo tài khoản trải nghiệm ẩn gọn gàng (tiện khi demo đồ án) */}
              <div className="mch-demo-toggle">
                <button
                  type="button"
                  onClick={() => setShowDemoBox((v) => !v)}
                  style={{ background: 'none', border: 'none', color: '#8C7768', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  {showDemoBox ? 'Ẩn tài khoản trải nghiệm ▲' : 'Điền nhanh tài khoản trải nghiệm (Demo) ▼'}
                </button>
 
                {showDemoBox && (
                  <div className="mch-demo-chips">
                    {DEMO_ACCOUNTS.map((acc) => (
                      <button
                        key={acc.username}
                        type="button"
                        className="mch-demo-chip"
                        onClick={() => {
                          setUsername(acc.username);
                          setPassword('123456');
                          setErrors({});
                        }}
                      >
                        {acc.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} noValidate>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <h2 className="mch-form-heading" style={{ margin: 0 }}>Đăng ký hội viên</h2>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  background: '#FFF4EC', border: '1px solid #FDBA74', color: '#C25C20',
                  padding: '4px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700
                }}>
                  <Icon.Gift /> +50 điểm
                </span>
              </div>
              <p className="mch-form-desc">
                Tạo tài khoản bằng số điện thoại để tích điểm và nhận ưu đãi thành viên.
              </p>
 
              {errors.register && (
                <div style={{
                  background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C',
                  padding: '10px 12px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 600, marginBottom: '12px'
                }}>
                  {errors.register}
                </div>
              )}
 
              <div className="mch-field-group">
                <div className="mch-field-row-2">
                  <div>
                    <label className="mch-label" htmlFor="reg-name">Họ và tên *</label>
                    <div className="mch-input-wrap">
                      <span className="mch-input-icon"><Icon.User /></span>
                      <input
                        id="reg-name"
                        type="text"
                        className={`mch-field ${errors.fullName ? 'is-error' : ''}`}
                        placeholder="Nguyễn Văn An"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </div>
                    {errors.fullName && <div className="mch-field-error">{errors.fullName}</div>}
                  </div>
 
                  <div>
                    <label className="mch-label" htmlFor="reg-phone">Số điện thoại *</label>
                    <div className="mch-input-wrap">
                      <span className="mch-input-icon"><Icon.Phone /></span>
                      <input
                        id="reg-phone"
                        type="tel"
                        className={`mch-field ${errors.phone ? 'is-error' : ''}`}
                        placeholder="0901234567"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>
                    {errors.phone && <div className="mch-field-error">{errors.phone}</div>}
                  </div>
                </div>
 
                <div>
                  <label className="mch-label" htmlFor="reg-pass">Mật khẩu *</label>
                  <div className="mch-input-wrap">
                    <span className="mch-input-icon"><Icon.Lock /></span>
                    <input
                      id="reg-pass"
                      type={showPassword ? 'text' : 'password'}
                      className={`mch-field has-eye ${errors.regPassword ? 'is-error' : ''}`}
                      placeholder="Tối thiểu 6 ký tự"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="mch-eye-btn"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label="Ẩn hoặc hiện mật khẩu"
                    >
                      {showPassword ? <Icon.EyeOff /> : <Icon.Eye />}
                    </button>
                  </div>
                  {regPassword && (
                    <>
                      <div className="mch-pw-meter">
                        {[1, 2, 3, 4].map((lv) => (
                          <div
                            key={lv}
                            className="mch-pw-bar"
                            style={{ background: passwordStrength.score >= lv ? passwordStrength.color : '#EAE2D7' }}
                          />
                        ))}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: passwordStrength.color, fontWeight: 700, marginTop: '3px' }}>
                        Độ bảo mật: {passwordStrength.label}
                      </div>
                    </>
                  )}
                  {errors.regPassword && <div className="mch-field-error">{errors.regPassword}</div>}
                </div>
 
                <div>
                  <label className="mch-label" htmlFor="reg-confirm">Nhập lại mật khẩu *</label>
                  <div className="mch-input-wrap">
                    <span className="mch-input-icon"><Icon.Lock /></span>
                    <input
                      id="reg-confirm"
                      type={showPassword ? 'text' : 'password'}
                      className={`mch-field ${errors.confirmPassword ? 'is-error' : ''}`}
                      placeholder="Nhập lại mật khẩu phía trên"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                  {errors.confirmPassword && <div className="mch-field-error">{errors.confirmPassword}</div>}
                </div>
 
                {/* Thông tin bổ sung tùy chọn (Email & Ngày sinh) thu gọn để form thoáng */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowExtraFields((v) => !v)}
                    style={{ background: 'none', border: 'none', padding: 0, color: '#C25C20', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {showExtraFields ? '− Ẩn thông tin sinh nhật & email' : '+ Thêm ngày sinh & email (nhận ưu đãi sinh nhật)'}
                  </button>
 
                  {showExtraFields && (
                    <div className="mch-field-row-2" style={{ marginTop: '10px' }}>
                      <div>
                        <label className="mch-label" htmlFor="reg-bday">Ngày sinh</label>
                        <input id="reg-bday" type="date" className="mch-field no-icon" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
                      </div>
                      <div>
                        <label className="mch-label" htmlFor="reg-email">Email</label>
                        <input id="reg-email" type="email" className="mch-field no-icon" placeholder="ban@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>
 
                <button type="submit" disabled={loading} className="mch-submit-btn">
                  {loading ? 'Đang tạo tài khoản...' : 'Tạo tài khoản & Nhận 50 điểm'}
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
