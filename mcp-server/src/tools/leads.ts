import type { ToolDefinition } from "./index.js";

export const leadTools: ToolDefinition[] = [
  {
    name: "dialsmart_list_leads",
    description:
      "List leads in the Dial Smart account. Supports filtering by status (new, contacted, qualified, dnc, etc.), free-text search across phone/name/email, and a do_not_call filter. Default page size is 50, max 200. Use offset for pagination.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Filter by lead.status (e.g. new, contacted, qualified, dnc)",
        },
        search: {
          type: "string",
          description:
            "Free-text search across phone_number, first_name, last_name, email",
        },
        do_not_call: {
          type: "boolean",
          description: "If true, only DNC leads. If false, only non-DNC leads.",
        },
        limit: { type: "number", default: 50 },
        offset: { type: "number", default: 0 },
      },
    },
    handler: (c, args) => c.get("/v1/leads", args),
  },

  {
    name: "dialsmart_get_lead",
    description:
      "Fetch the full record for a single lead by its UUID. Includes custom_fields, address, and notes.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Lead UUID" },
      },
      required: ["id"],
    },
    handler: (c, args) => c.get(`/v1/leads/${args.id}`),
  },

  {
    name: "dialsmart_create_lead",
    description:
      "Create a new lead. Only phone_number is required; everything else is optional. lead_source defaults to 'api' so you can identify leads created this way later.",
    inputSchema: {
      type: "object",
      properties: {
        phone_number: { type: "string", description: "E.164 preferred (e.g. +15551234567)" },
        first_name: { type: "string" },
        last_name: { type: "string" },
        email: { type: "string" },
        company: { type: "string" },
        lead_source: { type: "string" },
        status: { type: "string" },
        priority: { type: "number" },
        tags: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
        timezone: { type: "string" },
        city: { type: "string" },
        state: { type: "string" },
        custom_fields: { type: "object" },
      },
      required: ["phone_number"],
    },
    handler: (c, args) => c.post("/v1/leads", args),
  },

  {
    name: "dialsmart_update_lead",
    description:
      "Update an existing lead. Pass only the fields you want to change. Supports status changes, notes, callback scheduling (next_callback_at), tag updates, and custom_fields.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Lead UUID" },
        first_name: { type: "string" },
        last_name: { type: "string" },
        email: { type: "string" },
        company: { type: "string" },
        status: { type: "string" },
        priority: { type: "number" },
        tags: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
        do_not_call: { type: "boolean" },
        next_callback_at: {
          type: "string",
          description: "ISO 8601 timestamp",
        },
        preferred_contact_time: { type: "string" },
        timezone: { type: "string" },
        city: { type: "string" },
        state: { type: "string" },
        custom_fields: { type: "object" },
      },
      required: ["id"],
    },
    handler: (c, args) => {
      const { id, ...rest } = args;
      return c.patch(`/v1/leads/${id}`, rest);
    },
  },

  {
    name: "dialsmart_mark_lead_dnc",
    description:
      "Mark a lead as Do-Not-Call. Sets do_not_call=true, status='dnc', and adds the phone number to the dnc_list. Use this when the user explicitly opts out.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Lead UUID" },
      },
      required: ["id"],
    },
    handler: (c, args) => c.post(`/v1/leads/${args.id}/dnc`),
  },
];
