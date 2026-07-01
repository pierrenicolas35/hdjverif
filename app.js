// =====================================================
// VARIABLES
// =====================================================

let rules = {};
let currentNode = null;

const questionDiv = document.getElementById("question");
const helpDiv = document.getElementById("help");
const resultDiv = document.getElementById("result");

const answersDiv = document.getElementById("answers");

const explicationDiv = document.getElementById("explication");
const referenceDiv = document.getElementById("reference");
const citationDiv = document.getElementById("citation");
const examplesDiv = document.getElementById("practical-examples");

// =====================================================
// CHARGEMENT DU JSON
// =====================================================

async function loadRules() {
  try {
    const response = await fetch("rules.json");

    if (!response.ok) {
      throw new Error(
        "Impossible de charger le fichier rules.json"
      );
    }

    rules = await response.json();

    currentNode = rules.start;

    render();

  } catch (error) {

    questionDiv.innerHTML =
      "Erreur de chargement de rules.json";

    console.error(error);

  }
}

// =====================================================
// CREATION BOUTON
// =====================================================

function createButton(label) {

  const btn =
    document.createElement("button");

  btn.textContent = label;

  return btn;

}

// =====================================================
// AFFICHAGE QUESTION
// =====================================================

function render() {

  const node = rules[currentNode];

  if (!node) {
    questionDiv.innerHTML =
      "Erreur : question introuvable";
    return;
  }

  // =======================================
  // RESULTAT FINAL
  // =======================================

  if (node.result) {

    questionDiv.style.display = "none";

    document.getElementById("examples")
      .style.display = "none";

    answersDiv.style.display = "none";

    resultDiv.style.display = "block";

    resultDiv.innerHTML = node.result;

    return;
  }

  // =======================================
  // QUESTION
  // =======================================

  questionDiv.style.display = "block";

  document.getElementById("examples")
    .style.display = "block";

  answersDiv.style.display = "flex";

  resultDiv.style.display = "none";

  questionDiv.textContent =
    node.text || "";

  // =======================================
  // INFO REGLEMENTAIRE
  // =======================================

  if (node.info) {

    explicationDiv.innerHTML =
      node.info.explication || "";

    referenceDiv.innerHTML =
      node.info.reference || "";

    citationDiv.innerHTML =
      node.info.citation || "";

    examplesDiv.innerHTML = "";

    (node.info.exemples || [])
      .forEach(item => {

        examplesDiv.innerHTML +=
          `<li>${item}</li>`;

      });

  }

  // =======================================
  // RESET REPONSES
  // =======================================

  answersDiv.innerHTML = "";

  // =======================================
  // BOOLEAN
  // =======================================

  if (node.type === "boolean") {

    const yesButton =
      createButton("✅ Oui");

    const noButton =
      createButton("❌ Non");

    yesButton.onclick = () => {

      currentNode = node.yes;

      render();
    };

    noButton.onclick = () => {

      currentNode = node.no;

      render();
    };

    answersDiv.appendChild(
      yesButton
    );

    answersDiv.appendChild(
      noButton
    );
  }

  // =======================================
  // CHOICE
  // =======================================

  else if (node.type === "choice") {

    Object.entries(node.choices)
      .forEach(([label, next]) => {

        const btn =
          createButton(label);

        btn.onclick = () => {

          currentNode = next;

          render();

        };

        answersDiv.appendChild(btn);

      });
  }

  // =======================================
  // MULTISELECT
  // =======================================

  else if (
    node.type === "multiselect"
  ) {

    const wrapper =
      document.createElement("div");

    wrapper.style.width = "100%";

    node.choices.forEach(choice => {

      const row =
        document.createElement("div");

      row.style.marginBottom =
        "10px";

      const checkbox =
        document.createElement("input");

      checkbox.type = "checkbox";

      const label =
        document.createElement("label");

      label.style.marginLeft =
        "10px";

      label.textContent =
        choice;

      row.appendChild(
        checkbox
      );

      row.appendChild(
        label
      );

      wrapper.appendChild(
        row
      );
    });

    const nextButton =
      createButton("Suivant ➜");

    nextButton.style.marginTop =
      "20px";

    nextButton.onclick = () => {

      currentNode =
        node.next;

      render();

    };

    wrapper.appendChild(
      nextButton
    );

    answersDiv.appendChild(
      wrapper
    );
  }
}

// =====================================================
// DEMARRAGE
// =====================================================

window.addEventListener(
  "DOMContentLoaded",
  loadRules
);
