import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  registerResidentSchema,
  residentListQuerySchema,
  type JwtPayload,
  type RegisterResidentInput,
  type ResidentListQuery,
  UserRole,
} from "@pg/shared";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodBody, ZodQuery } from "../common/zod-validation.pipe";
import { ResidentsService } from "./residents.service";

@Controller("residents")
@Roles(UserRole.PG_MANAGER)
export class ResidentsController {
  constructor(private readonly residents: ResidentsService) {}

  @Post()
  register(
    @Body(new ZodBody(registerResidentSchema)) dto: RegisterResidentInput,
    @CurrentUser() user: JwtPayload,
  ) {
    // Provenance comes from the JWT actor, never the request body.
    return this.residents.register(dto, user.sub);
  }

  @Get()
  list(@Query(new ZodQuery(residentListQuerySchema)) query: ResidentListQuery) {
    return this.residents.list(query);
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.residents.getById(id);
  }
}
