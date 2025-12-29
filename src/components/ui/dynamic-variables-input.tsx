import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Textarea } from './textarea';
import { Input } from './input';
import { cn } from '@/lib/utils';

const DYNAMIC_VARIABLES = [
  // Standard lead fields
  { key: 'first_name', label: 'First Name', description: "Lead's first name" },
  { key: 'last_name', label: 'Last Name', description: "Lead's last name" },
  { key: 'full_name', label: 'Full Name', description: 'First + last name combined' },
  { key: 'email', label: 'Email', description: "Lead's email address" },
  { key: 'company', label: 'Company', description: "Lead's company name" },
  { key: 'lead_source', label: 'Lead Source', description: 'Where the lead came from' },
  { key: 'notes', label: 'Notes', description: 'Lead notes' },
  { key: 'tags', label: 'Tags', description: 'Lead tags (comma separated)' },
  { key: 'timezone', label: 'Timezone', description: "Lead's timezone" },
  { key: 'preferred_contact_time', label: 'Preferred Contact Time', description: 'Best time to call' },
  
  // Address fields (stored in custom_fields)
  { key: 'address1', label: 'Address Line 1', description: 'Street address' },
  { key: 'address2', label: 'Address Line 2', description: 'Apt/Suite/Unit' },
  { key: 'city', label: 'City', description: 'City name' },
  { key: 'state', label: 'State', description: 'State/Province' },
  { key: 'zip', label: 'ZIP Code', description: 'Postal/ZIP code' },
  { key: 'postal_code', label: 'Postal Code', description: 'Postal/ZIP code' },
  { key: 'country', label: 'Country', description: 'Country' },
  { key: 'full_address', label: 'Full Address', description: 'Complete address' },
  
  // Contact.* aliases (for GHL compatibility)
  { key: 'contact.first_name', label: 'Contact First Name', description: "Contact's first name (GHL)" },
  { key: 'contact.last_name', label: 'Contact Last Name', description: "Contact's last name (GHL)" },
  { key: 'contact.email', label: 'Contact Email', description: "Contact's email (GHL)" },
  { key: 'contact.company', label: 'Contact Company', description: "Contact's company (GHL)" },
  { key: 'contact.address1', label: 'Contact Address 1', description: "Contact's street address (GHL)" },
  { key: 'contact.address2', label: 'Contact Address 2', description: "Contact's address line 2 (GHL)" },
  { key: 'contact.city', label: 'Contact City', description: "Contact's city (GHL)" },
  { key: 'contact.state', label: 'Contact State', description: "Contact's state (GHL)" },
  { key: 'contact.zip', label: 'Contact ZIP', description: "Contact's ZIP code (GHL)" },
  { key: 'contact.postal_code', label: 'Contact Postal Code', description: "Contact's postal code (GHL)" },
  { key: 'contact.country', label: 'Contact Country', description: "Contact's country (GHL)" },
];

interface DynamicVariablesInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
  id?: string;
}

export const DynamicVariablesInput: React.FC<DynamicVariablesInputProps> = ({
  value,
  onChange,
  placeholder,
  multiline = false,
  rows = 4,
  className,
  id,
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredVars, setFilteredVars] = useState(DYNAMIC_VARIABLES);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Find the current variable being typed (after {{ )
  const getCurrentVariablePrefix = useCallback(() => {
    const textBeforeCursor = value.slice(0, cursorPosition);
    const lastOpenBrace = textBeforeCursor.lastIndexOf('{{');
    
    if (lastOpenBrace === -1) return null;
    
    // Check if there's a closing brace after the opening one
    const textAfterBrace = textBeforeCursor.slice(lastOpenBrace + 2);
    if (textAfterBrace.includes('}}')) return null;
    
    return textAfterBrace;
  }, [value, cursorPosition]);

  // Update filtered variables based on what user is typing
  useEffect(() => {
    const prefix = getCurrentVariablePrefix();
    
    if (prefix !== null) {
      const filtered = DYNAMIC_VARIABLES.filter(v => 
        v.key.toLowerCase().includes(prefix.toLowerCase()) ||
        v.label.toLowerCase().includes(prefix.toLowerCase())
      );
      setFilteredVars(filtered.length > 0 ? filtered : DYNAMIC_VARIABLES);
      setShowSuggestions(true);
      setSelectedIndex(0);
    } else {
      setShowSuggestions(false);
    }
  }, [getCurrentVariablePrefix]);

  const insertVariable = (variableKey: string) => {
    const prefix = getCurrentVariablePrefix();
    if (prefix === null) return;
    
    const textBeforeCursor = value.slice(0, cursorPosition);
    const lastOpenBrace = textBeforeCursor.lastIndexOf('{{');
    const textBefore = value.slice(0, lastOpenBrace);
    const textAfter = value.slice(cursorPosition);
    
    const newValue = `${textBefore}{{${variableKey}}}${textAfter}`;
    onChange(newValue);
    setShowSuggestions(false);
    
    // Focus back on input
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newPos = lastOpenBrace + variableKey.length + 4; // +4 for {{ and }}
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) return;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredVars.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredVars.length) % filteredVars.length);
        break;
      case 'Enter':
      case 'Tab':
        if (filteredVars.length > 0) {
          e.preventDefault();
          insertVariable(filteredVars[selectedIndex].key);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    onChange(e.target.value);
    setCursorPosition(e.target.selectionStart || 0);
  };

  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const target = e.target as HTMLTextAreaElement | HTMLInputElement;
    setCursorPosition(target.selectionStart || 0);
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const InputComponent = multiline ? Textarea : Input;

  return (
    <div className="relative">
      <InputComponent
        ref={inputRef as any}
        id={id}
        value={value}
        onChange={handleChange}
        onSelect={handleSelect}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={multiline ? rows : undefined}
        className={className}
      />
      
      {showSuggestions && filteredVars.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 mt-1 w-full max-h-60 overflow-auto bg-popover border border-border rounded-md shadow-lg"
        >
          <div className="p-2 text-xs text-muted-foreground border-b border-border bg-muted/50">
            Dynamic Variables — Use ↑↓ to navigate, Enter to insert
          </div>
          {filteredVars.map((variable, index) => (
            <div
              key={variable.key}
              className={cn(
                'px-3 py-2 cursor-pointer flex items-center justify-between',
                index === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
              )}
              onClick={() => insertVariable(variable.key)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="flex items-center gap-2">
                <code className="text-xs px-1.5 py-0.5 bg-primary/10 rounded font-mono">
                  {`{{${variable.key}}}`}
                </code>
                <span className="text-sm font-medium">{variable.label}</span>
              </div>
              <span className="text-xs text-muted-foreground">{variable.description}</span>
            </div>
          ))}
        </div>
      )}
      
      <p className="text-xs text-muted-foreground mt-1">
        Type <code className="px-1 bg-muted rounded">{'{{'}</code> to insert dynamic variables
      </p>
    </div>
  );
};
