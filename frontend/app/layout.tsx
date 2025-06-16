'use client';

import './globals.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { UserProvider } from '@/contexts/UserContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <html lang="en">
      <body>
        <QueryClientProvider client={queryClient}>
          <UserProvider>
            <WebSocketProvider>
              {children}
            </WebSocketProvider>
          </UserProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}