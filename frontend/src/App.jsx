import { Component } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './components/AppLayout';

import Login from './pages/Login';
import Tables from './pages/Tables';
import PosOrder from './pages/PosOrder';
import MenuManage from './pages/MenuManage';
import Accounts from './pages/Accounts';
import Shifts from './pages/Shifts';
import Inventory from './pages/Inventory';
import Reports from './pages/Reports';
import Orders from './pages/Orders';
import Barista from './pages/Barista';
import AuditLogs from './pages/AuditLogs';
import CustomerPortal from './pages/CustomerPortal';
import Settings from './pages/Settings';

// Error Boundary chống màn hình đen / sập app khi lỗi dữ liệu hoặc render
class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Uncaught Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#130c08',
          color: '#fef3c7',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
          fontFamily: "'Inter', sans-serif"
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>☕</div>
          <h2 style={{ fontSize: '1.4rem', color: '#f59e0b', marginBottom: '8px' }}>
            MY COFFEE HOUSE • HỆ THỐNG ĐANG TẢI LẠI
          </h2>
          <p style={{ color: '#d4b094', maxWidth: '480px', lineHeight: 1.5, fontSize: '0.9rem', marginBottom: '20px' }}>
            Hệ thống phát hiện cập nhật mới hoặc kết nối mạng bị gián đoạn. Vui lòng nhấn nút bên dưới để làm mới trang.
          </p>
          <button
            onClick={() => {
              localStorage.removeItem('customer_cart');
              window.location.reload();
            }}
            style={{
              background: '#15803d',
              color: '#fff',
              border: 'none',
              padding: '10px 24px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
            }}
          >
            🔄 Tải Lại Trang
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function RoleRoute({ allowedRoles, children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#130c08',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fde68a',
        fontFamily: "'Inter', sans-serif"
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>☕</div>
        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#d4b094' }}>
          Đang kết nối hệ thống My Coffee House...
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const defaultRoute = {
      admin: '/',
      manager: '/',
      cashier: '/',
      barista: '/barista',
      waiter: '/',
      warehouse: '/inventory',
      customer: '/customer',
    }[user.role] || '/login';
    if (defaultRoute === window.location.pathname) {
      return <Navigate to="/login" replace />;
    }
    return <Navigate to={defaultRoute} replace />;
  }
  return children;
}

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
          <Routes>
          <Route path="/login" element={<Login />} />

          {/* Cổng Khách Hàng: Mở cho mọi khách hàng và ban quản lý (hỗ trợ cả khách vãng lai và thành viên) */}
          <Route path="/customer" element={<CustomerPortal />} />

          <Route path="/" element={<AppLayout />}>
            {/* 1. Trang Chủ: Sơ đồ 20 bàn trực quan */}
            <Route
              index
              element={
                <RoleRoute allowedRoles={['admin', 'manager', 'cashier', 'waiter', 'barista']}>
                  <Tables />
                </RoleRoute>
              }
            />

            {/* 2. Điểm bán POS: Admin, Quản lý, Thu ngân & Phục vụ */}
            <Route
              path="pos"
              element={
                <RoleRoute allowedRoles={['admin', 'manager', 'cashier', 'waiter']}>
                  <PosOrder />
                </RoleRoute>
              }
            />

            {/* 3. Danh sách đơn hàng: Admin, Quản lý, Thu ngân, Pha chế & Phục vụ */}
            <Route
              path="orders"
              element={
                <RoleRoute allowedRoles={['admin', 'manager', 'cashier', 'barista', 'waiter']}>
                  <Orders />
                </RoleRoute>
              }
            />

            {/* 4. Màn hình pha chế KDS (Kitchen Display System): Admin, Quản lý & Pha chế */}
            <Route
              path="barista"
              element={
                <RoleRoute allowedRoles={['admin', 'manager', 'barista']}>
                  <Barista />
                </RoleRoute>
              }
            />

            {/* 5. Gộp Menu & Công thức: Admin, Quản lý toàn quyền CRUD, Nhân viên chỉ xem */}
            <Route
              path="menu"
              element={
                <RoleRoute allowedRoles={['admin', 'manager', 'cashier', 'barista', 'waiter', 'warehouse']}>
                  <MenuManage />
                </RoleRoute>
              }
            />

            {/* 6. Phân quyền tài khoản & Hội viên: Admin & Quản lý (quản lý chỉ tạo/sửa nhân viên) */}
            <Route
              path="accounts"
              element={
                <RoleRoute allowedRoles={['admin', 'manager']}>
                  <Accounts />
                </RoleRoute>
              }
            />

            {/* 7. Theo dõi hoạt động (Audit Logs): Dành riêng cho Quản Trị Hệ Thống (Admin) */}
            <Route
              path="audit-logs"
              element={
                <RoleRoute allowedRoles={['admin']}>
                  <AuditLogs />
                </RoleRoute>
              }
            />

            {/* 8. Cấu hình hệ thống: Dành riêng cho Quản Trị Hệ Thống (Admin) */}
            <Route
              path="settings"
              element={
                <RoleRoute allowedRoles={['admin']}>
                  <Settings />
                </RoleRoute>
              }
            />

            {/* 9. Lịch phân ca trực: Admin, Quản lý & nhân viên */}
            <Route
              path="shifts"
              element={
                <RoleRoute allowedRoles={['admin', 'manager', 'cashier', 'barista', 'waiter', 'warehouse']}>
                  <Shifts />
                </RoleRoute>
              }
            />

            {/* 10. Quản lý kho: Admin, Quản lý, Thủ kho, Pha chế, Thu ngân */}
            <Route
              path="inventory"
              element={
                <RoleRoute allowedRoles={['admin', 'manager', 'warehouse', 'barista', 'cashier']}>
                  <Inventory />
                </RoleRoute>
              }
            />

            {/* 11. Báo cáo & Thống kê tích hợp Dashboard: Admin & Quản lý */}
            <Route
              path="reports"
              element={
                <RoleRoute allowedRoles={['admin', 'manager']}>
                  <Reports />
                </RoleRoute>
              }
            />

            {/* Điều hướng đường dẫn tương thích & chuyển hướng gộp */}
            <Route path="tables" element={<Navigate to="/" replace />} />
            <Route path="dashboard" element={<Navigate to="/reports" replace />} />
            <Route path="recipes" element={<Navigate to="/menu" replace />} />
            <Route path="products" element={<Navigate to="/menu" replace />} />
            <Route path="categories" element={<Navigate to="/menu" replace />} />
            <Route path="staff" element={<Navigate to="/accounts" replace />} />
            <Route path="customers" element={<Navigate to="/accounts" replace />} />
            <Route path="promotions" element={<Navigate to="/accounts" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </AppErrorBoundary>
  );
}
