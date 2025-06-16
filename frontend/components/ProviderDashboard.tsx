'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/contexts/UserContext';
import { useWebSocket } from '@/contexts/WebSocketContext';

interface Job {
  id: string;
  title: string;
  category: string;
  address: string;
  customerName: string;
  estimatedPrice: number;
  distance: number;
  quickBookDeadline: string;
  receivedAt: number; // timestamp when job was received
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

export function ProviderDashboard() {
  const { user, logout } = useUser();
  const { addNotification } = useWebSocket();
  
  const [isAvailable, setIsAvailable] = useState(true);
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [myJobs, setMyJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Listen for WebSocket job notifications
  useEffect(() => {
    const handleNewJob = (event: any) => {
      const jobData = event.detail;
      console.log('📋 New job received:', jobData);
      
      const newJob: Job = {
        id: jobData.id,
        title: jobData.title,
        category: jobData.category,
        address: jobData.address,
        customerName: jobData.customerName,
        estimatedPrice: jobData.estimatedPrice,
        distance: jobData.distance,
        quickBookDeadline: jobData.quickBookDeadline,
        receivedAt: Date.now()
      };
      
      setAvailableJobs(prev => [newJob, ...prev]);
      
      // Show notification
      addNotification({
        id: Date.now().toString(),
        type: 'info',
        title: 'New Job Available!',
        message: `${jobData.title} - $${jobData.estimatedPrice} (${jobData.distance}km away)`,
        timestamp: new Date()
      });
    };

    const handleJobTaken = (event: any) => {
      const { jobId } = event.detail;
      setAvailableJobs(prev => prev.filter(job => job.id !== jobId));
    };

    // Listen for custom events from WebSocketContext
    window.addEventListener('new_job_available', handleNewJob);
    window.addEventListener('job_taken', handleJobTaken);

    return () => {
      window.removeEventListener('new_job_available', handleNewJob);
      window.removeEventListener('job_taken', handleJobTaken);
    };
  }, [addNotification]);

  // Load existing jobs on mount
  useEffect(() => {
    if (user && isAvailable) {
      loadAvailableJobs();
      loadMyJobs();
    }
  }, [user, isAvailable]);

  const loadAvailableJobs = async () => {
    try {
      const response = await fetch(`${API_URL}/api/jobs/available`, {
        headers: {
          'x-user-id': user?.id || '',
        }
      });
      
      if (response.ok) {
        const jobs = await response.json();
        const formattedJobs = jobs.map((job: any) => ({
          id: job.id,
          title: job.title,
          category: job.category.name,
          address: job.address,
          customerName: job.customer.name,
          estimatedPrice: job.estimatedPrice,
          distance: job.distance,
          quickBookDeadline: job.quickBookDeadline,
          receivedAt: Date.now()
        }));
        setAvailableJobs(formattedJobs);
      }
    } catch (error) {
      console.error('Error loading available jobs:', error);
    }
  };

  const loadMyJobs = async () => {
    try {
      const response = await fetch(`${API_URL}/api/jobs/provider`, {
        headers: {
          'x-user-id': user?.id || '',
        }
      });
      
      if (response.ok) {
        const jobs = await response.json();
        setMyJobs(jobs);
      }
    } catch (error) {
      console.error('Error loading my jobs:', error);
    }
  };

  const acceptJob = async (jobId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/jobs/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.id || '',
        },
        body: JSON.stringify({ jobId })
      });

      if (response.ok) {
        const result = await response.json();
        
        // Remove from available jobs
        setAvailableJobs(prev => prev.filter(job => job.id !== jobId));
        
        // Add to my jobs
        setMyJobs(prev => [result.job, ...prev]);
        
        addNotification({
          id: Date.now().toString(),
          type: 'success',
          title: 'Job Accepted!',
          message: 'You have successfully accepted the job',
          timestamp: new Date()
        });
      } else if (response.status === 409) {
        // Job already taken
        setAvailableJobs(prev => prev.filter(job => job.id !== jobId));
        
        addNotification({
          id: Date.now().toString(),
          type: 'warning',
          title: 'Job Already Taken',
          message: 'Another provider accepted this job first',
          timestamp: new Date()
        });
      } else {
        throw new Error('Failed to accept job');
      }
    } catch (error) {
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Error',
        message: 'Failed to accept job',
        timestamp: new Date()
      });
    } finally {
      setIsLoading(false);
    }
  };

  const declineJob = (jobId: string) => {
    setAvailableJobs(prev => prev.filter(job => job.id !== jobId));
    
    addNotification({
      id: Date.now().toString(),
      type: 'info',
      title: 'Job Declined',
      message: 'Job removed from your list',
      timestamp: new Date()
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="text-xl font-bold text-blue-600">Quickly</div>
              <div className="ml-4 text-sm text-gray-500">Provider Dashboard</div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">Hello, {user?.name}</span>
              <button 
                onClick={logout} 
                className="px-3 py-1 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          
          {/* Availability Toggle */}
          <div className="bg-white shadow rounded-lg p-6 mb-6">
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
                  isAvailable ? 'bg-blue-600' : 'bg-gray-200'
                }`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isAvailable ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </div>
                <span className={`ml-3 text-sm font-medium ${
                  isAvailable ? 'text-green-600' : 'text-gray-500'
                }`}>
                  {isAvailable ? 'Available' : 'Unavailable'}
                </span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Available Jobs */}
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Available Jobs
                </h3>
                <span className="text-sm text-gray-500">
                  {availableJobs.length} jobs
                </span>
              </div>
              
              <div className="space-y-4">
                {!isAvailable ? (
                  <div className="text-gray-500 text-center py-8">
                    Set yourself as available to see jobs
                  </div>
                ) : availableJobs.length === 0 ? (
                  <div className="text-gray-500 text-center py-8">
                    Waiting for job notifications...
                  </div>
                ) : (
                  availableJobs.map((job) => (
                    <JobCard 
                      key={job.id} 
                      job={job} 
                      onAccept={acceptJob}
                      onDecline={declineJob}
                      isLoading={isLoading}
                    />
                  ))
                )}
              </div>
            </div>

            {/* My Jobs */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                My Jobs
              </h3>
              <div className="space-y-4">
                {myJobs.length === 0 ? (
                  <div className="text-gray-500 text-center py-8">
                    No active jobs
                  </div>
                ) : (
                  myJobs.map((job) => (
                    <div key={job.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium text-gray-900">{job.title}</h4>
                          <p className="text-sm text-gray-600">{job.category.name}</p>
                          <p className="text-sm text-gray-500">{job.address}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-green-600">${job.estimatedPrice}</div>
                          <div className={`text-sm px-2 py-1 rounded-full ${
                            job.status === 'BOOKED' ? 'bg-blue-100 text-blue-800' :
                            job.status === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-800' :
                            job.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {job.status}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}

// Job Card Component with Countdown Timer
function JobCard({ 
  job, 
  onAccept, 
  onDecline, 
  isLoading 
}: { 
  job: Job, 
  onAccept: (jobId: string) => void,
  onDecline: (jobId: string) => void,
  isLoading: boolean
}) {
  const [timeLeft, setTimeLeft] = useState(30);

  useEffect(() => {
    // Calculate time left based on when job was received
    const elapsed = Math.floor((Date.now() - job.receivedAt) / 1000);
    const remaining = Math.max(0, 30 - elapsed);
    setTimeLeft(remaining);

    if (remaining <= 0) {
      onDecline(job.id);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          onDecline(job.id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [job.receivedAt, job.id, onDecline]);

  const formatTime = (seconds: number) => {
    return `${seconds}s`;
  };

  return (
    <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
      {/* Countdown Timer */}
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-medium text-blue-600">
          ⏱️ Quick Book Job
        </div>
        <div className={`text-sm font-bold px-2 py-1 rounded-full ${
          timeLeft <= 10 ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
        }`}>
          {formatTime(timeLeft)}
        </div>
      </div>

      {/* Job Details */}
      <div className="mb-4">
        <h4 className="font-medium text-gray-900 mb-1">{job.title}</h4>
        <p className="text-sm text-gray-600">{job.category}</p>
        <p className="text-sm text-gray-500">{job.address}</p>
        <p className="text-sm text-gray-500">Customer: {job.customerName}</p>
        
        <div className="flex justify-between items-center mt-2">
          <div className="text-lg font-bold text-green-600">${job.estimatedPrice}</div>
          <div className="text-sm text-gray-500">{job.distance}km away</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onAccept(job.id)}
          disabled={isLoading || timeLeft <= 0}
          className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {isLoading ? 'Accepting...' : 'Accept Job'}
        </button>
        <button
          onClick={() => onDecline(job.id)}
          disabled={isLoading}
          className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          Decline
        </button>
      </div>
    </div>
  );
}