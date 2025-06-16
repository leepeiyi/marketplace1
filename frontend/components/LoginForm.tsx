'use client';

import { useState } from 'react';
import { useUser } from '@/contexts/UserContext';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'CUSTOMER' | 'PROVIDER'>('CUSTOMER');
  const { login } = useUser();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      login(email, role);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Welcome to Quickly
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your details to continue
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="input rounded-t-md"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="role" className="sr-only">
                Role
              </label>
              <select
                id="role"
                name="role"
                className="input rounded-b-md"
                value={role}
                onChange={(e) => setRole(e.target.value as 'CUSTOMER' | 'PROVIDER')}
              >
                <option value="CUSTOMER">Customer</option>
                <option value="PROVIDER">Provider</option>
              </select>
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="btn-primary w-full"
            >
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}