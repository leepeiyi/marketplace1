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
  bidId?: string;
  estimatedPrice: number;
  acceptPrice?: number;
  distance: number;
  createdAt: string;
  biddingEndsAt?: string;
  bidsCount?: number;
  hasUserBid?: boolean;
  boostedAt?: string | null;
  status?: string;
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
  const [demoMode, setDemoMode] = useState(false);
  // 🚨 NEW: Track if provider has active job
  const [hasActiveJob, setHasActiveJob] = useState(false);

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

        // ✅ Prevent duplicate job insert
        setQuickBookJobs((prev) => {
          const alreadyExists = prev.some((job) => job.id === newJob.id);
          return alreadyExists ? prev : [newJob, ...prev];
        });
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

        // ✅ Prevent duplicate quote job
        setPostQuoteJobs((prev) => {
          const alreadyExists = prev.some((job) => job.id === newJob.id);
          return alreadyExists ? prev : [newJob, ...prev];
        });
      }

      // ✅ Show notification
      addNotification({
        id: Date.now().toString(),
        type: "info",
        title: "New Job Available!",
        message: `${jobData.title} - $${jobData.estimatedPrice} (${jobData.distance}km away)`,
        timestamp: new Date(),
      });

      loadAvailableJobs();
    };

    const handleJobUpdate = (event: any) => {
      const jobData = event.detail;
      console.log("🔄 Job updated:", jobData);

      // Update bid counts for post quote jobs
      if (jobData.type === "BID_SUBMITTED") {
        setPostQuoteJobs((prev) =>
          prev.map((job) =>
            job.id === jobData.jobId
              ? { ...job, bidsCount: jobData.bidsCount }
              : job
          )
        );
      }
    };
    const handleJobTaken = (event: any) => {
      const { jobId, jobTitle, providerName } = event.detail;
      console.log(event);
      console.log(`⚠️ Job taken: ${jobId} by ${providerName}`);

      // ✅ Remove job from both views
      setQuickBookJobs((prev) => prev.filter((job) => job.id !== jobId));
      setPostQuoteJobs((prev) => prev.filter((job) => job.id !== jobId));

      // ✅ Show notification to inform other providers
      addNotification({
        id: Date.now().toString(),
        type: "warning",
        title: "Job Taken",
        message: `"${jobTitle}" was accepted by another provider`,
        timestamp: new Date(),
      });
    };

    // Listen for custom events from WebSocketContext
    window.addEventListener("new_job_available", handleNewJob);
    window.addEventListener("job_taken", handleJobTaken);
    window.addEventListener("job_update", handleJobUpdate);

    return () => {
      window.removeEventListener("new_job_available", handleNewJob);
      window.removeEventListener("job_taken", handleJobTaken);
      window.removeEventListener("job_update", handleJobUpdate);
    };
  }, [addNotification]);

  // Load existing jobs on mount AND when availability changes
  useEffect(() => {
    if (user) {
      loadAvailableJobs();
      loadMyJobs();
    }
  }, [user, isAvailable]); // Remove isAvailable dependency for loadAvailableJobs

  // 🚨 NEW: Check if provider has active jobs (only BOOKED and IN_PROGRESS)
  useEffect(() => {
    const activeJobs = myJobs.filter(job => 
      job.status === "BOOKED" || job.status === "IN_PROGRESS"
    );
    setHasActiveJob(activeJobs.length > 0);
  }, [myJobs]);

  const loadAvailableJobs = async () => {
    try {
      // Only load available jobs if provider is available
      if (!isAvailable) {
        setQuickBookJobs([]);
        setPostQuoteJobs([]);
        return;
      }

      const response = await fetch(`${API_URL}/api/jobs/available`, {
        headers: { "x-user-id": user?.id || "" },
      });

      if (response.ok) {
        const { available, alreadyBid } = await response.json();

        const quickJobs: QuickBookJob[] = [];
        const quoteJobs: PostQuoteJob[] = [];

        const allJobs = [...available, ...alreadyBid];

        for (const job of allJobs) {
          if (job.type === "QUICK_BOOK") {
            quickJobs.push({
              id: job.id,
              title: job.title,
              category: job.category?.name || "Unknown Category",
              address: job.address,
              customerName: job.customer?.name || "Unknown Customer",
              estimatedPrice: job.estimatedPrice,
              distance: job.distance,
              quickBookDeadline: job.quickBookDeadline,
              receivedAt: Date.now(),
            });
          } else if (job.type === "POST_QUOTE") {
            quoteJobs.push({
              id: job.id,
              title: job.title,
              description: job.description,
              category: job.category || {
                id: "",
                name: "Unknown Category",
                icon: "📋",
              },
              address: job.address,
              customer: job.customer || { name: "Unknown Customer" },
              estimatedPrice: job.estimatedPrice,
              acceptPrice: job.acceptPrice,
              distance: job.distance,
              createdAt: job.createdAt,
              biddingEndsAt: job.biddingEndsAt,
              bidsCount: job.bidsCount || 0,
              hasUserBid: job.hasUserBid || false,
              bidId: job.bidId || null,
              boostedAt: job.boostedAt || null,
              status: job.status || "PENDING",
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
        console.log("📋 Loaded provider jobs:", jobs); // Debug log
        console.log("📊 Job statuses:", jobs.map((job: any) => ({ id: job.id, status: job.status, title: job.title })));
        setMyJobs(jobs);
      } else {
        console.error("❌ Failed to load jobs:", response.status);
      }
    } catch (error) {
      console.error("Error loading my jobs:", error);
    }
  };

  // 🚨 NEW: Complete job function
  const completeJob = async (jobId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/jobs/${jobId}/complete`, {
        method: "POST",
        headers: {
          "x-user-id": user?.id || "",
        },
      });

      if (response.ok) {
        addNotification({
          id: Date.now().toString(),
          type: "success",
          title: "Job Completed",
          message: "Job completed successfully! You are now available for new jobs.",
          timestamp: new Date(),
        });

        loadMyJobs(); // Refresh job list
        loadAvailableJobs(); // Refresh available jobs since provider is now available
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to complete job");
      }
    } catch (err) {
      console.error("❌ Complete error:", err);
      addNotification({
        id: Date.now().toString(),
        type: "error",
        title: "Complete Failed",
        message: (err as Error).message,
        timestamp: new Date(),
      });
    }
  };

  const cancelJob = async (jobId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/jobs/${jobId}/cancel`, {
        method: "POST",
        headers: {
          "x-user-id": user?.id || "",
        },
      });

      if (response.ok) {
        addNotification({
          id: Date.now().toString(),
          type: "warning",
          title: "Job Cancelled",
          message: "You cancelled this job. You are now available for new jobs.",
          timestamp: new Date(),
        });

        loadMyJobs(); // Refresh job list
        loadAvailableJobs(); // Refresh available jobs since provider is now available
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to cancel job");
      }
    } catch (err) {
      console.error("❌ Cancel error:", err);
      addNotification({
        id: Date.now().toString(),
        type: "error",
        title: "Cancel Failed",
        message: (err as Error).message,
        timestamp: new Date(),
      });
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

        // Note: The WebSocket should handle notifying other providers
        // via the "job_taken" event, so we don't need to manually emit it here
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
      } else if (response.status === 400) {
        // 🚨 NEW: Provider already has active job or other validation error
        const error = await response.json();
        addNotification({
          id: Date.now().toString(),
          type: "warning", 
          title: "Cannot Accept Job",
          message: error.error || "You already have an active job. Complete your current job first.",
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
      `I can help with ${job.title}. I have experience with ${
        job.category?.name || "this type of"
      } services and can complete this work efficiently.`
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

        addNotification({
          id: Date.now().toString(),
          type: "success",
          title: "Bid Submitted!",
          message: `Your bid of $${bidPrice} has been submitted`,
          timestamp: new Date(),
        });

        setShowBidModal(false);

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
        const statusMsg = `HTTP ${response.status}: ${
          error.error || "Failed to submit bid"
        }`;

        throw new Error(statusMsg);
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
            {/* 🚨 NEW: Status indicator in header */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                {hasActiveJob && (
                  <div className="flex items-center space-x-1 bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs">
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                    <span>Active Job</span>
                  </div>
                )}
                <span className="text-gray-700">Hello, {user?.name}</span>
              </div>
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
          {/* 🚨 UPDATED: Availability Toggle */}
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  Availability Status
                </h3>
                <p className="text-gray-600">
                  {hasActiveJob 
                    ? "Complete your current job to become available for new ones"
                    : "Toggle your availability to receive job notifications"
                  }
                </p>
                {hasActiveJob && (
                  <p className="text-sm text-orange-600 mt-1">
                    ⚠️ You have an active job. Complete it before accepting new jobs.
                  </p>
                )}
              </div>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAvailable && !hasActiveJob}
                  onChange={(e) => {
                    if (hasActiveJob) {
                      addNotification({
                        id: Date.now().toString(),
                        type: "warning",
                        title: "Cannot Change Availability",
                        message: "Complete your active job first",
                        timestamp: new Date(),
                      });
                      return;
                    }
                    setIsAvailable(e.target.checked);
                  }}
                  className="sr-only"
                  disabled={hasActiveJob}
                />
                <div
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isAvailable && !hasActiveJob ? "bg-blue-600" : "bg-gray-200"
                  } ${hasActiveJob ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isAvailable && !hasActiveJob ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </div>
                <span
                  className={`ml-3 text-sm font-medium ${
                    hasActiveJob 
                      ? "text-orange-600" 
                      : isAvailable 
                        ? "text-green-600" 
                        : "text-gray-500"
                  }`}
                >
                  {hasActiveJob 
                    ? "Busy" 
                    : isAvailable 
                      ? "Available" 
                      : "Unavailable"
                  }
                </span>
              </label>
            </div>
          </div>

          {/* 🚨 NEW: Status Summary */}
          {hasActiveJob && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                    <span className="text-orange-600 text-sm">🔧</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-orange-900">
                    You're currently working on a job
                  </h4>
                  <p className="text-sm text-orange-700 mt-1">
                    Complete your current job to become available for new opportunities. 
                    You can only work on one job at a time to ensure quality service.
                  </p>
                  <div className="mt-2">
                    <span className="text-xs text-orange-600">
                      Active jobs: {myJobs.filter(j => j.status === "BOOKED" || j.status === "IN_PROGRESS").length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

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
                  {/* 🚨 UPDATED: Job visibility logic - Always show jobs when available */}
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
                        {/* Show warning if provider has active job */}
                        {hasActiveJob && (
                          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                            <div className="flex items-center space-x-2 text-sm">
                              <span className="text-orange-600">⚠️</span>
                              <span className="text-orange-700">
                                You have an active job. Complete it before accepting new Quick Book jobs.
                              </span>
                            </div>
                          </div>
                        )}
                        {quickBookJobs.map((job) => (
                          <QuickBookJobCard
                            key={job.id}
                            job={job}
                            onAccept={acceptQuickBookJob}
                            onDecline={declineQuickBookJob}
                            isLoading={isLoading}
                            hasActiveJob={hasActiveJob}
                          />
                        ))}
                      </div>
                    )
                  ) : postQuoteJobs.length === 0 ? (
                    <div className="text-gray-500 text-center py-8">
                      No bidding opportunities available
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Demo Mode Toggle */}
                      <div className="mb-4 flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          id="demo-mode"
                          checked={demoMode}
                          onChange={(e) => setDemoMode(e.target.checked)}
                          className="accent-blue-600"
                        />
                        <label htmlFor="demo-mode" className="text-gray-700">
                          Demo Mode: Allow bidding again on already-bid jobs
                        </label>
                      </div>

                      {/* Show warning if provider has active job */}
                      {hasActiveJob && (
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                          <div className="flex items-center space-x-2 text-sm">
                            <span className="text-orange-600">⚠️</span>
                            <span className="text-orange-700">
                              You have an active job. You can view opportunities but cannot submit new bids until you complete your current job.
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Show available to bid */}
                      {postQuoteJobs.filter((j) => !j.hasUserBid).length ===
                      0 ? (
                        <p className="text-gray-500 text-sm">
                          No new jobs available to bid.
                        </p>
                      ) : (
                        postQuoteJobs
                          .filter((j) => !j.hasUserBid)
                          .map((job) => (
                            <PostQuoteJobCard
                              key={job.id}
                              job={job}
                              onBid={openBidModal}
                              formatTimeAgo={formatTimeAgo}
                              demoMode={demoMode}
                              hasActiveJob={hasActiveJob}
                            />
                          ))
                      )}

                      {/* Show already bid */}
                      {postQuoteJobs.some((j) => j.hasUserBid) && (
                        <div className="mt-6 border-t pt-4">
                          <h4 className="text-sm font-semibold text-gray-600 mb-2">
                            Already Bid
                          </h4>
                          <div className="space-y-4">
                            {postQuoteJobs
                              .filter((j) => j.hasUserBid)
                              .map((job) => (
                                <PostQuoteJobCard
                                  key={job.id}
                                  job={job}
                                  onBid={openBidModal}
                                  formatTimeAgo={formatTimeAgo}
                                  demoMode={demoMode}
                                  hasActiveJob={hasActiveJob}
                                />
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* My Jobs */}
            <div className="lg:col-span-1">
              <div className="bg-white shadow rounded-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    My Jobs
                  </h3>
                  <div className="text-sm text-gray-500">
                    <div>{myJobs.filter(j => j.status === "BOOKED" || j.status === "IN_PROGRESS").length} active</div>
                    <div className="text-xs">
                      {myJobs.filter(j => j.status === "COMPLETED").length} completed, {" "}
                      {myJobs.filter(j => j.status?.startsWith("CANCELLED")).length} cancelled
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  {myJobs.length === 0 ? (
                    <div className="text-gray-500 text-center py-8">
                      No jobs yet
                    </div>
                  ) : (
                    // Sort jobs: active first, then completed, then cancelled
                    myJobs
                      .sort((a, b) => {
                        const priority: Record<string, number> = {
                          "BOOKED": 1,
                          "IN_PROGRESS": 2, 
                          "COMPLETED": 3,
                          "CANCELLED_BY_PROVIDER": 4,
                          "CANCELLED_BY_CUSTOMER": 4
                        };
                        return (priority[a.status] || 5) - (priority[b.status] || 5);
                      })
                      .map((job) => (
                      <div key={job.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium text-gray-900">
                              {job.title}
                            </h4>
                            <p className="text-sm text-gray-600">
                              {job.category?.name || "Unknown Category"}
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
                                  : job.status === "CANCELLED_BY_PROVIDER"
                                  ? "bg-red-100 text-red-800"
                                  : job.status === "CANCELLED_BY_CUSTOMER"
                                  ? "bg-gray-100 text-gray-800"
                                  : job.status?.startsWith("CANCELLED")
                                  ? "bg-red-100 text-red-800"
                                  : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {job.status === "CANCELLED_BY_PROVIDER" 
                                ? "CANCELLED (BY YOU)"
                                : job.status === "CANCELLED_BY_CUSTOMER"
                                ? "CANCELLED (BY CUSTOMER)" 
                                : job.status?.startsWith("CANCELLED")
                                ? "CANCELLED"
                                : job.status}
                            </div>

                            {/* 🚨 UPDATED: Action Buttons for Different Job States */}
                            {job.status === "BOOKED" && (
                              <div className="mt-2 flex gap-2">
                                <button
                                  onClick={() => completeJob(job.id)}
                                  className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                                >
                                  Complete Job
                                </button>
                                <button
                                  onClick={() => cancelJob(job.id)}
                                  className="text-xs text-red-600 hover:underline"
                                >
                                  Cancel Job
                                </button>
                              </div>
                            )}
                            
                            {job.status === "IN_PROGRESS" && (
                              <div className="mt-2">
                                <button
                                  onClick={() => completeJob(job.id)}
                                  className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                                >
                                  Complete Job
                                </button>
                              </div>
                            )}

                            {/* Show additional info for completed/cancelled jobs */}
                            {(job.status === "COMPLETED" || job.status.startsWith("CANCELLED")) && (
                              <div className="mt-2 text-xs text-gray-500">
                                {job.status === "COMPLETED" && job.completedAt && (
                                  <div>Completed: {new Date(job.completedAt).toLocaleDateString()}</div>
                                )}
                                {job.status.startsWith("CANCELLED") && (
                                  <div>Cancelled: {new Date(job.updatedAt).toLocaleDateString()}</div>
                                )}
                              </div>
                            )}
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
                  <span className="text-2xl">
                    {selectedJob.category?.icon || "📋"}
                  </span>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">
                      {selectedJob.title}
                    </h4>
                    <p className="text-sm text-gray-600">
                      {selectedJob.category?.name || "Unknown Category"}
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

// 🚨 UPDATED: Quick Book Job Card Component with hasActiveJob prop
function QuickBookJobCard({
  job,
  onAccept,
  onDecline,
  isLoading,
  hasActiveJob = false,
}: {
  job: QuickBookJob;
  onAccept: (jobId: string) => void;
  onDecline: (jobId: string) => void;
  isLoading: boolean;
  hasActiveJob?: boolean;
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

      {/* 🚨 UPDATED: Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onAccept(job.id)}
          disabled={isLoading || timeLeft <= 0 || hasActiveJob}
          className={`flex-1 px-4 py-2 rounded-md font-medium ${
            hasActiveJob
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-green-600 text-white hover:bg-green-700"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {hasActiveJob 
            ? "Complete Current Job First" 
            : isLoading 
              ? "Accepting..." 
              : "Accept Job"
          }
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

// 🚨 UPDATED: Post Quote Job Card Component with hasActiveJob prop
function PostQuoteJobCard({
  job,
  onBid,
  formatTimeAgo,
  demoMode = false,
  hasActiveJob = false,
}: {
  job: PostQuoteJob;
  onBid: (job: PostQuoteJob) => void;
  formatTimeAgo: (dateString: string) => string;
  demoMode?: boolean;
  hasActiveJob?: boolean;
}) {
  const { user } = useUser();
  const boostBid = async () => {
    try {
      if (!job.bidId) {
        alert("❌ Missing bid ID");
        return;
      }

      const res = await fetch(`${API_URL}/api/bids/${job.bidId}/boost`, {
        method: "POST",
        headers: {
          "x-user-id": user?.id || "",
        },
      });

      const data = await res.json();
      if (!res.ok) {
        alert("❌ " + data.error);
        return;
      }

      alert("✅ Your bid has been boosted!");
      window.location.reload();
    } catch (err) {
      console.error("❌ Boost error:", err);
      alert("❌ Failed to boost bid");
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-orange-50 border-orange-200">
      {/* Job Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-start gap-3">
          <span className="text-2xl">{job.category?.icon || "📋"}</span>
          <div>
            <h4 className="font-medium text-gray-900">{job.title}</h4>
            <p className="text-sm text-gray-600">
              {job.category?.name || "Unknown Category"}
            </p>
            <p className="text-sm text-gray-500">{job.address}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-green-600">
            ${job.estimatedPrice}
          </div>
          <div className="text-sm text-gray-500">{job.distance}km away</div>

          {/* BOOSTED BADGE */}
          {job.boostedAt && job.status === "PENDING" && (
            <div className="mt-1 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full inline-block">
              📌 Boosted
            </div>
          )}
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
        <span>Customer: {job.customer?.name || "Unknown Customer"}</span>
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

      {/* 🚨 UPDATED: Action Button */}
      <div>
        {job.hasUserBid && !demoMode ? (
          <button
            disabled
            className="w-full bg-gray-300 text-gray-500 px-4 py-2 rounded-md cursor-not-allowed font-medium"
          >
            ✓ Bid Submitted
          </button>
        ) : (
          <button
            onClick={() => onBid(job)}
            disabled={hasActiveJob}
            className={`w-full px-4 py-2 rounded-md font-medium ${
              hasActiveJob
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-orange-600 text-white hover:bg-orange-700"
            }`}
          >
            {hasActiveJob ? "Complete Current Job First" : "Submit Bid"}
          </button>
        )}
      </div>
      {job.hasUserBid &&
        (job.status === "PENDING" || job.status === "BROADCASTED") &&
        !job.boostedAt &&
        !demoMode && (
          <button
            onClick={boostBid}
            className="mt-3 w-full flex items-center justify-center gap-2 border border-blue-600 text-blue-600 hover:bg-blue-50 font-medium text-sm px-4 py-2 rounded-md transition"
          >
            <span className="text-base">📈</span>
            Boost My Bid
          </button>
        )}
    </div>
  );
}