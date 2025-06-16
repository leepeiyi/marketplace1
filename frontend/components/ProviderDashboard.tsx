'use client';

import { useState } from 'react';
import { useUser } from '@/contexts/UserContext';

export function ProviderDashboard() {
  const { user, logout } = useUser();
  const [isAvailable, setIsAvailable] = useState(true);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="text-xl font-bold text-primary-600">Quickly</div>
              <div className="ml-4 text-sm text-gray-500">Provider Dashboard</div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">Hello, {user?.name}</span>
              <button onClick={logout} className="btn-secondary">
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          
          {/* Availability Toggle */}
          <div className="card mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  Availability Status
                </h3>
                <p className="text-gray-600">
                  Toggle your availability to receive job notifications
                </p>
              </div>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAvailable}
                  onChange={(e) => setIsAvailable(e.target.checked)}
                  className="sr-only"
                />
                <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isAvailable ? 'bg-primary-600' : 'bg-gray-200'
                }`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isAvailable ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </div>
                <span className={`ml-3 text-sm font-medium ${
                  isAvailable ? 'text-success-600' : 'text-gray-500'
                }`}>
                  {isAvailable ? 'Available' : 'Unavailable'}
                </span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Available Jobs */}
            <div className="card">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Available Jobs
              </h3>
              <div className="text-gray-500 text-center py-8">
                {isAvailable ? 
                  "Waiting for job notifications..." : 
                  "Set yourself as available to see jobs"
                }
              </div>
            </div>

            {/* My Jobs */}
            <div className="card">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                My Jobs
              </h3>
              <div className="text-gray-500 text-center py-8">
                No active jobs
              </div>
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}