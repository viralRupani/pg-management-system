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

    // Pin an explicit start on the 1st so both bill a FULL month — otherwise the
    // default startDate (now) would prorate them and break the ROOM_RENT asserts.
    await h.req("post", "/allocations", mgr, {
      bedId: bed1,
      residentId: resident1Id,
      startDate: "2026-06-01",
    });
    await h.req("post", "/allocations", mgr, {
      bedId: bed2,
      residentId: resident2Id,
      startDate: "2026-06-01",
    });
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
    expect(all.body.total).toBe(2);
    expect(all.body.items).toHaveLength(2);
    expect(all.body.items.every((i: { amountPaise: number }) => i.amountPaise === ROOM_RENT)).toBe(true);
    expect(all.body.items.every((i: { status: string }) => i.status === "PENDING")).toBe(true);
  });

  it("re-generating the same period is idempotent (ON CONFLICT DO NOTHING)", async () => {
    const again = await h.req("post", "/invoices/generate", pgA.managerToken, {
      period: "2026-06",
    });
    expect(again.body.generated).toBe(0);
    const all = await h.req("get", "/invoices", pgA.managerToken);
    expect(all.body.items).toHaveLength(2); // no duplicates
  });

  it("manager can search invoices by resident name and paginate", async () => {
    // Search (case-insensitive substring on resident name).
    const byName = await h.req("get", "/invoices?q=res%20one", pgA.managerToken);
    expect(byName.body.total).toBe(1);
    expect(byName.body.items).toHaveLength(1);
    expect(byName.body.items[0].residentName).toBe("Res One");

    // Pagination: limit 1 → one item per page, total still reflects the full set.
    const p1 = await h.req("get", "/invoices?limit=1&page=1", pgA.managerToken);
    expect(p1.body.total).toBe(2);
    expect(p1.body.items).toHaveLength(1);
    expect(p1.body.page).toBe(1);
    expect(p1.body.limit).toBe(1);

    const p2 = await h.req("get", "/invoices?limit=1&page=2", pgA.managerToken);
    expect(p2.body.items).toHaveLength(1);
    expect(p2.body.items[0].id).not.toBe(p1.body.items[0].id); // a different row
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
    const invoice1 = all.body.items.find((i: { id: string }) => i.id === inv1);
    expect(invoice1.status).toBe("PAID");

    // Default ordering puts the still-PENDING invoice ahead of the now-PAID one.
    const statuses = all.body.items.map((i: { status: string }) => i.status);
    expect(statuses[0]).toBe("PENDING");
    expect(statuses.at(-1)).toBe("PAID");

    // The resident is notified that their payment was approved.
    const feed = await h.req("get", "/notifications", resident1);
    expect(feed.status).toBe(200);
    const approved = feed.body.find(
      (n: { type: string }) => n.type === "PAYMENT_APPROVED",
    );
    expect(approved).toBeDefined();
    expect(approved.title).toBe("Payment approved");

    // Double-approve is blocked by the review guard.
    const again = await h.req("post", `/payments/${paymentId}/approve`, pgA.managerToken);
    expect(again.status).toBe(409);
  });

  it("a resident reads their own submitted payment for an invoice (mode + proof)", async () => {
    // inv1 has one APPROVED UPI payment (screenshotKey "shot-1") from above.
    const res = await h.req("get", `/payments/invoice/${inv1}`, resident1);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const p = res.body[0];
    expect(p.method).toBe("UPI");
    expect(p.status).toBe("APPROVED");
    // The proof screenshot is presigned inline so the app can render it.
    expect(typeof p.screenshotUrl).toBe("string");
    expect(p.screenshotUrl).toContain("shot-1");
  });

  it("a resident cannot read another resident's invoice payments (404, intra-tenant)", async () => {
    // Same tenant → RLS does NOT isolate; the ownedInvoice guard + resident_id
    // filter is what blocks resident2 from reading resident1's proof.
    const res = await h.req("get", `/payments/invoice/${inv1}`, resident2);
    expect(res.status).toBe(404);
  });

  it("a resident of another PG cannot read this PG's invoice payments (404, cross-tenant)", async () => {
    const pgB = await h.onboardPg("rent-a-other");
    const phone = randomPhone();
    await h.registerResident(pgB.managerToken, { name: "Other PG Res", phone });
    const other = await h.residentLogin(pgB.slug, pgB.id, phone);
    const res = await h.req("get", `/payments/invoice/${inv1}`, other);
    expect(res.status).toBe(404);
  });

  it("a resident submits a payment with only a UPI reference (no screenshot)", async () => {
    const submit = await h.req("post", "/payments", resident2, {
      invoiceId: inv2,
      referenceId: "401234567890",
    });
    expect(submit.status).toBe(201);

    const submitted = await h.req("get", "/payments?status=SUBMITTED", pgA.managerToken);
    const row = submitted.body.find((p: { id: string }) => p.id === submit.body.id);
    expect(row.referenceId).toBe("401234567890");
    expect(row.hasScreenshot).toBe(false);

    // No screenshot to presign → 404 (not a 500).
    const shot = await h.req("get", `/payments/${submit.body.id}/screenshot`, pgA.managerToken);
    expect(shot.status).toBe(404);

    // The resident's own read exposes the UTR they submitted, with no proof image.
    const mine = await h.req("get", `/payments/invoice/${inv2}`, resident2);
    expect(mine.status).toBe(200);
    const byRef = mine.body.find(
      (p: { referenceId: string | null }) => p.referenceId === "401234567890",
    );
    expect(byRef).toBeDefined();
    expect(byRef.method).toBe("UPI");
    expect(byRef.screenshotUrl).toBeNull();
  });

  it("a payment with neither screenshot nor reference is rejected (400)", async () => {
    const submit = await h.req("post", "/payments", resident2, { invoiceId: inv2 });
    expect(submit.status).toBe(400);
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
    const invoice2 = all.body.items.find((i: { id: string }) => i.id === inv2);
    expect(invoice2.status).toBe("PENDING"); // rejection does not pay the invoice

    // The resident is notified of the rejection, note included.
    const feed = await h.req("get", "/notifications", resident2);
    const rejected = feed.body.find(
      (n: { type: string }) => n.type === "PAYMENT_REJECTED",
    );
    expect(rejected).toBeDefined();
    expect(rejected.title).toBe("Payment rejected");
    expect(rejected.body).toContain("Screenshot unreadable");
  });

  it("an invoice cannot be double-paid by approving a second payment for it", async () => {
    // inv2 is still PENDING. Two SUBMITTED payments can co-exist on it (e.g. a
    // resident re-uploads); approving the first pays the invoice, approving the
    // second must 409 and leave exactly one APPROVED payment.
    const p1 = (
      await h.req("post", "/payments", resident2, {
        invoiceId: inv2,
        screenshotKey: "shot-2a",
      })
    ).body.id;
    const p2 = (
      await h.req("post", "/payments", resident2, {
        invoiceId: inv2,
        screenshotKey: "shot-2b",
      })
    ).body.id;

    const first = await h.req("post", `/payments/${p1}/approve`, pgA.managerToken);
    expect(first.status).toBe(201);

    // Second approval for the same (now PAID) invoice is rejected, whole txn
    // rolls back — p2 stays SUBMITTED, invoice keeps its single payment.
    const second = await h.req("post", `/payments/${p2}/approve`, pgA.managerToken);
    expect(second.status).toBe(409);

    const invoice2 = (
      await h.req("get", "/invoices", pgA.managerToken)
    ).body.items.find((i: { id: string }) => i.id === inv2);
    expect(invoice2.status).toBe("PAID");
    const stillSubmitted = await h.req("get", "/payments?status=SUBMITTED", pgA.managerToken);
    expect(stillSubmitted.body.some((p: { id: string }) => p.id === p2)).toBe(true);
  });

  it("a resident cannot submit a payment against an already-paid invoice (409)", async () => {
    // inv2 is now PAID from the previous test.
    const res = await h.req("post", "/payments", resident2, {
      invoiceId: inv2,
      screenshotKey: "shot-2c",
    });
    expect(res.status).toBe(409);
  });
});

/**
 * Mid-month proration + selective generation. Own PG so invoice counts/ordering
 * don't tangle with the main suite. ROOM_RENT is divisible by 30 so the 21/30
 * proration lands on a clean integer.
 */
describe("M3 rent proration + selective generation (e2e)", () => {
  let h: Harness;
  let pg: TestPg;
  const ROOM_RENT = 900000; // ₹9000, divisible by 30 → exact proration
  const PERIOD = "2026-06";

  let fullId: string; // joined 2026-06-01 → full month
  let midId: string; // joined 2026-06-10 → 21/30
  let futureId: string; // joined 2026-07-15 → not billable for June

  async function newId(res: { status: number; body: { id: string } }): Promise<string> {
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id;
  }

  beforeAll(async () => {
    h = await createHarness();
    pg = await h.onboardPg("rent-prorate");
    const mgr = pg.managerToken;

    const buildingId = await newId(
      await h.req("post", "/property/buildings", mgr, { name: "Block P" }),
    );
    const floorId = await newId(
      await h.req("post", "/property/floors", mgr, { buildingId, label: "G" }),
    );
    const roomId = await newId(
      await h.req("post", "/property/rooms", mgr, {
        floorId,
        label: "P1",
        capacity: 3,
        monthlyRentPaise: ROOM_RENT,
      }),
    );
    const bedA = await newId(await h.req("post", "/property/beds", mgr, { roomId, label: "A" }));
    const bedB = await newId(await h.req("post", "/property/beds", mgr, { roomId, label: "B" }));
    const bedC = await newId(await h.req("post", "/property/beds", mgr, { roomId, label: "C" }));

    fullId = await h.registerResident(mgr, { name: "Full Month", phone: randomPhone() });
    midId = await h.registerResident(mgr, { name: "Mid Month", phone: randomPhone() });
    futureId = await h.registerResident(mgr, { name: "Future Joiner", phone: randomPhone() });

    await h.req("post", "/allocations", mgr, { bedId: bedA, residentId: fullId, startDate: "2026-06-01" });
    await h.req("post", "/allocations", mgr, { bedId: bedB, residentId: midId, startDate: "2026-06-10" });
    await h.req("post", "/allocations", mgr, { bedId: bedC, residentId: futureId, startDate: "2026-07-15" });
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  it("selective generation bills only the chosen resident", async () => {
    const res = await h.req("post", "/invoices/generate", pg.managerToken, {
      period: PERIOD,
      residentIds: [fullId],
    });
    expect(res.status).toBe(201);
    expect(res.body.generated).toBe(1);

    const all = await h.req("get", "/invoices", pg.managerToken);
    expect(all.body.total).toBe(1);
    expect(all.body.items).toHaveLength(1);
    expect(all.body.items[0].residentId).toBe(fullId);
    expect(all.body.items[0].amountPaise).toBe(ROOM_RENT); // joined on the 1st → full
  });

  it("a mid-month joiner is prorated; a future joiner is skipped", async () => {
    // Generate for everyone: fullId already invoiced (ON CONFLICT skips), midId
    // is newly prorated, futureId is dropped (joined next month) → generated 1.
    const res = await h.req("post", "/invoices/generate", pg.managerToken, {
      period: PERIOD,
    });
    expect(res.status).toBe(201);
    expect(res.body.generated).toBe(1);

    const all = await h.req("get", "/invoices", pg.managerToken);
    // Only full + mid have invoices; future joiner has none.
    expect(all.body.items).toHaveLength(2);
    expect(all.body.items.some((i: { residentId: string }) => i.residentId === futureId)).toBe(false);

    const mid = all.body.items.find((i: { residentId: string }) => i.residentId === midId);
    // June = 30 days, joined the 10th → 21 active days.
    expect(mid.amountPaise).toBe(Math.round((ROOM_RENT * 21) / 30));
    expect(mid.amountPaise).toBe(630000);

    const full = all.body.items.find((i: { residentId: string }) => i.residentId === fullId);
    expect(full.amountPaise).toBe(ROOM_RENT);
  });

  it("re-running for everyone is idempotent (no second invoice for the prorated joiner)", async () => {
    const again = await h.req("post", "/invoices/generate", pg.managerToken, {
      period: PERIOD,
    });
    expect(again.body.generated).toBe(0);
    const all = await h.req("get", "/invoices", pg.managerToken);
    expect(all.body.items).toHaveLength(2);
  });
});

/**
 * Cash payments: a resident who paid in person submits with method CASH and NO
 * proof (no screenshot, no UTR), the manager sees it flagged as cash, and
 * approving it settles the invoice exactly like a UPI payment. Also doubles as
 * the round-trip proving the new `method` column is writable under RLS + grants.
 */
describe("M3 cash payments (e2e)", () => {
  let h: Harness;
  let pg: TestPg;
  const RENT = 800000;
  let residentToken: string;
  let invoiceId: string;

  async function newId(res: { status: number; body: { id: string } }): Promise<string> {
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id;
  }

  beforeAll(async () => {
    h = await createHarness();
    pg = await h.onboardPg("rent-cash");
    const mgr = pg.managerToken;

    const buildingId = await newId(
      await h.req("post", "/property/buildings", mgr, { name: "Block C" }),
    );
    const floorId = await newId(
      await h.req("post", "/property/floors", mgr, { buildingId, label: "G" }),
    );
    const roomId = await newId(
      await h.req("post", "/property/rooms", mgr, {
        floorId,
        label: "C1",
        capacity: 1,
        monthlyRentPaise: RENT,
      }),
    );
    const bedId = await newId(await h.req("post", "/property/beds", mgr, { roomId, label: "A" }));

    const phone = randomPhone();
    const residentId = await h.registerResident(mgr, { name: "Cash Payer", phone });
    residentToken = await h.residentLogin(pg.slug, pg.id, phone);
    await h.req("post", "/allocations", mgr, { bedId, residentId, startDate: "2026-06-01" });
    await h.req("post", "/invoices/generate", mgr, { period: "2026-06" });
    const mine = await h.req("get", "/invoices/mine", residentToken);
    invoiceId = mine.body[0].id;
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  it("a resident submits a CASH payment with no proof; manager sees it and approves → PAID", async () => {
    const submit = await h.req("post", "/payments", residentToken, {
      invoiceId,
      method: "CASH",
    });
    expect(submit.status).toBe(201);

    const subs = await h.req("get", "/payments?status=SUBMITTED", pg.managerToken);
    const row = subs.body.find(
      (p: { id: string }) => p.id === submit.body.id,
    );
    expect(row.method).toBe("CASH");
    expect(row.hasScreenshot).toBe(false);
    expect(row.referenceId).toBeNull();

    // No screenshot to presign → 404 (not a 500).
    const shot = await h.req("get", `/payments/${submit.body.id}/screenshot`, pg.managerToken);
    expect(shot.status).toBe(404);

    const approve = await h.req("post", `/payments/${submit.body.id}/approve`, pg.managerToken);
    expect(approve.status).toBe(201);

    const inv = (await h.req("get", "/invoices", pg.managerToken)).body.items.find(
      (i: { id: string }) => i.id === invoiceId,
    );
    expect(inv.status).toBe("PAID");
  });
});
