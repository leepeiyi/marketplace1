// app/bids/[jobId]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@/contexts/UserContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { Clock, Star, MapPin, Phone, MessageCircle, Check, AlertCircle, User } from 'lucide-react';

interface Job {
  id: string;
  title: string;
  description: string;
  category: {
    name: string;
    icon: string;
  };
  address: string;
  status: string;
  type: string;
  createdAt: string;
  acceptPrice?: number;
  estimatedPrice: number;
  biddingEndsAt?: string;
}

interface Bid {
  id: string;
  price: number;
  note: string;
  estimatedEta: number;
  createdAt: string;
  provider: {
    provider: {
      id: string;
      name: string;
      averageRating: number;
      totalJobs: number;
      phone: string;
      yearsExperience: number;
      badges?: string[];
    };
  };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

// BidCard Component
interface BidCardProps {
  bid: Bid;
  index: number;
  job: Job;
  sortBy: string;
  onAccept: (bid: Bid) => void;
  formatTimeAgo: (dateString: string) => string;
  getRatingColor: (rating: number) => string;
  getBidRankText: (bid: Bid, index: number) => string;
}

function BidCard({ 
  bid, 
  index, 
  job, 
  sortBy, 
  onAccept, 
  formatTimeAgo, 
  getRatingColor, 
  getBidRankText 
}: BidCardProps) {
  return (
    <div className="p-6 hover:bg-gray-50 transition-colors">
      
      {/* Bid Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-4">
          {/* Provider Avatar */}
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <User className="w-6 h-6 text-blue-600" />
          </div>
          
          {/* Provider Info */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-gray-900">{bid.provider.provider.name}</h3>
              {getBidRankText(bid, index) && (
                <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                  {getBidRankText(bid, index)}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <Star className={`w-4 h-4 fill-current ${getRatingColor(bid.provider.provider.averageRating)}`} />
                <span className={getRatingColor(bid.provider.provider.averageRating)}>
                  {bid.provider.provider.averageRating}
                </span>
                <span className="text-gray-400">({bid.provider.provider.totalJobs} jobs)</span>
              </div>
              
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{bid.estimatedEta} min ETA</span>
              </div>
              
              <span>{formatTimeAgo(bid.createdAt)}</span>
            </div>
          </div>
        </div>
        
        {/* Price */}
        <div className="text-right">
          <div className="text-2xl font-bold text-green-600">${bid.price}</div>
          <div className="text-sm text-gray-500">
            {((bid.price / job.estimatedPrice) * 100).toFixed(0)}% of estimate
          </div>
        </div>
      </div>

      {/* Provider Badges */}
      {bid.provider.provider.badges && (
        <div className="flex gap-2 mb-3">
          {bid.provider.provider.badges.map((badge, i) => (
            <span key={i} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
              {badge}
            </span>
          ))}
        </div>
      )}

      {/* Bid Note */}
      <div className="mb-4">
        <div className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">
          "{bid.note}"
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => onAccept(bid)}
          disabled={job.status !== 'BROADCASTED'}
          className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" />
          Accept Bid
        </button>
        
        <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2">
          <MessageCircle className="w-4 h-4" />
          Message
        </button>
        
        <button 
          onClick={() => window.open(`tel:${bid.provider.provider.phone}`, '_self')}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2"
        >
          <Phone className="w-4 h-4" />
          Call
        </button>
      </div>
    </div>
  );
}

// Confirmation Modal Component
interface ConfirmationModalProps {
  bid: Bid;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmationModal({ bid, isLoading, onConfirm, onCancel }: ConfirmationModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Accept Bid</h3>
          </div>
          
          <div className="mb-6">
            <p className="text-gray-700 mb-4">
              Are you sure you want to accept this bid from <strong>{bid.provider.provider.name}</strong>?
            </p>
            
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Provider:</span>
                <span className="font-medium">{bid.provider.provider.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Price:</span>
                <span className="font-bold text-green-600">${bid.price}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">ETA:</span>
                <span className="font-medium">{bid.estimatedEta} minutes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Rating:</span>
                <span className="font-medium flex items-center gap-1">
                  <Star className="w-4 h-4 fill-current text-yellow-500" />
                  {bid.provider.provider.averageRating}
                </span>
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-700">
                  <strong>What happens next:</strong>
                  <ul className="mt-2 space-y-1">
                    <li>• Payment will be held securely until job completion</li>
                    <li>• Provider will contact you to arrange service</li>
                    <li>• You can track progress in your dashboard</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Accepting...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Confirm Accept
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main Component - THIS IS THE KEY CHANGE: Default export
export default function BidTrackingPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const { addNotification } = useWebSocket();
  
  const jobId = params.jobId as string;
  
  const [job, setJob] = useState<Job | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [selectedBid, setSelectedBid] = useState<Bid | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [sortBy, setSortBy] = useState('price');
  const [timeLeft, setTimeLeft] = useState('');

  // Load job and bids data
  useEffect(() => {
    if (jobId && user) {
      loadJobData();
      loadBids();
    }
  }, [jobId, user]);

  // Listen for new bids via WebSocket
  useEffect(() => {
    const handleNewBid = (event: any) => {
      const bidData = event.detail;
      if (bidData.jobId === jobId) {
        setBids(prev => [bidData, ...prev]);
        addNotification({
          id: Date.now().toString(),
          type: 'info',
          title: 'New Bid Received!',
          message: `${bidData.providerName} bid $${bidData.price}`,
          timestamp: new Date()
        });
      }
    };

    window.addEventListener('bid_received', handleNewBid);
    return () => window.removeEventListener('bid_received', handleNewBid);
  }, [jobId, addNotification]);

  // Calculate time left for bidding
  useEffect(() => {
    if (!job?.biddingEndsAt) return;

    const updateTimeLeft = () => {
      const now = new Date().getTime();
      const endTime = new Date(job.biddingEndsAt!).getTime();
      const difference = endTime - now;

      if (difference > 0) {
        const hours = Math.floor(difference / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        setTimeLeft(`${hours}h ${minutes}m`);
      } else {
        setTimeLeft('Bidding ended');
      }
    };

    updateTimeLeft();
    const timer = setInterval(updateTimeLeft, 60000);
    return () => clearInterval(timer);
  }, [job?.biddingEndsAt]);

  const loadJobData = async () => {
    try {
      const response = await fetch(`${API_URL}/api/jobs/${jobId}`, {
        headers: {
          'x-user-id': user?.id || '',
        }
      });

      if (response.ok) {
        const jobData = await response.json();
        setJob(jobData);
      } else {
        throw new Error('Failed to load job');
      }
    } catch (error) {
      console.error('Error loading job:', error);
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Error',
        message: 'Failed to load job details',
        timestamp: new Date()
      });
    }
  };

  const loadBids = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/bids/${jobId}/ranked-bids`, {
        headers: {
          'x-user-id': user?.id || '',
        }
      });

      if (response.ok) {
        const bidsData = await response.json();
        setBids(bidsData);
      } else {
        throw new Error('Failed to load bids');
      }
    } catch (error) {
      console.error('Error loading bids:', error);
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Error',
        message: 'Failed to load bids',
        timestamp: new Date()
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptBid = (bid: Bid) => {
    setSelectedBid(bid);
    setShowConfirmation(true);
  };

  const confirmAcceptBid = async () => {
    if (!selectedBid) return;

    setIsAccepting(true);
    try {
      const response = await fetch(`${API_URL}/api/bids/${selectedBid.id}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.id || '',
        }
      });

      if (response.ok) {
        const result = await response.json();
        
        // Store success message in sessionStorage for dashboard redirect
        sessionStorage.setItem('dashboardMessage', JSON.stringify({
          message: result.redirect?.message || `Great! You've hired ${selectedBid.provider.provider.name} for $${selectedBid.price}. They'll contact you soon!`,
          type: 'success'
        }));
        
        // Redirect to dashboard
        router.push('/dashboard');
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to accept bid');
      }
    } catch (error) {
      console.error('Error accepting bid:', error);
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to accept bid',
        timestamp: new Date()
      });
    } finally {
      setIsAccepting(false);
      setShowConfirmation(false);
      setSelectedBid(null);
    }
  };

  // Sort bids
  const sortedBids = [...bids].sort((a, b) => {
    switch (sortBy) {
      case 'price':
        return a.price - b.price;
      case 'rating':
        return b.provider.provider.averageRating - a.provider.provider.averageRating;
      case 'time':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      default:
        return 0;
    }
  });

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 4.8) return 'text-green-600';
    if (rating >= 4.5) return 'text-blue-600';
    if (rating >= 4.0) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getBidRankText = (bid: Bid, index: number) => {
    if (index === 0 && sortBy === 'price') return '🏆 Best Price';
    if (index === 0 && sortBy === 'rating') return '⭐ Top Rated';
    if (job?.acceptPrice && bid.price <= job.acceptPrice) return '✅ Auto-Accept Price';
    return '';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-600">Loading bids...</div>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-600">Job not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => router.back()}
                className="text-blue-600 hover:text-blue-700 mb-2 flex items-center gap-1"
              >
                ← Back
              </button>
              <h1 className="text-2xl font-bold text-gray-900">Track Bids</h1>
              <p className="text-gray-600">Job ID: {job.id.slice(-8)}</p>
            </div>
            {job.type === 'POST_QUOTE' && timeLeft && (
              <div className="text-right">
                <div className="text-sm text-gray-500">Bidding ends in</div>
                <div className="text-lg font-semibold text-blue-600">{timeLeft}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Job Details Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6 sticky top-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Details</h2>
              
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-500">Service</div>
                  <div className="font-medium">{job.category.icon} {job.category.name}</div>
                </div>
                
                <div>
                  <div className="text-sm text-gray-500">Title</div>
                  <div className="font-medium">{job.title}</div>
                </div>
                
                <div>
                  <div className="text-sm text-gray-500">Description</div>
                  <div className="text-sm text-gray-700">{job.description}</div>
                </div>
                
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <div className="text-sm text-gray-500">Location</div>
                    <div className="text-sm text-gray-700">{job.address}</div>
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <div className="text-sm text-gray-500">Market Estimate</div>
                  <div className="font-bold text-blue-600">${job.estimatedPrice}</div>
                </div>
                
                {job.acceptPrice && (
                  <div>
                    <div className="text-sm text-gray-500">Auto-Accept Price</div>
                    <div className="font-bold text-green-600">${job.acceptPrice}</div>
                    <div className="text-xs text-gray-500">Any bid ≤ this amount will be auto-accepted</div>
                  </div>
                )}
                
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                    job.status === 'BROADCASTED' ? 'bg-blue-500' :
                    job.status === 'BOOKED' ? 'bg-green-500' :
                    'bg-gray-500'
                  }`}></div>
                  <span className="text-sm font-medium">{job.status}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bids Section */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow">
              
              {/* Bids Header */}
              <div className="p-6 border-b">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Received Bids ({bids.length})
                  </h2>
                  
                  {bids.length > 0 && (
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="text-sm border border-gray-300 rounded-md px-3 py-1"
                    >
                      <option value="price">Sort by Price</option>
                      <option value="rating">Sort by Rating</option>
                      <option value="time">Sort by Time</option>
                    </select>
                  )}
                </div>

                {bids.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Waiting for Bids</h3>
                    <p className="text-gray-500">
                      Providers are being notified about your job. Bids typically arrive within 5-15 minutes.
                    </p>
                  </div>
                ) : (
                  <div className="text-sm text-gray-600">
                    Compare bids and choose the best provider for your job
                  </div>
                )}
              </div>

              {/* Bids List */}
              <div className="divide-y">
                {sortedBids.map((bid, index) => (
                  <BidCard
                    key={bid.id}
                    bid={bid}
                    index={index}
                    job={job}
                    sortBy={sortBy}
                    onAccept={handleAcceptBid}
                    formatTimeAgo={formatTimeAgo}
                    getRatingColor={getRatingColor}
                    getBidRankText={getBidRankText}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && selectedBid && (
        <ConfirmationModal
          bid={selectedBid}
          isLoading={isAccepting}
          onConfirm={confirmAcceptBid}
          onCancel={() => setShowConfirmation(false)}
        />
      )}
    </div>
  );
}