import type {
  AllocateBedInput,
  AllocationSummary,
  AnnouncementSummary,
  AuthTokens,
  AvailableBed,
  BedSummary,
  BudgetSummaryRow,
  BuildingSummary,
  ComplaintStatus,
  ComplaintSummary,
  ComplaintUpdateEntry,
  CreateAnnouncementInput,
  CreateBedInput,
  CreateBuildingInput,
  CreateFloorInput,
  CreateRoomInput,
  DepositSummary,
  DepositTransactionSummary,
  DocumentSummary,
  ExitSettlementInput,
  ExpenseSummary,
  FloorSummary,
  GenerateInvoicesInput,
  InvoiceSummary,
  ManagerLoginInput,
  MenuItemSummary,
  PaymentSummary,
  PresignedUploadResult,
  RecordDepositInput,
  RecordExpenseInput,
  RegisterResidentInput,
  ResidentSummary,
  RoomSummary,
  SetBudgetInput,
  SettlementResult,
  TenantBranding,
  UpdateBrandingInput,
  UpdateComplaintStatusInput,
  UpsertMenuInput,
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
  };

  readonly branding = {
    /** PUBLIC: branding for a tenant by slug (resident login screen). */
    bySlug: (slug: string) =>
      this.http.get<TenantBranding>(`/branding/${slug}`, { auth: false }),
    /** Manager: own PG branding (used to theme the admin app after login). */
    mine: () => this.http.get<TenantBranding>("/tenants/branding"),
    update: (input: UpdateBrandingInput) =>
      this.http.patch<TenantBranding>("/tenants/branding", input),
    logoUploadUrl: () =>
      this.http.post<PresignedUploadResult>("/tenants/logo-url"),
  };

  readonly residents = {
    list: () => this.http.get<ResidentSummary[]>("/residents"),
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
    allocate: (input: AllocateBedInput) =>
      this.http.post<AllocationSummary>("/allocations", input),
    moveOut: (residentId: string) =>
      this.http.post("/allocations/move-out", { residentId }),
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
      }>(`/deposits/resident/${residentId}`),
    record: (input: RecordDepositInput) =>
      this.http.post<{ id: string }>("/deposits", input),
    /** Settle a resident's exit: deductions + refund, frees the bed. */
    exit: (input: ExitSettlementInput) =>
      this.http.post<SettlementResult>("/deposits/exit", input),
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
  };

  readonly invoices = {
    list: () => this.http.get<InvoiceSummary[]>("/invoices"),
    /** Generate monthly invoices from active allocations (idempotent per period). */
    generate: (input: GenerateInvoicesInput) =>
      this.http.post<{ generated: number; period: string }>(
        "/invoices/generate",
        input,
      ),
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

  readonly complaints = {
    /** Manager: every complaint in the tenant, newest first. */
    list: () => this.http.get<ComplaintSummary[]>("/complaints"),
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
    /** Tenant-shared menu for an inclusive [from, to] range (YYYY-MM-DD, both required). */
    list: (from: string, to: string) =>
      this.http.get<MenuItemSummary[]>("/menu", { query: { from, to } }),
    /** Manager: publish/replace one date+meal (upsert). */
    upsert: (input: UpsertMenuInput) =>
      this.http.post<{ id: string }>("/menu", input),
  };

  readonly announcements = {
    /** Tenant feed, newest first (manager + resident). */
    list: () => this.http.get<AnnouncementSummary[]>("/announcements"),
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
}
