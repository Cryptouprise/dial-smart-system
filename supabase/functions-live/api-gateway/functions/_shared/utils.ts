Supabase Edge Functions
 * 
 * Provides consistent input validation, error handling, and response formatting
 * across all edge functions for improved reliability and security.
 */ import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
// Standard CORS headers
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};
// Common validation schemas
export const UUIDSchema = z.string().uuid('Invalid UUID format');
export const EmailSchema = z.string().email('Invalid email format');
export const PhoneSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format');
export const URLSchema = z.string().url('Invalid URL format');
/**
 * Validates request body against a Zod schema
 * Returns validated data or throws error with details
 */ export function validateInput(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map((issue)=>({
        field: issue.path.join('.'),
        message: issue.message
      }));
    throw new ValidationError('Input validation failed', errors);
  }
  return result.data;
}
/**
 * Custom error classes for better error handling
 */ export class ValidationError extends Error {
  errors;
  constructor(message, errors = []){
    super(message);
    this.errors = errors;
    this.name = 'ValidationError';
  }
}
export class AuthenticationError extends Error {
  constructor(message = 'Unauthorized'){
    super(message);
    this.name = 'AuthenticationError';
  }
}
export class NotFoundError extends Error {
  constructor(message = 'Resource not found'){
    super(message);
    this.name = 'NotFoundError';
  }
}
export class RateLimitError extends Error {
  constructor(message = 'Rate limit exceeded'){
    super(message);
    this.name = 'RateLimitError';
  }
}
/**
 * Standard success response
 */ export function successResponse(data, status = 200) {
  return new Response(JSON.stringify({
    success: true,
    data,
    timestamp: new Date().toISOString()
  }), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}
/**
 * Standard error response
 */ export function errorResponse(error, status) {
  let errorStatus = status || 500;
  let errorMessage = 'An unexpected error occurred';
  let errorDetails = undefined;
  if (error instanceof ValidationError) {
    errorStatus = 400;
    errorMessage = error.message;
    errorDetails = error.errors;
  } else if (error instanceof AuthenticationError) {
    errorStatus = 401;
    errorMessage = error.message;
  } else if (error instanceof NotFoundError) {
    errorStatus = 404;
    errorMessage = error.message;
  } else if (error instanceof RateLimitError) {
    errorStatus = 429;
    errorMessage = error.message;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }
  console.error('[Error]', {
    name: error instanceof Error ? error.name : 'Unknown',
    message: errorMessage,
    details: errorDetails,
    stack: error instanceof Error ? error.stack : undefined
  });
  return new Response(JSON.stringify({
    success: false,
    error: errorMessage,
    details: errorDetails,
    timestamp: new Date().toISOString()
  }), {
    status: errorStatus,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}
/**
 * Extract and validate user from authorization header
 */ export async function authenticateUser(req, supabase) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new AuthenticationError('Missing authorization header');
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    throw new AuthenticationError('Invalid or expired token');
  }
  return {
    user,
    userId: user.id
  };
}
/**
 * Rate limiting helper (simple in-memory implementation)
 * For production, use Redis or similar
 */ const rateLimitMap = new Map();
export function checkRateLimit(identifier, maxRequests = 100, windowMs = 60000 // 1 minute
) {
  const now = Date.now();
  const limit = rateLimitMap.get(identifier);
  if (!limit || now > limit.resetAt) {
    rateLimitMap.set(identifier, {
      count: 1,
      resetAt: now + windowMs
    });
    return;
  }
  if (limit.count >= maxRequests) {
    throw new RateLimitError('Too many requests, please try again later');
  }
  limit.count++;
}
/**
 * Sanitize string input to prevent XSS
 */ export function sanitizeString(input) {
  return input.replace(/[<>]/g, '').trim().substring(0, 10000); // Max length
}
/**
 * Validate environment variables
 */ export function requireEnvVars(...varNames) {
  const missing = [];
  const result = {};
  for (const varName of varNames){
    const value = Deno.env.get(varName);
    if (!value) {
      missing.push(varName);
    } else {
      result[varName] = value;
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return result;
}
/**
 * Parse JSON safely with error handling
 */ export async function parseJSON(req) {
  try {
    return await req.json();
  } catch (error) {
    throw new ValidationError('Invalid JSON in request body');
  }
}
/**
 * Retry helper for external API calls
 */ export async function retry(fn, maxRetries = 3, delayMs = 1000) {
  let lastError;
  for(let i = 0; i < maxRetries; i++){
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < maxRetries - 1) {
        await new Promise((resolve)=>setTimeout(resolve, delayMs * (i + 1)));
      }
    }
  }
  throw lastError || new Error('Max retries exceeded');
}
/**
 * Log helper for structured logging
 */ export function log(level, message, data) {
  const logEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...data && {
      data
    }
  };
  console.log(JSON.stringify(logEntry));
}
/**
 * Batch processing helper
 */ export async function processBatch(items, processor, batchSize = 10) {
  const results = [];
  for(let i = 0; i < items.length; i += batchSize){
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
}
/**
 * Cache helper (simple in-memory implementation)
 */ const cache = new Map();
export function getCached(key) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    cache.delete(key);
    return null;
  }
  return cached.value;
}
export function setCache(key, value, ttlMs = 300000) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}
export function clearCache(keyPrefix) {
  if (keyPrefix) {
    for (const key of cache.keys()){
      if (key.startsWith(keyPrefix)) {
        cache.delete(key);
      }
    }
  } else {
    cache.clear();
  }
}
const circuitBreakers = new Map();
const CIRCUIT_BREAKER_THRESHOLD = 5; // Open after 5 consecutive failures
const CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds before half-open
export function getCircuitState(serviceName) {
  const existing = circuitBreakers.get(serviceName);
  if (!existing) {
    return {
      failures: 0,
      lastFailure: 0,
      state: 'closed'
    };
  }
  // Check if we should transition from open to half-open
  if (existing.state === 'open' && Date.now() - existing.lastFailure > CIRCUIT_BREAKER_TIMEOUT) {
    existing.state = 'half-open';
    circuitBreakers.set(serviceName, existing);
  }
  return existing;
}
export function recordSuccess(serviceName) {
  const state = getCircuitState(serviceName);
  state.failures = 0;
  state.state = 'closed';
  circuitBreakers.set(serviceName, state);
}
export function recordFailure(serviceName) {
  const state = getCircuitState(serviceName);
  state.failures++;
  state.lastFailure = Date.now();
  if (state.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    state.state = 'open';
    log('warn', `Circuit breaker opened for ${serviceName}`, {
      failures: state.failures
    });
  }
  circuitBreakers.set(serviceName, state);
}
export function isCircuitOpen(serviceName) {
  const state = getCircuitState(serviceName);
  return state.state === 'open';
}
/**
 * Execute a function with circuit breaker protection
 */ export async function withCircuitBreaker(serviceName, fn, fallback) {
  const state = getCircuitState(serviceName);
  if (state.state === 'open') {
    log('warn', `Circuit breaker is open for ${serviceName}, using fallback`);
    if (fallback !== undefined) return fallback;
    throw new Error(`Service ${serviceName} is temporarily unavailable`);
  }
  try {
    const result = await fn();
    recordSuccess(serviceName);
    return result;
  } catch (error) {
    recordFailure(serviceName);
    throw error;
  }
}
/**
 * Database operation with automatic retry and reconnection
 */ export async function withDatabaseRetry(operation, maxRetries = 3, baseDelayMs = 1000) {
  let lastError;
  for(let attempt = 0; attempt < maxRetries; attempt++){
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Check if it's a retryable error
      const errorMessage = lastError.message.toLowerCase();
      const isRetryable = errorMessage.includes('connection') || errorMessage.includes('timeout') || errorMessage.includes('econnreset') || errorMessage.includes('503') || errorMessage.includes('temporarily unavailable');
      if (!isRetryable) {
        throw lastError;
      }
      log('warn', `Database operation failed, attempt ${attempt + 1}/${maxRetries}`, {
        error: lastError.message
      });
      if (attempt < maxRetries - 1) {
        // Exponential backoff with jitter
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
        await new Promise((resolve)=>setTimeout(resolve, delay));
      }
    }
  }
  throw lastError || new Error('Max retries exceeded');
}
/**
 * BULLETPROOF PIPELINE HELPER
 * Ensures a pipeline board exists for a user, creating it if missing.
 * Handles case-insensitive matching and name normalization.
 */ export async function ensurePipelineBoard(supabase, userId, desiredName, dispositionId) {
  const normalizedName = desiredName.trim();
  // First, try case-insensitive match on existing boards
  const { data: existingBoards, error: fetchError } = await supabase.from('pipeline_boards').select('id, name').eq('user_id', userId);
  if (fetchError) {
    console.error('[ensurePipelineBoard] Failed to fetch boards:', fetchError);
    throw fetchError;
  }
  // Case-insensitive matching with common variations
  const variations = [
    normalizedName.toLowerCase(),
    normalizedName.toLowerCase().replace(/_/g, ' '),
    normalizedName.replace(/([A-Z])/g, ' $1').trim().toLowerCase()
  ];
  for (const board of existingBoards || []){
    const boardNameLower = board.name.toLowerCase();
    if (variations.includes(boardNameLower) || boardNameLower === normalizedName.toLowerCase()) {
      console.log(`[ensurePipelineBoard] Found existing board: ${board.name} (id: ${board.id})`);
      return {
        id: board.id,
        name: board.name,
        created: false
      };
    }
  }
  // No match found - create the board
  // Get max position for ordering
  const maxPosition = (existingBoards || []).reduce((max, b)=>Math.max(max, b.position || 0), 0);
  const newBoard = {
    user_id: userId,
    name: normalizedName,
    description: `Auto-created pipeline stage for: ${normalizedName}`,
    position: maxPosition + 1,
    settings: {},
    disposition_id: dispositionId || null
  };
  const { data: created, error: createError } = await supabase.from('pipeline_boards').insert(newBoard).select('id, name').single();
  if (createError) {
    console.error('[ensurePipelineBoard] Failed to create board:', createError);
    throw createError;
  }
  console.log(`[ensurePipelineBoard] ✅ Created new board: ${created.name} (id: ${created.id})`);
  return {
    id: created.id,
    name: created.name,
    created: true
  };
}
/**
 * Move a lead to a pipeline stage, creating the stage if it doesn't exist.
 * This is the BULLETPROOF way to update pipeline positions.
 */ export async function moveLeadToPipelineStage(supabase, leadId, userId, stageName, notes) {
  try {
    // Ensure the pipeline board exists (creates if missing)
    const board = await ensurePipelineBoard(supabase, userId, stageName);
    // Upsert the lead's pipeline position
    const { error: upsertError } = await supabase.from('lead_pipeline_positions').upsert({
      user_id: userId,
      lead_id: leadId,
      pipeline_board_id: board.id,
      position: 0,
      moved_at: new Date().toISOString(),
      moved_by_user: false,
      notes: notes || `Auto-moved to: ${board.name}`
    }, {
      onConflict: 'lead_id,user_id'
    });
    if (upsertError) {
      console.error('[moveLeadToPipelineStage] Upsert failed:', upsertError);
      throw upsertError;
    }
    console.log(`[moveLeadToPipelineStage] ✅ Lead ${leadId} moved to "${board.name}"`);
    return {
      success: true,
      boardId: board.id,
      boardName: board.name,
      created: board.created
    };
  } catch (error) {
    console.error('[moveLeadToPipelineStage] Failed:', error);
    return {
      success: false,
      boardId: '',
      boardName: stageName,
      created: false
    };
  }
}
export * from "./index.ts";
