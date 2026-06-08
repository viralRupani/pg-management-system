import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  type JwtPayload,
  type RejectDocumentInput,
  type SubmitDocumentInput,
  UserRole,
  documentUploadUrlSchema,
  rejectDocumentSchema,
  submitDocumentSchema,
} from "@pg/shared";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { DocumentsService } from "./documents.service";

@Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  // --- Resident ---
  @Post("upload-url")
  @Roles(UserRole.RESIDENT)
  uploadUrl(@Body(new ZodBody(documentUploadUrlSchema)) _dto: unknown) {
    return this.documents.requestUploadUrl();
  }

  @Post()
  @Roles(UserRole.RESIDENT)
  submit(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodBody(submitDocumentSchema)) dto: SubmitDocumentInput,
  ) {
    return this.documents.submit(user.sub, dto);
  }

  @Get("mine")
  @Roles(UserRole.RESIDENT)
  listMine(@CurrentUser() user: JwtPayload) {
    return this.documents.listMine(user.sub);
  }

  // --- Manager ---
  @Get()
  @Roles(UserRole.PG_MANAGER)
  listAll() {
    return this.documents.listAll();
  }

  @Get(":id/download")
  @Roles(UserRole.PG_MANAGER)
  download(@Param("id") id: string) {
    return this.documents.getDownloadUrl(id);
  }

  @Post(":id/verify")
  @Roles(UserRole.PG_MANAGER)
  verify(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.documents.verify(id, user.sub);
  }

  @Post(":id/reject")
  @Roles(UserRole.PG_MANAGER)
  reject(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body(new ZodBody(rejectDocumentSchema)) dto: RejectDocumentInput,
  ) {
    return this.documents.reject(id, user.sub, dto.note);
  }
}
