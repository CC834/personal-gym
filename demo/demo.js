const plans = {
  Monday: {
    label: "Monday · Push",
    title: "Chest & shoulders",
    exercises: [
      ["DB", "Dumbbell bench press", "3 sets · 10 reps"],
      ["OH", "Standing shoulder press", "3 sets · 8 reps"],
      ["LR", "Lateral raise", "3 sets · 12 reps"],
      ["PU", "Push-up", "2 sets · 12 reps"],
    ],
  },
  Wednesday: {
    label: "Wednesday · Pull",
    title: "Back & biceps",
    exercises: [
      ["PU", "Pull-up", "3 sets · 8 reps"],
      ["RW", "One-arm dumbbell row", "3 sets · 10 reps"],
      ["CU", "Dumbbell curl", "3 sets · 10 reps"],
    ],
  },
  Friday: {
    label: "Friday · Legs",
    title: "Quads & glutes",
    exercises: [
      ["GS", "Goblet squat", "3 sets · 10 reps"],
      ["RL", "Romanian deadlift", "3 sets · 10 reps"],
      ["LU", "Reverse lunge", "3 sets · 8 reps"],
      ["CR", "Standing calf raise", "3 sets · 15 reps"],
    ],
  },
  Saturday: {
    label: "Saturday · Recovery",
    title: "Mobility & core",
    exercises: [
      ["BC", "Bird dog", "2 sets · 8 reps"],
      ["HP", "Hip flexor stretch", "2 sets · 30 sec"],
    ],
  },
};

const exercises = [
  { name: "Dumbbell bench press", muscle: "Chest", equipment: "Dumbbells", code: "DB" },
  { name: "Push-up", muscle: "Chest", equipment: "Bodyweight", code: "PU" },
  { name: "Pull-up", muscle: "Back", equipment: "Bodyweight", code: "PU" },
  { name: "One-arm dumbbell row", muscle: "Back", equipment: "Dumbbell", code: "RW" },
  { name: "Standing shoulder press", muscle: "Shoulders", equipment: "Dumbbells", code: "OH" },
  { name: "Lateral raise", muscle: "Shoulders", equipment: "Dumbbells", code: "LR" },
  { name: "Goblet squat", muscle: "Legs", equipment: "Dumbbell", code: "GS" },
  { name: "Reverse lunge", muscle: "Legs", equipment: "Bodyweight", code: "LU" },
  { name: "Romanian deadlift", muscle: "Legs", equipment: "Dumbbells", code: "RL" },
  { name: "Dumbbell curl", muscle: "Back", equipment: "Dumbbells", code: "CU" },
];

let selectedMuscle = "All";

function selectTab(name, moveFocus = false) {
  const tabs = [...document.querySelectorAll("[data-demo-tab]")];
  for (const tab of tabs) {
    const selected = tab.dataset.demoTab === name;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && moveFocus) tab.focus();
  }

  for (const panel of document.querySelectorAll("[data-demo-panel]")) {
    panel.hidden = panel.dataset.demoPanel !== name;
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function createSetButtons() {
  for (const card of document.querySelectorAll("[data-sets]")) {
    const setRow = card.querySelector(".set-row");
    const exerciseName = card.dataset.exercise;
    const setCount = Number(card.dataset.sets);

    for (let index = 1; index <= setCount; index += 1) {
      const button = document.createElement("button");
      button.className = "set-button";
      button.type = "button";
      button.textContent = index;
      button.setAttribute("aria-label", `${exerciseName}, set ${index}, not complete`);
      button.addEventListener("click", () => {
        const isComplete = button.classList.toggle("is-complete");
        button.textContent = isComplete ? "✓" : String(index);
        button.setAttribute("aria-label", `${exerciseName}, set ${index}, ${isComplete ? "complete" : "not complete"}`);
        updateCompletion();
      });
      setRow.append(button);
    }
  }
}

function updateCompletion() {
  const completed = document.querySelectorAll(".set-button.is-complete").length;
  const total = document.querySelectorAll(".set-button").length;
  document.querySelector("#completed-count").textContent = `${completed} / ${total}`;
}

function renderPlan(day) {
  const plan = plans[day];
  document.querySelector("#plan-day-label").textContent = plan.label;
  document.querySelector("#plan-day-title").textContent = plan.title;
  document.querySelector("#plan-count").textContent = `${plan.exercises.length} exercises`;
  document.querySelector("#plan-exercises").replaceChildren(
    ...plan.exercises.map(([code, name, detail]) => {
      const row = document.createElement("div");
      row.className = "plan-movement";
      row.innerHTML = `<span>${code}</span><span><strong>${name}</strong><small>${detail}</small></span><b aria-hidden="true">⋮</b>`;
      return row;
    }),
  );

  for (const button of document.querySelectorAll("[data-plan-day]")) {
    const selected = button.dataset.planDay === day;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
}

function renderExercises() {
  const query = document.querySelector("#exercise-search").value.trim().toLowerCase();
  const matches = exercises.filter((exercise) => {
    const matchesMuscle = selectedMuscle === "All" || exercise.muscle === selectedMuscle;
    const matchesQuery = `${exercise.name} ${exercise.muscle} ${exercise.equipment}`.toLowerCase().includes(query);
    return matchesMuscle && matchesQuery;
  });

  document.querySelector("#result-count").textContent = `${matches.length} exercise${matches.length === 1 ? "" : "s"}`;
  const container = document.querySelector("#exercise-results");

  if (matches.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-result";
    empty.textContent = "No exercises match this search.";
    container.replaceChildren(empty);
    return;
  }

  container.replaceChildren(
    ...matches.map((exercise) => {
      const card = document.createElement("button");
      card.className = "library-card";
      card.type = "button";
      card.setAttribute("aria-label", `Preview ${exercise.name}`);
      card.innerHTML = `<span class="library-card-visual" aria-hidden="true">${exercise.code}</span><span><strong>${exercise.name}</strong><small>${exercise.muscle} · ${exercise.equipment}</small></span>`;
      card.addEventListener("click", () => openPreview(exercise.name));
      return card;
    }),
  );
}

function openPreview(name) {
  const dialog = document.querySelector("#preview-dialog");
  document.querySelector("#preview-title").textContent = name;
  dialog.showModal();
}

function resetDemo() {
  for (const button of document.querySelectorAll(".set-button.is-complete")) {
    const label = button.getAttribute("aria-label");
    const setNumber = label.match(/set (\d+)/)?.[1] ?? "1";
    button.classList.remove("is-complete");
    button.textContent = setNumber;
    button.setAttribute("aria-label", label.replace(", complete", ", not complete"));
  }
  selectedMuscle = "All";
  document.querySelector("#exercise-search").value = "";
  document.querySelector("[data-demo-added]")?.remove();
  document.querySelector("#add-day").textContent = "+ Add sample day";
  document.querySelector("#add-day").disabled = false;
  for (const chip of document.querySelectorAll("[data-muscle]")) {
    const selected = chip.dataset.muscle === "All";
    chip.classList.toggle("is-active", selected);
    chip.setAttribute("aria-pressed", String(selected));
  }
  renderPlan("Wednesday");
  renderExercises();
  updateCompletion();
  selectTab("today");
}

createSetButtons();
renderPlan("Wednesday");
renderExercises();

for (const tab of document.querySelectorAll("[data-demo-tab]")) {
  tab.addEventListener("click", () => selectTab(tab.dataset.demoTab));
  tab.addEventListener("keydown", (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const tabs = [...document.querySelectorAll("[data-demo-tab]")];
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const index = (tabs.indexOf(tab) + offset + tabs.length) % tabs.length;
    selectTab(tabs[index].dataset.demoTab, true);
  });
}

for (const button of document.querySelectorAll("[data-open-tab]")) {
  button.addEventListener("click", () => selectTab(button.dataset.openTab, true));
}

for (const button of document.querySelectorAll("[data-plan-day]")) {
  button.addEventListener("click", () => renderPlan(button.dataset.planDay));
}

for (const button of document.querySelectorAll("[data-preview]")) {
  button.addEventListener("click", () => openPreview(button.dataset.preview));
}

for (const chip of document.querySelectorAll("[data-muscle]")) {
  chip.addEventListener("click", () => {
    selectedMuscle = chip.dataset.muscle;
    for (const candidate of document.querySelectorAll("[data-muscle]")) {
      const selected = candidate === chip;
      candidate.classList.toggle("is-active", selected);
      candidate.setAttribute("aria-pressed", String(selected));
    }
    renderExercises();
  });
}

document.querySelector("#exercise-search").addEventListener("input", renderExercises);
document.querySelector("#reset-demo").addEventListener("click", resetDemo);
document.querySelector("#add-day").addEventListener("click", (event) => {
  const button = document.createElement("button");
  button.className = "day-card";
  button.type = "button";
  button.dataset.planDay = "Saturday";
  button.dataset.demoAdded = "true";
  button.setAttribute("role", "listitem");
  button.setAttribute("aria-pressed", "false");
  button.innerHTML = '<span class="day-index">04</span><span><strong>Saturday</strong><small>Recovery · 2 exercises</small></span><span class="day-arrow" aria-hidden="true">→</span>';
  button.addEventListener("click", () => renderPlan("Saturday"));
  document.querySelector(".day-list").append(button);
  event.currentTarget.textContent = "Sample day added ✓";
  event.currentTarget.disabled = true;
  renderPlan("Saturday");
});

const dialog = document.querySelector("#preview-dialog");
dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
