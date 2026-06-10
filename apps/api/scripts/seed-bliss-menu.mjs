#!/usr/bin/env node
/**
 * Adds a 2-week recurring vegetarian mess menu to "Bliss Homes".
 *
 * The menu is template-based: a cycle of N weeks (here 2), anchored to a Monday,
 * with one slot per (week, day-of-week, meal). The API materializes concrete
 * dates from this template, so the 2 weeks repeat forever from the anchor.
 *
 * Sets cycleLengthWeeks=2 (anchored to the current week's Monday), then upserts
 * 2 weeks × 7 days × 4 meals = 56 slots. Idempotent — config + slots both upsert.
 *
 * Requires: the viral seed (manager viral-manager@yopmail.com) + API on $API.
 *
 *   node apps/api/scripts/seed-bliss-menu.mjs
 */
const API = process.env.API ?? "http://localhost:4000";
const MANAGER_EMAIL = process.env.MANAGER_EMAIL ?? "viral-manager@yopmail.com";
const PASSWORD = process.env.PASSWORD ?? "viral@009";

async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method: method.toUpperCase(),
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : undefined };
}

function must(res, label) {
  if (res.status >= 300) {
    throw new Error(`${label} failed: ${res.status} ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

/** Monday (ISO) of the current week, as 'YYYY-MM-DD' in local time. */
function currentMonday() {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7; // 0=Mon … 6=Sun
  d.setDate(d.getDate() - dow);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// dayOfWeek: 1=Mon … 7=Sun. Meals per day: BREAKFAST, LUNCH, SNACKS, DINNER.
// All-vegetarian. Two distinct weeks that then repeat.
const MENU = {
  1: {
    1: { BREAKFAST: "Poha, Jalebi, Tea/Coffee", LUNCH: "Roti, Aloo Gobi, Dal Tadka, Steamed Rice, Salad, Buttermilk", SNACKS: "Samosa, Masala Tea", DINNER: "Roti, Paneer Butter Masala, Jeera Rice, Dal Fry, Salad" },
    2: { BREAKFAST: "Idli, Sambar, Coconut Chutney, Coffee", LUNCH: "Roti, Bhindi Masala, Dal Fry, Steamed Rice, Salad, Curd", SNACKS: "Veg Grilled Sandwich, Tea", DINNER: "Roti, Chana Masala, Steamed Rice, Dal, Salad" },
    3: { BREAKFAST: "Aloo Paratha, Curd, Pickle, Tea", LUNCH: "Roti, Mix Veg, Rajma, Steamed Rice, Salad, Buttermilk", SNACKS: "Onion Pakora, Tea", DINNER: "Roti, Veg Kofta, Jeera Rice, Dal, Salad" },
    4: { BREAKFAST: "Upma, Coconut Chutney, Coffee", LUNCH: "Roti, Cabbage Sabzi, Dal Tadka, Steamed Rice, Salad, Curd", SNACKS: "Bread Pakora, Tea", DINNER: "Roti, Aloo Matar, Steamed Rice, Dal, Salad" },
    5: { BREAKFAST: "Masala Dosa, Sambar, Chutney, Coffee", LUNCH: "Roti, Bhindi Fry, Kadhi, Steamed Rice, Salad, Buttermilk", SNACKS: "Vada Pav, Tea", DINNER: "Roti, Paneer Bhurji, Jeera Rice, Dal, Salad" },
    6: { BREAKFAST: "Chole Bhature, Pickle, Tea", LUNCH: "Veg Pulao, Dal Makhani, Boondi Raita, Papad, Salad", SNACKS: "Dhokla, Green Chutney, Tea", DINNER: "Roti, Veg Korma, Steamed Rice, Dal, Salad" },
    7: { BREAKFAST: "Puri Bhaji, Sooji Halwa, Tea", LUNCH: "Veg Biryani, Mix Raita, Papad, Salad, Gulab Jamun", SNACKS: "Pav Bhaji, Tea", DINNER: "Roti, Shahi Paneer, Jeera Rice, Dal, Salad" },
  },
  2: {
    1: { BREAKFAST: "Besan Chilla, Green Chutney, Tea", LUNCH: "Roti, Lauki Sabzi, Dal Tadka, Steamed Rice, Salad, Buttermilk", SNACKS: "Veg Cutlet, Tea", DINNER: "Roti, Matar Paneer, Jeera Rice, Dal, Salad" },
    2: { BREAKFAST: "Medu Vada, Sambar, Chutney, Coffee", LUNCH: "Roti, Aloo Methi, Dal Fry, Steamed Rice, Salad, Curd", SNACKS: "Veg Maggi, Tea", DINNER: "Roti, Veg Kolhapuri, Steamed Rice, Dal, Salad" },
    3: { BREAKFAST: "Paneer Paratha, Curd, Pickle, Tea", LUNCH: "Roti, Tinda Masala, Rajma, Steamed Rice, Salad, Buttermilk", SNACKS: "Aloo Tikki Chaat, Tea", DINNER: "Roti, Malai Kofta, Jeera Rice, Dal, Salad" },
    4: { BREAKFAST: "Vermicelli Upma, Coconut Chutney, Coffee", LUNCH: "Roti, Gobi Matar, Dal Tadka, Steamed Rice, Salad, Curd", SNACKS: "Sweet Corn Chaat, Tea", DINNER: "Roti, Chana Dal, Steamed Rice, Salad" },
    5: { BREAKFAST: "Uttapam, Sambar, Chutney, Coffee", LUNCH: "Roti, Bhindi Do Pyaza, Kadhi Pakora, Steamed Rice, Salad, Buttermilk", SNACKS: "Veg Spring Roll, Tea", DINNER: "Roti, Kadai Paneer, Jeera Rice, Dal, Salad" },
    6: { BREAKFAST: "Methi Thepla, Curd, Pickle, Tea", LUNCH: "Jeera Rice, Dal Makhani, Aloo Jeera, Papad, Salad", SNACKS: "Khasta Kachori, Tea", DINNER: "Roti, Veg Handi, Steamed Rice, Dal, Salad" },
    7: { BREAKFAST: "Sabudana Khichdi, Curd, Tea", LUNCH: "Paneer Pulao, Dal Fry, Boondi Raita, Papad, Rasmalai", SNACKS: "Masala Pav, Tea", DINNER: "Roti, Paneer Tikka Masala, Jeera Rice, Dal, Salad" },
  },
};

async function main() {
  const mgr = must(
    await call("post", "/auth/manager/login", null, { email: MANAGER_EMAIL, password: PASSWORD }),
    "manager login",
  ).accessToken;
  console.log("✓ Manager logged in");

  const cycleStartDate = currentMonday();
  must(
    await call("patch", "/menu/config", mgr, { cycleLengthWeeks: 2, cycleStartDate }),
    "set menu config",
  );
  console.log(`✓ Cycle set: 2 weeks, anchored Monday ${cycleStartDate}`);

  let n = 0;
  for (const week of [1, 2]) {
    for (let dow = 1; dow <= 7; dow++) {
      for (const [mealType, items] of Object.entries(MENU[week][dow])) {
        must(
          await call("post", "/menu/slots", mgr, {
            weekNumber: week,
            dayOfWeek: dow,
            mealType,
            items,
          }),
          `slot w${week} d${dow} ${mealType}`,
        );
        n++;
        process.stdout.write(".");
      }
    }
  }
  console.log(`\n✓ Upserted ${n} menu slots (2 weeks × 7 days × 4 meals)`);

  // Verify: materialize the 14-day cycle and confirm every day is filled.
  const to = new Date(cycleStartDate + "T00:00:00");
  to.setDate(to.getDate() + 13);
  const toStr = `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, "0")}-${String(to.getDate()).padStart(2, "0")}`;
  const rows = must(
    await call("get", `/menu?from=${cycleStartDate}&to=${toStr}`, mgr),
    "materialize menu",
  );
  console.log(`✓ Materialized ${rows.length} meals over ${cycleStartDate} → ${toStr}`);
  console.log("\nSample — Week 1 Monday:");
  for (const r of rows.filter((x) => x.menuDate === cycleStartDate)) {
    console.log(`  ${r.mealType.padEnd(9)} ${r.items}`);
  }
}

main().catch((e) => {
  console.error("\n✗ Failed:", e.message);
  process.exit(1);
});
