// Update your src/tests/setup.js to better handle cleanup:

import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres:root@localhost:5432/marketplace_test';

// Store original methods for cleanup
const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;
const originalSetInterval = global.setInterval;
const originalClearInterval = global.clearInterval;

// Track active timers for cleanup
const activeTimers = new Set();

// Override timer functions to track them
global.setTimeout = function(callback, delay, ...args) {
  const id = originalSetTimeout.call(this, (...callbackArgs) => {
    activeTimers.delete(id);
    return callback(...callbackArgs);
  }, delay, ...args);
  activeTimers.add(id);
  return id;
};

global.setInterval = function(callback, delay, ...args) {
  const id = originalSetInterval.call(this, callback, delay, ...args);
  activeTimers.add(id);
  return id;
};

global.clearTimeout = function(id) {
  activeTimers.delete(id);
  return originalClearTimeout.call(this, id);
};

global.clearInterval = function(id) {
  activeTimers.delete(id);
  return originalClearInterval.call(this, id);
};

// Global test setup
global.beforeEach = global.beforeEach || (() => {
  // Reset mocks before each test
  if (jest && jest.clearAllMocks) {
    jest.clearAllMocks();
  }
});

global.afterEach = global.afterEach || (() => {
  // Clean up timers after each test
  activeTimers.forEach(id => {
    originalClearTimeout(id);
    originalClearInterval(id);
  });
  activeTimers.clear();
  
  // Clean up after each test
  if (jest && jest.restoreAllMocks) {
    jest.restoreAllMocks();
  }
});

// Global cleanup for the entire test suite
global.afterAll = global.afterAll || (() => {
  // Final cleanup
  activeTimers.forEach(id => {
    originalClearTimeout(id);
    originalClearInterval(id);
  });
  activeTimers.clear();
  
  // Restore original timer functions
  global.setTimeout = originalSetTimeout;
  global.clearTimeout = originalClearTimeout;
  global.setInterval = originalSetInterval;
  global.clearInterval = originalClearInterval;
});

console.log('Test setup loaded successfully');