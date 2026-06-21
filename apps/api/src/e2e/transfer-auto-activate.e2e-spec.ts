import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";

/**
 * Existing-resident advance reservation (soft-hold): a manager pre-books a room
 * transfer onto a bed still OCCUPIED by a soon-to-exit resident, and a daily job
 * auto-executes the move once that resident exits and the bed frees. Until then
 * the transfer stays PENDING (the job skips an occupied target). The "exiting
 * beds" list surfaces those soon-to-free targets to the picker.
 */
async function newId(res: {
  status: number;
  body: { id: string };
}): Promise<string> {
  if (res.status !== 201 && res.status !== 200)
    throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id;
}

/** Local YYYY-MM-DD (today) — the planned move date, due immediately. */
function ymdToday(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

describe("Transfer auto-activate onto a freeing bed (e2e)", () => {
  let h: Harness;
  let pgA: TestPg;
  let pgB: TestPg;

  let bedA: string; // mover's current bed (room A)
  let bedT: string; // target bed (room B), occupied by the sitter
  let moverId: string;
  let sitterId: string;
  let sitter: string; // resident token (to raise the exit request)

  async function bedStatus(roomId: string, bedId: string): Promise<string> {
    const res = await h.req("get", `/property/beds?roomId=${roomId}`, pgA.managerToken);
    return res.body.find((b: { id: string }) => b.id === bedId).status;
  }
  async function activeBedOf(residentId: string): Promise<string | undefined> {
    const res = await h.req("get", "/allocations", pgA.managerToken);
    return res.body.find(
      (a: { residentId: string; endDate: string | null }) =>
        a.residentId === residentId && a.endDate === null,
    )?.bedId;
  }

  let roomB: string;

  beforeAll(async () => {
    h = await createHarness();
    pgA = await h.onboardPg("xauto-a");
    pgB = await h.onboardPg("xauto-b");
    const mgr = pgA.managerToken;

    const buildingId = await newId(
      await h.req("post", "/property/buildings", mgr, { name: "Block X" }),
    );
    const floorId = await newId(
      await h.req("post", "/property/floors", mgr, { buildingId, label: "G" }),
    );
    const roomA = await newId(
      await h.req("post", "/property/rooms", mgr, {
        floorId,
        label: "A",
        capacity: 1,
        monthlyRentPaise: 900000,
      }),
    );
    roomB = await newId(
      await h.req("post", "/property/rooms", mgr, {
        floorId,
        label: "B",
        capacity: 1,
        monthlyRentPaise: 600000,
      }),
    );
    bedA = await newId(
      await h.req("post", "/property/beds", mgr, { roomId: roomA, label: "A1" }),
    );
    bedT = await newId(
      await h.req("post", "/property/beds", mgr, { roomId: roomB, label: "B1" }),
    );

    const sitterPhone = randomPhone();
    moverId = await h.registerResident(mgr, { name: "Mover", phone: randomPhone() });
    sitterId = await h.registerResident(mgr, { name: "Sitter", phone: sitterPhone });
    sitter = await h.residentLogin(pgA.slug, pgA.id, sitterPhone);

    await h.req("post", "/allocations", mgr, {
      bedId: bedA,
      residentId: moverId,
      startDate: "2026-06-01",
    });
    await h.req("post", "/allocations", mgr, {
      bedId: bedT,
      residentId: sitterId,
      startDate: "2026-06-01",
    });
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  it("surfaces the occupied bed as 'exiting' once the sitter requests move-out", async () => {
    await h.req("post", "/deposits/exit-request", sitter, {
      requestedDate: "2026-06-30",
    });
    const res = await h.req("get", "/allocations/exiting-beds", pgA.managerToken);
    expect(res.status).toBe(200);
    const target = res.body.find((b: { bedId: string }) => b.bedId === bedT);
    expect(target).toBeTruthy();
    expect(target.occupantName).toBe("Sitter");
    expect(target.exitRequestedDate).toBe("2026-06-30");
  });

  it("pre-books a transfer onto the still-occupied target bed", async () => {
    const res = await h.req("post", "/allocations/transfers", pgA.managerToken, {
      residentId: moverId,
      toBedId: bedT,
      plannedDate: ymdToday(),
    });
    expect(res.status).toBe(201);
  });

  it("the job does NOT move the resident while the target is occupied", async () => {
    const run = await h.req(
      "post",
      "/platform/jobs/activate-transfers",
      h.platformToken(),
    );
    expect(run.status).toBe(201);
    expect(await activeBedOf(moverId)).toBe(bedA); // unchanged
    const transfers = await h.req("get", "/allocations/transfers", pgA.managerToken);
    expect(transfers.body[0].status).toBe("PENDING");
  });

  it("after the sitter exits, the next job run executes the move", async () => {
    const exit = await h.req("post", "/deposits/exit", pgA.managerToken, {
      residentId: sitterId,
      deductions: [],
    });
    expect(exit.status).toBe(201);
    // No booking waits on the freed bed → VACANT (soft hold).
    expect(await bedStatus(roomB, bedT)).toBe("VACANT");

    const run = await h.req(
      "post",
      "/platform/jobs/activate-transfers",
      h.platformToken(),
    );
    expect(run.status).toBe(201);

    expect(await activeBedOf(moverId)).toBe(bedT); // moved
    expect(await bedStatus(roomB, bedT)).toBe("OCCUPIED");
    const transfers = await h.req("get", "/allocations/transfers", pgA.managerToken);
    expect(transfers.body[0].status).toBe("COMPLETED");
  });

  it("does not leak exiting beds across tenants", async () => {
    const res = await h.req("get", "/allocations/exiting-beds", pgB.managerToken);
    expect(res.body).toEqual([]);
  });
});
