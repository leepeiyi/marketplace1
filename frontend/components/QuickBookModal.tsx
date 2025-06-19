"use client";

import { useState, useEffect } from "react";
import { useUser } from "@/contexts/UserContext";
import { useWebSocket } from "@/contexts/WebSocketContext";

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

interface QuickBookModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CreatedJob {
  id: string;
  title: string;
  estimatedPrice: number;
  arrivalDeadline: string;
  status: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export function QuickBookModal({ isOpen, onClose }: QuickBookModalProps) {
  const { user } = useUser();
  const { addNotification } = useWebSocket();

  // Form state
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [priceGuidance, setPriceGuidance] = useState<PriceGuidance | null>(
    null
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [arrivalWindow, setArrivalWindow] = useState<number>(2);

  // Location state
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [coordinates, setCoordinates] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [step, setStep] = useState(1); // 1: Form, 2: Confirmation, 3: Waiting, 4: Success
  const [createdJob, setCreatedJob] = useState<CreatedJob | null>(null);
  const [acceptedProvider, setAcceptedProvider] = useState<string | null>(null);

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

  // Listen for job updates - FIXED EVENT HANDLING
  useEffect(() => {
    if (!isOpen || !createdJob) return;

    const handleJobAccepted = (event: any) => {
      const jobId = event.detail.jobId || event.detail.job?.id;
      const providerName = event.detail.providerName;

      console.log("Job accepted event received:", event.detail);
      console.log(
        "Comparing jobId:",
        jobId,
        "with createdJob.id:",
        createdJob?.id
      );

      if (!jobId || !createdJob?.id) return;

      const matchesJob = jobId === createdJob.id;

      if (matchesJob) {
        console.log("✅ Job match! Advancing to step 4...");
        setAcceptedProvider(providerName || "A provider");
        setStep(4);
        addNotification({
          id: Date.now().toString(),
          type: "success",
          title: "Provider Found!",
          message: `${providerName || "A provider"} accepted your job`,
          timestamp: new Date(),
        });
      }
    };

    // 👇 ADD THIS NEW FUNCTION:
    const handleJobUpdate = (event: any) => {
      console.log("Job update event received:", event.detail);

      const jobId = event.detail.jobId || event.detail.job?.id;
      const providerName = event.detail.providerName;
      const status = event.detail.status;
      const type = event.detail.type;

      console.log(
        "Comparing jobId:",
        jobId,
        "with createdJob.id:",
        createdJob?.id
      );

      const matchesJob = jobId === createdJob?.id;

      if (
        matchesJob &&
        (status === "ACCEPTED" ||
          status === "BOOKED" ||
          type === "job_accepted" || // ✅ fallback condition
          type === "job_taken")
      ) {
        console.log(
          "✅ Triggering success from job_update (type or status match)"
        );

        setAcceptedProvider(providerName || "A provider");

        setCreatedJob((prev) =>
          prev ? { ...prev, status: status || "ACCEPTED" } : prev
        ); // 🔁 update status in createdJob

        setStep(4);

        addNotification({
          id: Date.now().toString(),
          type: "success",
          title: "Provider Found!",
          message: `${providerName || "A provider"} accepted your job`,
          timestamp: new Date(),
        });
      }
    };

    // ✅ Add this listener
    window.addEventListener("job_update", handleJobUpdate);

    // existing listeners
    window.addEventListener("job_accepted", handleJobAccepted);
    window.addEventListener("job_taken", handleJobAccepted);

    return () => {
      window.removeEventListener("job_accepted", handleJobAccepted);
      window.removeEventListener("job_taken", handleJobAccepted);
      window.removeEventListener("job_update", handleJobUpdate); // ✅ cleanup
    };
  }, [createdJob, isOpen, addNotification]);

  useEffect(() => {
    if (acceptedProvider && step === 3) {
      console.log("🔥 Fallback: acceptedProvider detected. Forcing step 4.");
      setStep(4);
    }
  }, [acceptedProvider, step]);

  const loadCategories = async () => {
    setIsLoadingCategories(true);
    try {
      const response = await fetch(`${API_URL}/api/categories`, {
        headers: {
          "x-user-id": user?.id || "",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      } else {
        throw new Error("Failed to load categories");
      }
    } catch (error) {
      addNotification({
        id: Date.now().toString(),
        type: "error",
        title: "Error",
        message: "Failed to load categories",
        timestamp: new Date(),
      });
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const loadPriceGuidance = async (categoryId: string) => {
    setIsLoadingPrice(true);
    try {
      const response = await fetch(
        `${API_URL}/api/jobs/price-guidance/${categoryId}`,
        {
          headers: {
            "x-user-id": user?.id || "",
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setPriceGuidance(data);
      }
    } catch (error) {
      console.error("Error loading price guidance:", error);
    } finally {
      setIsLoadingPrice(false);
    }
  };

  const getCurrentLocation = () => {
    setIsGettingLocation(true);

    if (!navigator.geolocation) {
      addNotification({
        id: Date.now().toString(),
        type: "error",
        title: "Location Error",
        message: "Geolocation is not supported by this browser",
        timestamp: new Date(),
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
        console.error("Error getting location:", error);
        addNotification({
          id: Date.now().toString(),
          type: "error",
          title: "Location Error",
          message: "Could not get your current location",
          timestamp: new Date(),
        });
        setIsGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 600000, // 10 minutes
      }
    );
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      // In a real app, you'd use a geocoding service like Google Maps API
      // For demo purposes, we'll set a placeholder address
      setAddress(`Address near ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    } catch (error) {
      console.error("Reverse geocoding failed:", error);
    }
  };

  const validateForm = () => {
    if (!selectedCategory) return "Please select a service category";
    if (!title.trim()) return "Please enter a job title";
    if (!description.trim()) return "Please enter a description";
    if (!address.trim()) return "Please enter an address";
    if (!coordinates) return "Location coordinates are required";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      addNotification({
        id: Date.now().toString(),
        type: "error",
        title: "Validation Error",
        message: validationError,
        timestamp: new Date(),
      });
      return;
    }

    setStep(2); // Show confirmation
  };

  const confirmBooking = async () => {
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/jobs/quick-book`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user?.id || "",
        },
        body: JSON.stringify({
          categoryId: selectedCategory,
          title: title.trim(),
          description: description.trim(),
          latitude: coordinates!.lat,
          longitude: coordinates!.lng,
          address: address.trim(),
          arrivalWindow,
        }),
      });

      if (response.ok) {
        const job = await response.json();
        setCreatedJob(job);
        setStep(3); // Waiting for provider

        addNotification({
          id: Date.now().toString(),
          type: "success",
          title: "Job Posted!",
          message: "Searching for nearby providers...",
          timestamp: new Date(),
        });
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to create job");
      }
    } catch (error) {
      addNotification({
        id: Date.now().toString(),
        type: "error",
        title: "Error",
        message:
          error instanceof Error ? error.message : "Failed to create job",
        timestamp: new Date(),
      });
      setStep(1); // Go back to form
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedCategory("");
    setPriceGuidance(null);
    setTitle("");
    setDescription("");
    setAddress("");
    setCoordinates(null);
    setArrivalWindow(2);
    setStep(1);
    setCreatedJob(null);
    setAcceptedProvider(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const selectedCategoryData = categories.find(
    (c) => c.id === selectedCategory
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">
            {step === 1
              ? "Quick Book Service"
              : step === 2
              ? "Confirm Booking"
              : step === 3
              ? "Finding Provider..."
              : "Booking Confirmed!"}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={isLoading}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 1: Form */}
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-3 flex items-center">
                    <span className="mr-2">💡</span>
                    Price Guidance for {selectedCategoryData?.name}
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
                          <div className="text-xs text-gray-600 mb-1">
                            Budget
                          </div>
                          <div className="text-lg font-bold text-green-600">
                            ${priceGuidance.p10}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-gray-600 mb-1">
                            Typical
                          </div>
                          <div className="text-lg font-bold text-blue-600">
                            ${priceGuidance.p50}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-gray-600 mb-1">
                            Premium
                          </div>
                          <div className="text-lg font-bold text-purple-600">
                            ${priceGuidance.p90}
                          </div>
                        </div>
                      </div>
                      <div className="text-sm text-gray-600">
                        <strong>Estimated cost: ${priceGuidance.p50}</strong>
                        {priceGuidance.dataPoints > 0 &&
                          ` (based on ${priceGuidance.dataPoints} completed jobs)`}
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
                  placeholder="e.g., AC not cooling properly"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={getCurrentLocation}
                    disabled={isGettingLocation}
                    className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                  >
                    {isGettingLocation ? (
                      <svg
                        className="animate-spin h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    ) : (
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                {coordinates && (
                  <p className="text-xs text-green-600 mt-1">
                    ✓ Location coordinates obtained
                  </p>
                )}
              </div>

              {/* Arrival Window */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  When do you need this service?
                </label>
                <select
                  value={arrivalWindow}
                  onChange={(e) => setArrivalWindow(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={1}>🚨 ASAP (within 1 hour)</option>
                  <option value={2}>⚡ Urgent (within 2 hours)</option>
                  <option value={3}>📅 Soon (within 3 hours)</option>
                  <option value={4}>⏰ Today (within 4 hours)</option>
                  <option value={6}>📍 Flexible (within 6 hours)</option>
                  <option value={8}>🗓️ No rush (within 8 hours)</option>
                </select>
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
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  disabled={!selectedCategory || !coordinates}
                >
                  Review Booking
                </button>
              </div>
            </form>
          )}

          {/* Step 2: Confirmation */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3">
                  Booking Summary
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Service:</span>
                    <span className="font-medium">
                      {selectedCategoryData?.name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Job:</span>
                    <span className="font-medium">{title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Location:</span>
                    <span className="font-medium text-right max-w-xs truncate">
                      {address}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Arrival:</span>
                    <span className="font-medium">
                      Within {arrivalWindow} hour{arrivalWindow > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-gray-600">Estimated Price:</span>
                    <span className="font-bold text-blue-600">
                      ${priceGuidance?.p50}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start">
                  <svg
                    className="w-5 h-5 text-yellow-600 mt-0.5 mr-2"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div>
                    <h4 className="font-medium text-yellow-800 mb-1">
                      Important Notes
                    </h4>
                    <ul className="text-sm text-yellow-700 space-y-1">
                      <li>
                        • Payment will be held securely until job completion
                      </li>
                      <li>• You'll be notified when a provider accepts</li>
                      <li>• Actual price may vary based on job complexity</li>
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
                  onClick={confirmBooking}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  disabled={isLoading}
                >
                  {isLoading ? "Creating Job..." : "Confirm & Book"}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Waiting for Provider */}
          {step === 3 && createdJob && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="animate-spin w-8 h-8 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Searching for Providers...
              </h3>
              <p className="text-gray-600 mb-4">
                We're notifying qualified service providers within 5km of your
                location.
              </p>

              <div className="bg-blue-50 rounded-lg p-4 mb-6">
                <div className="text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Job ID:</span>
                    <span className="font-mono text-xs">
                      {createdJob.id.slice(-8)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Expected Response:</span>
                    <span className="font-medium">Within 5 minutes</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className="text-blue-600 font-medium">
                      {createdJob.status}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center text-sm text-gray-600">
                  <svg
                    className="w-4 h-4 text-green-500 mr-2"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Job posted successfully
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                  Notifying nearby providers
                </div>
                <div className="flex items-center text-sm text-gray-400">
                  <div className="w-4 h-4 border-2 border-gray-300 rounded-full mr-2"></div>
                  Waiting for provider response
                </div>
              </div>

              <button
                onClick={handleClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Close & Track in Dashboard
              </button>
            </div>
          )}

          {/* Step 4: Success */}
          {step === 4 && createdJob && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Provider Found!
              </h3>
              <p className="text-gray-600 mb-6">
                {acceptedProvider
                  ? `${acceptedProvider} has`
                  : "A qualified service provider has"}{" "}
                accepted your job and is on their way.
              </p>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <h4 className="font-medium text-green-800 mb-2">Next Steps:</h4>
                <ul className="text-sm text-green-700 space-y-1 text-left">
                  <li>• Check your phone for the provider's contact details</li>
                  <li>• Track progress in your customer dashboard</li>
                  <li>• Payment will be processed after job completion</li>
                  {acceptedProvider && (
                    <li>
                      • Provider: <strong>{acceptedProvider}</strong>
                    </li>
                  )}
                </ul>
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
                    // Navigate to job tracking (implement based on your routing)
                    window.location.href = `/jobs/${createdJob.id}`;
                  }}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Track Job
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
