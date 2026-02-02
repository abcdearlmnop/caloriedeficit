function calculate() {
  const age = +ageEl.value;
  const weight = +weightEl.value;
  const height = +heightEl.value;
  const sex = sexEl.value;
  const activity = +activityEl.value;
  const deficit = +deficitEl.value;

  const bmr = sex === "M"
    ? 10*weight + 6.25*height - 5*age + 5
    : 10*weight + 6.25*height - 5*age - 161;

  const tdee = bmr * activity;
  const min = sex === "M" ? 1500 : 1200;
  let target = Math.max(tdee - deficit, min);

  const protein = Math.max(weight * 2, (target*0.3)/4);
  const fat = (target * 0.25) / 9;
  const carbs = (target - (protein*4 + fat*9)) / 4;

  document.getElementById("targetCalories").innerText = Math.round(target) + " kcal";
  document.getElementById("protein").innerText = Math.round(protein);
  document.getElementById("fat").innerText = Math.round(fat);
  document.getElementById("carbs").innerText = Math.round(carbs);

  const weeklyLoss = (deficit * 7) / 7700;
  document.getElementById("loss").innerText = weeklyLoss.toFixed(2);

  document.getElementById("shield").style.color =
    weeklyLoss > (weight * 0.01) ? "red" : "green";

  localStorage.setItem("caloriecraft", JSON.stringify({
    age, weight, height, sex, activity, deficit
  }));
}

const saved = JSON.parse(localStorage.getItem("caloriecraft"));
if (saved) {
  ageEl.value = saved.age;
  weightEl.value = saved.weight;
  heightEl.value = saved.height;
  sexEl.value = saved.sex;
  activityEl.value = saved.activity;
  deficitEl.value = saved.deficit;
  calculate();
}

const ageEl = document.getElementById("age");
const weightEl = document.getElementById("weight");
const heightEl = document.getElementById("height");
const sexEl = document.getElementById("sex");
const activityEl = document.getElementById("activity");
const deficitEl = document.getElementById("deficit");
