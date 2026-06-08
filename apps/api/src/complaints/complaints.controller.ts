import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  type ComplaintUpdateInput,
  type FileComplaintInput,
  type JwtPayload,
  type UpdateComplaintStatusInput,
  UserRole,
  complaintUpdateSchema,
  fileComplaintSchema,
  updateComplaintStatusSchema,
} from "@pg/shared";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { ComplaintsService } from "./complaints.service";

/** Resident scope for owned-reads; undefined (whole tenant) for a manager. */
function scope(user: JwtPayload): string | undefined {
  return user.role === UserRole.RESIDENT ? user.sub : undefined;
}

@Controller("complaints")
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  // --- Resident ---
  @Post("photo-url")
  @Roles(UserRole.RESIDENT)
  photoUrl() {
    return this.complaints.requestPhotoUrl();
  }

  @Post()
  @Roles(UserRole.RESIDENT)
  file(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodBody(fileComplaintSchema)) dto: FileComplaintInput,
  ) {
    return this.complaints.file(user.sub, dto);
  }

  @Get("mine")
  @Roles(UserRole.RESIDENT)
  listMine(@CurrentUser() user: JwtPayload) {
    return this.complaints.list(user.sub);
  }

  // --- Manager ---
  @Get()
  @Roles(UserRole.PG_MANAGER)
  listAll() {
    return this.complaints.list();
  }

  @Get(":id/photo")
  @Roles(UserRole.PG_MANAGER)
  photo(@Param("id") id: string) {
    return this.complaints.getPhotoUrl(id);
  }

  @Post(":id/status")
  @Roles(UserRole.PG_MANAGER)
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body(new ZodBody(updateComplaintStatusSchema))
    dto: UpdateComplaintStatusInput,
  ) {
    return this.complaints.updateStatus(id, user.sub, dto);
  }

  // --- Shared thread (resident owns; manager sees all) ---
  @Get(":id/updates")
  @Roles(UserRole.RESIDENT, UserRole.PG_MANAGER)
  listUpdates(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.complaints.listUpdates(id, scope(user));
  }

  @Post(":id/updates")
  @Roles(UserRole.RESIDENT, UserRole.PG_MANAGER)
  addUpdate(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body(new ZodBody(complaintUpdateSchema)) dto: ComplaintUpdateInput,
  ) {
    return this.complaints.addUpdate(id, user.sub, dto.note, scope(user));
  }
}
