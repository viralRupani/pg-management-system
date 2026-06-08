import type {
  AllocateBedInput,
  AllocationSummary,
  AuthTokens,
  AvailableBed,
  ComplaintSummary,
  CreateBuildingInput,
  CreateRoomInput,
  DepositSummary,
  DepositTransactionSummary,
  DocumentSummary,
  ExitSettlementInput,
  GenerateInvoicesInput,
  InvoiceSummary,
  ManagerLoginInput,
  PaymentSummary,
  PresignedUploadResult,
  RecordDepositInput,
  RegisterResidentInput,
  ResidentSummary,
  RoomSummary,
  SettlementResult,
  TenantBranding,
  UpdateBrandingInput,
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
    buildings: () => this.http.get<unknown[]>("/property/buildings"),
    rooms: () => this.http.get<RoomSummary[]>("/property/rooms"),
    createBuilding: (input: CreateBuildingInput) =>
      this.http.post("/property/buildings", input),
    createRoom: (input: CreateRoomInput) =>
      this.http.post("/property/rooms", input),
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
    list: () => this.http.get<ComplaintSummary[]>("/complaints"),
  };
}
