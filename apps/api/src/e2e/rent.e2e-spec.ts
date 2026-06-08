import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";

/**
 * M3 rent loop e2e: generate (priced from allocation→room rent, idempotent via
 * ON CONFLICT), resident submit, manager approve→PAID / reject, the
 * double-approve guard (409), and intra-tenant resident isolation — RLS isolates
 * tenants, NOT residents within a tenant, so a resident sees only their own
 * invoices and cannot pay against another resident's invoice.
 */
describe("M3 rent loop (e2e)", () => {
  let h: Harness;
  let pgA: TestPg;
  const ROOM_RENT = 800000;

  let resident1Id: string;
  let resident2Id: string;
  let resident1: string; // token
  let resident2: string; // token
  let inv1: string; // resident1's invoice id
  let inv2: string; // resident2's invoice id

  async function newId(res: { status: number; body: { id: string } }): Promise<string> {
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id;
  }

  beforeAll(async () => {
    h = await createHarness();
    pgA = await h.onboardPg("rent-a");
    const mgr = pgA.managerToken;

    const buildingId = await newId(
      await h.req("post", "/property/buildings", mgr, { name: "Block A" }),
    );
    const floorId = await newId(
      await h.req("post", "/property/floors", mgr, { buildingId, label: "G" }),
    );
    const roomId = await newId(
      await h.req("post", "/property/rooms", mgr, {
        floorId,
        label: "101",
        capacity: 2,
        monthlyRentPaise: ROOM_RENT,
      }),
    );
    const bed1 = await newId(await h.req("post", "/property/beds", mgr, { roomId, label: "A" }));
    const bed2 = await newId(await h.req("post", "/property/beds", mgr, { roomId, label: "B" }));

    const phone1 = randomPhone();
    const phone2 = randomPhone();
    resident1Id = await h.registerResident(mgr, { name: "Res One", phone: phone1 });
    resident2Id = await h.registerResident(mgr, { name: "Res Two", phone: phone2 });
    resident1 = await h.residentLogin(pgA.slug, pgA.id, phone1);
    resident2 = await h.residentLogin(pgA.slug, pgA.id, phone2);

    await h.req("post", "/allocations", mgr, { bedId: bed1, residentId: resident1Id });
    await h.req("post", "/allocations", mgr, { bedId: bed2, residentId: resident2Id });
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  it("generates one invoice per active resident, priced from room rent", async () => {
    const res = await h.req("post", "/invoices/generate", pgA.managerToken, {
      period: "2026-06",
    });
    expect(res.status).toBe(201);
    expect(res.body.generated).toBe(2);

    const all = await h.req("get", "/invoices", pgA.managerToken);
    expect(all.body).toHaveLength(2);
    expect(all.body.every((i: { amountPaise: number }) => i.amountPaise === ROOM_RENT)).toBe(true);
    expect(all.body.every((i: { status: string }) => i.status === "PENDING")).toBe(true);
  });

  it("re-generating the same period is idempotent (ON CONFLICT DO NOTHING)", async () => {
    const again = await h.req("post", "/invoices/generate", pgA.managerToken, {
      period: "2026-06",
    });
    expect(again.body.generated).toBe(0);
    const all = await h.req("get", "/invoices", pgA.managerToken);
    expect(all.body).toHaveLength(2); // no duplicates
  });

  it("a resident sees only their own invoice (intra-tenant isolation)", async () => {
    const mine1 = await h.req("get", "/invoices/mine", resident1);
    const mine2 = await h.req("get", "/invoices/mine", resident2);
    expect(mine1.body).toHaveLength(1);
    expect(mine2.body).toHaveLength(1);
    expect(mine1.body[0].residentId).toBe(resident1Id);
    expect(mine2.body[0].residentId).toBe(resident2Id);
    inv1 = mine1.body[0].id;
    inv2 = mine2.body[0].id;
  });

  it("a resident cannot submit a payment against another resident's invoice (404)", async () => {
    const res = await h.req("post", "/payments", resident2, {
      invoiceId: inv1, // belongs to resident1
      screenshotKey: "shot-x",
    });
    expect(res.status).toBe(404);
  });

  it("resident submits a payment; manager approves → invoice PAID", async () => {
    const submit = await h.req("post", "/payments", resident1, {
      invoiceId: inv1,
      screenshotKey: "shot-1",
    });
    expect(submit.status).toBe(201);
    const paymentId = submit.body.id;

    const submitted = await h.req("get", "/payments?status=SUBMITTED", pgA.managerToken);
    expect(submitted.body.some((p: { id: string }) => p.id === paymentId)).toBe(true);

    const approve = await h.req("post", `/payments/${paymentId}/approve`, pgA.managerToken);
    expect(approve.status).toBe(201);
    expect(approve.body.status).toBe("APPROVED");

    const all = await h.req("get", "/invoices", pgA.managerToken);
    const invoice1 = all.body.find((i: { id: string }) => i.id === inv1);
    expect(invoice1.status).toBe("PAID");

    // Double-approve is blocked by the review guard.
    const again = await h.req("post", `/payments/${paymentId}/approve`, pgA.managerToken);
    expect(again.status).toBe(409);
  });

  it("manager rejects a payment with a note; invoice stays unpaid", async () => {
    const submit = await h.req("post", "/payments", resident2, {
      invoiceId: inv2,
      screenshotKey: "shot-2",
    });
    const paymentId = submit.body.id;

    const reject = await h.req("post", `/payments/${paymentId}/reject`, pgA.managerToken, {
      note: "Screenshot unreadable",
    });
    expect(reject.status).toBe(201);
    expect(reject.body.status).toBe("REJECTED");

    const all = await h.req("get", "/invoices", pgA.managerToken);
    const invoice2 = all.body.find((i: { id: string }) => i.id === inv2);
    expect(invoice2.status).toBe("PENDING"); // rejection does not pay the invoice
  });
});
