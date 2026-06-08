import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from "@nestjs/common";
import {
  type JwtPayload,
  type RecordExpenseInput,
  type SetBudgetInput,
  UserRole,
  recordExpenseSchema,
  setBudgetSchema,
} from "@pg/shared";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { BudgetsService } from "./budgets.service";

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function requirePeriod(period?: string): string {
  if (!period || !PERIOD_RE.test(period)) {
    throw new BadRequestException("period is a required 'YYYY-MM' query param");
  }
  return period;
}

/** Manager-only: budgets, expenses, and the spend-vs-budget summary. */
@Controller()
@Roles(UserRole.PG_MANAGER)
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Post("budgets")
  setBudget(@Body(new ZodBody(setBudgetSchema)) dto: SetBudgetInput) {
    return this.budgets.setBudget(dto);
  }

  @Get("budgets/summary")
  summary(@Query("period") period?: string) {
    return this.budgets.summary(requirePeriod(period));
  }

  @Post("expenses")
  recordExpense(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodBody(recordExpenseSchema)) dto: RecordExpenseInput,
  ) {
    return this.budgets.recordExpense(user.sub, dto);
  }

  @Get("expenses")
  listExpenses(@Query("period") period?: string) {
    return this.budgets.listExpenses(requirePeriod(period));
  }
}
