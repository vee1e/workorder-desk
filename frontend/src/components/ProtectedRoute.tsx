import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useMe } from '../hooks/useAuth';
import { FullPageSpinner } from './primitives/Spinner';

export function ProtectedRoute() {
  const location = useLocation();
  const { data: user, isPending, isError } = useMe();

  if (isPending) return <FullPageSpinner />;
  if (isError || !user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <Outlet />;
}