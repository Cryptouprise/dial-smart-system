import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger, createLogger } from '../logger';

describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logger.clearContext();
  });

  describe('setContext', () => {
    it('should set and persist context', () => {
      const context = { userId: '123', feature: 'test' };
      logger.setContext(context);
      
      // Context should be included in subsequent logs
      const spy = vi.spyOn(console, 'info');
      logger.info('Test message');
      
      expect(spy).toHaveBeenCalled();
      const logMessage = spy.mock.calls[0][0];
      expect(logMessage).toContain('userId');
      expect(logMessage).toContain('123');
    });

    it('should clear context', () => {
      logger.setContext({ userId: '123' });
      logger.clearContext();
      
      const spy = vi.spyOn(console, 'info');
      logger.info('Test message');
      
      const logMessage = spy.mock.calls[0][0];
      expect(logMessage).not.toContain('userId');
    });
  });

  describe('debug', () => {
    it('should log debug messages in development', () => {
      const spy = vi.spyOn(console, 'debug');
      logger.debug('Debug message', { key: 'value' });
      
      // Debug only logs in dev mode
      if (import.meta.env.DEV) {
        expect(spy).toHaveBeenCalled();
      }
    });
  });

  describe('info', () => {
    it('should log info messages', () => {
      const spy = vi.spyOn(console, 'info');
      logger.info('Info message');
      
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0]).toContain('INFO');
      expect(spy.mock.calls[0][0]).toContain('Info message');
    });

    it('should include context in info messages', () => {
      const spy = vi.spyOn(console, 'info');
      logger.info('Test', { userId: '123' });
      
      expect(spy.mock.calls[0][0]).toContain('userId');
    });
  });

  describe('warn', () => {
    it('should log warning messages', () => {
      const spy = vi.spyOn(console, 'warn');
      logger.warn('Warning message');
      
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0]).toContain('WARN');
      expect(spy.mock.calls[0][0]).toContain('Warning message');
    });
  });

  describe('error', () => {
    it('should log error messages', () => {
      const spy = vi.spyOn(console, 'error');
      const error = new Error('Test error');
      logger.error('Error occurred', error);
      
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0]).toContain('ERROR');
      expect(spy.mock.calls[0][0]).toContain('Error occurred');
    });

    it('should handle errors without Error object', () => {
      const spy = vi.spyOn(console, 'error');
      logger.error('Simple error message');
      
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('specialized logging methods', () => {
    it('should log user actions', () => {
      const spy = vi.spyOn(console, 'info');
      logger.logUserAction('Button Clicked', { buttonId: 'submit' });
      
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0]).toContain('User Action: Button Clicked');
    });

    it('should log API calls', () => {
      const spy = vi.spyOn(console, 'debug');
      logger.logAPICall('GET', '/api/users', 200, 150);
      
      // API calls log as debug
      if (import.meta.env.DEV) {
        expect(spy).toHaveBeenCalled();
      }
    });

    it('should log API errors', () => {
      const spy = vi.spyOn(console, 'warn');
      logger.logAPICall('POST', '/api/users', 500, 200);
      
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0]).toContain('API Error');
    });

    it('should log authentication events', () => {
      const spy = vi.spyOn(console, 'info');
      logger.logAuth('login', 'user123');
      
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0]).toContain('Auth Event: login');
    });

    it('should log navigation events', () => {
      const spy = vi.spyOn(console, 'debug');
      logger.logNavigation('/home', '/dashboard');
      
      if (import.meta.env.DEV) {
        expect(spy).toHaveBeenCalled();
      }
    });

    it('should log feature usage', () => {
      const spy = vi.spyOn(console, 'info');
      logger.logFeatureUsage('Campaign', 'Create');
      
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0]).toContain('Feature Usage: Campaign - Create');
    });
  });

  describe('createLogger', () => {
    it('should create logger with custom context', () => {
      const customLogger = createLogger({ feature: 'payments' });
      const spy = vi.spyOn(console, 'info');
      
      customLogger.info('Payment processed');
      
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0]).toContain('feature');
      expect(spy.mock.calls[0][0]).toContain('payments');
    });
  });
});
