"use client";

import { useState, useEffect } from "react";
import { useUser } from "@/contexts/UserContext";
import { useWebSocket } from "@/contexts/WebSocketContext";
import { Clock, Star, MapPin, DollarSign, Send } from "lucide-react";

interface QuickBookJob {
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

interface PostQuoteJob {
  id: string;
  title: string;
  description: string;
  category: {
    id: string;
    name: string;
    icon: string;
  };
  address: string;
  customer: {
    name: string;
  };
  estimatedPrice: number;
  acceptPrice?: number;
  distance: number;
  createdAt: string;
  biddingEndsAt?: string;
  bidsCount?: number;
  hasUserBid?: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

export function ProviderDashboard() {
  const { user, logout } = useUser();
  const { addNotification } = useWebSocket();

  const [isAvailable, setIsAvailable] = useState(true);
  const [quickBookJobs, setQuickBookJobs] = useState<QuickBookJob[]>([]);
  const [postQuoteJobs, setPostQuoteJobs] = useState<PostQuoteJob[]>([]);
  const [myJobs, setMyJobs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"quick" | "quote">("quick");
  const [isLoading, setIsLoading] = useState(false);

  // Bidding modal state
  const [showBidModal, setShowBidModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState<PostQuoteJob | null>(null);
  const [bidPrice, setBidPrice] = useState("");
  const [bidNote, setBidNote] = useState("");
  const [bidEta, setBidEta] = useState(60);
  const [isSubmittingBid, setIsSubmittingBid] = useState(false);

  // Listen for WebSocket job notifications
  useEffect(() => {
    const handleNewJob = (event: any) => {
      const jobData = event.detail;
      console.log("📋 New job received:", jobData);

      if (jobData.type === "QUICK_BOOK") {
        const newJob: QuickBookJob = {
          id: jobData.id,
          title: jobData.title,
          category: jobData.category,
          address: jobData.address,
          customerName: jobData.customerName,
          estimatedPrice: jobData.estimatedPrice,
          distance: jobData.distance,
          quickBookDeadline: jobData.quickBookDeadline,
          receivedAt: Date.now(),
        };

        setQuickBookJobs((prev) => [newJob, ...prev]);
      } else if (jobData.type === "POST_QUOTE") {
        const newJob: PostQuoteJob = {
          id: jobData.id,
          title: jobData.title,
          description: jobData.description,
          category: jobData.category,
          address: jobData.address,
          customer: jobData.customer,
          estimatedPrice: jobData.estimatedPrice,
          acceptPrice: jobData.acceptPrice,
          distance: jobData.distance,
          createdAt: jobData.createdAt,
          biddingEndsAt: jobData.biddingEndsAt,
          bidsCount: 0,
          hasUserBid: false,
        };

        setPostQuoteJobs((prev) => [newJob, ...prev]);
      }

      // Show notification
      addNotification({
        id: Date.now().toString(),
        type: "info",
        title: "New Job Available!",
        message: `${jobData.title} - $${jobData.estimatedPrice} (${jobData.distance}km away)`,
        timestamp: new Date(),
      });
    };

    const handleJobTaken = (event: any) => {
      const { jobId } = event.detail;
      setQuickBookJobs((prev) => prev.filter((job) => job.id !== jobId));
      setPostQuoteJobs((prev) => prev.filter((job) => job.id !== jobId));
    };

    // Listen for custom events from WebSocketContext
    window.addEventListener("new_job_available", handleNewJob);
    window.addEventListener("job_taken", handleJobTaken);

    return () => {
      window.removeEventListener("new_job_available", handleNewJob);
      window.removeEventListener("job_taken", handleJobTaken);
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
          "x-user-id": user?.id || "",
        },
      });

      if (response.ok) {
        const jobs = await response.json();

        // Separate quick book and post quote jobs
        const quickJobs: QuickBookJob[] = [];
        const quoteJobs: PostQuoteJob[] = [];

        for (const job of jobs) {
          if (job.type === "QUICK_BOOK") {
            quickJobs.push({
              id: job.id,
              title: job.title,
              category: job.category?.name || 'Unknown Category',
              address: job.address,
              customerName: job.customer?.name || 'Unknown Customer',
              estimatedPrice: job.estimatedPrice,
              distance: job.distance,
              quickBookDeadline: job.quickBookDeadline,
              receivedAt: Date.now(),
            });
          } else if (job.type === "POST_QUOTE") {
            // Check if user already bid on this job
            let hasUserBid = false;
            let bidsCount = 0;

            try {
              const bidsResponse = await fetch(
                `${API_URL}/api/bids/job/${job.id}`,
                {
                  headers: {
                    "x-user-id": user?.id || "",
                  },
                }
              );

              if (bidsResponse.ok) {
                const bids = await bidsResponse.json();
                bidsCount = bids.length;
                hasUserBid = bids.some(
                  (bid: any) => bid.providerId === user?.id
                );
              }
            } catch (error) {
              console.error("Error checking bids:", error);
            }

            quoteJobs.push({
              id: job.id,
              title: job.title,
              description: job.description,
              category: job.category || { id: '', name: 'Unknown Category', icon: '📋' },
              address: job.address,
              customer: job.customer || { name: 'Unknown Customer' },
              estimatedPrice: job.estimatedPrice,
              acceptPrice: job.acceptPrice,
              distance: job.distance,
              createdAt: job.createdAt,
              biddingEndsAt: job.biddingEndsAt,
              bidsCount,
              hasUserBid,
            });
          }
        }

        setQuickBookJobs(quickJobs);
        setPostQuoteJobs(quoteJobs);
      }
    } catch (error) {
      console.error("Error loading available jobs:", error);
    }
  };

  const loadMyJobs = async () => {
    try {
      const response = await fetch(`${API_URL}/api/jobs/provider`, {
        headers: {
          "x-user-id": user?.id || "",
        },
      });

      if (response.ok) {
        const jobs = await response.json();
        setMyJobs(jobs);
      }
    } catch (error) {
      console.error("Error loading my jobs:", error);
    }
  };

  const acceptQuickBookJob = async (jobId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/jobs/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user?.id || "",
        },
        body: JSON.stringify({ jobId }),
      });

      if (response.ok) {
        const result = await response.json();

        // Remove from available jobs
        setQuickBookJobs((prev) => prev.filter((job) => job.id !== jobId));

        // Add to my jobs
        setMyJobs((prev) => [result.job, ...prev]);

        addNotification({
          id: Date.now().toString(),
          type: "success",
          title: "Job Accepted!",
          message: "You have successfully accepted the job",
          timestamp: new Date(),
        });
      } else if (response.status === 409) {
        // Job already taken
        setQuickBookJobs((prev) => prev.filter((job) => job.id !== jobId));

        addNotification({
          id: Date.now().toString(),
          type: "warning",
          title: "Job Already Taken",
          message: "Another provider accepted this job first",
          timestamp: new Date(),
        });
      } else {
        throw new Error("Failed to accept job");
      }
    } catch (error) {
      addNotification({
        id: Date.now().toString(),
        type: "error",
        title: "Error",
        message: "Failed to accept job",
        timestamp: new Date(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const declineQuickBookJob = (jobId: string) => {
    setQuickBookJobs((prev) => prev.filter((job) => job.id !== jobId));

    addNotification({
      id: Date.now().toString(),
      type: "info",
      title: "Job Declined",
      message: "Job removed from your list",
      timestamp: new Date(),
    });
  };

  const openBidModal = (job: PostQuoteJob) => {
    setSelectedJob(job);
    setBidPrice(job.estimatedPrice ? job.estimatedPrice.toString() : "");
    setBidNote(
      `I can help with ${job.title}. I have experience with ${job.category?.name || 'this type of'} services and can complete this work efficiently.`
    );
    setBidEta(60);
    setShowBidModal(true);
  };

  const submitBid = async () => {
    if (!selectedJob) return;

    setIsSubmittingBid(true);
    try {
      const response = await fetch(`${API_URL}/api/bids`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user?.id || "",
        },
        body: JSON.stringify({
          jobId: selectedJob.id,
          price: parseFloat(bidPrice),
          note: bidNote,
          estimatedEta: bidEta,
        }),
      });

      if (response.ok) {
        const result = await response.json();

        // Update the job to show user has bid
        setPostQuoteJobs((prev) =>
          prev.map((job) =>
            job.id === selectedJob.id
              ? {
                  ...job,
                  hasUserBid: true,
                  bidsCount: (job.bidsCount || 0) + 1,
                }
              : job
          )
        );

        addNotification({
          id: Date.now().toString(),
          type: "success",
          title: "Bid Submitted!",
          message: `Your bid of $${bidPrice} has been submitted`,
          timestamp: new Date(),
        });

        setShowBidModal(false);

        // Check if auto-hired
        if (result.autoHired) {
          setPostQuoteJobs((prev) =>
            prev.filter((job) => job.id !== selectedJob.id)
          );
          setMyJobs((prev) => [result, ...prev]);

          addNotification({
            id: Date.now().toString(),
            type: "success",
            title: "Auto-Hired!",
            message: "Your bid was automatically accepted!",
            timestamp: new Date(),
          });
        }
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to submit bid");
      }
    } catch (error) {
      addNotification({
        id: Date.now().toString(),
        type: "error",
        title: "Error",
        message:
          error instanceof Error ? error.message : "Failed to submit bid",
        timestamp: new Date(),
      });
    } finally {
      setIsSubmittingBid(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60)
    );

    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="text-xl font-bold text-blue-600">Quickly</div>
              <div className="ml-4 text-sm text-gray-500">
                Provider Dashboard
              </div>
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
                <div
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isAvailable ? "bg-blue-600" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isAvailable ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </div>
                <span
                  className={`ml-3 text-sm font-medium ${
                    isAvailable ? "text-green-600" : "text-gray-500"
                  }`}
                >
                  {isAvailable ? "Available" : "Unavailable"}
                </span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Available Jobs */}
            <div className="lg:col-span-2">
              <div className="bg-white shadow rounded-lg">
                {/* Tab Navigation */}
                <div className="border-b border-gray-200">
                  <nav className="flex space-x-8 px-6" aria-label="Tabs">
                    <button
                      onClick={() => setActiveTab("quick")}
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${
                        activeTab === "quick"
                          ? "border-blue-500 text-blue-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      Quick Book ({quickBookJobs.length})
                    </button>
                    <button
                      onClick={() => setActiveTab("quote")}
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${
                        activeTab === "quote"
                          ? "border-orange-500 text-orange-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      Post & Quote ({postQuoteJobs.length})
                    </button>
                  </nav>
                </div>

                <div className="p-6">
                  {!isAvailable ? (
                    <div className="text-gray-500 text-center py-8">
                      Set yourself as available to see jobs
                    </div>
                  ) : activeTab === "quick" ? (
                    quickBookJobs.length === 0 ? (
                      <div className="text-gray-500 text-center py-8">
                        No quick book jobs available
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {quickBookJobs.map((job) => (
                          <QuickBookJobCard
                            key={job.id}
                            job={job}
                            onAccept={acceptQuickBookJob}
                            onDecline={declineQuickBookJob}
                            isLoading={isLoading}
                          />
                        ))}
                      </div>
                    )
                  ) : postQuoteJobs.length === 0 ? (
                    <div className="text-gray-500 text-center py-8">
                      No bidding opportunities available
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {postQuoteJobs.map((job) => (
                        <PostQuoteJobCard
                          key={job.id}
                          job={job}
                          onBid={openBidModal}
                          formatTimeAgo={formatTimeAgo}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* My Jobs */}
            <div className="lg:col-span-1">
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
                            <h4 className="font-medium text-gray-900">
                              {job.title}
                            </h4>
                            <p className="text-sm text-gray-600">
                              {job.category?.name || 'Unknown Category'}
                            </p>
                            <p className="text-sm text-gray-500">
                              {job.address}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-green-600">
                              ${job.estimatedPrice}
                            </div>
                            <div
                              className={`text-sm px-2 py-1 rounded-full ${
                                job.status === "BOOKED"
                                  ? "bg-blue-100 text-blue-800"
                                  : job.status === "IN_PROGRESS"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : job.status === "COMPLETED"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-gray-100 text-gray-800"
                              }`}
                            >
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
        </div>
      </main>

      {/* Bid Submission Modal */}
      {showBidModal && selectedJob && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  Submit Your Bid
                </h3>
                <button
                  onClick={() => setShowBidModal(false)}
                  className="text-gray-400 hover:text-gray-600"
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

              {/* Job Details */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{selectedJob.category?.icon || '📋'}</span>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">
                      {selectedJob.title}
                    </h4>
                    <p className="text-sm text-gray-600">
                      {selectedJob.category?.name || 'Unknown Category'}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {selectedJob.address}
                    </p>
                    <p className="text-sm text-gray-700 mt-2">
                      {selectedJob.description}
                    </p>

                    <div className="flex items-center gap-4 mt-3 text-sm">
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-4 h-4" />
                        Market Est: ${selectedJob.estimatedPrice}
                      </span>
                      {selectedJob.acceptPrice && (
                        <span className="flex items-center gap-1 text-green-600 font-medium">
                          <Star className="w-4 h-4 fill-current" />
                          Auto-Accept: ${selectedJob.acceptPrice}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {selectedJob.distance}km away
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bid Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Your Bid Price *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                      $
                    </span>
                    <input
                      type="number"
                      value={bidPrice}
                      onChange={(e) => setBidPrice(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0"
                      min="1"
                      required
                    />
                  </div>
                  {selectedJob.acceptPrice &&
                    parseFloat(bidPrice) <= selectedJob.acceptPrice && (
                      <p className="text-sm text-green-600 mt-1">
                        ✅ This bid qualifies for auto-acceptance!
                      </p>
                    )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Estimated Time to Complete (minutes)
                  </label>
                  <select
                    value={bidEta}
                    onChange={(e) => setBidEta(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value={30}>30 minutes</option>
                    <option value={45}>45 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={90}>1.5 hours</option>
                    <option value={120}>2 hours</option>
                    <option value={180}>3 hours</option>
                    <option value={240}>4 hours</option>
                    <option value={360}>6 hours</option>
                    <option value={480}>8 hours</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Your Message to Customer *
                  </label>
                  <textarea
                    value={bidNote}
                    onChange={(e) => setBidNote(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Describe your experience, approach, and why you're the best choice for this job..."
                    required
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowBidModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  disabled={isSubmittingBid}
                >
                  Cancel
                </button>
                <button
                  onClick={submitBid}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  disabled={isSubmittingBid || !bidPrice || !bidNote.trim()}
                >
                  {isSubmittingBid ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Submit Bid
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Quick Book Job Card Component with Countdown Timer
function QuickBookJobCard({
  job,
  onAccept,
  onDecline,
  isLoading,
}: {
  job: QuickBookJob;
  onAccept: (jobId: string) => void;
  onDecline: (jobId: string) => void;
  isLoading: boolean;
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
      setTimeLeft((prev) => {
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
        <div
          className={`text-sm font-bold px-2 py-1 rounded-full ${
            timeLeft <= 10
              ? "bg-red-100 text-red-800"
              : "bg-blue-100 text-blue-800"
          }`}
        >
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
          <div className="text-lg font-bold text-green-600">
            ${job.estimatedPrice}
          </div>
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
          {isLoading ? "Accepting..." : "Accept Job"}
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

// Post Quote Job Card Component
function PostQuoteJobCard({
  job,
  onBid,
  formatTimeAgo,
}: {
  job: PostQuoteJob;
  onBid: (job: PostQuoteJob) => void;
  formatTimeAgo: (dateString: string) => string;
}) {
  return (
    <div className="border rounded-lg p-4 bg-orange-50 border-orange-200">
      {/* Job Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-start gap-3">
          <span className="text-2xl">{job.category?.icon || '📋'}</span>
          <div>
            <h4 className="font-medium text-gray-900">{job.title}</h4>
            <p className="text-sm text-gray-600">{job.category?.name || 'Unknown Category'}</p>
            <p className="text-sm text-gray-500">{job.address}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-green-600">
            ${job.estimatedPrice}
          </div>
          <div className="text-sm text-gray-500">{job.distance}km away</div>
        </div>
      </div>

      {/* Job Description */}
      <div className="mb-3">
        <p className="text-sm text-gray-700 bg-white rounded p-2">
          {job.description}
        </p>
      </div>

      {/* Job Info */}
      <div className="flex items-center gap-4 text-xs text-gray-600 mb-3">
        <span>Customer: {job.customer?.name || 'Unknown Customer'}</span>
        <span>Posted: {formatTimeAgo(job.createdAt)}</span>
        {job.bidsCount !== undefined && (
          <span>
            {job.bidsCount} bid{job.bidsCount !== 1 ? "s" : ""}
          </span>
        )}
        {job.acceptPrice && (
          <span className="text-green-600 font-medium">
            Auto-Accept: ${job.acceptPrice}
          </span>
        )}
      </div>

      {/* Action Button */}
      <div>
        {job.hasUserBid ? (
          <button
            disabled
            className="w-full bg-gray-300 text-gray-500 px-4 py-2 rounded-md cursor-not-allowed font-medium"
          >
            ✓ Bid Submitted
          </button>
        ) : (
          <button
            onClick={() => onBid(job)}
            className="w-full bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700 font-medium"
          >
            Submit Bid
          </button>
        )}
      </div>
    </div>
  );
}