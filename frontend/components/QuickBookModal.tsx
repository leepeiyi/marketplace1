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
}

interface QuickBookModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function QuickBookModal({ isOpen, onClose }: QuickBookModalProps) {
  const { user } = useUser();
  const { addNotification } = useWebSocket();
  
  // Form state
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [priceGuidance, setPriceGuidance] = useState<PriceGuidance | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [arrivalWindow, setArrivalWindow] = useState<number>(2);
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [step, setStep] = useState(1); // 1: Form, 2: Confirmation, 3: Success

  // Load categories on mount
  useEffect(() => {
    if (isOpen) {
      loadCategories();
    }
  }, [isOpen]);

  // Load price guidance when category changes
  useEffect(() => {
    if (selectedCategory) {
      loadPriceGuidance(selectedCategory);
    }
  }, [selectedCategory]);

  const loadCategories = async () => {
    setIsLoadingCategories(true);
    try {
      const response = await fetch(`${API_URL}/api/categories`, {
        headers: {
          'x-user-id': user?.id || '',
          'x-user-type': 'customer'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      } else {
        addNotification({
          id: Date.now().toString(),
          type: 'error',
          title: 'Error',
          message: 'Failed to load categories',
          timestamp: new Date()
        });
      }
    } catch (error) {
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Error',
        message: 'Network error loading categories',
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
          'x-user-type': 'customer'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setPriceGuidance(data);
      }
    } catch (error) {
      console.error('Error loading price guidance:', error);
    } finally {
      setIsLoadingPrice(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedCategory || !title || !description || !address) {
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Validation Error',
        message: 'Please fill in all required fields',
        timestamp: new Date()
      });
      return;
    }

    setIsLoading(true);
    
    try {
      // Mock coordinates for Singapore (in real app, you'd geocode the address)
      const latitude = 1.3521 + (Math.random() - 0.5) * 0.1;
      const longitude = 103.8198 + (Math.random() - 0.5) * 0.1;
      
      const response = await fetch(`${API_URL}/api/jobs/quick-book`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.id || '',
          'x-user-type': 'customer'
        },
        body: JSON.stringify({
          categoryId: selectedCategory,
          title,
          description,
          latitude,
          longitude,
          address,
          arrivalWindow
        })
      });

      if (response.ok) {
        const job = await response.json();
        setStep(3);
        
        addNotification({
          id: Date.now().toString(),
          type: 'success',
          title: 'Job Posted!',
          message: 'Your job has been broadcasted to nearby providers',
          timestamp: new Date()
        });
      } else {
        const error = await response.json();
        addNotification({
          id: Date.now().toString(),
          type: 'error',
          title: 'Error',
          message: error.error || 'Failed to create job',
          timestamp: new Date()
        });
      }
    } catch (error) {
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Error',
        message: 'Network error creating job',
        timestamp: new Date()
      });
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
    setArrivalWindow(2);
    setStep(1);
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
          <h2 className="text-xl font-bold text-gray-900">Quick Book Service</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          
          {step === 1 && (
            <form onSubmit={handleSubmit} className="space-y-6">
              
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
                    className="input"
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

              {/* Smart Price Display */}
              {selectedCategory && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-2">
                    💡 Price Guidance for {selectedCategoryData?.name}
                  </h3>
                  {isLoadingPrice ? (
                    <div className="animate-pulse">
                      <div className="bg-gray-200 h-4 rounded mb-2"></div>
                      <div className="bg-gray-200 h-4 rounded w-3/4"></div>
                    </div>
                  ) : priceGuidance ? (
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div className="text-center">
                        <div className="text-gray-600">Budget</div>
                        <div className="font-bold text-green-600">${priceGuidance.p10}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-600">Typical</div>
                        <div className="font-bold text-blue-600">${priceGuidance.p50}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-600">Premium</div>
                        <div className="font-bold text-purple-600">${priceGuidance.p90}</div>
                      </div>
                    </div>
                  ) : null}
                  <p className="text-xs text-gray-600 mt-2">
                    Estimated price: <strong>${priceGuidance?.p50}</strong> (based on historical data)
                  </p>
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
                  placeholder="e.g., AC not cooling properly"
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description *
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the issue and any specific requirements..."
                  rows={3}
                  className="input"
                  required
                />
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Address *
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g., 123 Orchard Road, Singapore 238867"
                  className="input"
                  required
                />
              </div>

              {/* Arrival Window */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Preferred Arrival Window
                </label>
                <select
                  value={arrivalWindow}
                  onChange={(e) => setArrivalWindow(Number(e.target.value))}
                  className="input"
                >
                  <option value={1}>Within 1 hour</option>
                  <option value={2}>Within 2 hours</option>
                  <option value={3}>Within 3 hours</option>
                  <option value={4}>Within 4 hours</option>
                  <option value={6}>Within 6 hours</option>
                  <option value={8}>Within 8 hours</option>
                </select>
              </div>

              {/* Submit Button */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="btn-secondary flex-1"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1"
                  disabled={isLoading || !selectedCategory}
                >
                  {isLoading ? 'Creating Job...' : 'Book Now'}
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Job Posted Successfully!</h3>
              <p className="text-gray-600 mb-6">
                Your job has been broadcasted to available providers within 5km. 
                You'll receive notifications when providers respond.
              </p>
              <button
                onClick={handleClose}
                className="btn-primary"
              >
                Done
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}