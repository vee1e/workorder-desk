import { Navigate, Outlet } from 'react-router-dom';
import { useMe } from '../hooks/useAuth';
import { FullPageSpinner } from './primitives/Spinner';

export function GuestRoute() {
  const { data: user, isPending } = useMe();
  if (isPending) return <FullPageSpinner />;
  if (user) return <Navigate to="/app" replace />;
  return <Outlet />;
}