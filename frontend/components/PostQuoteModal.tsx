'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/contexts/UserContext';
import { useWebSocket } from '@/contexts/WebSocketContext';

interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
}

interface PriceGuidance {
  p10: number;
  p50: number;
  p90: number;
  dataPoints: number;
}

interface PostQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CreatedJob {
  id: string;
  title: string;
  estimatedPrice?: number;
  acceptPrice?: number;
  biddingEndsAt: string;
  status: string;
  type: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

export function PostQuoteModal({ isOpen, onClose }: PostQuoteModalProps) {
  const { user } = useUser();
  const { addNotification } = useWebSocket();
  
  // Form state
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [priceGuidance, setPriceGuidance] = useState<PriceGuidance | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [acceptPrice, setAcceptPrice] = useState<string>(''); // Optional accept price
  const [useAcceptPrice, setUseAcceptPrice] = useState(false);
  
  // Location state
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [coordinates, setCoordinates] = useState<{lat: number, lng: number} | null>(null);
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [step, setStep] = useState(1); // 1: Form, 2: Confirmation, 3: Success
  const [createdJob, setCreatedJob] = useState<CreatedJob | null>(null);

  // Load categories on mount
  useEffect(() => {
    if (isOpen) {
      loadCategories();
      resetForm();
    }
  }, [isOpen]);

  // Load price guidance when category changes
  useEffect(() => {
    if (selectedCategory) {
      loadPriceGuidance(selectedCategory);
    } else {
      setPriceGuidance(null);
    }
  }, [selectedCategory]);

  const loadCategories = async () => {
    setIsLoadingCategories(true);
    try {
      const response = await fetch(`${API_URL}/api/categories`, {
        headers: {
          'x-user-id': user?.id || '',
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      } else {
        throw new Error('Failed to load categories');
      }
    } catch (error) {
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Error',
        message: 'Failed to load categories',
        timestamp: new Date()
      });
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const loadPriceGuidance = async (categoryId: string) => {
    setIsLoadingPrice(true);
    try {
      const response = await fetch(`${API_URL}/api/jobs/price-guidance/${categoryId}`, {
        headers: {
          'x-user-id': user?.id || '',
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setPriceGuidance(data);
        
        // Auto-suggest accept price as 120% of median
        if (data.p50 && !acceptPrice) {
          const suggestedPrice = Math.round(data.p50 * 1.2);
          setAcceptPrice(suggestedPrice.toString());
        }
      }
    } catch (error) {
      console.error('Error loading price guidance:', error);
    } finally {
      setIsLoadingPrice(false);
    }
  };

  const getCurrentLocation = () => {
    setIsGettingLocation(true);
    
    if (!navigator.geolocation) {
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Location Error',
        message: 'Geolocation is not supported by this browser',
        timestamp: new Date()
      });
      setIsGettingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCoordinates({ lat: latitude, lng: longitude });
        
        // Reverse geocode to get address
        reverseGeocode(latitude, longitude);
        setIsGettingLocation(false);
      },
      (error) => {
        console.error('Error getting location:', error);
        addNotification({
          id: Date.now().toString(),
          type: 'error',
          title: 'Location Error',
          message: 'Could not get your current location',
          timestamp: new Date()
        });
        setIsGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 600000
      }
    );
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      // In a real app, you'd use a geocoding service
      setAddress(`Address near ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    } catch (error) {
      console.error('Reverse geocoding failed:', error);
    }
  };

  const validateForm = () => {
    if (!selectedCategory) return 'Please select a service category';
    if (!title.trim()) return 'Please enter a job title';
    if (!description.trim()) return 'Please enter a description';
    if (!address.trim()) return 'Please enter an address';
    if (!coordinates) return 'Location coordinates are required';
    if (useAcceptPrice && (!acceptPrice || parseFloat(acceptPrice) <= 0)) {
      return 'Please enter a valid accept price';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationError = validateForm();
    if (validationError) {
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Validation Error',
        message: validationError,
        timestamp: new Date()
      });
      return;
    }

    setStep(2); // Show confirmation
  };

  const confirmPosting = async () => {
    setIsLoading(true);
    
    try {
      const jobData: any = {
        categoryId: selectedCategory,
        title: title.trim(),
        description: description.trim(),
        latitude: coordinates!.lat,
        longitude: coordinates!.lng,
        address: address.trim()
      };

      // Add accept price if enabled
      if (useAcceptPrice && acceptPrice) {
        jobData.acceptPrice = parseFloat(acceptPrice);
      }

      const response = await fetch(`${API_URL}/api/jobs/post-quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.id || '',
        },
        body: JSON.stringify(jobData)
      });

      if (response.ok) {
        const job = await response.json();
        setCreatedJob(job);
        setStep(3); // Success screen
        
        addNotification({
          id: Date.now().toString(),
          type: 'success',
          title: 'Job Posted!',
          message: 'Your job is now being broadcast to providers',
          timestamp: new Date()
        });
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create job');
      }
    } catch (error) {
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to create job',
        timestamp: new Date()
      });
      setStep(1); // Go back to form
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedCategory('');
    setPriceGuidance(null);
    setTitle('');
    setDescription('');
    setAddress('');
    setAcceptPrice('');
    setUseAcceptPrice(false);
    setCoordinates(null);
    setStep(1);
    setCreatedJob(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const selectedCategoryData = categories.find(c => c.id === selectedCategory);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">
            {step === 1 ? 'Post & Quote Job' :
             step === 2 ? 'Confirm Job Posting' :
             'Job Posted Successfully!'}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={isLoading}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          
          {/* Step 1: Form */}
          {step === 1 && (
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Info Banner */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-orange-600 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h4 className="font-medium text-orange-800 mb-1">Post & Quote Process</h4>
                    <p className="text-sm text-orange-700">
                      Your job will be broadcast in stages: first to top-rated providers nearby, 
                      then expanding to more providers over time. You'll receive competitive bids to choose from.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Service Category *
                </label>
                {isLoadingCategories ? (
                  <div className="animate-pulse bg-gray-200 h-10 rounded-lg"></div>
                ) : (
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    required
                  >
                    <option value="">Select a category...</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.icon} {category.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Price Guidance */}
              {selectedCategory && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-3 flex items-center">
                    <span className="mr-2">💡</span>
                    Market Pricing for {selectedCategoryData?.name}
                  </h3>
                  {isLoadingPrice ? (
                    <div className="animate-pulse">
                      <div className="bg-gray-200 h-4 rounded mb-2"></div>
                      <div className="bg-gray-200 h-4 rounded w-3/4"></div>
                    </div>
                  ) : priceGuidance ? (
                    <>
                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div className="text-center">
                          <div className="text-xs text-gray-600 mb-1">Low End</div>
                          <div className="text-lg font-bold text-green-600">${priceGuidance.p10}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-gray-600 mb-1">Market Rate</div>
                          <div className="text-lg font-bold text-blue-600">${priceGuidance.p50}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-gray-600 mb-1">Premium</div>
                          <div className="text-lg font-bold text-purple-600">${priceGuidance.p90}</div>
                        </div>
                      </div>
                      <div className="text-sm text-gray-600">
                        <strong>Market rate: ${priceGuidance.p50}</strong>
                        {priceGuidance.dataPoints > 0 && 
                          ` (based on ${priceGuidance.dataPoints} completed jobs)`
                        }
                      </div>
                    </>
                  ) : null}
                </div>
              )}

              {/* Job Details */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Job Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Kitchen renovation needed"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Detailed Description *
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your project in detail, including any specific requirements, materials, timeline, etc."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  required
                />
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Enter your address"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={getCurrentLocation}
                    disabled={isGettingLocation}
                    className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                  >
                    {isGettingLocation ? (
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
                {coordinates && (
                  <p className="text-xs text-green-600 mt-1">✓ Location coordinates obtained</p>
                )}
              </div>

              {/* Accept Price (Optional) */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center mb-3">
                  <input
                    type="checkbox"
                    id="useAcceptPrice"
                    checked={useAcceptPrice}
                    onChange={(e) => setUseAcceptPrice(e.target.checked)}
                    className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                  />
                  <label htmlFor="useAcceptPrice" className="ml-2 text-sm font-medium text-gray-700">
                    Set Auto-Accept Price (Optional)
                  </label>
                </div>
                
                {useAcceptPrice && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-gray-600">$</span>
                      <input
                        type="number"
                        value={acceptPrice}
                        onChange={(e) => setAcceptPrice(e.target.value)}
                        placeholder="120"
                        min="1"
                        step="1"
                        className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      />
                      <span className="text-sm text-gray-600">
                        {priceGuidance && acceptPrice && 
                          `(${Math.round((parseFloat(acceptPrice) / priceGuidance.p50) * 100)}% of market rate)`
                        }
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Any bid at or below this price will be automatically accepted
                    </p>
                  </div>
                )}
                
                <p className="text-xs text-gray-500 mt-2">
                  {useAcceptPrice 
                    ? "Providers who bid at or below your accept price will be hired immediately"
                    : "You'll review all bids and choose your preferred provider"
                  }
                </p>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                  disabled={!selectedCategory || !coordinates}
                >
                  Review Job Posting
                </button>
              </div>
            </form>
          )}

          {/* Step 2: Confirmation */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Job Posting Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Service:</span>
                    <span className="font-medium">{selectedCategoryData?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Title:</span>
                    <span className="font-medium">{title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Location:</span>
                    <span className="font-medium text-right max-w-xs truncate">{address}</span>
                  </div>
                  {useAcceptPrice && acceptPrice && (
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-gray-600">Auto-Accept Price:</span>
                      <span className="font-bold text-orange-600">${acceptPrice}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-gray-600">Market Rate:</span>
                    <span className="font-medium text-blue-600">${priceGuidance?.p50}</span>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h4 className="font-medium text-blue-800 mb-1">Broadcast Schedule</h4>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li>• <strong>0-5 minutes:</strong> Top-rated providers nearby see your job</li>
                      <li>• <strong>5-15 minutes:</strong> Expanded to more providers in wider area</li>
                      <li>• <strong>15+ minutes:</strong> All qualified providers can bid</li>
                      {useAcceptPrice && <li>• <strong>Auto-hire:</strong> First bid ≤ ${acceptPrice} gets the job</li>}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  disabled={isLoading}
                >
                  Back
                </button>
                <button
                  onClick={confirmPosting}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                  disabled={isLoading}
                >
                  {isLoading ? 'Posting Job...' : 'Post Job & Start Bidding'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Success */}
          {step === 3 && createdJob && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Job Posted Successfully!</h3>
              <p className="text-gray-600 mb-6">
                Your job is now being broadcast to qualified providers. You'll receive notifications 
                as bids come in.
              </p>
              
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <div className="text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Job ID:</span>
                    <span className="font-mono text-xs">{createdJob.id.slice(-8)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className="text-orange-600 font-medium">{createdJob.status}</span>
                  </div>
                  {useAcceptPrice && acceptPrice && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Auto-Accept Price:</span>
                      <span className="text-green-600 font-bold">${acceptPrice}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    handleClose();
                    // Navigate to job tracking
                    window.location.href = `/jobs/${createdJob.id}`;
                  }}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                >
                  Track Bids
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}