'use client';

import { useUser } from '@/contexts/UserContext';
import { LoginForm } from '@/components/LoginForm';
import { CustomerDashboard } from '@/components/CustomerDashboard';
import { ProviderDashboard } from '@/components/ProviderDashboard';
import { NotificationToast } from '@/components/NotificationToast';

export default function HomePage() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse-slow">
          <div className="text-2xl font-bold text-primary-600">Quickly</div>
          <div className="text-sm text-gray-500 mt-2">Loading...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LoginForm />
        <NotificationToast />
      </>
    );
  }

  return (
    <>
      {user.role === 'CUSTOMER' ? (
        <CustomerDashboard />
      ) : (
        <ProviderDashboard />
      )}
      <NotificationToast />
    </>
  );
}