import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  type CreateBedInput,
  type CreateBuildingInput,
  type CreateFloorInput,
  type CreateRoomInput,
  type UpdateRoomRentInput,
  UserRole,
  createBedSchema,
  createBuildingSchema,
  createFloorSchema,
  createRoomSchema,
  updateRoomRentSchema,
} from "@pg/shared";
import { Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { PropertyService } from "./property.service";

@Controller("property")
@Roles(UserRole.PG_MANAGER)
export class PropertyController {
  constructor(private readonly property: PropertyService) {}

  @Post("buildings")
  createBuilding(
    @Body(new ZodBody(createBuildingSchema)) dto: CreateBuildingInput,
  ) {
    return this.property.createBuilding(dto);
  }

  @Get("buildings")
  listBuildings() {
    return this.property.listBuildings();
  }

  @Post("floors")
  createFloor(@Body(new ZodBody(createFloorSchema)) dto: CreateFloorInput) {
    return this.property.createFloor(dto);
  }

  @Get("floors")
  listFloors(@Query("buildingId") buildingId?: string) {
    return this.property.listFloors(buildingId);
  }

  @Post("rooms")
  createRoom(@Body(new ZodBody(createRoomSchema)) dto: CreateRoomInput) {
    return this.property.createRoom(dto);
  }

  @Get("rooms")
  listRooms(@Query("floorId") floorId?: string) {
    return this.property.listRooms(floorId);
  }

  @Patch("rooms/:id/rent")
  updateRoomRent(
    @Param("id") id: string,
    @Body(new ZodBody(updateRoomRentSchema)) dto: UpdateRoomRentInput,
  ) {
    return this.property.updateRoomRent(id, dto.monthlyRentPaise);
  }

  @Post("beds")
  createBed(@Body(new ZodBody(createBedSchema)) dto: CreateBedInput) {
    return this.property.createBed(dto);
  }

  @Get("beds")
  listBeds(@Query("roomId") roomId?: string) {
    return this.property.listBeds(roomId);
  }
}
