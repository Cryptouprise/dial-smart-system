const NO_AUTHORITY = Object.freeze({
  contact_authorized: false,
  launch_authorized: false,
  queue_mutation_authorized: false,
  crm_write_authorized: false,
  provider_write_authorized: false,
  spend_authorized: false,
});

const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{2,79}$/;

function configured(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function errorCode(error, fallback) {
  return error && typeof error === 'object' && typeof error.code === 'string' && SAFE_ERROR_CODE.test(error.code)
    ? error.code
    : fallback;
}

function aggregateStatus(providerStatuses) {
  if (providerStatuses.some((provider) => provider.status === 'readiness_blocked')) return 'readiness_blocked';
  if (providerStatuses.every((provider) => provider.status === 'configuration_required')) return 'configuration_required';
  if (providerStatuses.every((provider) => provider.status === 'readiness_observed')) return 'readiness_observed';
  return 'partially_ready';
}

/**
 * Combines the two existing redacted read-only provider probes into one
 * operator brief. This is not an adapter, campaign client, or send control:
 * it cannot list recipients, inspect mailboxes, create campaigns, mutate
 * provider configuration, or send messages.
 */
export async function buildEmailProviderReadinessBrief({
  instantly = {},
  mailgun = {},
  inspectInstantly,
  inspectMailgun,
} = {}) {
  if (typeof inspectInstantly !== 'function' || typeof inspectMailgun !== 'function') {
    throw new TypeError('inspectInstantly and inspectMailgun functions are required');
  }

  const providerStatuses = [];
  let providerReadProbeCalls = 0;

  if (!configured(instantly.apiKey)) {
    providerStatuses.push(Object.freeze({
      provider: 'instantly',
      status: 'configuration_required',
      required_environment: Object.freeze(['INSTANTLY_API_KEY']),
      provider_action: 'none',
    }));
  } else {
    providerReadProbeCalls += 1;
    try {
      const readiness = await inspectInstantly({
        apiKey: instantly.apiKey,
        baseUrl: instantly.baseUrl,
        fetchImpl: instantly.fetchImpl,
      });
      providerStatuses.push(Object.freeze({
        provider: 'instantly',
        status: 'readiness_observed',
        readiness,
        provider_action: 'none',
      }));
    } catch (error) {
      providerStatuses.push(Object.freeze({
        provider: 'instantly',
        status: 'readiness_blocked',
        error_code: errorCode(error, 'INSTANTLY_READINESS_FAILED'),
        provider_action: 'none',
      }));
    }
  }

  if (!configured(mailgun.apiKey) || !configured(mailgun.domain)) {
    providerStatuses.push(Object.freeze({
      provider: 'mailgun',
      status: 'configuration_required',
      required_environment: Object.freeze(['MAILGUN_API_KEY', 'MAILGUN_DOMAIN']),
      provider_action: 'none',
    }));
  } else {
    providerReadProbeCalls += 1;
    try {
      const readiness = await inspectMailgun({
        apiKey: mailgun.apiKey,
        domain: mailgun.domain,
        baseUrl: mailgun.baseUrl,
        fetchImpl: mailgun.fetchImpl,
      });
      providerStatuses.push(Object.freeze({
        provider: 'mailgun',
        status: 'readiness_observed',
        readiness,
        provider_action: 'none',
      }));
    } catch (error) {
      providerStatuses.push(Object.freeze({
        provider: 'mailgun',
        status: 'readiness_blocked',
        error_code: errorCode(error, 'MAILGUN_READINESS_FAILED'),
        provider_action: 'none',
      }));
    }
  }

  return Object.freeze({
    kind: 'email_provider_readiness_brief_v1',
    status: aggregateStatus(providerStatuses),
    providers: Object.freeze(providerStatuses),
    provider_action: 'none',
    authority: NO_AUTHORITY,
    side_effect_invariants: Object.freeze({
      database_reads: 0,
      database_writes: 0,
      provider_read_probe_calls: providerReadProbeCalls,
      provider_writes: 0,
      external_messages: 0,
    }),
  });
}
