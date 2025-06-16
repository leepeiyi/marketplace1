'use client';

import { useState } from 'react';
import { useUser } from '@/contexts/UserContext';
import { QuickBookModal } from './QuickBookModal';

export function CustomerDashboard() {
  const { user, logout } = useUser();
  const [showQuickBook, setShowQuickBook] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="text-xl font-bold text-primary-600">Quickly</div>
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
          
          {/* Welcome Section */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.name}!</h1>
            <p className="text-gray-600">What service do you need today?</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Quick Book Card */}
            <div className="card hover:shadow-md transition-shadow">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Quick Book
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Instant hiring for routine, urgent services. Get help within hours!
                  </p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">⚡ Instant</span>
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">💰 Fixed Price</span>
                    <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">⏰ 30s Response</span>
                  </div>
                  <button 
                    onClick={() => setShowQuickBook(true)}
                    className="btn-primary w-full"
                  >
                    Start Quick Book
                  </button>
                </div>
              </div>
            </div>

            {/* Post & Quote Card */}
            <div className="card hover:shadow-md transition-shadow">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Post & Quote
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Get competitive bids from multiple providers. Compare and choose the best!
                  </p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">🏆 Best Price</span>
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">⭐ Top Rated</span>
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">📝 Detailed Quotes</span>
                  </div>
                  <button className="btn-outline w-full">
                    Post a Job
                  </button>
                </div>
              </div>
            </div>

          </div>

          {/* Recent Jobs */}
          <div className="mt-8">
            <div className="card">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-medium text-gray-900">
                  Recent Jobs
                </h3>
                <button className="text-primary-600 hover:text-primary-700 text-sm font-medium">
                  View All
                </button>
              </div>
              
              <div className="space-y-4">
                {/* Empty state */}
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <h4 className="text-gray-900 font-medium mb-2">No jobs yet</h4>
                  <p className="text-gray-500 mb-4">Create your first job using Quick Book or Post & Quote above!</p>
                  <button 
                    onClick={() => setShowQuickBook(true)}
                    className="btn-primary"
                  >
                    Get Started
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Quick Book Modal */}
      <QuickBookModal 
        isOpen={showQuickBook} 
        onClose={() => setShowQuickBook(false)} 
      />
    </div>
  );
}