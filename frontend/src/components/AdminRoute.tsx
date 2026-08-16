import { Navigate, Outlet } from 'react-router-dom';
import { useMe } from '../hooks/useAuth';
import { FullPageSpinner } from './primitives/Spinner';

export function AdminRoute() {
  const { data: user, isPending, isError } = useMe();

  if (isPending) return <FullPageSpinner />;
  if (isError || !user || user.role !== 'admin') {
    return <Navigate to="/app" replace />;
  }
  return <Outlet />;
}