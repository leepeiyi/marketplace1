// app/jobs/[jobId]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@/contexts/UserContext';
import { Phone, Mail, Star, MapPin, Calendar, DollarSign, User, MessageCircle, Clock, Shield } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

interface JobDetails {
  id: string;
  title: string;
  description: string;
  status: string;
  type: string;
  estimatedPrice?: number;
  acceptPrice?: number;
  finalPrice?: number;
  address: string;
  scheduledAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  category: {
    name: string;
    icon: string;
  };
  provider?: {
    id: string;
    name: string;
    phone: string;
    email?: string;
    averageRating: number;
    totalJobs: number;
  };
  escrow?: {
    id: string;
    amount: number;
    status: string;
    heldAt: string;
    releasedAt?: string;
  };
  bids?: Array<{
    id: string;
    price: number;
    note?: string;
    estimatedEta: number;
    status: string;
    provider: {
      provider: {
        name: string;
        phone: string;
        averageRating: number;
        totalJobs: number;
      };
    };
  }>;
}

export default function JobDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  
  const jobId = params.jobId as string;
  
  const [job, setJob] = useState<JobDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (jobId && user) {
      loadJobDetails();
    }
  }, [jobId, user]);

  const loadJobDetails = async () => {
    try {
      const response = await fetch(`${API_URL}/api/jobs/${jobId}`, {
        headers: {
          'x-user-id': user?.id || '',
        }
      });

      if (response.ok) {
        const data = await response.json();
        setJob(data);
      } else {
        setError('Failed to load job details');
      }
    } catch (error) {
      console.error('Error loading job details:', error);
      setError('Failed to load job details');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'BOOKED':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'IN_PROGRESS':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'COMPLETED':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'CANCELLED_BY_CUSTOMER':
      case 'CANCELLED_BY_PROVIDER':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'BOOKED':
        return 'Booked & Confirmed';
      case 'IN_PROGRESS':
        return 'Service in Progress';
      case 'COMPLETED':
        return 'Completed';
      case 'CANCELLED_BY_CUSTOMER':
        return 'Cancelled by You';
      case 'CANCELLED_BY_PROVIDER':
        return 'Cancelled by Provider';
      default:
        return status;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'BOOKED':
        return '✅';
      case 'IN_PROGRESS':
        return '⏳';
      case 'COMPLETED':
        return '🎉';
      case 'CANCELLED_BY_CUSTOMER':
      case 'CANCELLED_BY_PROVIDER':
        return '❌';
      default:
        return '📋';
    }
  };

  const getAcceptedBid = () => {
    return job?.bids?.find(bid => bid.status === 'ACCEPTED');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {error || 'Job not found'}
          </h2>
          <button 
            onClick={() => router.push('/dashboard')}
            className="text-blue-600 hover:text-blue-700"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const acceptedBid = getAcceptedBid();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => router.push('/')}
                className="text-blue-600 hover:text-blue-700 mb-2 flex items-center gap-1"
              >
                ← Back to Dashboard
              </button>
              <h1 className="text-2xl font-bold text-gray-900">Job Details</h1>
              <p className="text-gray-600">Job ID: {job.id.slice(-8)}</p>
            </div>
            <div className="text-right">
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${getStatusColor(job.status)}`}>
                <span>{getStatusIcon(job.status)}</span>
                <span className="font-medium">{getStatusText(job.status)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Job Information */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Job Overview */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start gap-4 mb-6">
                <div className="text-4xl">{job.category.icon}</div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">{job.title}</h2>
                  <p className="text-gray-600 text-lg mb-4">{job.description}</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-gray-400" />
                      <span className="text-gray-700">{job.address}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-gray-400" />
                      <span className="text-gray-700">
                        Created {new Date(job.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full">
                      {job.category.name}
                    </span>
                    <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full">
                      {job.type === 'QUICK_BOOK' ? 'Quick Book' : 'Post & Quote'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Provider Information */}
            {(job.provider || acceptedBid) && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Service Provider
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-500">Provider Name</label>
                      <p className="font-semibold text-lg">
                        {job.provider?.name || acceptedBid?.provider.provider.name}
                      </p>
                    </div>
                    
                    <div>
                      <label className="text-sm text-gray-500">Phone Number</label>
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-blue-600" />
                        <a 
                          href={`tel:${job.provider?.phone || acceptedBid?.provider.provider.phone}`}
                          className="font-medium text-blue-600 hover:text-blue-700"
                        >
                          {job.provider?.phone || acceptedBid?.provider.provider.phone}
                        </a>
                      </div>
                    </div>
                    
                    {job.provider?.email && (
                      <div>
                        <label className="text-sm text-gray-500">Email</label>
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-blue-600" />
                          <a 
                            href={`mailto:${job.provider.email}`}
                            className="font-medium text-blue-600 hover:text-blue-700"
                          >
                            {job.provider.email}
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-500">Rating</label>
                      <div className="flex items-center gap-2">
                        <Star className="w-5 h-5 fill-current text-yellow-500" />
                        <span className="font-semibold">
                          {job.provider?.averageRating || acceptedBid?.provider.provider.averageRating}
                        </span>
                        <span className="text-gray-500 text-sm">
                          ({job.provider?.totalJobs || acceptedBid?.provider.provider.totalJobs} completed jobs)
                        </span>
                      </div>
                    </div>
                    
                    {acceptedBid?.estimatedEta && (
                      <div>
                        <label className="text-sm text-gray-500">Estimated Service Time</label>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-600" />
                          <span className="font-medium">{acceptedBid.estimatedEta} minutes</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                {acceptedBid?.note && (
                  <div className="mt-6">
                    <label className="text-sm text-gray-500">Provider Note</label>
                    <div className="mt-2 p-4 bg-gray-50 rounded-lg">
                      <p className="text-gray-700">{acceptedBid.note}</p>
                    </div>
                  </div>
                )}
                
                {/* Contact Actions */}
                <div className="mt-6 flex gap-3">
                  <button 
                    onClick={() => window.open(`tel:${job.provider?.phone || acceptedBid?.provider.provider.phone}`, '_self')}
                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                  >
                    <Phone className="w-4 h-4" />
                    Call Provider
                  </button>
                  <button className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2">
                    <MessageCircle className="w-4 h-4" />
                    Send Message
                  </button>
                </div>
              </div>
            )}

            {/* Job Timeline */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Job Timeline</h3>
              
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                  </div>
                  <div>
                    <p className="font-medium">Job Created</p>
                    <p className="text-sm text-gray-500">{new Date(job.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                
                {job.status !== 'PENDING' && (
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <div className="w-3 h-3 bg-green-600 rounded-full"></div>
                    </div>
                    <div>
                      <p className="font-medium">Provider Assigned</p>
                      <p className="text-sm text-gray-500">{new Date(job.updatedAt).toLocaleString()}</p>
                    </div>
                  </div>
                )}
                
                {job.scheduledAt && (
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                      <div className="w-3 h-3 bg-yellow-600 rounded-full"></div>
                    </div>
                    <div>
                      <p className="font-medium">Service Scheduled</p>
                      <p className="text-sm text-gray-500">{new Date(job.scheduledAt).toLocaleString()}</p>
                    </div>
                  </div>
                )}
                
                {job.completedAt && (
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                      <div className="w-3 h-3 bg-purple-600 rounded-full"></div>
                    </div>
                    <div>
                      <p className="font-medium">Service Completed</p>
                      <p className="text-sm text-gray-500">{new Date(job.completedAt).toLocaleString()}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Price & Payment */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Price & Payment
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-500">Final Price</label>
                  <p className="text-2xl font-bold text-green-600">
                    ${job.finalPrice || acceptedBid?.price || job.estimatedPrice || job.acceptPrice}
                  </p>
                </div>
                
                {job.estimatedPrice && job.estimatedPrice !== (job.finalPrice || acceptedBid?.price) && (
                  <div>
                    <label className="text-sm text-gray-500">Original Estimate</label>
                    <p className="text-lg text-gray-600">${job.estimatedPrice}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Status */}
            {job.escrow && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Payment Security
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-gray-500">Escrow Amount</label>
                    <p className="text-xl font-bold text-green-600">${job.escrow.amount}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm text-gray-500">Status</label>
                    <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                      job.escrow.status === 'HELD' ? 'bg-yellow-100 text-yellow-800' :
                      job.escrow.status === 'RELEASED' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {job.escrow.status === 'HELD' ? '🔒 Funds Secured' : 
                       job.escrow.status === 'RELEASED' ? '✅ Payment Released' : 
                       job.escrow.status}
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm text-gray-500">Secured On</label>
                    <p className="text-sm text-gray-700">{new Date(job.escrow.heldAt).toLocaleString()}</p>
                  </div>
                  
                  {job.escrow.releasedAt && (
                    <div>
                      <label className="text-sm text-gray-500">Released On</label>
                      <p className="text-sm text-gray-700">{new Date(job.escrow.releasedAt).toLocaleString()}</p>
                    </div>
                  )}
                  
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-blue-800 text-sm">
                      💰 Your payment is securely held until the job is completed to your satisfaction.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions</h3>
              
              <div className="space-y-3">
                {job.status === 'COMPLETED' && (
                  <button className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Leave a Review
                  </button>
                )}
                
                {job.status === 'BOOKED' && (
                  <div className="p-4 bg-green-50 rounded-lg">
                    <p className="text-green-800 font-medium text-sm mb-2">
                      🎉 Your provider will contact you soon!
                    </p>
                    <p className="text-green-700 text-sm">
                      They'll arrange a convenient time for the service.
                    </p>
                  </div>
                )}

                
                <button 
                  onClick={() => router.push('/')}
                  className="w-full px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
} 