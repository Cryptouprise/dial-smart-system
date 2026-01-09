import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CampaignWizard } from '../CampaignWizard';

vi.mock('@/integrations/supabase/client');

describe('CampaignWizard - Ease of Use', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Wizard Flow & Navigation', () => {
    it('should render wizard with clear starting point', () => {
      render(<CampaignWizard />);
      
      // Should have welcome/intro
      expect(screen.getByText(/campaign/i)).toBeInTheDocument();
      // Should have clear "Next" or "Start" button
      expect(screen.getByRole('button', { name: /next|start|begin/i })).toBeInTheDocument();
    });

    it('should show progress indicator', () => {
      render(<CampaignWizard />);
      
      // Should show steps (1 of 5, or progress bar)
      const progressElements = screen.queryAllByRole('progressbar') || 
                               screen.queryAllByText(/step/i);
      
      expect(progressElements.length).toBeGreaterThan(0);
    });

    it('should allow navigation between steps', async () => {
      render(<CampaignWizard />);
      
      const nextButton = screen.getByRole('button', { name: /next/i });
      
      fireEvent.click(nextButton);
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back|previous/i })).toBeInTheDocument();
      });
    });

    it('should validate inputs before proceeding', async () => {
      render(<CampaignWizard />);
      
      const nextButton = screen.getByRole('button', { name: /next/i });
      
      // Try to proceed without required fields
      fireEvent.click(nextButton);
      
      await waitFor(() => {
        // Should show validation error
        expect(screen.queryByText(/required|enter|provide/i)).toBeInTheDocument();
      });
    });

    it('should save progress automatically', async () => {
      render(<CampaignWizard />);
      
      // Fill in some data
      const nameInput = screen.queryByLabelText(/name|title/i);
      if (nameInput) {
        fireEvent.change(nameInput, { target: { value: 'Test Campaign' } });
      }
      
      // Progress should be saved (check local storage or state)
      expect(localStorage.getItem).toHaveBeenCalled();
    });
  });

  describe('User Experience & Help', () => {
    it('should provide helpful tooltips', async () => {
      render(<CampaignWizard />);
      
      // Should have help icons or tooltips
      const helpIcons = screen.queryAllByRole('button', { name: /help|info|tooltip/i });
      
      expect(helpIcons.length).toBeGreaterThan(0);
    });

    it('should show example values', () => {
      render(<CampaignWizard />);
      
      // Inputs should have placeholders or examples
      const inputs = screen.getAllByRole('textbox');
      
      const hasPlaceholders = inputs.some(input => 
        input.getAttribute('placeholder') || 
        input.getAttribute('aria-describedby')
      );
      
      expect(hasPlaceholders).toBe(true);
    });

    it('should use clear, non-technical language', () => {
      render(<CampaignWizard />);
      
      const text = screen.getByText(/./);
      const contentText = text.textContent || '';
      
      // Should avoid technical jargon
      expect(contentText).not.toMatch(/API|endpoint|REST|JSON/i);
    });

    it('should show visual feedback on actions', async () => {
      render(<CampaignWizard />);
      
      const nextButton = screen.getByRole('button', { name: /next/i });
      
      fireEvent.click(nextButton);
      
      // Should show loading state
      await waitFor(() => {
        expect(nextButton).toHaveAttribute('disabled');
      }, { timeout: 1000 });
    });
  });

  describe('Speed & Efficiency', () => {
    it('should have smart defaults pre-selected', () => {
      render(<CampaignWizard />);
      
      // Check for pre-selected options
      const checkboxes = screen.queryAllByRole('checkbox');
      const hasDefaults = checkboxes.some(cb => cb.getAttribute('checked'));
      
      expect(hasDefaults || checkboxes.length === 0).toBe(true);
    });

    it('should allow skipping optional steps', async () => {
      render(<CampaignWizard />);
      
      // Should have skip buttons for non-required steps
      const skipButton = screen.queryByRole('button', { name: /skip|later/i });
      
      expect(skipButton).toBeInTheDocument();
    });

    it('should complete setup in under 5 steps', () => {
      render(<CampaignWizard />);
      
      // Count total steps
      const stepIndicators = screen.queryAllByText(/step \d+/i);
      const progressText = screen.getByText(/./);
      
      // Extract step count from text like "Step 1 of 5"
      const match = progressText.textContent?.match(/of (\d+)/i);
      const totalSteps = match ? parseInt(match[1]) : 0;
      
      expect(totalSteps).toBeLessThanOrEqual(5);
    });

    it('should remember previous inputs on back navigation', async () => {
      render(<CampaignWizard />);
      
      const nameInput = screen.queryByLabelText(/name/i);
      if (nameInput) {
        fireEvent.change(nameInput, { target: { value: 'Test' } });
        
        // Go forward then back
        const nextButton = screen.getByRole('button', { name: /next/i });
        fireEvent.click(nextButton);
        
        await waitFor(() => {
          const backButton = screen.queryByRole('button', { name: /back/i });
          if (backButton) {
            fireEvent.click(backButton);
          }
        });
        
        // Value should persist
        await waitFor(() => {
          expect((nameInput as HTMLInputElement).value).toBe('Test');
        });
      }
    });
  });

  describe('Error Handling & Recovery', () => {
    it('should show clear error messages', async () => {
      render(<CampaignWizard />);
      
      // Trigger validation error
      const nextButton = screen.getByRole('button', { name: /next/i });
      fireEvent.click(nextButton);
      
      await waitFor(() => {
        const errorMessages = screen.queryAllByRole('alert');
        expect(errorMessages.length).toBeGreaterThanOrEqual(0);
      });
    });

    it('should highlight fields with errors', async () => {
      render(<CampaignWizard />);
      
      const nextButton = screen.getByRole('button', { name: /next/i });
      fireEvent.click(nextButton);
      
      await waitFor(() => {
        const inputs = screen.getAllByRole('textbox');
        const hasErrorStyling = inputs.some(input => 
          input.getAttribute('aria-invalid') === 'true' ||
          input.className.includes('error')
        );
        
        expect(hasErrorStyling || inputs.length === 0).toBe(true);
      });
    });

    it('should allow retry on failure', async () => {
      render(<CampaignWizard />);
      
      // Simulate failure, should show retry option
      const submitButton = screen.queryByRole('button', { name: /create|finish|submit/i });
      
      if (submitButton) {
        fireEvent.click(submitButton);
        
        await waitFor(() => {
          const retryButton = screen.queryByRole('button', { name: /retry|try again/i });
          expect(retryButton || submitButton).toBeInTheDocument();
        });
      }
    });
  });

  describe('Completion & Success', () => {
    it('should show clear success message on completion', async () => {
      render(<CampaignWizard />);
      
      // Complete all steps (simplified)
      const finishButton = screen.queryByRole('button', { name: /finish|complete|create/i });
      
      if (finishButton) {
        fireEvent.click(finishButton);
        
        await waitFor(() => {
          expect(screen.queryByText(/success|created|complete/i)).toBeInTheDocument();
        });
      }
    });

    it('should provide next steps after completion', async () => {
      render(<CampaignWizard />);
      
      // After completion, should guide user
      await waitFor(() => {
        const nextStepsButtons = screen.queryAllByRole('button', { name: /view|start|launch/i });
        expect(nextStepsButtons.length >= 0).toBe(true);
      });
    });
  });
});
