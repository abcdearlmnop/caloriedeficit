// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);

function round(n){ return Math.round(n); }

function kgFromInput(weight, unit){
  if (!weight) return 0;
  return unit === "lb" ? (weight / 2.2046226218) : weight;
}

function cmFromInput(heightUnit){
  if (heightUnit === "cm") return +$("height").value || 0;
  const ft = +$("heightFt").value || 0;
  const inch = +$("heightIn").value || 0;
  return (ft * 30.48) + (inch * 2.54);
}

function mifflinBMR(age, kg, cm, sex){
  if (!age || !kg || !cm) return 0;
  return sex === "M"
    ? (10*kg + 6.25*cm - 5*age + 5)
    : (10*kg + 6.25*cm - 5*age - 161);
}

function clampMinCalories(target, sex){
  const min = sex === "M" ? 1500 : 1200;
  return Math.max(target, min);
}

function safeDeficitCap(tdee){
  // Lean-mass protection: cap deficit to 25% of TDEE
  return 0.25 * tdee;
}

function macroGramsFromPercents(targetCalories, pPct, fPct, cPct){
  // kcal: protein 4, carbs 4, fat 9
  const pKcal = targetCalories * (pPct/100);
  const fKcal = targetCalories * (fPct/100);
  const cKcal = targetCalories * (cPct/100);
  return {
    proteinG: pKcal / 4,
    fatG: fKcal / 9,
    carbsG: cKcal / 4
  };
}

function weeklyLossKg(deficitKcalPerDay){
  return (deficitKcalPerDay * 7) / 7700;
}

// ---------- Tabs ----------
document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    ["home","calculator","meals","progress"].forEach(id=>{
      $(id).classList.toggle("hidden", id !== tab);
    });
  });
});

// ---------- Height unit toggle ----------
$("heightUnit").addEventListener("change", ()=>{
  const isFt = $("heightUnit").value === "ft";
  $("ftInRow").classList.toggle("hidden", !isFt);
});

// ---------- Main compute ----------
function calculate(){
  const age = +$("age").value || 0;
  const sex = $("sex").value;

  const weightVal = +$("weight").value || 0;
  const weightUnit = $("weightUnit").value;
  const kg = kgFromInput(weightVal, weightUnit);

  const heightUnit = $("heightUnit").value;
  const cm = cmFromInput(heightUnit);

  const activity = +$("activity").value || 1.2;

  const maintenanceOverride = +$("maintenanceOverride").value || 0;
  const cutPercent = +$("cutPercent").value || 0;
  const targetOverride = +$("targetOverride").value || 0;

  const pPct = +$("pPct").value || 35;
  const fPct = +$("fPct").value || 25;
  const cPct = +$("cPct").value || 40;

  // 1) Maintenance (TDEE)
  const bmr = mifflinBMR(age, kg, cm, sex);
  const tdeeFromStats = bmr ? (bmr * activity) : 0;
  const maintenance = maintenanceOverride > 0 ? maintenanceOverride : tdeeFromStats;

  // 2) Target calories
  let target;
  let deficit;

  if (targetOverride > 0 && maintenance > 0){
    target = targetOverride;
    deficit = Math.max(0, maintenance - target);
  } else if (maintenance > 0 && cutPercent > 0){
    target = maintenance * (1 - cutPercent/100);
    deficit = maintenance - target;
  } else {
    // fallback: if user hasn't filled enough
    target = 0;
    deficit = 0;
  }

  // Lean-mass protection rules
  if (maintenance > 0){
    const maxDef = safeDeficitCap(maintenance);
    if (deficit > maxDef){
      deficit = maxDef;
      target = maintenance - deficit;
    }
    target = clampMinCalories(target, sex);
    deficit = Math.max(0, maintenance - target);
  }

  // 3) Macros
  let {proteinG, fatG, carbsG} = macroGramsFromPercents(target, pPct, fPct, cPct);

  // Protein strict mode: ensure at least 2.0 g/kg
  const proteinMin = kg ? (2.0 * kg) : 0;
  if (proteinG < proteinMin && target > 0){
    const extraProteinG = (proteinMin - proteinG);
    // take calories from carbs first
    const extraProteinKcal = extraProteinG * 4;
    const newCarbG = Math.max(0, carbsG - (extraProteinKcal/4));
    proteinG = proteinMin;
    carbsG = newCarbG;
  }

  // 4) Update UI
  $("targetCalories").innerText = target > 0 ? `${round(target)} kcal` : "— kcal";
  $("maintenanceText").innerText = maintenance > 0 ? `Maintenance: ${round(maintenance)} kcal` : "Maintenance: — kcal";
  $("deficitText").innerText = maintenance > 0 ? `Deficit: ${round(deficit)} kcal/day` : "Deficit: — kcal/day";

  $("protein").innerText = target > 0 ? round(proteinG) : "—";
  $("fat").innerText = target > 0 ? round(fatG) : "—";
  $("carbs").innerText = target > 0 ? round(carbsG) : "—";

  const wholeLow = target * 0.80, wholeHigh = target * 0.90;
  const flexLow = target * 0.10, flexHigh = target * 0.20;
  $("wholeFoodsText").innerText = target > 0
    ? `Whole foods (80–90%): ~${round(wholeLow)}–${round(wholeHigh)} kcal • Flex (10–20%): ~${round(flexLow)}–${round(flexHigh)} kcal`
    : "Whole foods (80–90%): — kcal • Flex (10–20%): — kcal";

  const loss = deficit > 0 ? weeklyLossKg(deficit) : 0;
  $("loss").innerText = deficit > 0 ? loss.toFixed(2) : "—";

  // Shield logic: >1% bodyweight/week is aggressive
  const risk = (kg > 0 && loss > (kg * 0.01));
  $("shield").textContent = risk ? "⚠️ Lean Mass At Risk (too fast)" : "🛡 Muscle Protected";
  $("shield").style.color = risk ? "crimson" : "green";

  $("dayType").innerText = deficit > 0 ? "Deficit Day" : "Setup needed";

  // 5) Meals recommendations
  renderFoodsAndMeals(target, proteinG, carbsG, fatG);

  // 6) Save local (offline/private)
  localStorage.setItem("caloriecraft_v2", JSON.stringify({
    age, sex, weightVal, weightUnit, heightUnit,
    heightCm: $("height").value,
    heightFt: $("heightFt").value,
    heightIn: $("heightIn").value,
    activity, maintenanceOverride, cutPercent, targetOverride,
    pPct, fPct, cPct
  }));

  $("calcDebug").innerText =
    maintenance > 0
      ? `BMR: ${round(bmr)} • TDEE: ${round(tdeeFromStats)} • Using maintenance: ${round(maintenance)}`
      : `Tip: Fill age/sex/weight/height OR enter maintenance calories.`;
}

function renderFoodsAndMeals(target, pG, cG, fG){
  const foodList = $("foodList");
  const mealTemplate = $("mealTemplate");

  if (!target || target <= 0){
    foodList.innerHTML = `<p class="small">Fill your calories first (Calculator tab) to see food recommendations.</p>`;
    mealTemplate.innerHTML = "";
    return;
  }

  // Simple PH-friendly suggestions
  foodList.innerHTML = `
    <div class="small"><b>Protein picks:</b> chicken breast/lean chicken, tuna, bangus/tilapia, eggs/egg whites, lean pork, tofu, Greek yogurt, whey (optional)</div>
    <div class="small"><b>Carb picks:</b> rice (measured), potatoes/camote, oats, saba banana, fruits, whole wheat bread (occasional)</div>
    <div class="small"><b>Veg picks:</b> kangkong, pechay, ampalaya, sayote, pinakbet mix, repolyo, lettuce/cucumber</div>
    <div class="small"><b>Fat picks:</b> olive oil (small), peanut butter (measured), nuts (small), egg yolk, avocado (optional)</div>
    <div class="small"><b>Flex (10–20%):</b> milk tea (small), dessert (small), chips (small) — “budget” it.</div>
  `;

  // Build a simple 3 meals + snack template
  // split macros roughly
  const m1 = { p: pG*0.27, c: cG*0.28, f: fG*0.20 };
  const m2 = { p: pG*0.30, c: cG*0.32, f: fG*0.20 };
  const snack = { p: pG*0.18, c: cG*0.12, f: fG*0.10 };
  const m3 = { p: pG - (m1.p+m2.p+snack.p), c: cG - (m1.c+m2.c+snack.c), f: fG - (m1.f+m2.f+snack.f) };

  mealTemplate.innerHTML = `
    <div class="small"><b>Meal 1 (Breakfast)</b>: ~${round(m1.p)}P / ${round(m1.c)}C / ${round(m1.f)}F
      <br>Example: oats + milk/yogurt + banana + 2 eggs (or add egg whites)
    </div><br>

    <div class="small"><b>Meal 2 (Lunch)</b>: ~${round(m2.p)}P / ${round(m2.c)}C / ${round(m2.f)}F
      <br>Example: 180–200g chicken/fish + 1 cup rice + 2 cups veggies
    </div><br>

    <div class="small"><b>Snack</b>: ~${round(snack.p)}P / ${round(snack.c)}C / ${round(snack.f)}F
      <br>Example: Greek yogurt or whey + 1 fruit
    </div><br>

    <div class="small"><b>Meal 3 (Dinner)</b>: ~${round(m3.p)}P / ${round(m3.c)}C / ${round(m3.f)}F
      <br>Example: 180–200g lean protein + 1/2–1 cup rice/camote + big veggies
    </div>
  `;
}

// ---------- Progress logging ----------
function loadLogs(){
  const logs = JSON.parse(localStorage.getItem("caloriecraft_logs") || "[]");
  if (logs.length === 0){
    $("logs").innerHTML = "No weigh-ins yet.";
    return;
  }
  const rows = logs
    .sort((a,b)=> (a.date > b.date ? -1 : 1))
    .map(x => `${x.date}: ${x.weight} kg`)
    .join("<br>");
  $("logs").innerHTML = rows;
}

$("saveLogBtn").addEventListener("click", ()=>{
  const date = $("logDate").value;
  const weight = +$("logWeight").value;
  if (!date || !weight) return;
  const logs = JSON.parse(localStorage.getItem("caloriecraft_logs") || "[]");
  logs.push({date, weight});
  localStorage.setItem("caloriecraft_logs", JSON.stringify(logs));
  loadLogs();
});

// ---------- Bind ----------
$("updateBtn").addEventListener("click", calculate);

// ---------- Restore saved ----------
(function restore(){
  const saved = JSON.parse(localStorage.getItem("caloriecraft_v2") || "null");
  if (!saved) { loadLogs(); return; }

  $("age").value = saved.age ?? "";
  $("sex").value = saved.sex ?? "M";
  $("weight").value = saved.weightVal ?? "";
  $("weightUnit").value = saved.weightUnit ?? "kg";

  $("heightUnit").value = saved.heightUnit ?? "cm";
  $("height").value = saved.heightCm ?? "";
  $("heightFt").value = saved.heightFt ?? "";
  $("heightIn").value = saved.heightIn ?? "";
  $("ftInRow").classList.toggle("hidden", $("heightUnit").value !== "ft");

  $("activity").value = saved.activity ?? "1.2";
  $("maintenanceOverride").value = saved.maintenanceOverride ?? "";
  $("cutPercent").value = saved.cutPercent ?? 15;
  $("targetOverride").value = saved.targetOverride ?? "";

  $("pPct").value = saved.pPct ?? 35;
  $("fPct").value = saved.fPct ?? 25;
  $("cPct").value = saved.cPct ?? 40;

  calculate();
  loadLogs();
})();
