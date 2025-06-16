'use client';

import { useWebSocket } from '@/contexts/WebSocketContext';

export function NotificationToast() {
  const { notifications, removeNotification } = useWebSocket();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`max-w-sm w-full shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden animate-slide-up ${
            notification.type === 'success' ? 'bg-success-50' :
            notification.type === 'error' ? 'bg-error-50' :
            notification.type === 'warning' ? 'bg-warning-50' :
            'bg-primary-50'
          }`}
        >
          <div className="p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className={`w-5 h-5 rounded-full ${
                  notification.type === 'success' ? 'bg-success-400' :
                  notification.type === 'error' ? 'bg-error-400' :
                  notification.type === 'warning' ? 'bg-warning-400' :
                  'bg-primary-400'
                }`} />
              </div>
              <div className="ml-3 w-0 flex-1 pt-0.5">
                <p className="text-sm font-medium text-gray-900">
                  {notification.title}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {notification.message}
                </p>
              </div>
              <div className="ml-4 flex-shrink-0 flex">
                <button
                  className="rounded-md inline-flex text-gray-400 hover:text-gray-500 focus:outline-none"
                  onClick={() => removeNotification(notification.id)}
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}