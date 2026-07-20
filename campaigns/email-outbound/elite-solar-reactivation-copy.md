# Elite Solar Recovery — database reactivation email v1

**Status:** Draft only. This is copy and campaign design, not a contact list,
provider campaign, or send instruction.

## Purpose and allowable audience

Use this sequence only for a reviewed, suppressed, and hygiene-checked audience
whose record demonstrates a previous Elite Solar Recovery inquiry, appointment,
or a permissioned request for information. The source evidence must support the
sentence about the prior interaction. Do not use it for an unverified purchased
list, for a record with an email opt-out/complaint/bounce, or as a side effect of
the Solar calling campaign.

This is an options-review invitation. It must never promise a cancellation,
contract exit, refund, savings, legal result, lender outcome, government/utility
affiliation, or a specific result. Replace every bracketed field before review;
the legal identity, postal address, reply owner, scheduling link, and unsubscribe
destination are intentionally not invented here.

## Campaign intent

- **Campaign name:** `Elite Solar Recovery — reviewed database reactivation v1`
- **Audience:** Previously engaged, individually release-eligible records only
- **Provider target:** Instantly or Mailgun after a separate provider handoff
- **Sequence:** Initial message, 3-business-day follow-up, 7-business-day close
- **Primary conversion:** A human-reviewed options-review appointment or an
  explicit reply requesting information
- **Exit conditions:** Positive reply, appointment, opt-out, complaint, hard
  bounce, or manual hold. The future provider workflow must suppress the person
  immediately and record the reason.

## Required personalization fields

Only resolve a field when its source is verified. If it is missing, use the
fallback shown rather than guessing.

| Field | Fallback | Rule |
| --- | --- | --- |
| `{{first_name}}` | `there` | Do not infer a name from an email address. |
| `{{prior_interaction}}` | `previously requested information` | Must be source-proven. |
| `{{booking_link}}` | none | Use only after a reviewed, safe destination is approved. |
| `{{reply_owner}}` | `the Elite Solar Recovery team` | Must identify the team that will actually respond. |

## Message 1 — re-open the conversation

**Subject A:** Still looking for clarity on your solar agreement?

**Subject B:** A quick follow-up from Elite Solar Recovery

**Preheader:** A no-pressure options review for questions about your solar
agreement.

```text
Hi {{first_name}},

You {{prior_interaction}} with Elite Solar Recovery, so we wanted to check in.

If you still have questions about a solar agreement, financing, installation, or
what options may be available, our team can help you organize the facts and talk
through next steps. There is no promise of a particular outcome—every situation
depends on its documents and circumstances.

If a conversation would be useful, reply with “review” or choose a time here:
{{booking_link}}

{{reply_owner}}
Elite Solar Recovery
[approved business identity]
[approved postal address]
[approved unsubscribe link]
```

## Message 2 — three-business-day follow-up

**Subject:** Re: questions about your solar agreement

```text
Hi {{first_name}},

Just following up in case the first note got buried. If you would like an
organized review of the questions you have about your solar agreement, reply
“review” and {{reply_owner}} will help you decide whether a conversation makes
sense.

We will not assume a particular result or pressure you into a decision.

{{reply_owner}}
Elite Solar Recovery
[approved business identity]
[approved postal address]
[approved unsubscribe link]
```

## Message 3 — seven-business-day close

**Subject:** Should we close the loop?

```text
Hi {{first_name}},

We do not want to keep following up if this is no longer relevant. If you still
want to discuss questions about a solar agreement, reply “review” and we will
make the right person available. Otherwise, no action is needed.

{{reply_owner}}
Elite Solar Recovery
[approved business identity]
[approved postal address]
[approved unsubscribe link]
```

## Review gates before this can leave draft

1. Source/permission evidence and per-record release are approved; recipients
   are not embedded in the copy plan.
2. The approved business identity, physical postal address, reply owner,
   booking destination, and unsubscribe destination replace all bracketed
   fields.
3. Legal/claim review confirms the final personalization and sequence do not
   overstate what Elite Solar Recovery can do.
4. The provider mailbox/domain is healthy, suppression synchronization is
   confirmed, and the proposed recipient batch has a signed release.
5. A human approves a small staged provider campaign. The copy pack itself
   grants no authority to import, create, activate, or send.
