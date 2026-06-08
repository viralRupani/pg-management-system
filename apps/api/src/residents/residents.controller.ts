import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  registerResidentSchema,
  type RegisterResidentInput,
  UserRole,
} from "@pg/shared";
import { Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
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
  list() {
    return this.residents.list();
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.residents.getById(id);
  }
}
