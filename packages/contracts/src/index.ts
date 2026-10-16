import { z } from 'zod';
export const credentials = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(12).max(128),
});
export const registration = credentials
  .extend({
    name: z.string().trim().min(1).max(100),
    organisation: z.string().trim().min(2).max(100),
  })
  .strict();
export const login = credentials.strict();
export const joinRegistration = credentials
  .extend({
    name: z.string().trim().min(1).max(100),
    token: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const joinExisting = z
  .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export const passwordResetRequest = z
  .object({ email: credentials.shape.email })
  .strict();
export const passwordReset = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/),
    password: credentials.shape.password,
  })
  .strict();
export const teamInvitation = z
  .object({ email: credentials.shape.email })
  .strict();
export const tagInput = z
  .object({ name: z.string().trim().min(2).max(32) })
  .strict();
export const ticketInput = z
  .object({
    subject: z.string().trim().min(3).max(160),
    description: z.string().trim().min(10).max(10000),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
    requestId: z.string().uuid(),
  })
  .strict();
export const ticketQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
    search: z.string().trim().max(100).default(''),
    status: z
      .enum([
        'OPEN',
        'IN_PROGRESS',
        'WAITING_ON_CUSTOMER',
        'RESOLVED',
        'CLOSED',
      ])
      .optional(),
    sort: z.enum(['newest', 'oldest']).default('newest'),
  })
  .strict();
export type Role = 'ADMINISTRATOR' | 'AGENT' | 'CUSTOMER';
export type MembershipView = {
  id: string;
  role: Role;
  organisation: { id: string; name: string };
};
export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  memberships: MembershipView[];
};
export type TicketSummary = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  assignee: { id?: string; user: { name: string } } | null;
};
export type TicketDetail = TicketSummary & {
  description: string;
  customer?: { name: string; email: string };
  messages: {
    id: string;
    body: string;
    internal?: boolean;
    createdAt: string;
    author: { name: string; role?: Role };
    attachments: {
      id: string;
      originalName: string;
      mediaType: string;
      byteSize: number;
      createdAt: string;
    }[];
  }[];
  events: {
    id: string;
    kind: string;
    detail: unknown;
    createdAt: string;
    actor: { name: string };
  }[];
  tags: { id: string; name: string }[];
};
export type TicketPage = {
  items: TicketSummary[];
  total: number;
  page: number;
  pageSize: number;
};

export const messageInput = z
  .object({
    body: z.string().trim().min(1).max(10000),
    internal: z.boolean().default(false),
    requestId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();
export const ticketUpdate = z
  .object({
    expectedVersion: z.number().int().positive(),
    status: z
      .enum([
        'OPEN',
        'IN_PROGRESS',
        'WAITING_ON_CUSTOMER',
        'RESOLVED',
        'CLOSED',
      ])
      .optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    assigneeId: z.string().uuid().nullable().optional(),
    tagIds: z.array(z.string().uuid()).max(20).optional(),
  })
  .strict()
  .refine(
    ({ status, priority, assigneeId, tagIds }) =>
      status !== undefined ||
      priority !== undefined ||
      assigneeId !== undefined ||
      tagIds !== undefined,
    { message: 'Provide a status, priority, or assignee update' },
  );
