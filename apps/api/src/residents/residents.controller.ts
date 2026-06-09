import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  registerResidentSchema,
  residentListQuerySchema,
  type RegisterResidentInput,
  type ResidentListQuery,
  UserRole,
} from "@pg/shared";
import { Roles } from "../common/decorators";
import { ZodBody, ZodQuery } from "../common/zod-validation.pipe";
import { ResidentsService } from "./residents.service";

@Controller("residents")
@Roles(UserRole.PG_MANAGER)
export class ResidentsController {
  constructor(private readonly residents: ResidentsService) {}

  @Post()
  register(
    @Body(new ZodBody(registerResidentSchema)) dto: RegisterResidentInput,
  ) {
    return this.residents.register(dto);
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
