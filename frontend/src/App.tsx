import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { AppLayout } from './components/AppLayout';
import { LandingPage } from './pages/LandingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { WorkOrderListPage } from './features/workOrders/WorkOrderListPage';
import { WorkOrderDetailPage } from './features/workOrders/WorkOrderDetailPage';
import { WorkOrderCreatePage } from './features/workOrders/WorkOrderCreatePage';
import { AdminUsersPage } from './features/admin/AdminUsersPage';
import { AdminWorkOrdersPage } from './features/admin/AdminWorkOrdersPage';
import { ProfilePage } from './features/profile/ProfilePage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/app" element={<WorkOrderListPage />} />
          <Route path="/app/work-orders" element={<WorkOrderListPage />} />
          <Route path="/app/work-orders/new" element={<WorkOrderCreatePage />} />
          <Route path="/app/work-orders/:id" element={<WorkOrderDetailPage />} />
          <Route path="/app/profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route element={<AdminRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/app/admin" element={<AdminUsersPage />} />
          <Route path="/app/admin/work-orders" element={<AdminWorkOrdersPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}