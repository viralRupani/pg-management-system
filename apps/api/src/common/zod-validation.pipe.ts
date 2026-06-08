import { BadRequestException, PipeTransform } from "@nestjs/common";
import type { ZodTypeAny, z } from "zod";

/**
 * Validates request payloads against a Zod schema from @pg/shared, so the API,
 * admin, and mobile all enforce identical shapes. Usage:
 *   @Body(new ZodBody(registerResidentSchema)) dto: RegisterResidentInput
 */
export class ZodBody<T extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: "Validation failed",
        issues: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }
    return result.data;
  }
}
