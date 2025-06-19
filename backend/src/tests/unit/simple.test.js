// Create this as src/tests/unit/simple.test.js
import { describe, it, expect } from '@jest/globals';

describe('Simple ES Module Test', () => {
  it('should work with ES modules', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have test environment set', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('should handle async operations', async () => {
    const result = await Promise.resolve('success');
    expect(result).toBe('success');
  });
});