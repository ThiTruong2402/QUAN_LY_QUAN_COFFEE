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

function RoleRoute({ allowedRoles, children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const defaultRoute = {
      admin: '/',
      cashier: '/',
      barista: '/barista',
      waiter: '/',
      warehouse: '/inventory',
    }[user.role] || '/';
    return <Navigate to={defaultRoute} replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={<AppLayout />}>
            {/* 1. Trang Chủ: Sơ đồ 20 bàn trực quan */}
            <Route
              index
              element={
                <RoleRoute allowedRoles={['admin', 'cashier', 'waiter', 'barista']}>
                  <Tables />
                </RoleRoute>
              }
            />

            {/* 2. Điểm bán POS: Quản lý, Thu ngân & Phục vụ */}
            <Route
              path="pos"
              element={
                <RoleRoute allowedRoles={['admin', 'cashier', 'waiter']}>
                  <PosOrder />
                </RoleRoute>
              }
            />

            {/* 3. Danh sách đơn hàng: Quản lý, Thu ngân, Pha chế & Phục vụ */}
            <Route
              path="orders"
              element={
                <RoleRoute allowedRoles={['admin', 'cashier', 'barista', 'waiter']}>
                  <Orders />
                </RoleRoute>
              }
            />

            {/* 4. Màn hình pha chế KDS (Kitchen Display System): Quản lý & Pha chế */}
            <Route
              path="barista"
              element={
                <RoleRoute allowedRoles={['admin', 'barista']}>
                  <Barista />
                </RoleRoute>
              }
            />

            {/* 5. Gộp Menu & Công thức: Admin toàn quyền sửa, Nhân viên chỉ xem, Khách không xem */}
            <Route
              path="menu"
              element={
                <RoleRoute allowedRoles={['admin', 'cashier', 'barista', 'waiter', 'warehouse']}>
                  <MenuManage />
                </RoleRoute>
              }
            />

            {/* 6. Gộp Quản lý Tài khoản: Nhân viên + Hội viên tích điểm thực tế + Khuyến mãi */}
            <Route
              path="accounts"
              element={
                <RoleRoute allowedRoles={['admin', 'cashier']}>
                  <Accounts />
                </RoleRoute>
              }
            />

            {/* 7. Lịch phân ca trực: Tất cả nhân viên */}
            <Route
              path="shifts"
              element={
                <RoleRoute allowedRoles={['admin', 'cashier', 'barista', 'waiter', 'warehouse']}>
                  <Shifts />
                </RoleRoute>
              }
            />

            {/* 8. Quản lý kho: Quản lý & Thủ kho */}
            <Route
              path="inventory"
              element={
                <RoleRoute allowedRoles={['admin', 'warehouse']}>
                  <Inventory />
                </RoleRoute>
              }
            />

            {/* 9. Báo cáo & Thống kê tích hợp Dashboard */}
            <Route
              path="reports"
              element={
                <RoleRoute allowedRoles={['admin', 'warehouse', 'cashier']}>
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
  );
}
