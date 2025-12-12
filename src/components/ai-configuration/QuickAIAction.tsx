import React from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

interface QuickAIActionProps {
  label: string;
  prompt: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export const QuickAIAction: React.FC<QuickAIActionProps> = ({
  label,
  prompt,
  variant = 'outline',
  size = 'default',
  className = ''
}) => {
  const handleClick = () => {
    // Dispatch custom event to open AI chat with prompt
    window.dispatchEvent(
      new CustomEvent('open-ai-chat', {
        detail: { prompt, configurationMode: true }
      })
    );
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={`gap-2 ${className}`}
      onClick={handleClick}
    >
      <Sparkles className="h-4 w-4" />
      {label}
    </Button>
  );
};

export default QuickAIAction;
