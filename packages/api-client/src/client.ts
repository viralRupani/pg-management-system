import type {
  DashboardAlerts,
  DashboardStats,
  AllocateBedInput,
  AllocationSummary,
  AnnouncementListQuery,
  AnnouncementListResult,
  AuthTokens,
  AvailableBed,
  ExitingBed,
  BedSummary,
  BookingSummary,
  ChangePasswordInput,
  CreateBookingInput,
  CreateTransferRequestInput,
  TransferRequestSummary,
  BudgetSummaryRow,
  BuildingSummary,
  ComplaintListQuery,
  ComplaintListResult,
  ComplaintStatus,
  ComplaintSummary,
  ComplaintUpdateEntry,
  CreateAnnouncementInput,
  CreateBedInput,
  CreateBuildingInput,
  CreateFloorInput,
  CreateManagerInput,
  CreateOwnerPgInput,
  CreateRoomInput,
  DepositSummary,
  ComplaintPhotoUrlInput,
  DepositTransactionSummary,
  DocumentSummary,
  DocumentUploadUrlInput,
  ExitRequestInput,
  ExitRequestSummary,
  ApplyDepositToInvoiceResult,
  ExitSettlementInput,
  ExpenseSummary,
  FileComplaintInput,
  FloorSummary,
  CreateExtraChargeInput,
  DeleteInvoiceInput,
  ExtraChargeSummary,
  ForgotPasswordInput,
  GenerateInvoicesInput,
  InvoiceCharge,
  InvoiceListQuery,
  InvoiceListResult,
  InvoiceSummary,
  LogoUploadUrlInput,
  ManagerLoginInput,
  ManagerSummary,
  MenuItemSummary,
  NotificationSummary,
  OtpRequestInput,
  OtpVerifyInput,
  OwnerPgSummary,
  PaymentInfo,
  PaymentSummary,
  PaymentUploadUrlInput,
  PresignedUploadResult,
  RecordDepositInput,
  RecordExpenseInput,
  RegisterPushTokenInput,
  RegisterResidentInput,
  ResidentListQuery,
  ResidentListResult,
  ResidentSummary,
  ResetPasswordInput,
  RoomSummary,
  SetBudgetInput,
  SettlementResult,
  SlugAvailability,
  SubmitDocumentInput,
  SubmitPaymentInput,
  TenantBranding,
  UpdateBrandingInput,
  UpdateComplaintStatusInput,
  MenuConfig,
  MenuSlotSummary,
  UpdateMenuConfigInput,
  UpiQrUploadUrlInput,
  UpsertMenuSlotInput,
  CreateShortStayInput,
  ShortStaySummary,
} from "@pg/shared";
import { Http } from "./http";
import type { ClientConfig } from "./types";

/**
 * Typed client for the PG Management API. Methods are grouped by resource and
 * mirror the NestJS controllers. Manager-facing surface for the admin app;
 * resident-facing methods will be added when the mobile app is built.
 */
export class PgApiClient {
  private readonly http: Http;

  constructor(cfg: ClientConfig) {
    this.http = new Http(cfg);
  }

  readonly auth = {
    /** Manager email + password login. Returns tokens; caller persists them. */
    managerLogin: (input: ManagerLoginInput) =>
      this.http.post<AuthTokens>("/auth/manager/login", input, { auth: false }),
    /** Resident: request an OTP for (pgCode, phone). Always `{ sent: true }`. */
    requestResidentOtp: (input: OtpRequestInput) =>
      this.http.post<{ sent: boolean }>(
        "/auth/resident/otp/request",
        input,
        { auth: false },
      ),
    /** Resident: verify the OTP → tokens (role RESIDENT). Caller persists them. */
    verifyResidentOtp: (input: OtpVerifyInput) =>
      this.http.post<AuthTokens>("/auth/resident/otp/verify", input, {
        auth: false,
      }),
    /** Rotate tokens (used internally by Http on 401; exposed for completeness). */
    refresh: (refreshToken: string) =>
      this.http.post<AuthTokens>(
        "/auth/refresh",
        { refreshToken },
        { auth: false },
      ),
    /** Change the caller's own password (authenticated — managers and owners).
     *  Returns fresh tokens so the caller can swap them without a re-login. */
    changePassword: (input: ChangePasswordInput) =>
      this.http.post<AuthTokens>("/auth/change-password", input),
    /** Request a password-reset link for an email. Always resolves (no enumeration). */
    forgotPassword: (input: ForgotPasswordInput) =>
      this.http.post<{ sent: boolean }>(
        "/auth/forgot-password",
        input,
        { auth: false },
      ),
    /** Exchange a single-use reset token for a new password. */
    resetPassword: (input: ResetPasswordInput) =>
      this.http.post<{ ok: true }>(
        "/auth/reset-password",
        input,
        { auth: false },
      ),
  };

  readonly dashboard = {
    /** Manager: aggregated stats for the dashboard (single round-trip). */
    stats: () => this.http.get<DashboardStats>("/dashboard/stats"),
    /** Manager: lightweight pending-action counts (bell badge + alerts panel). */
    alerts: () => this.http.get<DashboardAlerts>("/dashboard/alerts"),
  };

  /**
   * PG-owner surface. Global methods (pgs.list/create/switch) use the owner's
   * global token; manager methods use a PG-scoped token (after pgs.switch).
   */
  readonly owner = {
    pgs: {
      list: () => this.http.get<OwnerPgSummary[]>("/owner/pgs"),
      create: (input: CreateOwnerPgInput) =>
        this.http.post<OwnerPgSummary>("/owner/pgs", input),
      /** Mint a PG-scoped token for one owned PG; caller persists it. */
      switch: (tenantId: string) =>
        this.http.post<AuthTokens>(`/owner/pgs/${tenantId}/switch`),
    },
    managers: {
      list: () => this.http.get<ManagerSummary[]>("/owner/managers"),
      add: (input: CreateManagerInput) =>
        this.http.post<ManagerSummary>("/owner/managers", input),
      /** Soft-deactivate: revokes login, keeps the user row. */
      deactivate: (id: string) => this.http.del(`/owner/managers/${id}`),
    },
  };

  readonly branding = {
    /** PUBLIC: branding for a tenant by slug (resident login screen). */
    bySlug: (slug: string) =>
      this.http.get<TenantBranding>(`/branding/${slug}`, { auth: false }),
    /** Manager: own PG branding (used to theme the admin app after login). */
    mine: () => this.http.get<TenantBranding>("/tenants/branding"),
    update: (input: UpdateBrandingInput) =>
      this.http.patch<TenantBranding>("/tenants/branding", input),
    /** Manager: is a PG code (slug) free? (Their own current code reads as free.) */
    checkSlug: (slug: string) =>
      this.http.get<SlugAvailability>(
        `/tenants/slug-available/${encodeURIComponent(slug)}`,
      ),
    /** Manager: change own PG code (slug). Returns refreshed branding. */
    updateSlug: (slug: string) =>
      this.http.patch<TenantBranding>("/tenants/slug", { slug }),
    logoUploadUrl: (input: LogoUploadUrlInput) =>
      this.http.post<PresignedUploadResult>("/tenants/logo-url", input),
    /** Manager: presigned URL to upload a UPI QR code image. */
    upiQrUploadUrl: (input: UpiQrUploadUrlInput) =>
      this.http.post<PresignedUploadResult>("/tenants/upi-qr-url", input),
  };

  readonly residents = {
    list: (query?: Partial<ResidentListQuery>) =>
      this.http.get<ResidentListResult>("/residents", { query }),
    get: (id: string) => this.http.get<ResidentSummary>(`/residents/${id}`),
    register: (input: RegisterResidentInput) =>
      this.http.post<ResidentSummary>("/residents", input),
  };

  readonly allocations = {
    /** Active allocations (current bed assignments). */
    list: () => this.http.get<AllocationSummary[]>("/allocations"),
    /** Ranked vacant beds offered as placement options for a resident. */
    suggestions: (residentId: string) =>
      this.http.get<AvailableBed[]>("/allocations/suggestions", {
        query: { residentId },
      }),
    /** Occupied beds with a sitting resident who requested move-out ("soon to free"). */
    exitingBeds: () =>
      this.http.get<ExitingBed[]>("/allocations/exiting-beds"),
    allocate: (input: AllocateBedInput) =>
      this.http.post<AllocationSummary>("/allocations", input),
    moveOut: (residentId: string) =>
      this.http.post("/allocations/move-out", { residentId }),
    /** Pre-booked room moves (soft hold — bed re-checked at execution). */
    transfers: {
      list: () =>
        this.http.get<TransferRequestSummary[]>("/allocations/transfers"),
      create: (input: CreateTransferRequestInput) =>
        this.http.post<{ id: string }>("/allocations/transfers", input),
      /** Execute on the move day; `moveDate` defaults to today. */
      execute: (id: string, moveDate?: string) =>
        this.http.post<{ id: string }>(
          `/allocations/transfers/${id}/execute`,
          { moveDate },
        ),
      cancel: (id: string) =>
        this.http.post(`/allocations/transfers/${id}/cancel`),
    },
  };

  /**
   * Future-dated bed bookings: hold a bed (+ deposit) for an incoming resident
   * before move-in. The bed shows as held (not a live allocation) and billing
   * starts only when a daily job activates the booking on/after the move-in date.
   */
  readonly bookings = {
    list: () => this.http.get<BookingSummary[]>("/bookings"),
    create: (input: CreateBookingInput) =>
      this.http.post<{ id: string }>("/bookings", input),
    cancel: (id: string) => this.http.post(`/bookings/${id}/cancel`),
  };

  readonly shortStays = {
    list: () => this.http.get<ShortStaySummary[]>("/short-stays"),
    create: (input: CreateShortStayInput) =>
      this.http.post<{ id: string }>("/short-stays", input),
    complete: (id: string) =>
      this.http.post<{ completed: boolean }>(`/short-stays/${id}/complete`),
    cancel: (id: string) =>
      this.http.post<{ cancelled: boolean }>(`/short-stays/${id}/cancel`),
  };

  readonly documents = {
    /** All KYC documents in the tenant (filter by residentId client-side). */
    list: () => this.http.get<DocumentSummary[]>("/documents"),
    download: (id: string) =>
      this.http.get<{ downloadUrl: string }>(`/documents/${id}/download`),
    verify: (id: string) => this.http.post(`/documents/${id}/verify`),
    reject: (id: string, note: string) =>
      this.http.post(`/documents/${id}/reject`, { note }),
  };

  readonly deposits = {
    byResident: (residentId: string) =>
      this.http.get<{
        deposit: DepositSummary | null;
        ledger: DepositTransactionSummary[];
        exitRequest: ExitRequestSummary | null;
      }>(`/deposits/resident/${residentId}`),
    record: (input: RecordDepositInput) =>
      this.http.post<{ id: string }>("/deposits", input),
    /** Settle a resident's exit: deductions + refund, frees the bed. */
    exit: (input: ExitSettlementInput) =>
      this.http.post<SettlementResult>("/deposits/exit", input),
    /** Settle a rent invoice from the held deposit ("use my deposit for rent"). */
    applyToInvoice: (invoiceId: string) =>
      this.http.post<ApplyDepositToInvoiceResult>(
        "/deposits/apply-to-invoice",
        { invoiceId },
      ),
  };

  readonly property = {
    /** The full property tree is small — list each level unfiltered and group
     * client-side, or pass a parent id to scope. */
    buildings: () => this.http.get<BuildingSummary[]>("/property/buildings"),
    floors: (buildingId?: string) =>
      this.http.get<FloorSummary[]>("/property/floors", {
        query: { buildingId },
      }),
    rooms: (floorId?: string) =>
      this.http.get<RoomSummary[]>("/property/rooms", { query: { floorId } }),
    beds: (roomId?: string) =>
      this.http.get<BedSummary[]>("/property/beds", { query: { roomId } }),
    createBuilding: (input: CreateBuildingInput) =>
      this.http.post<{ id: string }>("/property/buildings", input),
    createFloor: (input: CreateFloorInput) =>
      this.http.post<{ id: string }>("/property/floors", input),
    createRoom: (input: CreateRoomInput) =>
      this.http.post<{ id: string }>("/property/rooms", input),
    createBed: (input: CreateBedInput) =>
      this.http.post<{ id: string }>("/property/beds", input),
    /** Edit a room's monthly rent (paise). Feeds invoice generation. */
    updateRoomRent: (id: string, monthlyRentPaise: number) =>
      this.http.patch<{ id: string }>(`/property/rooms/${id}/rent`, {
        monthlyRentPaise,
      }),
    /** Rename helpers (pure relabel, no side effects). */
    renameBuilding: (id: string, name: string) =>
      this.http.patch<{ id: string }>(`/property/buildings/${id}`, { name }),
    renameFloor: (id: string, label: string) =>
      this.http.patch<{ id: string }>(`/property/floors/${id}`, { label }),
    renameRoom: (id: string, label: string) =>
      this.http.patch<{ id: string }>(`/property/rooms/${id}`, { label }),
    renameBed: (id: string, label: string) =>
      this.http.patch<{ id: string }>(`/property/beds/${id}`, { label }),
    deleteBuilding: (id: string) =>
      this.http.del<void>(`/property/buildings/${id}`),
    deleteRoom: (id: string) => this.http.del<void>(`/property/rooms/${id}`),
    deleteBed: (id: string) => this.http.del<void>(`/property/beds/${id}`),
  };

  readonly invoices = {
    list: (query?: Partial<InvoiceListQuery>) =>
      this.http.get<InvoiceListResult>("/invoices", { query }),
    /** Generate monthly invoices from active allocations (idempotent per period). */
    generate: (input: GenerateInvoicesInput) =>
      this.http.post<{ generated: number; period: string }>(
        "/invoices/generate",
        input,
      ),
    /** Void (soft-delete) an invoice with a mandatory reason; stays listed. */
    delete: (id: string, input: DeleteInvoiceInput) =>
      this.http.post<{ deletedAt: string }>(`/invoices/${id}/delete`, input),
  };

  readonly payments = {
    /** Manager review queue. Pass status=SUBMITTED for the pending queue. */
    list: (status?: string) =>
      this.http.get<PaymentSummary[]>("/payments", { query: { status } }),
    /** Presigned URL for the uploaded payment screenshot. */
    screenshot: (id: string) =>
      this.http.get<{ downloadUrl: string }>(`/payments/${id}/screenshot`),
    approve: (id: string) => this.http.post(`/payments/${id}/approve`),
    reject: (id: string, note: string) =>
      this.http.post(`/payments/${id}/reject`, { note }),
  };

  readonly charges = {
    /** Every extra charge defined for a resident (active + history). */
    list: (residentId: string) =>
      this.http.get<ExtraChargeSummary[]>("/charges", {
        query: { residentId },
      }),
    /** Add a one-time or recurring monthly charge to a resident. */
    create: (input: CreateExtraChargeInput) =>
      this.http.post<{ id: string; appliedToInvoiceId: string | null }>(
        "/charges",
        input,
      ),
    /** Stop a recurring charge from future months (soft; keeps billed history). */
    remove: (id: string) => this.http.post(`/charges/${id}/remove`),
    /** Labelled breakdown of the extra charges folded into one invoice. */
    forInvoice: (invoiceId: string) =>
      this.http.get<InvoiceCharge[]>(`/invoices/${invoiceId}/charges`),
  };

  readonly complaints = {
    /** Manager: paginated complaint list with optional status filter. */
    list: (query?: Partial<ComplaintListQuery>) =>
      this.http.get<ComplaintListResult>("/complaints", { query }),
    /** Manager: fetch a single complaint by id. */
    get: (id: string) =>
      this.http.get<ComplaintSummary>(`/complaints/${id}`),
    /** The complaint thread (oldest first). */
    updates: (id: string) =>
      this.http.get<ComplaintUpdateEntry[]>(`/complaints/${id}/updates`),
    addUpdate: (id: string, note: string) =>
      this.http.post<{ id: string }>(`/complaints/${id}/updates`, { note }),
    /** Manager: change status, optionally self-assign. */
    updateStatus: (id: string, input: UpdateComplaintStatusInput) =>
      this.http.post<{ status: ComplaintStatus }>(
        `/complaints/${id}/status`,
        input,
      ),
    /** Manager: presigned URL for the attached photo (404 if none). */
    photo: (id: string) =>
      this.http.get<{ downloadUrl: string }>(`/complaints/${id}/photo`),
  };

  readonly menu = {
    /** Resident-compatible materialized menu for an inclusive [from, to] range. */
    list: (from: string, to: string) =>
      this.http.get<MenuItemSummary[]>("/menu", { query: { from, to } }),
    /** Get (or auto-init) the tenant's cycle config. */
    config: () => this.http.get<MenuConfig>("/menu/config"),
    /** Manager: update cycle length and anchor Monday. */
    updateConfig: (input: UpdateMenuConfigInput) =>
      this.http.patch<MenuConfig>("/menu/config", input),
    /** List all template slots. */
    slots: () => this.http.get<MenuSlotSummary[]>("/menu/slots"),
    /** Manager: upsert one template slot. */
    upsertSlot: (input: UpsertMenuSlotInput) =>
      this.http.post<{ id: string }>("/menu/slots", input),
    /** Manager: delete a slot by natural composite key. */
    deleteSlot: (weekNumber: number, dayOfWeek: number, mealType: string) =>
      this.http.del<void>(`/menu/slots/${weekNumber}/${dayOfWeek}/${mealType}`),
  };

  readonly announcements = {
    /** Tenant feed, newest first (manager + resident), paginated. */
    list: (query?: Partial<AnnouncementListQuery>) =>
      this.http.get<AnnouncementListResult>("/announcements", { query }),
    /** Manager: post a new announcement. */
    create: (input: CreateAnnouncementInput) =>
      this.http.post<{ id: string }>("/announcements", input),
  };

  readonly budgets = {
    /** Spend-vs-budget rows for a period (YYYY-MM). One row per category that
     * has a budget or any spend; limitPaise is null where no budget is set. */
    summary: (period: string) =>
      this.http.get<BudgetSummaryRow[]>("/budgets/summary", {
        query: { period },
      }),
    /** Manager: set/upsert a category budget for the period. */
    setBudget: (input: SetBudgetInput) =>
      this.http.post<{ id: string }>("/budgets", input),
    /** The expense ledger for a period (YYYY-MM), newest first. */
    expenses: (period: string) =>
      this.http.get<ExpenseSummary[]>("/expenses", { query: { period } }),
    /** Manager: record an expense (recorder taken from the JWT). */
    recordExpense: (input: RecordExpenseInput) =>
      this.http.post<{ id: string }>("/expenses", input),
  };

  /**
   * Resident-facing surface (mobile app). Every method is RESIDENT-roled; the
   * tenant + actor come from the JWT, so there is never a residentId argument.
   * Uploads follow the presign pattern: get { url, fields, key } here, POST the
   * bytes as a multipart form to `url` (fields first, file LAST — the app owns the
   * upload), then submit the key. Declare a `contentType`; the server pins it and
   * a max-size policy, so S3 edge-rejects oversize/wrong-type files.
   */
  readonly resident = {
    invoices: {
      /** The caller's own rent invoices, newest period first. */
      listMine: () => this.http.get<InvoiceSummary[]>("/invoices/mine"),
      /** Labelled extra-charge breakdown for one of the caller's invoices. */
      charges: (invoiceId: string) =>
        this.http.get<InvoiceCharge[]>(`/invoices/${invoiceId}/charges`),
    },
    payments: {
      /** Presigned POST to upload a UPI-payment screenshot for an invoice. */
      uploadUrl: (input: PaymentUploadUrlInput) =>
        this.http.post<PresignedUploadResult>("/payments/upload-url", input),
      /** Record a SUBMITTED payment against an invoice (manager reviews later). */
      submit: (input: SubmitPaymentInput) =>
        this.http.post<{ id: string }>("/payments", input),
    },
    deposits: {
      /** Own deposit + ledger + any pending move-out request. */
      mine: () =>
        this.http.get<{
          deposit: DepositSummary | null;
          ledger: DepositTransactionSummary[];
          exitRequest: ExitRequestSummary | null;
        }>("/deposits/mine"),
      /** Raise a resident-initiated move-out request (one pending at a time). */
      requestExit: (input: ExitRequestInput) =>
        this.http.post<{ requestedDate: string }>(
          "/deposits/exit-request",
          input,
        ),
    },
    documents: {
      /** Own KYC documents + review status, newest first. */
      listMine: () => this.http.get<DocumentSummary[]>("/documents/mine"),
      /** Presigned POST to upload a KYC document of the given type. */
      uploadUrl: (input: DocumentUploadUrlInput) =>
        this.http.post<PresignedUploadResult>("/documents/upload-url", input),
      /** Submit (or re-submit) a KYC document by its stored key. */
      submit: (input: SubmitDocumentInput) =>
        this.http.post<{ id: string }>("/documents", input),
    },
    complaints: {
      /** Own complaints, newest first. */
      listMine: () => this.http.get<ComplaintSummary[]>("/complaints/mine"),
      /** Presigned POST to upload an optional complaint photo before filing. */
      photoUrl: (input: ComplaintPhotoUrlInput) =>
        this.http.post<PresignedUploadResult>("/complaints/photo-url", input),
      /** File a complaint (optional photoKey from photoUrl). */
      file: (input: FileComplaintInput) =>
        this.http.post<{ id: string }>("/complaints", input),
      /** The complaint thread (oldest first); own complaints only. */
      updates: (id: string) =>
        this.http.get<ComplaintUpdateEntry[]>(`/complaints/${id}/updates`),
      /** Post a note to the thread of an own complaint. */
      addUpdate: (id: string, note: string) =>
        this.http.post<{ id: string }>(`/complaints/${id}/updates`, { note }),
      /** Presigned URL to view an own complaint's photo (404 if none). */
      photo: (id: string) =>
        this.http.get<{ downloadUrl: string }>(`/complaints/${id}/photo`),
    },
    notifications: {
      /** Own in-app notification feed, newest first. */
      list: () => this.http.get<NotificationSummary[]>("/notifications"),
      /** Mark one notification read (idempotent). */
      markRead: (id: string) =>
        this.http.post<{ ok: true }>(`/notifications/${id}/read`),
      /** Register/refresh the device's Expo push token (idempotent). */
      registerToken: (input: RegisterPushTokenInput) =>
        this.http.post<{ ok: true }>("/notifications/push-token", input),
    },
    branding: {
      /** Resident: UPI QR URL for their PG (null if manager hasn't set one). */
      paymentInfo: () => this.http.get<PaymentInfo>("/tenant/payment-info"),
    },
  };
}
