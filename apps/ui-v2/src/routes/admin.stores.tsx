import { createFileRoute, Outlet } from '@tanstack/react-router';
import { AdminGate } from '@/components/auth/AdminGate';

export const Route = createFileRoute('/admin/stores')({
  component: () => <AdminGate><Outlet /></AdminGate>,
});
