// components/CustomerDashboard.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/UserContext';
import { QuickBookModal } from './QuickBookModal';
import { PostQuoteModal } from './PostQuoteModal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

interface RecentJob {
  id: string;
  title: string;
  status: string;
  type: string;
  estimatedPrice?: number;
  acceptPrice?: number;
  createdAt: string;
  category: {
    name: string;
    icon: string;
  };
  address: string;
  bidsCount?: number;
}

export function CustomerDashboard() {
  const { user, logout } = useUser();
  const router = useRouter();
  const [showQuickBook, setShowQuickBook] = useState(false);
  const [showPostQuote, setShowPostQuote] = useState(false);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  
  // Add success message state
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check for success message on mount
  useEffect(() => {
    const messageData = sessionStorage.getItem('dashboardMessage');
    if (messageData) {
      try {
        const { message, type } = JSON.parse(messageData);
        if (type === 'success') {
          setSuccessMessage(message);
          // Clear the message from storage
          sessionStorage.removeItem('dashboardMessage');
          
          // Auto-hide after 5 seconds
          setTimeout(() => {
            setSuccessMessage(null);
          }, 5000);
        }
      } catch (error) {
        console.error('Error parsing dashboard message:', error);
        sessionStorage.removeItem('dashboardMessage');
      }
    }
  }, []);

  // Load recent jobs on mount
  useEffect(() => {
    if (user) {
      loadRecentJobs();
    }
  }, [user]);

  const loadRecentJobs = async () => {
    setIsLoadingJobs(true);
    try {
      const response = await fetch(`${API_URL}/api/jobs/customer`, {
        headers: {
          'x-user-id': user?.id || '',
        }
      });
      
      if (response.ok) {
        const jobs = await response.json();
        
        // Get bid counts for POST_QUOTE jobs
        const jobsWithBids = await Promise.all(
          jobs.slice(0, 5).map(async (job: any) => {
            let bidsCount = 0;
            
            if (job.type === 'POST_QUOTE' && job.status === 'BROADCASTED') {
              try {
                const bidsResponse = await fetch(`${API_URL}/api/bids/${job.id}/ranked-bids`, {
                  headers: {
                    'x-user-id': user?.id || '',
                  }
                });
                
                if (bidsResponse.ok) {
                  const bids = await bidsResponse.json();
                  bidsCount = bids.length;
                }
              } catch (error) {
                console.error('Error loading bid count:', error);
              }
            }
            
            return {
              ...job,
              bidsCount
            };
          })
        );
        
        setRecentJobs(jobsWithBids);
      }
    } catch (error) {
      console.error('Error loading recent jobs:', error);
    } finally {
      setIsLoadingJobs(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'BROADCASTED':
        return 'bg-blue-100 text-blue-800';
      case 'BOOKED':
        return 'bg-green-100 text-green-800';
      case 'IN_PROGRESS':
        return 'bg-yellow-100 text-yellow-800';
      case 'COMPLETED':
        return 'bg-gray-100 text-gray-800';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'BROADCASTED':
        return 'Active';
      case 'BOOKED':
        return 'Booked';
      case 'IN_PROGRESS':
        return 'In Progress';
      case 'COMPLETED':
        return 'Completed';
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="text-xl font-bold text-blue-600">Quickly</div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">Hello, {user?.name}</span>
              <button onClick={logout} className="px-3 py-1 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Success Message Banner */}
      {successMessage && (
        <div className="bg-green-50 border-l-4 border-green-400 p-4 mx-auto max-w-7xl">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-700 font-medium">
                {successMessage}
              </p>
            </div>
            <div className="ml-auto pl-3">
              <div className="-mx-1.5 -my-1.5">
                <button
                  type="button"
                  onClick={() => setSuccessMessage(null)}
                  className="inline-flex bg-green-50 rounded-md p-1.5 text-green-500 hover:bg-green-100"
                >
                  <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          
          {/* Welcome Section */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.name}!</h1>
            <p className="text-gray-600">What service do you need today?</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Quick Book Card */}
            <div className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Start Quick Book
                  </button>
                </div>
              </div>
            </div>

            {/* Post & Quote Card */}
            <div className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow">
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
                  <button 
                    onClick={() => setShowPostQuote(true)}
                    className="w-full px-4 py-2 border border-orange-600 text-orange-600 rounded-md hover:bg-orange-50"
                  >
                    Post a Job
                  </button>
                </div>
              </div>
            </div>

          </div>

          {/* Recent Jobs */}
          <div className="mt-8">
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-medium text-gray-900">
                  Recent Jobs
                </h3>
                <button 
                  onClick={() => router.push('/jobs')}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  View All
                </button>
              </div>
              
              <div className="space-y-4">
                {isLoadingJobs ? (
                  <div className="text-center py-8">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-gray-500">Loading jobs...</p>
                  </div>
                ) : recentJobs.length === 0 ? (
                  /* Empty state */
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <h4 className="text-gray-900 font-medium mb-2">No jobs yet</h4>
                    <p className="text-gray-500 mb-4">Create your first job using Quick Book or Post & Quote above!</p>
                    <div className="flex gap-2 justify-center">
                      <button 
                        onClick={() => setShowQuickBook(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        Quick Book
                      </button>
                      <button 
                        onClick={() => setShowPostQuote(true)}
                        className="px-4 py-2 border border-orange-600 text-orange-600 rounded-md hover:bg-orange-50"
                      >
                        Post & Quote
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Recent Jobs List */
                  <div className="space-y-4">
                    {recentJobs.map((job) => (
                      <div key={job.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-lg">{job.category.icon}</span>
                              <div>
                                <h4 className="font-medium text-gray-900">{job.title}</h4>
                                <p className="text-sm text-gray-600">{job.category.name}</p>
                              </div>
                            </div>
                            
                            <p className="text-sm text-gray-500 mb-2">{job.address}</p>
                            
                            <div className="flex items-center gap-4 mt-2">
                              <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(job.status)}`}>
                                {getStatusText(job.status)}
                              </span>
                              
                              {job.type === 'POST_QUOTE' && job.status === 'BROADCASTED' && (
                                <span className="text-xs text-orange-600 font-medium bg-orange-50 px-2 py-1 rounded-full">
                                  🔥 {job.bidsCount || 0} bid{job.bidsCount !== 1 ? 's' : ''} received
                                </span>
                              )}
                              
                              <span className="text-xs text-gray-500">
                                {formatDate(job.createdAt)}
                              </span>
                            </div>
                          </div>
                          
                          <div className="text-right ml-4">
                            <div className="text-lg font-bold text-green-600">
                              ${job.estimatedPrice || job.acceptPrice}
                            </div>
                            
                            <div className="mt-2 space-y-1">
                              {job.type === 'POST_QUOTE' && job.status === 'BROADCASTED' && (
                                <button
                                  onClick={() => router.push(`/bids/${job.id}`)}
                                  className="text-sm bg-orange-600 text-white px-3 py-1 rounded-md hover:bg-orange-700 w-full"
                                >
                                  Track Bids
                                </button>
                              )}
                              
                              {job.status === 'BOOKED' && (
                                <button
                                  onClick={() => router.push(`/jobs/${job.id}`)}
                                  className="text-sm bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 w-full"
                                >
                                  View Job
                                </button>
                              )}
                              
                              {(job.status === 'IN_PROGRESS' || job.status === 'COMPLETED') && (
                                <button
                                  onClick={() => router.push(`/jobs/${job.id}/track`)}
                                  className="text-sm bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700 w-full"
                                >
                                  Track Progress
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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

      {/* Post Quote Modal */}
      <PostQuoteModal 
        isOpen={showPostQuote} 
        onClose={() => setShowPostQuote(false)} 
      />
    </div>
  );
}