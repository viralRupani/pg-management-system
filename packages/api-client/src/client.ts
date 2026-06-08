import type {
  AllocationSummary,
  AuthTokens,
  ComplaintSummary,
  CreateBuildingInput,
  CreateRoomInput,
  InvoiceSummary,
  ManagerLoginInput,
  PaymentSummary,
  PresignedUploadResult,
  RegisterResidentInput,
  ResidentSummary,
  RoomSummary,
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
  };

  readonly payments = {
    /** Manager review queue. Pass status=SUBMITTED for the pending queue. */
    list: (status?: string) =>
      this.http.get<PaymentSummary[]>("/payments", { query: { status } }),
    approve: (id: string) => this.http.post(`/payments/${id}/approve`),
    reject: (id: string, reason: string) =>
      this.http.post(`/payments/${id}/reject`, { reason }),
  };

  readonly complaints = {
    list: () => this.http.get<ComplaintSummary[]>("/complaints"),
  };
}
