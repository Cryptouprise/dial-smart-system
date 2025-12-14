-- Add SHAKEN/STIR attestation and enhanced spam detection columns
ALTER TABLE phone_numbers 
ADD COLUMN IF NOT EXISTS stir_shaken_attestation TEXT CHECK (stir_shaken_attestation IN ('A', 'B', 'C', 'not_verified')),
ADD COLUMN IF NOT EXISTS line_type TEXT,
ADD COLUMN IF NOT EXISTS carrier_name TEXT,
ADD COLUMN IF NOT EXISTS caller_name TEXT,
ADD COLUMN IF NOT EXISTS is_voip BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS external_spam_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_lookup_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN phone_numbers.stir_shaken_attestation IS 'SHAKEN/STIR attestation level: A=Full verification, B=Partial, C=Gateway, not_verified=No attestation';
COMMENT ON COLUMN phone_numbers.line_type IS 'Type of line: mobile, landline, voip, tollfree';
COMMENT ON COLUMN phone_numbers.carrier_name IS 'Carrier/provider name from Twilio Lookup';
COMMENT ON COLUMN phone_numbers.caller_name IS 'Registered caller name (CNAM)';
COMMENT ON COLUMN phone_numbers.external_spam_score IS 'Spam score from external databases (0-100)';
COMMENT ON COLUMN phone_numbers.last_lookup_at IS 'Last time carrier/spam lookup was performed';

-- Create index for STIR/SHAKEN filtering
CREATE INDEX IF NOT EXISTS idx_phone_numbers_attestation ON phone_numbers(stir_shaken_attestation) WHERE status = 'active';